// DES simulation validation & realistic club benchmark for the ε-lexicographic
// doubles matcher (server/logic/smartQueue.js planBatch).
//
// Drives the PRODUCTION engine (planBatch + timestamped consecutiveCounts +
// last_played_at sit-out tracking) across Monte Carlo Common Random Number (CRN)
// seeds and compares 4 policies:
//   - FIFO              (top-4 by wait time)
//   - LOWEST_RAW_GAMES  (top-4 by fewest raw games played — naive fairness)
//   - STRICT_LEX        (all ε = 0, no tolerance bands)
//   - EPSILON_LEX       ("This Algorithm": production ε-lexicographic + Hard Anchor)
//
// Realistic club dynamics modeled:
//   1. Court-scaled crowd density (playersPerCourt × nCourts, or explicit nPlayers)
//   2. Staggered arrival waves, mid-session voluntary rest breaks (8–16 min),
//      and early departures in the final 35 minutes
//   3. Game durations with court changeover/turnaround lag + skill/balance effects
//   4. Simultaneous multi-court batching (courtCount = freeCourts.length) and
//      On-Deck Slate staging
//
// Run: bun tests/sim/benchmark-sim.mjs   (or `bun run test:sim` from tests/)

import { consecutiveCounts, MATCH_CONFIG, planBatch } from "../../server/logic/smartQueue.js";

// ---------- RNG (mulberry32 + Box-Muller) ----------

function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function makeNormals(rng) {
  let spare = null;
  return () => {
    if (spare !== null) {
      const v = spare;
      spare = null;
      return v;
    }
    let u = 0;
    while (u === 0) u = rng();
    const r = Math.sqrt(-2 * Math.log(u));
    const th = 2 * Math.PI * rng();
    spare = r * Math.sin(th);
    return r * Math.cos(th);
  };
}

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

// A partnership re-formed within this many games counts as a RECENT repeat (gate 4b).
const RECENT_GAMES = 6;

const TIERS = [
  "newbie",
  "beginner",
  "lower_intermediate",
  "intermediate",
  "upper_intermediate",
  "expert",
  "professional",
];

// ---------- Scenario generator ----------

export function generateScenario(
  seed,
  {
    nCourts = 3,
    playersPerCourt = null,
    nPlayers = playersPerCourt != null ? Math.round(nCourts * playersPerCourt) : 22,
    nLate = Math.round(0.27 * nPlayers),
    sessionMins = 180,
    skillMean = 5.5,
    skillSd = 2.1,
    realistic = true,
  } = {},
) {
  const rng = mulberry32(seed);
  const normal = makeNormals(rng);

  const skillTiers = new Array(nPlayers);
  for (let i = 0; i < nPlayers; i++) {
    skillTiers[i] = Math.round(clamp(clamp(skillMean + skillSd * normal(), 1.5, 9.5), 1, 7));
  }

  // Arrivals: on-time wave + staggered late wave (15..min(75, 0.45*sessionMins) min)
  const arrivals = new Array(nPlayers).fill(0);
  const lateSpan = Math.max(20, Math.min(60, 0.45 * sessionMins - 15));
  const late = [];
  for (let i = 0; i < nLate; i++) late.push(15 + lateSpan * rng());
  late.sort((a, b) => a - b);
  for (let i = 0; i < nLate; i++) arrivals[nPlayers - nLate + i] = late[i];

  // Pre-sampled base rally durations + court changeover/turnaround lag
  const durations = [];
  const lags = [];
  for (let i = 0; i < 600; i++) {
    durations.push(clamp(13.8 + 2.1 * normal(), 8.5, 20.5));
    lags.push(realistic ? 0.5 + 0.8 * rng() : 0);
  }

  // Pre-sampled voluntary rest breaks (CRN-indexed by player & game number)
  // and early departures in the final 30 minutes of the session
  const restDraws = Array.from({ length: nPlayers }, () =>
    Array.from({ length: 30 }, () => ({
      takeRest: realistic && rng() < 0.06,
      restMins: 8 + 7 * rng(),
    })),
  );

  const departures = new Array(nPlayers).fill(Infinity);
  if (realistic && sessionMins >= 120) {
    const nEarlyLeave = Math.max(1, Math.floor(0.12 * (nPlayers - nLate)));
    for (let i = 0; i < nEarlyLeave; i++) {
      // Pick from on-time players so latecomers don't immediately leave
      departures[i] = sessionMins - 30 + 20 * rng();
    }
  }

  return {
    nPlayers,
    nLate,
    nCourts,
    sessionMins,
    skillTiers,
    arrivals,
    durations,
    lags,
    restDraws,
    departures,
    realistic,
  };
}

