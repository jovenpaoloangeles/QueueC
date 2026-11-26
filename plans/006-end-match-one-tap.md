# Plan 006: End a game in one tap — winner buttons on the court card and a per-session points preset

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**:
> `git diff --stat 249a874..HEAD -- client/src/components/CourtCard.jsx client/src/components/ConfirmEndDialog.jsx client/src/components/EndMatchModal.jsx client/src/components/CourtsRow.jsx client/src/components/SetupScreen.jsx server/db.js server/db.migration.test.js server/routes/sessions.js server/routes/sessions.test.js tests/helpers.js tests/e2e`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition. (`client/src/App.jsx` is large and
> other work may touch it — only the one block cited below, the `endTarget`
> modal near the end of `LiveView`, has to match.)

## Status

- **Priority**: P1
- **Effort**: M (two small features; most of the work is a mechanical sweep of e2e specs)
- **Risk**: LOW (UI re-arrangement + one additive column with a default; no state-machine change)
- **Depends on**: none
- **Category**: dx
- **Planned at**: commit `249a874`, 2026-11-26

## Why this matters

A queue master (QM) running a 40-game session ends 40 games. Today each one costs three clicks and two typed fields: **End match** → a "Conclude live match?" dialog whose only real question is **Who won?** → the score form, where the winner's score is pre-filled with a hard-coded `31` and both scores must be typed anyway. A club playing to 21 retypes the winner's score every single game.

After this plan a game costs **one tap + one typed number + Enter**:

1. The two "who won?" choices move onto the court card, one button under each team. Tapping it opens the score form directly — the confirm dialog is deleted.
2. The cursor lands in the **loser's** score field, so the QM types one number and presses Enter.
3. The winner's preset is no longer hard-coded: the setup screen gets a **Points per game** select (11 / 15 / 21 / 31, default 31), stored on the session.

Both scores stay required and the server keeps rejecting ties. "Winner-only" results (no loser score) were considered and **declined by the maintainer** — do not add them.

## Current state

Where things live:

- `client/src/components/CourtCard.jsx` — one court card. Live courts render the two teams, then a footer with **Sub** and **End match**. Owns the end-flow dialog flags.
- `client/src/components/ConfirmEndDialog.jsx` — the "Conclude live match?" gate. Only `CourtCard.jsx` imports it.
- `client/src/components/EndMatchModal.jsx` — the score form (scores, shuttles, 1–5 star rating). Already accepts a `winner` prop and presets that side.
- `client/src/components/CourtsRow.jsx` — renders one `CourtCard` per court; receives `session` from `App.jsx` but does not currently read it.
- `client/src/App.jsx` — `LiveView`; renders an `EndMatchModal` for the keyboard `e` shortcut (`endTarget`).
- `client/src/components/SetupScreen.jsx` — session setup; the per-session rule selects live here (check-in order, consecutive cap, rest games).
- `server/db.js` — schema + migrations. `server/routes/sessions.js` — `POST /sessions` validation and insert.
- `server/routes/sessions.test.js` — API-level test for the per-session settings (`rotationSettingsTest`).
- `server/db.migration.test.js` — asserts the exact set of `sessions` columns after migration (both "missing" and "unexpected" directions).
- `tests/helpers.js` — shared e2e helpers, including `endMatch`, `startDoubles`, `expectMatchLive`, all of which locate the **End Match** button by role name.
- `tests/e2e/*.spec.js` — Playwright specs; many use "End Match" as their "a match is live" signal.

Excerpts (as of `249a874`):

`client/src/components/CourtCard.jsx:9`, `:221-223`, `:237-243` — import, dialog flags, and the vanish-guard effect:

```jsx
import ConfirmEndDialog from "./ConfirmEndDialog.jsx";
```

```jsx
const [showEnd, setShowEnd] = useState(false);
const [showConfirm, setShowConfirm] = useState(false);
const [showSub, setShowSub] = useState(false);
```

```jsx
useEffect(() => {
  if (!isActive) {
    setShowEnd(false);
    setShowConfirm(false);
    setShowSub(false);
  }
}, [isActive]);
```

`client/src/components/CourtCard.jsx:353-373` — the live card's team grid (two `TeamPanel`s either side of "VS"):

```jsx
      {isActive && (
        <CardContent className="flex flex-col gap-3 px-4">
          <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3">
            <TeamPanel
              side={1}
              entryIds={[match.team1_p1, match.team1_p2]}
              queue={queue}
              matchId={match.id}
              match={match}
            />
            <span className="text-[11px] font-bold uppercase tracking-[0.14em] text-muted-foreground/70">
              VS
            </span>
            <TeamPanel
              side={2}
              entryIds={[match.team2_p1, match.team2_p2]}
              queue={queue}
              matchId={match.id}
              match={match}
            />
          </div>
```

