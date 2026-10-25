# QueueC — Badminton Queue Manager

**Date:** 2026-10-13
**Status:** Approved

---

## Overview

A local web app for a queue master to organize casual badminton sessions. The queue master runs the app on a laptop (Chrome), manages all input, and players do not interact with the app directly. Designed for minimum clicks and fast interactions.

---

## Stack

| Layer      | Choice                                            |
| ---------- | ------------------------------------------------- |
| Frontend   | React (Vite)                                      |
| Backend    | Node.js + Express                                 |
| Database   | SQLite via `better-sqlite3`                       |
| Real-time  | Server-Sent Events (SSE) for live timer updates   |
| Dev runner | `concurrently` — single `npm run dev` starts both |

Runs locally at `localhost:3000`. No auth. No deployment.

---

## Layout — V2 (Courts Top Bar)

```
┌─────────────────────────────────────────────────────────────────┐
│ HEADER: QueueC · Session name · Scheduled time · Elapsed timer  │
├─────────────────────────────────────────────────────────────────┤
│ COURTS (full-width row — one card per court)                    │
│  [Court 1: playing, live timer, score, End button]              │
│  [Court 2: empty, Start button]   [Court 3: empty, Start]       │
├──────────────────────────────────────┬──────────────────────────┤
│ QUEUE (2-column grid)                │ STATS SIDEBAR            │
│  Player cards sorted by wait time    │  Players in session      │
│  Selected = highlighted + numbered   │  Matches played          │
│  Send to Court button (2 or 4 sel.)  │  Avg wait time           │
│                                      │  Leaderboard (wins today)│
└──────────────────────────────────────┴──────────────────────────┘
```

**Theme:** C1 — clean/minimal dark (slate palette, `#0a0f1a` base, `#4ade80` active court accent, `#1d4ed8` selection accent).

---

## Data Model (SQLite)

### `players`

| Column      | Type       | Notes                                                              |
| ----------- | ---------- | ------------------------------------------------------------------ |
| id          | INTEGER PK |                                                                    |
| name        | TEXT       |                                                                    |
| skill_level | TEXT       | `newbie` `beginner` `intermediate` `upper_intermediate` `advanced` |
| created_at  | INTEGER    | Unix timestamp                                                     |

### `sessions`

| Column          | Type       | Notes                  |
| --------------- | ---------- | ---------------------- |
| id              | INTEGER PK |                        |
| name            | TEXT       | e.g. "Evening Session" |
| scheduled_start | INTEGER    | Unix timestamp         |
| scheduled_end   | INTEGER    | Unix timestamp         |
| started_at      | INTEGER    |                        |
| ended_at        | INTEGER    | NULL while active      |

### `queue_entries`

One row per player per session. Tracks their full lifecycle for the day.

| Column               | Type       | Notes                                           |
| -------------------- | ---------- | ----------------------------------------------- |
| id                   | INTEGER PK |                                                 |
| session_id           | INTEGER FK |                                                 |
| player_id            | INTEGER FK |                                                 |
| checked_in_at        | INTEGER    | Start of their wait timer                       |
| status               | TEXT       | `waiting` `playing` `resting` `left`            |
| last_played_at       | INTEGER    | NULL if never played; used for wait timer       |
| total_seconds_played | INTEGER    | Running sum (seconds) updated on each match end |

### `matches`

| Column       | Type                       | Notes                 |
| ------------ | -------------------------- | --------------------- |
| id           | INTEGER PK                 |                       |
| session_id   | INTEGER FK                 |                       |
| court_number | INTEGER                    |                       |
| format       | TEXT                       | `singles` `doubles`   |
| team1_p1     | INTEGER FK → queue_entries |                       |
| team1_p2     | INTEGER FK → queue_entries | NULL for singles      |
| team2_p1     | INTEGER FK → queue_entries |                       |
| team2_p2     | INTEGER FK → queue_entries | NULL for singles      |
| team1_score  | INTEGER                    | NULL until match ends |
| team2_score  | INTEGER                    | NULL until match ends |
| started_at   | INTEGER                    |                       |
| ended_at     | INTEGER                    | NULL while playing    |

---

## Timer Logic

All timers computed from timestamps — nothing stored as a running counter.

| Timer                  | Formula                                                   |
| ---------------------- | --------------------------------------------------------- |
| **Waiting**            | `NOW − checked_in_at − total_seconds_played`              |
| **Playing**            | `NOW − match.started_at` (live, on court card)            |
| **Total played today** | `queue_entry.total_seconds_played` (updated on match end) |

