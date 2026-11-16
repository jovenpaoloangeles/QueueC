# Plan 002: Wire the 15 unrun test suites into CI and fix the test docs

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md`.
>
> **Drift check (run first)**: `git diff --stat c00e826..HEAD -- tests/scripts/run-server-tests.js tests/package.json tests/unit/timer.test.js client/src/hooks/useTimers.js client/src/hooks/useTimers.test.js server/routes/metrics.test.js server/routes/stats.test.js package.json README.md CONTRIBUTING.md scripts/test-touched.mjs`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: M
- **Risk**: LOW-MED (test-only on the wiring; the two expectation updates must be justified against shipped behavior; the timer extraction touches one client file)
- **Depends on**: plans/001-server-guard-rails.md (its `staged → waiting` guard turns `slate.test.js:523` green; without it this plan's full run stays red on that one assertion)
- **Category**: tests | dx
- **Planned at**: commit `c00e826`, 2026-11-16

## Why this matters

`bun run --cwd tests test:server` is the only server-test entry point CI calls, and it runs a hardcoded 19-file list — while the repo contains 32 `*.test.js` files under `server/`. Thirteen suites have never executed in CI, including the matcher engine suite (`server/logic/smartQueue.test.js`, ~300 lines), the deep slate-substitution spec (`server/routes/slate.test.js`, 544 lines), and the queue/matches/courts/metrics/stats route specs. Any of them can regress while CI stays green. Two unit test files (`client/src/hooks/useTimers.test.js`, `client/src/lib/dnd.test.js`) are likewise orphaned — `test:unit` is a hardcoded `&&` chain that never mentions them, so they have been dead since creation. On top of that, `tests/README.md` documents a `bun test server/` command that (a) nothing wires up and (b) opens the **dev database at the repo root** (`server/db.js` defaults `DB_PATH` there) — following that file can end your live dev sessions.

Trial evidence (advisor run at `c00e826`, throwaway server on :3995 with temp DB + `tests/fixtures/players.json`): `alphabetical-insert`, `courts`, `matches.integration`, `players-queue` **pass as-is** (with the right base URL); `metrics` and `stats` fail on stale expectations (fixed in Steps 4–5); `slate` fails only on the line-523 assertion that plan 001 fixes; `db.test.js`, `schema.test.js`, `sse.state.test.js` import `db.js` directly and need their own temp `DB_PATH`; `matches.test.js`/`queue.test.js` are pure-assertion files whose imported route modules pull in `db.js`, so they need a temp `DB_PATH` too; `smartQueue.test.js` is fully pure.

## Current state

Files and their roles:

- `tests/scripts/run-server-tests.js` — the CI server-test runner: boots one throwaway server (:3991, temp DB, fixture players), then runs each registered file with `QC_TEST_BASE` + `PLAYERS_PATH` env (`tests/scripts/run-server-tests.js:70-75`).
- `tests/package.json` — `test:unit` is a hardcoded `&&` chain of 8 paths (line ~11); `test:server` delegates to the runner.
- `tests/README.md` — actively wrong (documents `bun test`, `bun test server/`, and a `/tmp/queuec-test.db` scheme that no runner uses).
- `docs/testing.md` — accurate layer table and run commands; root README links here.
- `tests/unit/timer.test.js` — defines its **own inline copy** of the timer math instead of importing it.
- `client/src/hooks/useTimers.js` / `useTimers.test.js` — the real hook holds the logic inline; the test file holds a second stale copy ("extracted from hook for testability" — but nothing was extracted).
- `server/routes/metrics.test.js`, `server/routes/stats.test.js` — stale expectations vs shipped behavior (Steps 4–5).
- `server/routes/slate.test.js` — one stale case, realigned in Step 5b.
- `package.json` (root) `install:all`, `README.md:37-38,75`, `CONTRIBUTING.md:10,17` — install three workspaces, then tell you to run tests from `tests/`, whose deps were never installed.
- `scripts/test-touched.mjs:60` — prints `covered by \`bun test server/\`` — the phantom command.

Key excerpts:

`tests/scripts/run-server-tests.js:70-75` (the per-file spawn env — note it passes `QC_TEST_BASE` without `/api`):

