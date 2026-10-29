// Focused before/after evaluation for matcher changes (faster than the full
// sweep): C=2–3, normal/peak density, 180 min, all four skill profiles, plus the
// fixed-cohort 16-player / 2-court case. `bun tests/sim/algo-eval.mjs`
import { generateScenario, runSession } from "./benchmark-sim.mjs";

const SEEDS = Number(process.env.SEEDS ?? 30);
const PROFILES = [
  ["club-balanced", 5.5, 2.1],
  ["beginner-heavy", 3.8, 1.6],
  ["advanced-club", 6.3, 1.2],
  ["wide-mix", 5.0, 2.9],
];
const CASES = [];
for (const nCourts of [2, 3])
  for (const [dens, per] of [
    ["normal", 22 / 3],
    ["peak", 9],
  ])
    for (const [name, m, sd] of PROFILES)
      CASES.push({
        label: `C${nCourts} ${dens} ${name}`,
        opts: { nCourts, sessionMins: 180, skillMean: m, skillSd: sd, playersPerCourt: per },
      });
// the review's phase-lock case: exactly 16 players, 2 courts, everyone on time
CASES.push({
  label: "16p/2c on-time",
  opts: { nCourts: 2, sessionMins: 180, skillMean: 5.5, skillSd: 2.1, playersPerCourt: 8 },
  onTime: true,
  key: "lock",
});
// same, with near-identical game lengths (14 ± 0.5 min) — where phase-lock bites
CASES.push({
  label: "16p/2c tight",
  opts: { nCourts: 2, sessionMins: 180, skillMean: 5.5, skillSd: 2.1, playersPerCourt: 8 },
  onTime: true,
  tight: true,
  key: "tight",
});

const F = [
  "total_games",
  "p95_wait_mins",
  "max_wait_mins",
  "play_spread_mins",
  "mean_cohort_sd",
  "mean_team_diff",
  "repeat_recent_pct",
  "pair_coverage_pct",
  "cross_cohort_pct",
  "wide_range_pct",
  "small_tier_pure_pct",
  "idle_court_mins",
];
const mean = (xs) => xs.reduce((s, x) => s + x, 0) / xs.length;
const totals = Object.fromEntries(F.map((f) => [f, []]));
const special = { lock: {}, tight: {} };
for (const c of CASES) {
  const acc = Object.fromEntries(F.map((f) => [f, []]));
  for (let seed = 0; seed < SEEDS; seed++) {
    const scen = generateScenario(seed, c.opts);
    if (c.tight) {
      scen.durations = scen.durations.map((_, i) => 14 + ((i * 7919) % 100) / 100 - 0.5);
      scen.lags = (scen.lags ?? []).map(() => 0.5);
      scen.restDraws = [];
    }
    if (c.onTime) {
      scen.arrivals = scen.arrivals.map(() => 0);
      scen.departures = scen.departures.map(() => Infinity);
    }
    const r = runSession(scen, "EPSILON_LEX", process.env.CFG ? JSON.parse(process.env.CFG) : {});
    for (const f of F) acc[f].push(r[f]);
  }
  for (const f of F) c.key ? (special[c.key][f] = mean(acc[f])) : totals[f].push(mean(acc[f]));
}
const fmt = (o) =>
  F.map((f) => `${f}=${o[f].toFixed(f === "mean_cohort_sd" || f === "mean_team_diff" ? 2 : 1)}`).join("  ");
console.log("grid mean :", fmt(Object.fromEntries(F.map((f) => [f, mean(totals[f])]))));
console.log("16p/2c    :", fmt(special.lock));
console.log("16p tight :", fmt(special.tight));
