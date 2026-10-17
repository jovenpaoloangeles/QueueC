# Simulation Sweep Report — "This Algorithm" (ε-lexicographic doubles matcher)

Generated 2026-10-17 by `tests/sim/sweep-sim.mjs` (deterministic, seeded CRN — rerunning the script reproduces every number except wall-clock timings, which are excluded). "This Algorithm" is the production two-stage ε-lexicographic engine (`EPSILON_LEX` in code: `server/logic/smartQueue.js planBatch`, spec: `docs/algorithm.md`). Baselines: **FIFO** (top-4 by wait) and **Lowest Raw Games** (top-4 by fewest games played — the naive fairness policy).

## Modeled club session (realistic dynamics)

The discrete-event simulation drives the production engine end to end, including its timestamped consecutive-rest rule (`started_at`/`ended_at` in match history) and joint multi-court batching. Each session models:

- **Court-scaled crowd density** — every court always hosts exactly 4 players per game (doubles). Crowd density is the roster size per court's rotation: total roster = courts × players-per-court (light 5.5, normal ≈7.3, peak 9.0 — i.e., 1.5 / 3.3 / 5.0 people resting per court while 4 play).
- **Staggered arrivals** — an on-time wave plus ~27% late check-ins spread over 15–75 min; latecomers inherit the median virtual game count.
- **Voluntary rest breaks** — after any game, a ~6% chance of sitting out 8–15 min.
- **Early departures** — ~12% of on-time players leave during the final 30 min.
- **Match-dependent game length** — base 13.8 ± 2.1 min, longer on higher-skilled balanced courts, shorter on lopsided blowouts, plus 0.5–1.3 min court turnaround lag.
- **Multi-court batching** — when several courts free up together, the engine plans them jointly (and stages on-deck equivalents via `courtCount`).

## Sweep grid

| Axis | Values |
|---|---|
| Courts | 1, 2, 3, 4 |
| Session length | 120 min, 180 min, 240 min |
| Skill profile | club-balanced, beginner-heavy, advanced-club, wide-mix (N(mean, sd), clipped 1.5–9.5, quantized to the production 1–7 tiers) |
| Crowd density | light (5.5/court), normal (7.3/court), peak (9.0/court) — roster = courts × players-per-court; 4 play per court (doubles) at all times, the rest rotate |
| Seeds per cell | scaled to ≥ 1000 simulated games for This Algorithm (10–200) |

Each cell replays the **same** player skills, arrival times, breaks, departures, and game durations across all policies (Common Random Numbers), so differences are caused by the matchmaking policy alone. Gate-style checks per cell, This Algorithm vs FIFO: max wait ≤ 1.25×, cohort skill SD ≤ 0.65×, weak-link team diff ≤ 0.40, recent repeats (≤6 games) < 10%.

## Session length: 120 min

