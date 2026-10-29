# Simulation Sweep Report — "This Algorithm" (ε-lexicographic doubles matcher)

Generated 2026-10-29 by `tests/sim/sweep-sim.mjs` (deterministic, seeded CRN — rerunning the script reproduces every number except wall-clock timings, which are excluded). "This Algorithm" is the production two-stage ε-lexicographic engine (`EPSILON_LEX` in code: `server/logic/smartQueue.js planBatch`, spec: `docs/algorithm.md`). Baselines: **FIFO** (top-4 by wait) and **Lowest Raw Games** (top-4 by fewest games played — the naive fairness policy).

## Modeled club session (realistic dynamics)

The discrete-event simulation drives the production engine end to end, including its timestamped consecutive-rest rule (`started_at`/`ended_at` in match history) and joint multi-court batching. Each session models:

- **Court-scaled crowd density** — every court always hosts exactly 4 players per game (doubles). Crowd density is the roster size per court's rotation: total roster = courts × players-per-court (light 5.5, normal ≈7.3, peak 9.0 — i.e., 1.5 / 3.3 / 5.0 people resting per court while 4 play).
- **Staggered arrivals** — an on-time wave plus ~27% late check-ins spread over 15–75 min; latecomers inherit the median virtual game count.
- **Voluntary rest breaks** — after any game, a ~6% chance of sitting out 8–15 min.
- **Early departures** — ~12% of on-time players leave during the final 30 min.
- **Match-dependent game length** — base 13.8 ± 2.1 min, longer on higher-skilled balanced courts, shorter on lopsided blowouts, plus 0.5–1.3 min court turnaround lag.
- **Multi-court batching** — when several courts free up together, the engine plans them jointly (and stages on-deck equivalents via `courtCount`).

## Sweep grid

| Axis           | Values                                                                                                                                                  |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Courts         | 1, 2, 3, 4                                                                                                                                              |
| Session length | 120 min, 180 min, 240 min                                                                                                                               |
| Skill profile  | club-balanced, beginner-heavy, advanced-club, wide-mix (N(mean, sd), clipped 1.5–9.5, quantized to the production 1–7 tiers)                            |
| Crowd density  | light (5.5/court), normal (7.3/court), peak (9.0/court) — roster = courts × players-per-court; 4 play per court (doubles) at all times, the rest rotate |
| Seeds per cell | scaled to ≥ 1000 simulated games for This Algorithm (10–200)                                                                                            |

Each cell replays the **same** player skills, arrival times, breaks, departures, and game durations across all policies (Common Random Numbers), so differences are caused by the matchmaking policy alone. Gate-style checks per cell, This Algorithm vs FIFO: max wait ≤ 1.25×, cohort skill SD ≤ 0.65×, weak-link team diff ≤ 0.40, recent repeats (≤6 games) < 10%.

## Session length: 120 min

