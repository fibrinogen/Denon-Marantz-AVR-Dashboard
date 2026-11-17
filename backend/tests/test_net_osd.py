"""Tests for legacy Telnet Net/USB OSD (NSE) parser, transport framing, and routes."""
from __future__ import annotations

import os
import sys
from unittest.mock import AsyncMock, MagicMock

import pytest
from httpx import ASGITransport, AsyncClient

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

import routes.net as net_routes
from denon.telnet_client import DenonTelnetClient
from denon.telnet_parser import default_net_osd


def _make_mock_telnet(state: dict):
    mock = MagicMock()
    mock.connected = True
    mock.host = "192.168.1.100"
    mock.state = state
    mock.send = AsyncMock(return_value=True)
    return mock


# ── Parser tests ───────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_parse_nse_header_items_and_status(telnet_client):
    await telnet_client._parse("NSE0Internet Radio")
    await telnet_client._parse("NSE1\x0aFavorites")        # 0x08 (selected) | 0x02 (folder) = \n
    await telnet_client._parse("NSE2\x02Local Stations")   # 0x02 (folder)
    await telnet_client._parse("NSE3\x01WDR 2 Köln")       # 0x01 (playing)
    await telnet_client._parse("NSE4\x09Deutschlandfunk")  # 0x08 | 0x01 = \t
    await telnet_client._parse("NSE5\x00SWR3\x07")         # NUL flag + trailing bell char
    await telnet_client._parse("NSE6Plain Track")          # no control flag (Now Playing)
    await telnet_client._parse("NSE7\x00")                 # empty row with NUL flag
    await telnet_client._parse("NSE81/15")

    osd = telnet_client.state["net_osd"]
    assert osd["title"] == "Internet Radio"
    assert osd["status_line"] == "1/15"

    items = osd["items"]
    assert items[0] == {"index": 1, "text": "Favorites", "is_selected": True, "is_playing": False, "is_folder": True}
    assert items[1] == {"index": 2, "text": "Local Stations", "is_selected": False, "is_playing": False, "is_folder": True}
    assert items[2] == {"index": 3, "text": "WDR 2 Köln", "is_selected": False, "is_playing": True, "is_folder": False}
    assert items[3] == {"index": 4, "text": "Deutschlandfunk", "is_selected": True, "is_playing": True, "is_folder": False}
    assert items[4] == {"index": 5, "text": "SWR3", "is_selected": False, "is_playing": False, "is_folder": False}
    assert items[5] == {"index": 6, "text": "Plain Track", "is_selected": False, "is_playing": False, "is_folder": False}
    assert items[6] == {"index": 7, "text": "", "is_selected": False, "is_playing": False, "is_folder": False}


@pytest.mark.asyncio
async def test_listen_preserves_nse_tab_newline_flags_and_latin1():
    """_listen() must not strip 0x09/0x0A NSE flags and must decode Latin-1 umlauts."""
    client = DenonTelnetClient("192.168.1.100", 23)
    client._connected = True

    chunks = [
        (
            b"NSE0Internet Radio\r"
            b"NSE1\x09\r"
            b"NSE2\x0a" + "WDR 2 Köln".encode("latin-1") + b"\r"
        ),
        b"",
    ]

    reader = MagicMock()
    reader.read = AsyncMock(side_effect=chunks)
    client._reader = reader

    await client._listen()

    items = client.state["net_osd"]["items"]
    assert items[0]["is_selected"] is True
    assert items[0]["is_playing"] is True
    assert items[0]["text"] == ""
    assert items[1]["is_selected"] is True
    assert items[1]["is_folder"] is True
    assert items[1]["text"] == "WDR 2 Köln"


# ── Route tests ────────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_net_refresh_and_nav_and_preset(mock_state):
    from main import app
    from state import app_state

    mock_state["net_osd"] = default_net_osd()
    app_state.telnet = _make_mock_telnet(mock_state)
    try:
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as ac:
            r1 = await ac.post("/api/v1/net/refresh")
            r2 = await ac.post("/api/v1/net/nav", json={"action": "enter"})
            r3 = await ac.post("/api/v1/net/nav", json={"action": "invalid"})
            r4 = await ac.post("/api/v1/net/preset", json={"preset": "ZMFAVORITE2"})
            r5 = await ac.post("/api/v1/net/preset", json={"preset": "MSQUICK3"})
            r6 = await ac.post("/api/v1/net/preset", json={"preset": "BAD"})

        assert r1.status_code == 200
        assert r2.status_code == 200
        assert r3.status_code == 422
        assert r4.status_code == 200
        assert r5.status_code == 200
        assert r6.status_code == 422
        sent = [call.args[0] for call in app_state.telnet.send.call_args_list]
        assert sent == ["NSE", "NS94", "ZMFAVORITE2", "MSQUICK3"]
    finally:
        app_state.telnet = None


@pytest.mark.asyncio
async def test_net_switch_source(mock_state, monkeypatch):
    from main import app
    from state import app_state

    monkeypatch.setattr(net_routes, "SOURCE_SWITCH_DELAY", 0.0)
    app_state.telnet = _make_mock_telnet(mock_state)
    try:
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as ac:
            resp = await ac.post("/api/v1/net/switch-source", json={"source": "NET"})

        assert resp.status_code == 200
        sent = [call.args[0] for call in app_state.telnet.send.call_args_list]
        assert sent == ["SINET", "NSE"]
    finally:
        app_state.telnet = None


@pytest.mark.asyncio
async def test_net_select_row_moves_down_and_up_and_guards_no_cursor(mock_state, monkeypatch):
    from main import app
    from state import app_state

    monkeypatch.setattr(net_routes, "ROW_STEP_DELAY", 0.0)
    osd = default_net_osd()
    mock_state["net_osd"] = osd
    app_state.telnet = _make_mock_telnet(mock_state)
    try:
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as ac:
            # No cursor selected (e.g. Now Playing screen) -> 409 Conflict
            no_cursor = await ac.post("/api/v1/net/select-row", json={"target_index": 3})
            assert no_cursor.status_code == 409
            assert app_state.telnet.send.call_count == 0

            # Row 2 selected -> select row 5 (3x NS91 + NS94)
            osd["items"][1]["is_selected"] = True
            down_resp = await ac.post("/api/v1/net/select-row", json={"target_index": 5})
            assert down_resp.status_code == 200
            assert [c.args[0] for c in app_state.telnet.send.call_args_list] == [
                "NS91", "NS91", "NS91", "NS94",
            ]

            app_state.telnet.send.reset_mock()
            osd["items"][1]["is_selected"] = False
            osd["items"][5]["is_selected"] = True  # Row 6 selected -> select row 4 (2x NS90 + NS94)
            up_resp = await ac.post("/api/v1/net/select-row", json={"target_index": 4})
            assert up_resp.status_code == 200
            assert [c.args[0] for c in app_state.telnet.send.call_args_list] == [
                "NS90", "NS90", "NS94",
            ]
    finally:
        app_state.telnet = None
