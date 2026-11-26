# Plan 007: Smart Match in one click — fills the free courts and tops up On Deck, no preview dialog

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**:
> `git diff --stat 249a874..HEAD -- client/src/App.jsx client/src/components/Toast.jsx client/src/components/Header.jsx client/src/components/StartMatchConfirmDialog.jsx server/routes/automatch.js server/routes/automatch.test.js tests/e2e/10-smart-manual-mode.spec.js tests/e2e/19-queue-master.spec.js tests/e2e/24-app-wiring.spec.js tests/e2e/27-start-confirm.spec.js tests/e2e/29-layout.spec.js README.md docs/architecture.md docs/todo.md CHANGELOG.md`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition. (Plans are executed in order; if
> plan 006 has landed, `client/src/App.jsx` and specs 10 / 19 / 27 will have
> small unrelated diffs — that is expected. The excerpts below must still
> match.)

## Status

- **Priority**: P1
- **Effort**: S
- **Risk**: MED (one click now starts games without a review step; mitigated by a 15-second Undo)
- **Depends on**: none (land after plan 006 if both are queued — they share three spec files)
- **Category**: dx
- **Planned at**: commit `249a874`, 2026-11-26

## Why this matters

Today the header's **✨ Smart Match** asks the queue master (QM) to review twice. A dialog previews the plan, then every lineup lands **on On Deck "for review"** — and it never fills a court that is already free. Starting a three-court session therefore costs eight clicks (Smart Match → confirm, then ▶ → pick a court, three times).

After this plan Smart Match is **one click**: it asks the server for a plan, runs it immediately, and reports with an **Undo** toast. Lineups for free courts start at once; the rest go to On Deck (up to the deck cap). There is no preview dialog — the result is already on screen (live courts + deck cards), and the toast's Undo takes the whole click back.

This deliberately replaces a confirm with an undo. It follows the repo's own stated direction (`ROADMAP.md:7`: "a single Undo toast beats confirm dialogs") and was approved by the maintainer on 2026-11-26 with the risk stated. Because this click can put players on a court, its Undo toast stays for **15 seconds** instead of the usual 3.5.

## Current state

Where things live:

