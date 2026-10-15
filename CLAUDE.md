# QueueC workflow policy

Measured 2026-10-15: test execution was 31% of agent time with near-zero review-stage yield; these rules exist to keep it that way. (Test speed itself is already handled: API-seeded `fullSetup`, state waits, `bun run test:server`, `bun run test:touched`, stale-dist guard in the Playwright globalSetup.)

## Review pass — one reviewer, both verdicts

Run spec compliance and code quality as ONE reviewer dispatch (both verdicts, one diff read). Two separate reviewer subagents per task doubles LLM calls for verdicts that almost always agree.

## Review fast paths

- **Zero-production-diff** (tests/docs only): light review — one cheap pass checking the tests are behavioral and the claims match, no full rubric.
- **Bug reports get a reproduce-first gate**: before dispatching an implementer for a bug item, reproduce it (controller or one cheap subagent, ~5 min, live or API-level). If it doesn't reproduce, the task shrinks to "write the regression test" — no implementer cycle proving a negative.

## Dispatch hygiene (prevents cap deaths)

- No implementer brief ships without a **"where things live" section**: exact files, line numbers, endpoints, test commands. An implementer that burns its iteration budget re-exploring is 100% waste.
- **Batch micro-tasks** (small independent UI changes, ~4 items) into one implementer dispatch with per-item commits and ONE batch review.
- **Parallel independent tasks via worktrees** (`isolation: worktree`, distinct `PW_BASE_PORT` per agent — e.g. 3500/3600; the config reads `PW_BASE_PORT` + `PW_WORKERS`), cherry-pick back to master. Never two implementers in the same working tree.
- Long/full suites run **backgrounded**, never blocking a tool call past its timeout (killed runs are pure waste).

## Test policy by stage

- Implementer: unit + server tests for logic changes (<10s) + build + **only the specs its change touches** (`bun run test:touched <rev>`). Never the full suite.
- Reviewer: no test execution by default — verdict from the diff + the implementer's reported output; one named spec only on contradiction.
- ONE full suite per round, on the final commit, backgrounded.
- Server-state assertions get an API-level regression test (`bun run test:server`, sub-second), not a browser spec. The browser asserts only the UI re-render.
