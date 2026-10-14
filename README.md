# QueueC

A self-hosted badminton queue manager for gym sessions. One screen, one queue master, no paper lists.

![screenshot placeholder]

## Features

- **Session management** — create a session, set courts and scheduled time, start when ready
- **Player pool** — register players with skill levels; check them in per session
- **Smart queue** — auto-suggests balanced matchups using wait time, games played, skill variance, and pair redundancy
- **Live courts** — drag players onto courts to start singles or doubles; end matches and record scores
- **Resting tray** — players who stepped out stay tracked
- **Real-time sync** — all connected browsers stay in sync via SSE (no polling)
- **Stats sidebar** — per-session games played, wait time, and win/loss per player

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

The compose file is in `docker/compose.yml` (copy it anywhere — it builds from the repo path). The app runs on port `3001` and persists the database to `./data/queuec.db`.

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
│   └── routes/           # sessions, players, queue, matches, stats, sse, courts
├── client/
│   └── src/
│       ├── App.jsx
│       ├── api.js
│       ├── components/   # CourtCard, QueueGrid, SetupScreen, …
│       └── hooks/        # useSSE, useTimers
└── Dockerfile
```

## License

MIT
