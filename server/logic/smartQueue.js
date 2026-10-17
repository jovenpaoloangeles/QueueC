// Two-stage ε-lexicographic doubles matcher (queue-algorithm.md).
// Stage A filters C(K,4) quartets by wait sum → virtual games → skill variance
// tolerance bands; Stage B ranks the 3 K4 splits of each survivor by team
// balance, then partner/opponent variety. K ≤ 26, so plain loops over a
// precomputed combination table are as fast as any tensor trick.

export const SKILL_WEIGHT_MAP = {
  newbie: 100,
  beginner: 200,
  lower_intermediate: 300,
  intermediate: 400,
  upper_intermediate: 500,
  expert: 600,
  advanced: 600,
  professional: 700,
};

const SKILL_MAP = {
  newbie: 1,
  beginner: 2,
  lower_intermediate: 3,
  intermediate: 4,
  upper_intermediate: 5,
  expert: 6,
  advanced: 6,
  professional: 7,
};

export const MATCH_CONFIG = {
  maxConsecutive: 2, // c_i < C_max
  minRestMinutes: 8.0, // bench rest threshold that resets consecutive streak
  minBenchWait: 0.5, // bench-first threshold (min): waiting > 0.5m preferred over just-finished (0m)
  anchorTopWaiter: true, // hard-anchor longest-waiting fair player when wait approaches ceiling
  anchorWaitRatio: 1.35, // anchor when top waiter's wait ≥ 1.35× 4th waiter
  anchorWaitMin: 15.0, // or when top waiter's wait ≥ 15 min (~1 full game duration)
  poolSize: 12, // candidate window K (single court)
  weakLinkW: 0.65, // ω: weight on the weaker player of a pair
  betaOpponent: 0.25, // β: opponent-recency weight inside F5
  gammaDecay: 0.85, // γ: P/O decay per completed game
  alpha: 2.0, // π = wait_min − α·g_virt
  epsWaitRatio: 0.1, // ε₁ = max(epsWaitMin, 10% of best quartet wait sum)
  epsWaitMin: 7.0, // sweep-tuned (tests/sim/epsilon-sweep.mjs): 7 min widens the Stage A window
  epsVirtGames: 1.0, // ε₂
  epsSkillVar: 0.45, // ε₃ (skill² on the 1–7 scale) — sweep-tuned; feasible band 0.3–0.9
  epsTeamDiff: 0.35, // ε₄
  lambdaSkillVar: 1, // J(q) = λ₃f₃ + λ₄minF₄ + λ₅minF₅ (§5, weights unassigned)
  lambdaTeamDiff: 1,
  lambdaVariety: 1,
  maxBatchNodes: 20000, // DFS cap for multi-court disjoint selection
};

function skillValue(entry) {
  return SKILL_MAP[entry.skill_level] ?? 4;
}

function waitMinutes(entry, now) {
  if (entry.last_played_at != null) return (now - entry.last_played_at) / 60;
  return (now - entry.checked_in_at - (entry.total_seconds_played ?? 0)) / 60;
}

function virtGames(entry) {
  return (entry.games_played ?? 0) + (entry.virt_offset ?? 0);
}

function rosterOf(match) {
  const r = [];
  for (const side of ["team1", "team2"]) {
    for (const p of match[side] ?? []) if (p != null) r.push(p);
  }
  return r;
}

// Trailing streak of consecutive games per player.
// When history entries carry started_at/ended_at (multi-court production & DES),
// a player's streak resets only when a match starts at or after their last
// ended_at without them (they sat out a full game) OR their bench rest reaches
// minRestSec. Falls back to trailing-roster intersection when timestamps are omitted.
export function consecutiveCounts(history, now = null, minRestSec = MATCH_CONFIG.minRestMinutes * 60) {
  const counts = new Map();
  if (!history.length) return counts;
  if (history[0].ended_at == null) {
    let live = null; // players whose streak is still counting
    for (let i = history.length - 1; i >= 0; i--) {
      const roster = new Set(rosterOf(history[i]));
      if (live === null) {
        live = roster;
        for (const id of roster) counts.set(id, 1);
        continue;
      }
      const stillLive = new Set();
      for (const id of live) {
        if (roster.has(id)) {
          counts.set(id, counts.get(id) + 1);
          stillLive.add(id);
        }
      }
      live = stillLive;
      if (live.size === 0) break;
    }
    return counts;
  }

  const lastEnd = new Map();
  const ordered = [...history].sort(
    (a, b) => (a.started_at ?? 0) - (b.started_at ?? 0) || (a.ended_at ?? 0) - (b.ended_at ?? 0),
  );
  for (const m of ordered) {
    const s = m.started_at ?? 0;
    const e = m.ended_at ?? s;
    const roster = new Set(rosterOf(m));
    for (const [id, endAt] of lastEnd) {
      if (!roster.has(id) && s >= endAt) counts.set(id, 0);
    }
    for (const id of roster) {
      const prevEnd = lastEnd.get(id);
      const rested = prevEnd != null && s - prevEnd >= minRestSec;
      counts.set(id, rested ? 1 : (counts.get(id) ?? 0) + 1);
      lastEnd.set(id, Math.max(prevEnd ?? -Infinity, e));
    }
  }
  if (now != null) {
    for (const [id, endAt] of lastEnd) {
      if (now - endAt >= minRestSec) counts.set(id, 0);
    }
  }
  return counts;
}

