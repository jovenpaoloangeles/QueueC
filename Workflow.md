# Current Workflow (as implemented)

1. **Setup** — set courts, hourly rate, start time; search/add players to the waiting pool (select-all available) → **Finish Setup**.
2. **Live** — header shows courts in use, waiting count, longest/avg wait; actions: Smart Match, Add Player, New Session, dark toggle.
   - **Courts**: drag players into Team A/B to start a match; countdown per court, Extend +1h when expired; shuttle +/-.
   - **On Deck**: slate matches for the next free court; auto-promoted when a court frees.
   - **Queue**: All/Wait/Rest tabs; rest/wake.
   - **End match**: confirm → scores, shuttles, 1–5 star rating.
   - **Leaderboard**: win rate and point differential.

---
(Original mockup notes below.)

Here is a complete, end-to-end architecture and operational workflow for a **Badminton Queue Master Webapp**, structured as a state-driven system across your three defined phases.

---

### System State Machine Overview

```
[PHASE 1: INITIALIZATION] 
   ├── Session & Court Config (Time, Courts, Billing Model)
   └── Roster & Skill Matrix (Elo/Tier Seeding, Constraints)
          │
          ▼
[PHASE 2: QUEUE PROPER (Active Loop)] ◄──────────────┐
   ├── Pool Monitoring (Idle, Queued, Playing, Rest) │
   ├── Matchmaking Engine (Smart Suggest / Manual)   │
   ├── Staging Pipeline ("On-Deck" Buffer)           │
   └── Live Court Telemetry (Timers, Shuttle Log) ───┘
          │ (Session Timer Expires / Manual Trigger)
          ▼
[PHASE 3: ENDING PHASE]
   ├── Court Decommissioning (Final Match Resolution)
   ├── Financial & Shuttle Reconciliation
   └── Analytics, MMR Updates & Report Export

```

---

### Phase 1: Initialization (Configuration & Seeding)

*Objective: Establish session constraints, court topology, billing parameters, and initial player skill distributions before the clock starts.*

#### 1. Session & Court Configuration

* **Time & Duration:** Set Start Time, End Time, and a **"Last Call" Warning Threshold** (e.g., 20 minutes before court rental expires to prevent starting games that cannot finish).
* **Court Topology:**
* Define number of active courts (e.g., Courts 1, 2, 3) and map specific court names/numbers to match the venue layout.
* *Optional Court Tagging:* Designate specific courts by tier or type (e.g., Court 1 = Competitive/Advanced, Court 2 = Social/Mixed).


* **Game Format & Rules:** Set standard scoring (e.g., 1 set to 21 pts, 1 set to 31 pts, or best of 3) and target match duration (default: 15–18 minutes) for queue wait-time estimation.
* **Resource & Cost Parameters:**
* Total Court Fee + Per-Shuttle Cost (e.g., ₱80–₱110/shuttle).
* Billing Model Selection: *Equal Split*, *Fixed Entrance Fee*, or *Pay-Per-Game / Pay-Per-Shuttle* (where shuttle cost is divided among the 4 players of that specific match).



#### 2. Player Roster & Skill Matrix Ingestion

* **Player Onboarding:**
* Import from historical database (returning players with established Elo/MMR) or Quick-Add Guest.
* **Late-Arriver Toggle:** Register players as *Expected* (inactive in matchmaking until marked *Present*).


* **Skill Classification (Dual-Layer):**
* **Visible Tier:** Beginner, Lower Intermediate, Upper Intermediate, Advanced (or standard local tournament levels: Level G, F, E, D).
* **Hidden Rating (MMR/TrueSkill):** A numerical rating (e.g., 1000–2500) used by the matchmaking solver to calculate team balance.


* **Social & Pairing Constraints (Graph Edges):**
* **Lock Pair (Buddy System):** Force two players to play together (e.g., tournament partners practicing, or mixed doubles pairs).
* **Avoid Pair:** Prevent specific players from being matched in the same 4-player pod.



---

