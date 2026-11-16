# Plan 003: Client stops lying about failures (undo honesty, pause feedback, sub-dialog reset, leaderboard refetch)

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md`.
>
> **Drift check (run first)**: `git diff --stat c00e826..HEAD -- client/src/components/Toast.jsx client/src/App.jsx client/src/components/OnDeckStrip.jsx client/src/components/PlayerSearchAdd.jsx client/src/components/QueueGrid.jsx client/src/components/Header.jsx client/src/components/CourtCard.jsx client/src/components/StatsSidebar.jsx tests/e2e/34-undo.spec.js tests/e2e/33-pause-session.spec.js tests/e2e/13-stats-sidebar.spec.js`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: M
- **Risk**: LOW (UI feedback + one state reset + one dependency-array change; no API or state-machine changes)
- **Depends on**: none (independent of plans 001/002; land in any order)
- **Category**: bug | perf
- **Planned at**: commit `c00e826`, 2026-11-16

## Why this matters

This app's deployment target is a shared screen on flaky venue wifi, operated by one queue master who trusts what the UI says. Today the UI lies in four ways. (1) The undo toast's convention is `ok !== false` — any undo callback that swallows its rejection (several do) or resolves `undefined` shows "Undone" while nothing was undone: slates stay on deck, "aborted" matches keep running, check-ins stay checked in. (2) Pause/resume failures are swallowed outright (`.catch(() => {})`) — the QM believes clocks are frozen while games keep accruing wait time. (3) The substitute dialog isn't reset when the court's match vanishes (ended elsewhere), so it auto-opens for the *next* match on that court and a reflexive confirm subs a player out of the wrong game — exactly what the neighboring reset effect's comment says it exists to prevent. (4) The Month/All leaderboard tab refetches on every 1-second SSE heartbeat (the `stats` prop identity changes each push) — ~3,600 requests/hour per client for data that changes once per match, plus the fetch error is swallowed so a dead board just looks empty.

## Current state

Files and their roles:

- `client/src/components/Toast.jsx` — single-slot toast; owns the undo button click handler.
- `client/src/App.jsx` — top-level state; two undo call sites + `handleReorder` (not in scope).
- `client/src/components/OnDeckStrip.jsx` — on-deck slates; two undo call sites.
- `client/src/components/PlayerSearchAdd.jsx` — check-in panel; two batch-undo call sites.
- `client/src/components/QueueGrid.jsx` — queue cards; `undoRemove` is the **exemplar** of the intended convention (returns `false` after handling its own 404) — but even it resolves `undefined` on success.
- `client/src/components/Header.jsx` — pause/resume button.
- `client/src/components/CourtCard.jsx` — per-court card; dialog flags + the match-vanish reset effect.
- `client/src/components/StatsSidebar.jsx` — leaderboard with session/month/all windows.

Excerpts (as of `c00e826`):

`client/src/components/Toast.jsx:56-64` — the lying gate (`ok !== false`):

```js
              onClick={async () => {
                const undo = state.undo;
                dismiss();
                let ok;
                try {
                  ok = await undo();
                } catch {}
                // an undo that handled its drop — returns false — don't clobber with "Undone"
                if (ok !== false) toast("Undone", "info");
              }}
```

`client/src/App.jsx:151-155` — batch slate undo: `allSettled` never rejects (the `.catch` is dead), and a fully-failed batch still resolves `undefined`:

```js
              undo: () => Promise.allSettled(r.slate_ids.map((id) => cancelSlate(id))).catch(() => {}),
```

`client/src/App.jsx:366-372` — abort undo: 404/409 handled, but network/5xx falls through the catch and resolves `undefined` → "Undone" (`client/src/components/OnDeckStrip.jsx:471-477` is the same shape):

```js
              undo: () =>
                abortMatch(match.id).catch((err) => {
                  if (err?.status === 404 || err?.status === 409) {
                    toast("Already ended — nothing to undo", "info");
                    return false; // handled its own failure — don't clobber with "Undone"
                  }
                }),
