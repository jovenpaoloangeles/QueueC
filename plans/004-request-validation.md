# Plan 004: Validate request bodies on the five unguarded endpoints

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md`.
>
> **Drift check (run first)**: `git diff --stat c00e826..HEAD -- server/routes/sessions.js server/routes/players.js server/routes/courts.js server/routes/matches.js server/routes/queue.js tests/scripts/run-server-tests.js`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P2
- **Effort**: M
- **Risk**: LOW (additive 400s; the shipped client already sends valid shapes — its forms constrain every field listed here)
- **Depends on**: plans/002-test-wiring.md (its runner-list pattern; the new test file registers the same way)
- **Category**: bug
- **Planned at**: commit `c00e826`, 2026-11-16

## Why this matters

Five endpoints trust their request bodies. Missing/typed-wrong fields turn into 500s (NOT NULL / CHECK constraint violations) instead of 400s — the v1.5 fix wave cleaned up check-in and match-end, but these drifted. Worse, two are *silent* corruption: `PATCH /courts/:id/extend` with a non-numeric `minutes` computes `MAX(expires_at, now) + NULL` → NULL, erasing the court's rental countdown mid-session with no error to anyone; the shuttles delta path NaNs into a NOT NULL violation. Session creation accepts `court_count: 100000` and seeds 100k court rows. Player create/update accepts any `skill_level` string until the CHECK constraint throws. The repo already has the right pattern (the v1.6 `fees` route) — this plan applies it five times.

## Current state

Files and their roles:

- `server/routes/sessions.js` — `POST /` creates a session (+ courts); `PATCH /:id/fees` is the **validation exemplar**.
- `server/routes/players.js` — `POST /` and `PATCH /:id` (skill passes through `normalizeSkill` unchecked).
- `server/routes/courts.js` — `PATCH /courts/:id/extend`.
- `server/routes/matches.js` — `PATCH /:id/shuttles` (deltas).
- `server/routes/queue.js` — `POST /sessions/:id/attendance` (`checked_in_at` stored raw).
- `tests/scripts/run-server-tests.js` — where the new test file registers.

Excerpts (as of `c00e826`):

The exemplar — `server/routes/sessions.js:193-198` (`PATCH /:id/fees`):

```js
  for (const [name, v] of [
    ["court_fee", court_fee],
    ["shuttle_price", shuttle_price],
  ]) {
    if (v !== undefined && (!Number.isInteger(v) || v < 0 || v > 1_000_000)) {
      return c.json({ error: `${name} must be a whole amount ≥ 0` }, 400);
    }
  }
```

`server/routes/sessions.js:38-58` — `POST /` validates `checkin_order`/`max_consecutive`/`rest_games` but nothing else; `name` binds NULL → NOT NULL violation → 500; `count` is unbounded:

```js
  } = await c.req.json().catch(() => ({}));
  if (checkin_order != null && !["alphabetical", "arrival"].includes(checkin_order)) { ... }
  const maxConsec = max_consecutive ?? 2;
  if (!Number.isInteger(maxConsec) || maxConsec < 1 || maxConsec > 5) { ... }
  ...
  const count = Array.isArray(courts) && courts.length > 0 ? courts.length : (court_count ?? 2);
```

`server/db.js:24-27` — `normalizeSkill` passes unknown values straight through (only maps the `advanced` alias), so a bad `skill_level` reaches the players CHECK constraint → 500. `SKILL_LEVELS` **is** exported (`server/db.js:13-22`, includes the `advanced` alias):

```js
export function normalizeSkill(skill) {
  if (skill === "advanced") return "expert";
  return skill;
}
```

`server/routes/courts.js:94-97` — NaN erases the timer (`MAX(expires_at, ?) + ?` with `mins * 60 = NaN` → NULL):

```js
  const mins = Number(b.minutes ?? 60);
  const now = Math.floor(Date.now() / 1000);
  db.prepare("UPDATE courts SET expires_at = MAX(expires_at, ?) + ? WHERE id = ?").run(now, mins * 60, id);
```

`server/routes/matches.js:246-250` — NaN → NULL → `new_shuttles NOT NULL` violation → 500:

```js
  db.prepare(
    "UPDATE matches SET new_shuttles = MAX(0, new_shuttles + ?), used_shuttles = MAX(0, used_shuttles + ?) WHERE id = ?",
  ).run(Number(b.delta_new ?? 0), Number(b.delta_used ?? 0), id);