| C   | Density | Skill profile  | Games | TA p95 wait | TA max wait | FIFO max wait | ratio | TA play spread | TA SD | FIFO SD | ratio | TA team diff | TA recent rep % | TA bursts | LRG bursts | Checks |
| --- | ------- | -------------- | ----- | ----------- | ----------- | ------------- | ----- | -------------- | ----- | ------- | ----- | ------------ | --------------- | --------- | ---------- | ------ |
| 1   | light   | club-balanced  | 10    | 15.7        | 17.3        | 16.9          | 1.02  | 14             | 1.24  | 1.28    | 0.97  | 0.81         | 49.8            | 4.9       | 4.5        | 1/4    |
| 1   | normal  | club-balanced  | 10    | 17.0        | 21.2        | 17.6          | 1.20  | 22             | 1.19  | 1.30    | 0.91  | 0.79         | 31.2            | 3.0       | 3.7        | 1/4    |
| 1   | peak    | club-balanced  | 10    | 28.9        | 32.5        | 30.8          | 1.05  | 22             | 1.04  | 1.27    | 0.81  | 0.62         | 12.1            | 1.0       | 1.7        | 1/4    |
| 1   | light   | beginner-heavy | 10    | 15.5        | 17.3        | 16.8          | 1.03  | 16             | 1.09  | 1.13    | 0.96  | 0.57         | 48.9            | 4.9       | 4.5        | 1/4    |
| 1   | normal  | beginner-heavy | 10    | 16.9        | 21.9        | 17.5          | 1.25  | 22             | 1.06  | 1.15    | 0.93  | 0.53         | 35.0            | 3.0       | 3.7        | 1/4    |
| 1   | peak    | beginner-heavy | 10    | 28.9        | 32.0        | 30.6          | 1.05  | 23             | 0.95  | 1.13    | 0.84  | 0.46         | 11.8            | 0.9       | 1.8        | 1/4    |
| 1   | light   | advanced-club  | 10    | 15.8        | 17.8        | 17.1          | 1.04  | 14             | 0.73  | 0.75    | 0.96  | 0.57         | 42.5            | 5.0       | 4.4        | 1/4    |
| 1   | normal  | advanced-club  | 10    | 17.2        | 22.3        | 17.8          | 1.25  | 21             | 0.70  | 0.76    | 0.92  | 0.50         | 27.0            | 3.0       | 3.7        | 0/4    |
| 1   | peak    | advanced-club  | 10    | 29.5        | 32.3        | 31.0          | 1.04  | 22             | 0.62  | 0.75    | 0.84  | 0.43         | 7.7             | 1.0       | 1.7        | 2/4    |
| 1   | light   | wide-mix       | 10    | 15.5        | 17.1        | 16.8          | 1.01  | 15             | 1.49  | 1.55    | 0.97  | 0.89         | 50.2            | 4.9       | 4.5        | 1/4    |
| 1   | normal  | wide-mix       | 10    | 16.8        | 20.7        | 17.6          | 1.18  | 22             | 1.44  | 1.57    | 0.92  | 0.88         | 34.9            | 2.9       | 3.7        | 1/4    |
| 1   | peak    | wide-mix       | 10    | 29.0        | 32.4        | 30.6          | 1.06  | 22             | 1.26  | 1.53    | 0.82  | 0.73         | 13.3            | 1.0       | 1.7        | 1/4    |
| 2   | light   | club-balanced  | 19    | 13.0        | 16.6        | 16.5          | 1.00  | 25             | 1.07  | 1.29    | 0.83  | 0.72         | 17.1            | 8.3       | 7.3        | 1/4    |
| 2   | normal  | club-balanced  | 19    | 17.3        | 21.6        | 17.8          | 1.22  | 27             | 0.95  | 1.28    | 0.74  | 0.60         | 4.1             | 2.8       | 6.6        | 2/4    |
| 2   | peak    | club-balanced  | 19    | 23.7        | 29.2        | 26.5          | 1.10  | 25             | 0.85  | 1.29    | 0.66  | 0.51         | 2.4             | 0.4       | 4.6        | 2/4    |
| 2   | light   | beginner-heavy | 19    | 12.9        | 16.3        | 16.3          | 1.00  | 23             | 0.98  | 1.15    | 0.86  | 0.51         | 16.7            | 8.1       | 7.5        | 1/4    |
| 2   | normal  | beginner-heavy | 19    | 17.5        | 21.7        | 17.7          | 1.22  | 28             | 0.88  | 1.15    | 0.77  | 0.45         | 5.3             | 3.0       | 6.9        | 2/4    |
| 2   | peak    | beginner-heavy | 19    | 24.0        | 28.6        | 26.4          | 1.08  | 27             | 0.81  | 1.15    | 0.70  | 0.42         | 3.1             | 0.5       | 4.7        | 2/4    |
| 2   | light   | advanced-club  | 18    | 12.9        | 16.8        | 16.6          | 1.01  | 22             | 0.63  | 0.75    | 0.84  | 0.48         | 10.1            | 8.2       | 7.2        | 1/4    |
| 2   | normal  | advanced-club  | 18    | 17.8        | 21.4        | 17.9          | 1.19  | 27             | 0.57  | 0.73    | 0.78  | 0.39         | 2.1             | 2.7       | 6.6        | 3/4    |
| 2   | peak    | advanced-club  | 19    | 24.3        | 29.5        | 26.8          | 1.10  | 28             | 0.52  | 0.75    | 0.70  | 0.36         | 1.0             | 0.5       | 4.4        | 3/4    |
| 2   | light   | wide-mix       | 19    | 12.8        | 16.6        | 16.3          | 1.01  | 24             | 1.26  | 1.54    | 0.81  | 0.78         | 15.4            | 8.0       | 7.4        | 1/4    |
| 2   | normal  | wide-mix       | 19    | 17.6        | 21.6        | 17.7          | 1.22  | 26             | 1.10  | 1.53    | 0.72  | 0.69         | 4.7             | 2.6       | 6.8        | 2/4    |
| 2   | peak    | wide-mix       | 19    | 24.1        | 29.1        | 26.5          | 1.10  | 26             | 0.95  | 1.56    | 0.61  | 0.58         | 2.3             | 0.3       | 4.6        | 3/4    |
| 3   | light   | club-balanced  | 28    | 12.8        | 16.2        | 15.5          | 1.04  | 25             | 0.99  | 1.28    | 0.77  | 0.66         | 5.9             | 11.8      | 10.8       | 2/4    |
| 3   | normal  | club-balanced  | 28    | 16.7        | 19.9        | 17.5          | 1.14  | 28             | 0.80  | 1.28    | 0.63  | 0.49         | 2.7             | 3.7       | 10.2       | 3/4    |
| 3   | peak    | club-balanced  | 28    | 23.6        | 28.1        | 25.1          | 1.12  | 28             | 0.72  | 1.28    | 0.56  | 0.42         | 0.8             | 0.4       | 5.2        | 3/4    |
| 3   | light   | beginner-heavy | 28    | 12.5        | 16.2        | 15.5          | 1.05  | 25             | 0.89  | 1.14    | 0.78  | 0.50         | 7.8             | 11.9      | 11.1       | 2/4    |
| 3   | normal  | beginner-heavy | 28    | 16.6        | 20.2        | 17.4          | 1.16  | 28             | 0.77  | 1.13    | 0.68  | 0.41         | 2.2             | 4.3       | 10.3       | 2/4    |
| 3   | peak    | beginner-heavy | 28    | 23.3        | 27.9        | 25.0          | 1.12  | 27             | 0.67  | 1.14    | 0.59  | 0.37         | 0.4             | 0.3       | 5.4        | 4/4    |
| 3   | light   | advanced-club  | 27    | 12.8        | 16.5        | 15.7          | 1.04  | 25             | 0.58  | 0.73    | 0.80  | 0.43         | 3.4             | 11.3      | 10.8       | 2/4    |
| 3   | normal  | advanced-club  | 27    | 16.8        | 20.4        | 17.7          | 1.15  | 30             | 0.50  | 0.73    | 0.69  | 0.34         | 1.1             | 3.6       | 10.2       | 3/4    |
| 3   | peak    | advanced-club  | 27    | 23.8        | 28.0        | 25.4          | 1.10  | 28             | 0.44  | 0.74    | 0.60  | 0.29         | 0.2             | 0.3       | 5.1        | 4/4    |
| 3   | light   | wide-mix       | 28    | 12.7        | 16.1        | 15.5          | 1.04  | 24             | 1.13  | 1.54    | 0.74  | 0.72         | 6.7             | 11.7      | 11.1       | 2/4    |
| 3   | normal  | wide-mix       | 28    | 16.7        | 19.9        | 17.4          | 1.14  | 27             | 0.91  | 1.54    | 0.59  | 0.54         | 2.4             | 3.8       | 10.4       | 3/4    |
| 3   | peak    | wide-mix       | 28    | 23.4        | 28.0        | 25.0          | 1.12  | 26             | 0.78  | 1.57    | 0.50  | 0.48         | 0.2             | 0.5       | 5.3        | 3/4    |
| 4   | light   | club-balanced  | 37    | 12.0        | 15.5        | 14.9          | 1.04  | 26             | 0.92  | 1.27    | 0.73  | 0.63         | 3.6             | 15.9      | 13.5       | 2/4    |
| 4   | normal  | club-balanced  | 37    | 15.8        | 19.0        | 16.9          | 1.12  | 30             | 0.71  | 1.30    | 0.55  | 0.46         | 0.8             | 5.1       | 14.4       | 3/4    |
| 4   | peak    | club-balanced  | 38    | 22.7        | 27.3        | 24.1          | 1.14  | 26             | 0.63  | 1.29    | 0.49  | 0.40         | 0.0             | 0.2       | 8.3        | 3/4    |
| 4   | light   | beginner-heavy | 37    | 11.9        | 15.3        | 14.7          | 1.05  | 26             | 0.83  | 1.13    | 0.73  | 0.48         | 4.1             | 16.1      | 13.6       | 2/4    |
| 4   | normal  | beginner-heavy | 37    | 15.7        | 18.5        | 16.8          | 1.10  | 29             | 0.71  | 1.18    | 0.61  | 0.39         | 0.5             | 4.9       | 14.7       | 4/4    |
| 4   | peak    | beginner-heavy | 38    | 22.6        | 27.3        | 23.9          | 1.14  | 27             | 0.63  | 1.18    | 0.53  | 0.32         | 0.0             | 0.3       | 8.6        | 4/4    |
| 4   | light   | advanced-club  | 36    | 12.0        | 15.4        | 14.9          | 1.03  | 26             | 0.51  | 0.71    | 0.73  | 0.36         | 2.2             | 15.4      | 13.4       | 3/4    |
| 4   | normal  | advanced-club  | 37    | 16.0        | 18.9        | 17.1          | 1.10  | 29             | 0.45  | 0.72    | 0.62  | 0.30         | 0.0             | 4.1       | 14.2       | 4/4    |
| 4   | peak    | advanced-club  | 37    | 22.9        | 27.3        | 24.5          | 1.11  | 26             | 0.38  | 0.73    | 0.53  | 0.25         | 0.0             | 0.3       | 8.1        | 4/4    |
| 4   | light   | wide-mix       | 37    | 12.1        | 15.6        | 14.7          | 1.06  | 27             | 1.06  | 1.55    | 0.69  | 0.74         | 3.5             | 15.4      | 13.5       | 2/4    |
| 4   | normal  | wide-mix       | 37    | 15.8        | 18.9        | 16.7          | 1.13  | 28             | 0.81  | 1.58    | 0.51  | 0.51         | 0.7             | 4.6       | 14.6       | 3/4    |
| 4   | peak    | wide-mix       | 38    | 23.0        | 27.1        | 23.9          | 1.13  | 26             | 0.67  | 1.57    | 0.42  | 0.40         | 0.0             | 0.5       | 8.4        | 4/4    |

