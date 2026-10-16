# Contributing to QueueC

Thanks for considering it. QueueC is a small, deliberately boring app — one
server process, one SQLite file, one screen — and contributions that keep it
that way are the ones that get merged.

## Getting set up

```bash
bun install && bun install --cwd server && bun install --cwd client
bun run dev            # API on :3001, Vite client with reload
```

Tests (from `tests/`, see [docs/testing.md](docs/testing.md) for detail):

```bash
cd tests
bun run test:server    # API-level regressions — sub-second, run these constantly
bun run test:unit
bun run test:e2e       # full Playwright suite (~1 min)
```

`bun run test:touched` from the repo root runs only the e2e specs your change
maps to — use it instead of the full suite while iterating.

## Before you open a PR

- **Lint & format:** `bunx @biomejs/biome check --write` (CI enforces
  `biome check`; the same runs as a [prek](https://github.com/j178/prek) hook —
  `prek install` after cloning).
- **Logic changes:** add or extend an API-level test in `server/routes/`
  (register it in `tests/scripts/run-server-tests.js`) rather than a browser
  spec, whenever the assertion is about server state. Browser specs are for UI
  behavior only.
- **Every write path must call `broadcast()`** — see
  [docs/architecture.md](docs/architecture.md) for the SSE state model. A
  mutation that doesn't broadcast silently diverges every open browser.
- **Commit style:** conventional commits (`feat:`, `fix:`, `docs:`, …), one
  logical change per commit. CI (lint + build + server tests + full e2e) must
  be green.

## Working with an AI agent?

The repo is developed with Claude Code and has an agent policy — read
[CLAUDE.md](CLAUDE.md) and [docs/ai-harness.md](docs/ai-harness.md). It's
good context even for humans: it explains why the test suite is layered the
way it is.

## Reporting bugs

Open an issue with the bug template: what you did, what you expected, what
happened, and the browser + how you're running QueueC (Docker image tag or
from source). Server logs from the container help.