```

`server/routes/queue.js:138-152` — attendance stores `checked_in_at` raw (any string poisons the fairness gap math downstream in `stats.js`):

```js
        "INSERT INTO queue_entries (session_id, player_id, checked_in_at, sort_order, virt_offset, status, status_updated_at) VALUES (?, ?, ?, ?, 0, 'left', ?)",
      )
      .run(id, player_id, checked_in_at ?? Math.floor(Date.now() / 1000), maxOrder + 1, session.ended_at);
```

Conventions: 400 + `{ error: "<lowercase message>" }` from the handler before any DB write (fees exemplar); guard tests live in route test files run through `tests/scripts/run-server-tests.js` (registered list, lines 47-69).

## Commands you will need

| Purpose | Command | Expected on success |
|-----------|--------------------------|---------------------|
| Server tests | `bun run --cwd tests test:server` | exit 0 (incl. new validation suite) |
| Lint | `bunx biome check` | exit 0 |
| Touched e2e (session create + courts + shuttles flows) | `cd tests && bunx playwright test 02-session-setup.spec.js 05-courts-setup.spec.js 25-court-expiry.spec.js 32-shuttles.spec.js` | all pass |

## Scope

**In scope** (the only files you should modify):
- `server/routes/sessions.js` (the `POST /` validation block only)
- `server/routes/players.js` (`POST /` and `PATCH /:id` skill check only)
- `server/routes/courts.js` (the extend route only)
- `server/routes/matches.js` (the shuttles route only)
- `server/routes/queue.js` (the attendance route only)
- `server/routes/validation.test.js` (create)
- `tests/scripts/run-server-tests.js` (append one line)

**Out of scope** (do NOT touch):
- The `courts[]` array items in session create (label/duration/active_from…) — `Number()` → NULL there is benign (null means "no timer") and the client's form constrains it; not part of the finding.
- `server/db.js` (e.g. making `normalizeSkill` throw) — validate at the route, keep the db layer permissive for presets, which already have their own `isValidSkill` skip logic.
- Plan 001's guard additions (different lines, same files) — if 001 hasn't landed, your diff must not touch its excerpt regions.

## Git workflow

- Branch: `advisor/004-request-validation`
- Commit per step; message style: `fix(server): <what> — <why>` (see `1dc5704`).
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Session creation validates name, court count, and timestamps

In `server/routes/sessions.js` `POST /`, immediately after the body destructure (before the `checkin_order` guard), add — following the fees pattern:

```js
  if (typeof name !== "string" || !name.trim()) {
    return c.json({ error: "Name is required" }, 400);
  }
  const count = Array.isArray(courts) && courts.length > 0 ? courts.length : (court_count ?? 2);
  if (!Number.isInteger(count) || count < 1 || count > 16) {
    return c.json({ error: "court_count must be an integer 1–16" }, 400);
  }
  for (const [n, v] of [
    ["scheduled_start", scheduled_start],
    ["scheduled_end", scheduled_end],
  ]) {
    if (v !== undefined && !Number.isInteger(v)) {
      return c.json({ error: `${n} must be epoch seconds` }, 400);
    }
  }