## Session length: 180 min

| C   | Density | Skill profile  | Games | TA p95 wait | TA max wait | FIFO max wait | ratio | TA play spread | TA SD | FIFO SD | ratio | TA team diff | TA recent rep % | TA bursts | LRG bursts | Checks |
| --- | ------- | -------------- | ----- | ----------- | ----------- | ------------- | ----- | -------------- | ----- | ------- | ----- | ------------ | --------------- | --------- | ---------- | ------ |
| 1   | light   | club-balanced  | 14    | 16.1        | 18.0        | 17.8          | 1.01  | 16             | 1.24  | 1.28    | 0.97  | 0.82         | 62.8            | 7.1       | 6.7        | 1/4    |
| 1   | normal  | club-balanced  | 14    | 17.2        | 20.6        | 18.2          | 1.13  | 23             | 1.21  | 1.29    | 0.94  | 0.83         | 43.4            | 4.3       | 5.4        | 1/4    |
| 1   | peak    | club-balanced  | 14    | 30.2        | 33.5        | 32.4          | 1.03  | 25             | 1.11  | 1.29    | 0.86  | 0.71         | 17.1            | 1.3       | 2.6        | 1/4    |
| 1   | light   | beginner-heavy | 14    | 16.0        | 18.1        | 17.7          | 1.02  | 16             | 1.11  | 1.15    | 0.97  | 0.60         | 63.1            | 7.3       | 6.8        | 1/4    |
| 1   | normal  | beginner-heavy | 14    | 17.2        | 21.2        | 18.1          | 1.17  | 24             | 1.09  | 1.14    | 0.96  | 0.57         | 47.8            | 4.3       | 5.5        | 1/4    |
| 1   | peak    | beginner-heavy | 14    | 29.9        | 33.4        | 32.1          | 1.04  | 25             | 1.01  | 1.15    | 0.88  | 0.51         | 20.0            | 1.3       | 2.6        | 1/4    |
| 1   | light   | advanced-club  | 14    | 16.2        | 18.3        | 18.0          | 1.02  | 18             | 0.72  | 0.74    | 0.97  | 0.59         | 55.2            | 7.2       | 6.6        | 1/4    |
| 1   | normal  | advanced-club  | 14    | 17.5        | 22.5        | 18.5          | 1.22  | 21             | 0.70  | 0.74    | 0.95  | 0.54         | 36.7            | 4.3       | 5.4        | 1/4    |
| 1   | peak    | advanced-club  | 14    | 30.5        | 34.1        | 32.9          | 1.04  | 25             | 0.65  | 0.75    | 0.87  | 0.46         | 10.6            | 1.4       | 2.6        | 1/4    |
| 1   | light   | wide-mix       | 14    | 16.1        | 17.9        | 17.7          | 1.01  | 17             | 1.48  | 1.53    | 0.97  | 0.96         | 63.1            | 7.1       | 6.7        | 1/4    |
| 1   | normal  | wide-mix       | 14    | 17.1        | 20.1        | 18.2          | 1.11  | 24             | 1.45  | 1.54    | 0.94  | 0.89         | 47.0            | 4.3       | 5.5        | 1/4    |
| 1   | peak    | wide-mix       | 14    | 29.9        | 33.2        | 32.1          | 1.03  | 25             | 1.33  | 1.55    | 0.86  | 0.81         | 19.2            | 1.2       | 2.6        | 1/4    |
| 2   | light   | club-balanced  | 27    | 13.9        | 17.0        | 17.2          | 0.99  | 28             | 1.10  | 1.27    | 0.87  | 0.75         | 19.1            | 12.8      | 11.3       | 1/4    |
| 2   | normal  | club-balanced  | 27    | 18.3        | 23.5        | 18.4          | 1.28  | 31             | 1.00  | 1.28    | 0.78  | 0.63         | 5.6             | 4.0       | 10.1       | 1/4    |
| 2   | peak    | club-balanced  | 28    | 25.4        | 30.3        | 28.0          | 1.08  | 28             | 0.89  | 1.29    | 0.69  | 0.54         | 3.4             | 0.7       | 6.6        | 2/4    |
| 2   | light   | beginner-heavy | 27    | 13.5        | 17.0        | 16.9          | 1.00  | 29             | 0.97  | 1.14    | 0.86  | 0.55         | 18.1            | 13.4      | 11.2       | 1/4    |
| 2   | normal  | beginner-heavy | 27    | 18.2        | 23.4        | 18.3          | 1.28  | 30             | 0.91  | 1.15    | 0.79  | 0.48         | 5.1             | 4.3       | 10.2       | 1/4    |
| 2   | peak    | beginner-heavy | 28    | 25.1        | 29.5        | 27.8          | 1.06  | 28             | 0.81  | 1.14    | 0.71  | 0.42         | 3.6             | 0.5       | 6.8        | 2/4    |
| 2   | light   | advanced-club  | 27    | 14.0        | 17.5        | 17.3          | 1.01  | 29             | 0.64  | 0.74    | 0.87  | 0.52         | 12.1            | 12.2      | 11.0       | 1/4    |
| 2   | normal  | advanced-club  | 27    | 18.3        | 23.5        | 18.6          | 1.27  | 30             | 0.59  | 0.74    | 0.79  | 0.42         | 2.2             | 4.2       | 10.0       | 1/4    |
| 2   | peak    | advanced-club  | 27    | 25.6        | 30.8        | 28.1          | 1.10  | 30             | 0.53  | 0.73    | 0.73  | 0.39         | 1.4             | 0.7       | 6.5        | 3/4    |
| 2   | light   | wide-mix       | 27    | 13.7        | 16.8        | 17.1          | 0.98  | 27             | 1.29  | 1.54    | 0.83  | 0.82         | 19.9            | 12.7      | 11.2       | 1/4    |
| 2   | normal  | wide-mix       | 27    | 18.2        | 22.8        | 18.3          | 1.25  | 29             | 1.15  | 1.55    | 0.74  | 0.71         | 4.9             | 4.1       | 10.2       | 2/4    |
| 2   | peak    | wide-mix       | 28    | 25.4        | 30.8        | 27.8          | 1.11  | 29             | 1.04  | 1.56    | 0.67  | 0.66         | 4.4             | 0.8       | 6.7        | 2/4    |
| 3   | light   | club-balanced  | 40    | 13.4        | 16.8        | 16.3          | 1.03  | 27             | 1.04  | 1.29    | 0.81  | 0.72         | 7.1             | 18.4      | 16.8       | 2/4    |
| 3   | normal  | club-balanced  | 41    | 17.0        | 20.9        | 18.1          | 1.15  | 31             | 0.84  | 1.29    | 0.65  | 0.54         | 2.2             | 6.1       | 15.0       | 2/4    |
| 3   | peak    | club-balanced  | 40    | 24.5        | 29.3        | 26.1          | 1.12  | 31             | 0.77  | 1.29    | 0.60  | 0.50         | 0.8             | 0.6       | 7.5        | 3/4    |
| 3   | light   | beginner-heavy | 41    | 13.2        | 16.6        | 16.4          | 1.02  | 28             | 0.96  | 1.16    | 0.82  | 0.55         | 8.0             | 18.2      | 17.0       | 2/4    |
| 3   | normal  | beginner-heavy | 41    | 16.9        | 20.9        | 18.1          | 1.16  | 30             | 0.80  | 1.13    | 0.71  | 0.43         | 2.9             | 6.1       | 15.2       | 2/4    |
| 3   | peak    | beginner-heavy | 40    | 24.5        | 29.2        | 25.9          | 1.13  | 29             | 0.72  | 1.16    | 0.62  | 0.39         | 0.6             | 0.4       | 7.8        | 4/4    |
| 3   | light   | advanced-club  | 40    | 13.4        | 17.3        | 16.5          | 1.05  | 28             | 0.59  | 0.71    | 0.83  | 0.45         | 4.0             | 17.7      | 16.5       | 2/4    |
| 3   | normal  | advanced-club  | 39    | 17.2        | 21.0        | 18.3          | 1.15  | 32             | 0.51  | 0.71    | 0.71  | 0.37         | 0.6             | 5.5       | 15.0       | 3/4    |
| 3   | peak    | advanced-club  | 40    | 24.9        | 29.7        | 26.5          | 1.12  | 32             | 0.47  | 0.72    | 0.65  | 0.34         | 0.2             | 0.6       | 7.5        | 4/4    |
| 3   | light   | wide-mix       | 41    | 13.1        | 16.3        | 16.4          | 1.00  | 29             | 1.19  | 1.57    | 0.75  | 0.79         | 8.4             | 17.9      | 16.6       | 2/4    |
| 3   | normal  | wide-mix       | 41    | 17.0        | 21.2        | 18.2          | 1.17  | 30             | 0.99  | 1.55    | 0.64  | 0.64         | 2.7             | 6.0       | 15.2       | 3/4    |
| 3   | peak    | wide-mix       | 40    | 24.7        | 29.3        | 25.7          | 1.14  | 29             | 0.83  | 1.55    | 0.54  | 0.52         | 0.6             | 0.4       | 7.5        | 3/4    |
| 4   | light   | club-balanced  | 54    | 12.4        | 15.9        | 15.0          | 1.06  | 30             | 1.01  | 1.33    | 0.75  | 0.70         | 4.8             | 25.2      | 21.1       | 2/4    |
| 4   | normal  | club-balanced  | 53    | 16.4        | 19.8        | 17.3          | 1.14  | 33             | 0.79  | 1.34    | 0.59  | 0.53         | 0.8             | 6.9       | 20.1       | 3/4    |
| 4   | peak    | club-balanced  | 54    | 23.7        | 28.1        | 24.8          | 1.13  | 31             | 0.69  | 1.33    | 0.52  | 0.44         | 0.0             | 0.8       | 13.3       | 3/4    |
| 4   | light   | beginner-heavy | 54    | 12.4        | 16.2        | 15.2          | 1.06  | 31             | 0.90  | 1.17    | 0.77  | 0.54         | 4.8             | 25.3      | 21.3       | 2/4    |
| 4   | normal  | beginner-heavy | 55    | 16.1        | 19.4        | 17.2          | 1.13  | 30             | 0.76  | 1.20    | 0.63  | 0.43         | 0.1             | 6.9       | 20.4       | 3/4    |
| 4   | peak    | beginner-heavy | 54    | 23.5        | 27.7        | 24.6          | 1.12  | 28             | 0.68  | 1.21    | 0.56  | 0.39         | 0.0             | 0.5       | 13.5       | 4/4    |
| 4   | light   | advanced-club  | 54    | 12.6        | 16.0        | 15.6          | 1.02  | 30             | 0.59  | 0.74    | 0.80  | 0.45         | 1.9             | 24.5      | 20.5       | 2/4    |
| 4   | normal  | advanced-club  | 53    | 16.4        | 19.9        | 17.7          | 1.13  | 32             | 0.50  | 0.76    | 0.66  | 0.37         | 0.2             | 8.0       | 19.9       | 3/4    |
| 4   | peak    | advanced-club  | 52    | 24.1        | 28.3        | 25.1          | 1.13  | 29             | 0.44  | 0.76    | 0.58  | 0.32         | 0.0             | 0.5       | 13.2       | 4/4    |
| 4   | light   | wide-mix       | 54    | 12.3        | 16.1        | 15.2          | 1.06  | 28             | 1.15  | 1.59    | 0.72  | 0.79         | 4.5             | 25.8      | 21.7       | 2/4    |
| 4   | normal  | wide-mix       | 54    | 16.2        | 19.3        | 17.1          | 1.12  | 31             | 0.85  | 1.60    | 0.53  | 0.56         | 1.1             | 8.1       | 20.6       | 3/4    |
| 4   | peak    | wide-mix       | 54    | 23.7        | 28.3        | 24.6          | 1.15  | 30             | 0.74  | 1.59    | 0.47  | 0.46         | 0.0             | 0.3       | 13.3       | 3/4    |