- `client/src/App.jsx` — `LiveView`. `handleSmartMatch` (dry-run + open the preview), `confirmSmartMatch` (commit slate-only), `confirmPending` (routes the dialog's confirm), and the `StartMatchConfirmDialog` render at the bottom.
- `client/src/components/StartMatchConfirmDialog.jsx` — the "Start these matches?" confirm used by manual starts and slate promotion; the Smart Match preview reused it with custom `title` / `confirmText` / `slate` props.
- `client/src/components/Toast.jsx` — single-slot toast with an optional Undo action; auto-dismisses after a hard-coded 3500 ms.
- `client/src/components/Header.jsx` — the **Smart Match** button.
- `client/src/api.js` — `autoMatch(sessionId, body)`, `abortMatch(id)`, `cancelSlate(id)` already exist.
- `server/routes/automatch.js` — `POST /sessions/:id/automatch`. `{dry_run: true}` returns `{ plan }`; `{plan}` executes exactly that plan; `slate_only: true` restricts everything to the deck.
- `server/routes/automatch.test.js` — API-level regression for that route.
- e2e: `10`, `19`, `24`, `27`, `29` are the only specs that click the Smart Match button.

Excerpts (as of `249a874`):

`client/src/App.jsx:59-61` — the pending-start union includes a `smart` kind:

```js
// Pending start awaiting confirmation:
//  { kind:'manual', courtId, sel, source, matches } | { kind:'smart', plan, matches, slate }
const [pending, setPending] = useState(null);
```

`client/src/App.jsx:74-104` — Smart Match only previews, and only ever asks for a slate-only plan:

```js
  // header "✨ Smart Match": slate-only, never auto-start. Ask the server for a
  // dry-run plan, preview it in the confirm dialog, then commit it to On Deck —
  // the QM reviews/edits there and sends lineups to a court manually.
  async function handleSmartMatch() {
    if (!session) return;
    try {
      const { plan } = await autoMatch(session.id, { dry_run: true, slate_only: true });
      if (!plan || (!plan.matches.length && !plan.slate.length)) {
        toast("Nothing to auto-match", "info");
        return;
      }
      setPending({
        kind: "smart",
        plan,
        matches: plan.matches.map((m) => ({
```

`client/src/App.jsx:140-166` — the commit is slate-only:

```js
  // Smart Match commit: always the slate-only path — every lineup lands in
  // On Deck for review; nothing starts on a court until the QM sends it.
  async function confirmSmartMatch(plan) {
    setPendingBusy(true);
    try {
      const r = await autoMatch(session.id, { plan, slate_only: true });
```

`client/src/App.jsx:168-171` — the router inside the dialog's confirm:

```js
  async function confirmPending() {
    if (!pending || pendingBusy) return;
    if (pending.kind === "smart") return confirmSmartMatch(pending.plan);
    if (pending.kind === "promote") {
```

`client/src/App.jsx:329` and `:504` — the two remaining `setPending({...})` calls (`requestStartMatch`, `promoteNextSlate`) each end with a `slate: [],` line.

`client/src/App.jsx:660-673` — the dialog render:

```jsx
…
      {pending && (
        <StartMatchConfirmDialog
          open
          onOpenChange={(open) => {
            if (!open && !pendingBusy) setPending(null);
          }}
          matches={pending.matches}
          slate={pending.slate}
          title={pending.kind === "smart" ? "Add these lineups to On Deck?" : undefined}
          confirmText={pending.kind === "smart" ? "Add to On Deck" : undefined}
          busy={pendingBusy}
          onConfirm={confirmPending}
        />
      )}
```

`client/src/components/Toast.jsx:18-25` — fixed 3.5 s:

```js
const toast = useCallback((message, type = "info", { undo, label } = {}) => {
  if (timerRef.current) clearTimeout(timerRef.current);
  setState({ message, type, undo, label });
  timerRef.current = setTimeout(() => {
    setState(null);
    timerRef.current = null;
  }, 3500);
}, []);
```

`client/src/components/Header.jsx:171-175` — the button:

```jsx
          data-testid="btn-smart-match"
          title="Line up the next matches in On Deck"
          disabled={!session || session.started_at == null}
          className="rounded-full"
          onClick={() => onSmartMatch?.()}
```

`client/src/components/StartMatchConfirmDialog.jsx:65-76` and `:102-111` — props and the slate block (only the Smart Match preview ever passed `slate`):

```jsx
export default function StartMatchConfirmDialog({
  open,
  onOpenChange,
  title,
  confirmText,
  matches = [],
  slate = [],
  onConfirm,
  busy = false,
}) {
  const n = matches.length;
  const confirmLabel = n > 1 ? `Start ${n} matches` : n === 1 ? "Start" : "Slate lineup";
```

```jsx
…
        {slate.length > 0 && (
          <div className="flex flex-col gap-1.5" data-testid="start-confirm-slate">
            <p className="text-xs font-semibold text-muted-foreground">Next on deck</p>
            <ul className="flex flex-col gap-1.5">
              {slate.map((m, i) => (
                <Row key={i} m={m} testid="start-confirm-slate-row" />
              ))}
            </ul>
          </div>
        )}
```

The same file uses `title` at line 91 (`{title ?? (n > 1 ? … )}`) and `confirmText` at line 132 (`{confirmText ?? confirmLabel}`).

`server/routes/automatch.js:99-105` — without `slate_only` the plan already covers free courts **and** deck slots:

```js
const courts = slateOnly ? [] : freeCourts();
const existing = db
  .prepare("SELECT COUNT(*) AS n FROM matches WHERE session_id = ? AND state = 'slated' AND ended_at IS NULL")
  .get(id).n;
const courtCount = courts.length + Math.max(0, SLATE_CAP - existing);
```

`server/routes/automatch.js:230-243` and `:277-278` — the write and the response (no ids for started matches):

```js
  let started = 0;
  let slated = 0;
  const slateIds = [];
  db.transaction(() => {
    const setPlaying = db.prepare(
      "UPDATE queue_entries SET status = 'playing', status_updated_at = ? WHERE id = ?",
    );
    for (const m of plan.matches) {
      const [t1p1, t1p2] = m.team1;
      const [t2p1, t2p2] = m.team2;
      db.prepare(`
        INSERT INTO matches (session_id, court_number, format, state, team1_p1, team1_p2, team2_p1, team2_p2, started_at, new_shuttles)
        VALUES (?, ?, ?, 'active', ?, ?, ?, ?, ?, 1)
      `).run(id, m.court_id, m.format, t1p1, t1p2 ?? null, t2p1, t2p2 ?? null, now);
```

```js
  return c.json({ started, slated: slated > 0, slated_count: slated, slate_ids: slateIds });
```

Also on that route (already shipped, no change needed): committing without `slate_only` while the session is paused returns `409 "Session is paused"` (`automatch.js:166`); a stale plan returns `409 "Queue changed — review and try again"`; with 2–3 waiting players and a free court the plan is a **singles** match on `courts[0]` (`automatch.js:143-153`).

`server/routes/automatch.test.js:103-109` — the existing response assertions (all per-key, so an added key is safe):

```js
const run = await post({ plan: plan2 });
assert.equal(run.status, 200);
const body = await run.json();
assert.equal(body.started, 2);
assert.equal(body.slated, true);
assert.equal(body.slated_count, 1);
assert.equal(body.slate_ids?.length, 1, "slate ids returned for undo");
```

Conventions that apply:

- **Undo callbacks resolve `true` on success, `false` when they already told the user, and reject to let the toast report the failure** (`client/src/components/Toast.jsx:56-67`; the convention is documented in `plans/003-client-failure-surfacing.md`).
- A 404 or 409 on `DELETE /matches/:id` means "that match already ended" (see the abort-undo in `App.jsx` `handleStartMatch`); a 404 on `DELETE /matches/:id/slate` means "that lineup already left the deck".
- Code comments explain _why_; update every comment this change makes untrue.
- Commit style: conventional commits, one logical change per commit (`CONTRIBUTING.md:38`).

## Commands you will need

Run from the repo root unless noted. In a fresh git worktree run `bun run install:all` first.

| Purpose          | Command                                                     | Expected on success                         |
| ---------------- | ----------------------------------------------------------- | ------------------------------------------- |
| Install          | `bun run install:all`                                       | exit 0                                      |
| Lint             | `bunx biome check`                                          | exit 0 (warnings allowed, no errors)        |
| Client build     | `bun run --cwd client build`                                | exit 0                                      |
| Server/API tests | `bun run --cwd tests test:server`                           | exit 0, every file prints its "passed" line |
| e2e for a spec   | `cd tests && bunx playwright test 27-start-confirm.spec.js` | all pass                                    |

## Scope

**In scope** (the only files you should modify):

- `server/routes/automatch.js`, `server/routes/automatch.test.js`
- `client/src/App.jsx`, `client/src/components/Toast.jsx`, `client/src/components/Header.jsx`, `client/src/components/StartMatchConfirmDialog.jsx`
- `tests/e2e/10-smart-manual-mode.spec.js`, `19-queue-master.spec.js`, `24-app-wiring.spec.js`, `27-start-confirm.spec.js`, `29-layout.spec.js`
- `README.md`, `docs/architecture.md`, `docs/todo.md`, `CHANGELOG.md`

**Out of scope** (do NOT touch, even though they look related):

- The On Deck **✨ Smart add** button and the builder (`client/src/components/OnDeckStrip.jsx`, `handleSmartFill` in `App.jsx`) — different feature, unchanged.
- Manual starts and the `s` / ▶ slate promotion — they keep their confirm dialog.
- The matcher itself (`server/logic/smartQueue.js`) and the planning rules of `automatch.js` (only the response shape changes here).
- The server's stale-plan / paused / cap guards.
- `client/src/components/ShortcutCheatsheet.jsx`.

## Git workflow

- Branch: `advisor/007-smart-match-one-click`
- Commit per step: `feat(server): …`, `feat(client): …`, `test(e2e): …`, `docs: …`
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: The automatch response returns the started match ids

`server/routes/automatch.js`:

1. Next to `const slateIds = [];` add `const matchIds = []; // started matches — the client's Undo aborts exactly these`.
2. In the `for (const m of plan.matches)` loop, capture the insert's id and push it:

   ```js
   const { lastInsertRowid } = db
     .prepare(`
     INSERT INTO matches (session_id, court_number, format, state, team1_p1, team1_p2, team2_p1, team2_p2, started_at, new_shuttles)
     VALUES (?, ?, ?, 'active', ?, ?, ?, ?, ?, 1)
   `)
     .run(id, m.court_id, m.format, t1p1, t1p2 ?? null, t2p1, t2p2 ?? null, now);
   matchIds.push(lastInsertRowid);
   ```

3. Response: `return c.json({ started, slated: slated > 0, slated_count: slated, slate_ids: slateIds, match_ids: matchIds });`

`server/routes/automatch.test.js`, after line 109: `assert.deepEqual(body.match_ids?.length, 2, "started match ids returned for undo");`

**Verify**: `bun run --cwd tests test:server` → exit 0.

### Step 2: One click, no dialog, long Undo

1. `client/src/components/Toast.jsx` — make the lifetime a per-call option (default unchanged):

   ```js
   // `undo` is the toast's one action; `label` renames it (default "Undo");
   // `duration` (ms) overrides the 3.5 s lifetime for actions that need a
   // longer undo window
   const toast = useCallback((message, type = "info", { undo, label, duration = 3500 } = {}) => {
     if (timerRef.current) clearTimeout(timerRef.current);
     setState({ message, type, undo, label });
     timerRef.current = setTimeout(() => {
       setState(null);
       timerRef.current = null;
     }, duration);
   }, []);
   ```

2. `client/src/App.jsx`:
   - Next to `const [pendingBusy, setPendingBusy] = useState(false);` add `const [smartBusy, setSmartBusy] = useState(false);`.
   - Replace `handleSmartMatch` (lines 74-104) with:

     ```js
     // header "✨ Smart Match": one click. Free courts get their lineups at once
     // and the rest land on On Deck (topping it up to the deck cap) — there is
     // no preview dialog: the result is on screen and the toast's Undo takes
     // the whole click back. While the session is paused only the deck part
     // runs (slating is fine on a frozen clock; starting a match isn't).
     async function handleSmartMatch() {
       if (!session || smartBusy) return;
       setSmartBusy(true);
       try {
         const opts = session.paused_at != null ? { slate_only: true } : {};
         const { plan } = await autoMatch(session.id, { dry_run: true, ...opts });
         if (!plan || (!plan.matches.length && !plan.slate.length)) {
           toast("Nothing to auto-match", "info");
           return;
         }
         const r = await autoMatch(session.id, { ...opts, plan });
         const what = [
           r.started ? `${r.started} started${plan.matches[0]?.format === "singles" ? " (singles)" : ""}` : "",
           r.slated_count ? `${r.slated_count} added to On Deck` : "",
         ]
           .filter(Boolean)
           .join(" · ");
         toast(what, "success", {
           // this click can put players on a court — leave the Undo on screen
           // longer than a normal toast
           duration: r.started ? 15000 : 3500,
           undo: () =>
             Promise.all([
               // a match that already ended (404/409) or a lineup that already
               // left the deck (404) has nothing left to take back
               ...(r.match_ids ?? []).map((id) =>
                 abortMatch(id).catch((err) => {
                   if (err?.status !== 404 && err?.status !== 409) throw err;
                 }),
               ),
               ...(r.slate_ids ?? []).map((id) =>
                 cancelSlate(id).catch((err) => {
                   if (err?.status !== 404) throw err;
                 }),
               ),
             ]).then(() => true),
         });
       } catch (err) {
         toast(err?.data?.error ?? (err?.status ? err.message : "Auto-match failed"), "error");
       } finally {
         setSmartBusy(false);
       }
     }
     ```

     (`abortMatch` and `cancelSlate` are already imported at the top of `App.jsx`.)
   - Delete `confirmSmartMatch` entirely (lines 140-166).
   - In `confirmPending`, delete the line `if (pending.kind === "smart") return confirmSmartMatch(pending.plan);`.
   - Update the pending-start comment (lines 59-60) to the two kinds that remain: `{ kind:'manual', … } | { kind:'promote', … }`.
   - Delete the `slate: [],` lines at (current) lines 329 and 504.
   - In the dialog render (lines 660-673) delete the three props `slate={pending.slate}`, `title={…}` and `confirmText={…}`.
3. `client/src/components/StartMatchConfirmDialog.jsx`:
   - Remove the `title`, `confirmText` and `slate` props from the signature.
   - Replace `{title ?? (n > 1 ? "Start these matches?" : n === 1 ? "Start this match?" : "Slate next lineup?")}` with the inner ternary alone; replace `{confirmText ?? confirmLabel}` with `{confirmLabel}`.
   - Delete the whole `{slate.length > 0 && ( … )}` block (lines 102-111).
   - Update the file's and the component's doc comments: they say every start "including Smart Match" asks for confirmation first — now only manual starts and slate promotion do.
   - Leave `export { balanceHint };` and the `Row` component as they are.
4. `client/src/components/Header.jsx`: `title="Fill the free courts and line up the next matches on On Deck"`.

**Verify**: `bun run --cwd client build` → exit 0; `bunx biome check` → exit 0; `grep -n 'confirmSmartMatch\|kind: "smart"\|kind === "smart"\|start-confirm-slate' client/src/App.jsx client/src/components/StartMatchConfirmDialog.jsx` → no matches; `cd tests && bunx playwright test 27-start-confirm.spec.js` → every test except 27.5 still passes (27.5 is rewritten in Step 3).

### Step 3: Re-point the Smart Match e2e specs

All five specs set up with `fullSetup` (8 players, 2 free courts) except `24`, which builds its session through the setup UI with one court.

- `tests/e2e/10-smart-manual-mode.spec.js` — replace 10.5 with:

  ```js
  test("10.5 header Smart Match runs in one click — no dialog; the free courts start at once", async ({
    page,
  }) => {
    await page.getByTestId("btn-smart-match").click();
    await expect(page.getByTestId("start-confirm-dialog")).toHaveCount(0);
    await expect(page.getByTestId("toast")).toContainText("2 started");
    const st = await liveState(page);
    expect(st.activeMatches).toHaveLength(2); // both free courts
    expect(st.slatedMatches).toHaveLength(0); // 8 players — nobody left for On Deck
    // queue untouched too — Smart Match never selects from the queue
    await expect(page.locator("text=selected →")).toHaveCount(0);
  });
  ```

- `tests/e2e/19-queue-master.spec.js` — replace QM.3 with:

  ```js
  test("QM.3 Smart Match uses only waiting players — never the four on court", async ({ page }) => {
    await fullSetup(page);
    const initialCount = await page.locator("[data-entry-id]").count();

    await startDoublesMatch(page);

    const waitingCount = await page.locator("[data-entry-id]").count();
    expect(waitingCount).toBe(initialCount - 4);
    const liveId = (await liveState(page)).activeMatches[0].id;

    // one court busy, four waiting: Smart Match starts exactly those four on the
    // free court and leaves the live match alone
    await page.getByTestId("btn-smart-match").click();
    await expect(page.getByTestId("toast")).toContainText("1 started");
    const st = await liveState(page);
    expect(st.activeMatches).toHaveLength(2);
    expect(st.activeMatches.map((m) => m.id)).toContain(liveId);
    expect(st.slatedMatches).toHaveLength(0);
  });
  ```

- `tests/e2e/24-app-wiring.spec.js` — replace 24.1 and 24.2:

  ```js
  test("24.1 Smart Match in one click: fills the free court, the rest go to On Deck", async ({ page }) => {
    await createSession(page, { courts: 1 });
    await checkinPlayers(page, [
      "Inter C1",
      "Inter C2",
      "Inter C3",
      "Inter C4",
      "Expert E1",
      "Expert E2",
      "Upper D1",
      "Upper D2",
    ]);
    await startSession(page);
    await page.getByTestId("btn-smart-match").click(); // no confirm dialog
    const toast = page.getByTestId("toast");
    await expect(toast).toContainText("1 started · 1 added to On Deck");
    await expect(page.getByTestId("court-winner-1")).toHaveCount(1); // the free court is live
    await expect(page.getByTestId("on-deck-count")).toHaveText("1");
  });

  test("24.2 Smart Match with only 2 waiting starts a singles game on the free court", async ({ page }) => {
    await createSession(page, { courts: 1 });
    await checkinPlayers(page, ["Inter C1", "Inter C2"]);
    await startSession(page);
    await page.getByTestId("btn-smart-match").click();
    await expect(page.getByTestId("toast")).toContainText("(singles)");
    await expect(page.getByTestId("start-confirm-dialog")).toHaveCount(0);
    await expect(page.getByTestId("court-winner-1")).toHaveCount(1);
  });
  ```

  (`court-winner-1` is the live-court signal introduced by plan 006. If plan 006 has **not** landed, use `page.getByRole("button", { name: "End Match" })` there instead and say so in your report.)

- `tests/e2e/27-start-confirm.spec.js` — replace 27.5 with, and update the file's header comment ("every start (manual + Smart Match) asks for confirmation first" → manual starts and slate promotion only):

  ```js
  test("27.5 Smart Match needs no confirm dialog — and its Undo takes the whole click back", async ({
    page,
  }) => {
    await page.getByTestId("btn-smart-match").click();
    await expect(page.getByTestId("start-confirm-dialog")).toHaveCount(0);
    await expect(page.getByTestId("toast")).toContainText("2 started");
    expect((await liveState(page)).activeMatches).toHaveLength(2);

    await page.getByTestId("toast-undo").click();
    await expect(page.getByTestId("toast")).toContainText("Undone");
    const st = await liveState(page);
    expect(st.activeMatches).toHaveLength(0);
    expect(st.slatedMatches).toHaveLength(0);
    expect(st.queue.filter((q) => q.status === "waiting")).toHaveLength(8);
  });
  ```

- `tests/e2e/29-layout.spec.js` — replace 29.5 with, and drop "and slate-first Smart Match" from the file's header comment:

  ```js
  test("29.5 Smart Match starts the free courts in one click — nothing waits in a dialog", async ({ page }) => {
    await page.getByTestId("btn-smart-match").click();
    await expect(page.getByTestId("start-confirm-dialog")).toHaveCount(0);
    await expect(page.getByTestId("toast")).toContainText("2 started");
    const st = await liveState(page);
    expect(st.activeMatches).toHaveLength(2);
    expect(st.slatedMatches).toHaveLength(0); // 8 players, 2 courts — nobody left for On Deck
  });
  ```

Remove any helper import a spec no longer uses (Biome flags them).

**Verify**: `bunx biome check` → exit 0; `grep -rn "start-confirm-slate\|Add these lineups" tests/e2e client/src` → no matches; `cd tests && bunx playwright test 10-smart-manual-mode.spec.js 19-queue-master.spec.js 24-app-wiring.spec.js 27-start-confirm.spec.js 29-layout.spec.js 28-on-deck.spec.js 34-undo.spec.js 33-pause-session.spec.js` → all pass.

### Step 4: Docs tell the new truth

- `README.md` "What it does" — replace the **On Deck slate** and **Smart Match** bullets (lines 47-51) with:

  ```markdown
  - **On Deck slate** — build lineups manually or let Smart Match fill it;
    slates auto-promote to the next free court; manual lineups never start
    without a confirm.
  - **Smart Match** — one click: a matching heuristic (wait time, games played,
    skill variance, team balance, pair redundancy) fills every free court and
    tops up On Deck. No preview dialog — the result is on screen and the toast's
    Undo takes the whole click back. [Algorithm deep-dive →](docs/algorithm.md)
  ```

- `docs/architecture.md` "Smart Match (as implemented)" — replace its last sentence (`The UI never slates without showing you the plan.`) with:

  ```
  The UI makes both calls from one click on **Smart Match** (there is no preview
  dialog): lineups for free courts are started and the rest land on On Deck, up
  to `SLATE_CAP` (3) lineups counted across existing ones. While the session is
  paused the client sends `slate_only: true`, so only the deck part runs. The
  response carries `match_ids` and `slate_ids` so the toast's Undo can take the
  whole click back.
  ```

- `docs/todo.md` line 8 — replace its parenthetical with the one-click wording:

  ```text
  old: (`{dry_run:true}` → `{plan}`, executes exactly it, 409 on stale queue)
  new: (no dialog; executes exactly it, 409 on stale queue)
  ```

  Line 11: replace `header Smart Match dry-run→confirm and the builder smart fill are the smart paths` with `header Smart Match (one click) and the builder smart fill are the smart paths`.
- `CHANGELOG.md` under `## [Unreleased]` → `### Changed`, add:
  `- **Smart Match is one click.** It fills every free court and tops up On Deck (up to 3 lineups); the preview dialog is gone. The success toast's **Undo** takes the whole click back and stays for 15 s when games were started. With 2–3 players waiting it still falls back to a singles game, now without asking.`

**Verify**: `grep -n "never writes without showing\|never slates without showing\|dry-run→confirm" README.md docs/architecture.md docs/todo.md` → no matches.

## Test plan

- API-level: `automatch.test.js` asserts `match_ids` comes back with one id per started match (Step 1).
- Browser (UI re-render only): 10.5 and 29.5 (one click, no dialog, both courts live), 19 QM.3 (never touches players on court), 24.1 (court + deck in one click), 24.2 (singles fallback), 27.5 (Undo restores everyone to waiting).
- Unchanged-on-purpose specs to keep green: `28-on-deck` (the builder's Smart add has no dialog and must stay that way), `34-undo`, `33-pause-session`.
- Structural pattern for the rewrites: the existing tests they replace.

## Done criteria

Machine-checkable. ALL must hold:

- [ ] `grep -n "match_ids" server/routes/automatch.js server/routes/automatch.test.js` matches in both files
- [ ] `grep -n 'confirmSmartMatch\|kind: "smart"\|kind === "smart"' client/src/App.jsx` → no matches
- [ ] `grep -n "duration" client/src/components/Toast.jsx` matches
- [ ] `grep -rn "start-confirm-slate\|Add these lineups" tests/e2e client/src` → no matches
- [ ] `bunx biome check`, `bun run --cwd client build`, `bun run --cwd tests test:server` all exit 0
- [ ] `cd tests && bunx playwright test 10-smart-manual-mode.spec.js 19-queue-master.spec.js 24-app-wiring.spec.js 27-start-confirm.spec.js 29-layout.spec.js 28-on-deck.spec.js 34-undo.spec.js 33-pause-session.spec.js` passes
- [ ] `git status --short` lists only in-scope files
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- The code at the locations in "Current state" doesn't match the excerpts (drift).
- A spec outside the five listed fails after Step 2 because of the missing Smart Match dialog — report which one; do not re-add the dialog.
- Adding `match_ids` breaks a test that compares the whole response body with `deepEqual` — report it instead of editing that assertion.
- 27.5's Undo step fails twice (the matches are not aborted, or "Undone" never appears) — report the failing state; do not weaken the assertions.
- The server answers something other than 200 to the immediate dry-run → plan commit in 10.5 / 29.5 (for example a 409 "Queue changed"): that would mean the queue moves between the two calls on a quiet test server and needs a person to look.

## Maintenance notes

- The toast lifetime is now per call. `duration` is set in exactly one place (Smart Match, 15 s when games were started). Keep the default at 3500 — every other toast relies on it.
- Smart Match is the only start path with no pre-start review. If accidental starts ever become a problem, the smallest fix is a confirm **only when `plan.matches.length > 0`** (deck-only clicks stay one click) — do not bring back the slate preview.
- While paused, Smart Match only fills the deck (`slate_only: true`). The server still refuses to start a match on a frozen clock.
- Reviewer focus: (1) the Undo aborts exactly `r.match_ids` and cancels exactly `r.slate_ids`, tolerating only 404/409; (2) nothing else constructs a `pending` object with `kind: "smart"`; (3) `StartMatchConfirmDialog` still renders the manual-start and promote dialogs unchanged (`27-start-confirm.spec.js` 27.1–27.4 green).
- Plan 008 builds on this: once the deck refills itself, Smart Match is pressed about once per session (at the start) rather than every few games.

## Execution notes — 2026-11-26

- Executed after plan 006 in the same worktree (branch `worktree-agent-afe675af5aeae3ed0`): `566b752` server response, `e1f2c4e` client, `16051d8` e2e, `525156f` docs.
- **Review round 1 — two test gaps, closed in `a5eba22`**: repurposing 24.2 removed the only e2e for the "Nothing to auto-match" toast (restored as a new test in `24-app-wiring.spec.js`), and the `match_ids` assertion compared only a length (now compared with the ids of the started matches).
- `StartMatchConfirmDialog.jsx` has no file-level doc comment; only the component doc was updated.
- Biome `--write` was needed on three in-scope files for lines over 110 characters (`automatch.js`, `StartMatchConfirmDialog.jsx`, `24-app-wiring.spec.js`).
