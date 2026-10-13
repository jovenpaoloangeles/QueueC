# Session Start Button + Player Pool Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Sessions are created as drafts (`started_at = NULL`); an explicit **Start Session** button on a new setup screen starts the clock, with the queue filled beforehand from a pool of registered players.

**Architecture:** `sessions.started_at` becomes nullable (SQLite table rebuild migration for existing DBs). `POST /api/sessions` creates a draft; new `PATCH /api/sessions/:id/start` stamps `started_at`; `POST /api/matches` rejects unstarted sessions. The client renders a `SetupScreen` (session summary + Start button + player pool + live queue list) whenever the current session is a draft; after start, the existing dashboard takes over unchanged.

**Tech Stack:** existing stack — Express 4 + better-sqlite3 on :3001, React 18 + Vite + Tailwind v4 + shadcn/ui (nova) on :3003. No new dependencies.

**Spec:** `docs/superpowers/specs/2026-10-13-session-start-and-player-pool-design.md`

## Global Constraints

- Unix-seconds timestamps everywhere: `Math.floor(Date.now() / 1000)`. Never milliseconds.
- Timer formulas must not change: `waitSeconds = Math.max(0, NOW - checked_in_at - total_seconds_played)`; `playSeconds = Math.max(0, NOW - match.started_at)`; `NOW = (serverTime ?? Date.now()/1000) + tick`.
- `selection` holds `queue_entries.id`, never `player_id`.
- shadcn rules: `gap-*` not `space-x/y-*`; `size-*` for equal dimensions; `cn()` for conditionals; **no manual `dark:` overrides in app code** — semantic tokens only; `Badge` not styled spans; `Skeleton` for loading; `Empty` for empty states; Dialog requires `DialogTitle`.
- Keep `@custom-variant dark (&:is(.dark *))` in `index.css` untouched.
- One new npm dependency total: **none**. Do not add any.
- Client dev port **3003**, API **3001**. Do not change ports.
- No raw hex outside `index.css`.
- Every task commits its own work.
- Server tests: unit tests (`matches.test.js`, `queue.test.js`) run directly with `node`; `sessions.test.js` is an integration test that fetches `http://localhost:3001/api` — the server must be running (`npm run dev --prefix server`).

---

### Task 1: Server — draft sessions, start endpoint, match guard

**Files:**
- Modify: `server/db.js` (CREATE TABLE `sessions` + new guarded migration after the `sort_order` migration)
- Modify: `server/routes/sessions.js`
- Modify: `server/routes/matches.js:37-45` (POST `/` guard)
- Test: `server/routes/sessions.test.js` (rewrite in `node:assert/strict`, integration style against :3001)

**Interfaces:**
- Consumes: existing `broadcast()` from `server/routes/sse.js`; existing `queue_entries`/`players` tables untouched.
- Produces (relied on by Task 2):
  - `POST /api/sessions` → `{ session }` where `session.started_at === null`
  - `PATCH /api/sessions/:id/start` → `{ session }` with `started_at` set; `400` `{ error }` if already started or ended; `404` `{ error }` if missing
  - `POST /api/matches` → `400` `{ error: 'Session not started' }` when the session's `started_at` is null
  - Draft sessions still appear from `GET /api/sessions/active` and the SSE payload (unchanged queries)

- [ ] **Step 1: Write the failing tests**

Replace the whole of `server/routes/sessions.test.js` with:

