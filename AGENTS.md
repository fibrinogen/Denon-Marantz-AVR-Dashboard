# AGENTS.md — Denon/Marantz AVR Dashboard

Guidelines and best practices for AI agents and contributors working in this repository.

---

## 1. Project Overview & Architecture

- **Backend (`backend/`)**: Python 3 + FastAPI, async TCP Telnet client (Port 23, `backend/denon/telnet_client.py` + `telnet_parser.py`), async HEOS CLI client (Port 1255, `backend/denon/heos_client.py`), centralized `AppState` (`backend/state.py`), REST routers under `backend/routes/`, Pydantic schemas in `backend/api/models.py`, and `MockDenonClient` (`backend/denon/mock_client.py`) for demo mode and tests.
- **Frontend (`frontend/`)**: React 19 + TypeScript + Vite + Tailwind CSS v4. State flows from the backend via WebSocket (`/api/v1/ws` in `frontend/src/hooks/useWebSocket.ts`, with `/api/v1/status` polling fallback) and REST mutations via `useApi()` (`frontend/src/hooks/useApi.ts`).
- **Tests & Scripts**:
  - Backend: `cd backend && pytest`
  - Frontend: `cd frontend && npm test`, `npm run typecheck`, `npm run lint`, `npm run build`

---

## 2. Cross-Layer Contracts (Keep in Sync!)

1. **WebSocket / `/api/v1/status` Payload**:
   - `AppState.build_status()` (`backend/state.py`), `StatusResponse` (`backend/api/models.py`), `ReceiverState` (`frontend/src/types.ts`), and `STATUS_KEYS` (`backend/tests/test_api.py`) **must stay synchronized**.
   - Home Assistant integrations poll `/api/v1/status`: never remove or rename existing status keys; only add new keys deliberately and update `STATUS_KEYS`.
2. **Device Info (`/api/v1/device`)**:
   - `DeviceInfoResponse` (`backend/api/models.py`) ↔ `DeviceInfo` (`frontend/src/types.ts`).
3. **Protocol Constants & Demo Mode**:
   - `backend/denon/const.py` ↔ `frontend/src/protocol.ts`.
   - Every command added to `QUERY_COMMANDS` in `const.py` must be answered by `MockDenonClient._simulate()` (`backend/denon/mock_client.py`) so `test_every_query_command_answered` keeps passing.
4. **WebSocket vs. REST Commands**:
   - `/api/v1/ws` accepts only single raw Denon telnet commands matching `COMMAND_RE` (`{"command": "..."}`).
   - Multi-step operations, validated payloads, or actions that need HTTP error reporting / proxy-safe fallback belong in **REST endpoints** (`backend/routes/*.py`) invoked via `useApi().post(...)`.

---

## 3. Best Programming Practices

### General & Code Quality
- **DRY (Don't Repeat Yourself)**: Extract shared logic into small, well-named helpers or table-driven mappings instead of duplicating blocks or writing long `if/elif` chains.
- **Single Responsibility & Shallow Nesting**: Keep functions focused on one task; use early returns to avoid deep nesting.
- **Keep Changes Local**: Do not refactor unrelated modules or modify shared test harnesses unless required by the task. Preserve existing comments and docstrings unrelated to your changes.
- **Explicit Typing & Validation**: Validate all external inputs at system boundaries (Pydantic models in `backend/api/models.py`, strict TypeScript types in `frontend/src/types.ts`, allowlists/regexes for telnet commands).

### Backend (Python / FastAPI / AsyncIO)
- **Never Block the Event Loop or Hold Locks Across Slow I/O**:
  - Use `app_state.locked()` only for short in-memory swaps.
  - Serialize multi-command telnet sequences with a dedicated `asyncio.Lock` when ordering matters; `DenonTelnetClient.send()` already enforces `COMMAND_INTERVAL` via `_send_lock`.
- **Telnet Framing & Encoding Safety**:
  - Denon telnet lines terminate with `\r` (0x0D) and may contain control-byte bitmasks (e.g., `NSE1`–`NSE7` where `\x09`/`\x0a` can be status flags) or `latin-1`/`cp1252` characters on older receivers. Never blindly strip control bytes before parsing protocols that rely on positional flags.
  - Never allow `\r` or `\n` inside user-supplied command strings or parameters (command injection prevention).
- **Safe Logging**: Keep `_redact_rx` intact in `telnet_client.py` and avoid logging sensitive user/device labels or raw control characters.
- **Graceful Degradation**: Pre-HEOS receivers never connect on port 1255 (`heos_connected == False`), and HEOS receivers may briefly report `heos_connected == False` in standby. Never break HEOS paths when adding legacy Telnet features, and vice versa.

### Frontend (React / TypeScript / Tailwind)
- **No Unnecessary Re-renders**: Memoize heavy components in `App.tsx` and use stable empty fallback constants (`EMPTY_MAP`, etc.) for props passed to `memo(...)` components.
- **Error Handling**: Always use `useApi()` (`get`, `post`, `del`) for REST calls so HTTP/network failures automatically surface user-friendly toasts and never throw unhandled rejections.
- **No Nested Interactive Elements**: Never nest `<button>` inside `<button>` (keeps keyboard navigation and accessibility valid, as enforced in `SourceSelector.test.tsx`).
- **Mobile-First & Responsive**: `App.tsx` renders navigation in a fixed mobile bottom bar (`sm:hidden`) as well as desktop tabs. Keep tab labels concise and touch targets comfortably sized (`min-h-[44px]` / generous padding).
- **Accessibility**: Provide `aria-label`, `aria-pressed`, and semantic roles on interactive controls; respect `ModalShell` focus/keyboard boundaries (`data-modal`).

---

## 4. Verification Checklist (Mandatory Before Finishing)

Run all relevant checks after your final edit and only report results you directly observed:
1. Backend tests:
   ```bash
   cd backend && pytest
   ```
2. Frontend tests, typecheck, lint, and production build:
   ```bash
   cd frontend && npm test && npm run typecheck && npm run lint && npm run build
   ```
3. If modifying `MockDenonClient` or `build_status()`, verify both HEOS and non-HEOS (`heos_connected=False`) scenarios are covered by tests.
