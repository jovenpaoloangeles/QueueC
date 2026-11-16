# Plan 005: Stop the sessions table rebuild from dropping the v1.2 rotation columns

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md`.
>
> **Drift check (run first)**: `git diff --stat c00e826..HEAD -- server/db.js server/schema.test.js`
> If either file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P2
- **Effort**: S
- **Risk**: MED (migration code; mitigated by the parity test this plan adds and by the fact that the moved block is a no-op on every post-v1.0 database)
- **Depends on**: none (plan 002 registers `schema.test.js` into CI, but this plan's test runs standalone too — `bun server/schema.test.js` with a temp `DB_PATH`)
- **Category**: bug
- **Planned at**: commit `c00e826`, 2026-11-16

## Why this matters

`server/db.js` runs its migrations in file order. The v1.2 block (line ~134) conditionally adds `max_consecutive` and `rest_games` to `sessions`. Later (line ~272), the `started_at` table-rebuild recreates `sessions` from a 7-column `sessions_new` — **without those two columns** — for any database where `started_at` is still `NOT NULL` (i.e. created before the drafts feature relaxed it, pre-first-release). Nothing re-adds them afterward (the v1.2 check already ran), so `POST /api/sessions`, which inserts both columns, 500s with `no such column` forever. Reachability is narrow — every v1.0+ DB has nullable `started_at`, so the rebuild never fires — but the repo-root dev database is itself a partially-migrated DB, and the trap silently re-arms every time a future column is added above the rebuild. The fix is to run the rebuild _before_ the conditional ALTERs, so whatever it drops gets re-added by the checks that follow.

(The sibling hazard — the `queue_entries` 'staged' rebuild dropping `paid`/`virt_offset`/`rested_seconds`/`rest_started_at` — is already handled: the block at db.js:324-343 re-adds all four, with a comment acknowledging the old data was vestigial. This plan's reorder makes that pattern universal.)

## Current state

- `server/db.js` — boot-time schema creation (`CREATE TABLE IF NOT EXISTS`, ~lines 10-120) followed by the migration chain in file order.
- `server/schema.test.js` — plain assert script over `PRAGMA table_info` (currently asserts `matches` columns; the file to extend).

Excerpts (as of `c00e826`):

`server/db.js:134-146` — the v1.2 conditional ALTERs (run **before** the rebuild):

```js
// v1.2: per-session rotation settings (max_consecutive, rest_games)
const sessionRotationCols = new Set(
  db
    .prepare("PRAGMA table_info(sessions)")
    .all()
    .map((c) => c.name),
);
if (!sessionRotationCols.has("max_consecutive")) {
  db.exec("ALTER TABLE sessions ADD COLUMN max_consecutive INTEGER NOT NULL DEFAULT 2");
}
if (!sessionRotationCols.has("rest_games")) {
  db.exec("ALTER TABLE sessions ADD COLUMN rest_games INTEGER NOT NULL DEFAULT 0");
}
```

`server/db.js:270-297` — the rebuild, further down the file. Its `sessions_new` carries only the seven original columns, so it drops whatever the v1.2 block just added (and would drop `checkin_order`/`court_fee`/etc. too, except those blocks sit _after_ it and re-add conditionally — which is exactly why the v1.2 block must move below it):

```js
const startedAt = db
  .prepare("PRAGMA table_info(sessions)")
  .all()
  .find((c) => c.name === "started_at");