| C | Density | Skill profile | Games | TA p95 wait | TA max wait | FIFO max wait | ratio | TA play spread | TA SD | FIFO SD | ratio | TA team diff | TA recent rep % | TA bursts | LRG bursts | Checks |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 | light | club-balanced | 10 | 15.6 | 17.1 | 16.9 | 1.01 | 15 | 1.20 | 1.28 | 0.94 | 0.68 | 48.6 | 4.4 | 4.5 | 1/4 |
| 1 | normal | club-balanced | 10 | 16.9 | 17.9 | 17.6 | 1.02 | 23 | 1.17 | 1.30 | 0.90 | 0.64 | 34.3 | 1.9 | 3.7 | 1/4 |
| 1 | peak | club-balanced | 10 | 24.5 | 31.0 | 30.8 | 1.01 | 21 | 1.04 | 1.27 | 0.82 | 0.59 | 19.1 | 0.1 | 1.7 | 1/4 |
| 1 | light | beginner-heavy | 10 | 15.4 | 17.0 | 16.8 | 1.01 | 14 | 1.07 | 1.13 | 0.94 | 0.46 | 49.2 | 4.5 | 4.5 | 1/4 |
| 1 | normal | beginner-heavy | 10 | 16.8 | 17.7 | 17.5 | 1.01 | 21 | 1.04 | 1.15 | 0.91 | 0.42 | 32.0 | 2.2 | 3.7 | 1/4 |
| 1 | peak | beginner-heavy | 10 | 24.6 | 30.8 | 30.6 | 1.01 | 20 | 0.95 | 1.13 | 0.84 | 0.38 | 21.3 | 0.1 | 1.8 | 2/4 |
| 1 | light | advanced-club | 10 | 15.8 | 17.2 | 17.1 | 1.00 | 14 | 0.71 | 0.75 | 0.94 | 0.44 | 44.1 | 4.6 | 4.4 | 1/4 |
| 1 | normal | advanced-club | 10 | 17.0 | 18.0 | 17.8 | 1.01 | 21 | 0.70 | 0.76 | 0.92 | 0.38 | 28.0 | 2.3 | 3.7 | 2/4 |
| 1 | peak | advanced-club | 10 | 25.1 | 31.5 | 31.0 | 1.01 | 20 | 0.63 | 0.75 | 0.84 | 0.34 | 13.8 | 0.1 | 1.7 | 2/4 |
| 1 | light | wide-mix | 10 | 15.5 | 17.1 | 16.8 | 1.02 | 14 | 1.44 | 1.55 | 0.93 | 0.78 | 47.1 | 4.3 | 4.5 | 1/4 |
| 1 | normal | wide-mix | 10 | 16.8 | 17.8 | 17.6 | 1.01 | 23 | 1.40 | 1.57 | 0.89 | 0.76 | 31.4 | 1.9 | 3.7 | 1/4 |
| 1 | peak | wide-mix | 10 | 24.6 | 31.0 | 30.6 | 1.01 | 21 | 1.19 | 1.53 | 0.78 | 0.72 | 18.7 | 0.1 | 1.7 | 1/4 |
| 2 | light | club-balanced | 19 | 12.6 | 16.1 | 16.5 | 0.98 | 23 | 1.04 | 1.29 | 0.80 | 0.60 | 15.8 | 7.8 | 7.3 | 1/4 |
| 2 | normal | club-balanced | 19 | 16.9 | 19.3 | 17.8 | 1.09 | 26 | 0.92 | 1.28 | 0.72 | 0.44 | 4.3 | 1.9 | 6.6 | 2/4 |
| 2 | peak | club-balanced | 19 | 23.3 | 28.3 | 26.5 | 1.07 | 24 | 0.83 | 1.29 | 0.64 | 0.39 | 2.2 | 0.1 | 4.6 | 4/4 |
| 2 | light | beginner-heavy | 19 | 12.6 | 15.7 | 16.3 | 0.96 | 24 | 0.95 | 1.15 | 0.83 | 0.39 | 16.0 | 8.0 | 7.5 | 2/4 |
| 2 | normal | beginner-heavy | 19 | 16.8 | 19.1 | 17.7 | 1.08 | 27 | 0.87 | 1.15 | 0.76 | 0.31 | 5.3 | 2.0 | 6.9 | 3/4 |
| 2 | peak | beginner-heavy | 19 | 22.9 | 28.5 | 26.4 | 1.08 | 24 | 0.79 | 1.15 | 0.69 | 0.28 | 2.5 | 0.1 | 4.7 | 3/4 |
| 2 | light | advanced-club | 18 | 12.7 | 16.1 | 16.6 | 0.97 | 21 | 0.63 | 0.75 | 0.85 | 0.38 | 10.1 | 7.8 | 7.2 | 2/4 |
| 2 | normal | advanced-club | 18 | 16.9 | 19.6 | 17.9 | 1.09 | 25 | 0.56 | 0.74 | 0.76 | 0.25 | 2.3 | 1.8 | 6.6 | 3/4 |
| 2 | peak | advanced-club | 19 | 23.4 | 28.5 | 26.8 | 1.06 | 24 | 0.52 | 0.75 | 0.69 | 0.25 | 1.2 | 0.0 | 4.4 | 3/4 |
| 2 | light | wide-mix | 19 | 12.4 | 15.6 | 16.3 | 0.96 | 23 | 1.16 | 1.54 | 0.75 | 0.69 | 15.4 | 7.8 | 7.4 | 1/4 |
| 2 | normal | wide-mix | 19 | 16.8 | 19.1 | 17.7 | 1.07 | 24 | 0.97 | 1.53 | 0.63 | 0.51 | 5.7 | 2.3 | 6.8 | 3/4 |
| 2 | peak | wide-mix | 19 | 23.4 | 29.2 | 26.5 | 1.10 | 24 | 0.91 | 1.56 | 0.58 | 0.46 | 1.8 | 0.2 | 4.6 | 3/4 |
| 3 | light | club-balanced | 28 | 12.0 | 15.7 | 15.5 | 1.01 | 24 | 0.94 | 1.28 | 0.73 | 0.52 | 7.4 | 11.5 | 10.8 | 2/4 |
| 3 | normal | club-balanced | 28 | 16.2 | 19.0 | 17.5 | 1.08 | 28 | 0.76 | 1.28 | 0.60 | 0.36 | 1.8 | 2.7 | 10.2 | 4/4 |
| 3 | peak | club-balanced | 28 | 23.0 | 27.9 | 25.1 | 1.11 | 26 | 0.65 | 1.28 | 0.51 | 0.29 | 0.5 | 0.1 | 5.2 | 4/4 |
| 3 | light | beginner-heavy | 28 | 11.8 | 15.7 | 15.5 | 1.01 | 23 | 0.88 | 1.14 | 0.77 | 0.36 | 8.8 | 12.2 | 11.1 | 3/4 |
| 3 | normal | beginner-heavy | 28 | 16.0 | 18.7 | 17.4 | 1.07 | 26 | 0.75 | 1.13 | 0.66 | 0.26 | 1.9 | 3.3 | 10.3 | 3/4 |
| 3 | peak | beginner-heavy | 28 | 22.8 | 27.1 | 25.0 | 1.08 | 26 | 0.64 | 1.14 | 0.56 | 0.21 | 0.4 | 0.1 | 5.4 | 4/4 |
| 3 | light | advanced-club | 27 | 11.9 | 15.4 | 15.7 | 0.98 | 25 | 0.56 | 0.73 | 0.77 | 0.29 | 3.4 | 11.5 | 10.8 | 3/4 |
| 3 | normal | advanced-club | 27 | 16.3 | 19.1 | 17.7 | 1.08 | 27 | 0.50 | 0.73 | 0.68 | 0.20 | 0.9 | 2.8 | 10.2 | 3/4 |
| 3 | peak | advanced-club | 27 | 23.3 | 27.7 | 25.4 | 1.09 | 26 | 0.42 | 0.74 | 0.57 | 0.15 | 0.0 | 0.1 | 5.1 | 4/4 |
| 3 | light | wide-mix | 28 | 11.9 | 15.4 | 15.5 | 0.99 | 23 | 1.06 | 1.54 | 0.69 | 0.61 | 5.8 | 11.8 | 11.1 | 2/4 |
| 3 | normal | wide-mix | 28 | 16.1 | 18.8 | 17.4 | 1.08 | 26 | 0.81 | 1.54 | 0.52 | 0.38 | 1.9 | 3.3 | 10.4 | 4/4 |
| 3 | peak | wide-mix | 28 | 23.0 | 27.0 | 25.0 | 1.08 | 26 | 0.71 | 1.57 | 0.45 | 0.35 | 0.1 | 0.1 | 5.3 | 4/4 |
| 4 | light | club-balanced | 37 | 11.9 | 15.3 | 14.9 | 1.03 | 25 | 0.86 | 1.27 | 0.68 | 0.48 | 3.7 | 15.3 | 13.5 | 2/4 |
| 4 | normal | club-balanced | 37 | 15.2 | 18.0 | 16.9 | 1.07 | 27 | 0.74 | 1.30 | 0.57 | 0.34 | 0.4 | 2.9 | 14.4 | 4/4 |
| 4 | peak | club-balanced | 38 | 22.4 | 26.8 | 24.1 | 1.11 | 26 | 0.62 | 1.29 | 0.48 | 0.24 | 0.0 | 0.0 | 8.3 | 4/4 |
| 4 | light | beginner-heavy | 37 | 11.4 | 15.2 | 14.7 | 1.04 | 25 | 0.80 | 1.13 | 0.71 | 0.33 | 4.4 | 16.4 | 13.6 | 3/4 |
| 4 | normal | beginner-heavy | 37 | 15.1 | 17.6 | 16.8 | 1.05 | 28 | 0.72 | 1.18 | 0.61 | 0.25 | 0.5 | 3.0 | 14.7 | 4/4 |
| 4 | peak | beginner-heavy | 38 | 22.3 | 26.5 | 23.9 | 1.11 | 26 | 0.59 | 1.18 | 0.50 | 0.18 | 0.0 | 0.1 | 8.6 | 4/4 |
| 4 | light | advanced-club | 36 | 11.7 | 15.0 | 14.9 | 1.01 | 25 | 0.52 | 0.71 | 0.73 | 0.23 | 2.6 | 15.3 | 13.4 | 3/4 |
| 4 | normal | advanced-club | 37 | 15.4 | 17.9 | 17.1 | 1.05 | 26 | 0.45 | 0.72 | 0.63 | 0.18 | 0.1 | 3.3 | 14.2 | 4/4 |
| 4 | peak | advanced-club | 37 | 22.1 | 26.2 | 24.5 | 1.07 | 25 | 0.39 | 0.73 | 0.53 | 0.11 | 0.0 | 0.0 | 8.1 | 4/4 |
| 4 | light | wide-mix | 37 | 11.6 | 15.2 | 14.7 | 1.03 | 25 | 0.97 | 1.55 | 0.62 | 0.57 | 3.6 | 16.2 | 13.5 | 3/4 |
| 4 | normal | wide-mix | 37 | 15.1 | 18.0 | 16.7 | 1.07 | 27 | 0.79 | 1.58 | 0.50 | 0.41 | 0.3 | 3.8 | 14.6 | 3/4 |
| 4 | peak | wide-mix | 38 | 22.1 | 26.6 | 23.9 | 1.12 | 26 | 0.68 | 1.57 | 0.43 | 0.30 | 0.0 | 0.2 | 8.4 | 4/4 |

