# Changelog

Notable user-facing changes. Format follows Keep a Changelog; versions follow
semver once there is a public API surface to break (the Docker image tag is
the version that matters for self-hosters).

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
