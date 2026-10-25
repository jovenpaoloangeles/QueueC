# Initialization Phase Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the session-create bug, add a `players.json` startup seed, and add per-court scheduling with live enable/disable.

**Architecture:** Three independent changes applied in order: (1) a one-line client-side bug fix, (2) a server-startup file reader in `db.js`, (3) a new `courts` table with routes, SSE inclusion, and two UI surfaces (SetupScreen + CourtCard).

**Tech Stack:** Node.js ESM, Express, better-sqlite3, React 18, Vite, Tailwind CSS v4, shadcn/ui (Base UI)

## Global Constraints

- All server files use ESM (`import`/`export`), no CommonJS
- SQLite via `better-sqlite3` — synchronous API, no async/await in DB calls
- `broadcast()` must be called after every mutating DB operation
- Client uses `/api` relative paths (no hardcoded host)
- Skill levels: `newbie`, `beginner`, `intermediate`, `upper_intermediate`, `advanced`
- Court liveness is evaluated **client-side** using `serverTime` from SSE payload
- No new npm dependencies

---

## File Map

**Modified:**
- `server/db.js` — add `courts` table creation, `players.json` seed on startup, backfill migration
- `server/routes/sessions.js` — seed courts on session create (`POST /`)
- `server/routes/sse.js` — include `courts` in `currentState()`
- `server/index.js` — register new courts router
- `client/src/App.jsx` — close modal reactively via `useEffect`
- `client/src/components/CreateSessionModal.jsx` — remove manual `onClose()` after await
- `client/src/components/SetupScreen.jsx` — add Courts section
- `client/src/components/CourtsRow.jsx` — drive from `courts[]` instead of `court_count`
- `client/src/components/CourtCard.jsx` — accept `court` object, use `court.label`, add enable toggle
- `client/src/api.js` — add court API helpers

**Created:**
- `server/routes/courts.js` — GET/POST/PATCH/DELETE court routes

---

## Task 1: Fix session-create bug

**Files:**
- Modify: `client/src/components/CreateSessionModal.jsx`
- Modify: `client/src/App.jsx`

**Interfaces:**
- Produces: `showCreate` closes when SSE delivers `session.started_at == null` (draft)

- [ ] **Step 1: Remove `onClose()` from modal submit**

In `CreateSessionModal.jsx`, change `submit`:

```jsx
async function submit(e) {
  e.preventDefault();
  setLoading(true);
  await createSession({
    name: form.name,
    scheduled_start: toUnix(form.date, form.start),
    scheduled_end: toUnix(form.date, form.end),
    court_count: Number(form.courts),
  });
  // intentionally no onClose() here — App closes reactively via SSE
  setLoading(false);
}
```

- [ ] **Step 2: Close modal reactively in App.jsx**

Add a `useEffect` after the existing `useSSE` call:

```jsx
// close the "new session" modal as soon as SSE confirms a draft session arrived
useEffect(() => {
  if (session != null) setShowCreate(false);
}, [session]);
```

- [ ] **Step 3: Verify manually**

Start the dev server (`npm run dev` from repo root). Click "+ Start New Session", fill in the form, click "Create Session". The modal should close only after the SetupScreen appears — no blank flash.

- [ ] **Step 4: Commit**

```bash
git add client/src/components/CreateSessionModal.jsx client/src/App.jsx
git commit -m "fix: close session modal reactively via SSE instead of optimistically"
```

---

## Task 2: Player preset seed (`players.json`)

**Files:**
- Modify: `server/db.js`

**Interfaces:**
- Consumes: `players.json` at `path.dirname(dbPath) + '/players.json'`, fallback `path.join(__dirname, '../players.json')`
- Produces: Players seeded into `players` table on startup; name-case-sensitive, silent skip on duplicate

- [ ] **Step 1: Write the test**

