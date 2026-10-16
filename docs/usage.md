# Operating QueueC

A session in QueueC has three phases: **setup → live → ended**. One browser tab
is the queue master's console; any other tab opened at the same address stays in
sync in real time (SSE) and works as a read-only display for players.

## Setup

One screen, no modals:

- **Session name** defaults to `ASTIRISK (DD-Mmm-YYYY)`.
- **Start time** — whole-hour select (06:00–23:00).
- **Courts** — 1–16, each with a label and rental length in hours (0.5–12).
  Courts can **open later**: set each court's "opens after" offset and its
  rental clock starts then, not at session start.
- **Player pool** — alphabetical, letter-grouped, with search-and-add,
  select-all, and a skill-tier filter. Click to select, double-click (or ✎) to
  edit name/skill inline. Check-in can be reordered alphabetically.

One **Start Session** button does everything: create session → check in the
selection → start the court clocks. Nothing is written until that click.

## Live

The header shows the session name over the date, courts in use, waiting count,
and the longest current wait (net wait — time spent playing is excluded, so a
player's wait clock restarts after each match).

### Courts

- An idle court takes a drag-and-drop 2×2 lineup draft (or click-select players
  then Start Match). A match **never** starts without the confirmation dialog —
  including the 4th-slot drop, which auto-starts.
- A live court shows only the running match: teams, elapsed timer. Rearrange
  teams by dragging chips between sides or swap whole teams.
- When a court's rental runs out it shows **Extend Court (+1hr)?**. Idle, it
  pulses EXPIRED and leaves the available pool; mid-match, the game keeps
  running under a **Last Game** badge. Extending adds an hour from
  `max(expires_at, now)`.

### On Deck

Always mounted, even when empty. Numbered slate cards (up next first) with a
skill-balance label and a next-free-court ETA.

- **＋ Build lineup** — oversized 2×2 slots; drag 4 waiting players in and press
  **Add to On Deck**. Nothing slates until that click.
- **Smart add / ✨ Smart Match** — pour a slate-only dry-run plan into the
  builder for review; still nothing slated until **Add to On Deck**.
- Up to 3 slates; reorder with ↑/↓; cancelling asks for confirmation (players
  return to the queue). When a match ends, the first slate auto-promotes to the
  freed court.

### Queue

All / Wait / Rest tabs. Rest and wake via buttons or drag-and-drop both ways.
Cards can be removed entirely (check-in undo) via the card's Remove action —
with a confirmation, and never for someone on court or slated.

### Ending a match

Confirm → record scores, shuttles used (pre-filled at **1 per game**) and an
optional 1–5 rating. Finished players return to the queue with their wait clock
reset; the next slate promotes onto the freed court.

**Shuttle counting:** every new game counts 1 shuttle by default, at the moment
it starts. The **+ New shuttle** button in the sidebar adds extras (lost/broken
tubes) on top for the session; it can't go below zero.

### Smart Match (header)

Asks the server for a dry-run plan, shows it, and executes exactly what you
confirmed. If the queue changed in between, it refuses with
`Queue changed — review and try again` rather than guessing.

## Stats sidebar

Players / Matches / Avg-wait figures, shuttles used, and the live leaderboard
(rank, games, W/L, win %, point differential).

## Ending the session

**End Session** and **New Session** (both confirm first) close the session;
history and the leaderboard persist in SQLite. Court expiry and timers stop
with it.
