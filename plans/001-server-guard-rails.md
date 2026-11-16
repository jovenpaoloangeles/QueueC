# Plan 001: Close the server guard-rail gaps (court occupancy, staged→waiting, ended sessions, CORS)

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md`.
>
> **Drift check (run first)**: `git diff --stat c00e826..HEAD -- server/routes/matches.js server/routes/queue.js server/routes/slate.js server/routes/automatch.js server/index.js server/routes/v15-guards.test.js`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: S
- **Risk**: LOW (additive 404/409 guards + one deleted middleware; no behavior change on valid requests)
- **Depends on**: none
- **Category**: bug | security
- **Planned at**: commit `c00e826`, 2026-11-16

## Why this matters

Three of the four code paths that put players on a court validate preconditions; the fourth (direct `POST /api/matches`) doesn't check whether the court is already occupied, so two tabs can create two concurrent live matches on one court — and match-end auto-promotion can then stack a third. Separately, the queue-status whitelist added in v1.5 misses one transition (`staged → waiting`), letting a slated entry be re-slated elsewhere and leaving a stuck slate. Sessions that have ended still accept check-ins, slates, match starts, and automatch plans (ghost data invisible to the SSE broadcast, which only shows the latest unended session). And `cors()` reflects any origin on every mutating route — distinct from the deliberately parked "no auth" decision (ROADMAP.md "Parked"); this is request-authenticity hygiene, and the SPA is same-origin in both dev (Vite proxies `/api`, `client/vite.config.js` `server.proxy`) and prod (server serves the built client itself), so the middleware serves nobody.

## Current state

Files and their roles (all paths repo-relative):

- `server/routes/matches.js` — direct match start (`POST /`), end/auto-promotion (`PATCH /:id/end`), abort, shuttles.
- `server/routes/slate.js` — slate create (`POST /matches/slate`), slate start (`startSlateOnCourt`).
- `server/routes/automatch.js` — Smart Match dry-run/plan.
- `server/routes/queue.js` — check-in (`checkinPlayer`), status transitions (`PATCH /queue/:id/status`).
- `server/index.js` — Hono app wiring.
- `server/routes/v15-guards.test.js` — registered guard-regression suite (the pattern to extend).

Excerpts (as of `c00e826`):

`server/routes/matches.js:47-58` — the court precondition block in `POST /`. Note it checks enabled/open/expired/reservation but **not occupancy**:

```js
  const court = db
    .prepare("SELECT * FROM courts WHERE id = ? AND session_id = ?")
    .get(court_number, session_id);
  if (court) {
    if (!court.enabled) return c.json({ error: "Court is disabled" }, 400);
    if (court.active_from != null && now < court.active_from)
      return c.json({ error: "Court is not open yet" }, 400);
    if (court.expires_at != null && now >= court.expires_at)
      return c.json({ error: "Court has expired" }, 400);
    if (court.active_until != null && now >= court.active_until)
      return c.json({ error: "Court reservation has ended" }, 400);
  }
```

`server/routes/matches.js:41-44` — session guards in the same route (no `ended_at` check):

```js
  const session = db.prepare("SELECT * FROM sessions WHERE id = ?").get(session_id);
  if (!session) return c.json({ error: "Session not found" }, 404);
  if (session.started_at == null) return c.json({ error: "Session not started" }, 400);
  if (session.paused_at != null) return c.json({ error: "Session is paused" }, 409);
```

`server/routes/slate.js:152-163` — the occupancy query that `POST /api/matches` is missing (copy this shape):

```js
  const occupied = db
    .prepare(
      "SELECT id FROM matches WHERE session_id = ? AND state = 'active' AND ended_at IS NULL AND court_number = ?",
    )
    .get(m.session_id, court.id);
  const courtFree =
    court.enabled === 1 && ... && !occupied;
  if (!courtFree) return c.json({ error: "Court is not free" }, 409);
```

`server/routes/matches.js:186-191` — end-of-match promotion checks `usable` (enabled/open/expired) but not occupancy of the freed court (belt-and-braces once POST is fixed; a court can only be occupied here if a double-booking already happened):

```js
    const freed = match.court_number;
    const court = db.prepare("SELECT * FROM courts WHERE id = ?").get(freed);
    const usable =
      court?.enabled && (court.active_from == null || now >= court.active_from) && ...
```

`server/routes/queue.js:196-204` — the v1.5 status whitelist. It blocks `left`/`resting` transitions out of `playing`/`staged` and `playing → waiting`, but **`staged → waiting` passes all guards**:

```js
  if (status === "left" && (cur.status === "playing" || cur.status === "staged")) { ... 409 }
  if (status === "resting" && cur.status === "playing") { ... 409 }
  if (status === "resting" && cur.status === "staged") { ... 409 }
  if (cur.status === "playing" && status === "waiting") {
    return c.json({ error: "Player must finish the match first" }, 409);
  }