// ---------- Min-heap event queue: (t, priority, seq, payload) ----------

class Heap {
  constructor() {
    this.a = [];
  }
  push(item) {
    const a = this.a;
    a.push(item);
    let i = a.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (this.lt(a[i], a[p])) {
        [a[i], a[p]] = [a[p], a[i]];
        i = p;
      } else break;
    }
  }
  pop() {
    const a = this.a;
    const top = a[0];
    const last = a.pop();
    if (a.length) {
      a[0] = last;
      let i = 0;
      for (;;) {
        const l = 2 * i + 1;
        const r = l + 1;
        let m = i;
        if (l < a.length && this.lt(a[l], a[m])) m = l;
        if (r < a.length && this.lt(a[r], a[m])) m = r;
        if (m === i) break;
        [a[i], a[m]] = [a[m], a[i]];
        i = m;
      }
    }
    return top;
  }
  get size() {
    return this.a.length;
  }
  lt(x, y) {
    return x[0] < y[0] || (x[0] === y[0] && (x[1] < y[1] || (x[1] === y[1] && x[2] < y[2])));
  }
}

// ---------- Stats helpers ----------

const mean = (xs) => (xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : 0);
function sd(xs) {
  if (xs.length < 2) return 0;
  const m = mean(xs);
  return Math.sqrt(mean(xs.map((x) => (x - m) ** 2)));
}
function se(xs) {
  if (xs.length < 2) return 0;
  return sd(xs) / Math.sqrt(xs.length);
}
function median(xs) {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const n = s.length;
  return n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2;
}
function percentile(xs, p) {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const idx = Math.min(s.length - 1, Math.max(0, Math.floor((p / 100) * (s.length - 1))));
  return s[idx];
}
const weakLink = (a, b, tiers) => {
  const lo = Math.min(tiers[a], tiers[b]);
  const hi = Math.max(tiers[a], tiers[b]);
  return MATCH_CONFIG.weakLinkW * lo + (1 - MATCH_CONFIG.weakLinkW) * hi;
};

// STRICT_LEX = full engine with every tolerance band zeroed (doc §2).
const LEX_ZERO = {
  anchorTopWaiter: false,
  minBenchWait: 0,
  epsWaitRatio: 0,
  epsWaitMin: 0,
  epsVirtGames: 0,
  epsSkillVar: 0,
  epsTeamDiff: 0,
};

// ---------- One DES session ----------
// Event types (ordered by priority at same timestamp):
//   0: PLAYER_ARRIVAL / REST_END
//   1: GAME_END
//   2: PLAYER_DEPARTURE
//   3: TRY_ASSIGN_COURTS

