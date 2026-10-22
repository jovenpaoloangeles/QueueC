// ε-parameter sweep over the benchmark DES harness (Common Random Numbers).
//
//   bun tests/sim/epsilon-sweep.mjs
//
// Sweeps the two Stage-A tolerance knobs independently (their interaction is
// weak — the wait window gates *who* Stage A may consider, ε₃ gates *how*
// tightly cohorts must match):
//   epsSkillVar (ε₃, skill² on the 1–7 scale) — cohort balance vs packing freedom
//   epsWaitMin  (ε₁ floor, min)              — candidate-window width vs wait fairness
//
// Objective: among configs passing ALL acceptance gates (validation doc §5),
// minimize cohort SD ratio vs FIFO; ties broken by lower max-wait ratio.
// Deterministic: mulberry32 CRN — every config replays the same players,
// arrivals, breaks, and durations. Run twice → identical output (except the
// wall-clock footer).

import { generateScenario, runSession } from "./benchmark-sim.mjs";

const SEEDS = Number(process.env.SWEEP_SEEDS ?? 40); // CRN: same scenarios replayed for every config
const EPS_SKILL_GRID = [0.3, 0.45, 0.6, 0.75, 0.9, 1.05, 1.2, 1.5, 2.0];
const EPS_WAIT_GRID = [2.5, 3.5, 5.0, 7.0];
// v1.2 cohort-overlap sweep (`bun tests/sim/epsilon-sweep.mjs --overlap`):
// ε₀ grid with the v1.1 winners (ε₃=0.45, ε₁=7.0) held fixed. The team-diff
// gate runs at 0.45 here — user-ruled trade-off: mixing widens avg team skill
// gap ~8% (see docs/algorithm.md §cascade).
const EPS_OVERLAP_GRID = [0.75, 1, 1.25, 1.5, 1.75, 2, 2.25, 2.5, 3, 4, 6, 1e9];
const OVERLAP_MODE = process.argv.includes("--overlap");
const TEAM_DIFF_GATE = OVERLAP_MODE ? 0.45 : 0.4;

const mean = (xs) => xs.reduce((s, x) => s + x, 0) / xs.length;

// FIFO baseline is ε-independent — run it once.
console.error(`FIFO baseline: ${SEEDS} seeds...`);
const fifoRuns = [];
for (let seed = 0; seed < SEEDS; seed++) fifoRuns.push(runSession(generateScenario(seed), "FIFO"));
const fifo = {
  max_wait: mean(fifoRuns.map((r) => r.max_wait_mins)),
  cohort_sd: mean(fifoRuns.map((r) => r.mean_cohort_sd)),
};

const configs = [];
if (OVERLAP_MODE) {
  for (const epsOverlap of EPS_OVERLAP_GRID) configs.push({ epsSkillVar: 0.45, epsWaitMin: 7.0, epsOverlap });
} else {
  for (const epsSkillVar of EPS_SKILL_GRID) {
    for (const epsWaitMin of EPS_WAIT_GRID) configs.push({ epsSkillVar, epsWaitMin });
  }
}