```

`server/routes/queue.js:43-47` — `checkinPlayer` verifies the player but never the session (a nonexistent `session_id` later hits the INSERT and dies on the FK constraint as a bare 500):

```js
export function checkinPlayer(sessionId, playerId, when = Math.floor(Date.now() / 1000)) {
  // a stale tab can hold a player the end-of-session pool reset deleted
  if (!db.prepare("SELECT id FROM players WHERE id = ?").get(playerId)) {
    return { error: "Player not found", status: 404 };
  }
```

`server/routes/slate.js:9-11` and `server/routes/automatch.js:14-16` — both guard `!s` (404) and `started_at == null` (400) but not `ended_at`:

```js
  const s = db.prepare("SELECT * FROM sessions WHERE id = ?").get(b.session_id);
  if (!s) return c.json({ error: "Session not found" }, 404);
  if (s.started_at == null) return c.json({ error: "Session not started" }, 400);
```

`server/index.js:5,18` — the middleware to delete:

```js
import { cors } from "hono/cors";
...
app.use("*", cors());
```

Conventions to match: guards return `c.json({ error: "..." }, 4xx)` with short lowercase messages; slate/automatch use `s.ended_at`; regression tests live in versioned `server/routes/v*-guards.test.js` files run through `tests/scripts/run-server-tests.js` (registered list at `tests/scripts/run-server-tests.js:47-69` — `v15-guards.test.js` is in it).

## Commands you will need

| Purpose | Command | Expected on success |
|-----------|--------------------------|---------------------|
| Lint | `bunx biome check` | exit 0 |
| Server tests | `bun run --cwd tests test:server` | all pass |
| Unit tests | `bun run --cwd tests test:unit` | all pass |
| Slate suite standalone (verifies the staged→waiting fix) | `BASE_URL=http://localhost:3991/api bun server/routes/slate.test.js` **while the runner's server is up is impractical — instead see Step 6** | see Step 6 |
| Client build (CORS change touches server only — build is a cheap sanity net) | `bun run --cwd client build` | exit 0 |

Note: `bun run --cwd tests test:server` boots its own throwaway server on :3991 with a temp DB (`tests/scripts/run-server-tests.js:19-31`) — safe to run any time; it never touches :3001.

## Scope

**In scope** (the only files you should modify):
- `server/routes/matches.js`
- `server/routes/queue.js`
- `server/routes/slate.js`
- `server/routes/automatch.js`
- `server/index.js`
- `server/routes/v15-guards.test.js` (extend)

**Out of scope** (do NOT touch):
- `server/routes/sessions.js` — end-session flow already guards what it needs.
- `server/routes/sse.js`, `server/logic/*` — no changes needed for these findings.
- The parked auth/multi-session work (ROADMAP.md "Parked") — this plan adds no auth.
- Request-body validation — that is plan 004 (`plans/004-request-validation.md`), a separate dispatch.

## Git workflow

- Branch: `advisor/001-server-guard-rails`
- Commit per step; message style matches `git log`: `fix(server): <what> — <why>` (see `1dc5704`, `4ebafd6`).
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Occupancy check on direct match start

In `server/routes/matches.js` `POST /`, immediately after the existing court precondition block (`if (court) { ... }` around line 58), add — using the exact query shape from `slate.js:153-156`:

```js
  const occupied = db
    .prepare(
      "SELECT id FROM matches WHERE session_id = ? AND state = 'active' AND ended_at IS NULL AND court_number = ?",
    )
    .get(session_id, court.id);
  if (court && occupied) return c.json({ error: "Court is not free" }, 409);
```

Note: `court_number` in matches equals `courts.id` (see the `.get(court_number, session_id)` lookup above). The UI already has a "Court is not free" error path (used by slate start), so no client change.

**Verify**: `bun run --cwd tests test:server` → all pass (no registered test starts a second match on an occupied court).

### Step 2: `staged → waiting` is rejected

In `server/routes/queue.js` `PATCH /queue/:id/status`, directly under the `playing → waiting` guard (line ~204), add:

```js
  if (cur.status === "staged" && status === "waiting") {
    return c.json({ error: "Player is drafted into a slated match — cancel or edit the slate first" }, 409);
  }
```

This is the exact gap pinned by `server/routes/slate.test.js:523` ("Expected 409 when a lineup player is no longer staged").

**Verify**: see Step 6 (slate suite).

### Step 3: Check-in verifies the session exists and isn't ended

In `server/routes/queue.js` `checkinPlayer` (line 43), after the player check, add:

```js
  const session = db.prepare("SELECT ended_at FROM sessions WHERE id = ?").get(sessionId);
  if (!session) return { error: "Session not found", status: 404 };
  if (session.ended_at != null) return { error: "Session already ended", status: 409 };
```

The existing `const ended = ...` line further down can now reuse this fetch — replace its duplicate query with `session.ended_at != null` (keep behavior identical).

**Verify**: `bun run --cwd tests test:server` → all pass. (`attendance.test.js` covers the ended-session back-fill path, which routes through `POST /sessions/:id/attendance`, not `checkinPlayer` — it must stay green.)

### Step 4: Ended sessions reject match starts, slates, and automatch plans

Add one guard line next to each existing `started_at` guard:

- `server/routes/matches.js` `POST /` (after the paused check, line ~44):
  `if (session.ended_at != null) return c.json({ error: "Session already ended" }, 409);`
- `server/routes/slate.js` `POST /matches/slate` (after the started check, line ~11):
  `if (s.ended_at != null) return c.json({ error: "Session already ended" }, 409);`
- `server/routes/slate.js` `startSlateOnCourt` — it fetches the slated match `m`; add a session fetch + the same guard before the occupancy check (the route already has `m.session_id`).
- `server/routes/automatch.js` `POST /sessions/:id/automatch` (after the started check, line ~16):
  `if (s.ended_at != null) return c.json({ error: "Session already ended" }, 409);`

**Verify**: `bun run --cwd tests test:server` → all pass.

### Step 5: Drop the open CORS middleware

In `server/index.js`: delete line 5 (`import { cors } from "hono/cors";`) and line 18 (`app.use("*", cors());`). Nothing else changes — dev is same-origin through the Vite proxy (`client/vite.config.js` → `server.proxy["/api"]`), prod is served by this same server.

**Verify**: `bun run --cwd tests test:server` → all pass (the runner's tests are plain `fetch`, unaffected by CORS, which is browser-only).

### Step 6: Regression tests

Extend `server/routes/v15-guards.test.js` with a new describe-style block (follow the file's existing structure — same `api()` helper, same session bootstrap). Cases:

1. Start a match on a court, then `POST /api/matches` for the same court with 4 other waiting entries → **409** `Court is not free`.
2. `PATCH /queue/:id/status` with `{status:"waiting"}` on a `staged` entry → **409**.
3. `POST /api/sessions/:badid/checkin` with a valid player and nonexistent session id → **404** `Session not found`.
4. End the session, then `POST /api/matches` → **409** `Session already ended`; `POST /api/matches/slate` → 409; `POST /api/sessions/:id/automatch` → 409.

Then confirm the previously-failing slate pin is green: `server/routes/slate.test.js:523` asserts the 409 from Step 2. That file is not yet registered in the runner (plan 002 wires it); verify it standalone by mimicking the runner: in one shell start a throwaway server (`DB_PATH=$(mktemp -u /tmp/qc.XXXX.db) PLAYERS_PATH=$PWD/tests/fixtures/players.json PORT=3991 NODE_ENV=test bun server/index.js &`), wait for `curl -sf http://localhost:3991/api/sessions/active`, then `BASE_URL=http://localhost:3991/api bun server/routes/slate.test.js`; kill the server and delete the temp DB after. **Expected: exit 0** (this exact run failed at line 523 on master before Step 2 — that failure turning green is the proof the fix works).

**Verify**: `bun run --cwd tests test:server` → all pass including the new block.

## Test plan

- New cases enumerated in Step 6 (occupancy, staged→waiting, session 404, ended-session 409s), modeled after the existing blocks in `server/routes/v15-guards.test.js`.
- Full-suite gate: `bun run --cwd tests test:server` → exit 0.
- E2E spot-check that the client still starts matches normally: `cd tests && bunx playwright test 07-match-start.spec.js 28-on-deck.spec.js` → pass (guards must not fire on valid flows).

## Done criteria

Machine-checkable. ALL must hold:

- [ ] `bun run --cwd tests test:server` exits 0 with the four new guard cases present in `v15-guards.test.js`
- [ ] `bun server/routes/slate.test.js` (with throwaway server per Step 6) exits 0 — line ~523 assertion passes
- [ ] `bunx playwright test 07-match-start.spec.js 28-on-deck.spec.js` (from `tests/`) passes
- [ ] `grep -n "cors" server/index.js` returns no matches
- [ ] `git status` shows changes only in the in-scope files
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- The excerpts above don't match the live code (drift).
- `v15-guards.test.js` or the slate standalone run still fails after Step 2 (means the staged→waiting path is reachable another way — report the response body you got).
- Any registered server test fails for a reason other than the new guards intentionally rejecting a request a test relied on (if a test relied on double-booking or ended-session writes, report which one — do not weaken the guard to make it pass).
- Removing `cors()` breaks any e2e spec (would mean a cross-origin call exists that this plan missed).

## Maintenance notes

- The occupancy predicate now exists in `matches.js` (new) and `slate.js` — if a third copy appears, extract a helper; two inline copies of one SQL string is below the repo's duplication threshold.
- `GET /api/sse` needs no CORS for the EventSource in prod (same-origin) — but if a future "display screen on another origin" feature lands (see ROADMAP "deck view"), revisit CORS deliberately at that point, scoped to GET routes.
- Plan 002 registers `slate.test.js` into CI; until then this plan's Step 6 standalone run is the only automated check of that assertion.
