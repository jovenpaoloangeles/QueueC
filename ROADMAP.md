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

- [x] **Partner synergy & head-to-head** — best/worst partner pairings (win % together) and per-opponent records; the games log already has the data, this is just the query + view.
- [x] **Fairness report** — per-session court-time distribution: min/median/max games played, who got bumped most, avg net-wait; closes the loop on the queue's fairness promise.
- [x] **Leaderboard time windows** — leaderboard switchable between this session / this month / all-time.
- [x] **Streaks & milestones** — win streaks, attendance streaks, "100th game" callouts in the session summary; cheap to compute once history exists.
- [x] **Session summary share card** — text recap shipped (PNG/photo card not built); generated PNG/text recap for the group chat (winner, MVP, games played, photo optional — Reclub's "Moments" minus the feed).

## v1.5 — UX polish (from the 2026-10-29 UI review)

Ordered by impact. Found on a seeded demo at 1440 / 1024 / 768 / 390 px.

- [ ] **Header overflows below ~1380 px** — at 1024 (landscape iPad, the likeliest courtside device) Smart Match, History, Pause and End Session are pushed off-screen; at 768/390 the whole live view breaks (sidebar keeps its width, queue cards crush to ~60 px columns, text overlaps). Wrap/collapse the header status strip and stack the sidebar under the courts below `lg`.
- [ ] **Leaderboard window toggle cramped** — "All-time" wraps to two lines in the sidebar and the segment overflows its card at 1024; shorten to "All" or let the header row wrap.
- [ ] **Small samples top the leaderboards** — ranking is win %-first, so every 1-0 player outranks a 6-2 player; tolerable per session, misleading on Month/All-time. Add a minimum-games threshold (or sort by wins) for the wider windows.
- [ ] **Internal metric on queue cards** — "fairness 0.1" (the scheduler's score) and "0m played" are shown to the queue master; drop them or replace with plain "Played 2 · Waited 12m".
- [ ] **Highlights wall** — one row per player per event (17 rows on an ordinary night, mostly "career game #10"); group by type as name chips ("🔥 3+ win streaks: Aimie, Claire, Joven") and start milestones at 25. The share recap inherits the same bloat (20+ lines) — cap it at the top 3 per type.
- [ ] **Stale statuses on ended sessions** — the session page's attendance lists everyone as "waiting" after the session ended; show games played instead. The session leaderboard also lacks the GP column the sidebar has.
- [ ] **Misleading career empty state** — "Attendance by month: No ended sessions yet" renders next to a list of attended sessions when those sessions predate the player's `created_at`; say why instead (or count attended sessions regardless).
- [ ] **Long career tables** — partners/head-to-head list every 1-game pairing; show the top ~8 by games with a "show all" toggle.
- [ ] **Check-in of a pruned player 500s** — `POST /sessions/:id/checkin` with a player deleted by the end-of-session pool reset returns 500 instead of 404 (stale tab after a session ends).

## v2.0 — Court config

- [ ] **Editable court config mid-session** — add/remove a court when rental reality changes, with reflow of staged slates.

## Ops & community

- [ ] **Automatic SQLite backups** — timer-based copy of the db into the data volume with N-file retention.
- [ ] **SSE reconnect hardening** — exponential backoff + state resync on flaky venue wifi; verify with a proxy that drops connections.
- [ ] **PWA install** — manifest + service worker so the deck screen installs like an app.
- [ ] **Health endpoint + Docker healthcheck** — `/healthz` wired into the Dockerfile `HEALTHCHECK`.

## Parked

The queue master is the only operator of this app for now, so anything multi-operator or multi-venue waits until that changes.

- **Simple auth** — single shared password or passkey for queue-master actions; viewers stay read-only.
- **Multiple concurrent sessions** — separate venues/sections under one install, each with its own courts and queue.

## Nice to Have

- [ ] **Guest self check-in** — QR code that opens a check-in page (name entry + join queue), removing the queue master as bottleneck. Opens writes to non-QM devices — revisit alongside the parked Simple auth.
- [ ] **Print/mobile-friendly deck view** — read-only layout of courts + on-deck for a phone taped to the wall.
- [ ] **Player notes/tags** — per-player flag (lefty, needs-partner, injury) visible while drafting lineups.
- [ ] **Shuttle low-stock warning** — set an opening shuttle count at session start; warn when remaining dips below a threshold.
- [ ] **Skill rating progression** — optional ELO-style rating that drifts from match results (per docs/algorithm.md skill model), with a per-player sparkline on the career page; Smart Match can then consume the drifting rating instead of a static roster skill.