`client/src/components/CourtCard.jsx:412-420` — the footer buttons (the grid above is followed by a `<div className="flex flex-wrap items-center gap-x-2 gap-y-1">` holding the format line, an optional **Extend Court** button, then):

```jsx
            <Button
              variant="ghost"
              size="sm"
              className="rounded-full"
              data-testid="btn-substitute"
              onClick={() => setShowSub(true)}
            >
              Sub
            </Button>
            <Button variant="outline" size="sm" className="rounded-full" onClick={() => setShowConfirm(true)}>
              End match
            </Button>
```

`client/src/components/CourtCard.jsx:527-543` — the gate feeds the score form:

```jsx
…
      <ConfirmEndDialog
        open={showConfirm}
        onOpenChange={setShowConfirm}
        teamNames={teamNames}
        onConfirm={(winner) => {
          setShowConfirm(false);
          setShowEnd(winner ?? true);
        }}
      />
      {showEnd && match && (
        <EndMatchModal
          match={match}
          courtLabel={court.label}
          teamNames={teamNames}
          winner={showEnd === "team1" || showEnd === "team2" ? showEnd : null}
          onClose={() => setShowEnd(false)}
        />
```

`teamNames` is already computed just above the effect (`:231-233`) as `{ team1: "A & B", team2: "C & D" }` from the queue.

`client/src/components/EndMatchModal.jsx:17-24` — the hard-coded preset:

```jsx
/** Step 2 of the End Match flow: final score, shuttle usage and match rating. */
export default function EndMatchModal({ match, courtLabel, teamNames, winner, onClose }) {
  // scores start empty (not 0) so users type "31", never "031"; a winner picked
  // in the confirm dialog presets the winning side to 31
  const [scores, setScores] = useState({
    team1: winner === "team1" ? 31 : (match.team1_score ?? ""),
    team2: winner === "team2" ? 31 : (match.team2_score ?? ""),
  });
```

`client/src/components/EndMatchModal.jsx:90-93` and `:110-113` — both inputs; only Team 1 has `autoFocus` today:

```jsx
                <Input
                  id="end-match-team1"
                  aria-label="Team 1 score"
                  autoFocus
```

```jsx
                <Input
                  id="end-match-team2"
                  aria-label="Team 2 score"
```

`client/src/components/App.jsx:652-658` — the keyboard `e` path renders the same form with no winner:

```jsx
…
      {endTarget && (
        <EndMatchModal
          match={endTarget.match}
          courtLabel={endTarget.courtLabel}
          onClose={() => setEndTarget(null)}
        />
      )}
```

`client/src/components/App.jsx:600-601` — `CourtsRow` already receives the session row:

```jsx
            <CourtsRow
              session={session}
```

`client/src/components/CourtsRow.jsx:17-31` — …but does not destructure it (the list starts `courts, serverTime, activeMatches, queue, …`), and `:82-86` renders each card:

```jsx
            <CourtCard
              key={court.id}
              court={court}
              match={activeMatches.find((m) => m.court_number === court.id) ?? null}
              queue={queue}
```

`server/db.js:46-57` — the `sessions` table; the conditional column adds for this table live at `:300-321`:

```js
const sessionCols = new Set(
  db
    .prepare("PRAGMA table_info(sessions)")
    .all()
    .map((c) => c.name),
);
```

```js
if (!sessionCols.has("checkin_order")) {
  db.exec("ALTER TABLE sessions ADD COLUMN checkin_order TEXT NOT NULL DEFAULT 'alphabetical'");
}
```

`server/routes/sessions.js:37-47`, `:67-80` — create validation and insert (the pattern to copy):

```js
const {
  name,
  scheduled_start,
  scheduled_end,
  court_count,
  courts,
  checkin_order,
  max_consecutive,
  rest_games,
} = await c.req.json().catch(() => ({}));
```

```js
  const restGames = rest_games ?? 0;
  if (!Number.isInteger(restGames) || restGames < 0 || restGames > 3) {
    return c.json({ error: "rest_games must be an integer 0–3" }, 400);
  }
  const order = checkin_order ?? "alphabetical";
  const { lastInsertRowid } = db
    .prepare(
      "INSERT INTO sessions (name, scheduled_start, scheduled_end, court_count, checkin_order, max_consecutive, rest_games) VALUES (?, ?, ?, ?, ?, ?, ?)",
    )
    .run(name, scheduled_start, scheduled_end, count, order, maxConsec, restGames);
```

`server/db.migration.test.js:74-98` — the strict column list:

```js
  "court_fee",
  "shuttle_price",
  "fee_split",
];
```

```js
const extra = got.filter((c) => !expected.includes(c));
assert.deepEqual(extra, [], `sessions has unexpected columns: ${extra.join(", ")}`);
```