```js
const r = Bun.spawnSync(["bun", join(root, f)], {
  cwd: root,
  env: { ...process.env, QC_TEST_BASE: BASE, PLAYERS_PATH: join(root, "tests/fixtures/players.json") },
  stdout: "inherit",
  stderr: "inherit",
});
```

The unregistered files read the base URL in three shapes — and precedence matters:

```js
// alphabetical-insert.test.js:5  — paths include /api itself; wants QC_TEST_BASE WITHOUT /api
const BASE = process.env.QC_TEST_BASE ?? "http://localhost:3991";
// courts.test.js:3, matches.integration.test.js:1 — QC_TEST_BASE SHADOWS BASE_URL,
// so with the runner's env they'd take the /api-less QC_TEST_BASE and 404. **Correction
// (2026-11-16, executor-found): swap the precedence** so they take BASE_URL:
const BASE = process.env.BASE_URL ?? process.env.QC_TEST_BASE ?? "http://localhost:3991/api";
// metrics.test.js:5, players-queue.test.js:1, slate.test.js:5, stats.test.js:5
const BASE = process.env.BASE_URL ?? "http://localhost:3991/api";
```

So the runner passes **both** env vars (`QC_TEST_BASE` without `/api`, `BASE_URL` with `/api`) **and** the two files above get their `??` order swapped (a 2-line, test-only change in Step 1).

`tests/package.json` `test:unit` (8 hardcoded paths; `useTimers.test.js` and `dnd.test.js` absent):

```json
"test:unit": "bun unit/dnd.valid.test.js && bun unit/api.error.test.js && bun unit/timer.test.js && bun unit/nudge.test.js && bun unit/smartqueue.test.js && bun unit/ratings.test.js && bun ../client/src/lib/recap.test.js && bun ../client/src/lib/eta.test.js",
```

`server/routes/matches.js:73-79` — why `metrics.test.js` drifted: matches now **start** with `new_shuttles = 1` (v1.x "1 shuttle per game by default"):

```js
    INSERT INTO matches (session_id, court_number, format, team1_p1, team1_p2, team2_p1, team2_p2, started_at, new_shuttles)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1)
```

`metrics.test.js:100-102` still expects the pre-default value after a `+1` delta:

```js
assert.equal(m1.new_shuttles, 1, "Expected new_shuttles === 1"); // actual: 2 (started at 1, +1 delta)
```

`client/src/hooks/useTimers.js:38-49` — the inline logic to extract (the hook computes `now` above this, then builds the two Maps):

```js
  const waitSeconds = new Map();
  for (const e of queue ?? []) {
    if (e.status === "waiting") {
      waitSeconds.set(e.id, netWait(now, e));
    }
  }
  const playSeconds = new Map();
  for (const m of activeMatches ?? []) {
    playSeconds.set(m.id, Math.max(0, now - m.started_at));
  }
  return { waitSeconds, playSeconds };
```

Conventions: test files are plain assert scripts run via `bun <path>` (no bun-test DSL); every server route test either reads `QC_TEST_BASE`/`BASE_URL` or is pure; the runner guarantees isolation (temp DB per run, server killed + DB removed at exit).

## Commands you will need

| Purpose                                | Command                                                                  | Expected on success                                  |
| -------------------------------------- | ------------------------------------------------------------------------ | ---------------------------------------------------- |
| Server tests (now includes everything) | `bun run --cwd tests test:server`                                        | exit 0                                               |
| Unit tests                             | `bun run --cwd tests test:unit`                                          | exit 0, prints each file's "all assertions passed ✓" |
| Lint                                   | `bunx biome check`                                                       | exit 0                                               |
| Client unit sanity after extraction    | `bun client/src/hooks/useTimers.test.js && bun tests/unit/timer.test.js` | both print pass lines                                |

## Scope