## Session length: 240 min

| C   | Density | Skill profile  | Games | TA p95 wait | TA max wait | FIFO max wait | ratio | TA play spread | TA SD | FIFO SD | ratio | TA team diff | TA recent rep % | TA bursts | LRG bursts | Checks |
| --- | ------- | -------------- | ----- | ----------- | ----------- | ------------- | ----- | -------------- | ----- | ------- | ----- | ------------ | --------------- | --------- | ---------- | ------ |
| 1   | light   | club-balanced  | 18    | 16.5        | 18.3        | 18.1          | 1.01  | 17             | 1.26  | 1.29    | 0.97  | 0.82         | 68.7            | 10.1      | 9.3        | 1/4    |
| 1   | normal  | club-balanced  | 18    | 17.3        | 20.9        | 18.5          | 1.13  | 26             | 1.23  | 1.30    | 0.95  | 0.81         | 47.8            | 5.5       | 7.6        | 1/4    |
| 1   | peak    | club-balanced  | 18    | 30.7        | 34.1        | 33.3          | 1.03  | 27             | 1.13  | 1.28    | 0.89  | 0.74         | 19.9            | 1.4       | 2.6        | 1/4    |
| 1   | light   | beginner-heavy | 19    | 16.3        | 18.6        | 18.0          | 1.03  | 17             | 1.11  | 1.14    | 0.97  | 0.60         | 67.9            | 10.2      | 9.4        | 1/4    |
| 1   | normal  | beginner-heavy | 19    | 17.2        | 21.3        | 18.4          | 1.16  | 25             | 1.10  | 1.14    | 0.96  | 0.55         | 52.3            | 5.7       | 7.7        | 1/4    |
| 1   | peak    | beginner-heavy | 18    | 30.3        | 34.1        | 33.1          | 1.03  | 26             | 1.02  | 1.13    | 0.90  | 0.53         | 20.3            | 1.5       | 2.6        | 1/4    |
| 1   | light   | advanced-club  | 18    | 16.6        | 18.5        | 18.3          | 1.01  | 18             | 0.73  | 0.75    | 0.97  | 0.60         | 61.3            | 10.0      | 9.3        | 1/4    |
| 1   | normal  | advanced-club  | 18    | 17.4        | 22.2        | 18.8          | 1.18  | 23             | 0.71  | 0.75    | 0.95  | 0.55         | 40.6            | 5.6       | 7.5        | 1/4    |
| 1   | peak    | advanced-club  | 18    | 31.0        | 34.9        | 33.6          | 1.04  | 28             | 0.65  | 0.74    | 0.88  | 0.49         | 12.4            | 1.4       | 2.5        | 1/4    |
| 1   | light   | wide-mix       | 19    | 16.4        | 18.1        | 18.0          | 1.01  | 18             | 1.48  | 1.52    | 0.97  | 1.00         | 69.0            | 10.1      | 9.4        | 1/4    |
| 1   | normal  | wide-mix       | 18    | 17.2        | 20.4        | 18.4          | 1.11  | 25             | 1.46  | 1.55    | 0.94  | 0.92         | 51.3            | 5.5       | 7.6        | 1/4    |
| 1   | peak    | wide-mix       | 18    | 30.6        | 33.8        | 33.1          | 1.02  | 26             | 1.35  | 1.52    | 0.89  | 0.84         | 22.4            | 1.2       | 2.7        | 1/4    |
| 2   | light   | club-balanced  | 35    | 14.4        | 17.6        | 17.9          | 0.98  | 30             | 1.10  | 1.25    | 0.88  | 0.75         | 20.4            | 18.2      | 15.5       | 1/4    |
| 2   | normal  | club-balanced  | 35    | 18.4        | 23.9        | 18.9          | 1.27  | 34             | 0.99  | 1.27    | 0.78  | 0.63         | 5.6             | 5.6       | 12.7       | 1/4    |
| 2   | peak    | club-balanced  | 37    | 26.3        | 32.0        | 29.2          | 1.10  | 30             | 0.89  | 1.27    | 0.70  | 0.56         | 2.8             | 0.7       | 6.8        | 2/4    |
| 2   | light   | beginner-heavy | 36    | 14.0        | 17.5        | 17.5          | 1.00  | 34             | 1.02  | 1.14    | 0.89  | 0.58         | 18.8            | 18.4      | 15.7       | 1/4    |
| 2   | normal  | beginner-heavy | 36    | 18.4        | 23.9        | 18.8          | 1.27  | 30             | 0.94  | 1.15    | 0.82  | 0.52         | 6.6             | 5.8       | 12.8       | 1/4    |
| 2   | peak    | beginner-heavy | 37    | 26.3        | 31.0        | 28.9          | 1.07  | 31             | 0.85  | 1.15    | 0.74  | 0.46         | 3.6             | 0.6       | 7.1        | 2/4    |
| 2   | light   | advanced-club  | 34    | 14.3        | 18.1        | 17.9          | 1.01  | 31             | 0.62  | 0.70    | 0.88  | 0.50         | 12.2            | 17.3      | 15.3       | 1/4    |
| 2   | normal  | advanced-club  | 35    | 18.7        | 24.3        | 19.0          | 1.27  | 33             | 0.58  | 0.71    | 0.81  | 0.42         | 2.2             | 5.5       | 12.5       | 1/4    |
| 2   | peak    | advanced-club  | 36    | 26.6        | 32.2        | 29.4          | 1.09  | 32             | 0.53  | 0.70    | 0.75  | 0.38         | 1.5             | 0.8       | 6.7        | 3/4    |
| 2   | light   | wide-mix       | 35    | 14.1        | 17.7        | 17.6          | 1.00  | 31             | 1.32  | 1.54    | 0.86  | 0.88         | 21.2            | 17.4      | 15.6       | 1/4    |
| 2   | normal  | wide-mix       | 35    | 18.5        | 23.1        | 18.8          | 1.23  | 32             | 1.16  | 1.54    | 0.76  | 0.72         | 5.0             | 5.6       | 12.7       | 2/4    |
| 2   | peak    | wide-mix       | 37    | 26.6        | 31.8        | 29.0          | 1.10  | 32             | 1.04  | 1.55    | 0.67  | 0.68         | 4.2             | 0.8       | 6.9        | 2/4    |
| 3   | light   | club-balanced  | 53    | 13.9        | 17.4        | 16.5          | 1.05  | 32             | 1.08  | 1.32    | 0.82  | 0.73         | 7.4             | 26.9      | 23.6       | 2/4    |
| 3   | normal  | club-balanced  | 53    | 17.2        | 21.7        | 18.6          | 1.17  | 30             | 0.89  | 1.33    | 0.67  | 0.58         | 2.2             | 7.9       | 19.0       | 2/4    |
| 3   | peak    | club-balanced  | 53    | 25.5        | 30.5        | 26.9          | 1.13  | 36             | 0.81  | 1.32    | 0.61  | 0.54         | 0.7             | 0.8       | 7.6        | 3/4    |
| 3   | light   | beginner-heavy | 53    | 13.5        | 17.0        | 16.8          | 1.01  | 31             | 0.98  | 1.16    | 0.85  | 0.57         | 7.3             | 26.8      | 24.2       | 2/4    |
| 3   | normal  | beginner-heavy | 53    | 17.1        | 21.5        | 18.6          | 1.15  | 32             | 0.84  | 1.15    | 0.73  | 0.47         | 2.4             | 8.2       | 19.2       | 2/4    |
| 3   | peak    | beginner-heavy | 53    | 25.3        | 29.8        | 26.7          | 1.12  | 35             | 0.76  | 1.19    | 0.64  | 0.44         | 0.5             | 0.6       | 7.9        | 3/4    |
| 3   | light   | advanced-club  | 52    | 13.8        | 17.5        | 16.7          | 1.05  | 30             | 0.62  | 0.74    | 0.85  | 0.47         | 4.3             | 26.0      | 23.5       | 2/4    |
| 3   | normal  | advanced-club  | 52    | 17.5        | 21.7        | 18.7          | 1.16  | 34             | 0.54  | 0.75    | 0.73  | 0.40         | 0.8             | 8.4       | 18.6       | 3/4    |
| 3   | peak    | advanced-club  | 52    | 25.8        | 30.2        | 27.4          | 1.10  | 35             | 0.50  | 0.75    | 0.67  | 0.36         | 0.2             | 0.7       | 7.6        | 3/4    |
| 3   | light   | wide-mix       | 53    | 13.6        | 16.9        | 16.7          | 1.01  | 31             | 1.23  | 1.59    | 0.77  | 0.78         | 8.5             | 25.9      | 24.1       | 2/4    |
| 3   | normal  | wide-mix       | 54    | 17.2        | 21.7        | 18.6          | 1.17  | 31             | 1.01  | 1.59    | 0.64  | 0.66         | 2.2             | 7.0       | 18.8       | 3/4    |
| 3   | peak    | wide-mix       | 53    | 25.5        | 29.8        | 26.7          | 1.12  | 31             | 0.87  | 1.58    | 0.55  | 0.54         | 1.0             | 0.6       | 7.7        | 3/4    |
| 4   | light   | club-balanced  | 69    | 12.7        | 16.5        | 15.0          | 1.10  | 32             | 1.03  | 1.31    | 0.78  | 0.70         | 5.0             | 36.4      | 29.8       | 2/4    |
| 4   | normal  | club-balanced  | 71    | 16.7        | 20.6        | 18.0          | 1.14  | 34             | 0.83  | 1.32    | 0.63  | 0.56         | 0.6             | 9.9       | 24.7       | 3/4    |
| 4   | peak    | club-balanced  | 69    | 24.4        | 29.0        | 25.6          | 1.13  | 34             | 0.71  | 1.33    | 0.53  | 0.48         | 0.0             | 0.5       | 13.0       | 3/4    |
| 4   | light   | beginner-heavy | 70    | 12.6        | 16.7        | 15.2          | 1.10  | 35             | 0.94  | 1.16    | 0.81  | 0.57         | 4.3             | 36.4      | 30.0       | 2/4    |
| 4   | normal  | beginner-heavy | 72    | 16.4        | 20.3        | 17.7          | 1.15  | 30             | 0.77  | 1.19    | 0.64  | 0.45         | 0.2             | 10.4      | 25.6       | 3/4    |
| 4   | peak    | beginner-heavy | 69    | 24.1        | 28.5        | 25.1          | 1.13  | 31             | 0.70  | 1.22    | 0.57  | 0.41         | 0.0             | 0.4       | 13.4       | 3/4    |
| 4   | light   | advanced-club  | 69    | 12.8        | 16.4        | 15.7          | 1.05  | 32             | 0.60  | 0.73    | 0.82  | 0.46         | 2.1             | 35.3      | 29.4       | 2/4    |
| 4   | normal  | advanced-club  | 69    | 16.8        | 20.4        | 18.1          | 1.12  | 34             | 0.51  | 0.74    | 0.69  | 0.40         | 0.2             | 10.5      | 25.1       | 2/4    |
| 4   | peak    | advanced-club  | 68    | 24.7        | 29.2        | 25.7          | 1.14  | 32             | 0.44  | 0.75    | 0.59  | 0.34         | 0.0             | 0.6       | 12.9       | 4/4    |
| 4   | light   | wide-mix       | 70    | 12.6        | 16.9        | 15.2          | 1.11  | 33             | 1.18  | 1.59    | 0.74  | 0.82         | 5.0             | 36.3      | 30.3       | 2/4    |
| 4   | normal  | wide-mix       | 72    | 16.7        | 19.7        | 17.7          | 1.11  | 32             | 0.86  | 1.59    | 0.54  | 0.59         | 0.8             | 11.1      | 26.1       | 3/4    |
| 4   | peak    | wide-mix       | 69    | 24.2        | 29.0        | 25.2          | 1.15  | 30             | 0.78  | 1.60    | 0.49  | 0.51         | 0.0             | 0.3       | 13.1       | 3/4    |

