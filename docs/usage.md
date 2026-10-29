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
  edit name/skill inline.
- **Check-in order** — alphabetical (default) or arrival order, chosen per
  session at creation.
- **Rotation rules** — max games in a row (1–5, default 2) and minimum rest
  games (0–3, default off), chosen per session at creation. Smart Match obeys
  them; when the queue is too short to satisfy a rule, it relaxes it rather
  than fielding nothing.

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
  builder for review; still nothing slated until **Add to On Deck**. Players
  already drafted into the builder are locked in their slots — the plan fills
  the empty slots around them (up to 3 picks); re-running with all four
  filled is disabled. If no fair quartet exists around your picks, Smart add
  says so and leaves the builder untouched.
- Up to 3 slates; reorder with ↑/↓; cancelling asks for confirmation (players
  return to the queue). When a match ends, the first slate auto-promotes to the
  freed court.

### Queue

**Check In** opens the search panel — select several players (checkbox chips)
and check them all in with one confirmation. **Pause** (header) freezes every
countdown for a break; Resume shifts all clocks forward as if no time passed.
Keyboard shortcuts: `c` check-in, `s` promote next slate, `e` end the
longest-running game, `?` cheatsheet (ignored while typing in a field).

All / Wait / Rest tabs. Rest and wake via buttons or drag-and-drop both ways.
Cards can be removed entirely (check-in undo) via the card's Remove action —
with a confirmation, and never for someone on court or slated. Check-ins and
match starts show an Undo toast for a few seconds.

### Ending a match

Confirm → record scores (both required, no ties), shuttles used (pre-filled at **1 per game**) and an
optional 1–5 rating. Finished players return to the queue with their wait clock
reset; the next slate promotes onto the freed court.

**Shuttle counting:** every new game counts 1 shuttle by default, at the moment
it starts. The **+ New shuttle** button in the sidebar adds extras (lost/broken
tubes) on top for the session; it can't go below zero.

### Smart Match (header)

Asks the server for a dry-run plan, shows it, and executes exactly what you
confirmed. If the queue changed in between, it refuses with
`Queue changed — review and try again` rather than guessing.

Smart Match spreads play across check-in waves — early and late arrivals mix
instead of living in separate bubbles — and honors the session's rotation
rules. With only 2–3 players waiting and a free court, it falls back to a
singles match instead of fielding nothing.

## Stats sidebar

Players / Matches / Avg-wait figures, shuttles used, and the live leaderboard
(rank, games, W/L, win %, point differential). The **Session / Month /
All** switch above the leaderboard widens it to every game started this
calendar month or ever; on the wider boards players with fewer than 3 games
rank below everyone else.

## Ending the session

**End Session** and **New Session** (both confirm first) close the session —
the confirm warns if games are still on court or lineups on deck, and those
are discarded (end the games first to keep their scores);
history and the leaderboard persist in SQLite. Court expiry and timers stop
with it.

## History

**History** (top bar) lists every ended session — date, headcount, shuttle
totals. Click one for the full record: final leaderboard, games log, shuttle
totals and attendance. While a session is still live its page refreshes every
10 seconds.

Each session page also shows:

- **Highlights** — one line per type: win streaks of 3+ within the session,
  players on a 3+ session attendance streak, and career milestones (25th, 50th
  and every 100th game) reached that day.
- **Fairness** — fewest / median / most games played, average net wait (time
  between a player's games, from check-in or session start), and the three
  longest single waits. Resting counts as waiting, so a long rest can top the
  list.
- **Share recap** — a plain-text summary (top player, most games, highlights)
  to copy or share into the group chat.

### Fixing mistakes

Ended games keep **Edit** / **Delete** buttons on the session page — scores,
shuttles, rating, even the four players can be corrected, and every stat
(leaderboard, career totals, partner records) recomputes immediately. The same
works mid-session. Attendance rows can be removed (only if the player never
played) or missed players added after the fact.

### Player careers

Click any player's name on a session page for their career: all-time games,
W/L, win %, point differential, hours on court, doubles partners and
head-to-head records against every opponent (each with win %; best/worst
partner and easiest/toughest opponent once there are 3+ games together),
sessions attended and attendance % per month.

### Export

**Export CSV** / **Export JSON** on a session or career page downloads that
page's data — the CSV uses `#`-commented sections so it opens cleanly in any
spreadsheet.