```

`client/src/components/OnDeckStrip.jsx:389` — bare undo, no truth returned:

```js
      toast("Added to On Deck", "success", slate ? { undo: () => cancelSlate(slate.id) } : undefined);
```

`client/src/components/PlayerSearchAdd.jsx:149,181` — batch check-in undo (twice):

```js
          ? { undo: () => Promise.allSettled(entryIds.map((id) => removeEntry(id))) }
```

`client/src/components/QueueGrid.jsx:57-63` — the exemplar (convention: `false` = "I already told the user"; extend it with `true` on success):

```js
  const undoRemove = (entryId) =>
    removeEntry(entryId).catch((err) => {
      if (err?.status === 404) {
        toast("Already removed — nothing to undo", "info");
        return false; // handled its own failure — don't clobber with "Undone"
      }
    });
```

`client/src/components/Header.jsx:48` — swallowed pause:

```js
  const togglePause = () => (paused ? resumeSession(session.id) : pauseSession(session.id)).catch(() => {});
```

(Header.jsx currently does **not** import `useToast` — add the import: `import { useToast } from "./Toast.jsx";` and `const toast = useToast();` at the top of the component, mirroring `StatsSidebar.jsx:5,22`.)

`client/src/components/CourtCard.jsx:237-242` — the vanish-guard resets two of the three dialog flags; `showSub` (declared line ~223) is missing, and the dialog renders for whatever match is current (`{showSub && match && <SubstituteDialog ... />}`, line ~544):

```js
  useEffect(() => {
    if (!isActive) {
      setShowEnd(false);
      setShowConfirm(false);
    }
  }, [isActive]);
```

`client/src/components/StatsSidebar.jsx:25-34` — `[win, stats]` deps: `stats` is a fresh object on every 1-second SSE heartbeat (`server/index.js:32` broadcasts full state each second), so Month/All fetch once per second; the catch swallows:

```js
  useEffect(() => {
    if (win === "session" || !stats) return;
    let cancelled = false;
    getLeaderboard(win === "month" ? monthStart() : 0)
      .then((d) => !cancelled && setWindowBoard(d.leaderboard))
      .catch(() => {});
    return () => { cancelled = true; };
  }, [win, stats]);
```

Conventions: `api.js` throws `{status, data}` errors (see `tests/unit/api.error.test.js`); toasts via `useToast()` (`toast(msg, "info"|"error"|"success")`); e2e failure injection uses `page.route("**/api/...", (r) => r.abort())` (exemplar `tests/e2e/21-add-player-dialog.spec.js:107`) and `route.fulfill({ status: 500, ... })` (exemplar `tests/e2e/04-checkin-setup.spec.js:88`).

## Commands you will need

| Purpose | Command | Expected on success |
|-----------|--------------------------|---------------------|
| Unit tests | `bun run --cwd tests test:unit` | exit 0 |
| Lint | `bunx biome check` | exit 0 |
| Client build | `bun run --cwd client build` | exit 0 |
| Touched e2e | `cd tests && bunx playwright test 34-undo.spec.js 33-pause-session.spec.js 13-stats-sidebar.spec.js 12-live-courts.spec.js` | all pass |

## Scope

**In scope** (the only files you should modify):
- `client/src/components/Toast.jsx`
- `client/src/App.jsx` (the two undo call sites only)
- `client/src/components/OnDeckStrip.jsx` (the two undo call sites only)
- `client/src/components/PlayerSearchAdd.jsx` (the two batch-undo call sites only)
- `client/src/components/QueueGrid.jsx` (the `undoRemove` one-liner only)
- `client/src/components/Header.jsx`
- `client/src/components/CourtCard.jsx` (the effect only)
- `client/src/components/StatsSidebar.jsx`
- `tests/e2e/34-undo.spec.js`, `tests/e2e/33-pause-session.spec.js`, `tests/e2e/13-stats-sidebar.spec.js` (new cases)

**Out of scope** (do NOT touch):
- `client/src/components/SubstituteDialog.jsx` internals (its stale-selection validation is a separate finding, not this plan).
- `client/src/hooks/useSSE.js` — the 3s fixed retry is a known roadmap item; leave it.
- `QueueGrid`'s optimistic-order reconciliation (`sameSet` logic) — separate finding.
- Server code (all four fixes are client-side; the server already tells the truth).

## Git workflow

- Branch: `advisor/003-client-failure-surfacing`
- Commit per step; message style: `fix(client): <what> — <why>` (see `17a2866`).
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: The undo convention becomes "return true, or false if you already reported"

1. `client/src/components/Toast.jsx` — change the gate to require an explicit `true`, and show an error toast on anything else that isn't a self-handled `false`:

```js
                if (ok === true) toast("Undone", "info");
                else if (ok !== false) toast("Could not undo — check and retry", "error");