## Summary across all 144 cells

| Check                  | Pass rate |
| ---------------------- | --------- |
| Max wait ≤ 1.25× FIFO  | 137/144   |
| Cohort SD ≤ 0.65× FIFO | 38/144    |
| Team diff ≤ 0.40       | 22/144    |
| Recent repeats < 10%   | 97/144    |
| All four               | 12/144    |

This Algorithm averages across the grid: p95 wait 18.9 min, max wait 22.8 min, playtime spread 27 min, cohort SD 0.89, team diff 0.56, recent repeats 12.7%, latecomer bursts 7.4 per session (Lowest Raw Games: 11.2). Worst max wait: 34.9 min (C=1, peak, advanced-club, 240 min).

The cohort-SD check fails in 106/144 cells. Every pass needs both a deep bench (normal/peak density: 38/38 of passes) and ≥2 courts of selection freedom — Stage A can only homogenize cohorts when there are more rested players than one court consumes. On top of that, the ε-bands are absolute (fixed skill² tolerances), so on tight distributions FIFO's SD is already low and the ratio floors out:

| Skill profile  | FIFO SD | SD-check pass | SD ratios (TA/FIFO) |
| -------------- | ------- | ------------- | ------------------- |
| club-balanced  | 1.29    | 10/36         | 0.49–0.97           |
| beginner-heavy | 1.16    | 9/36          | 0.53–0.97           |
| advanced-club  | 0.74    | 6/36          | 0.53–0.97           |
| wide-mix       | 1.56    | 13/36         | 0.42–0.97           |

