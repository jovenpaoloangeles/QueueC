# Plan 008: On Deck refills itself after each auto-promotion, and ↻ Rerun re-plans it

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**:
> `git diff --stat 81f2bd2..HEAD -- server/routes/automatch.js server/routes/matches.js server/routes/automatch.test.js server/routes/slate.test.js client/src/components/OnDeckStrip.jsx client/src/api.js tests/e2e/28-on-deck.spec.js README.md docs/architecture.md docs/todo.md CHANGELOG.md`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition. This plan executes on a tree that
> already contains plans 007 and 009 (branch tip `81f2bd2`): 007 added
> `match_ids` to the automatch response and the toast `duration` option (both
> used below), 009 raised the `excluded` cap to 4 — all reflected in the excerpts.

## Status

- **Priority**: P1
- **Effort**: M
- **Risk**: MED (a server behaviour change that moves some existing test expectations; the planner code is re-homed, not changed)
- **Depends on**: plans/007-smart-match-one-click.md and plans/009-smart-add-repick.md (both already on branch `worktree-agent-afe675af5aeae3ed0`; this plan re-homes the same route file)
- **Category**: dx
- **Planned at**: commit `81f2bd2` (branch `worktree-agent-afe675af5aeae3ed0`, 13 commits after `249a874`), 2026-11-26 — re-based from `249a874` after plans 007 and 009 landed

## Why this matters

When a game ends, the server already moves the top On Deck lineup onto the freed court. But nothing puts a new lineup at the back of the deck. Over a 40-game session the queue master (QM) pressed Smart Match about fourteen times purely to keep the deck from running empty — and if it did run empty, the next court sat idle until someone noticed.

After this plan:

1. **The deck refills itself.** Every time a lineup is auto-promoted to a court, the server plans replacements up to the deck cap (3 lineups) in the same transaction. The QM never tops the deck up by hand again.
2. **↻ Rerun** (On Deck header) is the manual escape hatch, per the maintainer: _"I can refresh/rerun the deck if I don't want the matches."_ One click throws the deck away and re-plans it so that **none of the old pairings survives**. The toast's Undo re-creates the old lineups.

Two deliberate boundaries, both requested or implied by the maintainer on 2026-11-26:

- **Cancelling a lineup (✕) does not refill.** A QM who just removed a lineup on purpose must not watch it re-planned. Neither does **▶ Start now** — only auto-promotion refills. (This also keeps the common e2e seeding helper, which uses ▶ Start now, behaviour-identical.)
- **There is no on/off setting.** The maintainer asked for the deck to refill itself, unconditionally. Marked in code with a `ponytail:` note naming the upgrade path (a per-session setting) in case a QM who builds lineups by hand ever needs the old behaviour.

## Current state

Where things live:

- `server/routes/automatch.js` — the Smart Match route. Three closures inside the handler (`freeCourts`, `getWaiting`, `computePlan`) and one write transaction (court matches + deck lineups). Nothing outside this file can plan a lineup today.
- `server/routes/matches.js` — `PATCH /matches/:id/end`. Its transaction ends with the auto-promotion block that moves the top deck lineup onto the freed court.
- `server/logic/smartQueue.js` — the matcher (`planBatch`). It already accepts `bans` (hard no-partner pairs) — plumbed, tested once, never used by a route.
- `server/routes/slate.test.js` — API-level test of slating and auto-promotion (step 8 pins the deck state after a promotion).
- `server/routes/automatch.test.js` — API-level test of the automatch route; has `mkSession` / `snap` helpers this plan reuses.
- `client/src/components/OnDeckStrip.jsx` — the deck strip; calls `slateMatch` / `cancelSlate` directly from `client/src/api.js`.
- `tests/e2e/28-on-deck.spec.js` — the deck's browser spec (28.6 is the auto-promotion test).

Excerpts (as of `81f2bd2`):

`server/routes/automatch.js:51-76` — two of the closures (they capture `id` and `now` from the handler):

```js
  const freeCourts = () =>
    db
      .prepare(`
    SELECT * FROM courts
    WHERE session_id = ? AND enabled = 1
      AND (active_from IS NULL OR active_from <= ?)
      AND (expires_at IS NULL OR expires_at > ?)
      AND (active_until IS NULL OR active_until > ?)
      AND id NOT IN (
        SELECT court_number FROM matches
        WHERE session_id = ? AND state = 'active' AND ended_at IS NULL AND court_number IS NOT NULL
    )
    ORDER BY id
  `)
      .all(id, now, now, now, id);

  const getWaiting = () =>
    db
      .prepare(`
    SELECT qe.*, p.skill_level
    FROM queue_entries qe
    JOIN players p ON p.id = qe.player_id
    WHERE qe.session_id = ? AND qe.status = 'waiting'
    ORDER BY qe.sort_order, qe.checked_in_at, qe.id
  `)
      .all(id);

  // Pure planner: same rules for dry-run and the real run (no writes).
  // One ε-lexicographic batch over courts + slate slots (§5): quartets are
  // picked jointly, not greedily court-by-court.
  function computePlan(locked = [], excluded = []) {
    // v1.7: learned ratings (μ + tonight's form) replace static tiers in the matcher
    const ratings = loadRatings(db, Number(id));
```

`server/routes/automatch.js:99-105` and `:120-128` — inside `computePlan`; note it closes over `slateOnly` and the session row `s`:

