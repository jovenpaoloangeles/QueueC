# QueueC Tests

Self-contained test suite. Runs Playwright E2E tests against a local server and
`node:assert` unit tests for pure logic.

## Requirements

- Bun ≥ 1.1
- `bunx playwright` available (Playwright 1.64+)
- Chromium browser: run `bunx playwright install chromium` if missing

## Run all tests

From this directory (`tests/`):

```bash
bun test
```

## Run only E2E

```bash
bun run test:e2e
```

## Run a single spec

```bash
bunx playwright test e2e/01-landing.spec.js --config=playwright.config.js
```

## Run only unit tests

```bash
bun run test:unit
```

## Run server/API regression tests

Some server-state scenarios (e.g. `server/routes/two-match-end.test.js`) run
against a live server instead of the browser:

```bash
# server already running on :3001
bun server/routes/two-match-end.test.js
# or point at another instance:
QC_TEST_BASE=http://localhost:3999 bun server/routes/two-match-end.test.js
```

These are sub-second; run them in the implementer stage for any server-route
change, before reaching for the E2E suite.

**Note:** there are no per-route e2e specs for server routes. E2E exercises the
server through the UI only; server behaviour is covered by `bun test server/`
and the live-server tests above.

## Run only the specs a change touches

From the repo root, after editing code:

```bash
bun run test:touched -- [rev]   # rev defaults to HEAD~1 (diff is rev vs worktree)
```

Greps the e2e spec sources for the changed paths/basenames (camelCase-aware:
`QueueGrid.jsx` matches specs mentioning queue AND grid). Changed spec files map
to themselves; `server/**` maps to nothing (see note above). Dumb by design —
no manifest to maintain.

## Stale-dist guard

`playwright.config.js` uses `scripts/ensure-build.js` as its `globalSetup`: it
mtime-compares `client/src` (+ `client/index.html`, vite config) against
`client/dist/index.html` and runs the client build only when stale. A stale
bundle previously caused 16 false e2e failures. The check is a no-op when the
dist is fresh; `bun run test:e2e` runs the same guard before Playwright.

## Configuration

| Env var | Default | Description |
|---------|---------|-------------|
| `DB_PATH` | `/tmp/queuec-test.db` | Test database path |
| `PLAYERS_PATH` | `fixtures/players.json` | Fixture players file |

## CI

The `bun run test` command exits non-zero on any failure. Playwright writes an HTML
report to `playwright-report/` (not committed).

## Test DB

A fresh DB is created at `/tmp/queuec-test.db` at the start of each full run.
It persists between runs for debugging; delete it manually to reset.