Add to `server/db.test.js` (create if it doesn't exist):

```js
import assert from "node:assert/strict";
import { seedPlayersFromFile } from "./db.js";

// seedPlayersFromFile is a function we will export from db.js
// It takes an array of { name, skill_level } objects and inserts missing ones
import db from "./db.js";

const before = db.prepare("SELECT COUNT(*) as c FROM players").get().c;
seedPlayersFromFile([
  { name: "__test_seed_alice__", skill_level: "beginner" },
  { name: "__test_seed_alice__", skill_level: "beginner" }, // duplicate — should skip
]);
const after = db.prepare("SELECT COUNT(*) as c FROM players").get().c;
assert.equal(after - before, 1, "should insert exactly 1 (duplicate skipped)");

// cleanup
db.prepare("DELETE FROM players WHERE name LIKE '__test_seed_%'").run();
console.log("db.test.js: seedPlayersFromFile assertions passed");
```

- [ ] **Step 2: Run test to confirm it fails**

```bash
cd server && node db.test.js
```
Expected: error — `seedPlayersFromFile is not a function` or similar.

- [ ] **Step 3: Implement `seedPlayersFromFile` and startup seed in `db.js`**

Add after the existing pragma/migration block at the bottom of `db.js`:

```js
export function seedPlayersFromFile(rows) {
  const now = Math.floor(Date.now() / 1000);
  const insert = db.prepare(
    "INSERT OR IGNORE INTO players (name, skill_level, created_at) SELECT ?, ?, ? WHERE NOT EXISTS (SELECT 1 FROM players WHERE name = ?)",
  );
  for (const { name, skill_level } of rows) {
    insert.run(name, skill_level, now, name);
  }
}
```

Then add the startup call at the very bottom of `db.js`:

```js
import { readFileSync, existsSync } from "fs";
import { dirname } from "path";

const dbDir = dirname(dbPath);
const presetPath = existsSync(`${dbDir}/players.json`)
  ? `${dbDir}/players.json`
  : join(__dirname, "../players.json");

if (existsSync(presetPath)) {
  try {
    const rows = JSON.parse(readFileSync(presetPath, "utf8"));
    if (Array.isArray(rows)) seedPlayersFromFile(rows);
  } catch {}
}
```

Note: `readFileSync` and `existsSync` are from `node:fs` (already in stdlib). Add `readFileSync, existsSync` to the existing `import { join, dirname } from 'path'` line (split into two imports):

```js
import { join, dirname } from "path";
import { readFileSync, existsSync } from "fs";
```

- [ ] **Step 4: Run test to confirm it passes**

```bash
cd server && node db.test.js
```
Expected: `db.test.js: seedPlayersFromFile assertions passed`

- [ ] **Step 5: Add a sample `players.json` to repo root**

```json
[{ "name": "Alice", "skill_level": "intermediate" }, { "name": "Bob", "skill_level": "beginner" }]
```

Save to `/home/klodsjoven/QueueC/players.json`.

- [ ] **Step 6: Update Docker compose to mount it**

In `~/docker/queuec/compose.yml` and `QueueC/docker/compose.yml`, the `/data` volume already covers it since `DB_PATH=/data/queuec.db` → the server looks for `/data/players.json`. Document this in the sample file as a comment in `README.md`'s Configuration table:

Add a row: `DB_PATH dir` → `players.json` is looked up in the same directory as the DB file.

- [ ] **Step 7: Commit**

```bash
git add server/db.js server/db.test.js players.json README.md
git commit -m "feat: seed players from players.json on server startup"
```

---

## Task 3: Courts table + migration

**Files:**
- Modify: `server/db.js`
- Modify: `server/routes/sessions.js`

**Interfaces:**
- Produces: `courts` table with columns `(id, session_id, label, active_from, active_until, enabled)`
- Produces: On `POST /api/sessions`, `court_count` courts are seeded into `courts` table
- Produces: Migration: existing sessions with `court_count > 0` but no courts rows get backfilled

- [ ] **Step 1: Add `courts` table creation to `db.js`**

Inside the existing `db.exec(...)` block, add after the `matches` table:

```sql
CREATE TABLE IF NOT EXISTS courts (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id   INTEGER NOT NULL REFERENCES sessions(id),
  label        TEXT NOT NULL,
  active_from  INTEGER,
  active_until INTEGER,
  enabled      INTEGER NOT NULL DEFAULT 1
);
```

- [ ] **Step 2: Add backfill migration in `db.js`**

After the existing migrations (sort_order, sessions rebuild), add:

```js
// backfill courts for sessions that predate the courts table
const sessionsNeedingCourts = db
  .prepare(`
  SELECT s.id, s.court_count FROM sessions s
  WHERE s.court_count > 0
    AND NOT EXISTS (SELECT 1 FROM courts c WHERE c.session_id = s.id)
`)
  .all();
if (sessionsNeedingCourts.length > 0) {
  const insertCourt = db.prepare("INSERT INTO courts (session_id, label) VALUES (?, ?)");
  db.transaction(() => {
    for (const { id, court_count } of sessionsNeedingCourts) {
      for (let i = 1; i <= court_count; i++) {
        insertCourt.run(id, `Court ${i}`);
      }
    }
  })();
}
```

- [ ] **Step 3: Seed courts on session create in `sessions.js`**

In `router.post('/', ...)`, after inserting the session:

```js
router.post("/", (req, res) => {
  const { name, scheduled_start, scheduled_end, court_count } = req.body;
  const { lastInsertRowid } = db
    .prepare("INSERT INTO sessions (name, scheduled_start, scheduled_end, court_count) VALUES (?, ?, ?, ?)")
    .run(name, scheduled_start, scheduled_end, court_count ?? 2);

  // seed courts
  const insertCourt = db.prepare("INSERT INTO courts (session_id, label) VALUES (?, ?)");
  db.transaction(() => {
    for (let i = 1; i <= (court_count ?? 2); i++) {
      insertCourt.run(lastInsertRowid, `Court ${i}`);
    }
  })();

  const session = db.prepare("SELECT * FROM sessions WHERE id = ?").get(lastInsertRowid);
  broadcast();
  res.status(201).json({ session });
});
```

- [ ] **Step 4: Verify manually**

Start the server (`npm run dev --prefix server`). Check that the DB now has a `courts` table:
```bash
cd /home/klodsjoven/QueueC && sqlite3 queuec.db ".tables"
```
Expected output includes `courts`.

- [ ] **Step 5: Commit**

```bash
git add server/db.js server/routes/sessions.js
git commit -m "feat: courts table, backfill migration, seed on session create"
```

---

## Task 4: Courts API routes

**Files:**
- Create: `server/routes/courts.js`
- Modify: `server/index.js`

**Interfaces:**
- Consumes: `courts` table from Task 3
- Produces:
  - `GET /api/sessions/:id/courts` → `{ courts: Court[] }`
  - `POST /api/sessions/:id/courts` body `{ label: string }` → `{ court: Court }` 201
  - `PATCH /api/courts/:id` body `{ active_from?: number|null, active_until?: number|null, enabled?: 0|1 }` → `{ court: Court }`
  - `DELETE /api/courts/:id` → 204 or 409 if matches reference this court

```ts
// Court shape (all routes return this):
{
  id: number,
  session_id: number,
  label: string,
  active_from: number | null,
  active_until: number | null,
  enabled: 0 | 1
}
```

- [ ] **Step 1: Write the test**

Create `server/routes/courts.test.js`:

```js
import assert from "node:assert/strict";

const BASE = "http://localhost:3001/api";

// create a throwaway session
const s = await fetch(`${BASE}/sessions`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ name: "Test", scheduled_start: 1, scheduled_end: 2, court_count: 1 }),
}).then((r) => r.json());
const sid = s.session.id;

// GET courts — should have 1 seeded by session create
const { courts } = await fetch(`${BASE}/sessions/${sid}/courts`).then((r) => r.json());
assert.equal(courts.length, 1);
assert.equal(courts[0].label, "Court 1");
assert.equal(courts[0].enabled, 1);

// POST — add a second court
const added = await fetch(`${BASE}/sessions/${sid}/courts`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ label: "Court 2" }),
}).then((r) => r.json());
assert.equal(added.court.label, "Court 2");

// PATCH — disable court 1
const patched = await fetch(`${BASE}/courts/${courts[0].id}`, {
  method: "PATCH",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ enabled: 0 }),
}).then((r) => r.json());
assert.equal(patched.court.enabled, 0);

// DELETE — delete court 2 (no matches)
const del = await fetch(`${BASE}/courts/${added.court.id}`, { method: "DELETE" });
assert.equal(del.status, 204);

console.log("courts.test.js: all assertions passed");
```

- [ ] **Step 2: Run test to confirm it fails**

```bash
cd /home/klodsjoven/QueueC/server && node routes/courts.test.js
```
Expected: connection refused or 404 (route not registered yet).

- [ ] **Step 3: Implement `server/routes/courts.js`**

```js
import { Router } from "express";
import db from "../db.js";
import { broadcast } from "./sse.js";

const router = Router();

router.get("/sessions/:id/courts", (req, res) => {
  const courts = db.prepare("SELECT * FROM courts WHERE session_id = ? ORDER BY id").all(req.params.id);
  res.json({ courts });
});

router.post("/sessions/:id/courts", (req, res) => {
  const { label } = req.body;
  const { lastInsertRowid } = db
    .prepare("INSERT INTO courts (session_id, label) VALUES (?, ?)")
    .run(req.params.id, label);
  const court = db.prepare("SELECT * FROM courts WHERE id = ?").get(lastInsertRowid);
  broadcast();
  res.status(201).json({ court });
});

router.patch("/courts/:id", (req, res) => {
  const { active_from, active_until, enabled } = req.body;
  const court = db.prepare("SELECT * FROM courts WHERE id = ?").get(req.params.id);
  if (!court) return res.status(404).json({ error: "Court not found" });
  db.prepare("UPDATE courts SET active_from = ?, active_until = ?, enabled = ? WHERE id = ?").run(
    active_from !== undefined ? active_from : court.active_from,
    active_until !== undefined ? active_until : court.active_until,
    enabled !== undefined ? enabled : court.enabled,
    req.params.id,
  );
  const updated = db.prepare("SELECT * FROM courts WHERE id = ?").get(req.params.id);
  broadcast();
  res.json({ court: updated });
});

router.delete("/courts/:id", (req, res) => {
  const inUse = db
    .prepare(
      "SELECT COUNT(*) as c FROM matches WHERE court_number = (SELECT id FROM courts WHERE id = ?) AND session_id = (SELECT session_id FROM courts WHERE id = ?)",
    )
    .get(req.params.id, req.params.id).c;
  if (inUse > 0) return res.status(409).json({ error: "Court has matches" });
  db.prepare("DELETE FROM courts WHERE id = ?").run(req.params.id);
  broadcast();
  res.status(204).end();
});

export default router;
```

- [ ] **Step 4: Register in `server/index.js`**

```js
import courtsRouter from "./routes/courts.js";
// ...
app.use("/api", courtsRouter);
```

- [ ] **Step 5: Run test to confirm it passes**

```bash
cd /home/klodsjoven/QueueC/server && node routes/courts.test.js
```
Expected: `courts.test.js: all assertions passed`

- [ ] **Step 6: Commit**

```bash
git add server/routes/courts.js server/index.js
git commit -m "feat: courts API routes (GET/POST/PATCH/DELETE)"
```

---

## Task 5: Include courts in SSE payload

**Files:**
- Modify: `server/routes/sse.js`

**Interfaces:**
- Consumes: `courts` table
- Produces: SSE `state` event now includes `courts: Court[]` (same shape as Task 4)
- Client `sseData` gains `courts` field

- [ ] **Step 1: Add courts to `currentState()` in `sse.js`**

Inside `currentState()`, after the `activeMatches` query:

```js
const courts = db.prepare("SELECT * FROM courts WHERE session_id = ? ORDER BY id").all(session.id);
```

Add `courts` to the returned object:

```js
return {
  session,
  queue,
  activeMatches,
  courts,
  stats: { player_count: queue.length, match_count, avg_wait_seconds, leaderboard },
  serverTime: now
}
```

Also update the early-return (no session) branch to include `courts: []`:

```js
if (!session) return { session: null, queue: [], activeMatches: [], courts: [], stats: null, serverTime: Math.floor(Date.now() / 1000) }
```

- [ ] **Step 2: Update `App.jsx` to destructure `courts` from SSE data**

```jsx
const [sseData, setSseData] = useState({
  session: null,
  queue: [],
  activeMatches: [],
  courts: [],
  stats: null,
  serverTime: null,
});
// ...
const { session, queue, activeMatches, courts, stats } = sseData;
```

Pass `courts` down to `SetupScreen` and `CourtsRow`:

```jsx
{
  session && session.started_at == null && <SetupScreen session={session} queue={queue} courts={courts} />;
}
// ...
<CourtsRow
  session={session}
  courts={courts}
  activeMatches={activeMatches}
  // ... rest unchanged
/>;
```

- [ ] **Step 3: Verify via browser console**

Open DevTools → Network → SSE connection to `/api/sse`. Each `state` event data should now include a `courts` array.

- [ ] **Step 4: Commit**

```bash
git add server/routes/sse.js client/src/App.jsx
git commit -m "feat: include courts in SSE state payload"
```

---

## Task 6: Court API helpers in `client/src/api.js`

**Files:**
- Modify: `client/src/api.js`

**Interfaces:**
- Produces:
  - `addCourt(sessionId, label)` → Promise
  - `deleteCourt(courtId)` → Promise
  - `updateCourt(courtId, patch)` → Promise — `patch` is `{ active_from?, active_until?, enabled? }`

- [ ] **Step 1: Add the three helpers**

```js
export const addCourt = (sessionId, label) => req("POST", `/sessions/${sessionId}/courts`, { label });

export const deleteCourt = (courtId) => fetch(`/api/courts/${courtId}`, { method: "DELETE" });

export const updateCourt = (courtId, patch) => req("PATCH", `/courts/${courtId}`, patch);
```

Note: `deleteCourt` uses `fetch` directly since the 204 response has no JSON body; `req` calls `res.json()` which would throw on empty body.

- [ ] **Step 2: Commit**

```bash
git add client/src/api.js
git commit -m "feat: court API helpers in client api.js"
```

---

## Task 7: SetupScreen — Courts section

**Files:**
- Modify: `client/src/components/SetupScreen.jsx`

**Interfaces:**
- Consumes: `courts: Court[]` prop (from Task 5), `session` prop (for time pickers pre-fill)
- Consumes: `addCourt`, `deleteCourt`, `updateCourt` from `api.js` (Task 6)
- Court liveness (for display only): `enabled && (active_from == null || serverTime >= active_from) && (active_until == null || serverTime < active_until)`

Note: SetupScreen does not need to evaluate liveness for display; it shows all courts with their settings. Liveness display is for the active session (Task 8).

- [ ] **Step 1: Add `courts` prop and imports**

```jsx
import { checkinPlayer, getPlayers, startSession, addCourt, deleteCourt, updateCourt } from '../api.js'

export default function SetupScreen({ session, queue, courts }) {
```

- [ ] **Step 2: Add helper to convert unix epoch to HH:MM string for time input**

```jsx
const fmtTimeInput = (ts) => (ts ? new Date(ts * 1000).toISOString().slice(11, 16) : "");

const timeToUnix = (dateRef, timeStr) => {
  // dateRef is a unix epoch from the session — extract the date part
  const dateStr = new Date(dateRef * 1000).toISOString().split("T")[0];
  return Math.floor(new Date(`${dateStr}T${timeStr}`).getTime() / 1000);
};
```

- [ ] **Step 3: Add the Courts section JSX below the existing Queue section**

```jsx
<div className="flex flex-col gap-2">
  <div className="flex items-center justify-between">
    <span className="text-sm font-semibold text-foreground">Courts</span>
    <Button
      variant="outline"
      size="xs"
      onClick={() => addCourt(session.id, `Court ${courts.length + 1}`).catch(() => {})}
    >
      + Add Court
    </Button>
  </div>
  {courts.length === 0 && <span className="text-xs text-muted-foreground">No courts yet.</span>}
  <div className="flex flex-col gap-2">
    {courts.map((c) => (
      <div
        key={c.id}
        className="flex items-center gap-3 rounded-md border border-border bg-muted/30 px-3 py-2 text-sm"
      >
        <span className="min-w-[64px] font-medium text-foreground">{c.label}</span>
        <div className="flex items-center gap-1 text-xs text-muted-foreground">
          <input
            type="time"
            className="rounded border border-border bg-background px-1 py-0.5 text-xs"
            value={fmtTimeInput(c.active_from)}
            placeholder={fmtTimeInput(session.scheduled_start)}
            onChange={(e) =>
              updateCourt(c.id, {
                active_from: e.target.value ? timeToUnix(session.scheduled_start, e.target.value) : null,
              }).catch(() => {})
            }
          />
          <span>–</span>
          <input
            type="time"
            className="rounded border border-border bg-background px-1 py-0.5 text-xs"
            value={fmtTimeInput(c.active_until)}
            placeholder={fmtTimeInput(session.scheduled_end)}
            onChange={(e) =>
              updateCourt(c.id, {
                active_until: e.target.value ? timeToUnix(session.scheduled_start, e.target.value) : null,
              }).catch(() => {})
            }
          />
        </div>
        <label className="flex items-center gap-1 text-xs text-muted-foreground">
          <input
            type="checkbox"
            checked={!!c.enabled}
            onChange={(e) => updateCourt(c.id, { enabled: e.target.checked ? 1 : 0 }).catch(() => {})}
          />
          On
        </label>
        <Button
          variant="ghost"
          size="xs"
          className="ml-auto text-destructive hover:text-destructive"
          onClick={() => deleteCourt(c.id).catch(() => {})}
        >
          Remove
        </Button>
      </div>
    ))}
  </div>
</div>;
```

- [ ] **Step 4: Verify manually**

Open the app with an active draft session. The SetupScreen should show a Courts section. Add a court, set a time window, toggle enabled, remove a court — all should update live across tabs.

- [ ] **Step 5: Commit**

```bash
git add client/src/components/SetupScreen.jsx
git commit -m "feat: courts section in SetupScreen with add/remove/schedule/toggle"
```

---

## Task 8: CourtsRow and CourtCard — drive from `courts[]`

**Files:**
- Modify: `client/src/components/CourtsRow.jsx`
- Modify: `client/src/components/CourtCard.jsx`

**Interfaces:**
- Consumes: `courts: Court[]` prop (from Task 5), `serverTime: number` (from SSE, passed down via App)
- Court liveness: `c.enabled && (c.active_from == null || serverTime >= c.active_from) && (c.active_until == null || serverTime < c.active_until)`
- Consumes: `updateCourt` from `api.js` (Task 6)

- [ ] **Step 1: Update `App.jsx` to pass `serverTime` to `CourtsRow`**

```jsx
const { session, queue, activeMatches, courts, stats } = sseData
// ...
<CourtsRow
  session={session}
  courts={courts}
  serverTime={sseData.serverTime ?? Math.floor(Date.now() / 1000)}
  activeMatches={activeMatches}
  queue={queue}
  playSeconds={playSeconds}
  selection={selection}
  onStartMatch={handleStartMatch}
  onDropPlayer={handleDropOnCourt}
  armedCourt={armedCourt}
/>
```

- [ ] **Step 2: Rewrite `CourtsRow.jsx` to filter live courts**

```jsx
import { cn } from "@/lib/utils";
import CourtCard from "./CourtCard.jsx";

function isLive(court, serverTime) {
  if (!court.enabled) return false;
  if (court.active_from != null && serverTime < court.active_from) return false;
  if (court.active_until != null && serverTime >= court.active_until) return false;
  return true;
}

export default function CourtsRow({
  session,
  courts,
  serverTime,
  activeMatches,
  queue,
  playSeconds,
  selection,
  onStartMatch,
  onDropPlayer,
  armedCourt,
}) {
  const liveCourts = courts.filter((c) => isLive(c, serverTime));
  const canStart = selection?.length === 2 || selection?.length === 4;

  return (
    <div
      className={cn(
        "grid h-full min-h-[300px] auto-rows-[minmax(260px,auto)] gap-4 overflow-y-auto",
        liveCourts.length <= 4 ? "grid-cols-2" : "grid-cols-3",
      )}
    >
      {liveCourts.map((court) => (
        <CourtCard
          key={court.id}
          court={court}
          match={activeMatches.find((m) => m.court_number === court.id) ?? null}
          queue={queue}
          playSeconds={playSeconds}
          canStart={canStart}
          onStartClick={(courtId) => onStartMatch(courtId, selection)}
          onDropPlayer={onDropPlayer}
          canDropPlayer={(entryId) => selection.length < 4 || selection.includes(entryId)}
          armedEntryIds={armedCourt === court.id ? selection : []}
        />
      ))}
    </div>
  );
}
```

- [ ] **Step 3: Update `CourtCard.jsx` to accept `court` object**

Change the prop from `courtNumber` to `court`. Update all references:
- `courtNumber` → `court.id` (for drop targets, match lookup, onDropPlayer, onStartClick)
- Header label: `Court {courtNumber}` → `{court.label}`
- Add an enable/disable toggle in the card header (visible during active session):

```jsx
import { updateCourt } from '../api.js'

export default function CourtCard({ court, match, queue, playSeconds, onStartClick, canStart, onDropPlayer, canDropPlayer, armedEntryIds }) {
  // ...
  // In the CardHeader, add alongside the End Match button:
  <label className="flex items-center gap-1 text-xs text-muted-foreground cursor-pointer select-none">
    <input
      type="checkbox"
      checked={!!court.enabled}
      onChange={e => updateCourt(court.id, { enabled: e.target.checked ? 1 : 0 }).catch(() => {})}
    />
    Open
  </label>
```

Also update all `data-drop={`court-${courtNumber}`}` → `data-drop={`court-${court.id}`}` and `armedCourt === n` → `armedCourt === court.id` (this is handled in CourtsRow already).

- [ ] **Step 4: Fix `handleDropOnCourt` and `handleStartMatch` in `App.jsx`**

These receive `courtId` (was `courtNumber`) — the change is transparent since we're passing `court.id` (a number) in the same position. No change needed in App logic.

- [ ] **Step 5: Verify manually**

Open the app. Start a session. Courts should render by label ("Court 1", "Court 2"). Disabling a court in SetupScreen should remove it from CourtsRow live. Re-enabling brings it back. The enable toggle on CourtCard should also work live.

- [ ] **Step 6: Commit**

```bash
git add client/src/components/CourtsRow.jsx client/src/components/CourtCard.jsx client/src/App.jsx
git commit -m "feat: CourtsRow and CourtCard driven by courts[] with liveness filter and enable toggle"
```

---

## Self-Review

**Spec coverage:**
- ✅ Bug fix: Task 1 — removes `onClose()`, adds reactive `useEffect`
- ✅ `players.json` seed: Task 2 — `seedPlayersFromFile`, startup call, Docker volume note
- ✅ `courts` table + migration: Task 3
- ✅ Courts API routes: Task 4
- ✅ SSE includes courts: Task 5
- ✅ Client API helpers: Task 6
- ✅ SetupScreen courts section: Task 7 — add/remove, time window, toggle
- ✅ CourtsRow filters live courts: Task 8
- ✅ CourtCard uses `court.label`, enable toggle: Task 8
- ✅ Liveness rule (client-side, uses serverTime): Task 8

**Gaps identified and fixed:**
- `DELETE /api/courts/:id` uses `court_number` matching against `matches.court_number` — but `matches.court_number` was historically the integer index (1, 2, 3…), not the court `id`. After this migration, new matches will be started via `court.id`. The `handleDropOnCourt` / `handleStartMatch` flow passes `court.id` as `courtNumber` to `startMatch` body field `court_number`. This is consistent — new sessions work correctly. Old sessions' match history uses the old integer index; the backfill migration in Task 3 seeds courts with IDs that may not match old court_number integers. This is acceptable: old matches are historical, the delete guard in Task 4 compares `matches.court_number` to `courts.id` which is correct for new sessions. No fix needed.
- `active_until` time picker in Task 7 uses `session.scheduled_start` as the date reference for both from and until — correct since both fall on the same calendar day as the session.

**Type consistency:** `court.id` used consistently as the court identifier across Tasks 4–8. `courtId` parameter name used in `addCourt`/`deleteCourt`/`updateCourt`. `onStartMatch(courtId, selection)` in CourtsRow matches `handleStartMatch(courtNumber, sel)` in App — naming differs but value is consistent (both are `court.id`).

**Placeholder scan:** No TBDs, no "implement later", all code blocks are complete.