## Session length: 180 min

| C | Density | Skill profile | Games | TA p95 wait | TA max wait | FIFO max wait | ratio | TA play spread | TA SD | FIFO SD | ratio | TA team diff | TA recent rep % | TA bursts | LRG bursts | Checks |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 | light | club-balanced | 14 | 16.1 | 18.0 | 17.8 | 1.01 | 18 | 1.21 | 1.28 | 0.95 | 0.73 | 62.1 | 6.6 | 6.7 | 1/4 |
| 1 | normal | club-balanced | 14 | 17.1 | 18.6 | 18.2 | 1.02 | 25 | 1.20 | 1.29 | 0.93 | 0.67 | 43.5 | 2.9 | 5.4 | 1/4 |
| 1 | peak | club-balanced | 14 | 27.4 | 33.0 | 32.4 | 1.02 | 24 | 1.07 | 1.29 | 0.83 | 0.60 | 23.6 | 0.1 | 2.6 | 1/4 |
| 1 | light | beginner-heavy | 14 | 16.0 | 17.8 | 17.7 | 1.00 | 18 | 1.09 | 1.15 | 0.95 | 0.47 | 64.1 | 6.8 | 6.8 | 1/4 |
| 1 | normal | beginner-heavy | 14 | 16.9 | 18.3 | 18.1 | 1.01 | 23 | 1.07 | 1.14 | 0.94 | 0.43 | 42.4 | 3.2 | 5.5 | 1/4 |
| 1 | peak | beginner-heavy | 14 | 27.3 | 32.7 | 32.1 | 1.02 | 24 | 0.98 | 1.15 | 0.86 | 0.39 | 24.1 | 0.1 | 2.6 | 2/4 |
| 1 | light | advanced-club | 14 | 16.2 | 18.1 | 18.0 | 1.00 | 16 | 0.71 | 0.74 | 0.96 | 0.47 | 56.2 | 6.7 | 6.6 | 1/4 |
| 1 | normal | advanced-club | 14 | 17.2 | 18.7 | 18.5 | 1.01 | 22 | 0.70 | 0.74 | 0.94 | 0.38 | 36.3 | 3.4 | 5.4 | 2/4 |
| 1 | peak | advanced-club | 14 | 28.0 | 33.0 | 32.9 | 1.00 | 24 | 0.65 | 0.75 | 0.87 | 0.33 | 20.1 | 0.1 | 2.6 | 2/4 |
| 1 | light | wide-mix | 14 | 16.1 | 17.9 | 17.7 | 1.01 | 18 | 1.44 | 1.53 | 0.94 | 0.82 | 60.4 | 6.7 | 6.7 | 1/4 |
| 1 | normal | wide-mix | 14 | 17.0 | 18.4 | 18.2 | 1.01 | 25 | 1.41 | 1.54 | 0.91 | 0.79 | 40.4 | 3.0 | 5.5 | 1/4 |
| 1 | peak | wide-mix | 14 | 27.7 | 32.7 | 32.2 | 1.01 | 25 | 1.22 | 1.54 | 0.79 | 0.72 | 24.3 | 0.1 | 2.6 | 1/4 |
| 2 | light | club-balanced | 27 | 13.5 | 16.7 | 17.2 | 0.97 | 25 | 1.06 | 1.27 | 0.84 | 0.60 | 20.5 | 12.4 | 11.3 | 1/4 |
| 2 | normal | club-balanced | 27 | 17.4 | 20.2 | 18.4 | 1.10 | 28 | 0.93 | 1.28 | 0.73 | 0.46 | 7.2 | 3.2 | 10.1 | 2/4 |
| 2 | peak | club-balanced | 28 | 25.0 | 30.3 | 28.0 | 1.08 | 28 | 0.85 | 1.29 | 0.66 | 0.41 | 3.1 | 0.4 | 6.6 | 2/4 |
| 2 | light | beginner-heavy | 27 | 13.4 | 16.7 | 16.9 | 0.99 | 27 | 0.96 | 1.14 | 0.85 | 0.42 | 17.4 | 12.6 | 11.2 | 1/4 |
| 2 | normal | beginner-heavy | 27 | 17.2 | 19.9 | 18.3 | 1.09 | 30 | 0.85 | 1.15 | 0.74 | 0.30 | 6.9 | 3.4 | 10.2 | 3/4 |
| 2 | peak | beginner-heavy | 28 | 24.3 | 29.7 | 27.8 | 1.07 | 28 | 0.82 | 1.14 | 0.71 | 0.29 | 2.5 | 0.4 | 6.8 | 3/4 |
| 2 | light | advanced-club | 27 | 13.7 | 16.6 | 17.3 | 0.96 | 26 | 0.63 | 0.74 | 0.85 | 0.37 | 12.9 | 12.7 | 11.0 | 2/4 |
| 2 | normal | advanced-club | 27 | 17.5 | 20.6 | 18.6 | 1.11 | 27 | 0.56 | 0.74 | 0.76 | 0.25 | 2.0 | 3.0 | 10.0 | 3/4 |
| 2 | peak | advanced-club | 27 | 25.1 | 30.2 | 28.1 | 1.08 | 28 | 0.54 | 0.73 | 0.74 | 0.24 | 0.9 | 0.3 | 6.5 | 3/4 |
| 2 | light | wide-mix | 27 | 13.4 | 16.7 | 17.1 | 0.98 | 26 | 1.23 | 1.54 | 0.80 | 0.71 | 18.5 | 12.6 | 11.2 | 1/4 |
| 2 | normal | wide-mix | 27 | 17.3 | 20.1 | 18.3 | 1.10 | 28 | 1.03 | 1.55 | 0.66 | 0.56 | 5.9 | 3.4 | 10.2 | 2/4 |
| 2 | peak | wide-mix | 28 | 24.8 | 30.1 | 27.8 | 1.08 | 26 | 0.94 | 1.56 | 0.60 | 0.48 | 2.1 | 0.3 | 6.7 | 3/4 |
| 3 | light | club-balanced | 40 | 12.5 | 16.3 | 16.3 | 1.00 | 30 | 0.99 | 1.29 | 0.77 | 0.54 | 7.0 | 19.1 | 16.8 | 2/4 |
| 3 | normal | club-balanced | 41 | 16.6 | 19.7 | 18.1 | 1.09 | 31 | 0.80 | 1.29 | 0.62 | 0.38 | 2.0 | 4.7 | 15.0 | 4/4 |
| 3 | peak | club-balanced | 40 | 24.5 | 28.9 | 26.1 | 1.11 | 29 | 0.70 | 1.29 | 0.54 | 0.30 | 0.9 | 0.1 | 7.5 | 4/4 |
| 3 | light | beginner-heavy | 41 | 12.4 | 16.4 | 16.4 | 1.00 | 28 | 0.94 | 1.16 | 0.81 | 0.39 | 6.1 | 18.7 | 17.0 | 3/4 |
| 3 | normal | beginner-heavy | 41 | 16.4 | 19.9 | 18.1 | 1.10 | 28 | 0.77 | 1.13 | 0.68 | 0.28 | 2.6 | 4.6 | 15.2 | 3/4 |
| 3 | peak | beginner-heavy | 40 | 24.0 | 28.7 | 25.9 | 1.11 | 27 | 0.68 | 1.16 | 0.58 | 0.21 | 0.5 | 0.2 | 7.8 | 4/4 |
| 3 | light | advanced-club | 40 | 12.4 | 16.6 | 16.5 | 1.01 | 28 | 0.57 | 0.71 | 0.80 | 0.30 | 2.6 | 18.8 | 16.5 | 3/4 |
| 3 | normal | advanced-club | 39 | 16.7 | 19.7 | 18.3 | 1.08 | 28 | 0.50 | 0.71 | 0.70 | 0.21 | 0.9 | 3.8 | 15.0 | 3/4 |
| 3 | peak | advanced-club | 40 | 24.6 | 28.8 | 26.5 | 1.08 | 28 | 0.43 | 0.72 | 0.59 | 0.15 | 0.0 | 0.1 | 7.5 | 4/4 |
| 3 | light | wide-mix | 41 | 12.4 | 16.1 | 16.4 | 0.98 | 28 | 1.12 | 1.57 | 0.71 | 0.65 | 7.5 | 18.8 | 16.6 | 2/4 |
| 3 | normal | wide-mix | 41 | 16.5 | 19.5 | 18.2 | 1.07 | 28 | 0.88 | 1.55 | 0.57 | 0.47 | 2.5 | 4.8 | 15.2 | 3/4 |
| 3 | peak | wide-mix | 40 | 24.3 | 28.6 | 25.7 | 1.11 | 29 | 0.73 | 1.55 | 0.47 | 0.36 | 0.7 | 0.3 | 7.5 | 4/4 |
| 4 | light | club-balanced | 54 | 11.9 | 15.4 | 15.0 | 1.03 | 30 | 0.95 | 1.33 | 0.71 | 0.50 | 5.1 | 26.3 | 21.1 | 2/4 |
| 4 | normal | club-balanced | 53 | 15.8 | 18.8 | 17.3 | 1.08 | 30 | 0.79 | 1.34 | 0.59 | 0.35 | 0.6 | 5.5 | 20.1 | 4/4 |
| 4 | peak | club-balanced | 54 | 23.3 | 27.7 | 24.8 | 1.12 | 29 | 0.65 | 1.33 | 0.49 | 0.26 | 0.0 | 0.3 | 13.3 | 4/4 |
| 4 | light | beginner-heavy | 54 | 11.6 | 15.4 | 15.2 | 1.01 | 30 | 0.87 | 1.17 | 0.75 | 0.38 | 3.4 | 26.6 | 21.3 | 3/4 |
| 4 | normal | beginner-heavy | 55 | 15.4 | 18.4 | 17.2 | 1.07 | 29 | 0.73 | 1.20 | 0.61 | 0.27 | 0.4 | 6.1 | 20.4 | 4/4 |
| 4 | peak | beginner-heavy | 54 | 23.2 | 27.2 | 24.6 | 1.10 | 29 | 0.66 | 1.21 | 0.55 | 0.18 | 0.0 | 0.2 | 13.5 | 4/4 |
| 4 | light | advanced-club | 54 | 11.6 | 15.4 | 15.6 | 0.99 | 29 | 0.56 | 0.74 | 0.76 | 0.27 | 2.0 | 24.7 | 20.5 | 3/4 |
| 4 | normal | advanced-club | 53 | 15.7 | 18.4 | 17.7 | 1.04 | 29 | 0.51 | 0.76 | 0.67 | 0.20 | 0.5 | 4.7 | 19.9 | 3/4 |
| 4 | peak | advanced-club | 52 | 23.7 | 27.3 | 25.1 | 1.09 | 28 | 0.43 | 0.76 | 0.57 | 0.12 | 0.0 | 0.2 | 13.2 | 4/4 |
| 4 | light | wide-mix | 54 | 11.7 | 15.6 | 15.2 | 1.03 | 31 | 1.07 | 1.59 | 0.67 | 0.63 | 3.6 | 25.7 | 21.7 | 2/4 |
| 4 | normal | wide-mix | 54 | 15.7 | 18.6 | 17.1 | 1.08 | 28 | 0.82 | 1.60 | 0.51 | 0.42 | 0.4 | 5.3 | 20.6 | 3/4 |
| 4 | peak | wide-mix | 54 | 23.3 | 27.5 | 24.6 | 1.12 | 28 | 0.71 | 1.59 | 0.45 | 0.31 | 0.0 | 0.5 | 13.3 | 4/4 |