// Recency-decayed partnership/opponent penalties over the candidate window.
// P^(r+1) = γ·P^(r) + Δ (§2), iterated oldest→newest.
function buildPO(history, idIdx, n) {
  const P = new Float32Array(n * n);
  const O = new Float32Array(n * n);
  const γ = MATCH_CONFIG.gammaDecay;
  for (const m of history) {
    for (let i = 0; i < n * n; i++) {
      P[i] *= γ;
      O[i] *= γ;
    }
    // Doubles: teams are partnerships (P); everyone across the net is an
    // opponent (O). Singles (1 per side): no partnership, just opponents.
    const t1 = (m.team1 ?? []).filter((x) => x != null);
    const t2 = (m.team2 ?? []).filter((x) => x != null);
    const idOf = (x) => idIdx.get(x);
    if (t1.length === 2 && t2.length === 2) {
      for (const [a, b] of [t1, t2]) {
        const i = idOf(a);
        const j = idOf(b);
        if (i == null || j == null) continue;
        P[i * n + j] += 1;
        P[j * n + i] += 1;
      }
    }
    for (const a of t1) {
      const i = idOf(a);
      if (i == null) continue;
      for (const b of t2) {
        const j = idOf(b);
        if (j == null) continue;
        O[i * n + j] += 1;
        O[j * n + i] += 1;
      }
    }
  }
  return { P, O };
}

const comboCache = new Map();
function combos(K) {
  let c = comboCache.get(K);
  if (!c) {
    c = [];
    for (let a = 0; a < K - 3; a++)
      for (let b = a + 1; b < K - 2; b++)
        for (let d = b + 1; d < K - 1; d++)
          for (let e = d + 1; e < K; e++) c.push([a, b, d, e]);
    comboCache.set(K, c);
  }
  return c;
}

// Split index vectors for K4 duality (§4 step 4): split s pairs (u1[s],v1[s]) vs (u2[s],v2[s]).
const U1 = [0, 0, 0], V1 = [1, 2, 3];
const U2 = [2, 1, 1], V2 = [3, 3, 2];
const EDGE_U = [0, 0, 0, 1, 1, 2], EDGE_V = [1, 2, 3, 2, 3, 3];

/**
 * Plan up to `courtCount` doubles matches from the waiting pool.
 * @param {object} p
 * @param {Array} p.waiting  queue entries (status 'waiting') with skill_level
 * @param {Array} [p.history]  this session's completed matches, oldest→newest,
 *   each { team1: [id|null, id|null], team2: [...] }
 * @param {number} [p.courtCount]  courts + slate slots to fill
 * @param {number} [p.now]  epoch seconds
 * @param {Array} [p.bans]  hard no-partner pairs, e.g. [[idA, idB], …]
 * @param {object} [p.cfg]  per-call overrides merged over MATCH_CONFIG
 * @returns {{ matches: Array<{team1:number[],team2:number[],metrics:object}>, relaxed: boolean }}
 */
