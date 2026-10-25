# QueueC — Initialization Phase & Session Fix

**Date:** 2026-10-13
**Status:** Approved

---

## Scope

Three changes bundled as the "initialization phase" milestone:

1. **Bug fix** — session create workflow stops after clicking Add Session
2. **Player preset file** — QMs seed the player roster before game day
3. **Court management** — per-court scheduling and live enable/disable

---

## 1. Bug Fix — Session Create Workflow

### Problem

`CreateSessionModal` calls `onClose()` immediately after `createSession()` resolves. The SSE push arrives asynchronously, creating a window where the modal closes but `session` is still null — the UI briefly reverts to the empty state or misses the SSE event entirely.

### Fix

Remove the manual `onClose()` call from `CreateSessionModal.submit()`. Instead, `App` closes the modal reactively: when SSE delivers a session with `started_at == null` (a new draft), set `showCreate = false`. The modal stays open until the server confirms via SSE.

**Change surface:** `CreateSessionModal.jsx` (remove `onClose()` after await), `App.jsx` (add `useEffect` that closes modal when `session` transitions from null → draft).

---

## 2. Player Preset File

### File

`players.json` in the repo root. QMs edit this file before game day.

```json
[{ "name": "Alice", "skill_level": "intermediate" }, { "name": "Bob", "skill_level": "beginner" }]
```

Valid `skill_level` values: `newbie`, `beginner`, `intermediate`, `upper_intermediate`, `advanced`.

### Seeding behavior

On server startup, `db.js` reads `players.json` (resolved relative to the server's `DB_PATH` directory, falling back to `../players.json` from the server dir). For each entry, insert if no player with that exact name exists — name-based, case-sensitive. Silent skip on duplicates. If the file is absent, startup proceeds normally.

### Docker

`players.json` is mounted as a volume alongside the DB:
```yaml
volumes:
  - ./data:/data # DB_PATH=/data/queuec.db, reads /data/players.json
```

QM edits `/data/players.json` on the host, restarts the container. No endpoint needed.

---

## 3. Court Management

### Data model

New `courts` table:

```sql
CREATE TABLE courts (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id   INTEGER NOT NULL REFERENCES sessions(id),
  label        TEXT NOT NULL,         -- "Court 1", "Court 2", etc.
  active_from  INTEGER,               -- unix epoch, null = session start
  active_until INTEGER,               -- unix epoch, null = session end
  enabled      BOOLEAN NOT NULL DEFAULT 1  -- manual override
);
```

The existing `sessions.court_count` is used only at session creation to seed N courts (labelled "Court 1" … "Court N"). After that, `courts` is the source of truth.

### Liveness rule

A court is **live** if all three hold:
- `enabled = 1`
- `active_from IS NULL OR unixepoch('now') >= active_from`
- `active_until IS NULL OR unixepoch('now') < active_until`

Evaluated client-side using server time from SSE.

### API

| Method   | Path                       | Body                                        | Notes                            |
| -------- | -------------------------- | ------------------------------------------- | -------------------------------- |
| `GET`    | `/api/sessions/:id/courts` | —                                           | Returns all courts for session   |
| `POST`   | `/api/sessions/:id/courts` | `{ label }`                                 | Add a court                      |
| `DELETE` | `/api/courts/:id`          | —                                           | Only if no matches on this court |
| `PATCH`  | `/api/courts/:id`          | `{ active_from?, active_until?, enabled? }` | Update any field                 |

All mutating routes call `broadcast()`.

Courts are included in the SSE state payload alongside `session`, `queue`, and `activeMatches`.

### SetupScreen (init)

The SetupScreen gains a **Courts** section below the player pool:

- Lists all courts with their label and active window
- **Add court** button — appends "Court N+1" with no time constraints
- **Remove** button per court — disabled if any match references this court
- **Active from / until** time pickers per court — optional, pre-filled from session scheduled times
- **Enabled** toggle per court

### Active session (CourtsRow)

- `CourtsRow` filters to live courts only (was filtering by `court_count` index)
- Each `CourtCard` gets a small enable/disable toggle accessible to the QM
- Court label comes from the `courts` row, not a generated index

### Migration

`db.js` creates the `courts` table if it doesn't exist (existing `CREATE TABLE IF NOT EXISTS` pattern). On first load of an existing session that predates this change, a one-time migration seeds `courts` rows from `session.court_count`.

---

## Out of scope

- Player notes / injury flags
- Session templates / presets
- Queue pre-ordering in setup (already works)
- Bulk-add UI form for players (preset file covers the use case)
