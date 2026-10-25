# QueueC UX Tests — Design Spec

_Date: 2026-10-13_

---

## Overview

End-to-end and unit tests covering the full user-facing surface of QueueC — a badminton session queue manager. Tests are production-ready, open-source friendly, and self-contained (spin up their own server process + isolated DB).

---

## Goals

- Cover every user scenario from session creation through session end.
- Run with a single command: `npm test` from the `tests/` directory.
- Use a persistent but isolated test DB (`/tmp/queuec-test.db`) — separate from production, no cleanup required between runs.
- Fixture players (20 fake names) so tests never depend on real user data.
- Output: clear pass/fail per scenario, CI-compatible exit codes.

---

## Architecture

### Directory layout

```
tests/
  fixtures/
    players.json              # 20 fixture players (names + skill levels)
  e2e/
    01-landing.spec.js        # No-session state
    02-session-lifecycle.spec.js   # Create → setup → start → end
    03-checkin.spec.js        # Player pool → check-in → queue
    04-courts-setup.spec.js   # Add/remove/configure courts in setup
    05-match-start.spec.js    # Select players → start match (button + drag)
    06-match-end.spec.js      # End match with scores → players return
    07-queue-management.spec.js    # Reorder, resting tray, manual/smart mode
    08-court-live.spec.js     # Toggle court enabled, liveness filter
    09-stats-sidebar.spec.js  # Stat tiles, leaderboard, add player
    10-player-management.spec.js   # Add new player, check-in late arrival
  unit/
    dnd.valid.test.js         # valid() zone rules (extends existing dnd.test.js)
    api.error.test.js         # api.js throws on non-ok response
  playwright.config.js
  package.json
  README.md
```

### Server setup

Playwright `webServer` in `playwright.config.js`:
- Command: `node ../server/index.js`
- Env: `DB_PATH=/tmp/queuec-test.db`, `PLAYERS_PATH=./fixtures/players.json`
- Port: `3001`
- `reuseExistingServer: false` — always starts fresh process

> **Note:** `server/db.js` already reads `players.json` from the DB directory when present; the `PLAYERS_PATH` env var approach needs a one-line addition to `db.js` to support it. Alternative: copy fixture to `/tmp/players.json` in a global setup script.

### Fixture players

20 players spanning all 5 skill levels (4 per level: newbie, beginner, intermediate, upper_intermediate, advanced). Names are generic (`Player A1` … `Player E4`) so tests are deterministic and readable.

---

## Test Scenarios

### 01 · Landing — no active session

| #   | Scenario   | Assertion                              |
| --- | ---------- | -------------------------------------- |
| 1.1 | Page loads | `🏸 QueueC` heading visible            |
| 1.2 | No session | "No active session" badge in header    |
| 1.3 | No session | "Start New Session" CTA button visible |
| 1.4 | No session | Courts and queue areas absent          |

### 02 · Session lifecycle

| #   | Scenario              | Assertion                                                   |
| --- | --------------------- | ----------------------------------------------------------- |
| 2.1 | Click "+ Session"     | Create Session modal opens                                  |
| 2.2 | Submit session form   | Setup screen appears; header shows session name             |
| 2.3 | Setup screen          | "Not started" badge shown                                   |
| 2.4 | Start button disabled | With 0 players checked in, Start Session is disabled        |
| 2.5 | Start button disabled | With 1 player checked in, Start Session still disabled      |
| 2.6 | Start session         | After ≥2 check-ins, clicking Start transitions to live view |
| 2.7 | Live view             | Header shows elapsed timer (●)                              |
| 2.8 | End session           | After ending, header returns to "No active session"         |

### 03 · Player check-in (setup screen)

| #   | Scenario               | Assertion                                 |
| --- | ---------------------- | ----------------------------------------- |
| 3.1 | Player pool loads      | Fixture players appear as chips           |
| 3.2 | Check in one player    | Player chip moves from pool to queue list |
| 3.3 | Queue counter updates  | "Queue · 1" count increments              |
| 3.4 | Re-check: pool shrinks | Checked-in player no longer in pool       |
| 3.5 | Skill badge visible    | Chip shows correct skill level badge      |
| 3.6 | Check in 8 players     | All 8 appear in queue list in order       |

### 04 · Courts — setup screen

| #   | Scenario        | Assertion                                       |
| --- | --------------- | ----------------------------------------------- |
| 4.1 | Default courts  | Session created with 2 courts → 2 courts listed |
| 4.2 | Add court       | "+ Add Court" creates Court 3                   |
| 4.3 | Remove court    | "Remove" deletes court from list                |
| 4.4 | Set active_from | Time input updates without error                |
| 4.5 | Toggle off      | Uncheck "On" → court disabled                   |

### 05 · Starting a match

| #   | Scenario                  | Assertion                                                            |
| --- | ------------------------- | -------------------------------------------------------------------- |
| 5.1 | Select 2 players          | "2 selected → Singles" shown in queue header                         |
| 5.2 | Select 4 players          | "4 selected → Doubles" shown                                         |
| 5.3 | 5th select blocked        | Selecting 5th player with 4 already selected does nothing            |
| 5.4 | Start via button          | "Start" button on armed court starts match; court card shows players |
| 5.5 | Start via drag (1 player) | Dragging player card to court adds to selection                      |
| 5.6 | Auto-start at 4 via drag  | 4th drag-to-court auto-starts match                                  |
| 5.7 | Players leave queue       | Started players no longer appear in waiting queue                    |
| 5.8 | Court shows timer         | Match elapsed timer appears on court card                            |
| 5.9 | Deselect                  | Clicking selected player removes from selection                      |

