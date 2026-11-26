# Plan 009: Smart add's re-pick works — the route accepts the four drafted players, and spec 42.2 actually tests it

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**:
> `git diff --stat 249a874..HEAD -- server/routes/automatch.js server/routes/automatch-locked.test.js tests/e2e/42-partial-lock.spec.js CHANGELOG.md`
> `server/routes/automatch.js` and `CHANGELOG.md` will show plan 007's commits
> (the `match_ids` response; the one-click Smart Match entry) — expected. The
> "Current state" excerpts below must still match.

## Status

- **Priority**: P1 (a feature is broken, and it makes the e2e suite fail deterministically once plans 006–007 land)
- **Effort**: S
- **Risk**: LOW (one validation bound + one API test + one spec made deterministic)
- **Depends on**: none — but **land before plan 008**, which re-homes the same route file
- **Category**: bug
- **Planned at**: commit `249a874`, 2026-11-26 (found while reviewing plans 006–007 on branch `worktree-agent-afe675af5aeae3ed0`)

## Why this matters

In the On Deck builder, clicking **✨ Smart add** on a draft that is already full is meant to _re-pick_: throw the four drafted players out and pour in a different quartet. It has never worked. The client sends all four drafted players as `excluded`; the route's validation — written in the same commit, `c00e826` — rejects more than **three**. The result is a 400, an error toast reading "excluded must be unique queue-entry ids (0–3 of them)", and a draft that does not change.

`tests/e2e/42-partial-lock.spec.js` 42.2 never caught it. Its four setup drags are dispatched back-to-back, but a drag only lands once the queue grid has re-rendered without the previous player. When all four silently fail, the draft is still empty at the click, so the click is a _plain fill_ (no `excluded`), the server answers 200, and the test passes without exercising the re-pick. When the drags do land, the broken re-pick makes it fail. That is the whole of the "order-dependent flake" recorded in `plans/README.md` — it is a broken feature behind a test that only passes by accident. On the 006/007 branch the drags land, so the spec fails every time, in isolation too.

Measured during the 006/007 review, on base `249a874`, with the four drags made to land first:

```
POST /api/sessions/:id/automatch  {"dry_run":true,"slate_only":true,"excluded":[1,2,3,4]}
→ 400 {"error":"excluded must be unique queue-entry ids (0–3 of them)"}   draft unchanged, error toast
```

## Current state

Where things live:

- `client/src/components/OnDeckStrip.jsx` — the builder's `runSmartFill`. Unchanged by this plan; it is correct: a full draft is a re-pick and sends all four picks.
- `client/src/App.jsx` — `handleSmartFill(locked, exclude)`: puts `exclude` in the request body as `excluded`. Unchanged by this plan.
- `server/routes/automatch.js` — `POST /sessions/:id/automatch`; the `excluded` validation is the bug.
- `server/routes/automatch-locked.test.js` — API-level regression for `locked` and `excluded`. Its `excluded` cases only ever send one or two ids.
- `tests/e2e/42-partial-lock.spec.js` — 42.2, the spec that should cover the re-pick.
- `CHANGELOG.md` — under `## [Unreleased]` the feature itself is still listed as an unreleased change.

Excerpts (as of `249a874`):

`client/src/components/OnDeckStrip.jsx:353-355` — the client's side; do not change it:

```js
// pre-placed picks are locked — the plan builds around them. A full draft
// means "repick": the current quartet is excluded and the pour is fresh.
const picks = newDraft.filter(Boolean);
const repick = picks.length === 4;
const ids = await onSmartFill(repick ? [] : picks, repick ? picks : []);
```

`server/routes/automatch.js:37-49` — the bug is `body.excluded.length > 3`:

```js
  // excluded: entry ids the plan must not pick (On Deck "repick" re-click)
  let excluded = [];
  if (Array.isArray(body?.excluded)) {
    if (
      body.excluded.length > 3 ||
      body.excluded.some((x) => !Number.isInteger(x)) ||
      new Set(body.excluded).size !== body.excluded.length
    ) {
      return c.json({ error: "excluded must be unique queue-entry ids (0–3 of them)" }, 400);
    }
    if (!slateOnly) return c.json({ error: "excluded requires slate_only" }, 400);
    excluded = body.excluded;
  }
```

