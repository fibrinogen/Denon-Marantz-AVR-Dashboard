"""Legacy Telnet Net/USB & Internet Radio OSD (NSE / NS9x) endpoints."""
from __future__ import annotations

import asyncio
import logging

import httpx
from fastapi import APIRouter, Depends, HTTPException

from api.models import (
    NetNavRequest,
    NetPresetRequest,
    NetSearchRequest,
    NetSelectRowRequest,
    NetSwitchSourceRequest,
)
from calibration import is_private_host
from denon.const import NET_NAV_COMMANDS
from denon.mock_client import MockDenonClient
from dependencies import get_app_state
from routes._helpers import require_telnet, send_command
from state import AppState

_LOGGER = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/net", tags=["net"])

ROW_STEP_DELAY = 0.12  # 120 ms between NS90/NS91 cursor steps
SOURCE_SWITCH_DELAY = 0.35  # brief wait after SIIRADIO/SINET before polling NSE
SEARCH_REFRESH_DELAY = 0.5  # brief wait after HTTP NetAudio search before polling NSE


@router.post("/refresh")
async def net_refresh(state: AppState = Depends(get_app_state)) -> dict:
    """Request a fresh 9-line OSD snapshot via NSE."""
    return await send_command(state, "NSE")


@router.post("/switch-source")
async def net_switch_source(
    req: NetSwitchSourceRequest = NetSwitchSourceRequest(),
    state: AppState = Depends(get_app_state),
) -> dict:
    """Switch receiver to a network/USB source and query NSE."""
    await send_command(state, f"SI{req.source}")
    await asyncio.sleep(SOURCE_SWITCH_DELAY)
    await send_command(state, "NSE")
    return {"ok": True, "source": req.source}


@router.post("/nav")
async def net_nav(
    req: NetNavRequest,
    state: AppState = Depends(get_app_state),
) -> dict:
    """Send a legacy Net/USB navigation or transport command (NS90-NS9E)."""
    cmd = NET_NAV_COMMANDS[req.action]
    return await send_command(state, cmd)


@router.post("/select-row")
async def net_select_row(
    req: NetSelectRowRequest,
    state: AppState = Depends(get_app_state),
) -> dict:
    """Move cursor from the currently selected row to target_index and press Enter."""
    async with state._net_nav_lock:
        telnet = require_telnet(state)
        osd = telnet.state.get("net_osd") or {}
        items = osd.get("items") or []
        current_index = next(
            (item["index"] for item in items if item.get("is_selected")),
            None,
        )
        if current_index is None:
            raise HTTPException(
                409,
                "No selectable cursor row in current OSD view",
            )

        delta = req.target_index - current_index
        step_cmd = "NS91" if delta > 0 else "NS90"
        for _ in range(abs(delta)):
            await send_command(state, step_cmd)
            await asyncio.sleep(ROW_STEP_DELAY)

        await send_command(state, "NS94")
        return {"ok": True, "from": current_index, "to": req.target_index}


@router.post("/preset")
async def net_preset(
    req: NetPresetRequest,
    state: AppState = Depends(get_app_state),
) -> dict:
    """Recall a receiver favorite (ZMFAVORITE1-4) or quick select (MSQUICK1-4)."""
    return await send_command(state, req.preset)


@router.post("/search")
async def net_search(
    req: NetSearchRequest,
    state: AppState = Depends(get_app_state),
) -> dict:
    """Submit a legacy Internet Radio keyword search via the AVR's HTTP NetAudio API."""
    telnet = require_telnet(state)
    if isinstance(telnet, MockDenonClient):
        await telnet.simulate_search(req.keyword)
        return {"ok": True, "keyword": req.keyword}

    host = state.receiver_host or telnet.host
    addr = is_private_host(host or "")
    if addr is None:
        raise HTTPException(400, "Invalid receiver host")

    url = f"http://{str(addr)}/NetAudio/index.put.asp"
    payload = {
        "cmd0": f"PutNetFuncSearchiRadio/{req.keyword}",
        "cmd1": "aspMainZone_WebUpdateStatus/",
        "ZoneName": "MAIN ZONE",
    }
    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            resp = await client.post(url, data=payload)
            resp.raise_for_status()
    except httpx.HTTPError as exc:
        _LOGGER.warning("Legacy NetAudio search failed against %s: %s", addr, exc)
        raise HTTPException(502, "Receiver HTTP search failed") from exc

    await asyncio.sleep(SEARCH_REFRESH_DELAY)
    await send_command(state, "NSE")
    return {"ok": True, "keyword": req.keyword}