### Wait & playtime by court count and density (This Algorithm, all session lengths & skill mixes)

| C   | Density | p95 wait (min) | Max wait (min) | Playtime spread (min) | Competitive games % |
| --- | ------- | -------------- | -------------- | --------------------- | ------------------- |
| 1   | light   | 16.1           | 17.9           | 16                    | 23                  |
| 1   | normal  | 17.2           | 21.3           | 23                    | 26                  |
| 1   | peak    | 29.9           | 33.4           | 25                    | 34                  |
| 2   | light   | 13.6           | 17.1           | 28                    | 33                  |
| 2   | normal  | 18.1           | 22.9           | 30                    | 40                  |
| 2   | peak    | 25.3           | 30.4           | 29                    | 47                  |
| 3   | light   | 13.2           | 16.7           | 28                    | 37                  |
| 3   | normal  | 17.0           | 20.9           | 30                    | 48                  |
| 3   | peak    | 24.6           | 29.2           | 31                    | 54                  |
| 4   | light   | 12.4           | 16.0           | 30                    | 40                  |
| 4   | normal  | 16.3           | 19.6           | 31                    | 52                  |
| 4   | peak    | 23.6           | 28.1           | 29                    | 59                  |

### Game quality on true skill, and mixing (v1.7 review metrics)