```js
// Run with: node server/routes/sessions.test.js (server must be running on :3001)
import assert from 'node:assert/strict'

const BASE = 'http://localhost:3001/api'

async function run() {
  // No active session initially (end any stray unended session first)
  let r = await fetch(`${BASE}/sessions/active`).then(res => res.json())
  if (r.session) {
    await fetch(`${BASE}/sessions/${r.session.id}/end`, { method: 'PATCH' })
  }
  r = await fetch(`${BASE}/sessions/active`).then(res => res.json())
  assert.equal(r.session, null, 'Expected null active session')

  // Create session → draft (started_at null)
  const created = await fetch(`${BASE}/sessions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'Test', scheduled_start: 1000, scheduled_end: 2000, court_count: 2 })
  }).then(res => res.json())
  assert.ok(created.session.id, 'Expected session id')
  assert.equal(created.session.court_count, 2, 'Expected court_count 2')
  assert.equal(created.session.started_at, null, 'Draft session must have started_at null')

  // Active session returns the draft
  const active = await fetch(`${BASE}/sessions/active`).then(res => res.json())
  assert.equal(active.session.id, created.session.id, 'Active session mismatch')

  // Starting a match on a draft is rejected
  const matchRes = await fetch(`${BASE}/matches`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ session_id: created.session.id, court_number: 1, team1_p1: 1, team2_p1: 2 })
  })
  assert.equal(matchRes.status, 400, 'Match on draft session must be 400')

  // Start the session → started_at set
  const started = await fetch(`${BASE}/sessions/${created.session.id}/start`, { method: 'PATCH' }).then(res => res.json())
  assert.ok(started.session.started_at !== null, 'Expected started_at set after start')

  // Starting twice → 400
  const again = await fetch(`${BASE}/sessions/${created.session.id}/start`, { method: 'PATCH' })
  assert.equal(again.status, 400, 'Second start must be 400')

  // End it
  const ended = await fetch(`${BASE}/sessions/${created.session.id}/end`, { method: 'PATCH' }).then(res => res.json())
  assert.ok(ended.session.ended_at !== null, 'Expected ended_at set')

  // Starting an ended session → 400
  const afterEnd = await fetch(`${BASE}/sessions/${created.session.id}/start`, { method: 'PATCH' })
  assert.equal(afterEnd.status, 400, 'Start after end must be 400')

  // Active now null
  const final = await fetch(`${BASE}/sessions/active`).then(res => res.json())
  assert.equal(final.session, null, 'Expected null after end')

  console.log('sessions.test.js: all assertions passed')
}
run().catch(e => { console.error(e); process.exit(1) })
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npm run dev --prefix server &
sleep 2
node server/routes/sessions.test.js
```

Expected: FAIL at `assert.equal(created.session.started_at, null, ...)` (POST still stamps `started_at = now`) — or earlier if a stray session exists. Note the failure line, then continue.

- [ ] **Step 3: Make `started_at` nullable in the schema**

In `server/db.js`, inside the initial `db.exec`, change the sessions CREATE TABLE line:

```js
    started_at INTEGER NOT NULL,
```
to:
```js
    started_at INTEGER,
```

Then add this migration directly after the existing `sort_order` migration block (after line 61, before `export default db`):

```js
// ponytail: rebuild sessions to relax started_at — drafts have NULL until PATCH /start
const startedAt = db.prepare('PRAGMA table_info(sessions)').all()
  .find(c => c.name === 'started_at')
