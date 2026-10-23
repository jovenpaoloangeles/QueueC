# Roadmap

Status legend: no checkbox = not started. Check off as shipped; delete rejected items freely.

## v1.1 — Session polish

- [x] **Undo/redo for last action** — accidental check-in or confirm-start is the most common queue-master slip; a single "Undo" toast beats confirm dialogs.
- [x] **Pause session** — freeze all countdowns and net-wait clocks for a break (rain, court maintenance) without ending the session.
- [x] **Bulk check-in** — toggle whole rows in the player pool; 20 players arriving at once shouldn't be 20 clicks.
- [x] **Idle-court nudge** — visual pulse/banner when a court sits free for N minutes with a slate staged (or players waiting with no slate staged).
- [x] **Keyboard shortcuts for queue master** — check in (search-by-type), confirm start, end game, promote next slate — bound keys with a `?` cheatsheet.
- [x] **Late-game restore** — browser refresh mid-draft keeps the in-progress slate draft instead of silently dropping it.
- [x] **Named teams in score & UI** — score prompts say "Team 1/Team 2" instead of the actual player names; everywhere a team is referenced (score entry, confirm dialogs, toasts) show the four player names.
- [x] **Alphabetical vs. arrival toggle** — per-session choice of check-in ordering, defaulting to alphabetical (the current behavior).

## v1.2 — Smarter matching

- [x] **Target optimizer (doc'd, not built)** — implement the optimizer design already specified in [docs/algorithm.md](docs/algorithm.md) behind the same dry-run-first gate.
- [x] **Rotation rule config** — "no more than 2 consecutive games" or "rest N games minimum" as session settings the heuristic respects.
- [x] **Partial-lineup lock** — keep 2 of 4 drafted players when re-running Smart Match instead of discarding the slate.

## v1.3 — History

- [x] **Session history browser** — past sessions list with final leaderboard, games log, shuttle count; currently only the live session exists.
- [x] **Player career page** — all-time W/L, partners played with, hours on court.
- [x] **Attendance tracking** — who played each session, attendance % per player per month; groundwork for Reclub-style "who's coming" (RSVP lives in Nice to Have).
- [x] **CSV/JSON export** — one-click export of session and per-player stats.

## v1.4 — Stats improvements

- [ ] **Partner synergy & head-to-head** — best/worst partner pairings (win % together) and per-opponent records; the games log already has the data, this is just the query + view.
- [ ] **Fairness report** — per-session court-time distribution: min/median/max games played, who got bumped most, avg net-wait; closes the loop on the queue's fairness promise.
- [ ] **Leaderboard time windows** — leaderboard switchable between this session / this month / all-time.
- [ ] **Streaks & milestones** — win streaks, attendance streaks, "100th game" callouts in the session summary; cheap to compute once history exists.
- [ ] **Session summary share card** — generated PNG/text recap for the group chat (winner, MVP, games played, photo optional — Reclub's "Moments" minus the feed).

## v2.0 — Multi-club & access

- [ ] **Editable court config mid-session** — add/remove a court when rental reality changes, with reflow of staged slates.

## Ops & community

- [ ] **Automatic SQLite backups** — timer-based copy of the db into the data volume with N-file retention.
- [ ] **SSE reconnect hardening** — exponential backoff + state resync on flaky venue wifi; verify with a proxy that drops connections.
- [ ] **PWA install** — manifest + service worker so the deck screen installs like an app.
- [ ] **Health endpoint + Docker healthcheck** — `/healthz` wired into the Dockerfile `HEALTHCHECK`.

## Nice to Have
- [ ] **Guest self check-in** — QR code that opens a check-in page (name entry + join queue), removing the queue master as bottleneck.
- [ ] **Simple auth** — single shared password or passkey for queue-master actions; viewers stay read-only.
- [ ] **Multiple concurrent sessions** — separate venues/sections under one install, each with its own courts and queue.
- [ ] **Print/mobile-friendly deck view** — read-only layout of courts + on-deck for a phone taped to the wall.
- [ ] **Player notes/tags** — per-player flag (lefty, needs-partner, injury) visible while drafting lineups.
- [ ] **Shuttle low-stock warning** — set an opening shuttle count at session start; warn when remaining dips below a threshold.
- [ ] **Skill rating progression** — optional ELO-style rating that drifts from match results (per docs/algorithm.md skill model), with a per-player sparkline on the career page; Smart Match can then consume the drifting rating instead of a static roster skill.