export function runSession(scenario, policy, cfg = {}) {
  const {
    skillTiers,
    arrivals,
    durations,
    lags = [],
    restDraws = [],
    departures = [],
    realistic = true,
  } = scenario;
  const N = scenario.nPlayers;
  const SESSION_MINS = scenario.sessionMins;
  const MAX_CONSEC = MATCH_CONFIG.maxConsecutive;

  const checkedIn = new Array(N).fill(false);
  const departed = new Array(N).fill(false);
  const resting = new Array(N).fill(false);
  const onCourt = new Array(N).fill(false);
  const raw = new Array(N).fill(0);
  const offset = new Array(N).fill(0); // virt_offset, set at late check-in
  const wait = new Array(N).fill(0);
  const lastPlayedAt = new Array(N).fill(null); // minutes
  const playMins = new Array(N).fill(0);
  const virt = (i) => raw[i] + offset[i];
  const Praw = new Int32Array(N * N);
  const history = []; // ended matches, oldest→newest: {team1:[a,b], team2:[c,d], started_at, ended_at}

  const events = new Heap();
  let seq = 0;
  for (let p = 0; p < N; p++) {
    events.push([arrivals[p], 0, seq++, { kind: "arrival", player: p }]);
    if (departures[p] != null && Number.isFinite(departures[p])) {
      events.push([departures[p], 2, seq++, p]);
    }
  }
  const freeCourts = Array.from({ length: scenario.nCourts }, (_, i) => i);
  let tPrev = 0;
  let gameCounter = 0;

  // Telemetry accumulators
  const waitSamples = [];
  const cohortSds = [];
  const teamDiffs = [];
  const solveUs = [];
  let competitiveGames = 0;
  let bypassEvents = 0;
  let repeatPartnerEvents = 0;
  let recentRepeatEvents = 0;
  let novelCohorts = 0; // quartets whose 6-pair co-play sum < 1.0 at selection (v1.2 mixing telemetry)
  const lastCoplayGame = new Map(); // all-pairs (not just partners) → gameCounter
  let consecViolations = 0;
  let latecomerBursts = 0;
  const lastPairGame = new Map();
  // v1.7 algorithm-review metrics
  const coplayPairs = new Set();
  let crossCohortGames = 0;
  let wideRangeGames = 0;
  let smallTierGames = 0;
  let smallTierPure = 0;
  let idleCourtMins = 0;
  const lastEndAt = new Array(N).fill(null); // minutes; null = never played
  const tierSize = new Map();
  for (let i = 0; i < N; i++) tierSize.set(skillTiers[i], (tierSize.get(skillTiers[i]) ?? 0) + 1);
  const SMALL_TIER = 8;
  const skillOf = new Map(skillTiers.map((t, i) => [i, TIERS[t - 1]]));

  while (events.size) {
    const [t, evType, , payload] = events.pop();
    if (t > SESSION_MINS && evType !== 1) continue;

    // Continuous wait integration for active waiting bench players
    const dt = t - tPrev;
    if (dt > 0 && tPrev <= SESSION_MINS) {
      // idle court-minutes: a court sat free while ≥4 players could have used it
      let free = 0;
      for (let i = 0; i < N; i++) if (checkedIn[i] && !departed[i] && !onCourt[i] && !resting[i]) free++;
      idleCourtMins += Math.min(freeCourts.length, Math.floor(free / 4)) * Math.min(dt, SESSION_MINS - tPrev);
    }
    if (dt > 0) {
      for (let i = 0; i < N; i++) {
        if (checkedIn[i] && !departed[i] && !onCourt[i] && !resting[i]) {
          wait[i] += dt;
        }
      }
    }
    tPrev = t;

    if (evType === 0) {
      if (payload.kind === "arrival") {
        const p = payload.player;
        if (departed[p]) continue;
        checkedIn[p] = true;
        wait[p] = 0;
        lastPlayedAt[p] = t;
        if (t > 0) {
          const others = [];
          for (let i = 0; i < N; i++) {
            if (checkedIn[i] && !departed[i] && i !== p) others.push(virt(i));
          }
          if (others.length) offset[p] = median(others);
        }
      } else if (payload.kind === "rest_end") {
        const p = payload.player;
        if (departed[p]) continue;
        resting[p] = false;
        lastPlayedAt[p] = t - wait[p];
      }
      events.push([t, 3, seq++, null]);
    } else if (evType === 1) {
      // GAME_END
      const { court, quartet, startedAt, playDuration } = payload;
      for (const p of quartet) {
        onCourt[p] = false;
        wait[p] = 0;
        lastPlayedAt[p] = t;
        lastEndAt[p] = t;
        playMins[p] += playDuration;
        if (t >= (departures[p] ?? Infinity)) {
          departed[p] = true;
          checkedIn[p] = false;
          continue;
        }
        // Check voluntary rest break after ≥ 2 games played
        const draw = restDraws[p]?.[raw[p]];
        if (draw?.takeRest && t + draw.restMins < SESSION_MINS - 15) {
          resting[p] = true;
          events.push([t + draw.restMins, 0, seq++, { kind: "rest_end", player: p }]);
        }
      }
      history.push({
        team1: [quartet[0], quartet[1]],
        team2: [quartet[2], quartet[3]],
        started_at: Math.round(startedAt * 60),
        ended_at: Math.round(t * 60),
      });
      freeCourts.push(court);
      if (t <= SESSION_MINS) events.push([t, 3, seq++, null]);
    } else if (evType === 2) {
      // PLAYER_DEPARTURE (if off-court, leaves immediately; if on-court, leaves at GAME_END)
      const p = payload;
      if (!onCourt[p]) {
        departed[p] = true;
        checkedIn[p] = false;
        resting[p] = false;
      }
    } else {
      // TRY_ASSIGN_COURTS
      if (!freeCourts.length || t > SESSION_MINS) continue;
      const nowSec = Math.round(t * 60);
      const streak = consecutiveCounts(history, nowSec);

      while (freeCourts.length && t <= SESSION_MINS) {
        const avail = [];
        for (let i = 0; i < N; i++) {
          if (checkedIn[i] && !departed[i] && !onCourt[i] && !resting[i]) avail.push(i);
        }
        if (avail.length < 4) break;

        // True spec check: a 3rd-straight assignment is a violation only while
        // ≥4 genuinely fresh players were available. Relaxing when the whole
        // available pool just played 2 straight is the graceful path (the
        // alternative is idle courts), not a violation.
        const freshCount = avail.filter((i) => (streak.get(i) ?? 0) < MAX_CONSEC).length;

        const t0 = performance.now();
        let assignedQuartets = [];
        let relaxed = false;

        if (policy === "FIFO" || policy === "LOWEST_RAW_GAMES") {
          let elig = avail.filter((i) => (streak.get(i) ?? 0) < MAX_CONSEC);
          if (elig.length < 4) {
            relaxed = true;
            elig = [...avail].sort((a, b) => (streak.get(a) ?? 0) - (streak.get(b) ?? 0)).slice(0, 4);
          }
          if (policy === "FIFO") {
            elig.sort((a, b) => wait[b] - wait[a] || virt(a) - virt(b));
          } else {
            elig.sort((a, b) => raw[a] - raw[b] || wait[b] - wait[a]);
          }
          const chosen = elig.slice(0, 4);
          if (policy === "LOWEST_RAW_GAMES") {
            const splits = [
              [
                [0, 1],
                [2, 3],
              ],
              [
                [0, 2],
                [1, 3],
              ],
              [
                [0, 3],
                [1, 2],
              ],
            ];
            let best = splits[0];
            let bestDiff = Infinity;
            for (const sp of splits) {
              const diff = Math.abs(
                weakLink(chosen[sp[0][0]], chosen[sp[0][1]], skillTiers) -
                  weakLink(chosen[sp[1][0]], chosen[sp[1][1]], skillTiers),
              );
              if (diff < bestDiff) {
                bestDiff = diff;
                best = sp;
              }
            }
            assignedQuartets.push([
              chosen[best[0][0]],
              chosen[best[0][1]],
              chosen[best[1][0]],
              chosen[best[1][1]],
            ]);
          } else {
            assignedQuartets.push(chosen);
          }
        } else {
          // STRICT_LEX / EPSILON_LEX — drive the production engine.
          // When multiple courts are open simultaneously and realistic batching is on,
          // dispatch up to freeCourts.length courts in one joint batch.
          const batchCount = realistic ? Math.min(freeCourts.length, Math.floor(avail.length / 4)) : 1;
          const entries = avail.map((i) => ({
            id: i,
            status: "waiting",
            skill_level: TIERS[skillTiers[i] - 1],
            checked_in_at: Math.round(arrivals[i] * 60),
            last_played_at: Math.round((t - wait[i]) * 60),
            games_played: raw[i],
            virt_offset: offset[i],
          }));
          const res = planBatch({
            waiting: entries,
            history,
            skillOf,
            courtCount: Math.max(1, batchCount),
            now: nowSec,
            cfg: policy === "STRICT_LEX" ? LEX_ZERO : cfg,
          });
          if (res.matches.length) {
            assignedQuartets = res.matches.map((m) => [...m.team1, ...m.team2]);
            relaxed = res.relaxed;
          }
        }
        const batchSolveUs = (performance.now() - t0) * 1000;
        if (!assignedQuartets.length) break;
        const perMatchUs = batchSolveUs / assignedQuartets.length;

        for (const quartet of assignedQuartets) {
          if (!freeCourts.length) break;
          solveUs.push(perMatchUs);

          // Recompute available eligible pool for bypass telemetry
          const curAvail = [];
          for (let i = 0; i < N; i++) {
            if (checkedIn[i] && !departed[i] && !onCourt[i] && !resting[i]) curAvail.push(i);
          }
          const eligPool = curAvail.filter((i) => (streak.get(i) ?? 0) < MAX_CONSEC);
          if (eligPool.length >= 4) {
            const medWait = median(eligPool.map((i) => wait[i]));
            for (const p of eligPool) {
              if (!quartet.includes(p) && wait[p] > Math.max(10, 1.5 * medWait)) {
                bypassEvents++;
                break;
              }
            }
          }
          for (const p of quartet) {
            if ((streak.get(p) ?? 0) >= MAX_CONSEC && freshCount >= 4) {
              consecViolations++;
              break;
            }
          }
          for (const p of quartet) waitSamples.push(wait[p]);

          // Cohort SD + weak-link team diff
          const qs = quartet.map((p) => skillTiers[p]);
          const qm = mean(qs);
          const cSd = Math.sqrt(mean(qs.map((v) => (v - qm) ** 2)));
          const tDiff = Math.abs(
            weakLink(quartet[0], quartet[1], skillTiers) - weakLink(quartet[2], quartet[3], skillTiers),
          );
          cohortSds.push(cSd);
          teamDiffs.push(tDiff);
          if (cSd <= 1.0 && tDiff <= 0.5) competitiveGames++;

          const gapOf = (pair) => gameCounter - (lastPairGame.get(pair) ?? -Infinity);
          const gap = Math.min(gapOf(quartet[0] * N + quartet[1]), gapOf(quartet[2] * N + quartet[3]));
          if (Praw[quartet[0] * N + quartet[1]] > 0 || Praw[quartet[2] * N + quartet[3]] > 0) {
            repeatPartnerEvents++;
            if (gap <= RECENT_GAMES) recentRepeatEvents++;
          }

          // Cohort-overlap telemetry: f0 = Σ of the 6 pair co-play values,
          // γ-decayed per game since (mirrors buildS). f0 < 1.0 ⇒ not all four
          // have shared a recent round — a "fresh cohort".
          let f0 = 0;
          for (let a = 0; a < 4; a++) {
            for (let b = a + 1; b < 4; b++) {
              const g = lastCoplayGame.get(quartet[a] * N + quartet[b]);
              if (g !== undefined) f0 += 0.85 ** (gameCounter - g); // γ = MATCH_CONFIG.gammaDecay
            }
          }
          if (f0 < 1.0) novelCohorts++;

          // cohort mixing: players whose last games ended > 3 min apart come
          // from different rotation cohorts (never-played players are neutral)
          const ends = quartet.map((p) => lastEndAt[p]).filter((x) => x != null);
          if (ends.length >= 2 && Math.max(...ends) - Math.min(...ends) > 3) crossCohortGames++;
          if (Math.max(...qs) - Math.min(...qs) > 2) wideRangeGames++;
          if (quartet.some((p) => tierSize.get(skillTiers[p]) < SMALL_TIER)) {
            smallTierGames++;
            if (qs.every((v) => v === qs[0])) smallTierPure++;
          }
          for (let a = 0; a < 4; a++)
            for (let b = a + 1; b < 4; b++)
              coplayPairs.add(Math.min(quartet[a], quartet[b]) * N + Math.max(quartet[a], quartet[b]));

          for (const p of quartet) {
            onCourt[p] = true;
            wait[p] = 0;
            raw[p] += 1;
            if (arrivals[p] > 0 && (streak.get(p) ?? 0) + 1 >= 2) latecomerBursts++;
          }
          Praw[quartet[0] * N + quartet[1]]++;
          Praw[quartet[1] * N + quartet[0]]++;
          Praw[quartet[2] * N + quartet[3]]++;
          Praw[quartet[3] * N + quartet[2]]++;
          lastPairGame.set(quartet[0] * N + quartet[1], gameCounter);
          lastPairGame.set(quartet[1] * N + quartet[0], gameCounter);
          lastPairGame.set(quartet[2] * N + quartet[3], gameCounter);
          lastPairGame.set(quartet[3] * N + quartet[2], gameCounter);
          for (let a = 0; a < 4; a++) {
            for (let b = a + 1; b < 4; b++) {
              lastCoplayGame.set(quartet[a] * N + quartet[b], gameCounter);
              lastCoplayGame.set(quartet[b] * N + quartet[a], gameCounter);
            }
          }

          const idx = gameCounter++;
          const baseDur = durations[idx % durations.length];
          const lag = lags[idx % Math.max(1, lags.length)] ?? 0;
          // Balanced, higher-skill rallies run slightly longer than lopsided blowouts
          const balanceAdj = realistic ? 0.12 * (qm - 4) - 0.2 * Math.max(0, tDiff - 0.75) : 0;
          const playDuration = clamp(baseDur + balanceAdj, 8.5, 21.0);
          const court = freeCourts.shift();
          events.push([t + playDuration + lag, 1, seq++, { court, quartet, startedAt: t, playDuration }]);
        }
      }
    }
  }

  const virtAll = [];
  const fullSessionPlay = [];
  for (let i = 0; i < N; i++) {
    virtAll.push(virt(i));
    if (arrivals[i] === 0 && !Number.isFinite(departures[i])) {
      fullSessionPlay.push(playMins[i]);
    }
  }
  const playPool = fullSessionPlay.length ? fullSessionPlay : playMins;
  const nGames = Math.max(1, gameCounter);
  return {
    policy,
    total_games: gameCounter,
    avg_wait_mins: mean(waitSamples),
    p95_wait_mins: percentile(waitSamples, 95),
    max_wait_mins: waitSamples.length ? Math.max(...waitSamples) : 0,
    avg_play_mins: mean(playPool),
    play_spread_mins: playPool.length ? Math.max(...playPool) - Math.min(...playPool) : 0,
    competitive_game_pct: (100 * competitiveGames) / nGames,
    bypass_rate_pct: (100 * bypassEvents) / nGames,
    virt_game_spread: Math.max(...virtAll) - Math.min(...virtAll),
    latecomer_consec_bursts: latecomerBursts,
    consec_violations: consecViolations,
    mean_cohort_sd: mean(cohortSds),
    mean_team_diff: mean(teamDiffs),
    repeat_partner_pct: (100 * repeatPartnerEvents) / nGames,
    repeat_recent_pct: (100 * recentRepeatEvents) / nGames,
    novel_cohorts_pct: (100 * novelCohorts) / nGames,
    pair_coverage_pct: (100 * coplayPairs.size) / Math.max(1, (N * (N - 1)) / 2),
    cross_cohort_pct: (100 * crossCohortGames) / nGames,
    wide_range_pct: (100 * wideRangeGames) / nGames,
    small_tier_pure_pct: smallTierGames ? (100 * smallTierPure) / smallTierGames : 0,
    idle_court_mins: idleCourtMins,
    solve_time_us: mean(solveUs),
  };
}

