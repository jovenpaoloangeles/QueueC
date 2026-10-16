## What

<!-- One or two sentences: what changes for a queue master using the app? -->

## Why

<!-- The problem or session-flow friction this addresses. Link an issue if one exists. -->

## Notes for review

- [ ] `bunx @biomejs/biome check` is clean
- [ ] Server-state assertions live in `server/routes/*.test.js` (registered in `tests/scripts/run-server-tests.js`), not a browser spec
- [ ] New write paths call `broadcast()`
- [ ] CI green (lint + build + server tests + e2e)