if (startedAt?.notnull === 1) {
  db.exec("PRAGMA foreign_keys = OFF");
  db.transaction(() =>
    db.exec(`
    CREATE TABLE sessions_new (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      scheduled_start INTEGER NOT NULL,
      scheduled_end INTEGER NOT NULL,
      court_count INTEGER NOT NULL DEFAULT 2,
      started_at INTEGER,
      ended_at INTEGER
    );
    INSERT INTO sessions_new (id, name, scheduled_start, scheduled_end, court_count, started_at, ended_at)
      SELECT id, name, scheduled_start, scheduled_end, court_count, started_at, ended_at FROM sessions;
    DROP TABLE sessions;
    ALTER TABLE sessions_new RENAME TO sessions;
  `),
  )();
  db.exec("PRAGMA foreign_keys = ON");
}
```

Between these two blocks (lines ~148-269) the file touches only `queue_entries`, `matches`, and `courts` — nothing reads or writes `sessions` — so the move below is order-safe.

Reference for the fixture test — the original schema is in git history:

```bash
git show 2545790:server/db.js | sed -n '10,60p'
```

That commit ("feat: database schema with WAL + FK enforcement") creates `players`, `sessions` (with `started_at INTEGER NOT NULL`), `queue_entries`, and `matches` — no `courts` table (added later; db.js's `CREATE TABLE IF NOT EXISTS` block creates it on old DBs before the migrations run).

Conventions: migrations are top-level `if` blocks executed at import time; conditional ALTERs are preferred over rebuilds; tests are plain assert scripts (`bun <file>`), self-bootstrapped.

## Commands you will need

| Purpose                | Command                                                                                                        | Expected on success |
| ---------------------- | -------------------------------------------------------------------------------------------------------------- | ------------------- |
| Schema test standalone | `DB_PATH=$(mktemp -u /tmp/qc.XXXX.db) PLAYERS_PATH=$PWD/tests/fixtures/players.json bun server/schema.test.js` | exit 0, pass lines  |
| Full server tests      | `bun run --cwd tests test:server`                                                                              | exit 0              |
| Fresh-DB sanity        | `DB_PATH=$(mktemp -u /tmp/qc.XXXX.db) PLAYERS_PATH=$PWD/tests/fixtures/players.json bun server/db.test.js`     | exit 0              |

## Scope

**In scope** (the only files you should modify):
- `server/db.js` (move one block; no logic changes)
- `server/schema.test.js` (add the parity test)
- `server/db.migration.test.js` (create — only if Step 2's static-import wrinkle forces the separate file; register it in `tests/scripts/run-server-tests.js` if created after plan 002 landed)

**Out of scope** (do NOT touch):
- The `queue_entries` 'staged' rebuild and its re-add block — already correct.
- Any `CREATE TABLE IF NOT EXISTS` definition, any other migration block, `server/routes/*`.

## Git workflow

- Branch: `advisor/005-migration-column-drop`
- One commit is fine; message style: `fix(db): sessions rebuild runs before conditional ALTERs so v1.2 columns survive (migration parity test)`.
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Move the rebuild above the v1.2 block

Cut the entire `started_at` rebuild block (from its `// ponytail: rebuild sessions to relax started_at` comment through the closing `db.exec("PRAGMA foreign_keys = ON");` — excerpt above, currently ~lines 270-297) and paste it **immediately before** the `// v1.2: per-session rotation settings` comment (~line 134). Change nothing inside the block. Add one line to its comment: "runs before the conditional column ALTERs so anything it drops is re-added below".

**Verify**: `DB_PATH=$(mktemp -u /tmp/qc.XXXX.db) PLAYERS_PATH=$PWD/tests/fixtures/players.json bun server/db.test.js && bun server/schema.test.js` (same env pattern) → both pass on a fresh DB (proves the move is a no-op where the rebuild doesn't fire).

### Step 2: Migration-parity regression test

Append to `server/schema.test.js` a self-contained block that:

1. Creates a **pre-release fixture DB** at a fresh temp path using `new Database(path)` from `bun:sqlite` (import it locally; close and dispose the handle before step 2): create the four original tables by copying their `CREATE TABLE` statements verbatim from `git show 2545790:server/db.js` (lines ~12-50; keep `started_at INTEGER NOT NULL` in `sessions` exactly as written there; no `courts` table, no rotation/checkin/fee columns). Insert one row into `sessions` and one into `players` so the rebuild's `INSERT ... SELECT` has data to carry.
2. Sets `process.env.DB_PATH` and `process.env.PLAYERS_PATH` (fixture players) **then** dynamically imports the module under test — order matters, db.js reads env at import: `const db = (await import("./db.js")).default;` (schema.test.js currently imports db at the top; keep that import for the existing assertions on the runner-provided DB, and use a **dynamic import after env setup** inside a separate `bun.spawnSync`? — no: schema.test.js is itself the process. Instead, structure the new block as its own section at the bottom guarded so the dynamic import happens after env is set. If the top-level static import makes this impossible in one file, put the new test in `server/db.migration.test.js` instead (same spawn pattern as Step 2 of plan 002) — either file is in scope-equivalent territory; prefer the new file if the static import forces it.)
3. Asserts parity: the column-name set of `PRAGMA table_info(sessions)` on the migrated fixture equals the set on a fresh temp DB (boot db.js a second time against another fresh temp path in a `Bun.spawnSync` subprocess, or simpler — compare against a hardcoded expected list you derive once and pin: `id, name, scheduled_start, scheduled_end, court_count, started_at, ended_at, max_consecutive, rest_games, checkin_order, court_fee, shuttle_price, fee_split, manual_shuttles_new, manual_shuttles_used` — **verify the exact tail against the live `CREATE TABLE sessions` block in db.js before hardcoding**; any column the live schema has must appear).
4. Also asserts the carried row survived: the fixture session's `name` is still present.

**Verify**: `bun <the file>` with temp `DB_PATH` env → pass; then `bun run --cwd tests test:server` → all pass (plan 002 wires schema tests into the runner's pre-phase; if 002 hasn't landed yet, run standalone per the Commands table).

## Test plan

- The parity test in Step 2 is the regression test: it fails on master's ordering (the fixture's `sessions` ends without `max_consecutive`/`rest_games`) and passes after the move. Run it against the pre-fix code once to confirm it fails for the right reason (`assert` message names the missing column).
- `db.test.js` + full `test:server` cover the fresh-DB and route-level paths.

## Done criteria

Machine-checkable. ALL must hold:

- [ ] `grep -n "ponytail: rebuild sessions" server/db.js` shows the block **above** the `v1.2: per-session rotation settings` comment (line number of the former < line number of the latter)
- [ ] The parity test passes with temp-`DB_PATH` env; `bun run --cwd tests test:server` exits 0
- [ ] `git diff server/db.js` shows exactly one block moved (no edits inside it beyond the added comment line) — verify with `git diff -M server/db.js`
- [ ] `git status` shows changes only in the in-scope files

## STOP conditions

Stop and report back (do not improvise) if:

- Moving the block changes behavior on a **fresh** DB (any test breaks) — the rebuild must be unreachable there.
- The original-schema fixture from `git show 2545790:server/db.js` doesn't produce a DB the current migrations can process (e.g. a NOT NULL column with no default fails the rebuild's `INSERT ... SELECT`) — report the exact sqlite error; do not "fix" the historical schema beyond what's needed to reproduce the pre-release shape.
- The live `CREATE TABLE sessions` block has columns beyond the pinned list in Step 2.3 that the migration chain doesn't re-add after a rebuild — that's a second instance of the same bug; report it rather than expanding this plan.

## Maintenance notes

- Rule going forward (worth a comment near the moved block if not already implied): **table rebuilds go before conditional ALTERs, or must include every current column**. Any new `sessions` column added by a future version is automatically safe under this ordering.
- The `queue_entries` rebuild still wipes `paid`/`virt_offset`/`rest_started_at`/`rested_seconds` _values_ on pre-'staged' databases (columns re-added at defaults). That data is gone regardless of ordering — accepted per the existing comment; not this plan's problem.
- If the app ever ships a real migration framework (numbered migrations), this whole class disappears; until then the parity test is the guard.
