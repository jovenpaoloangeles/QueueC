# Architecture

QueueC is a single-process app: a Bun + Hono server that serves both the REST
API (under `/api`) and the built React client (`client/dist`) as static files,
backed by one SQLite database. All browsers stay in sync through one
Server-Sent-Events stream.

```
client/  React 18 + Vite + Tailwind v4 (shadcn/ui on Base UI)
server/  Bun + Hono, SQLite via bun:sqlite
```

## Server

`server/index.js` mounts the routers and serves the client build:

| Mount | Router | Responsibility |
|---|---|---|
| `/api/sessions` | `routes/sessions.js` | create/start/end session lifecycle |
| `/api/sessions` | `routes/sessions.js` + `routes/stats.js` | per-session stats read |
| `/api/players` | `routes/players.js` | the persistent player roster |
| `/api` | `routes/queue.js` | queue entries: check-in, status (waiting/resting/…), reorder, remove |
| `/api` | `routes/slate.js` | on-deck slates: create/edit/reorder/cancel/start |
| `/api/matches` | `routes/matches.js` | start/end matches, team edits, per-match shuttles |
| `/api` | `routes/stats.js` | stats + leaderboard; session-level shuttle adjustments |
| `/api` | `routes/sse.js` | the state stream (see below) |
| `/api/sessions` | `routes/courts.js` | court add/remove/update, rental windows |
| `/api` | `routes/automatch.js` | Smart Match dry-run + execute |

`server/db.js` owns the schema and runs idempotent migrations on boot (PRAGMA
column checks, table rebuilds where a column had to change). On first boot it
seeds the player roster from `PLAYERS_PATH` (default `players.json`;
[`players.example.json`](../players.example.json) is the shipped sample).

### The SSE state model

The whole UI state is derived server-side in one place (`routes/sse.js`):
session row, queue entries, active matches, slated matches, courts, stats
(counts, avg wait, leaderboard, shuttles). Any mutation route calls
`broadcast()`, which recomputes that state and pushes an `event: state` frame
to every connected client. Clients render it and diff nothing — there is no
client-side cache to invalidate. Consequences worth knowing before you edit:

- **Every write path must call `broadcast()`**, or browsers silently diverge.
- Adding a field to the UI usually means adding it to this one state builder.
- The client connects to `GET /api/sse` (`client/src/App.jsx`) and treats each
  frame as the truth; timers are rendered from `serverTime`.

### Data model (SQLite)

- `players` — persistent roster: name, skill_level (7 stored tiers,
  `newbie`…`professional`).
- `sessions` — name, scheduled window, started_at/ended_at, court_count,
  `shuttles_extra` (manual + New-shuttle adjustments).
- `courts` — per session: label, rental `duration_minutes`, `active_from` /
  `expires_at` (staggered opens), disabled flag.
- `queue_entries` — per session/player: status (`waiting`, `resting`,
  `playing`, `staged`, `left`), checked_in_at, `total_seconds_played` (net-wait
  accounting), manual order.
- `matches` — teams (entry ids), scores, state (`slated` → `active` → ended via
  `ended_at`), `slate_seq` ordering, `started_at`, `new_shuttles` /
  `used_shuttles` (a new game stamps `new_shuttles = 1` at every start path),
  rating.

### Smart Match (as implemented)

`routes/automatch.js` is a pragmatic heuristic, deliberately simple: it sorts
waiting players by net wait and games played, builds quartets that keep skill
variance low and teams balanced, avoids repeating recent pairings, and returns
a **plan**. The API is always dry-run first — `POST /api/sessions/:id/automatch`
with `{dry_run: true}` (optionally `slate_only: true`) returns the plan without
writing; posting `{plan}` back executes exactly it, with a 409 if the queue
moved in between. The UI never slates without showing you the plan.

For the full two-stage ε-lexicographic optimizer design (quartet filtering,
split ranking, multi-court batch assignment), see [algorithm.md](algorithm.md) —
a spec, not yet implemented.

## Client

`client/src/App.jsx` subscribes to SSE and renders one screen:

- `SetupScreen` — pre-start check-in flow.
- `Header` — session identity, counts, timers, global actions.
- `CourtsRow` / `CourtCard` — idle lineup drafting and live matches.
- `OnDeckStrip` — slate cards + the lineup builder.
- `QueueGrid` / `PlayerCard` — the pool with All/Wait/Rest tabs, rest tray,
  remove-with-confirm.
- `StatsSidebar` — figures + leaderboard.
- Drag and drop is HTML5 DnD (`client/src/lib/dnd.js` validity rules);
  `client/src/api.js` is a thin fetch wrapper over the REST surface.

Styling is Tailwind v4 with the design tokens in `client/src/index.css`
(the visual system was ported from `queuec-live-redesign-draft.html`, kept in
the repo as the design reference).

## Deployment

`Dockerfile` builds the client, installs server deps, and runs
`bun server/index.js` on `PORT` (default 3001) with `DB_PATH` under `/data`.
`docker/queuec/compose.yml`-style compose files typically mount a host dir at
`/data` (persistence) and a players file over `/data/players.json` (roster).