```

(Keep the comment; update it to "an undo that handled its drop — returns false — don't clobber with an error toast".)

2. Update every undo call site to obey the convention:
   - `QueueGrid.jsx` `undoRemove`: append success truth — `removeEntry(entryId).then(() => true).catch(...)` (keep the 404 branch returning `false`).
   - `OnDeckStrip.jsx:389`: `undo: () => cancelSlate(slate.id).then(() => true, () => false)`.
   - `App.jsx:151-155` (slate batch): `undo: () => Promise.allSettled(r.slate_ids.map((id) => cancelSlate(id))).then((rs) => rs.every((r) => r.status === "fulfilled"))` (delete the dead `.catch`).
   - `App.jsx:366-372` and `OnDeckStrip.jsx:471-477` (abort): restructure to `abortMatch(match.id).then(() => true).catch((err) => { if (err?.status === 404 || err?.status === 409) { toast("Already ended — nothing to undo", "info"); } return false; })`.
   - `PlayerSearchAdd.jsx` (both batch sites): `undo: () => Promise.allSettled(entryIds.map((id) => removeEntry(id))).then((rs) => rs.every((r) => r.status === "fulfilled" || r.reason?.status === 404))` — a 404 means another client already removed them; count it as done.

**Verify**: `bun run --cwd client build` → exit 0; `cd tests && bunx playwright test 34-undo.spec.js` → existing cases pass (they exercise the 404/409 self-handled paths, which still return `false`).

### Step 2: Pause/resume failures are visible

In `client/src/components/Header.jsx`: add the `useToast` import + hook (see Current state note), then:

```js
  const togglePause = () =>
    (paused ? resumeSession(session.id) : pauseSession(session.id)).catch(() =>
      toast(`Could not ${paused ? "resume" : "pause"} — check connection`, "error"),
    );
```

**Verify**: `cd tests && bunx playwright test 33-pause-session.spec.js` → existing cases pass (happy paths unchanged).

### Step 3: Substitute dialog resets with the other two

In `client/src/components/CourtCard.jsx`'s vanish-guard effect (~line 238), add `setShowSub(false);` next to `setShowEnd(false)` / `setShowConfirm(false)`.

**Verify**: `cd tests && bunx playwright test 12-live-courts.spec.js 50-v16-qol.spec.js` → pass (substitute happy path still works: the dialog opens via its button, not via this effect).

### Step 4: Leaderboard refetches on window switch and match-count change only

In `client/src/components/StatsSidebar.jsx`:

1. Change the effect deps from `[win, stats]` to `[win, stats?.match_count]` — the board's inputs change once per ended match, not per heartbeat. (The comment above the effect says "refetched on every stats push" — update it to say "refetched when the window switches or a match lands".)
2. Stop swallowing the fetch failure: add a `const [boardError, setBoardError] = useState(false)`; in the effect, `setBoardError(false)` before the fetch and `.catch(() => { if (!cancelled) setBoardError(true); })`; when `boardError` and `win !== "session"`, render a small retry line under the segment (e.g. `<button data-testid="board-error" onClick={() => setWin((w) => w)}>Couldn't load — retry</button>` — toggling `win` to its own value retriggers the effect; if that reads too clever, add a `retryNonce` state and put it in the deps).