The roster tiers are noisy labels: the simulator gives each player a latent skill = tier + mis-rating (sd 0.7) + nightly form (sd 0.3), and scores follow that latent skill. This Algorithm learns ratings from those scores (`server/logic/ratings.js`), so its **tier**-based SD/team-diff numbers above deliberately drift from the labels; the columns below measure what players actually feel. Ratings start cold each simulated session — across sessions they improve true team balance further (≈ 21–25% from the second session, see `docs/algorithm.md`).

| C   | Density | True team diff TA / FIFO | True cohort SD TA / FIFO | Games> 2 tiers wide TA / FIFO % | Pair coverage TA / FIFO % | Cross-cohort games TA / FIFO % | Small-tier pure TA / FIFO % |
| --- | ------- | ------------------------ | ------------------------ | ------------------------------- | ------------------------- | ------------------------------ | --------------------------- |
| 1   | light   | 0.85 / 1.41              | 1.26 / 1.29              | 55 / 58                         | 100 / 100                 | 70 / 70                        | 4 / 3                       |
| 1   | normal  | 0.82 / 1.38              | 1.23 / 1.30              | 53 / 59                         | 100 / 97                  | 83 / 83                        | 4 / 3                       |
| 1   | peak    | 0.78 / 1.37              | 1.14 / 1.30              | 46 / 58                         | 92 / 83                   | 74 / 55                        | 6 / 2                       |
| 2   | light   | 0.75 / 1.33              | 1.12 / 1.28              | 45 / 57                         | 93 / 90                   | 62 / 58                        | 7 / 2                       |
| 2   | normal  | 0.69 / 1.33              | 1.01 / 1.26              | 38 / 57                         | 76 / 68                   | 67 / 58                        | 7 / 1                       |
| 2   | peak    | 0.68 / 1.32              | 0.95 / 1.26              | 31 / 58                         | 60 / 54                   | 67 / 54                        | 8 / 0                       |
| 3   | light   | 0.72 / 1.34              | 1.05 / 1.27              | 41 / 58                         | 76 / 65                   | 63 / 46                        | 7 / 1                       |
| 3   | normal  | 0.66 / 1.35              | 0.91 / 1.26              | 29 / 58                         | 58 / 49                   | 68 / 44                        | 7 / 0                       |
| 3   | peak    | 0.65 / 1.35              | 0.86 / 1.27              | 25 / 58                         | 42 / 35                   | 66 / 43                        | 7 / 0                       |
| 4   | light   | 0.72 / 1.37              | 1.01 / 1.27              | 37 / 58                         | 67 / 59                   | 63 / 44                        | 6 / 0                       |
| 4   | normal  | 0.65 / 1.37              | 0.86 / 1.29              | 25 / 60                         | 47 / 34                   | 66 / 33                        | 6 / 0                       |
| 4   | peak    | 0.64 / 1.36              | 0.81 / 1.28              | 21 / 59                         | 33 / 24                   | 64 / 27                        | 6 / 0                       |

## Plots

