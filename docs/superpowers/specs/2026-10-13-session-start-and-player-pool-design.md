# Session Start Button + Player Pool Design

**Date:** 2026-10-13
**Status:** Approved (approach A: draft session + setup screen)

## Goal

Creating a session must not start it. The QM creates a draft, fills the queue
from a pool of registered players, then presses an explicit **Start Session**
button. Wait timers count from each player's check-in (formulas unchanged).

## Schema / API

- `sessions.started_at` becomes **nullable**; NULL means draft.
  - Fresh DBs: `CREATE TABLE` without `NOT NULL` on `started_at`.
  - Existing DBs: one-time SQLite table rebuild (create-copy-drop-rename) in
    `server/db.js`'s guarded-migration section, same style as the
    `sort_order` migration.
- `POST /sessions` no longer stamps `started_at`; inserts NULL → draft.
- `PATCH /sessions/:id/start` (new): sets `started_at = now`, broadcasts.
  400 if already started or ended.
- `POST /matches` guard: 400 if the session's `started_at` is NULL.
- `PATCH /sessions/:id/end` unchanged — also abandons a draft.
- SSE payload unchanged: the draft is the current session
  (`ended_at IS NULL`); clients distinguish by `started_at === null`.

## Client

- `App.jsx`: `session && !session.started_at` → render new `SetupScreen`
  instead of courts/queue/stats.
- Header: when the session is a draft, show name + "Not started"; hide the
  elapsed clock (only timing read of `started_at` in the client).
- New `SetupScreen.jsx`:
  - Session summary: name, scheduled window, court count.
  - **Start Session** button — disabled until the queue has ≥ 2 players.
  - Pool panel: all registered players as chips (name + skill badge);
    click chip → `checkinPlayer`. Checked-in players appear as an ordered
    list showing the queue forming.
- After Start: normal dashboard, including the existing "+ Check In"
  mid-session strip (unchanged).
- `CreateSessionModal` submit button copy: "Create Session".

## Edge cases

- Ending a draft returns to the no-session screen.
- The draft occupies the single unended-session slot, so no second
  create-session button exists while a draft is open (same as today).
- Existing rows all have real `started_at` values; nothing becomes a draft
  by accident.

## Out of scope

- Player registration UI (players pre-exist in the DB).
- Batch check-in endpoint (per-player POST is enough).
- Changing any timer formula.
