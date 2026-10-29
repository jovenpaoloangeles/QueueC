# Changelog

Notable user-facing changes. Format follows Keep a Changelog; versions follow
semver once there is a public API surface to break (the Docker image tag is
the version that matters for self-hosters).

## [1.5.0] — 2026-10-29

Stats improvements (roadmap v1.4).

### Added

- Leaderboard time windows: the sidebar leaderboard switches between this
  session, this month and all-time (`GET /api/leaderboard?since=`).
- Partner synergy & head-to-head: the career page shows win % with every
  partner, a head-to-head table against every opponent, and best/worst
  callouts (3+ games). Career CSV gains an Opponents section.
- Fairness report on the session page: fewest/median/most games, average net
  wait between games, and the three longest single waits.
- Streaks & milestones on the session page: in-session win streaks (3+),
  consecutive-session attendance streaks (3+), 10th/25th/50th/every-100th
  career game.
- Share recap: a copyable plain-text session summary for the group chat.

### Fixed

- The sidebar leaderboard's GP column was always blank.

## [1.4.1] — 2026-10-23

End-match flow polish and history navigation fixes.

### Changed

- End Match confirm dialog asks "Who won?" — picking a team opens the score
  modal with that side preset to 31 (scores start empty, never "031").
- Shuttle count in the end-match modal is a +/− stepper instead of a text input.
- Score modal labels show the team names only (no "Team N ·" prefix); score
  inputs have explicit aria-labels.

### Fixed

- The header History link no longer disappears when a session ends — it is the
  only way back to history.
- History page's ← Back returns to the live/setup view instead of itself.

## [1.3.0] — 2026-10-23

History & corrections.

### Added

- Session history browser: every ended session listed with date, headcount and
  shuttle totals; a detail page shows the final leaderboard, full games log
  (court, matchup, score, shuttles, rating) and per-player attendance. A live
  session's detail page refreshes every 10s.
- Player career page: all-time games, W/L, win %, point differential and hours
  on court, doubles partners with combined record, sessions attended, and
  monthly attendance % (missed sessions count against it).
- Corrections: edit a finished match's scores, shuttles, rating or players —
  or delete it outright — with every derived stat recomputed immediately, live
  or after the session ends. Attendance can be fixed too: remove a checked-in
  player who never played, add a missed one.
- One-click export: session detail and player career download as CSV
  (spreadsheet-friendly, `#`-commented sections) or JSON. Downloads mirror the
  pages — same builders, so they can never disagree.
- Data preservation: ending a session no longer purges drop-in players who
  have match history, so careers survive ad-hoc guests. History-less drop-ins
  still clean up as before.

## [1.2.0] — 2026-10-22

Smarter matching.

### Added

- Wave crossover: Smart Match spreads play across check-in waves instead of
  letting early and late arrivals play in separate bubbles (cohort-overlap
  objective in the match planner).
- Rotation rule settings per session — max consecutive games (1–5, default 2)
  and minimum rest games (0–3, default off) — respected by Smart Match, with a
  graceful relax so a short queue still fields a game.
- Partial-lineup lock: players already drafted into the On Deck builder keep
  their slots when you re-run Smart add; the planner fills the rest around
  them (slate-only, up to 3 picks).

## [1.1.0] — 2026-10-22

Session polish.

### Added

- Undo toast on check-in, match start, and On Deck actions (single level).
- Pause session: freezes all countdowns and clocks for a break; resume shifts
  every timer forward as if no time passed.
- Bulk check-in: multi-select players in the check-in panel, one confirmation.
- Idle-court nudge banner when a court sits free with a slate staged (or 4+
  players waiting with none).
- Keyboard shortcuts — `c` check-in, `s` promote next slate, `e` end longest
  game, `?` cheatsheet; ignored while typing.
- Draft restore: an in-progress court lineup survives a browser refresh.
- Player names on every team reference: end-match confirm gate and score
  labels, start toasts.
- Per-session check-in order: alphabetical (default) or arrival.

## [1.0.0] — 2026-10-16

First public release.

### Added

- One-screen session setup: name, whole-hour start, 1–16 courts with per-court
  rental hours and staggered opens, alphabetical player pool with search /
  select-all / tier filter / inline edit.
- Live courts: drag-and-drop 2×2 lineup drafting, confirm-gated match starts,
  per-court rental countdown with mid-match extend, team rearranging.
- On Deck slate (up to 3): manual builder, Smart Match plan review, reorder,
  auto-promotion to the next free court.
- Smart Match: dry-run-first heuristic (wait time, games played, skill
  variance, team balance, pair redundancy); never writes unconfirmed.
- Fair queue: net-wait clocks (playing time excluded), rest/wake (buttons +
  drag), alphabetical check-in, remove-with-confirm for waiting/resting.
- Shuttles: 1 per game by default, + New shuttle manual extras, per-match
  override at match end.
- Two-step end match (confirm → scores, shuttles, star rating).
- Live leaderboard (games, W/L, win %, point differential) and session stats.
- Real-time sync across browsers via SSE; dark theme.
- Docker deployment with non-root runtime and healthcheck; one-line install script.
- Test suite: unit, API-level, Playwright e2e (230+ scenarios).