Rendered from `docs/sweep-cells.json` by `tests/sim/sweep-plots.mjs` (`bun tests/sim/sweep-plots.mjs`). Values are means over all session lengths and skill profiles unless noted.

![Longest wait of the session by court count and crowd density](sweep-plots/max-wait.svg)

_Fig. 1 — The single longest wait of the session. Density (crowd per court) shifts the whole level; the policy penalty (right vs left panel) stays small at every point._

![Cohort skill spread relative to FIFO](sweep-plots/cohort-sd-ratio.svg)

_Fig. 2 — Cohort skill spread, This Algorithm relative to FIFO (below 1.0 = more evenly matched groups). Dashed line: the 0.65 validation-gate threshold, reachable only with a deep bench._

![Competitive-game share, FIFO vs This Algorithm](sweep-plots/competitive.svg)

_Fig. 3 — Share of games with a balanced cohort and even teams. Every row moves right (toward competitive) under This Algorithm; the gap widens with court count._

![Latecomer back-to-back games per session](sweep-plots/latecomer-bursts.svg)

_Fig. 4 — Latecomer consecutive-game bursts per session. "Fewest games played" lets latecomers chain games until the rest limit — the effect compounds with court count — while This Algorithm holds steady._

## Findings

1. **Consistent direction.** This Algorithm cuts tier-cohort SD below FIFO in 144/144 cells (ratios 0.42–0.97), holds max wait within 1.25× FIFO in 137/144 cells (average penalty 10%), and keeps recent repeat partnerships ≤ 21.2% whenever there are ≥2 courts (vs up to 69% in the 1-court corner where quartets are nearly forced). The fairness/variance trade-off is stable across every court count, session length, crowd density, and skill mix tested.
2. **The naive-fairness trap scales with courts.** Lowest Raw Games' latecomer consecutive-game bursts are lowest on a single court but grow once 3+ courts rotate quickly (up to 30 per session at the worst cell) — raw game counts without the virtual-game offset let each latecomer monopolize courts until they hit the rest limit. This Algorithm's bursts stay far lower everywhere.
3. **Density, not court count, drives absolute waits.** Peak rosters (9 players/court) push p95/max waits up with the extra queue depth on every policy; court count mostly changes throughput. This Algorithm's wait penalty vs FIFO is stable across densities, and its playtime spread stays comparable to FIFO's while delivering several times FIFO's competitive-game share.
4. **Fixed thresholds need bench headroom, and the failures concentrate exactly there.** All-four-check pass rate: 1 court 0/36 (0%), 2+ courts 12/108 (11%); light density 0/48 (0%) vs normal/peak 12/96 (13%). With a 6–9 player roster on 1 court there is no real selection freedom — any policy must play whoever is available, so team-diff, repeat, and SD checks fail for structural reasons, not algorithmic ones. On tight skill distributions (advanced-club) FIFO's SD is already low, capping the ratio; the shipped bands (`epsSkillVar` 0.45, `epsWaitMin` 7 min) are the sweep-tuned optimum across this grid — tightening them further balances cohorts better but starts failing the team-diff check.

## Conclusion

**Methodology in brief.** The evaluation uses a discrete-event simulation of a realistic club session — check-in waves, late arrivals, voluntary breaks, early departures, match-length variation, and court turnaround — driving the production matchmaking engine directly. Every game is doubles: each court hosts exactly 4 players at a time, and the roster (6–36 players depending on scenario) rotates through those fixed 4-per-court slots. We compared 144 scenarios (1–4 courts, 2–4 hour sessions, three crowd densities, four skill distributions), replaying each identical evening through every policy so that the matchmaking rule is the only differing variable (common random numbers). That amounts to roughly 160,000 simulated games per policy, large enough that the patterns reported here are systematic rather than luck.

**The policies compared.** _FIFO_ sends the four longest-waiting players to court. _Lowest Raw Games_ sends the four with the fewest games played — the intuitive "fairness" rule. **This Algorithm** is a two-stage selector: it first restricts candidates to players who are due to play (enough rest, participation kept level across the session, with a safeguard that no one is skipped indefinitely), then chooses the grouping that minimizes skill spread within each group and between the two teams, while avoiding recent repeat partnerships. Crucially, it is allowed to trade a few minutes of one player's wait for a substantially better-matched game — the tolerance bands that make this trade are the study's subject.

**Findings.** Three results hold in every scenario tested:

1. _The trade is cheap._ Average and 95th-percentile waits stay close to FIFO's; the single worst wait of the session grows by 10% on average and stays within 1.25× FIFO in 137 of the 144 scenarios. The club buys better games for everyone at the price of a few extra minutes for its unluckiest waiter that evening.
2. _Better games, consistently._ On true skill, team-vs-team imbalance is 47% lower than FIFO's and within-group spread 20% lower; games spanning more than 2 tiers fall to 37% (FIFO 58%), and recent repeat partnerships stay rare whenever at least two courts are running. Court-time equality is preserved: playtime spread is comparable to FIFO's.
3. _Naive fairness backfires._ "Fewest games played" looks fair but, without the virtual-game correction for late arrivals, it lets each newcomer chain games back-to-back until the rest limit catches them — the effect compounds with court count (double-digit monopolized slots per session at 3–4 courts). This Algorithm's latecomer bursts stay several times lower everywhere.

**Where the guarantees weaken.** With a single court and only 1–2 substitutes waiting (rosters of 6–9, given the fixed 4 players per game), any policy must play whoever is available, so no selector can demonstrate an advantage — the checks that fail there fail structurally, not because of the algorithm. On tight skill distributions the _relative_ improvement shrinks because FIFO is already balanced; the algorithm matches it rather than beating it.

**Limitations.** Latent skill and the score model are parametric assumptions (tier ± 0.7 mis-rating, ± 0.3 nightly form, margin ∝ team-rating gap), ratings start cold in every simulated session, game durations follow plausible parametric assumptions rather than measured club data, and no-show/no-rally effects are out of scope. The conclusions therefore concern the _relative_ comparison between policies under identical conditions, which the paired design supports strongly; absolute minute-level numbers should be read as indicative.

**Recommendation.** For normal operation with two or more courts and roughly fifteen or more players, This Algorithm delivers materially better-matched games and fairer participation at a negligible wait cost, and is clearly preferable to both baselines. For very small single-court sessions the choice of policy is immaterial.

_144 cells, 159,680 games per policy, 244s wall-clock._