### 06 · Ending a match

| #   | Scenario         | Assertion                                        |
| --- | ---------------- | ------------------------------------------------ |
| 6.1 | End Match button | Clicking "End Match" opens score modal           |
| 6.2 | Score inputs     | Both team score fields accept numeric input      |
| 6.3 | Confirm          | Submitting returns players to queue as "waiting" |
| 6.4 | Court clears     | Court card returns to empty/idle state           |
| 6.5 | Stats update     | Match count increments in stats sidebar          |
| 6.6 | Cancel           | Dismissing modal leaves match running            |
| 6.7 | Score 0–0        | Zero scores accepted (no validation block)       |

### 07 · Queue management

| #    | Scenario             | Assertion                                                               |
| ---- | -------------------- | ----------------------------------------------------------------------- |
| 7.1  | Drag reorder         | Drag player A before player B → order reflects in grid                  |
| 7.2  | SSE preserves order  | Server push does not reset manual reorder                               |
| 7.3  | Bench player         | Shift-click moves player to Resting Tray                                |
| 7.4  | Resting tray shows   | Benched player appears in resting tray                                  |
| 7.5  | Return from rest     | Click "Return" in tray → player back in queue                           |
| 7.6  | Benched deselected   | Benching a selected player removes them from selection                  |
| 7.7  | Smart mode           | Switching to Smart mode auto-populates selection                        |
| 7.8  | Manual mode          | Switching to Manual clears selection                                    |
| 7.9  | Late check-in        | "+ Check In" panel shows unqueued players; checking in appends to queue |
| 7.10 | Late check-in closes | Panel hides after successful check-in                                   |

### 08 · Live court management

| #   | Scenario              | Assertion                                               |
| --- | --------------------- | ------------------------------------------------------- |
| 8.1 | Disabled court hidden | Court toggled off in setup does not appear in live view |
| 8.2 | Only enabled courts   | 2 courts, 1 disabled → only 1 court card shown          |
| 8.3 | Team panel drag       | Drag player within court swaps to other team            |
| 8.4 | Full team drag        | Drag team panel swaps entire teams                      |

### 09 · Stats sidebar

| #   | Scenario          | Assertion                                           |
| --- | ----------------- | --------------------------------------------------- |
| 9.1 | Player count tile | Shows correct count after check-ins                 |
| 9.2 | Match count tile  | Increments after each match ends                    |
| 9.3 | Avg wait tile     | Shows a time value (not "—") after first match ends |
| 9.4 | Leaderboard       | Winner of first match appears in leaderboard        |
| 9.5 | Add player form   | "+ Add Player" form appears on click                |
| 9.6 | Add player submit | New player appears in check-in pool next session    |

### 10 · Player management

| #    | Scenario                   | Assertion                                                     |
| ---- | -------------------------- | ------------------------------------------------------------- |
| 10.1 | All skill levels           | Fixture covers all 5 levels; badges render for each           |
| 10.2 | Duplicate check-in blocked | Checking in same player twice not possible (already in queue) |
| 10.3 | Add player (sidebar)       | New player persists across page refresh                       |

---

## Unit tests

### `dnd.valid.test.js` (extends `dnd.test.js` style)

| #    | Case                                       |
| ---- | ------------------------------------------ |
| U1.1 | `valid('court', waiting player)` → true    |
| U1.2 | `valid('court', playing player)` → false   |
| U1.3 | `valid('court', resting player)` → false   |
| U1.4 | `valid('resting', waiting player)` → true  |
| U1.5 | `valid('resting', playing player)` → false |
| U1.6 | `valid('queue', playing player)` → true    |
| U1.7 | `valid('team', team payload)` → true       |
| U1.8 | `valid('team', player payload)` → false    |
| U1.9 | `valid('unknown-zone', anything)` → false  |

### `api.error.test.js`

| #    | Case                                                       |
| ---- | ---------------------------------------------------------- |
| U2.1 | Non-ok response throws `Error` with method + path + status |
| U2.2 | 201 response (ok) resolves to parsed JSON                  |

---

## Tooling

| Tool               | Why                                                    |
| ------------------ | ------------------------------------------------------ |
| `@playwright/test` | E2E browser automation, built-in `webServer`, fixtures |
| `node:assert`      | Unit tests — zero dependencies, matches existing style |

No additional dependencies. Playwright is already available on this machine.

---

## CI / `npm test`

`tests/package.json` scripts:
- `test` → runs Playwright E2E + unit tests
- `test:e2e` → Playwright only
- `test:unit` → `node unit/dnd.valid.test.js && node unit/api.error.test.js`

---

## Constraints & known ceilings

- Drag-and-drop E2E tests use Playwright's `dragTo` — reliable for HTML5 drag events in Chromium; may need adjustment for other browsers.
- SSE reorder-preservation test (7.2) requires a 1.5s wait for the next broadcast tick.
- Smart mode suggestion (7.7) requires ≥4 waiting players in the fixture queue.