(The `locked` block just above it keeps its cap of 3 — a full draft is a re-pick, never a lock.)

`server/routes/automatch-locked.test.js:8-17`, `:18-35`, `:37-56` — the file's helpers and its one 6-player session; `:106-120` — the existing `excluded` cases:

```js
const api = async (path, method = "GET", body) => {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: body ? { "Content-Type": "application/json" } : {},
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: res.status, ...(await res.json().catch(() => ({}))) };
};
```

```js
const dryEx = await api(`/api/sessions/${session.id}/automatch`, "POST", {
  dry_run: true,
  slate_only: true,
  excluded: [ids[0], ids[1]],
});
assert.equal(dryEx.status, 200, "valid excluded dry-run must 200");
```

`tests/e2e/42-partial-lock.spec.js:67-80` — 42.2 today. The drags are fired without waiting for the queue to update, and the slots are read at once after the click, before the server round-trip can land:

```js
test("42.2 Smart add re-picks when clicked on a full draft", async ({ page }) => {
  await expandDeck(page);
  await openBuilder(page);
  for (let i = 0; i < 4; i++)
    await syntheticDrag(page, "[data-entry-id]", `[data-testid="ondeck-new-slot-${i}"]`, { fromIndex: 0 });
  const old = [];
  for (let i = 0; i < 4; i++) old.push(await page.getByTestId(`ondeck-new-slot-${i}`).textContent());
  await page.getByTestId("ondeck-smart-add").click();
  // a fresh quartet: 4 distinct players, none of the previously drafted ones
  const filled = [];
  for (let i = 0; i < 4; i++) filled.push(await page.getByTestId(`ondeck-new-slot-${i}`).textContent());
  expect(new Set(filled).size).toBe(4);
  for (const name of old) expect(filled).not.toContain(name);
});
```

The spec's `beforeEach` checks in the first 16 fixture players, so after excluding four there are twelve left to plan from.

Conventions that apply:

- Server-state assertions are API-level tests in `server/routes/*.test.js` (`docs/testing.md` "Server-state assertions"); the browser spec asserts only the re-render.
- Tests wait on state, never on a fixed delay and never on a read that returns immediately after a click (`docs/testing.md`: "state waits").
- Commit style: conventional commits (`CONTRIBUTING.md:38`).

## Commands you will need

Run from the repo root unless noted.

| Purpose      | Command                                                                    | Expected on success                         |
| ------------ | -------------------------------------------------------------------------- | ------------------------------------------- |
| Lint         | `bunx biome check`                                                         | exit 0 (warnings allowed, no errors)        |
| Server/API   | `bun run --cwd tests test:server`                                          | exit 0, every file prints its "passed" line |
| The one spec | `cd tests && bunx playwright test 42-partial-lock.spec.js`                 | 2 passed                                    |
| Repeat it    | `cd tests && bunx playwright test 42-partial-lock.spec.js --repeat-each 3` | 6 passed (no timing dependence)             |

## Scope

**In scope** (the only files you should modify):

- `server/routes/automatch.js` (the `excluded` validation only)
- `server/routes/automatch-locked.test.js`
- `tests/e2e/42-partial-lock.spec.js` (test 42.2 only)
- `CHANGELOG.md`

**Out of scope** (do NOT touch):

- `client/src/components/OnDeckStrip.jsx` and `handleSmartFill` in `client/src/App.jsx` — the client is right; the server bound is wrong.
- The `locked` cap (stays 3), the matcher (`server/logic/smartQueue.js`), the rest of the automatch route.
- `tests/e2e/42-partial-lock.spec.js` 42.1 and every other spec that uses `syntheticDrag` — they assert with auto-waiting `expect` calls and pass.

## Git workflow

