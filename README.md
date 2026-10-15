# QueueC

A self-hosted badminton queue manager for gym sessions. One screen, one queue master, no paper lists.

![screenshot placeholder]

## Features

- **Setup flow** — one screen, no dialogs: start time, number of courts and rental hours per court; build the waiting pool with search-and-add (history-ordered, select-all, tier filter); **Start Session** creates the session, checks in the selection and starts the clocks
- **Live courts** — per-court rental countdown with EXPIRED alert and **Extend +1h**; elapsed match timer; drag-and-drop 2x2 lineups
- **Slate / On Deck** — queue upcoming matches (create, edit, cancel); drafted players leave the queue; slated matches auto-promote to a free court when a match ends
- **Smart Match** — one click fills free courts / slates matches using wait time, games played, skill variance, team balance and pair redundancy
- **Shuttle counters** — live new/used shuttle +/- per match
- **Two-step end match** — confirm, then record scores, final shuttles and a 1–5 star rating
- **Player queue** — All / Wait / Rest tabs, fairness ordering, 7 skill tiers (Newbie → Professional), rest/wake with validation
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
| `PATCH /courts/:id/extend` | Extend rental (+60 min) |
| `GET/POST /players`, `PATCH /players/:id`, `GET /players/:id/history` | Player pool (duplicate name → 409) |
| `POST /sessions/:id/checkin`, `DELETE /queue/:entryId`, `PATCH /queue/order`, `GET /sessions/:id/suggest` | Queue |
| `PATCH /queue/:entryId/status` | waiting/resting. 409 if resting a `playing` or `staged` player, or setting a `playing` player to waiting |
| `POST /matches` | Start live match on a court |
| `PATCH /matches/:id/end`, `/teams`, `/shuttles` | End (scores, shuttles, rating), edit teams, shuttle counts |
| `POST /matches/slate`, `PATCH /matches/:id/slate`, `DELETE /matches/:id/slate` | Create / edit / cancel a slated (On Deck) match |
| `POST /sessions/:id/automatch` | Smart Match (409 if no free court and <2 waiting, or <4 to slate) |
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

E2E env: `PW_WORKERS` (default 5), `PW_BASE_PORT` (default 3410; worker N uses port+N). `ensure-build` rebuilds `client/dist` only if sources are newer. Note: HTTP-based server tests reset the active session, so don't point them at a server holding real data.

## License

MIT
