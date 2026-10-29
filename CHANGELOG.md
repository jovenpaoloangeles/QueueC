# Changelog

Notable user-facing changes. Format follows Keep a Changelog; versions follow
semver once there is a public API surface to break (the Docker image tag is
the version that matters for self-hosters).

## [Unreleased] — v1.7 matchmaking review

Smart Match changes from the 2026-10-29 algorithm review (details and
measurements: docs/algorithm.md §8, docs/simulation-sweep-report.md).

### Changed

- Smart Match learns skill from results: a rating per player (tier scale,
  shown on the career page as μ ± σ) moves with point margins and carries a
  per-session form offset; it replaces the fixed roster tier when balancing.
- Wide-range games are capped at 2 tiers unless a long-waiting player has no
  narrower option, and lopsided teammates ({5,3} vs {5,3}) score as worse games.
- When two rotation groups stop meeting (16 players on 2 courts with similar
  game lengths), Smart Match deliberately mixes them.
- The longest waiter is protected when Smart Match fills several courts and
  On Deck slots at once; only the first 5 minutes of a rest break count as
  waiting for matching.
- Small skill tiers that keep playing only among themselves are nudged to mix
  with the nearest tier.

### Fixed

- Smart Match could plan fewer lineups than free courts / On Deck slots when
  the longest waits were concentrated in a few players.

## [1.6.0] — 2026-10-29

Queue-master quality of life (roadmap v1.6) on top of the v1.5 UX polish.

### Added

- Payments: on the session page (header **Payments** link while live) enter
  the court fee and per-shuttle price, pick _everything evenly_ or _court
  evenly, shuttles by games played_, and tick who paid — shares round to whole
  pesos with a collected / total line.
- **Went home** on a queue card for players who've already played: off the
  queue, kept in attendance, Undo-able; checking them in again brings them
  back on the same entry.
- **Sub** on a live court: a waiting player takes a seat mid-game (injury);
  the player coming off rests and keeps the court time so far.
- After ending a match, the "Result saved" toast has **Fix**, which opens the
  session page where every game can be edited.
- Last call: idle courts in their final 20 minutes show "Last call · Nm left",
  and the start-match confirm warns how much rental is left.
- Newcomers' queue cards show a rough "next game ≈ Nm" estimate.
- Setup: **Last session's players** adds the previous session's attendees to
  the selection.

### Changed (v1.5 UX polish)

- The session time range in the header only shows from 1536 px wide.
- The live screen fits tablets and phones: the header wraps instead of pushing
  Smart Match / History / Pause / End Session off-screen, status chips show
  from 1280 px, the sidebar stacks under the courts below 1024 px and courts go
  single-column on phones.
- End Session warns when games are still on court or lineups on deck; ending
  discards them instead of leaving score-less rows in history.
- A match can't end blank or tied — the end-match form says why and keeps
  Confirm disabled (the API rejects it too, for end and corrections).
- Month / All-time leaderboards rank players with 3+ games first.
- Session highlights group by type (one line each); milestones start at the
  25th career game; the share recap lists at most 3 names per type.
- Session page: GP column on the leaderboard; ended sessions list games played
  per attendee instead of a stale queue status; Remove only shows for players
  without games.
- Career page: partners / head-to-head show the top 8 with "Show all".
- Queue cards no longer show the scheduler's internal fairness score or
  "0m played"; the leaderboard switch reads Session / Month / All.

### Fixed

- Starting a match (direct, from On Deck, or Smart Match) is refused while the
  session is paused, matching match end.
- Queue status changes only accept waiting / resting / left, and never mark an
  on-court or on-deck player as left.
- Checking in a player that no longer exists returns 404 instead of 500.
- Career and partner/opponent records no longer count a tie as a loss.
- Monthly attendance % counts sessions a player attended even when they predate
  the player's record.

## [1.4.2] — 2026-10-29

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
