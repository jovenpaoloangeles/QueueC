# QueueC

A self-hosted badminton queue manager for gym sessions. One screen, one queue
master, no paper lists.

QueueC runs the whole evening: check players in, draft lineups onto courts,
keep an on-deck slate promoting itself as courts free up, track court rentals
and shuttles, and close with a leaderboard. Everything on screen stays in sync
in real time across browsers — put it on the gym TV and players can see when
they're up.

## Quickstart (Docker)

```bash
git clone https://github.com/YOUR_USER/QueueC.git
cd QueueC
docker build -t queuec .
docker run -d --name queuec -p 3001:3001 \
  -v queuec-data:/data \
  -v "$PWD/players.json:/data/players.json" \
  queuec
```

Open `http://localhost:3001`. On first boot the database is seeded from
`players.json` (copy [`players.example.json`](players.example.json) if you
don't have one yet) — edit the roster in the app afterwards.

Without Docker: install [Bun](https://bun.sh), then
`bun install && bun install --cwd server && bun install --cwd client` and
`bun run dev` (client on Vite's port, API on 3001).

## What it does

- **One-screen setup** — session name, start time, courts with per-court
  rental hours and staggered opens, alphabetical player pool, one Start button.
- **Live courts** — drag-and-drop 2×2 lineup drafting, confirm-gated match
  starts, per-court rental countdown with mid-match extend, team rearranging.
- **On Deck slate** — build lineups manually or review a Smart Match plan;
  slates auto-promote to the next free court; nothing starts unconfirmed.
- **Smart Match** — a dry-run-first matching heuristic (wait time, games
  played, skill variance, team balance, pair redundancy); it never writes
  without showing you the plan. [Algorithm deep-dive →](docs/algorithm.md)
- **Fair queue** — net-wait clocks (playing time doesn't count toward your
  wait), rest/wake, alphabetical check-in, remove-with-confirm.
- **Shuttles & stats** — 1 shuttle per game by default with manual extras,
  live leaderboard (W/L, win %, point differential).
- **Session controls & history** — end/new session with confirm; everything
  persists in SQLite.

## Documentation

| Doc | For |
|---|---|
| [docs/usage.md](docs/usage.md) | Operating a session (queue-master guide) |
| [docs/architecture.md](docs/architecture.md) | How the server, SSE state model and client fit together |
| [docs/algorithm.md](docs/algorithm.md) | Smart Match: the shipped heuristic + the target optimizer design |
| [docs/testing.md](docs/testing.md) | Running the test suites |
| [docs/ai-harness.md](docs/ai-harness.md) | Contributing with Claude Code / an AI agent |
| [docs/workflow.md](docs/workflow.md) | The original product workflow spec |
| [CLAUDE.md](CLAUDE.md) | Agent policy this repo is developed under |

## Development

```bash
bun run install:all        # root + server + client
bun run dev                # client + API with reload

cd tests && bun run test:server   # sub-second API regressions
cd tests && bun run test          # unit + full Playwright e2e
```

CI runs the server tests, the client build, and the full e2e suite on every
push/PR — the suites boot their own throwaway servers, so nothing touches a
real instance. See [docs/testing.md](docs/testing.md) and
[docs/ai-harness.md](docs/ai-harness.md) before your first change.

## License

[MIT](LICENSE)