`client/src/components/SetupScreen.jsx:243-245`, `:351-356`, `:473-490` — setup state, the `createSession` body, and the "Rest between games" select (the pattern to copy):

```jsx
const [maxConsecutive, setMaxConsecutive] = useState(2);
const [restGames, setRestGames] = useState(0);
```

```jsx
      const { session } = await createSession({
        name: name.trim() || fmtSessionName(),
        scheduled_start: scheduledStart,
        scheduled_end: scheduledStart + Math.round(maxHours * 3600),
        court_count: courts.length,
        checkin_order: checkinOrder,
        max_consecutive: maxConsecutive,
        rest_games: restGames,
```

```jsx
…
              <div className="flex flex-1 flex-col gap-1.5">
                <Label htmlFor="setup-rest-games">Rest between games</Label>
                <select
                  id="setup-rest-games"
                  aria-label="Rest between games"
                  data-testid="setup-rest-games"
                  className="h-9 rounded-md border border-border bg-card px-3 text-sm text-foreground"
                  value={restGames}
                  onChange={(e) => setRestGames(Number(e.target.value))}
                >
                  <option value="0">Off</option>
                  {[1, 2, 3].map((n) => (
                    <option key={n} value={n}>
                      {n} game{n > 1 ? "s" : ""}
                    </option>
                  ))}
                </select>
              </div>
```

`tests/helpers.js:127-141`, `:200-204`, `:233-236` — the three helpers that find the button by role name:

```js
export async function endMatch(page, _courtLabel, { team1 = 21, team2 = 15 } = {}) {
  // Use 'End Match' button directly (avoids strict-mode issues with partial court label matches)
  await page.getByRole("button", { name: "End Match" }).first().click();
  // two-step flow: the confirm gate appears first, then the finalization form
  const confirmEnd = page.getByTestId("confirm-end-end");
  if (await confirmEnd.isVisible().catch(() => false)) await confirmEnd.click();
  await page.getByLabel("Team 1").fill(String(team1));
  await page.getByLabel("Team 2").fill(String(team2));
  await page.getByRole("button", { name: "Confirm" }).click();
  // finalized once the modal unmounts
  await page
    .getByRole("dialog")
    .waitFor({ state: "detached", timeout: 5000 })
    .catch(() => {});
}
```

```js
await clickStartMatch(page);
if (expectEndMatch) await expect(page.getByRole("button", { name: "End Match" })).toHaveCount(1);
```

```js
/** Wait until any 'End Match' button exists — i.e. the started match landed. */
export async function expectMatchLive(page) {
  await expect(page.getByRole("button", { name: "End Match" }).first()).toBeVisible();
}
```

Conventions that apply:

- **Beating a base `Button` class**: the shared `Button` (`client/src/components/ui/button.jsx`) is `whitespace-nowrap` with a fixed height per size. This repo overrides a base class with the trailing `!` important modifier, never by relying on class order — see the comment at `CourtCard.jsx:293` ("items-center! is important so it beats base items-start regardless of emission order").
- **Accessible names must stay the real team names** (ROADMAP "Named teams in score & UI"): never label a team "Team 1".
- Server tests are self-contained `node:assert/strict` scripts against a throwaway server; per-session settings are tested in `server/routes/sessions.test.js` (`rotationSettingsTest`, `:277-330`). Model the new cases on it.
- New `sessions` columns: add to `CREATE TABLE`, add a conditional `ALTER`, and add the name to the `expected` list in `server/db.migration.test.js`.
- Code comments explain _why_. Keep that style; update comments that this change makes untrue.
- Commit style: conventional commits, one logical change per commit (`CONTRIBUTING.md:38`).

## Commands you will need

Run from the repo root unless noted. In a fresh git worktree run `bun run install:all` first.

| Purpose          | Command                                                                          | Expected on success                         |
| ---------------- | -------------------------------------------------------------------------------- | ------------------------------------------- |
| Install          | `bun run install:all`                                                            | exit 0                                      |
| Lint             | `bunx biome check`                                                               | exit 0 (warnings allowed, no errors)        |
| Client build     | `bun run --cwd client build`                                                     | exit 0                                      |
| Server/API tests | `bun run --cwd tests test:server`                                                | exit 0, every file prints its "passed" line |
| Unit tests       | `bun run --cwd tests test:unit`                                                  | exit 0                                      |
| One or more e2e  | `cd tests && bunx playwright test 08-match-end.spec.js 16-accessibility.spec.js` | all listed specs pass                       |

## Scope

**In scope** (the only files you should modify):