// ---------- Monte Carlo driver (validation run; `bun tests/sim/benchmark-sim.mjs`) ----------

if (import.meta.main) {
  const POLICIES = ["FIFO", "LOWEST_RAW_GAMES", "STRICT_LEX", "EPSILON_LEX"];
  const N_SEEDS = 100;
  const GATE_SEEDS = N_SEEDS; // full sample: gates are mean-based, more seeds = tighter estimate

  console.log(
    `Running ${N_SEEDS} seeds × ${POLICIES.length} policies (N=22, C=3, T=180min, realistic club dynamics)...`,
  );
  const tStart = performance.now();

  const runs = [];
  for (let seed = 0; seed < N_SEEDS; seed++) {
    const scen = generateScenario(seed);
    const byPolicy = {};
    for (const p of POLICIES) byPolicy[p] = runSession(scen, p);
    runs.push(byPolicy);
  }

  console.log(`Done in ${((performance.now() - tStart) / 1000).toFixed(1)}s\n`);

  // ---------- Comparison table (mean ± se) ----------

  const METRICS = [
    ["total_games", "Games / session"],
    ["avg_wait_mins", "Avg wait (min)"],
    ["p95_wait_mins", "p95 wait (min)"],
    ["max_wait_mins", "Max wait (min)"],
    ["avg_play_mins", "Avg play time (min)"],
    ["play_spread_mins", "Playtime spread (min)"],
    ["competitive_game_pct", "Competitive games (%)"],
    ["bypass_rate_pct", "Bypass rate (%)"],
    ["virt_game_spread", "Virt-game spread"],
    ["latecomer_consec_bursts", "Latecomer bursts"],
    ["consec_violations", "Consec violations"],
    ["mean_cohort_sd", "Cohort skill SD"],
    ["mean_team_diff", "Team diff (F4)"],
    ["repeat_partner_pct", "Repeat partners (%)"],
    ["repeat_recent_pct", "Repeat ≤6 games (%)"],
    ["solve_time_us", "Solve time (µs)"],
  ];

  const w = 16;
  const header = ["Metric".padEnd(24), ...POLICIES.map((p) => p.slice(0, w - 1).padEnd(w))].join("");
  console.log(header);
  console.log("-".repeat(header.length));
  for (const [key, label] of METRICS) {
    const cells = POLICIES.map((p) => {
      const xs = runs.map((r) => r[p][key]);
      const m = mean(xs);
      const d =
        key === "consec_violations" || key === "total_games" || key === "latecomer_consec_bursts"
          ? m.toFixed(1)
          : `${m.toFixed(2)}±${se(xs).toFixed(2)}`;
      return d.padEnd(w);
    });
    console.log(label.padEnd(24) + cells.join(""));
  }
  console.log();

  // ---------- Acceptance gates (doc §5, seeds 0..49) ----------

  const gateRuns = runs.slice(0, GATE_SEEDS);
  const lex = gateRuns.map((r) => r.EPSILON_LEX);
  const fifo = gateRuns.map((r) => r.FIFO);
  const meanOf = (rs, k) => mean(rs.map((r) => r[k]));

  const gates = [
    [
      "Gate 1: zero true consec violations (streak-capped player assigned while ≥4 fresh available)",
      lex.reduce((s, r) => s + r.consec_violations, 0) === 0,
      `total=${lex.reduce((s, r) => s + r.consec_violations, 0)}`,
    ],
    [
      "Gate 2: max wait ≤ 1.25× FIFO",
      meanOf(lex, "max_wait_mins") <= 1.25 * meanOf(fifo, "max_wait_mins"),
      `${meanOf(lex, "max_wait_mins").toFixed(2)} vs limit ${(1.25 * meanOf(fifo, "max_wait_mins")).toFixed(2)} (FIFO ${meanOf(fifo, "max_wait_mins").toFixed(2)})`,
    ],
    [
      "Gate 3: cohort SD ≤ 0.65× FIFO",
      meanOf(lex, "mean_cohort_sd") <= 0.65 * meanOf(fifo, "mean_cohort_sd"),
      `${meanOf(lex, "mean_cohort_sd").toFixed(3)} vs limit ${(0.65 * meanOf(fifo, "mean_cohort_sd")).toFixed(3)} (FIFO ${meanOf(fifo, "mean_cohort_sd").toFixed(3)})`,
    ],
    [
      // 0.45 per the user-ruled v1.2 trade-off: cohort mixing widens avg team gap ~8%
      // (docs/algorithm.md §cascade); validated on the 100-seed overlap sweep.
      "Gate 4a: mean team diff ≤ 0.45",
      meanOf(lex, "mean_team_diff") <= 0.45,
      `${meanOf(lex, "mean_team_diff").toFixed(3)}`,
    ],
    [
      "Gate 4b: recent repeats (≤6 games) < 10%",
      meanOf(lex, "repeat_recent_pct") < 10,
      `${meanOf(lex, "repeat_recent_pct").toFixed(2)}% (raw lifetime: ${meanOf(lex, "repeat_partner_pct").toFixed(2)}%)`,
    ],
  ];

  let failed = 0;
  for (const [name, pass, detail] of gates) {
    console.log(`${pass ? "PASS" : "FAIL"}  ${name}  (${detail})`);
    if (!pass) failed++;
  }
  if (failed) {
    console.error(`\n${failed} gate(s) failed`);
    process.exit(1);
  }
  console.log("\nAll acceptance gates passed.");
}