if (startedAt?.notnull === 1) {
  db.pragma('foreign_keys = OFF')
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
  `)
  db.pragma('foreign_keys = ON')
}
```

(The rebuild preserves ids, so `queue_entries.session_id` references stay valid. `PRAGMA table_info` reports `notnull` as `0`/`1`.)

- [ ] **Step 4: Create drafts and add the start route**

In `server/routes/sessions.js`, replace the POST handler's INSERT (lines 14-23) with:

```js
router.post('/', (req, res) => {
  const { name, scheduled_start, scheduled_end, court_count } = req.body
  const { lastInsertRowid } = db.prepare(
    'INSERT INTO sessions (name, scheduled_start, scheduled_end, court_count) VALUES (?, ?, ?, ?)'
  ).run(name, scheduled_start, scheduled_end, court_count ?? 2)
  const session = db.prepare('SELECT * FROM sessions WHERE id = ?').get(lastInsertRowid)
  broadcast()
  res.status(201).json({ session })
})
```

Add this route immediately after the POST handler:

```js
router.patch('/:id/start', (req, res) => {
  const session = db.prepare('SELECT * FROM sessions WHERE id = ?').get(req.params.id)
  if (!session) return res.status(404).json({ error: 'Session not found' })
  if (session.ended_at) return res.status(400).json({ error: 'Session already ended' })
  if (session.started_at != null) return res.status(400).json({ error: 'Session already started' })
  const now = Math.floor(Date.now() / 1000)
  db.prepare('UPDATE sessions SET started_at = ? WHERE id = ?').run(now, req.params.id)
  const updated = db.prepare('SELECT * FROM sessions WHERE id = ?').get(req.params.id)
  broadcast()
  res.json({ session: updated })
})
```

- [ ] **Step 5: Guard match creation on unstarted sessions**

In `server/routes/matches.js`, at the top of the `router.post('/')` handler (after line 38, before the INSERT), add:

```js
  const session = db.prepare('SELECT * FROM sessions WHERE id = ?').get(session_id)
  if (!session) return res.status(404).json({ error: 'Session not found' })
  if (session.started_at == null) return res.status(400).json({ error: 'Session not started' })
```

- [ ] **Step 6: Run tests to verify they pass**

With the dev server still running (it hot-reloads via `node --watch`):

```bash
node server/routes/sessions.test.js
node server/routes/matches.test.js
node server/routes/queue.test.js
```

Expected: all three print `all assertions passed`, exit 0. If the watch server did not reload, restart it and re-run.

- [ ] **Step 7: Commit**

```bash
git add server/db.js server/routes/sessions.js server/routes/matches.js server/routes/sessions.test.js
git commit -m "feat: sessions create as drafts; PATCH /sessions/:id/start; block matches until started"
```

---

### Task 2: Client — setup screen with player pool

**Files:**
- Modify: `client/src/api.js` (add `startSession` next to `createSession`, line 13)
- Create: `client/src/components/SetupScreen.jsx`
- Modify: `client/src/App.jsx` (draft branch)
- Modify: `client/src/components/Header.jsx` (draft badge, elapsed guard)
- Modify: `client/src/components/CreateSessionModal.jsx:62` (button copy)

**Interfaces:**
- Consumes (from Task 1): `PATCH /api/sessions/:id/start`; `session.started_at === null` means draft; existing `POST /api/sessions/:id/checkin` body `{ player_id }` (already in `api.js` as `checkinPlayer(sessionId, playerId)`); SSE payload already includes the draft session and its queue.
- Produces:
  - `client/src/api.js`: `export const startSession = id => req('PATCH', `/sessions/${id}/start')`
  - `SetupScreen` props: `{ session, queue }` — it fetches the player pool itself and calls `startSession` internally.
  - `SKILL_BADGE` map from `client/src/lib/utils.js` (same usage as `PlayerCard.jsx:41`).

- [ ] **Step 1: Add the API client function**

In `client/src/api.js`, after line 13 (`createSession`), add:

```js
export const startSession = id => req('PATCH', `/sessions/${id}/start`)
```

- [ ] **Step 2: Create SetupScreen**

Create `client/src/components/SetupScreen.jsx` with these contents:

```jsx
import { useState, useEffect } from 'react'
import { cn, SKILL_BADGE } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { checkinPlayer, getPlayers, startSession } from '../api.js'

const fmtTime = ts =>
  ts ? new Date(ts * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '—'

function SkillChip({ level }) {
  return (
    <Badge className={cn('border-0 text-2xs', SKILL_BADGE[level] ?? SKILL_BADGE.intermediate)}>
      {level?.replace('_', ' ') ?? ''}
    </Badge>
  )
}

export default function SetupScreen({ session, queue }) {
  const [players, setPlayers] = useState([])
  const [loading, setLoading] = useState(true)
  const [starting, setStarting] = useState(false)

  useEffect(() => {
    getPlayers()
      .then(d => setPlayers(d.players))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  const inQueue = new Set(queue.map(e => e.player_id))
  const pool = players.filter(p => !inQueue.has(p.id))
  const canStart = queue.length >= 2

  async function handleStart() {
    setStarting(true)
    try {
      await startSession(session.id)
    } catch {
      // SSE keeps the truth; re-enable the button to retry
    } finally {
      setStarting(false)
    }
  }

  return (
    <div className="flex flex-1 items-center justify-center overflow-y-auto p-4">
      <Card className="w-full max-w-xl border-border bg-card shadow-sm">
        <CardHeader className="gap-1">
          <CardTitle className="text-lg">{session.name}</CardTitle>
          <span className="text-2xs uppercase tracking-wider text-muted-foreground">
            {fmtTime(session.scheduled_start)}–{fmtTime(session.scheduled_end)} · {session.court_count} courts · Not started
          </span>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="flex items-center gap-3">
            <Button size="sm" disabled={!canStart || starting} onClick={handleStart}>
              {starting ? '...' : 'Start Session'}
            </Button>
            {!canStart && (
              <span className="text-xs text-muted-foreground">
                Add at least 2 players from the pool to start.
              </span>
            )}
          </div>

          <div className="flex flex-col gap-2">
            <span className="text-sm font-semibold text-foreground">Player pool</span>
            {loading && (
              <div className="flex flex-wrap gap-2">
                <Skeleton className="h-6 w-24" />
                <Skeleton className="h-6 w-20" />
                <Skeleton className="h-6 w-28" />
              </div>
            )}
            {!loading && pool.length === 0 && (
              <span className="text-xs text-muted-foreground">All registered players are in the queue.</span>
            )}
            <div className="flex flex-wrap gap-2">
              {pool.map(p => (
                <Button
                  key={p.id}
                  variant="outline"
                  size="xs"
                  onClick={() => checkinPlayer(session.id, p.id).catch(() => {})}
                >
                  {p.name}
                  <SkillChip level={p.skill_level} />
                </Button>
              ))}
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <span className="text-sm font-semibold text-foreground">
              Queue · <span className="font-mono tabular-nums">{queue.length}</span>
            </span>
            {queue.length === 0 && (
              <span className="text-xs text-muted-foreground">No players yet.</span>
            )}
            <ol className="flex flex-col gap-1">
              {queue.map((e, i) => (
                <li
                  key={e.id}
                  className="flex items-center gap-2 rounded-md border border-border bg-muted/30 px-3 py-1.5 text-sm"
                >
                  <span className="font-mono text-xs text-muted-foreground">{i + 1}</span>
                  <span className="font-medium text-foreground">{e.name}</span>
                  <SkillChip level={e.skill_level} />
                </li>
              ))}
            </ol>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
```

Notes baked in: check-in clicks swallow errors (a double-click 409 is harmless; SSE converges the UI); pool chips disappear as players enter the queue because `queue` arrives over SSE every second; the queue list is already ordered by `sort_order` from the SSE query.

- [ ] **Step 3: Branch App.jsx on draft state**

In `client/src/App.jsx`:
1. Add the import after the other component imports (line 10): `import SetupScreen from './components/SetupScreen.jsx'`. (`startSession` is called inside SetupScreen, so App needs no new api import.)
2. Replace the dashboard/empty branches (lines 58-96) with:

```jsx
      {session && session.started_at == null && (
        <SetupScreen session={session} queue={queue} />
      )}
      {session && session.started_at != null && (
        <div className="flex flex-1 overflow-hidden">
          <main className="flex min-w-0 flex-1 flex-col gap-4 overflow-hidden p-4">
            {/* band heights from the target arrangement: courts h-[45%] min-h-[300px], queue flex-1 */}
            <div className="grid h-[45%] min-h-[300px] shrink-0 overflow-hidden">
              <CourtsRow
                session={session}
                activeMatches={activeMatches}
                queue={queue}
                playSeconds={playSeconds}
                selection={selection}
                onStartMatch={handleStartMatch}
                onDropPlayer={handleDropOnCourt}
                armedCourt={armedCourt}
              />
            </div>
            <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
              <QueueGrid
                session={session}
                queue={queue}
                waitSeconds={waitSeconds}
                selection={selection}
                onSelectionChange={setSelection}
                onReorder={handleReorder}
              />
            </div>
          </main>
          <aside className="w-72 shrink-0 overflow-y-auto border-l border-border bg-card">
            <StatsSidebar stats={stats} />
          </aside>
        </div>
      )}
      {!session && (
        <div className="flex flex-1 items-center justify-center">
          <Button size="lg" onClick={() => setShowCreate(true)}>
            + Start New Session
          </Button>
        </div>
      )}
      {showCreate && <CreateSessionModal onClose={() => setShowCreate(false)} />}
```

(The dashboard JSX inside the started branch is byte-identical to the current block — only the wrapping condition changed from `session &&` to `session && session.started_at != null &&`.)

- [ ] **Step 4: Header draft state**

In `client/src/components/Header.jsx`:
1. Guard the elapsed effect (line 10): change `if (!session) return` to `if (!session || session.started_at == null) return`.
2. Replace the elapsed Badge block (lines 35-39) with:

```jsx
        {session && session.started_at != null && (
          <Badge variant="outline" className="font-mono tabular-nums text-primary border-primary/30">
            ● {fmtDur(elapsed)}
          </Badge>
        )}
        {session && session.started_at == null && (
          <Badge variant="outline" className="text-2xs uppercase tracking-wider text-muted-foreground">
            Not started
          </Badge>
        )}
```

- [ ] **Step 5: Modal button copy**

In `client/src/components/CreateSessionModal.jsx:62`, change `{loading ? '...' : 'Start Session'}` to `{loading ? '...' : 'Create Session'}`.

- [ ] **Step 6: Build + existing client tests**

```bash
cd client && npm run build
node src/hooks/useTimers.test.js
node src/lib/dnd.test.js
```

Expected: build succeeds, both tests print pass, exit 0.

- [ ] **Step 7: Browser smoke check**

```bash
npm run dev --prefix server &
npm run dev --prefix client &
```

Open `http://localhost:3003`. Expected flow: no session → "+ Start New Session" → modal → "Create Session" → setup screen shows session name, "Not started" badge in header, pool chips (or "All registered players are in the queue."), Start disabled with hint → click 2+ pool chips → they move to the numbered queue list → Start Session enabled → click it → dashboard appears (courts band, queue grid, stats sidebar), header shows the running elapsed badge. Also verify: ending the session from anywhere returns to the no-session screen (use `curl -X PATCH http://localhost:3001/api/sessions/<id>/end` if no UI path is handy).

- [ ] **Step 8: Commit**

```bash
git add client/src/api.js client/src/components/SetupScreen.jsx client/src/App.jsx client/src/components/Header.jsx client/src/components/CreateSessionModal.jsx
git commit -m "feat: setup screen with player pool; sessions start explicitly via Start Session"
```