console.error(`Sweeping ${configs.length} configs × ${SEEDS} seeds...`);
const tStart = performance.now();
const results = [];
let done = 0;
for (const cfg of configs) {
  const runs = [];
  for (let seed = 0; seed < SEEDS; seed++) {
    runs.push(runSession(generateScenario(seed), "EPSILON_LEX", cfg));
  }
  const m = (k) => mean(runs.map((r) => r[k]));
  const maxWaitRatio = m("max_wait_mins") / fifo.max_wait;
  const sdRatio = m("mean_cohort_sd") / fifo.cohort_sd;
  const gates = [
    runs.reduce((s, r) => s + r.consec_violations, 0) === 0,
    maxWaitRatio <= 1.25,
    sdRatio <= 0.65,
    m("mean_team_diff") <= TEAM_DIFF_GATE,
    m("repeat_recent_pct") < 10,
  ];
  results.push({
    cfg,
    max_wait_ratio: maxWaitRatio,
    sd_ratio: sdRatio,
    team_diff: m("mean_team_diff"),
    repeat_recent_pct: m("repeat_recent_pct"),
    competitive_pct: m("competitive_game_pct"),
    virt_spread: m("virt_game_spread"),
    novel_cohorts_pct: m("novel_cohorts_pct"),
    games_per_session: m("total_games"),
    gates_passed: gates.filter(Boolean).length,
    all_gates: gates.every(Boolean),
  });
  done++;
  console.error(
    `[${done}/${configs.length}] ε₃=${cfg.epsSkillVar} ε₁=${cfg.epsWaitMin}` +
      (OVERLAP_MODE ? ` ε₀=${cfg.epsOverlap}` : "") +
      `: wait×${maxWaitRatio.toFixed(2)} sd×${sdRatio.toFixed(2)} team ${m("mean_team_diff").toFixed(2)} ` +
      `repeats ${m("repeat_recent_pct").toFixed(1)}% fresh-cohort ${m("novel_cohorts_pct").toFixed(0)}% ` +
      `games ${m("total_games").toFixed(1)} gates ${gates.filter(Boolean).length}/5`,
  );
}

// Rank: all gates first, then cohort SD ratio, then max-wait ratio.
results.sort((a, b) => {
  if (a.all_gates !== b.all_gates) return a.all_gates ? -1 : 1;
  return a.sd_ratio - b.sd_ratio || a.max_wait_ratio - b.max_wait_ratio;
});

console.log(`
# ε-Sweep${OVERLAP_MODE ? " — cohort overlap ε₀ (v1.2; team-diff gate 0.45)" : " — cohort/wait trade-off"} (N=22, C=3, T=180min, ${SEEDS} seeds, CRN)
#
# FIFO baseline: max wait ${fifo.max_wait.toFixed(2)} min, cohort SD ${fifo.cohort_sd.toFixed(3)}
# Gates: 0 consec violations · max wait ≤1.25× FIFO · cohort SD ≤0.65× FIFO · team diff ≤${TEAM_DIFF_GATE} · recent repeats <10%
#
${OVERLAP_MODE ? "ε₀ (overlap)   " : ""}${OVERLAP_MODE ? "" : "ε₃ (skillVar)  ε₁ (waitMin)  "}wait×FIFO  SD×FIFO  teamDiff  repeats%  compet%  fresh%  gates  feasible
--------------------------------------------------------------------------------------------------`);
for (const r of results) {
  const head = OVERLAP_MODE
    ? `${String(r.cfg.epsOverlap === 1e9 ? "off" : r.cfg.epsOverlap).padEnd(14)} `
    : `${String(r.cfg.epsSkillVar).padEnd(14)} ${String(r.cfg.epsWaitMin).padEnd(13)} `;
  console.log(
    head +
      `${r.max_wait_ratio.toFixed(3).padEnd(10)} ${r.sd_ratio.toFixed(3).padEnd(8)} ` +
      `${r.team_diff.toFixed(3).padEnd(9)} ${r.repeat_recent_pct.toFixed(2).padEnd(9)} ` +
      `${r.competitive_pct.toFixed(1).padEnd(8)} ${r.novel_cohorts_pct.toFixed(0).padEnd(7)} ${String(r.gates_passed).padEnd(6)} ${r.all_gates ? "yes" : "no"}`,
  );
}
const best = results[0];
console.log(
  `\nRecommended: ` +
    (OVERLAP_MODE
      ? `epsOverlap=${best.cfg.epsOverlap === 1e9 ? "off" : best.cfg.epsOverlap}`
      : `epsSkillVar=${best.cfg.epsSkillVar}, epsWaitMin=${best.cfg.epsWaitMin}`) +
    ` (wait×${best.max_wait_ratio.toFixed(3)}, SD×${best.sd_ratio.toFixed(3)}, all gates: ${best.all_gates})`,
);
console.log(`Sweep wall-clock: ${((performance.now() - tStart) / 1000).toFixed(0)}s`);
if (!best.all_gates) process.exit(1);