- `client/src/components/CourtCard.jsx`
- `client/src/components/ConfirmEndDialog.jsx` (deleted)
- `client/src/components/EndMatchModal.jsx`
- `client/src/components/CourtsRow.jsx`
- `client/src/App.jsx` (the `endTarget` `<EndMatchModal>` only)
- `client/src/components/SetupScreen.jsx`
- `server/db.js`, `server/routes/sessions.js`, `server/routes/sessions.test.js`, `server/db.migration.test.js`
- `tests/helpers.js`
- `tests/e2e/07-match-start.spec.js`, `08-match-end.spec.js`, `10-smart-manual-mode.spec.js`, `12-live-courts.spec.js`, `16-accessibility.spec.js`, `19-queue-master.spec.js`, `20-init-phase.spec.js`, `25-court-expiry.spec.js`, `27-start-confirm.spec.js`, `28-on-deck.spec.js`, `39-named-teams.spec.js`, `41-rotation-settings.spec.js`, `49-v15-ux.spec.js`
- `README.md`, `docs/todo.md`, `CHANGELOG.md`

**Out of scope** (do NOT touch, even though they look related):

- Score validation in `EndMatchModal.jsx` and `server/routes/matches.js` — both scores stay required, ties stay rejected. No "winner only" path.
- `client/src/components/CorrectMatchDialog.jsx` — the history-page editor never presets a score; nothing to change.
- `client/src/lib/utils.js` `LAST_CALL_SECS` — the last-call warning still assumes a fixed 20 minutes (written for 31-point games). Its own `ponytail:` note names the upgrade; leave it.
- The keyboard `e` shortcut (`App.jsx` `endLongestMatch`) — it keeps opening the form with both scores empty.
- `docs/superpowers/plans/2026-10-22-v1.1-session-polish.md` — a historical plan that mentions `ConfirmEndDialog`; history is not rewritten.

## Git workflow

- Branch: `advisor/006-end-match-one-tap`
- Commit per step: `feat(client): …`, `feat(server): …`, `test(e2e): …`, `docs: …` — e.g. `feat(client): tap the winning team to end a game — the confirm gate only asked "who won?"`
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Winner buttons on the court card; delete the confirm gate

All in `client/src/components/CourtCard.jsx` unless noted.

1. Delete the import on line 9 (`import ConfirmEndDialog from "./ConfirmEndDialog.jsx";`).
2. Delete the `showConfirm` state line (`const [showConfirm, setShowConfirm] = useState(false);`).
3. In the vanish-guard effect, delete `setShowConfirm(false);` (keep `setShowEnd(false);` and `setShowSub(false);`).
4. In the live card's team grid, keep the two `TeamPanel`s and the "VS" span exactly as they are, and add three more rows' worth of children **inside the same `<div className="grid grid-cols-[1fr_auto_1fr] …">`**, after the second `TeamPanel`:

   ```jsx
   {/* one tap on the winning team opens the score form with that side
       preset — nothing is written until the form is confirmed */}
   <p
     data-testid="court-who-won"
     className="col-span-3 pt-1 text-center text-2xs uppercase tracking-wider text-muted-foreground"
   >
     Who won? Tap the team
   </p>
   <Button
     variant="outline"
     size="sm"
     className="h-auto! min-h-7 whitespace-normal! rounded-lg py-1 text-left leading-tight"
     data-testid="court-winner-1"
     aria-label={`${teamNames.team1} won`}
     onClick={() => setShowEnd("team1")}
   >
     {teamNames.team1}
   </Button>
   <span aria-hidden="true" />
   <Button
     variant="outline"
     size="sm"
     className="h-auto! min-h-7 whitespace-normal! rounded-lg py-1 text-left leading-tight"
     data-testid="court-winner-2"
     aria-label={`${teamNames.team2} won`}
     onClick={() => setShowEnd("team2")}
   >
     {teamNames.team2}
   </Button>
   ```

   Grid auto-placement puts the caption on its own full-width row and one button under each team (`1fr _ 1fr`); the empty `<span />` is the middle cell.
5. In the footer, delete the **End match** button (the `<Button variant="outline" size="sm" className="rounded-full" onClick={() => setShowConfirm(true)}>End match</Button>` block). Keep **Sub** and the optional **Extend Court** button.
6. Delete the whole `<ConfirmEndDialog … />` block (lines 527-535). The `<EndMatchModal … />` right below it stays as is — it already maps `showEnd` to a `winner`.
7. In `client/src/components/EndMatchModal.jsx`:
   - Replace the component's doc comment and the preset comment so they no longer describe a "step 2" or a "confirm dialog": e.g. `/** The End Match score form: final score, shuttle usage and match rating. */` and `// scores start empty (not 0) so users type "31", never "031"; a winner tapped on the court card presets the winning side`.
   - Focus the **loser's** field: on the `end-match-team1` input make it `autoFocus={winner !== "team1"}` and on the `end-match-team2` input add `autoFocus={winner === "team1"}`. (No winner → Team 1 is focused, exactly as today.)
