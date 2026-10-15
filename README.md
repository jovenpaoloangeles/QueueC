# QueueC

A self-hosted badminton queue manager for gym sessions. One screen, one queue master, no paper lists.

![screenshot placeholder]

## Features

- **Setup flow** — one screen, no modals: session name defaults to `ASTIRISK (DD-Mmm-YYYY)`, whole-hour start-time select (06:00–23:00), number of courts with a per-court label and rental HOURS (0.5–12); alphabetical, letter-grouped pool with search-and-add, select-all and tier filter; double-click a row (or ✎) to edit name/skill inline; **Start Session** creates the session, checks in the selection and starts the clocks
- **Live courts** — per-court rental countdown; expired court (idle or mid-match) shows **Extend Court (+1hr)?** — idle it pulses EXPIRED and leaves the available pool, mid-match the game keeps running under a **Last Game** badge (server extends an hour from max(expires_at, now)); elapsed match timer; drag-and-drop 2×2 lineups
- **Start confirmation** — a match never starts without the confirm dialog: Start Match, Start Singles and the 4th-slot drop on an idle court all open it; header Smart Match dry-runs a plan first and executes exactly what you confirmed
- **Slate / On Deck** — always mounted (empty state included): numbered cards with skill-balance label and next-free-court ETA, manual **＋ Build lineup** builder (drag 4 / Use selection / Add to On Deck), **Smart add**, multiple slates up to 3 counted across existing ones, ↑/↓ reorder, edit/cancel; drafted players leave the queue and slated matches auto-promote to a free court when a match ends
- **Smart Match** — fills free courts / slates matches using wait time, games played, skill variance, team balance and pair redundancy
- **Shuttle counters** — live new/used shuttle +/- per match
- **Two-step end match** — confirm, then record scores, final shuttles and a 1–5 star rating
- **Player queue** — All / Wait / Rest tabs, fairness ordering, 7 skill tiers (Newbie → Professional); Rest/Wake buttons or drag-and-drop both ways (waiting rows into the Resting tray, resting chips back out)
- **Leaderboard** — rank, games, W/L, win rate, point differential
- **Header status, toasts, dark theme**
- **Real-time sync** — all browsers stay in sync via SSE

## Stack

| Layer | Tech |
|-------|------|
| Frontend | React 18, Vite, Tailwind CSS v4, shadcn/ui (Base UI) |
| Backend | Bun, Hono |
| Database | SQLite via `bun:sqlite` |
| Real-time | Server-Sent Events |

## Local Development

```bash
# Install all deps (root + server + client)
bun run install:all

# Start server (port 3001) + client dev server (port 3003) concurrently
bun run dev
```

The client dev server proxies `/api` to `localhost:3001`. Open `http://localhost:3003`.

## Docker

```bash
# Build and run
docker compose up -d --build
```

The app runs on port `3001` and persists the database to the mounted `/data` volume (`/data/queuec.db`). Migrations run automatically on startup; never wipe the volume.

```yaml
# minimal compose.yml
services:
  queuec:
    build: /path/to/QueueC
    ports:
      - "3001:3001"
    volumes:
      - ./data:/data
```

## Configuration

| Env var | Default | Description |
|---------|---------|-------------|
| `PORT` | `3001` | HTTP port |
| `DB_PATH` | `../queuec.db` | Path to SQLite database file |
| `NODE_ENV` | — | Set to `production` to serve the built client |
| `DB_PATH` dir | — | `players.json` is looked up in the same directory as the DB file (e.g. `/data/players.json` when `DB_PATH=/data/queuec.db`) |

## Project Structure

```
QueueC/
├── server/
│   ├── index.js          # Hono + Bun.serve app entry
│   ├── db.js             # SQLite setup and migrations (bun:sqlite)
│   └── routes/           # sessions, players, queue, matches, slate, automatch, stats, sse, courts
├── client/
│   └── src/
│       ├── App.jsx
│       ├── api.js
│       ├── components/   # CourtCard, QueueGrid, SetupScreen, …
│       └── hooks/        # useSSE, useTimers
└── Dockerfile
```

## API

All under `/api`. Mutations broadcast an SSE update.

| Method & path | Purpose |
|---|---|
| `GET /sessions/active`, `POST /sessions`, `PATCH /sessions/:id/start`, `/end` | Session lifecycle |
| `GET/POST /sessions/:id/courts`, `PATCH/DELETE /courts/:id` | Courts (delete → 409 if it has matches) |
| `PATCH /courts/:id/extend` | Extend rental (default +60 min). An expired court reopens: new expiry = max(expires_at, now) + minutes; 400 if the court has no rental timer |
| `GET/POST /players`, `PATCH /players/:id`, `GET /players/:id/history` | Player pool (duplicate name → 409) |
| `POST /sessions/:id/checkin`, `DELETE /queue/:entryId`, `PATCH /queue/order`, `GET /sessions/:id/suggest` | Queue |
| `PATCH /queue/:entryId/status` | waiting/resting. 409 if resting a `playing` or `staged` player, or setting a `playing` player to waiting |
| `POST /matches` | Start live match on a court (client always confirms first) |
| `PATCH /matches/:id/end`, `/teams`, `/shuttles` | End (scores, shuttles, rating), edit teams, shuttle counts |
| `POST /matches/slate`, `PATCH /matches/:id/slate`, `DELETE /matches/:id/slate` | Create / edit / cancel a slated (On Deck) match; `PATCH {move:'up'\|'down'}` reorders by swapping `slate_seq` with the adjacent slate |
| `POST /sessions/:id/automatch` | Smart Match. `{dry_run:true}` → `{plan {matches, slate}}` with no writes; post `{plan}` to execute exactly that plan (server re-validates → 409 `Queue changed — review and try again` if stale). `{slate_only:true}` plans On Deck lineups only. On Deck capped at 3 (existing + new). Response `{started, slated, slated_count}`; 409 if nothing to auto-match (need a free court and ≥2 waiting, or ≥4 to slate) |
| `GET /sessions/:id/stats` | Leaderboard: played, wins, win_rate, point_diff |
| `GET /sse` | Event stream |

## Testing

```bash
# Server tests — pure ones run standalone:
bun server/db.test.js
# HTTP-based ones need a running server; BASE_URL defaults to http://localhost:3001/api
BASE_URL=http://localhost:3001/api bun server/routes/automatch.test.js

# Client unit tests
cd tests && bun run test:unit

# E2E (Playwright). Each worker starts its own server + temp DB.
cd tests && bun run test:e2e
```

E2E env: `PW_WORKERS` (default 5), `PW_BASE_PORT` (default 3410; worker N uses port+N). `ensure-build` rebuilds `client/dist` only if sources are newer. The full Playwright suite is 203 tests across 28 specs, ~2.7 min at 5 workers. Specs from this round: `02-session-setup`, `25-court-expiry`, `26-resting-dnd`, `27-start-confirm`, `28-on-deck`. Note: HTTP-based server tests reset the active session, so don't point them at a server holding real data.

## License

MIT
