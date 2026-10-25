# Testing

Three layers, deliberately cheap at the bottom:

| Layer                                                                    | What                                                   | Speed       |
| ------------------------------------------------------------------------ | ------------------------------------------------------ | ----------- |
| Unit (`tests/unit/`)                                                     | pure logic (dnd validity, api error shape, timer math) | ms          |
| Server/API (`server/**/*.test.js` + `tests/scripts/run-server-tests.js`) | route behavior over a real throwaway server + temp DB  | seconds     |
| E2E (`tests/e2e/*.spec.js`)                                              | Playwright, one real server + temp DB **per worker**   | ~1 min full |

## Running

```bash
cd tests
bun install               # playwright + deps
bunx playwright install chromium   # once

bun run test:server       # API-level regressions (boots its own server, PORT 3991)
bun run test:unit         # unit tests
bun run test:e2e          # full browser suite (rebuilds client if stale)
bun run test              # unit + e2e
```

A single spec, from `tests/`:

```bash
bunx playwright test e2e/12-live-courts.spec.js --config=playwright.config.js
```

Env knobs: `PW_BASE_PORT` (worker servers start at this port, default 3410 —
use a different base to run two suites side by side) and `PW_WORKERS`
(default 8).

## Isolation guarantees

- **Tests never touch a real instance.** Both the API runner and each Playwright
  worker spawn their own `bun server/index.js` with a temp `DB_PATH` and
  `PLAYERS_PATH=tests/fixtures/players.json`, on their own port. Nothing
  assumes a server is already running.
- Per-test reset is a direct SQLite row wipe (~40 ms), not app calls.
- `tests/scripts/ensure-build.js` (Playwright `globalSetup`) mtime-checks
  `client/src` vs `client/dist` and rebuilds only when stale — a stale bundle
  once caused 16 false failures, hence the guard.

## Server-state assertions

Anything about server state that can be asserted over the API gets an
API-level test in `server/routes/*.test.js` (sub-second, no browser); the
browser layer only asserts the UI re-render. Each `*.test.js` is a
self-contained assert script; `tests/scripts/run-server-tests.js` boots the
throwaway server, points `QC_TEST_BASE` at it, and runs the registered files —
register new files there.

## `test:touched`

From the repo root, after editing code:

```bash
bun run test:touched -- [rev]   # rev defaults to HEAD~1
```

Greps the e2e spec sources for changed paths/basenames (camelCase-aware) and
runs only the mapped specs. `server/**` maps to nothing by design — server
changes are covered by the API layer. Dumb on purpose: no manifest to maintain.

## Scenario checklist

The full UX scenario inventory lives in
[testing-checklist.md](testing-checklist.md) (historical; some entries describe
superseded UI — the specs in `tests/e2e/` are the source of truth).