```js
const courts = slateOnly ? [] : freeCourts();
const existing = db
  .prepare("SELECT COUNT(*) AS n FROM matches WHERE session_id = ? AND state = 'slated' AND ended_at IS NULL")
  .get(id).n;
const courtCount = courts.length + Math.max(0, SLATE_CAP - existing);
```

```js
const plan = planBatch({
  waiting,
  history,
  skillOf,
  courtCount,
  now,
  cfg: { maxConsecutive: s.max_consecutive, restGames: s.rest_games },
  locked,
});
```

The handler calls its closures at: `getWaiting()` (line 158, locked-id check), `computePlan(locked, excluded)` (line 164, dry-run return), `computePlan(locked)` (line 168), `freeCourts()` + `getWaiting()` (lines 178-179, plan validation), `freeCourts()` (line 213, court labels).

`server/routes/automatch.js:251-271` — the deck half of the write transaction (the court half above it, lines 234-250, stays where it is; since plan 007 it also pushes each started match's id into `matchIds`):

```js
const setStaged = db.prepare(
  "UPDATE queue_entries SET status = 'staged', status_updated_at = ? WHERE id = ?",
);
for (const m of plan.slate) {
  const seq = db
    .prepare(
      "SELECT COALESCE(MAX(slate_seq),0)+1 AS n FROM matches WHERE session_id = ? AND state = 'slated'",
    )
    .get(id).n;
  const [t1p1, t1p2] = m.team1;
  const [t2p1, t2p2] = m.team2;
  const { lastInsertRowid } = db
    .prepare(`
    INSERT INTO matches (session_id, court_number, format, state, slate_seq, team1_p1, team1_p2, team2_p1, team2_p2, started_at)
    VALUES (?, NULL, 'doubles', 'slated', ?, ?, ?, ?, ?, 0)
  `)
    .run(id, seq, t1p1, t1p2, t2p1, t2p2);
  for (const eid of [...m.team1, ...m.team2]) setStaged.run(now, eid);
  slateIds.push(lastInsertRowid);
  slated++;
}
```

`server/logic/smartQueue.js:251` and `:611` — the matcher's unused `bans` input and where it bites (a split whose two partner pairs include a banned pair is skipped, so a banned partnership can never be planned):

```js
 * @param {Array} [p.bans]  hard no-partner pairs, e.g. [[idA, idB], …]
```

```js
        if (banSet.has(a * K + b) || banSet.has(c * K + d)) continue;
```

`server/routes/matches.js:1-3` and `:200-216` — imports, and the end of the end-match transaction:

```js
import { Hono } from "hono";
import db from "../db.js";
import { broadcast } from "./sse.js";
```

```js
    if (usable) {
      const next = db
        .prepare(
          "SELECT * FROM matches WHERE session_id = ? AND state = 'slated' AND ended_at IS NULL ORDER BY slate_seq, id LIMIT 1",
        )
        .get(match.session_id);
      if (next) {
        db.prepare(
          "UPDATE matches SET state = 'active', court_number = ?, started_at = ?, slate_seq = NULL, new_shuttles = 1 WHERE id = ?",
        ).run(freed, now, next.id);
        const slatedEntryIds = [next.team1_p1, next.team1_p2, next.team2_p1, next.team2_p2].filter(Boolean);
        const toPlay = db.prepare(
          "UPDATE queue_entries SET status = 'playing', status_updated_at = ? WHERE id = ?",
        );
        for (const eid of slatedEntryIds) toPlay.run(now, eid);
      }
    }
  })();

  const updated = db.prepare("SELECT * FROM matches WHERE id = ?").get(id);
  broadcast();
  return c.json({ match: updated });
```

`server/routes/slate.test.js:374` — the assertion this plan flips (8 players, 1 court: a match ended and the one deck lineup was promoted, leaving the four returners waiting):

```js
assert.equal(state.slatedMatches.length, 0, "Expected no slated matches remaining");
```

`tests/e2e/28-on-deck.spec.js:192-208` — 28.6 (16 players: `seedLiveMatch` puts 4 on court, two `seedSlate` calls stage 8, leaving 4 waiting):

```js
const [first, second] = (await liveState(page)).slatedMatches.map((m) => m.id);
await endMatch(page, "Court 1");
await expect.poll(async () => (await liveState(page)).slatedMatches.map((m) => m.id)).toEqual([second]);
const st = await liveState(page);
expect(st.activeMatches.map((m) => m.id)).toContain(first);
await expect(panel(page)).toBeVisible();
await expect(page.getByTestId("on-deck-pos-1")).toBeVisible();
await expect(page.getByTestId("on-deck-pos-2")).toHaveCount(0);
await expect(page.getByTestId("on-deck-count")).toHaveText("1");
await expect(page.getByTestId(`slate-row-${second}`)).toBeVisible();
```

`client/src/components/OnDeckStrip.jsx:16`, `:204-216` — imports and state:

```jsx
import { abortMatch, cancelSlate, moveSlate, slateMatch, startSlateOnCourt, updateSlate } from "../api.js";
```

```jsx
const toast = useToast();
const [editingId, setEditingId] = useState(null);
```

`client/src/components/OnDeckStrip.jsx:566-578` — the **✨ Smart add** button in the collapsed header; the expanded header (lines ~589-603) repeats the same button, and only one header renders at a time (`open ? expandedHeader : collapsedHeader`):

```jsx
      <Button
        size="sm"
        variant="secondary"
        className="rounded-full"
        data-testid="ondeck-smart-add"
        disabled={filling}
        onClick={runSmartFill}
      >
        <Spark /> Smart add
      </Button>
    </header>
  );
```

`client/src/components/OnDeckStrip.jsx:673-677` — the empty-state copy:

```jsx
                <p className="text-sm font-bold tracking-tight">Nothing on deck</p>
                <p className="text-xs text-muted-foreground">
                  Line up the next match so it starts the moment a court frees up — Smart add or build a
                  lineup.
                </p>
```

`client/src/api.js:68` — where the new call goes:

```js
export const autoMatch = (sessionId, body) => req("POST", `/sessions/${sessionId}/automatch`, body);
```

Conventions that apply:

- **Server-state assertions are API-level tests** (`server/routes/*.test.js`, sub-second), never browser specs; the browser asserts only the UI re-render (`docs/testing.md` "Server-state assertions"). This plan's behaviour lives in `automatch.test.js` and `slate.test.js`; the e2e additions only check toasts and deck rows.
- Server tests are self-contained `node:assert/strict` scripts with a `try { … } finally { end the session }` per session — the next session's `snap()` would otherwise be ambiguous when two started sessions share a second.
- **Undo callbacks resolve `true` on success** and reject to let the toast report a failure (`client/src/components/Toast.jsx:56-67`).
- A `ponytail:` comment marks a deliberate shortcut and names its upgrade path.
- Code comments explain _why_; keep that style.
- Commit style: conventional commits, one logical change per commit (`CONTRIBUTING.md:38`).

## Commands you will need

Run from the repo root unless noted. In a fresh git worktree run `bun run install:all` first.

| Purpose          | Command                                               | Expected on success                         |
| ---------------- | ----------------------------------------------------- | ------------------------------------------- |
| Install          | `bun run install:all`                                 | exit 0                                      |
| Lint             | `bunx biome check`                                    | exit 0 (warnings allowed, no errors)        |
| Client build     | `bun run --cwd client build`                          | exit 0                                      |
| Server/API tests | `bun run --cwd tests test:server`                     | exit 0, every file prints its "passed" line |
| Unit tests       | `bun run --cwd tests test:unit`                       | exit 0                                      |
| e2e for a spec   | `cd tests && bunx playwright test 28-on-deck.spec.js` | all pass                                    |

## Scope

**In scope** (the only files you should modify):

- `server/routes/automatch.js`, `server/routes/matches.js`
- `server/routes/automatch.test.js`, `server/routes/slate.test.js`
- `client/src/components/OnDeckStrip.jsx`, `client/src/api.js`
- `tests/e2e/28-on-deck.spec.js`
- `README.md`, `docs/architecture.md`, `docs/todo.md`, `CHANGELOG.md`

**Out of scope** (do NOT touch, even though they look related):

- `server/routes/slate.js` — `POST /matches/:id/start` (▶ Start now) and `DELETE /matches/:id/slate` (✕) must **not** refill; see "Why this matters".
- `server/logic/smartQueue.js` — the matcher. `bans` is used as shipped.
- `SLATE_CAP` (stays 3) and every existing guard of the automatch route (stale plan, paused session, cap check).
- The header **✨ Smart Match** button and `handleSmartMatch` in `App.jsx` — plan 007's territory; they are unchanged here.
- A per-session on/off setting for the refill — not requested; see the `ponytail:` note.
- Refilling on player check-in, or auto-starting from an empty deck — a court with an empty deck stays idle until the QM presses Smart Match (the existing idle-court nudge covers it).

## Git workflow

- Branch: `advisor/008-deck-auto-refill`
- Commit per step: `refactor(server): …`, `feat(server): …`, `feat(client): …`, `test(e2e): …`, `docs: …`
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Re-home the planner, then refill the deck on auto-promotion

**1a. `server/routes/automatch.js` — move code out of the handler, no behaviour change.** Keep every moved line identical apart from its indentation and the renames listed here.

- Move `freeCourts` to module level as `function freeCourtsOf(id, now) { … }`.
- Move `getWaiting` to module level as `function waitingOf(id) { … }`.
- Move `computePlan` to module level with an explicit signature instead of closures:

  ```js
  function computePlanFor(id, s, now, { slateOnly, locked = [], excluded = [], bans = [] }) {
  ```

  Inside it: `freeCourts()` → `freeCourtsOf(id, now)`, `getWaiting()` → `waitingOf(id)`, and `planBatch({ … })` gains a `bans,` argument after `locked,`.
- Move the deck half of the write transaction into a module-level function (the court half stays in the route):

  ```js
  /** Insert planned deck lineups and stage their players. Returns the new match
   *  ids. No transaction of its own — the caller wraps it (route, refill, rerun). */
  function insertSlates(id, slate, now) {
    const slateIds = [];
    const setStaged = db.prepare(
      "UPDATE queue_entries SET status = 'staged', status_updated_at = ? WHERE id = ?",
    );
    for (const m of slate) {
      const seq = db
        .prepare(
          "SELECT COALESCE(MAX(slate_seq),0)+1 AS n FROM matches WHERE session_id = ? AND state = 'slated'",
        )
        .get(id).n;
      const [t1p1, t1p2] = m.team1;
      const [t2p1, t2p2] = m.team2;
      const { lastInsertRowid } = db
        .prepare(`
        INSERT INTO matches (session_id, court_number, format, state, slate_seq, team1_p1, team1_p2, team2_p1, team2_p2, started_at)
        VALUES (?, NULL, 'doubles', 'slated', ?, ?, ?, ?, ?, 0)
      `)
        .run(id, seq, t1p1, t1p2, t2p1, t2p2);
      for (const eid of [...m.team1, ...m.team2]) setStaged.run(now, eid);
      slateIds.push(lastInsertRowid);
    }
    return slateIds;
  }
  ```

- In the route handler, replace the removed closures with calls:
  - `computePlan(locked, excluded)` → `computePlanFor(id, s, now, { slateOnly, locked, excluded })`
  - `computePlan(locked)` → `computePlanFor(id, s, now, { slateOnly, locked })`
  - every `freeCourts()` → `freeCourtsOf(id, now)`; every `getWaiting()` → `waitingOf(id)`
  - inside `db.transaction(() => { … })`, after the court-matches loop: `slateIds.push(...insertSlates(id, plan.slate, now));`, and right after the transaction `const slated = slateIds.length;` (delete the `let slated = 0;` and the `slated++`). Everything else is unchanged: `const matchIds = []` and its `matchIds.push(lastInsertRowid)` (plan 007), and everything after the transaction (`if (!started && !slated) …`, the response).

**1b. Add the refill** (module level, same file):

```js
/** Top the deck back up to SLATE_CAP after a lineup left it through an
 *  auto-promotion. Call inside the promotion's transaction, before broadcast.
 *  Fewer than 4 waiting players (or a full deck) → nothing to add.
 *  ✕ Cancel and ▶ Start now deliberately do not call this: a lineup the queue
 *  master removed or sent out by hand must not be re-planned behind their back.
 *  ponytail: always on — add a per-session setting if a queue master who
 *  builds lineups by hand needs the old behaviour. */
export function refillDeck(sessionId, now = Math.floor(Date.now() / 1000)) {
  const s = db.prepare("SELECT * FROM sessions WHERE id = ?").get(sessionId);
  if (!s || s.ended_at != null) return [];
  const plan = computePlanFor(sessionId, s, now, { slateOnly: true });
  return insertSlates(sessionId, plan.slate, now);
}
```

**1c. Call it from the promotion.** `server/routes/matches.js`: add `import { refillDeck } from "./automatch.js";` under the existing imports, and inside the `if (next) { … }` block, after the `for (const eid of slatedEntryIds) toPlay.run(now, eid);` line:

```js
// the deck is now one lineup short — plan its replacement in the same
// transaction so clients see the promotion and the refill together
refillDeck(match.session_id, now);
```

(No import cycle: `automatch.js` does not import `matches.js`.)

**1d. Flip the pinned expectation** in `server/routes/slate.test.js` line 374 — with 8 players the four returners are the only ones waiting, so they are exactly what the refill stages:

```js
assert.equal(state.slatedMatches.length, 1, "deck refilled with the four players who just finished");
```

**1e. API-level regression** — add to `server/routes/automatch.test.js`, before `async function run()`, and call `await refillTests();` from `run()` right after `await multiSlateTests();`:

```js
// Deck auto-refill: when a match ends and the next lineup steps onto the court,
// the deck is topped back up to SLATE_CAP from the waiting queue. ▶ Start now
// and an empty deck deliberately do not refill.
async function refillTests() {
  const api = (path, method = "GET", body) =>
    fetch(`${BASE}${path}`, {
      method,
      headers: body ? { "Content-Type": "application/json" } : {},
      body: body ? JSON.stringify(body) : undefined,
    }).then((r) => r.json().then((data) => ({ status: r.status, ...data })));
  const ids4 = (m) => [m.team1_p1, m.team1_p2, m.team2_p1, m.team2_p2].filter(Boolean);
  const num = (xs) => xs.slice().sort((a, b) => a - b);
  const end = (id) => api(`/matches/${id}/end`, "PATCH", { team1_score: 21, team2_score: 15 });
  const waitingCount = async () => (await snap()).queue.filter((q) => q.status === "waiting").length;
  const startMatch = (sid, courtId, ids) =>
    api("/matches", "POST", {
      session_id: sid,
      court_number: courtId,
      team1_p1: ids[0],
      team1_p2: ids[1] ?? null,
      team2_p1: ids[2],
      team2_p2: ids[3] ?? null,
    });
  const slate = (sid, ids) =>
    api("/matches/slate", "POST", {
      session_id: sid,
      team1_p1: ids[0],
      team1_p2: ids[1],
      team2_p1: ids[2],
      team2_p2: ids[3],
    });

  // A. 16 players, 1 court — the deck returns to the cap after every promotion
  let session = await mkSession(16, 1, "RefillP");
  try {
    const w = (await snap()).queue.map((e) => e.id);
    const { courts } = await api(`/sessions/${session.id}/courts`);
    let st;
    await startMatch(session.id, courts[0].id, w.slice(0, 4));
    await slate(session.id, w.slice(4, 8));
    await slate(session.id, w.slice(8, 12));
    await slate(session.id, w.slice(12, 16));
    st = await snap();
    assert.equal(st.slatedMatches.length, 3, "setup: deck full");

    await end(st.activeMatches[0].id);
    st = await snap();
    assert.deepEqual(ids4(st.activeMatches[0]), w.slice(4, 8), "the top lineup was promoted");
    assert.equal(
      st.slatedMatches.length,
      3,
      "deck back at the cap (one refill replaced the promoted lineup)",
    );
    assert.deepEqual(
      num(st.slatedMatches.flatMap(ids4)),
      num([...w.slice(8, 16), ...w.slice(0, 4)]),
      "the refill staged exactly the four players who just finished",
    );
    assert.equal(await waitingCount(), 0, "nobody left waiting");
  } finally {
    await api(`/sessions/${session.id}/end`, "PATCH");
  }

  // B. 8 players, 1 court — the four returners are re-planned as the next lineup
  session = await mkSession(8, 1, "RefillB");
  try {
    const w = (await snap()).queue.map((e) => e.id);
    const { courts } = await api(`/sessions/${session.id}/courts`);
    await startMatch(session.id, courts[0].id, w.slice(0, 4));
    await slate(session.id, w.slice(4, 8));
    let st = await snap();
    await end(st.activeMatches[0].id);
    st = await snap();
    assert.deepEqual(ids4(st.activeMatches[0]), w.slice(4, 8), "the deck lineup was promoted");
    assert.equal(st.slatedMatches.length, 1, "deck refilled from the four returners");
    assert.deepEqual(num(ids4(st.slatedMatches[0])), num(w.slice(0, 4)), "…made of exactly those four");
  } finally {
    await api(`/sessions/${session.id}/end`, "PATCH");
  }

  // C. ▶ Start now does not refill — the deck is left as the QM arranged it
  session = await mkSession(12, 1, "RefillC");
  try {
    const w = (await snap()).queue.map((e) => e.id);
    const { courts } = await api(`/sessions/${session.id}/courts`);
    const { slate: s1 } = await slate(session.id, w.slice(0, 4));
    const started = await api(`/matches/${s1.id}/start`, "POST", { court_id: courts[0].id });
    assert.equal(started.status, 200, "setup: lineup started by hand");
    assert.equal(
      (await snap()).slatedMatches.length,
      0,
      "manual start left the deck alone (8 still waiting)",
    );
  } finally {
    await api(`/sessions/${session.id}/end`, "PATCH");
  }

  // D. Fewer than 4 waiting after a promotion → nothing to refill with
  session = await mkSession(7, 1, "RefillD");
  try {
    const w = (await snap()).queue.map((e) => e.id);
    const { courts } = await api(`/sessions/${session.id}/courts`);
    await startMatch(session.id, courts[0].id, [w[0], null, w[1], null]); // singles: 2 on court
    await slate(session.id, w.slice(2, 6)); // 4 on deck
    let st = await snap();
    await end(st.activeMatches[0].id);
    st = await snap();
    assert.equal(st.activeMatches[0].format, "doubles", "the deck lineup was promoted");
    assert.equal(st.slatedMatches.length, 0, "3 waiting is not a lineup — nothing refilled");
    assert.equal(await waitingCount(), 3);
  } finally {
    await api(`/sessions/${session.id}/end`, "PATCH");
  }
}
```

(`startMatch`'s `ids[1] ?? null` is what makes scenario D a singles match — `POST /matches` reads `format = team1_p2 ? "doubles" : "singles"`.)

Order of work inside this step, so the suite is only red where expected: do 1a and run `bun run --cwd tests test:server` — it must pass **unchanged** (the move is behaviour-neutral); then 1b + 1c, flip 1d, add 1e, and run it again.

**Verify**: `bunx biome check` → exit 0; `bun run --cwd tests test:server` → exit 0 (`refillTests` has no print of its own — a failed assertion throws and fails the file). If a **different** server test fails after 1c, apply the rule in "STOP conditions" before touching it. `grep -n "export function refillDeck\|function computePlanFor\|function insertSlates" server/routes/automatch.js` → three matches; `grep -n "refillDeck" server/routes/matches.js` → two matches (import + call); `grep -n "freeCourts()\|getWaiting()\|computePlan(" server/routes/automatch.js` → no matches.

### Step 2: `rerun_deck` — re-plan the deck so no old pairing survives

In `server/routes/automatch.js`:

1. Module level, next to the other helpers: `class NoPlan extends Error {}`.
2. In the route handler, after the `excluded` validation block and before the `if (locked.length) { … }` check, add:

   ```js
     // "↻ Rerun deck": release every deck lineup and re-plan the deck so that
     // none of the old pairings survives. One transaction — when nothing else can
     // be planned, the old lineups stay exactly as they were.
     if (body?.rerun_deck === true) {
       if (dryRun || givenPlan || locked.length || excluded.length) {
         return c.json({ error: "rerun_deck cannot be combined with dry_run, plan, locked or excluded" }, 400);
       }
       let out;
       try {
         db.transaction(() => {
           const old = db
             .prepare(
               "SELECT * FROM matches WHERE session_id = ? AND state = 'slated' AND ended_at IS NULL ORDER BY slate_seq, id",
             )
             .all(id);
           // status only — sort_order is the queue master's manual order and a
           // rerun is not a cancellation
           const release = db.prepare(
             "UPDATE queue_entries SET status = 'waiting', status_updated_at = ? WHERE id = ?",
           );
           for (const m of old) {
             for (const eid of [m.team1_p1, m.team1_p2, m.team2_p1, m.team2_p2].filter(Boolean)) {
               release.run(now, eid);
             }
           }
           db.prepare("DELETE FROM matches WHERE session_id = ? AND state = 'slated' AND ended_at IS NULL").run(id);
           // the matcher treats these as hard no-partner pairs for this one plan
           const bans = old
             .flatMap((m) => [
               [m.team1_p1, m.team1_p2],
               [m.team2_p1, m.team2_p2],
             ])
             .filter(([a, b]) => a != null && b != null);
           const plan = computePlanFor(id, s, now, { slateOnly: true, bans });
           if (!plan.slate.length) throw new NoPlan();
           out = { replaced: old.length, slated_count: plan.slate.length, slate_ids: insertSlates(id, plan.slate, now) };
         })();
       } catch (err) {
         if (err instanceof NoPlan) return c.json({ error: "No other fair lineups right now — deck kept" }, 409);
         throw err;
       }
       broadcast();
       return c.json(out);
     }
   ```

   The route's earlier guards already answered 404 / 400 / 409 for a missing, unstarted or ended session, and `now`, `s`, `id`, `dryRun`, `givenPlan`, `locked`, `excluded` are all in scope there.

3. API-level regression — add to `server/routes/automatch.test.js` before `run()`, and call `await rerunTests();` after `await refillTests();`:

   ```js
   // "↻ Rerun deck": every lineup is released and re-planned so none of the old
   // pairings survives; the live match is untouched; bad combinations are 400s.
   async function rerunTests() {
     const session = await mkSession(16, 1, "RerunP");
     const post = (body) =>
       fetch(`${BASE}/sessions/${session.id}/automatch`, {
         method: "POST",
         headers: { "Content-Type": "application/json" },
         body: JSON.stringify(body),
       });
     const ids4 = (m) => [m.team1_p1, m.team1_p2, m.team2_p1, m.team2_p2].filter(Boolean);
     const num = (xs) => xs.slice().sort((a, b) => a - b);
     const pairsOf = (m) =>
       [
         [m.team1_p1, m.team1_p2],
         [m.team2_p1, m.team2_p2],
       ].map((p) => num(p).join("-"));
     try {
       await post({ plan: (await (await post({ dry_run: true })).json()).plan }); // 1 court match + 3 on deck
       let st = await snap();
       assert.equal(st.slatedMatches.length, 3, "setup: deck full");
       const liveId = st.activeMatches[0].id;
       const oldPairs = new Set(st.slatedMatches.flatMap(pairsOf));
       const stagedBefore = num(st.slatedMatches.flatMap(ids4));

       const res = await post({ rerun_deck: true });
       assert.equal(res.status, 200);
       const body = await res.json();
       assert.equal(body.replaced, 3);
       assert.equal(body.slated_count, 3);
       assert.equal(body.slate_ids.length, 3);

       st = await snap();
       assert.equal(st.slatedMatches.length, 3, "deck re-planned to the cap");
       assert.equal(st.activeMatches.length, 1);
       assert.equal(st.activeMatches[0].id, liveId, "the live match is untouched");
       for (const m of st.slatedMatches) {
         for (const p of pairsOf(m)) assert.ok(!oldPairs.has(p), `old pairing ${p} must not survive a rerun`);
       }
       assert.deepEqual(
         num(st.slatedMatches.flatMap(ids4)),
         stagedBefore,
         "the same twelve players are on deck",
       );
       assert.deepEqual(
         st.slatedMatches.map((m) => m.slate_seq),
         [1, 2, 3],
         "deck renumbered from 1",
       );

       // rerun_deck is a whole-deck operation — it cannot be previewed or narrowed
       assert.equal((await post({ rerun_deck: true, dry_run: true })).status, 400);
       assert.equal((await post({ rerun_deck: true, plan: { matches: [], slate: [] } })).status, 400);
     } finally {
       await fetch(`${BASE}/sessions/${session.id}/end`, { method: "PATCH" });
     }
   }
   ```

**Verify**: `bun run --cwd tests test:server` → exit 0; `grep -n "rerun_deck" server/routes/automatch.js` → at least three matches.

### Step 3: The ↻ Rerun button

1. `client/src/api.js`, under `autoMatch`:

   ```js
   export const rerunDeck = (sessionId) => req("POST", `/sessions/${sessionId}/automatch`, { rerun_deck: true });
   ```

2. `client/src/components/OnDeckStrip.jsx`:
   - Add `rerunDeck` to the `../api.js` import.
   - Next to the other in-flight flags: `const [rerunning, setRerunning] = useState(false);`
   - Next to `handleCancel`, add:

     ```js
     // ↻ Rerun: the server throws the deck away and plans a new one that reuses
     // none of the old pairings. Undo re-creates the old lineups, in order.
     async function handleRerun() {
       if (rerunning) return;
       const old = rows.map((r) => ({
         team1_p1: r.team1_p1,
         team1_p2: r.team1_p2,
         team2_p1: r.team2_p1,
         team2_p2: r.team2_p2,
       }));
       setRerunning(true);
       try {
         const r = await rerunDeck(sessionId);
         toast(`Deck re-planned — ${r.slated_count} new lineup${r.slated_count === 1 ? "" : "s"}`, "success", {
           duration: 10000,
           undo: async () => {
             await Promise.all(r.slate_ids.map((id) => cancelSlate(id)));
             for (const l of old) await slateMatch({ session_id: sessionId, ...l });
             return true;
           },
         });
       } catch (err) {
         toast(err?.data?.error ?? "Could not re-plan the deck", "error");
       } finally {
         setRerunning(false);
       }
     }
     ```

   - In **both** headers, directly after the **✨ Smart add** button's closing `</Button>` (the `…` line marks the code above it — it is not part of the addition):

     ```jsx
     …
     {rows.length > 0 && (
       <Button
         size="sm"
         variant="ghost"
         className="rounded-full"
         data-testid="ondeck-rerun"
         disabled={rerunning}
         title="Throw these lineups away and plan different ones"
         onClick={handleRerun}
       >
         ↻ Rerun
       </Button>
     )}
     ```

   - Empty-state copy, second `<p>`: replace with `Smart Match fills it — after that it refills itself as lineups go onto a court — or build one.` (keep the "Nothing on deck" heading; 28.1 asserts on it).

**Verify**: `bun run --cwd client build` → exit 0; `bunx biome check` → exit 0; `grep -c "ondeck-rerun" client/src/components/OnDeckStrip.jsx` → `2`.

### Step 4: Browser spec

`tests/e2e/28-on-deck.spec.js`:

- Replace 28.6's body from the `endMatch` line on:

  ```js
  await endMatch(page, "Court 1");
  // 16 players: 4 on court, 8 on deck, 4 waiting → after the promotion 8 are
  // waiting (the four who just played + the four who were waiting) → 2 refills
  await expect.poll(async () => (await liveState(page)).slatedMatches.map((m) => m.id)).toHaveLength(3);
  const st = await liveState(page);
  expect(st.activeMatches.map((m) => m.id)).toContain(first);
  expect(st.slatedMatches[0].id).toBe(second); // the old #2 is up next; refills go behind it
  await expect(panel(page)).toBeVisible();
  await expect(page.getByTestId("on-deck-pos-1")).toBeVisible();
  await expect(page.getByTestId("on-deck-pos-3")).toBeVisible();
  await expect(page.getByTestId("on-deck-count")).toHaveText("3");
  await expect(page.getByTestId(`slate-row-${second}`)).toBeVisible();
  ```

  Retitle it: `"28.6 ending the live match promotes slate #1 and the deck refills behind it; panel stays mounted"`.

- Add:

  ```js
  test("28.12 Rerun re-plans the deck with different pairings; Undo restores the old lineups", async ({
    page,
  }) => {
    await seedLiveMatch(page);
    const a = await seedSlate(page);
    const b = await seedSlate(page);
    const sidesOf = (m) =>
      [1, 2].map((s) => [m[`team${s}_p1_name`], m[`team${s}_p2_name`]].filter(Boolean).join(" & "));
    const before = [a, b].map(sidesOf);

    await page.getByTestId("ondeck-rerun").click();
    // 12 players were free once the two lineups were released → the deck fills to its cap of 3
    await expect(page.getByTestId("toast")).toContainText("Deck re-planned — 3 new lineups");
    await expect(page.getByTestId("on-deck-count")).toHaveText("3");
    const after = (await liveState(page)).slatedMatches.map(sidesOf);
    expect(after).toHaveLength(3);
    const oldSides = before.flat();
    for (const sides of after) for (const side of sides) expect(oldSides).not.toContain(side);

    await page.getByTestId("toast-undo").click();
    await expect(page.getByTestId("toast")).toContainText("Undone");
    expect((await liveState(page)).slatedMatches.map(sidesOf)).toEqual(before);
  });
  ```

Then run the specs that end a match while a lineup is on deck, and fix only what the refill rule explains: `cd tests && bunx playwright test 28-on-deck.spec.js 19-queue-master.spec.js 39-named-teams.spec.js 36-idle-nudge.spec.js 30-staggered-courts.spec.js`.

**Verify**: all five specs pass.

### Step 5: Docs tell the new truth

- `README.md` "What it does" — replace the **On Deck slate** bullet (as plan 007 left it) with:

  ```markdown
  - **On Deck slate** — build lineups manually or let Smart Match fill it; the
    deck refills itself (up to 3 lineups deep) as lineups go onto a court, slates
    auto-promote to the next free court, and **↻ Rerun** re-plans it with
    different pairings (Undo restores the old ones). Manual lineups never start
    without a confirm.
  ```

- `docs/architecture.md` "Smart Match (as implemented)" — add this paragraph directly after the one that ends `…so the toast's Undo can take the whole click back.`:

  ```
  On Deck holds up to `SLATE_CAP` (3) lineups. When a match ends and the top
  lineup is promoted to the freed court, the server plans replacements up to the
  cap in the same transaction (`refillDeck` in `routes/automatch.js`); manual
  starts (`▶ Start now`) and cancellations do not refill. `POST
  /api/sessions/:id/automatch` with `{rerun_deck: true}` releases every deck
  lineup, bans their pairings for one planning pass and writes a fresh deck; if
  nothing else can be planned it answers 409 and leaves the deck untouched.
  ```

- `docs/todo.md` line 10: append to `Slate / On Deck matches with auto-promotion; slate to next free court` → `; the deck refills to the cap after each auto-promotion (✕ Cancel and ▶ Start now do not refill); ↻ Rerun re-plans the deck with the old pairings banned, 409 keeps it when nothing else fits`
- `CHANGELOG.md` under `## [Unreleased]` → `### Changed`, add:
  `- **On Deck refills itself.** When a game ends and the next lineup steps on, QueueC plans replacements up to 3 lineups deep — no more re-pressing Smart Match. New **↻ Rerun** (On Deck header) throws the deck away and re-plans it without reusing any old pairing; Undo restores the previous lineups. Cancelling a lineup or starting one with ▶ Start now does not refill.`

**Verify**: `grep -n "refills itself" README.md docs/architecture.md docs/todo.md CHANGELOG.md` → every file matches.

## Test plan

- API-level (`bun run --cwd tests test:server`): `refillTests` (A: deck returns to the cap and stages exactly the four returners; B: the returners become the next lineup; C: ▶ Start now does not refill; D: fewer than 4 waiting → nothing) and `rerunTests` (same players, no old pairing, live match untouched, renumbered from 1, bad combinations are 400). `slate.test.js` step 8 flips to the refilled expectation.
- Browser (UI re-render only): 28.6 (count 3, old #2 still first), 28.12 (toast, different sides, Undo restores).
- Structural pattern: `planTests` / `multiSlateTests` in `server/routes/automatch.test.js` (same helpers `mkSession`, `snap`, `BASE`).
- Not covered on purpose: the `409 … deck kept` branch of rerun needs a queue in which no unbanned plan exists; no simple fixture produces it. It is defensive code.

## Done criteria

Machine-checkable. ALL must hold:

- [ ] `grep -n "export function refillDeck" server/routes/automatch.js` matches; `grep -n "refillDeck" server/routes/matches.js` matches
- [ ] `grep -n "freeCourts()\|getWaiting()\|computePlan(" server/routes/automatch.js` → no matches (the closures are gone)
- [ ] `grep -c "rerun_deck" server/routes/automatch.js` is ≥ 3; `grep -n "rerunDeck" client/src/api.js client/src/components/OnDeckStrip.jsx` matches both
- [ ] `grep -c "ondeck-rerun" client/src/components/OnDeckStrip.jsx` is `2`
- [ ] `grep -n "await refillTests\|await rerunTests" server/routes/automatch.test.js` → two matches
- [ ] `bunx biome check`, `bun run --cwd client build`, `bun run --cwd tests test:unit`, `bun run --cwd tests test:server` all exit 0
- [ ] `cd tests && bunx playwright test 28-on-deck.spec.js 19-queue-master.spec.js 39-named-teams.spec.js 36-idle-nudge.spec.js 30-staggered-courts.spec.js` passes
- [ ] `grep -n "refills itself" README.md docs/architecture.md docs/todo.md CHANGELOG.md` → every file matches
- [ ] `git status --short` lists only in-scope files
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- The code at the locations in "Current state" doesn't match the excerpts (drift), or the tree does not contain plans 007 and 009 — check with `git merge-base --is-ancestor 81f2bd2 HEAD`; without them there is no toast `duration` option and no `match_ids`.
- After Step 1 a server test fails in a way the refill rule does not explain. The rule: _a lineup left the deck through an auto-promotion and at least four players were waiting, so new lineups were staged_. If the failing assertion is about anything else — or is inside the planner's own output (wrong quartets) — do not edit it; report the test name and the assertion.
- `rerunTests` fails with `409 … deck kept` or on `old pairing … must not survive`: that means the matcher's `bans` input does not behave as documented for twelve equal players. Do not weaken the assertion and do not edit `server/logic/smartQueue.js` — report it.
- A failing e2e spec outside the five listed, or one whose failure the refill rule above does not explain.
- You feel the need to add a refill to `server/routes/slate.js` (▶ Start now / ✕ Cancel) — that is excluded on purpose.

## Maintenance notes

- The deck now changes without a click: after every auto-promotion, up to `SLATE_CAP − remaining` lineups appear at the back. Any test or client code that assumes "the deck only changes when the QM acts" is wrong from now on.
- **Refill triggers:** auto-promotion only. Adding a trigger means calling `refillDeck(sessionId, now)` inside the transaction that consumed the lineup, before `broadcast()`.
- **Rerun wipes hand-edited lineups too** — a deck lineup carries no "who built this" flag. The Undo restores them by re-creating them with `POST /matches/slate`; if one of their players has already gone onto a court in the seconds between, that re-create returns 400, the undo rejects, and the toast says "Could not undo — check and retry". Accepted for now.
- The `409 … deck kept` path of rerun is defensive and untested (see Test plan).
- Reviewer focus: (1) `refillDeck` runs **inside** the end-match transaction and before its `broadcast()` — clients must see promotion and refill in one frame; (2) the rerun releases lineups with a status-only update (`sort_order` untouched) while ✕ Cancel intentionally pushes players to the back of the manual order — the difference is deliberate; (3) the planner move in Step 1a must be behaviour-neutral: `automatch.test.js` and `automatch-locked.test.js` pass unchanged before Step 1c is wired in.
- Deferred: a per-session setting to switch the refill off; refilling on late check-in; sizing the last-call warning to the session's points (see plan 006).

## Execution notes — 2026-11-26

- First dispatch died on an API usage limit before making any change (its worktree was cleaned up empty); re-dispatched with the same brief.
- Executed on branch `worktree-agent-a97fb6cf04c7cd563`, stacked on `81f2bd2`: `4d037cc` (renumber 24.3 → 24.5, a review nit from 007), `75b7e02` planner move (verified behaviour-neutral: `test:server` green before the refill was wired), `47af563` refill, `56b81c4` rerun_deck, `b66037c` ↻ Rerun button, `00c1459` e2e, `013a49c` docs.
- **Accepted deviation (`slate.test.js` step 10)**: beyond the line-374 flip, step 10's reorder checks failed with "first cannot move up" because step 8's promotion now refills the deck with a lineup in front. That is the refill rule working. No assertion was edited; the step clears the leftover lineups with `DELETE /matches/:id/slate` (✕ Cancel, which does not refill) before its own setup.
- **Plan errata**: (1) the done criterion `grep -c "rerun_deck" … ≥ 3` is wrong — the plan's own code contains `rerun_deck` twice (the `if` and the error string); 2 is correct. (2) Step 5's prescribed wording for `docs/architecture.md` and `docs/todo.md` did not contain the phrase "refills itself" that the done criterion greps for; the executor added it to both.
- One-off: the first `test:server` run after the move failed a 5.01 vs 5 fairness assertion in `sse.state.test.js` (wall-clock rounding); the immediate rerun passed with no change.
- Review: scope clean (12 files), all criteria re-run by the advisor on `013a49c` — lint, build, unit, 38 API-test files, full e2e suite **281 passed / 0 failed**.