```

(Keep the existing `count` line — replace it with the validated one above so the same expression isn't computed twice.)

**Verify**: `bun run --cwd tests test:server` → all existing suites pass (they POST sessions with integer timestamps and small court counts).

### Step 2: Skill level must be a known tier

In `server/routes/players.js`:
- `POST /`: after `const skill_level = normalizeSkill(...)`, add `if (!SKILL_LEVELS.includes(skill_level)) return c.json({ error: \`skill_level must be one of: ${SKILL_LEVELS.join(", ")}\` }, 400);`
- `PATCH /:id`: same check on `nextSkill` when `body.skill_level !== undefined` (place after `nextSkill` is computed, before the collision query).
- Import `SKILL_LEVELS` alongside the existing `normalizeSkill` import from `../db.js` (`server/routes/players.js:2`).

**Verify**: `bun run --cwd tests test:server` → pass (existing player tests use valid tiers; `advanced` stays accepted via the alias).

### Step 3: Court extend and shuttle deltas reject non-integers

- `server/routes/courts.js` extend route: after `const mins = Number(b.minutes ?? 60);` add:

```js
  if (!Number.isInteger(mins) || mins < 1 || mins > 240) {
    return c.json({ error: "minutes must be a whole number 1–240" }, 400);
  }
```

- `server/routes/matches.js` shuttles route: before the UPDATE, add:

```js
  if (!Number.isInteger(b.delta_new ?? 0) || !Number.isInteger(b.delta_used ?? 0)) {
    return c.json({ error: "delta_new and delta_used must be integers" }, 400);
  }
```

  (then drop the `Number()` coercions in the `.run(...)` call — bind `b.delta_new ?? 0` directly; negatives remain allowed, the SQL clamps at 0.)

**Verify**: `bun run --cwd tests test:server` → pass (`shuttles.test.js` sends integer deltas; `metrics.test.js` too).

### Step 4: Attendance timestamps are epoch integers

In `server/routes/queue.js` `POST /sessions/:id/attendance`, after the player check:

```js
  if (checked_in_at !== undefined && !Number.isInteger(checked_in_at)) {
    return c.json({ error: "checked_in_at must be epoch seconds" }, 400);
  }
```

**Verify**: `bun run --cwd tests test:server` → pass (`attendance.test.js` sends integers or omits the field).

### Step 5: Regression suite

Create `server/routes/validation.test.js` modeled structurally on `server/routes/v15-guards.test.js` (same `api()` helper + session bootstrap; plain `node:assert/strict`, top-level `run()`). One case per rule (all expect **400** + the exact error string): missing `name`; `court_count: 100000` and `court_count: 0`; `scheduled_start: "2026-11-16"` (string); `POST /players` with `skill_level: "champion"`; `PATCH /players/:id` with the same; extend with `minutes: "1hr"` — and one **assertion that the timer survived**: fetch the court after the 400 and expect `expires_at` unchanged (this pins the silent-corruption fix); shuttles with `delta_new: "one"` on an active match; attendance with `checked_in_at: "yesterday"`. Plus one happy-path control per endpoint (valid bodies → 2xx, unchanged behavior).

Register the file in `tests/scripts/run-server-tests.js` (append after `"server/routes/validation.test.js"`'s natural place near the other v-files at the end of the list).

**Verify**: `bun run --cwd tests test:server` → all pass including the new suite.

## Test plan

- New suite `server/routes/validation.test.js`: the ~12 cases enumerated in Step 5; structural pattern from `v15-guards.test.js`.
- Existing suites are the no-regression net (they exercise every one of these endpoints with valid bodies); e2e spot-check listed in Commands.

## Done criteria

Machine-checkable. ALL must hold:

- [ ] `bun run --cwd tests test:server` exits 0 with `validation.test.js` in the runner output
- [ ] `curl`-level spot checks via the runner's throwaway server OR the new suite prove: bad extend → 400 with `expires_at` unchanged; bad shuttles delta → 400 (not 500); bad skill → 400
- [ ] `grep -n "Number(b.delta" server/routes/matches.js` returns no matches
- [ ] `cd tests && bunx playwright test 02-session-setup.spec.js 05-courts-setup.spec.js 25-court-expiry.spec.js 32-shuttles.spec.js` passes
- [ ] `bunx biome check` exits 0
- [ ] `git status` shows changes only in the in-scope files

## STOP conditions

Stop and report back (do not improvise) if:

- Any excerpt doesn't match the live code (drift — especially if plan 001 already edited these files; re-anchor line numbers but keep the two changesets disjoint).
- An existing test sends a body this plan now rejects (e.g. a float `scheduled_start`): report the file + value — do not loosen the guard silently; either the test is stale (fix the test with justification) or the client really sends that shape (escalate).
- The client (`client/src/api.js` callers) sends any shape these guards reject — grep the call sites before assuming; `SetupScreen.jsx`, court extend UI, and the shuttle stepper are the places to check.

## Maintenance notes

- The bound choices (court 1–16, minutes 1–240) are product decisions encoded in code; if a real venue needs more courts or longer extends, bump the constant — they're not load-bearing invariants.
- `PATCH /queue/:id/status` and match-end validation were fixed in v1.5 — this plan completes the sweep; new routes should start with the fees-pattern block.
- If a future client feature sends float timestamps (JS `Date.now()/1000` unrounded), the `Number.isInteger` checks will catch it — that's the point; round at the call site.