export function planBatch({ waiting, history = [], courtCount = 1, now = Math.floor(Date.now() / 1000), bans = [], cfg = {} }) {
  const C = { ...MATCH_CONFIG, ...cfg };
  const avail = waiting.filter((e) => e.status === "waiting");
  if (avail.length < 4) return { matches: [], relaxed: false };

  // Module 1: unary filtering — consecutive-game rest limit, with graceful relax.
  const consec = consecutiveCounts(history, now, C.minRestMinutes * 60);
  let eligible = avail.filter((e) => (consec.get(e.id) ?? 0) < C.maxConsecutive);
  let didRelax = false;
  if (eligible.length < 4) {
    didRelax = true;
    eligible = [...avail].sort((a, b) => (consec.get(a.id) ?? 0) - (consec.get(b.id) ?? 0));
  }

  // Bench-first rule: when there is a full candidate window of rested bench
  // players (≥ max(8, 4*courtCount + 4)), exclude 0-wait players who just
  // walked off a court so they don't jump ahead of waiting bench players.
  const minBenchWait = C.minBenchWait ?? 0.5;
  if (minBenchWait > 0 && C.epsWaitMin > 0) {
    const benchRested = eligible.filter((e) => waitMinutes(e, now) > minBenchWait);
    if (benchRested.length >= Math.max(8, 4 * courtCount + 4)) eligible = benchRested;
  }

  // Candidate window: π = wait − α·g_virt, top K with boundary-tie expansion.
  const waitMap = new Map(eligible.map((e) => [e.id, waitMinutes(e, now)]));
  const prio = new Map(
    eligible.map((e) => [e.id, waitMap.get(e.id) - C.alpha * virtGames(e)]),
  );
  const sorted = [...eligible].sort(
    (a, b) => prio.get(b.id) - prio.get(a.id) || waitMap.get(b.id) - waitMap.get(a.id),
  );
  const kTarget = courtCount > 1
    ? Math.max(C.poolSize, 4 * courtCount + 4)
    : C.poolSize;
  let window = sorted;
  if (sorted.length > kTarget) {
    const cutoff = prio.get(sorted[kTarget - 1].id);
    window = sorted.filter((e) => prio.get(e.id) >= cutoff - 1e-4);
  }
  if (window.length > 26) window = window.slice(0, 26); // spec domain K ≤ 26 (also keeps the 32-bit disjointness mask safe)

  const ids = window.map((e) => e.id);
  const n = ids.length;
  const K = n;
  const idIdx = new Map(ids.map((id, i) => [id, i]));
  const w = Float64Array.from(window, (e) => waitMap.get(e.id));
  const g = Float64Array.from(window, virtGames);
  const s = Float64Array.from(window, skillValue);
  const { P, O } = buildPO(history, idIdx, n);

  const banSet = new Set();
  for (const [a, b] of bans) {
    const i = idIdx.get(a), j = idIdx.get(b);
    if (i != null && j != null) {
      banSet.add(i * n + j);
      banSet.add(j * n + i);
    }
  }

  // Module 2: weak-link team rating R = ω·min + (1−ω)·max.
  const ω = C.weakLinkW;
  const R = new Float64Array(K * K);
  for (let i = 0; i < K; i++) {
    for (let j = 0; j < K; j++) {
      const lo = Math.min(s[i], s[j]);
      const hi = Math.max(s[i], s[j]);
      R[i * K + j] = ω * lo + (1 - ω) * hi;
    }
  }

  // Stage A: ε-lexicographic cascade on cohort metrics, with optional hard anchor
  // on the longest-waiting fair player so skill outliers never starve on the bench.
  const Q = combos(K);
  const M = Q.length;
  const need = Math.min(courtCount, Math.floor(K / 4));
  const f1 = new Float64Array(M);
  const f2 = new Float64Array(M);
  const f3 = new Float64Array(M);
  for (let q = 0; q < M; q++) {
    const [a, b, c, d] = Q[q];
    f1[q] = w[a] + w[b] + w[c] + w[d];
    f2[q] = g[a] + g[b] + g[c] + g[d];
    const mean = (s[a] + s[b] + s[c] + s[d]) / 4;
    f3[q] = ((s[a] - mean) ** 2 + (s[b] - mean) ** 2 + (s[c] - mean) ** 2 + (s[d] - mean) ** 2) / 4;
  }

  // Identify the longest-waiting player within the virtual-game fairness band
  // (or window[0] if window[0] has waited even longer and paid off any game lead).
  let gMinWin = Infinity;
  let gMaxWin = -Infinity;
  for (let i = 0; i < K; i++) {
    if (g[i] < gMinWin) gMinWin = g[i];
    if (g[i] > gMaxWin) gMaxWin = g[i];
  }
  let anchorIdx = 0;
  let anchorWait = -Infinity;
  for (let i = 0; i < K; i++) {
    if (g[i] <= gMinWin + C.epsVirtGames && w[i] > anchorWait + 1e-9) {
      anchorWait = w[i];
      anchorIdx = i;
    }
  }
  if (w[0] > anchorWait) {
    anchorIdx = 0;
    anchorWait = w[0];
  }
  const wSorted = [...w].sort((a, b) => b - a);
  const wFourth = wSorted[Math.min(3, wSorted.length - 1)] ?? 0;
  // Trigger hard anchor when the top waiter has been skipped past the 4th waiter
  // (or reached 1 full game duration on the bench, or trails the pool by ≥ 2 games).
  const shouldAnchor =
    Boolean(C.anchorTopWaiter) &&
    C.epsWaitMin > 0 &&
    (anchorWait >= (C.anchorWaitMin ?? MATCH_CONFIG.anchorWaitMin) ||
      (wFourth > 0 && anchorWait >= (C.anchorWaitRatio ?? MATCH_CONFIG.anchorWaitRatio) * wFourth) ||
      (g[anchorIdx] === gMinWin && gMaxWin - gMinWin >= 2));

  const cascade = (requireAnchor) => {
    const m = new Uint8Array(M).fill(1);
    if (requireAnchor && need === 1) {
      for (let q = 0; q < M; q++) {
        const [a, b, c, d] = Q[q];
        if (a !== anchorIdx && b !== anchorIdx && c !== anchorIdx && d !== anchorIdx) m[q] = 0;
      }
    }
    let f1Max = -Infinity;
    for (let q = 0; q < M; q++) if (m[q] && f1[q] > f1Max) f1Max = f1[q];
    const epsW = Math.max(C.epsWaitMin, C.epsWaitRatio * f1Max);
    for (let q = 0; q < M; q++) if (m[q] && f1[q] < f1Max - epsW) m[q] = 0;

    let f2Min = Infinity;
    for (let q = 0; q < M; q++) if (m[q] && f2[q] < f2Min) f2Min = f2[q];
    for (let q = 0; q < M; q++) if (m[q] && f2[q] > f2Min + C.epsVirtGames) m[q] = 0;

    let f3Min = Infinity;
    for (let q = 0; q < M; q++) if (m[q] && f3[q] < f3Min) f3Min = f3[q];
    for (let q = 0; q < M; q++) if (m[q] && f3[q] > f3Min + C.epsSkillVar) m[q] = 0;
    return m;
  };

  let mask = cascade(shouldAnchor);

  // Stage B: 3 K4 splits per surviving quartet.
  const all6O = new Float64Array(M);
  for (let q = 0; q < M; q++) {
    let sum = 0;
    for (let e = 0; e < 6; e++) sum += O[Q[q][EDGE_U[e]] * K + Q[q][EDGE_V[e]]];
    all6O[q] = sum;
  }

  const collectSplits = (m) => {
    const out = [];
    for (let q = 0; q < M; q++) {
      if (!m[q]) continue;
      const locals = Q[q];
      for (let sp = 0; sp < 3; sp++) {
        const a = locals[U1[sp]], b = locals[V1[sp]];
        const c = locals[U2[sp]], d = locals[V2[sp]];
        if (banSet.has(a * K + b) || banSet.has(c * K + d)) continue;
        const f4 = Math.abs(R[a * K + b] - R[c * K + d]);
        const partner = P[a * K + b] + P[c * K + d];
        const opp = all6O[q] - (O[a * K + b] + O[c * K + d]);
        out.push({
          q,
          split: sp,
          f4,
          f5: partner + C.betaOpponent * opp,
          f1: f1[q],
          f3: f3[q],
        });
      }
    }
    return out;
  };

  let splits = collectSplits(mask);
  if (!splits.length && C.anchorTopWaiter && C.epsWaitMin > 0) {
    // Fallback if hard-ban pairs ruled out every quartet containing anchorIdx.
    mask = cascade(false);
    splits = collectSplits(mask);
  }
  if (!splits.length) return { matches: [], relaxed: didRelax };

  // ε₄ team-balance band across all (quartet, split) pairs (§4 step 4).
  let f4Min = Infinity;
  for (const sv of splits) if (sv.f4 < f4Min) f4Min = sv.f4;
  const band = splits.filter((sv) => sv.f4 <= f4Min + C.epsTeamDiff);

  let cands;
  if (need === 1) {
    // Single court: lexicographic min F5 (bucketed to ignore ancient decay dust) → min F4 → min F3 → max wait sum (§4).
    cands = [...band].sort(
      (a, b) =>
        (Math.abs(a.f5 - b.f5) > 0.12 ? a.f5 - b.f5 : 0) ||
        a.f4 - b.f4 ||
        a.f3 - b.f3 ||
        b.f1 - a.f1,
    );
  } else {
    // Multi court: J(q) = λ₃f₃ + λ₄minF₄ + λ₅minF₅ per quartet (§5).
    const perQuartet = new Map();
    for (const sv of band) {
      const J =
        C.lambdaSkillVar * sv.f3 +
        C.lambdaTeamDiff * sv.f4 +
        C.lambdaVariety * sv.f5;
      const prev = perQuartet.get(sv.q);
      if (!prev || J < prev.J) perQuartet.set(sv.q, { ...sv, J });
    }
    cands = [...perQuartet.values()].sort((a, b) => a.J - b.J);
  }

  // Pick `need` bitmask-disjoint quartets minimising (max J, sum J).
  // ponytail: exhaustive DFS under maxBatchNodes, falls back to greedy when the
  // survivor set explodes — swap in an ILP/heuristic if C courts > ~6 matters.
  let nodes = 0;
  let bestSet = null;
  const bt = (start, chosen, used) => {
    if (chosen.length === need) {
      const maxJ = Math.max(...chosen.map((x) => x.J));
      const sumJ = chosen.reduce((t, x) => t + x.J, 0);
      if (
        !bestSet ||
        maxJ < bestSet.maxJ ||
        (maxJ === bestSet.maxJ && sumJ < bestSet.sumJ)
      ) {
        bestSet = { set: [...chosen], maxJ, sumJ };
      }
      return;
    }
    if (++nodes > C.maxBatchNodes) return;
    for (let i = start; i < cands.length; i++) {
      const [a, b, c, d] = Q[cands[i].q];
      const m = (1 << a) | (1 << b) | (1 << c) | (1 << d);
      if (used & m) continue;
      chosen.push(cands[i]);
      bt(i + 1, chosen, used | m);
      chosen.pop();
      if (nodes > C.maxBatchNodes) return;
    }
  };
  bt(0, [], 0);
  if (!bestSet) {
    // Greedy fallback over J-sorted candidates.
    bestSet = { set: [], maxJ: 0, sumJ: 0 };
    let used = 0;
    for (const cand of cands) {
      if (bestSet.set.length === need) break;
      const [a, b, c, d] = Q[cand.q];
      const m = (1 << a) | (1 << b) | (1 << c) | (1 << d);
      if (used & m) continue;
      used |= m;
      bestSet.set.push(cand);
      bestSet.maxJ = Math.max(bestSet.maxJ, cand.J);
      bestSet.sumJ += cand.J;
    }
  }

  const matches = bestSet.set.map((cand) => {
    const locals = Q[cand.q];
    const sp = cand.split;
    const t1 = [locals[U1[sp]], locals[V1[sp]]];
    const t2 = [locals[U2[sp]], locals[V2[sp]]];
    return {
      team1: [ids[t1[0]], ids[t1[1]]],
      team2: [ids[t2[0]], ids[t2[1]]],
      metrics: {
        wait_sum: cand.f1,
        virt_games_sum: f2[cand.q],
        cohort_skill_var: cand.f3,
        team_rating_diff: cand.f4,
        redundancy_penalty: cand.f5,
      },
    };
  });
  return { matches, relaxed: didRelax };
}

// For singles: the 2 entries with best priority π.
// For doubles: the ε-lexicographic quartet + best split.
// Returns [team1_p1_id, team1_p2_id|null, team2_p1_id, team2_p2_id|null]
export function suggestPlayers(entries, mode, { history = [], now = Math.floor(Date.now() / 1000) } = {}) {
  const waiting = entries.filter((e) => e.status === "waiting");
  if (mode === "singles" || waiting.length < 4) {
    if (waiting.length < 2) return [];
    const prio = (e) => waitMinutes(e, now) - MATCH_CONFIG.alpha * virtGames(e);
    const sorted = [...waiting].sort((a, b) => prio(b) - prio(a));
    return [sorted[0].id, null, sorted[1].id, null];
  }

  const { matches } = planBatch({ waiting, history, courtCount: 1, now });
  if (!matches.length) return [];
  const [t1, t2] = [matches[0].team1, matches[0].team2];
  return [t1[0], t1[1], t2[0], t2[1]];
}
