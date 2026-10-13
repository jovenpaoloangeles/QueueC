# QueueC Tests

Self-contained test suite. Runs Playwright E2E tests against a local server and
`node:assert` unit tests for pure logic.

## Requirements

- Node ≥ 22
- `npx playwright` available (Playwright 1.64+)
- Chromium browser: run `npx playwright install chromium` if missing

## Run all tests

From this directory (`tests/`):

```bash
npm test
```

## Run only E2E

```bash
npm run test:e2e
```

## Run a single spec

```bash
npx playwright test e2e/01-landing.spec.js --config=playwright.config.js
```

## Run only unit tests

```bash
npm run test:unit
```

## Configuration

| Env var | Default | Description |
|---------|---------|-------------|
| `DB_PATH` | `/tmp/queuec-test.db` | Test database path |
| `PLAYERS_PATH` | `fixtures/players.json` | Fixture players file |

## CI

The `npm test` command exits non-zero on any failure. Playwright writes an HTML
report to `playwright-report/` (not committed).

## Test DB

A fresh DB is created at `/tmp/queuec-test.db` at the start of each full run.
It persists between runs for debugging; delete it manually to reset.