**Verify**: `cd tests && bunx playwright test 13-stats-sidebar.spec.js 23-leaderboard.spec.js` → pass.

### Step 5: Regression e2e for the failure paths

Add one case per file, modeled on the route-injection exemplars:

- `tests/e2e/34-undo.spec.js`: full setup → start a match (or add a slate, whichever the existing cases do) → `page.route("**/api/matches/*/abort*", (r) => r.abort())` (adjust the glob to the actual call; check `client/src/api.js` for the path) → click the toast's undo → expect the error toast text "Could not undo" and the match still on court.
- `tests/e2e/33-pause-session.spec.js`: `page.route("**/api/sessions/*/pause*", (r) => r.abort())` → click Pause → expect the error toast ("Could not pause") and the header still showing the running state.
- `tests/e2e/13-stats-sidebar.spec.js`: switch to "All" → `page.route("**/api/leaderboard*", (r) => r.abort())` then trigger a refetch (switch window away and back) → expect the retry affordance visible; unroute, click retry → board renders.

**Verify**: `cd tests && bunx playwright test 34-undo.spec.js 33-pause-session.spec.js 13-stats-sidebar.spec.js` → all pass including the three new cases.

## Test plan

- Three new e2e cases (Step 5) pin the previously-invisible failures: undo network failure, pause network failure, leaderboard network failure. Structural pattern: `tests/e2e/21-add-player-dialog.spec.js:107-110` (abort + assert visible error state).
- Existing suites cover the happy paths that must not regress: 34 (undo incl. 404/409 self-handled), 33 (pause/resume), 13/23 (leaderboard windows), 12/50 (substitute flow).
- The `showSub` reset has no direct e2e (the race needs a second actor mid-dialog); its safety net is that the effect now matches its own comment, plus 50's substitute specs staying green.

## Done criteria

Machine-checkable. ALL must hold:

- [ ] `grep -n "ok !== false" client/src/components/Toast.jsx` returns no matches
- [ ] `grep -c "then(() => true" client/src/App.jsx client/src/components/OnDeckStrip.jsx client/src/components/QueueGrid.jsx` finds the updated call sites
- [ ] `grep -n "setShowSub(false)" client/src/components/CourtCard.jsx` matches inside the `!isActive` effect
- [ ] `grep -n "\[win, stats\]" client/src/components/StatsSidebar.jsx` returns no matches
- [ ] `grep -n "catch(() => {})" client/src/components/Header.jsx` returns no matches
- [ ] `cd tests && bunx playwright test 34-undo.spec.js 33-pause-session.spec.js 13-stats-sidebar.spec.js 12-live-courts.spec.js 50-v16-qol.spec.js` passes (incl. 3 new cases)
- [ ] `bun run --cwd client build` and `bunx biome check` exit 0
- [ ] `git status` shows changes only in the in-scope files

## STOP conditions

Stop and report back (do not improvise) if:

- The excerpts don't match the live code (drift).
- The route globs in Step 5 can't be made to intercept the actual requests (check `client/src/api.js` first; if the client uses a different path shape than expected, adapt the glob — but if interception is impossible for another reason, report).
- The `stats?.match_count` dep makes the Month/All board visibly stale in a way an existing spec catches (e.g. a spec ends a match and immediately expects the All-time board to include it — if so, report the spec; a `match_count` bump should cover it, since every board input changes only when a match ends).
- Any undo call site exists that this plan didn't list (`grep -n "undo:" client/src -r`) — wire it into the convention too, but if there are more than two uncited sites, report first.

## Maintenance notes

- The convention is now: undo callbacks resolve `true` (undone) / `false` (already reported to the user) / anything else (Toast shows the error). New undo sites must return a boolean — the Toast no longer defaults to success.
- `stats?.match_count` as the leaderboard's change signal assumes the session board is the source of truth for "a match happened". If leaderboards ever include mid-match inputs (live scores), revisit the dep.
- The remaining known client-trust gaps (SubstituteDialog stale selection, reorder rollback, HistoryPage error copy) are separate findings — see `plans/README.md` "rejected/deferred" notes.