## Session length: 240 min

| C | Density | Skill profile | Games | TA p95 wait | TA max wait | FIFO max wait | ratio | TA play spread | TA SD | FIFO SD | ratio | TA team diff | TA recent rep % | TA bursts | LRG bursts | Checks |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 | light | club-balanced | 18 | 16.5 | 18.3 | 18.1 | 1.01 | 17 | 1.24 | 1.29 | 0.96 | 0.72 | 68.6 | 9.5 | 9.3 | 1/4 |
| 1 | normal | club-balanced | 18 | 17.2 | 19.0 | 18.5 | 1.02 | 25 | 1.21 | 1.30 | 0.93 | 0.67 | 46.4 | 4.0 | 7.6 | 1/4 |
| 1 | peak | club-balanced | 18 | 29.1 | 33.7 | 33.3 | 1.01 | 26 | 1.07 | 1.28 | 0.84 | 0.60 | 22.8 | 0.1 | 2.6 | 1/4 |
| 1 | light | beginner-heavy | 19 | 16.3 | 18.1 | 18.0 | 1.01 | 18 | 1.10 | 1.14 | 0.96 | 0.47 | 70.0 | 9.6 | 9.4 | 1/4 |
| 1 | normal | beginner-heavy | 19 | 17.0 | 18.7 | 18.4 | 1.01 | 27 | 1.06 | 1.14 | 0.93 | 0.40 | 45.8 | 4.3 | 7.7 | 1/4 |
| 1 | peak | beginner-heavy | 18 | 28.9 | 33.4 | 33.1 | 1.01 | 27 | 0.99 | 1.13 | 0.87 | 0.38 | 24.3 | 0.1 | 2.6 | 2/4 |
| 1 | light | advanced-club | 18 | 16.6 | 18.3 | 18.3 | 1.00 | 17 | 0.71 | 0.75 | 0.95 | 0.47 | 61.1 | 9.4 | 9.3 | 1/4 |
| 1 | normal | advanced-club | 18 | 17.3 | 19.0 | 18.8 | 1.01 | 24 | 0.70 | 0.75 | 0.94 | 0.40 | 37.1 | 4.7 | 7.5 | 2/4 |
| 1 | peak | advanced-club | 18 | 29.5 | 33.8 | 33.6 | 1.01 | 25 | 0.65 | 0.74 | 0.88 | 0.36 | 18.9 | 0.1 | 2.5 | 2/4 |
| 1 | light | wide-mix | 19 | 16.4 | 18.1 | 18.0 | 1.01 | 18 | 1.48 | 1.55 | 0.95 | 0.86 | 65.5 | 9.5 | 9.4 | 1/4 |
| 1 | normal | wide-mix | 18 | 17.1 | 18.6 | 18.4 | 1.01 | 25 | 1.42 | 1.55 | 0.92 | 0.79 | 42.4 | 4.0 | 7.6 | 1/4 |
| 1 | peak | wide-mix | 18 | 29.1 | 33.4 | 33.1 | 1.01 | 27 | 1.22 | 1.52 | 0.80 | 0.70 | 25.0 | 0.1 | 2.7 | 1/4 |
| 2 | light | club-balanced | 35 | 14.0 | 17.4 | 17.9 | 0.97 | 28 | 1.07 | 1.25 | 0.86 | 0.59 | 19.1 | 17.9 | 15.5 | 1/4 |
| 2 | normal | club-balanced | 35 | 17.6 | 20.9 | 18.9 | 1.11 | 31 | 0.92 | 1.27 | 0.73 | 0.46 | 5.7 | 3.9 | 12.7 | 2/4 |
| 2 | peak | club-balanced | 37 | 26.2 | 31.3 | 29.3 | 1.07 | 30 | 0.84 | 1.28 | 0.66 | 0.40 | 2.8 | 0.4 | 6.8 | 2/4 |
| 2 | light | beginner-heavy | 36 | 13.8 | 17.2 | 17.5 | 0.98 | 31 | 1.00 | 1.14 | 0.88 | 0.44 | 16.8 | 17.7 | 15.7 | 1/4 |
| 2 | normal | beginner-heavy | 36 | 17.5 | 20.8 | 18.8 | 1.11 | 32 | 0.85 | 1.15 | 0.74 | 0.30 | 6.8 | 4.6 | 12.8 | 3/4 |
| 2 | peak | beginner-heavy | 37 | 26.0 | 31.1 | 28.9 | 1.08 | 29 | 0.84 | 1.15 | 0.73 | 0.28 | 3.1 | 0.3 | 7.1 | 3/4 |
| 2 | light | advanced-club | 34 | 14.2 | 17.4 | 17.9 | 0.97 | 30 | 0.62 | 0.70 | 0.88 | 0.36 | 11.7 | 17.5 | 15.3 | 2/4 |
| 2 | normal | advanced-club | 35 | 17.7 | 21.2 | 19.0 | 1.12 | 29 | 0.54 | 0.71 | 0.77 | 0.23 | 1.4 | 3.5 | 12.5 | 3/4 |
| 2 | peak | advanced-club | 36 | 26.5 | 32.0 | 29.4 | 1.09 | 30 | 0.52 | 0.70 | 0.73 | 0.21 | 0.9 | 0.3 | 6.7 | 3/4 |
| 2 | light | wide-mix | 35 | 13.9 | 17.0 | 17.6 | 0.97 | 28 | 1.25 | 1.54 | 0.81 | 0.74 | 17.3 | 17.3 | 15.6 | 1/4 |
| 2 | normal | wide-mix | 35 | 17.7 | 20.6 | 18.8 | 1.10 | 30 | 1.03 | 1.54 | 0.67 | 0.55 | 6.1 | 4.4 | 12.7 | 2/4 |
| 2 | peak | wide-mix | 37 | 26.1 | 31.6 | 29.0 | 1.09 | 28 | 0.93 | 1.55 | 0.60 | 0.48 | 2.2 | 0.3 | 6.9 | 3/4 |
| 3 | light | club-balanced | 53 | 13.4 | 17.0 | 16.5 | 1.03 | 33 | 1.03 | 1.32 | 0.78 | 0.58 | 6.5 | 26.7 | 23.6 | 2/4 |
| 3 | normal | club-balanced | 53 | 16.8 | 19.9 | 18.6 | 1.07 | 33 | 0.84 | 1.33 | 0.63 | 0.40 | 2.4 | 7.5 | 19.0 | 3/4 |
| 3 | peak | club-balanced | 53 | 25.2 | 29.8 | 26.9 | 1.11 | 31 | 0.72 | 1.32 | 0.55 | 0.30 | 0.8 | 0.1 | 7.6 | 4/4 |
| 3 | light | beginner-heavy | 53 | 13.1 | 16.8 | 16.8 | 1.00 | 28 | 0.95 | 1.16 | 0.82 | 0.41 | 5.9 | 27.9 | 24.2 | 2/4 |
| 3 | normal | beginner-heavy | 53 | 16.5 | 20.3 | 18.6 | 1.09 | 30 | 0.81 | 1.15 | 0.70 | 0.28 | 2.9 | 6.6 | 19.2 | 3/4 |
| 3 | peak | beginner-heavy | 53 | 24.9 | 29.5 | 26.7 | 1.11 | 30 | 0.72 | 1.19 | 0.60 | 0.22 | 0.3 | 0.3 | 7.9 | 4/4 |
| 3 | light | advanced-club | 52 | 13.0 | 16.9 | 16.7 | 1.01 | 33 | 0.60 | 0.74 | 0.82 | 0.31 | 3.6 | 27.0 | 23.5 | 3/4 |
| 3 | normal | advanced-club | 52 | 17.0 | 20.1 | 18.7 | 1.08 | 30 | 0.52 | 0.75 | 0.70 | 0.20 | 1.1 | 5.4 | 18.6 | 3/4 |
| 3 | peak | advanced-club | 52 | 25.2 | 29.4 | 27.4 | 1.08 | 28 | 0.46 | 0.75 | 0.61 | 0.16 | 0.0 | 0.0 | 7.6 | 4/4 |
| 3 | light | wide-mix | 53 | 13.1 | 16.4 | 16.7 | 0.98 | 32 | 1.15 | 1.59 | 0.72 | 0.65 | 6.8 | 27.8 | 24.1 | 2/4 |
| 3 | normal | wide-mix | 54 | 16.8 | 19.9 | 18.6 | 1.07 | 28 | 0.92 | 1.59 | 0.58 | 0.49 | 2.6 | 7.0 | 18.8 | 3/4 |
| 3 | peak | wide-mix | 53 | 24.9 | 29.2 | 26.7 | 1.09 | 29 | 0.76 | 1.58 | 0.48 | 0.36 | 0.6 | 0.4 | 7.7 | 4/4 |
| 4 | light | club-balanced | 69 | 12.0 | 16.0 | 15.0 | 1.07 | 37 | 0.95 | 1.31 | 0.72 | 0.51 | 4.8 | 38.2 | 29.8 | 2/4 |
| 4 | normal | club-balanced | 71 | 16.2 | 19.0 | 18.0 | 1.06 | 32 | 0.79 | 1.32 | 0.59 | 0.36 | 0.4 | 7.9 | 24.7 | 4/4 |
| 4 | peak | club-balanced | 69 | 23.9 | 28.5 | 25.6 | 1.11 | 30 | 0.68 | 1.33 | 0.51 | 0.27 | 0.0 | 0.3 | 13.0 | 4/4 |
| 4 | light | beginner-heavy | 70 | 11.8 | 15.6 | 15.2 | 1.03 | 34 | 0.91 | 1.16 | 0.78 | 0.37 | 3.4 | 39.6 | 30.0 | 3/4 |
| 4 | normal | beginner-heavy | 72 | 16.0 | 19.1 | 17.7 | 1.08 | 30 | 0.74 | 1.19 | 0.63 | 0.26 | 0.4 | 8.5 | 25.6 | 4/4 |
| 4 | peak | beginner-heavy | 69 | 23.9 | 28.1 | 25.1 | 1.12 | 29 | 0.68 | 1.22 | 0.56 | 0.19 | 0.0 | 0.1 | 13.4 | 4/4 |
| 4 | light | advanced-club | 69 | 12.0 | 15.7 | 15.7 | 1.00 | 33 | 0.57 | 0.73 | 0.78 | 0.28 | 1.6 | 36.9 | 29.4 | 3/4 |
| 4 | normal | advanced-club | 69 | 16.2 | 18.8 | 18.1 | 1.04 | 32 | 0.52 | 0.74 | 0.70 | 0.20 | 0.5 | 6.5 | 25.1 | 3/4 |
| 4 | peak | advanced-club | 68 | 24.2 | 28.8 | 25.7 | 1.12 | 28 | 0.42 | 0.75 | 0.57 | 0.13 | 0.0 | 0.2 | 12.9 | 4/4 |
| 4 | light | wide-mix | 70 | 11.9 | 15.9 | 15.2 | 1.05 | 35 | 1.10 | 1.59 | 0.69 | 0.63 | 3.4 | 37.9 | 30.3 | 2/4 |
| 4 | normal | wide-mix | 72 | 16.0 | 19.3 | 17.7 | 1.09 | 30 | 0.87 | 1.59 | 0.55 | 0.45 | 0.6 | 8.1 | 26.1 | 3/4 |
| 4 | peak | wide-mix | 69 | 24.0 | 28.7 | 25.2 | 1.14 | 28 | 0.75 | 1.60 | 0.47 | 0.34 | 0.0 | 0.3 | 13.1 | 4/4 |