Timers update via SSE every second; the client increments them locally between pushes.

---

## Features

### Session Management

- Create session: name + scheduled start/end time, number of courts
- Session elapsed timer in header
- End session: marks `sessions.ended_at`, archives all queue entries

### Player Management

- Global player roster (persists across sessions)
- Add player to roster: name + skill level
- Check player into current session: creates `queue_entry`, starts waiting timer
- Mark player as resting or left (removes from queue display, preserves history)

### Queue

- **Manual mode:** Queue master clicks any players freely
- **Smart mode:** System highlights suggested next players sorted by:
  1. Longest wait time (primary)
  2. Skill balance across the two teams (tiebreaker)
  - Queue master can deselect and pick different players before confirming
- Player selection: sequential clicks set play order
  - Click 1 → Player 1 (Team 1), Click 2 → Player 2 (Team 1)
  - Click 3 → Player 3 (Team 2), Click 4 → Player 4 (Team 2)
  - 2 selected = singles automatically; 4 selected = doubles automatically
- "Send to Court ▼" dropdown appears when 2 or 4 players selected; queue master picks target court

### Courts

- Configurable number of courts per session (set at session creation)
- Each court card shows:
  - Status: empty or playing
  - Players and team assignment
  - Live play timer (counts up from match start)
  - Live score (editable inline during match — click to update)
- **End Match flow:**
  1. Queue master clicks "End Match"
  2. Modal: confirm/edit final scores
  3. On confirm: match saved, `queue_entry.last_played_at` set to now, `total_seconds_played` incremented by match duration, players' status → `waiting`, court → empty

### Stats Sidebar

- Players currently in session
- Total matches played today
- Average wait time across all waiting players
- Leaderboard: top 3-5 players by wins today

### History & Persistence

- All matches saved to SQLite with full player/score/time data
- Per-player win/loss record queryable across all sessions
- Sessions are archived (not deleted) on end; `queue_entries` and `matches` retain their `session_id` for historical queries

---

## API Routes (Express)

```
GET    /api/sessions/active         — current session or null
POST   /api/sessions                — create session
PATCH  /api/sessions/:id/end        — end session

GET    /api/players                 — full roster
POST   /api/players                 — add player to roster

POST   /api/sessions/:id/checkin    — check player into session
PATCH  /api/queue/:entryId/status   — set waiting/resting/left

GET    /api/sessions/:id/queue      — queue entries with computed timers
POST   /api/matches                 — start match (sets court, players, started_at)
PATCH  /api/matches/:id/end         — end match (sets scores, ended_at, updates queue)

GET    /api/sessions/:id/stats      — sidebar stats
GET    /api/players/:id/history     — win/loss history

GET    /api/sse                     — SSE stream for live timer/state updates
```

---

## Project Structure

```
QueueC/
├── server/
│   ├── index.js          — Express app entry
│   ├── db.js             — better-sqlite3 setup + migrations
│   ├── routes/
│   │   ├── sessions.js
│   │   ├── players.js
│   │   ├── queue.js
│   │   ├── matches.js
│   │   └── sse.js
│   └── logic/
│       └── smartQueue.js — suggestion algorithm
├── client/
│   ├── src/
│   │   ├── App.jsx
│   │   ├── components/
│   │   │   ├── Header.jsx
│   │   │   ├── CourtsRow.jsx
│   │   │   ├── CourtCard.jsx
│   │   │   ├── QueueGrid.jsx
│   │   │   ├── PlayerCard.jsx
│   │   │   ├── StatsSidebar.jsx
│   │   │   └── EndMatchModal.jsx
│   │   ├── hooks/
│   │   │   ├── useSSE.js
│   │   │   └── useTimers.js
│   │   └── api.js        — fetch wrappers
│   └── index.html
├── package.json          — root, runs both via concurrently
└── queuec.db             — SQLite file (gitignored)
```

---

## Smart Queue Algorithm

```
score(player) = waitSeconds(player) - skillPenalty(player, otherSelected)

skillPenalty = abs(avgSkill(team1) - avgSkill(team2)) × weight
```

Skill levels map to integers: `newbie=1, beginner=2, intermediate=3, upper_intermediate=4, advanced=5`.

For singles: suggest the 2 players with longest wait.
For doubles: suggest the 4-player combination that maximizes wait time while minimizing skill imbalance between teams.

Queue master always sees the suggestion pre-selected and can override before confirming.

---

## Out of Scope (this version)

- Player self-check-in (queue master only)
- Multi-venue / multi-device
- Authentication
- Mobile layout
- Score broadcasting / public display
