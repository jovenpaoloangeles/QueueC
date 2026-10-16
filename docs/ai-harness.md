# Working on QueueC with an AI harness

QueueC is developed with Claude Code (and works with Codex, Cursor, etc.). The
repo's agent policy lives in the root [CLAUDE.md](../CLAUDE.md) — read it
first; this page explains the *why* so an agent (or its human) doesn't fight
the repo.

## What CLAUDE.md asks for, and why

- **One reviewer dispatch, both verdicts.** Spec compliance and code quality
  are reviewed together. Two reviewer agents per task doubled LLM calls for
  verdicts that almost always agreed.
- **No full test suite per change.** Measured: test execution was 31% of agent
  time with near-zero review-stage yield. Implementers run unit + server tests
  for logic changes, the build, and `bun run test:touched` (only the specs the
  change maps to). One full suite per round, on the final commit, backgrounded.
- **Reproduce-first for bug reports.** A bug that doesn't reproduce shrinks to
  "write the regression test" — no implementer cycle spent proving a negative.
- **Where-things-live in every implementer brief.** Exact files, line numbers,
  endpoints, test commands. An implementer that burns its iteration budget
  re-exploring is pure waste.
- **API-level over browser-level.** Server-state assertions belong in
  `server/routes/*.test.js` (sub-second, no browser); the browser only asserts
  the UI re-render. See [testing.md](testing.md).

## Repo-specific gotchas agents hit

- **Never point tests or scripts at a production port.** The test harness
  self-hosts: per-worker servers on `PW_BASE_PORT + index` with temp DBs
  (`tests/fixtures.js`), API tests on port 3991. If you're hardcoding a base
  URL in a test, you're doing it wrong.
- **State comes from SSE, not REST.** `GET /api/sse` (`event: state`) is the
  only state feed; REST reads are mostly write-shaped. A mutation must call
  `broadcast()` server-side or browsers silently diverge
  ([architecture.md](architecture.md)).
- **UI re-renders lag one SSE tick.** Assertions on post-mutation UI need a
  retrying expect (`toHaveText`, `toContainText`) before a plain read — a
  single `innerText()` grab races the broadcast.
- **Edits are assert-guarded.** The established edit method is a scripted
  string replacement that asserts the exact occurrence count before writing —
  silent partial edits don't ship here.
- **The Playwright config lives in `tests/`,** and `bunx playwright` breaks
  (conflicting copy). Use `tests/node_modules/.bin/playwright` from the repo
  root, or `bun run test:e2e` from `tests/`.

## Env assumptions

`CLAUDE.md` in this repo assumes the Claude Code CLI with subagents
(Task/Agent dispatch, worktree isolation for parallel implementers, distinct
`PW_BASE_PORT` per agent). With another harness, the portable parts are the
test policy and the review discipline — the commands in
[testing.md](testing.md) run anywhere Bun and Playwright run.