### Phase 2: Queue Proper (Real-Time Operations & Matchmaking)

*Objective: Maximize court utilization, minimize variance in games played per person, maintain competitive balance, and maintain a zero-downtime transition between matches.*

#### 1. Player State Pool Management

Every checked-in player exists in one of four mutually exclusive states:

1. **`IDLE (Available)`:** Waiting in the lobby; sorted by primary priority metric (Longest Wait Time $\rightarrow$ Lowest Games Played).
2. **`STAGED (On-Deck)`:** Assigned to an upcoming match pipeline; locked from other suggestions.
3. **`IN_GAME (Active)`:** Currently on a court.
4. **`RESTING (Bench/Paused)`:** Temporarily opted out (taking a breather, eating, injury, or stepped out).

#### 2. The Matchmaking Engine (Smart vs. Manual)

The Queue Master UI provides a split-view workspace: the **Available Pool** on the left, and the **Staging Pipeline ("Next Up")** in the center.

* **Mode A: Smart Matchmaking (Multi-Objective Optimization)**
When the Queue Master clicks *"Generate Next Match"*, the solver evaluates candidate 4-player subsets $(p_1, p_2, p_3, p_4)$ from the `IDLE` pool by minimizing a weighted cost function:

$$J = w_1(\text{Skill Imbalance}) - w_2(\text{Wait Time}) + w_3(\text{Games Played Variance}) + w_4(\text{Repeat Pairing Penalty})$$


* **Skill Imbalance:** $\vert{}\text{MMR}(p_1 + p_2) - \text{MMR}(p_3 + p_4)\vert{}$.
* **Wait Time Priority:** Prioritizes players who have been sitting in `IDLE` the longest.
* **Repeat Penalty:** Checks session history matrix to avoid repeating the exact same 4-player pod or partner pairing within the last $N$ games.
* *Mode Presets:* The QM can toggle weights on the fly: **Balanced** (Default), **Strict Skill** (Competitive), **Social/Mixer** (High entropy/new partners), or **Rotation First** (Pure FIFO for crowded queues).


* **Mode B: Manual Placement & Drag-and-Drop Override**
* The QM can manually drag players into a Staging Slot, swap partners across teams, or lock 2 players and click *"Auto-Fill Remaining 2"* (which runs the solver constrained to the locked pair).
* Real-time UI badge displays the **Predicted Win Probability** (e.g., *52% vs 48%*) and **Skill Delta** as players are dragged into slots.



#### 3. The Staging Pipeline ("On-Deck" Queue)

* Maintains a buffer of $K$ upcoming matches (typically $K = \text{Number of Courts} + 1$).
* **Audio/Visual Callout:** Marks Next Match #1 as *"Warm Up / Ready at Courtside"* so players are physically standing near the court before the current game ends.

#### 4. Live Court Telemetry & Control

Each active court is represented as a live dashboard card featuring:

* **Match Timer:** Count-up stopwatch. Changes color at thresholds (e.g., Green `< 15m`, Amber `15–22m`, Red `> 22m` to indicate a drawn-out deuce game).
* **Shuttlecock Counter (`+1` / `-1` Button):** Tracks shuttles consumed on that specific match in real time. Automatically increments global inventory usage.
* **Emergency Swap (Mid-Game Injury/Drop):** Allows replacing a player mid-match without voiding the court timer or shuttle count.
* **Match Completion Flow:**
1. QM clicks **"End Match"** on Court $X$.
2. Quick modal prompts for **Score** (optional/skippable for social games) or simply **Winner Selection** (Team A vs. Team B) + confirms shuttle count.
3. The 4 finished players return to `IDLE` (with their `Wait Time` reset to `00:00` and `Games Played` incremented by $+1$).
4. **One-Click Dispatch:** Staging Match #1 is immediately pushed to Court $X$, triggering TTS/Audio announcement (*"Court 2: Player A and B vs. Player C and D"*).



#### 5. Live Leaderboards & Queue Monitor (Public Display View)