8. Delete the file `client/src/components/ConfirmEndDialog.jsx` (`git rm`).

**Verify**: `bun run --cwd client build` → exit 0; `bunx biome check` → exit 0; `test ! -e client/src/components/ConfirmEndDialog.jsx && echo gone` → `gone`; `grep -n "showConfirm\|ConfirmEndDialog" client/src/components/CourtCard.jsx` → no matches.

### Step 2: Re-point the e2e helpers and specs

Land this in the same commit as Step 1 — the suite is red in between.

`tests/helpers.js`:

- `endMatch` — replace the first four lines of the body (the role-name click and the gate click) with a tap on the winning side. The `fill` calls stay (they overwrite the preset, so callers still get exactly the scores they ask for):

  ```js
  export async function endMatch(page, _courtLabel, { team1 = 21, team2 = 15 } = {}) {
    // Tap the winning side on the first live court — that opens the score form
    // with the winner's score preset; both scores are then typed explicitly.
    const winner = team1 >= team2 ? 1 : 2;
    await page.getByTestId(`court-winner-${winner}`).first().click();
    await page.getByLabel("Team 1").fill(String(team1));
    await page.getByLabel("Team 2").fill(String(team2));
    await page.getByRole("button", { name: "Confirm" }).click();
    // finalized once the modal unmounts
    await page
      .getByRole("dialog")
      .waitFor({ state: "detached", timeout: 5000 })
      .catch(() => {});
  }
  ```

- `startDoubles` — `if (expectEndMatch) await expect(page.getByTestId("court-winner-1")).toHaveCount(1);` and update its doc comment (`expectEndMatch` now waits for the winner button).
- `expectMatchLive` — `await expect(page.getByTestId("court-winner-1").first()).toBeVisible();` and its doc comment.

Specs — three mechanical rules, then the per-test rewrites:

