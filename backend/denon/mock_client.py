"""Mock Denon telnet client for development without a physical receiver."""
from __future__ import annotations

from denon.telnet_client import DenonTelnetClient

# Fake HEOS "now playing" so the media card, smart source detection and the
# stream-quality badge all have something to show. The cover is bundled with
# the frontend so demo mode works fully offline.
DEMO_MEDIA_STATE = {
    "now_playing": {
        "song": "Midnight City",
        "artist": "M83",
        "album": "Hurry Up, We're Dreaming",
        "image_url": "/demo-album.svg",
        "mid": "spotify:track:demo",
        "sid": 4,
    },
    "play_state": "play",
}

# Plausible Audyssey offsets so the Speakers tab shows effective levels.
DEMO_SPEAKER_CALIBRATION = {
    "FL": -2.5, "FR": -3.0, "C": -1.5,
    "SL": -5.0, "SR": -4.5, "SW": -7.5,
}


class MockDenonClient(DenonTelnetClient):
    """Simulates a Denon AVR. No network connection required.

    Enabled via DENON_DASHBOARD_DEMO_MODE=true. Commands sent via send()
    are translated into synthetic receiver responses and fed through the
    normal _parse() path so all state updates work identically to production.
    """

    def __init__(self) -> None:
        super().__init__("mock", 0)
        self._connected = True
        self._nse_cursor = 1
        self._nse_playing_idx: int | None = None
        self._nse_folder = "Internet Radio"
        self.state.update({
            "power": True,
            "volume": 45.0,
            "volume_max": 98.0,
            "muted": False,
            "source": "GAME",
            "surround_mode": "DOLBY ATMOS",
            "channel_volumes": {
                "FL": 50, "FR": 50, "C": 50,
                "SL": 50, "SR": 50, "SW": 50,
            },
            "source_names": {
                "GAME": "Game Console",
                "TV": "TV Audio",
                "NET": "Online Music",
                "BD": "Blu-ray",
                "MPLAY": "Media Player",
                "BT": "Bluetooth",
                "IRADIO": "Internet Radio",
            },
            "friendly_name": "Demo AVR",
            "tone_control": True,
            "bass": 50,
            "treble": 50,
            "subwoofer_level": 50,
            "multeq": "AUDYSSEY",
            "subwoofer2_level": 50,
            "dialog_level": None,
            "dialog_level_enabled": False,
            "dynamic_eq": True,
            "dynamic_volume": "MED",
            "ref_level_offset": 0,
            "sound_decoder": "AUTO",
            "sleep_timer": None,
            "eco_mode": "AUTO",
            "z2_power": False,
            "z2_volume": 30,
            "z2_muted": False,
            "z2_source": "TV",
            "z2_sleep_timer": None,
            "surround_mode_list": [
                {"category": "MOV", "category_label": "Movie",      "id": "01", "active": False, "display_name": "Dolby Digital",  "command": "DOLBY DIGITAL"},
                {"category": "MOV", "category_label": "Movie",      "id": "02", "active": True,  "display_name": "Dolby Atmos",    "command": "DOLBY ATMOS"},
                {"category": "MOV", "category_label": "Movie",      "id": "03", "active": False, "display_name": "DTS:X",          "command": "DTS:X"},
                {"category": "MUS", "category_label": "Music",      "id": "01", "active": False, "display_name": "Stereo",         "command": "STEREO"},
                {"category": "MUS", "category_label": "Music",      "id": "02", "active": False, "display_name": "Multi Ch Stereo","command": "MCH STEREO"},
                {"category": "MUS", "category_label": "Music",      "id": "03", "active": False, "display_name": "DTS Neural:X",   "command": "NEURAL:X"},
                {"category": "GAM", "category_label": "Game",       "id": "01", "active": False, "display_name": "Video Game",     "command": "VIDEO GAME"},
                {"category": "PUR", "category_label": "Pure/Direct","id": "01", "active": False, "display_name": "Direct",         "command": "DIRECT"},
                {"category": "PUR", "category_label": "Pure/Direct","id": "02", "active": False, "display_name": "Pure Direct",    "command": "PURE DIRECT"},
            ],
        })

    async def connect(self) -> None:
        self._connected = True
        await self._notify()

    async def disconnect(self) -> None:
        self._shutting_down = True
        self._connected = False

    async def send(self, command: str) -> bool:
        if not self._connected:
            return False
        for response in self._simulate(command):
            await self._parse(response)
        return True

    # -- simulation --

    def _vol_str(self, vol: float) -> str:
        if vol % 1 == 0:
            return f"MV{int(vol)}"
        return f"MV{int(vol):02d}5"

    def _nse_lines(self) -> list[str]:
        entries = [
            (1, True, "Favorites"),
            (2, True, "Local Stations"),
            (3, False, "WDR 2 Köln"),
            (4, False, "Deutschlandfunk"),
            (5, False, "SWR3"),
            (6, False, "Jazz24"),
            (7, False, "BBC Radio 6"),
        ]
        lines = [f"NSE0{self._nse_folder}"]
        for idx, is_folder, label in entries:
            flag = 0x02 if is_folder else 0x00
            if idx == self._nse_cursor:
                flag |= 0x08
            if idx == self._nse_playing_idx:
                flag |= 0x01
            lines.append(f"NSE{idx}{chr(flag)}{label}")
        status = f"{self._nse_cursor}/7" if self._nse_playing_idx is None else "Playing"
        lines.append(f"NSE8{status}")
        return lines

    async def simulate_search(self, keyword: str) -> None:
        """Simulate legacy HTTP NetAudio keyword search results in demo mode."""
        self._nse_folder = f"Search: {keyword}"
        self._nse_cursor = 1
        self._nse_playing_idx = None
        lines = [
            f"NSE0Search: {keyword}",
            f"NSE1\x08{keyword} FM",
            f"NSE2\x00{keyword} Classics",
            "NSE3\x00",
            "NSE4\x00",
            "NSE5\x00",
            "NSE6\x00",
            "NSE7\x00",
            "NSE81/2",
        ]
        for line in lines:
            await self._parse(line)

    def _simulate(self, cmd: str) -> list[str]:  # noqa: C901
        s = self.state

        # Power
        if cmd == "PW?":
            return ["PWON" if (s["power"] or s["z2_power"]) else "PWSTANDBY"]
        if cmd == "ZM?":
            return ["ZMON" if s["power"] else "ZMOFF"]
        if cmd in ("ZMON", "ZMOFF"):
            return [cmd]

        # Volume
        if cmd == "MV?":
            return [self._vol_str(s["volume"]), f"MVMAX{int(s['volume_max'])}"]
        if cmd == "MVUP":
            new_vol = min(s["volume_max"], round(s["volume"] + 0.5, 1))
            return [self._vol_str(new_vol)]
        if cmd == "MVDOWN":
            new_vol = max(0, round(s["volume"] - 0.5, 1))
            return [self._vol_str(new_vol)]
        if cmd.startswith("MV") and not cmd.startswith("MVMAX") and cmd[2:].isdigit():
            return [cmd]

        # Mute
        if cmd == "MU?":
            return ["MUON" if s["muted"] else "MUOFF"]
        if cmd in ("MUON", "MUOFF"):
            return [cmd]

        # Source
        if cmd == "SI?":
            return [f"SI{s['source']}"]
        if cmd in ("SIIRADIO", "SINET"):
            return [cmd, *self._nse_lines()]
        if cmd.startswith("SI") and len(cmd) > 2:
            return [cmd]

        # Legacy Net/USB OSD & presets (must precede generic MS check)
        if cmd == "NSE":
            return self._nse_lines()
        if cmd == "NS90":
            self._nse_cursor = max(1, self._nse_cursor - 1)
            return self._nse_lines()
        if cmd == "NS91":
            self._nse_cursor = min(7, self._nse_cursor + 1)
            return self._nse_lines()
        if cmd == "NS92":
            self._nse_folder = "Internet Radio"
            return self._nse_lines()
        if cmd in ("NS93", "NS94"):
            if self._nse_cursor <= 2:
                self._nse_folder = "Favorites" if self._nse_cursor == 1 else "Local Stations"
            else:
                self._nse_playing_idx = self._nse_cursor
            return self._nse_lines()
        if cmd == "NS9A":
            self._nse_playing_idx = None if self._nse_playing_idx is not None else self._nse_cursor
            return self._nse_lines()
        if cmd == "NS9B":
            self._nse_playing_idx = None
            return self._nse_lines()
        if cmd == "NS9C":
            self._nse_playing_idx = None
            return self._nse_lines()
        if cmd == "NS9D":
            self._nse_cursor = min(7, self._nse_cursor + 1)
            self._nse_playing_idx = self._nse_cursor
            return self._nse_lines()
        if cmd == "NS9E":
            self._nse_cursor = max(3, self._nse_cursor - 1)
            self._nse_playing_idx = self._nse_cursor
            return self._nse_lines()
        if cmd in ("NS9X", "NS9Y"):
            self._nse_cursor = 1 if cmd == "NS9X" else 7
            return self._nse_lines()
        if cmd.startswith(("ZMFAVORITE", "MSQUICK")) and cmd[-1:].isdigit():
            slot = int(cmd[-1])
            self._nse_cursor = min(7, slot + 2)
            self._nse_playing_idx = self._nse_cursor
            return ["SIIRADIO", *self._nse_lines()]

        # Surround mode
        if cmd == "MS?":
            return [f"MS{s['surround_mode']}"]
        if cmd.startswith("MS") and len(cmd) > 2:
            return [cmd]

        # Sound decoder
        if cmd == "SD?":
            return ["SDAUTO"]

        # Channel volumes
        if cmd == "CV?":
            return [f"CV{ch} {val}" for ch, val in s["channel_volumes"].items()] + ["CVEND"]
        if cmd == "CVZRL":
            return [f"CV{ch} 50" for ch in s["channel_volumes"]] + ["CVEND"]
        if cmd.startswith("CV") and " " in cmd:
            return [cmd]

        # Zone 2
        if cmd == "Z2?":
            result = ["Z2ON" if s["z2_power"] else "Z2OFF"]
            if s["z2_volume"] is not None:
                result.append(f"Z2{s['z2_volume']:02d}")
            if s["z2_source"]:
                result.append(f"Z2{s['z2_source']}")
            return result
        if cmd == "Z2MU?":
            return ["Z2MUON" if s["z2_muted"] else "Z2MUOFF"]
        if cmd == "Z2SLP?":
            if s.get("z2_sleep_timer") is None:
                return ["Z2SLPOFF"]
            return [f"Z2SLP{s['z2_sleep_timer']:03d}"]
        if cmd == "Z2UP":
            new_vol = min(98, (s["z2_volume"] or 30) + 1)
            return [f"Z2{new_vol:02d}"]
        if cmd == "Z2DOWN":
            new_vol = max(0, (s["z2_volume"] or 30) - 1)
            return [f"Z2{new_vol:02d}"]
        if cmd.startswith("Z2"):
            return [cmd]  # Z2ON, Z2OFF, Z2MUON, Z2MUOFF, Z2<vol>, Z2<source>

        # Tone
        if cmd == "PSTONE CTRL ?":
            return [f"PSTONE CTRL {'ON' if s['tone_control'] else 'OFF'}"]
        if cmd.startswith("PSTONE CTRL"):
            return [cmd]
        if cmd == "PSBAS ?":
            return [f"PSBAS {s['bass']:02d}"]
        if cmd.startswith("PSBAS"):
            return [cmd]
        if cmd == "PSTRE ?":
            return [f"PSTRE {s['treble']:02d}"]
        if cmd.startswith("PSTRE"):
            return [cmd]

        # Subwoofer 2 (must come before the generic PSSWL prefix)
        if cmd == "PSSWL2 ?":
            if s.get("subwoofer2_level") is None:
                return ["PSSWL2 OFF"]
            return [f"PSSWL2 {s['subwoofer2_level']:02d}"]
        if cmd.startswith("PSSWL2"):
            return [cmd]

        # Subwoofer
        if cmd == "PSSWL ?":
            if s["subwoofer_level"] is None:
                return ["PSSWL OFF"]
            return [f"PSSWL {s['subwoofer_level']:02d}"]
        if cmd.startswith("PSSWL"):
            return [cmd]

        # Dialog level
        if cmd == "PSDIL ?":
            return ["PSDIL OFF"]
        if cmd.startswith("PSDIL"):
            return [cmd]

        # MultEQ
        if cmd == "PSMULTEQ: ?":
            return [f"PSMULTEQ:{s['multeq']}"]
        if cmd.startswith("PSMULTEQ:"):
            return [cmd]

        # Dynamic EQ
        if cmd == "PSDYNEQ ?":
            return [f"PSDYNEQ {'ON' if s['dynamic_eq'] else 'OFF'}"]
        if cmd.startswith("PSDYNEQ"):
            return [cmd]

        # Dynamic Volume
        if cmd == "PSDYNVOL ?":
            return [f"PSDYNVOL {s['dynamic_volume']}"]
        if cmd.startswith("PSDYNVOL"):
            return [cmd]

        # Reference level offset
        if cmd == "PSREFLEV ?":
            return [f"PSREFLEV {s['ref_level_offset']}"]
        if cmd.startswith("PSREFLEV"):
            return [cmd]

        # Sleep timer
        if cmd == "SLP?":
            return ["SLPOFF"]
        if cmd.startswith("SLP"):
            return [cmd]

        # Eco mode
        if cmd == "ECO?":
            return [f"ECO{s['eco_mode']}"]
        if cmd.startswith("ECO"):
            return [cmd]

        # Source function names
        if cmd == "SSFUN ?":
            return [f"SSFUN{code} {name}" for code, name in s["source_names"].items()] + ["SSFUNEND"]

        # Source on/delete list
        if cmd == "SSSOD ?":
            return ["SSSODEND"]

        # Friendly name
        if cmd == "NSFRN ?":
            return [f"NSFRN {s['friendly_name']}"]

        return []