A secondary read-only view (castable to a tablet/TV or accessible via QR code on players' phones):

* **Up Next Board:** Shows the next 3–4 staged matches so players know when to lace up.
* **Estimated Wait Time:** Calculated dynamically as $\frac{\text{Queue Position}}{\text{Active Courts}} \times \text{Avg Match Duration}$.
* **Live Session Standings:** Ranked by Win/Loss Ratio, Point Differential, Games Played, and Current Win Streak.

---

### Phase 3: Ending Phase (Reconciliation, Analytics & Reporting)

*Objective: Gracefully wind down courts, automate financial/shuttle settlement, update persistent player ratings, and generate shareable summaries.*

#### 1. Graceful Wind-Down & Decommissioning

* When the session enters the final 20 minutes, the staging engine displays a **"Time Cap Warning"** if the projected finish time of queued matches exceeds court rental hours.
* As final games conclude, courts are toggled to `CLOSED` status one by one until all active timers stop.

#### 2. Shuttle & Financial Reconciliation

* **Shuttle Audit:** Compares total shuttles logged across all matches against physical tubes opened (e.g., *38 shuttles logged = 3 tubes + 2 shuttles*).
* **Automated Billing Ledger:**
* Calculates exact per-player fee based on the chosen Phase 1 billing model.
* *Example (Hybrid Model):* Base Court Share (₱150) + (Player's Shuttle Usage Share $\times$ ₱90).
* Interactive **Payment Checklist:** QM marks players as *Paid (Cash / GCash / Maya / Bank)* with an auto-generated breakdown table ready to copy-paste into Viber/Messenger/Telegram group chats.



#### 3. Post-Session Analytics & Report Generation

Generates a structured summary dashboard (and exportable image/CSV/PDF):

* **Operational Efficiency Metrics:**
* **Court Utilization Rate (%):** $\frac{\sum \text{Active Match Time}}{\text{Total Court Hours Available}} \times 100$ (identifies dead time between match transitions).
* **Match Duration Distribution:** Average, Shortest, and Longest match times.
* **Shuttle Burn Rate:** Average shuttles used per match and per court-hour.
* **Fairness Index:** Standard deviation of games played across all full-session attendees (lower variance = fairer rotation).


* **Player Performance & Rating Updates:**
* Updates persistent MMR/Elo ratings based on match outcomes and opponent strength.
* **Session Awards (Gamification):** *Session MVP* (Highest win rate/point diff), *Ironman* (Most court time/games), *Marathon Match* (Longest single game), and *Most Balanced Rivalry*.



---

### Core Data Entities (Schema Blueprint)

| Entity | Key Attributes |
| --- | --- |
| **`Session`** | `id`, `start_time`, `end_time`, `court_cost`, `shuttle_cost`, `billing_mode`, `status` (`INIT`, `ACTIVE`, `ENDED`) |
| **`Court`** | `id`, `name`, `tier_restriction`, `status` (`IDLE`, `BUSY`, `CLOSED`), `current_match_id` |
| **`Player`** | `id`, `name`, `tier`, `mmr`, `session_status` (`IDLE`, `STAGED`, `IN_GAME`, `RESTING`), `games_played`, `last_match_ended_at`, `shuttles_consumed_share`, `is_paid` |
| **`Match`** | `id`, `court_id`, `state` (`STAGED`, `ACTIVE`, `COMPLETED`), `team_a` (`[p1, p2]`), `team_b` (`[p3, p4]`), `score_a`, `score_b`, `shuttles_used`, `started_at`, `ended_at` |

---

### Suggested Next Steps

Depending on how you want to proceed, we can:

1. **Build an interactive prototype** of this webapp right now so you can test the Phase 1–3 UI flows live.
2. **Design the exact matchmaking cost function** (Python/TypeScript algorithm) for handling skill balance vs. wait time fairness.
3. **Draft the database schema & state management store** (e.g., Next.js + Zustand/Supabase or local-first IndexedDB) for low-latency courtside operation.