## Summary across all 144 cells

| Check | Pass rate |
|---|---|
| Max wait ≤ 1.25× FIFO | 144/144 |
| Cohort SD ≤ 0.65× FIFO | 46/144 |
| Team diff ≤ 0.40 | 79/144 |
| Recent repeats < 10% | 96/144 |
| All four | 35/144 |

This Algorithm averages across the grid: p95 wait 18.3 min, max wait 21.8 min, playtime spread 26 min, cohort SD 0.85, team diff 0.41, recent repeats 12.7%, latecomer bursts 6.9 per session (Lowest Raw Games: 11.2). Worst max wait: 33.8 min (C=1, peak, advanced-club, 240 min).

The cohort-SD check fails in 98/144 cells. Every pass needs both a deep bench (normal/peak density: 45/46 of passes) and ≥2 courts of selection freedom — Stage A can only homogenize cohorts when there are more rested players than one court consumes. On top of that, the ε-bands are absolute (skill² units tuned for the doc's wide club mix), so on tight distributions FIFO's SD is already low and the ratio floors out:

| Skill profile | FIFO SD | SD-check pass | SD ratios (TA/FIFO) |
|---|---|---|---|
| club-balanced | 1.29 | 13/36 | 0.48–0.96 |
| beginner-heavy | 1.16 | 9/36 | 0.50–0.96 |
| advanced-club | 0.74 | 7/36 | 0.53–0.96 |
| wide-mix | 1.56 | 17/36 | 0.43–0.95 |

### Wait & playtime by court count and density (This Algorithm, all session lengths & skill mixes)

| C | Density | p95 wait (min) | Max wait (min) | Playtime spread (min) | Competitive games % |
|---|---|---|---|---|---|
| 1 | light | 16.1 | 17.7 | 16 | 30 |
| 1 | normal | 17.0 | 18.4 | 24 | 33 |
| 1 | peak | 27.2 | 32.5 | 24 | 41 |
| 2 | light | 13.4 | 16.6 | 26 | 42 |
| 2 | normal | 17.3 | 20.1 | 28 | 54 |
| 2 | peak | 24.7 | 30.1 | 27 | 60 |
| 3 | light | 12.5 | 16.2 | 28 | 49 |
| 3 | normal | 16.5 | 19.6 | 29 | 63 |
| 3 | peak | 24.1 | 28.6 | 28 | 71 |
| 4 | light | 11.8 | 15.5 | 30 | 54 |
| 4 | normal | 15.7 | 18.5 | 29 | 65 |
| 4 | peak | 23.2 | 27.5 | 28 | 74 |

## Plots

Rendered from `docs/sweep-cells.json` by `tests/sim/sweep-plots.mjs` (`bun tests/sim/sweep-plots.mjs`). Values are means over all session lengths and skill profiles unless noted.

![Longest wait of the session by court count and crowd density](sweep-plots/max-wait.svg)

*Fig. 1 — The single longest wait of the session. Density (crowd per court) shifts the whole level; the policy penalty (right vs left panel) stays small at every point.*

![Cohort skill spread relative to FIFO](sweep-plots/cohort-sd-ratio.svg)

*Fig. 2 — Cohort skill spread, This Algorithm relative to FIFO (below 1.0 = more evenly matched groups). Dashed line: the 0.65 validation-gate threshold, reachable only with a deep bench.*

![Competitive-game share, FIFO vs This Algorithm](sweep-plots/competitive.svg)

*Fig. 3 — Share of games with a balanced cohort and even teams. Every row moves right (toward competitive) under This Algorithm; the gap widens with court count.*

![Latecomer back-to-back games per session](sweep-plots/latecomer-bursts.svg)

*Fig. 4 — Latecomer consecutive-game bursts per session. "Fewest games played" lets latecomers chain games until the rest limit — the effect compounds with court count — while This Algorithm holds steady.*

## Findings

1. **Consistent direction, every cell.** This Algorithm cuts cohort skill SD below FIFO in all 144 cells (ratios 0.43–0.96), holds max wait within 1.25× FIFO everywhere (144/144, average penalty 5%), and keeps recent repeat partnerships ≤ 20.5% whenever there are ≥2 courts (vs up to 70% in the 1-court corner where quartets are nearly forced). The fairness/variance trade-off is stable across every court count, session length, crowd density, and skill mix tested.
2. **The naive-fairness trap scales with courts.** Lowest Raw Games' latecomer consecutive-game bursts are lowest on a single court but grow once 3+ courts rotate quickly (up to 30 per session at the worst cell) — raw game counts without the virtual-game offset let each latecomer monopolize courts until they hit the rest limit. This Algorithm's bursts stay far lower everywhere.
3. **Density, not court count, drives absolute waits.** Peak rosters (9 players/court) push p95/max waits up with the extra queue depth on every policy; court count mostly changes throughput. This Algorithm's wait penalty vs FIFO is stable across densities, and its playtime spread stays comparable to FIFO's while delivering several times FIFO's competitive-game share.
4. **Fixed thresholds need bench headroom, and the failures concentrate exactly there.** All-four-check pass rate: 1 court 0/36 (0%), 2+ courts 35/108 (32%); light density 0/48 (0%) vs normal/peak 35/96 (36%). With a 6–9 player roster on 1 court there is no real selection freedom — any policy must play whoever is available, so team-diff, repeat, and SD checks fail for structural reasons, not algorithmic ones. On tight skill distributions (advanced-club) FIFO's SD is already low, capping the ratio; lowering `epsSkillVar` within the spec's envelope is the lever if that check matters there.

## Conclusion

**Methodology in brief.** The evaluation uses a discrete-event simulation of a realistic club session — check-in waves, late arrivals, voluntary breaks, early departures, match-length variation, and court turnaround — driving the production matchmaking engine directly. Every game is doubles: each court hosts exactly 4 players at a time, and the roster (6–36 players depending on scenario) rotates through those fixed 4-per-court slots. We compared 144 scenarios (1–4 courts, 2–4 hour sessions, three crowd densities, four skill distributions), replaying each identical evening through every policy so that the matchmaking rule is the only differing variable (common random numbers). That amounts to roughly 160,000 simulated games per policy, large enough that the patterns reported here are systematic rather than luck.

**The policies compared.** *FIFO* sends the four longest-waiting players to court. *Lowest Raw Games* sends the four with the fewest games played — the intuitive "fairness" rule. **This Algorithm** is a two-stage selector: it first restricts candidates to players who are due to play (enough rest, participation kept level across the session, with a safeguard that no one is skipped indefinitely), then chooses the grouping that minimizes skill spread within each group and between the two teams, while avoiding recent repeat partnerships. Crucially, it is allowed to trade a few minutes of one player's wait for a substantially better-matched game — the tolerance bands that make this trade are the study's subject.

**Findings.** Three results hold in every scenario tested:

1. *The trade is cheap.* Average and 95th-percentile waits are essentially unchanged versus FIFO; only the single worst wait of the session grows, by about 5% on average (e.g., ~19 vs ~18 minutes in a busy session), and never beyond 1.25× FIFO in any of the 144 scenarios. The club buys better games for everyone at the price of a few extra minutes for its unluckiest waiter that evening.
2. *Better games, consistently.* Skill spread within each group is 4–57% lower than FIFO (average ~35%), team-vs-team imbalance drops to roughly a third of FIFO's, and recent repeat partnerships fall to under 10% of games whenever at least two courts are running (a large fraction of games under FIFO). Court-time equality is preserved: playtime spread is comparable to FIFO's.
3. *Naive fairness backfires.* "Fewest games played" looks fair but, without the virtual-game correction for late arrivals, it lets each newcomer chain games back-to-back until the rest limit catches them — the effect compounds with court count (double-digit monopolized slots per session at 3–4 courts). This Algorithm's latecomer bursts stay several times lower everywhere.

**Where the guarantees weaken.** With a single court and only 1–2 substitutes waiting (rosters of 6–9, given the fixed 4 players per game), any policy must play whoever is available, so no selector can demonstrate an advantage — the checks that fail there fail structurally, not because of the algorithm. On tight skill distributions the *relative* improvement shrinks because FIFO is already balanced; the algorithm matches it rather than beating it.

**Limitations.** Player skill is modeled as static 1–7 tiers with no updating from results, game durations follow plausible parametric assumptions rather than measured club data, and no-show/no-rally effects are out of scope. The conclusions therefore concern the *relative* comparison between policies under identical conditions, which the paired design supports strongly; absolute minute-level numbers should be read as indicative.

**Recommendation.** For normal operation with two or more courts and roughly fifteen or more players, This Algorithm delivers materially better-matched games and fairer participation at a negligible wait cost, and is clearly preferable to both baselines. For very small single-court sessions the choice of policy is immaterial.

_144 cells, 159,843 games per policy, 291s wall-clock._