- Work on the branch you already have; do not create branches, do not push.
- Commits: `fix(server): …` (Step 1 + Step 2 together), `test(e2e): …` (Step 3), `docs: …` (Step 4).

## Steps

### Step 1: The route accepts a full quartet in `excluded`

`server/routes/automatch.js`, in the `excluded` validation block:

- comment: `// excluded: entry ids the plan must not pick (On Deck "repick" re-click — it sends the whole draft, so up to 4)`
- `body.excluded.length > 3 ||` → `body.excluded.length > 4 ||`
- error text → `"excluded must be unique queue-entry ids (0–4 of them)"`

### Step 2: API-level regression

`server/routes/automatch-locked.test.js` — the file's one session has six players, too few to plan a quartet once four are excluded, so add a second, self-contained block in `main()`, after the line that ends the first session and immediately before the final `console.log`:

```js
// Re-pick: the builder sends the whole draft (4 ids) as `excluded`. The first
// cut of the route capped it at 3 and answered 400, so re-clicking Smart add
// never re-picked.
const now2 = Math.floor(Date.now() / 1000);
const { session: s2 } = await api("/api/sessions", "POST", {
  name: "RepickFour",
  scheduled_start: now2,
  scheduled_end: now2 + 3600,
  court_count: 1,
});
for (let i = 0; i < 12; i++) {
  const { player } = await api("/api/players", "POST", {
    name: `Repick P${i + 1}`,
    skill_level: "intermediate",
  });
  await api(`/api/sessions/${s2.id}/checkin`, "POST", { player_id: player.id });
}
await api(`/api/sessions/${s2.id}/start`, "PATCH");
const ids2 = (await readFirstState()).queue.map((e) => e.id);
const excluded4 = ids2.slice(0, 4);
const dry4 = await api(`/api/sessions/${s2.id}/automatch`, "POST", {
  dry_run: true,
  slate_only: true,
  excluded: excluded4,
});
assert.equal(dry4.status, 200, "a full draft (4 ids) must be accepted as excluded");
const quartet4 = [...(dry4.plan?.slate?.[0]?.team1 ?? []), ...(dry4.plan?.slate?.[0]?.team2 ?? [])];
assert.equal(quartet4.length, 4, "re-pick still plans a quartet");
for (const id of excluded4) {
  assert.ok(!quartet4.includes(id), `excluded id ${id} must not be re-picked, got [${quartet4}]`);
}
const tooMany = await api(`/api/sessions/${s2.id}/automatch`, "POST", {
  dry_run: true,
  slate_only: true,
  excluded: ids2.slice(0, 5),
});
assert.equal(tooMany.status, 400, "five excluded ids is still a bad request");
await api(`/api/sessions/${s2.id}/end`, "PATCH");
```

**Verify**: `bunx biome check` → exit 0; `bun run --cwd tests test:server` → exit 0. Commit Steps 1 + 2 together.

### Step 3: Spec 42.2 waits for its own setup and for the re-pick

Replace test 42.2 in `tests/e2e/42-partial-lock.spec.js` with:

```js
test("42.2 Smart add re-picks when clicked on a full draft", async ({ page }) => {
  await expandDeck(page);
  await openBuilder(page);
  // one drag at a time: a drag only lands once the queue grid has dropped the
  // previous player, so wait for the queue to shrink before the next one
  const before = await page.locator("[data-entry-id]").count();
  for (let i = 0; i < 4; i++) {
    await syntheticDrag(page, "[data-entry-id]", `[data-testid="ondeck-new-slot-${i}"]`, { fromIndex: 0 });
    await expect(page.locator("[data-entry-id]")).toHaveCount(before - (i + 1));
  }
  const slots = async () =>
    Promise.all([0, 1, 2, 3].map((i) => page.getByTestId(`ondeck-new-slot-${i}`).textContent()));
  const old = await slots();
  // the draft really is full — on an empty draft the click is a plain fill, not a re-pick
  expect(new Set(old).size).toBe(4);
  for (const s of old) expect(s).not.toContain("Drop");

  await page.getByTestId("ondeck-smart-add").click();
  // the re-pick lands after a server round-trip
  await expect
    .poll(async () => {
      const now = await slots();
      return old.every((name) => !now.includes(name));
    })
    .toBe(true);
  const filled = await slots();
  expect(new Set(filled).size).toBe(4);
  for (const name of old) expect(filled).not.toContain(name);
});
```