- **Rule A — "a match is live" signal.** Every `page.getByRole("button", { name: "End Match" })` or `page.locator("text=End Match")` used in a `toHaveCount` / `toBeVisible` assertion becomes `page.getByTestId("court-winner-1")`.
- **Rule B — opening the form.** The two-line sequence `… "End Match" }).first().click();` followed by `await page.getByTestId("confirm-end-end").click();` collapses to `await page.getByTestId("court-winner-1").first().click();`. Any following `fill("21")` / `fill("15")` lines stay as they are (Team 1 is the tapped winner, and they set Team 1 as the winner — consistent).
- **Rule C — no leftovers.** When you are done, `grep -rn 'name: "End Match"\|text=End Match\|confirm-end' tests/ client/src` must print nothing. (The only "End Match" text that remains anywhere is the score form's own title, asserted in `37-shortcuts.spec.js` — leave that spec alone.)

Per-test edits (line numbers as of `249a874`):

| Spec                          | Edit                                                                                                                                                                                                                                                                                                                                                             |
| ----------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `07-match-start`              | Lines 83, 86 (`text=End Match`) and 126, 128 → Rule A.                                                                                                                                                                                                                                                                                                           |
| `08-match-end` 8.1            | Rename to "8.1 tapping the winning team opens the score form"; body: `await page.getByTestId("court-winner-1").first().click(); await expect(page.getByRole("dialog")).toBeVisible();`                                                                                                                                                                           |
| `08-match-end` 8.2, 8.4       | Rule B.                                                                                                                                                                                                                                                                                                                                                          |
| `08-match-end` 8.3            | It asserts both inputs start empty. Rewrite it to use the keyboard path that still does that: title "8.3 the `e` shortcut opens the form with both scores empty"; replace the two click lines with `await page.keyboard.press("e");`; keep the two `toHaveValue("")` asserts.                                                                                    |
| `08-match-end` 8.10           | Rule B for the first click; **delete** the `confirm-end-end` visible assert; keep Cancel and the "dialog not visible" assert; the final "match still live" assert → `await expect(page.getByTestId("court-winner-1").first()).toBeVisible();`                                                                                                                    |
| `08-match-end` 8.11           | Rule B. The "Enter both scores" message still holds (the loser's field is empty).                                                                                                                                                                                                                                                                                |
| `08-match-end` 8.13           | Rule B; the last line → `await expect(page.getByTestId("court-winner-1").first()).toBeVisible();`                                                                                                                                                                                                                                                                |
| `10-smart-manual-mode`        | Line 38 → Rule A.                                                                                                                                                                                                                                                                                                                                                |
| `12-live-courts`              | Lines 27, 30 → Rule A.                                                                                                                                                                                                                                                                                                                                           |
| `16-accessibility` 16.2, 16.4 | Line 27 / 54 → Rule A; the next two lines (click + gate) → `await page.getByTestId("court-winner-1").first().click();`                                                                                                                                                                                                                                           |
| `16-accessibility`            | Add 16.5 (code below).                                                                                                                                                                                                                                                                                                                                           |
| `19-queue-master`             | Line 113 → Rule A.                                                                                                                                                                                                                                                                                                                                               |
| `20-init-phase`               | Lines 118, 130 → Rule A; lines 133-134 and 227-228 → Rule B.                                                                                                                                                                                                                                                                                                     |
| `25-court-expiry`             | Lines 35, 39 → Rule A.                                                                                                                                                                                                                                                                                                                                           |
| `27-start-confirm`            | Lines 28, 35, 61, 74 → Rule A.                                                                                                                                                                                                                                                                                                                                   |
| `28-on-deck`                  | Line 76 → Rule A.                                                                                                                                                                                                                                                                                                                                                |
| `39-named-teams` 39.1         | Rewrite: title "39.1 the winner buttons and the score form show the team names"; replace the click + `confirm-end-teams` lines with `await expect(page.getByTestId("court-winner-1")).toHaveText(team1);` and the same for `court-winner-2` / `team2`; then `await page.getByTestId("court-winner-1").first().click();` and keep the rest of the test unchanged. |
| `39-named-teams` 39.4         | Title → "39.4 tapping the winning team presets that side to 31"; replace the two clicks with `await page.getByTestId("court-winner-1").first().click();`; assertions unchanged.                                                                                                                                                                                  |
| `39-named-teams` 39.3         | Delete the test ("Enter on the confirm gate…") — the gate no longer exists.                                                                                                                                                                                                                                                                                      |
| `49-v15-ux` 49.3              | Replace the three lines (click, `confirmEnd` lookup, click) with `await page.getByTestId("court-winner-1").first().click();`                                                                                                                                                                                                                                     |

New test for `tests/e2e/16-accessibility.spec.js` (same setup style as 16.2):

```js
test("16.5 tapping the winning team puts the cursor in the loser's score field", async ({ page }) => {
  await fullSetup(page);
  for (let i = 0; i < 4; i++) await page.locator("[data-entry-id]").nth(i).click();
  await clickStartMatch(page);
  await page.getByTestId("court-winner-1").first().click(); // team 1 won → only team 2's score is left to type
  expect(await page.evaluate(() => document.activeElement?.id)).toBe("end-match-team2");
});
```

**Verify**: `grep -rn 'name: "End Match"\|text=End Match\|confirm-end' tests/ client/src` → no output; `bunx biome check` → exit 0 (it will flag imports a spec no longer uses — remove them); `cd tests && bunx playwright test 07-match-start.spec.js 08-match-end.spec.js 10-smart-manual-mode.spec.js 12-live-courts.spec.js 16-accessibility.spec.js 19-queue-master.spec.js 20-init-phase.spec.js 25-court-expiry.spec.js 27-start-confirm.spec.js 28-on-deck.spec.js 37-shortcuts.spec.js 39-named-teams.spec.js 49-v15-ux.spec.js` → all pass (net change in test count: 39.3 deleted, 16.5 added).

### Step 3: `points_to_win` on the session (server)

1. `server/db.js`
   - In `CREATE TABLE IF NOT EXISTS sessions`, after `rest_games INTEGER NOT NULL DEFAULT 0,` add `points_to_win INTEGER NOT NULL DEFAULT 31,`.
   - After the `checkin_order` conditional add (same `sessionCols` set):

     ```js
     if (!sessionCols.has("points_to_win")) {
       db.exec("ALTER TABLE sessions ADD COLUMN points_to_win INTEGER NOT NULL DEFAULT 31");
     }
     ```

2. `server/routes/sessions.js` `router.post("/")`
   - Add `points_to_win,` to the destructuring.
   - After the `rest_games` validation add:

     ```js
     const pointsToWin = points_to_win ?? 31;
     if (![11, 15, 21, 31].includes(pointsToWin)) {
       return c.json({ error: "points_to_win must be one of 11, 15, 21, 31" }, 400);
     }
     ```

   - Extend the `INSERT INTO sessions (…)` column list with `points_to_win` and its `?`, and pass `pointsToWin` as the last `.run(...)` argument.
3. `server/db.migration.test.js`: add `"points_to_win",` to the `expected` array (after `"fee_split",`). The test fails with "unexpected columns" until you do.
4. `server/routes/sessions.test.js` — in `rotationSettingsTest`, mirroring the existing cases:
   - After the `rest_games: 7` case add a rejected case `points_to_win: 17` → `assert.equal(badPoints.status, 400, …)` and a typed-wrong case `points_to_win: "21"` → 400.
   - In the `custom` session add `points_to_win: 21` and `assert.equal(custom.session.points_to_win, 21, "points_to_win persisted");`.
   - On `def` add `assert.equal(def.session.points_to_win, 31, "default points_to_win 31");`.

**Verify**: `bun run --cwd tests test:server` → exit 0 (in particular `db.migration.test.js: sessions migration parity passed` and the sessions file's "passed" line).

### Step 4: Points preset in the client

1. `client/src/components/SetupScreen.jsx`
   - Next to the other rule state: `const [pointsToWin, setPointsToWin] = useState(31);`
   - In `createSession({...})` add `points_to_win: pointsToWin,` after `rest_games: restGames,`.
   - After the "Rest between games" `<div>`, add the same markup shape (the `…` line marks the code above it — it is not part of the addition):

     ```jsx
     …
     <div className="flex flex-1 flex-col gap-1.5">
       <Label htmlFor="setup-points">Points per game</Label>
       <select
         id="setup-points"
         aria-label="Points per game"
         data-testid="setup-points"
         className="h-9 rounded-md border border-border bg-card px-3 text-sm text-foreground"
         value={pointsToWin}
         onChange={(e) => setPointsToWin(Number(e.target.value))}
       >
         {[11, 15, 21, 31].map((n) => (
           <option key={n} value={n}>
             to {n}
           </option>
         ))}
       </select>
     </div>
     ```

2. Pass the session value down to the form:
   - `client/src/components/CourtsRow.jsx`: add `session,` to the component's destructuring and `pointsToWin={session?.points_to_win}` on `<CourtCard …>`.
   - `client/src/components/CourtCard.jsx`: add `pointsToWin,` to the props and `pointsToWin={pointsToWin}` on `<EndMatchModal …>`.
   - `client/src/App.jsx` (the `endTarget` modal): add `pointsToWin={session?.points_to_win}`.
3. `client/src/components/EndMatchModal.jsx`: signature `({ match, courtLabel, teamNames, winner, onClose, pointsToWin = 31 })`; both `31` literals in the `useState` preset become `pointsToWin`, and the preset comment ends `… presets the winning side to the session's points per game`.
4. E2E in `tests/e2e/41-rotation-settings.spec.js` (add `clickStartMatch` to the helpers import):
   - In 41.2, after the `setup-rest-games` assert: `await expect(page.getByTestId("setup-points")).toHaveValue("31");`
   - New test:

     ```js
     test("41.3 points per game persists and presets the winner's score in the end-match form", async ({
       page,
     }) => {
       await page.goto("/");
       await page.getByTestId("setup-points").selectOption("21");
       for (const name of ["Inter C4", "Inter C2", "Inter C3", "Inter C1"]) await poolRow(page, name).click();
       await startSession(page);
       for (let i = 0; i < 4; i++) await page.locator("[data-entry-id]").nth(i).click();
       await clickStartMatch(page);
       await page.getByTestId("court-winner-1").first().click();
       const { session } = await (await page.request.get(`${base()}/api/sessions/active`)).json();
       expect(session.points_to_win).toBe(21);
       await expect(page.getByLabel("Team 1 score")).toHaveValue("21"); // winner preset from the session
       await expect(page.getByLabel("Team 2 score")).toHaveValue(""); // the loser's score is still typed by hand
     });
     ```

**Verify**: `bun run --cwd client build` → exit 0; `bunx biome check` → exit 0; `grep -n "points_to_win" server/db.js server/routes/sessions.js client/src/components/SetupScreen.jsx` → all three files match; `cd tests && bunx playwright test 08-match-end.spec.js 16-accessibility.spec.js 39-named-teams.spec.js 41-rotation-settings.spec.js` → all pass.

### Step 5: Docs tell the new truth

- `docs/todo.md` line 12: replace `two-step end match with 1–5 star rating` with `end match: tap the winning team on the court card → score form (winner preset to the session's points per game, cursor in the loser's field) with 1–5 star rating`. Add a new line under it: `- [x] Points per game session setting (11 / 15 / 21 / 31, default 31) — setup select, stored as \`sessions.points_to_win\`, presets the winner's score in the end-match form`
- `README.md` "What it does": in the **One-screen setup** bullet insert `points per game,` after `start time,`; in the **Live courts** bullet append `, tap the winning team to end a game` before the full stop.
- `CHANGELOG.md` under `## [Unreleased]` → `### Changed`, add:
  `- Ending a game is one tap: the live court shows a winner button under each team instead of an End match button plus a confirm dialog. The score form opens with the winner's score preset to the session's **Points per game** (new setup select: 11 / 15 / 21 / 31, default 31) and the cursor in the loser's field.`

**Verify**: `grep -n "two-step end match" docs/todo.md` → no matches; `grep -n "Points per game" README.md CHANGELOG.md` → both match.

## Test plan

- API-level (`bun run test:server`, sub-second): `sessions.test.js` gets the three `points_to_win` cases (rejected out-of-whitelist, rejected typed-wrong, persisted + default); `db.migration.test.js` pins that the new column survives the migration chain.
- Browser (UI re-render only): 16.5 (focus lands in the loser's field), 41.3 (select persists; the form presets from the session), 39.1/39.4 re-pointed at the winner buttons. Everything else is the mechanical re-pointing of the old "End Match" role-name signal.
- Structural pattern for the new setup test: `tests/e2e/41-rotation-settings.spec.js:10-21`.
- After the last step: `bun run --cwd tests test:unit` → exit 0 (nothing in it should move).

## Done criteria

Machine-checkable. ALL must hold:

- [ ] `test ! -e client/src/components/ConfirmEndDialog.jsx` exits 0
- [ ] `grep -rn 'name: "End Match"\|text=End Match\|confirm-end' tests/ client/src` prints nothing
- [ ] `grep -c "court-winner-1" client/src/components/CourtCard.jsx` is ≥ 1; `grep -n 'autoFocus={winner === "team1"}' client/src/components/EndMatchModal.jsx` matches
- [ ] `grep -n "points_to_win" server/db.js server/routes/sessions.js server/db.migration.test.js server/routes/sessions.test.js client/src/components/SetupScreen.jsx` matches in every file
- [ ] `bunx biome check`, `bun run --cwd client build`, `bun run --cwd tests test:unit`, `bun run --cwd tests test:server` all exit 0
- [ ] `cd tests && bunx playwright test 07-match-start.spec.js 08-match-end.spec.js 10-smart-manual-mode.spec.js 12-live-courts.spec.js 16-accessibility.spec.js 19-queue-master.spec.js 20-init-phase.spec.js 25-court-expiry.spec.js 27-start-confirm.spec.js 28-on-deck.spec.js 37-shortcuts.spec.js 39-named-teams.spec.js 41-rotation-settings.spec.js 49-v15-ux.spec.js` passes
- [ ] `git status --short` lists only in-scope files
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- The code at the locations in "Current state" doesn't match the excerpts (drift).
- After the Step 2 edits, a listed spec still fails for a reason other than the role-name / gate changes described here (for example a layout or snapshot assertion that the taller live card breaks). Report the failing assertion — do not loosen it.
- `bun run --cwd tests test:server` fails on a sessions-column assertion in a file other than `server/db.migration.test.js`.
- A setup-screen layout spec fails after the new select is added (the card grew by one row).
- You find yourself wanting to make either score optional — that is out of scope by the maintainer's decision.

## Maintenance notes

- The live court card now has two buttons per live match carrying the accessible names "`<team> won`". Anything that counts buttons on a live card, or that locates "the end button" by role name, must use `court-winner-1` / `court-winner-2`.
- `points_to_win` is a **preset only**. The server does not validate scores against it, on purpose: timed games end early and the winner may have fewer points.
- Adding another per-session rule later: follow the same three places — `CREATE TABLE` + conditional `ALTER` in `server/db.js`, validation + `INSERT` in `server/routes/sessions.js`, the `expected` list in `server/db.migration.test.js`.
- Reviewer focus: (1) the winner buttons sit **outside** `TeamPanel` (which is a drag-and-drop target — a click there must not start a drag); (2) `autoFocus` is true on exactly one input for any `winner` value; (3) no e2e assertion was relaxed, only re-pointed.
- Deferred: `LAST_CALL_SECS` in `client/src/lib/utils.js` is a fixed 20-minute window sized for 31-point games; a 21-point session could use a shorter one.

## Execution notes — 2026-11-26

- Executed with plan 007 in one worktree (branch `worktree-agent-afe675af5aeae3ed0`): `ff19b40` client + e2e re-pointing, `62258ff` server column, `77e1ba2` client preset, `890474e` docs.
- **Accepted deviation (41.3)**: pool rows toggle 220 ms after a click and Start Session reads the selection at click time, so four raw `poolRow().click()` calls in a row checked in only 2 of 4 players under 8-worker load. The test uses the existing `checkinPlayers` helper (which waits for each `aria-checked`) instead — commit `0d99b93`. 41.1 / 41.2 carry the same latent race with two clicks.
- **Plan erratum**: Step 5's verify grep is case-sensitive while the README wording is lower-case mid-sentence — use `grep -ni "points per game" README.md CHANGELOG.md`.
- Comment-only touches beyond the literal step list, all in in-scope files, kept comments true (the `teamNames` comment in `CourtCard.jsx`, comments in 8.10 and 20.9, the block comment above `rotationSettingsTest`).