**In scope** (the only files you should modify):
- `tests/scripts/run-server-tests.js`
- `tests/package.json`
- `tests/README.md` (delete or rewrite — Step 8)
- `tests/unit/timer.test.js`
- `client/src/hooks/useTimers.js`, `client/src/hooks/useTimers.test.js`
- `server/routes/metrics.test.js`, `server/routes/stats.test.js` (expectation alignment only)
- `server/routes/slate.test.js` (Step 5b: realign the one stale case)
- `server/routes/courts.test.js`, `server/routes/matches.integration.test.js` (Step 1.2: swap the `??` precedence, nothing else)
- `package.json` (root, `install:all`), `README.md`, `CONTRIBUTING.md`, `scripts/test-touched.mjs`, `docs/testing.md` (one line if needed)

**Out of scope** (do NOT touch):
- Any production code except the `useTimers.js` export extraction (Step 6). (Originally `slate.test.js` was out of scope pending plan 001; the Step 5b correction moved its stale case into scope.)
- The e2e specs and `tests/fixtures.js`.

## Git workflow

- Branch: `advisor/002-test-wiring`
- Commit per step; message style: `test: <what>` / `docs: <what>` (see `95ca5c7`, `c553ad3`).
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Register the seven route suites

In `tests/scripts/run-server-tests.js`:

1. In the per-file spawn env (line ~72), add `BASE_URL: \`${BASE}/api\`` alongside `QC_TEST_BASE`.
2. In `server/routes/courts.test.js:3` and `server/routes/matches.integration.test.js:1`, swap the `??` precedence so `BASE_URL` wins over `QC_TEST_BASE` (see the corrected excerpt in Current state — with the runner's env these two would otherwise take the `/api`-less `QC_TEST_BASE` and 404 on every call). This is the only edit to those files.
3. Append to the file list, after `"server/routes/v17-ratings.test.js"`, with a comment noting they were trial-verified 2026-11-16:

```js
  // registered 2026-11-16: trial-verified against the shared server (see plans/002)
  "server/routes/alphabetical-insert.test.js",
  "server/routes/courts.test.js",
  "server/routes/matches.integration.test.js",
  "server/routes/metrics.test.js",   // expectations aligned in this plan
  "server/routes/players-queue.test.js",
  "server/routes/slate.test.js",     // expectation aligned in this plan (Step 5b)
  "server/routes/stats.test.js",     // expectations aligned in this plan
```

**Verify**: `bun run --cwd tests test:server` → `alphabetical-insert`, `courts`, `matches.integration`, `players-queue` pass; `metrics` and `stats` fail on the assertions covered by Steps 4–5; `slate` fails only on the ~line-523 stale case (realigned in Step 5b — plan 001's guards are on master already). If any of the four expected-pass files fails, see STOP conditions.

### Step 2: Run the five db-backed suites in their own phase

In `tests/scripts/run-server-tests.js`, add a phase **before** the server spawn (these five need no HTTP server): for each of `server/db.test.js`, `server/schema.test.js`, `server/routes/sse.state.test.js`, `server/routes/matches.test.js`, `server/routes/queue.test.js`, spawn `bun <file>` with `cwd: root` and env `{ ...process.env, DB_PATH: <fresh temp db>, PLAYERS_PATH: <fixture> }` — one fresh temp DB per file (pattern: `join(tmpdir(), \`queuec-${f}-${process.pid}.db\`)`), removed after the run exactly like the existing `rmDb()`. Append `server/logic/smartQueue.test.js` to the same loop with no special env (it's pure — but sharing the loop is harmless).

**Verify**: `bun run --cwd tests test:server` → those six files all pass, then the route phase runs as before.

### Step 3: Register the two orphaned unit files

In `tests/package.json` `test:unit`, append: `&& bun ../client/src/hooks/useTimers.test.js && bun ../client/src/lib/dnd.test.js`.

**Verify**: `bun run --cwd tests test:unit` → 10 files run, all pass.

### Step 4: Align `metrics.test.js` with the shipped shuttle default

Matches start with `new_shuttles = 1` (see excerpt). In the shuttles section of `server/routes/metrics.test.js` (~lines 96-115), every post-PATCH `new_shuttles` expectation is one lower than reality. Bump each by +1 and adjust the inline comments (e.g. `m1.new_shuttles` 1 → 2, `m2.new_shuttles` 2 → 3; leave `used_shuttles` and clamp expectations unchanged — those still hold). Do not change any request the test sends — only the asserted values and comments.

**Verify**: `bun run --cwd tests test:server` → `metrics.test.js` passes.

### Step 5: Align `stats.test.js` with the shipped shuttle aggregate shape

Run the file once via the runner (or Step 6's throwaway-server procedure from plan 001) and read the actual failing object (advisor observed `{ extra: 0, new: 4, total: 4, used: 3 }` against an expected `{ new: 4, used: 3 }`). Cross-check the source — the shuttle aggregate query in `server/routes/stats.js` (the `GET /sessions/:id/stats` route; look for the `shuttles` object it returns) — then update the expected object(s) in `stats.test.js` to the shipped shape. If the source and the observed actual disagree, STOP.

**Verify**: `bun run --cwd tests test:server` → `stats.test.js` passes.

### Step 5b: Realign the stale "no longer staged" case in `slate.test.js`

**Correction vs the original text of this plan (2026-11-16, post-executor probe)**: `slate.test.js:515-524` was listed as pinned-by-plan-001; that attribution was wrong. The case PATCHes a _staged_ player to `status:"left"` with no assertion on the PATCH, then expects the slate start to 409 "Lineup changed". The v1.5 whitelist (`server/routes/queue.js`, "playing/staged are owned by the match and slate routes") deliberately rejects `staged→left` with 409 "Player is on court or on deck", so the victim stays staged, the start succeeds with 200, and the assertion at line ~523 fails. The file predates v1.5 and rotted while unregistered. The shipped contract is correct; the test is stale.

Rewrite the case (keep the file's helper style) to pin the real contract:

1. `PATCH /queue/:id/status {status:"left"}` on a staged entry → **409** `Player is on court or on deck` (v1.5 contract).
2. `PATCH` with `{status:"waiting"}` on a staged entry → **409** (plan 001's guard; skip this assertion if 001 hasn't landed — check `grep -n "drafted into a slated match" server/routes/queue.js`).
3. The slate start for that lineup then **succeeds** (2xx) — because the victim never left the slate; assert this so the whole flow is pinned.

The start route's "Lineup changed" re-verification (`slate.js:166-173`) stays as untested defense-in-depth: with both guards above, no route can move an entry out of `staged` except slate edit/cancel, so the branch is unreachable via the API. Leave it alone.

**Verify**: `bun run --cwd tests test:server` → `slate.test.js` passes.

### Step 6: Extract `computeTimers` so the tests test the real code

In `client/src/hooks/useTimers.js`: move the two Map loops (excerpt above) into an exported function at module level:

```js
export function computeTimers(now, queue, activeMatches) {
  const waitSeconds = new Map();
  for (const e of queue ?? []) {
    if (e.status === "waiting") waitSeconds.set(e.id, netWait(now, e));
  }
  const playSeconds = new Map();
  for (const m of activeMatches ?? []) playSeconds.set(m.id, Math.max(0, now - m.started_at));
  return { waitSeconds, playSeconds };
}
```

The hook then calls `const { waitSeconds, playSeconds } = computeTimers(now, queue, activeMatches);` (the `return` in the excerpt was the hook's own — keep the hook's return intact). Then:
- `client/src/hooks/useTimers.test.js`: delete its inline `computeTimers` copy, import `{ computeTimers }` from `./useTimers.js` (keep its `netWait` import only if still used).
- `tests/unit/timer.test.js`: same deletion + import from `../client/src/hooks/useTimers.js`. Its U3.x cases use plain `checked_in_at`/`total_seconds_played` inputs with no rest fields — verify against `netWait` in `client/src/lib/utils.js` that the expected values still hold (they do if `netWait` treats missing rest fields as 0); if any case's arithmetic assumed the old inline copy, fix the case input or expectation to match `netWait` and say which in the commit message.

**Verify**: `bun client/src/hooks/useTimers.test.js && bun tests/unit/timer.test.js` → both pass; `bunx biome check` → clean.

### Step 7: Fix the install path and the phantom-command pointers

1. Root `package.json` `install:all`: append `&& bun install --cwd tests`.
2. `README.md:38`: change the install sentence to include the tests workspace (`bun install && bun install --cwd server && bun install --cwd client && bun install --cwd tests`); `README.md:75` comment becomes `# root + server + client + tests`.
3. `CONTRIBUTING.md:10` setup block: add the tests install line, matching its neighbors' phrasing.
4. `scripts/test-touched.mjs:60`: change the message to `covered by \`bun run --cwd tests test:server\``.

**Verify**: `grep -rn "bun test server" README.md CONTRIBUTING.md scripts/ tests/README.md docs/` → no matches (after Step 8); `bun run install:all` → four installs succeed.

### Step 8: Retire `tests/README.md`

Its three hazards: it documents `bun test` as the runner (nothing wires it), claims server behavior is "covered by `bun test server/`" (unwired, and would open the repo-root dev DB — `sse.state.test.js:11-17` UPDATEs every unended session to ended), and describes a `/tmp/queuec-test.db` scheme no runner uses (the real harness uses per-run `tmpdir()` DBs, `tests/fixtures.js`). First `grep -rn "tests/README" . --include="*.md"` (exclude node_modules) and fix any references to point at `docs/testing.md`; then delete `tests/README.md`. In `docs/testing.md`, confirm the server-layer row still reads accurately (after this plan it genuinely is "registered files via the runner"); no other edits unless a claim is now stale.

**Verify**: `grep -rn "tests/README" README.md CONTRIBUTING.md docs/ .github/` → no matches; `docs/testing.md` run commands still work verbatim.

### Step 9: Full gate

**Verify**: `bun run --cwd tests test:server && bun run --cwd tests test:unit` → exit 0; then `bunx biome check` → exit 0.

## Test plan

- This plan's product **is** test wiring; its own regression check is that every previously-dead file now executes and passes inside the standard commands (Steps 1-3, 9).
- One-time trial table (advisor, 2026-11-16) is embedded in "Why this matters" — the executor's full run should reproduce it minus the fixed expectations.

## Done criteria

Machine-checkable. ALL must hold:

- [ ] `bun run --cwd tests test:server` exits 0 and its output shows all 26 route files + 6 pre-phase files executing (count the pass lines)
- [ ] `bun run --cwd tests test:unit` runs 10 files, exit 0
- [ ] `ls server/routes/*.test.js server/*.test.js server/logic/*.test.js | wc -l` = 32, and every listed file appears in `tests/scripts/run-server-tests.js` or `tests/package.json` `test:unit` (or both)
- [ ] `grep -rn "bun test server" . --include="*.md" --include="*.mjs" --exclude-dir=node_modules` returns nothing
- [ ] `tests/README.md` no longer exists; `docs/testing.md` referenced instead
- [ ] `grep -n "function computeTimers" tests/unit/timer.test.js client/src/hooks/useTimers.test.js` returns no matches (only the export in `useTimers.js` remains)
- [ ] `git status` shows changes only in the in-scope files

## STOP conditions

Stop and report back (do not improvise) if:

- `alphabetical-insert`, `courts`, `matches.integration`, or `players-queue` fails when run against the shared runner server (the advisor trial had them green on a standalone server — a shared-server failure means an isolation assumption this plan can't see; report the assertion).
- Aligning `metrics`/`stats` expectations requires changing anything other than asserted values/comments (e.g. the shipped behavior itself looks wrong — that's a bug report, not a test edit).
- The `computeTimers` extraction changes any e2e behavior (`bunx playwright test 33-pause-session.spec.js` from `tests/` should settle it; if it fails, STOP).
- `slate.test.js` fails on anything other than the ~line-523 case this plan realigns (Step 5b) — other failures mean an assumption this plan can't see; report the assertion.

## Maintenance notes

- New server test files are still invisible until registered — the done criterion's file-count check is the manual gate. If this bites again, add a completeness assertion to the runner (fail when a `server/**/*.test.js` file is in neither list).
- The five db-backed files now rely on the runner providing a temp `DB_PATH`; anyone running them bare (`bun server/routes/sse.state.test.js`) still opens the repo-root dev DB. If that ever worries you, a two-line guard at the top of `db.js` (`if (!process.env.DB_PATH && process.env.NODE_ENV !== "production") console.warn(...)`) is the cheap fix — deliberately not in this plan's scope.
- CI needs no workflow change: it already runs `test:server` and `test:unit`.