**Verify**: `cd tests && bunx playwright test 42-partial-lock.spec.js` → 2 passed; then the same with `--repeat-each 3` → 6 passed.

### Step 4: Changelog

`CHANGELOG.md`, under `## [Unreleased]` → `### Changed`, the bullet that starts `Smart Add can be re-clicked while the lineup builder is full` — append this sentence to it (inside the bullet, before its full stop):

```text
 (The first cut of this capped `excluded` at 3 while the re-click sends all four drafted players, so the re-click only produced an error toast.)
```

**Verify**: `grep -n "capped .excluded. at 3" CHANGELOG.md` → one match.

## Test plan

- API-level: the new block in `automatch-locked.test.js` pins all three facts — four ids are accepted, the planned quartet contains none of them, five are still rejected.
- Browser: 42.2 now proves its precondition (a full draft) and waits for the outcome; `--repeat-each 3` shows it is no longer timing-dependent.
- No existing assertion changes: nothing in the repo asserted the four-id rejection (checked: `grep -rn "excluded" server/routes/*.test.js` only sends one or two ids).

## Done criteria

Machine-checkable. ALL must hold:

- [ ] `grep -n "excluded.length > 4" server/routes/automatch.js` → one match; `grep -c "0–3 of them" server/routes/automatch.js` → `1` (the `locked` message only)
- [ ] `grep -n "RepickFour\|five excluded ids" server/routes/automatch-locked.test.js` → both match
- [ ] `grep -n "toHaveCount(before - (i + 1))" tests/e2e/42-partial-lock.spec.js` → one match
- [ ] `bunx biome check` and `bun run --cwd tests test:server` exit 0
- [ ] `cd tests && bunx playwright test 42-partial-lock.spec.js --repeat-each 3` → 6 passed
- [ ] `grep -c "capped .excluded. at 3" CHANGELOG.md` → `1`
- [ ] `git status --short` lists only in-scope files

## STOP conditions

Stop and report back (do not improvise) if:

- The code at the locations in "Current state" doesn't match the excerpts (other than plan 007's changes to `automatch.js` below line 229 and to `CHANGELOG.md`).
- Changing the bound breaks an existing server test — that would mean some test pins the four-id rejection. Report it; do not edit that assertion.
- 42.2 still fails after Steps 1–3 (the re-pick answers 200 but the poured quartet still contains a drafted player, or a slot stays on "Drop…"): report the toast text and the slots. That would mean the planner or the pour ignores `excluded`, which this plan does not cover.

## Maintenance notes

- `excluded` (≤ 4, "not these players") and `locked` (≤ 3, "must include these") are different shapes on purpose: the On Deck builder only locks a _partial_ draft — a full one is a re-pick.
- Spec 42.1 and the other `syntheticDrag` specs still fire drags back-to-back; they pass because they assert through auto-waiting `expect` calls, but a spec that _reads_ state right after a back-to-back drag has the same latent race 42.2 had. Wait on the queue shrinking, as 42.2 now does.

## Execution notes — 2026-11-26

- Executed on branch `worktree-agent-afe675af5aeae3ed0`: `2114d5e` fix + API regression, `22d256c` spec 42.2, `81f2bd2` changelog.
- The new API block was run against the pre-fix route code and failed with `a full draft (4 ids) must be accepted as excluded — 400 !== 200` — a real regression test. Spec 42 at `--repeat-each 10`: 20 passed.
- Step 4's parenthetical was placed after the bullet's existing full stop rather than inside it (reads cleanly; the sentence is verbatim).
- Full e2e suite on `81f2bd2`: 280 passed, 0 failed — 42.2 passes inside a full run for the first time.
