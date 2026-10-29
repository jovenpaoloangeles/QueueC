// v1.7 skill elasticity (review 2026-10-29): a Gaussian rating per player,
// replayed from match history on demand — derived data, so score corrections
// and deleted matches can never leave it stale, and nothing is stored.
//
//   rating  r_i = μ_i + δ_i     (tier scale 1–7; μ₀ = roster tier)
//   μ_i, σ_i²   career skill and its uncertainty; σ² grows by τ² between
//               sessions (day-to-day form drift)
//   δ_i, v_i    tonight's form: reset to 0 / τ_s² each session, |δ| ≤ 1 tier
//
// Observation per finished game: point margin m = (s₁ − s₂)/(s₁ + s₂),
// modelled as m ~ N(k·(T₁ − T₂), σ_m²) with T the matcher's weak-link team
// rating ω·min + (1−ω)·max (singles: the player). One linearised Kalman step
// per game (diagonal approximation): with h_i = ±k·w_i,
//   S = Σ h_i²(σ_i² + v_i) + σ_m²,  e = m − k(T₁ − T₂)
//   μ_i += σ_i² h_i e / S,  δ_i += v_i h_i e / S,  σ_i², v_i shrink likewise.
// ponytail: diagonal Kalman, no partner-correlation terms — upgrade to full
// TrueSkill message passing only if ratings visibly mis-rank partners.

import { SKILL_MAP } from "./smartQueue.js";

export const RATING_CONFIG = {
  sigma0: 0.75, // prior sd of a roster tier
  tau: 0.3, // between-session drift sd
  tauSession: 0.4, // prior sd of tonight's form offset
  maxForm: 1.0, // |δ| cap, tiers
  sigmaFloor: 0.2,
  k: 0.15, // expected margin per tier of team-rating difference
  sigmaMargin: 0.12, // margin noise sd
  weakLinkW: 0.65,
  min: 0.5,
  max: 7.5,
};

const tierOf = (skill) => SKILL_MAP[skill] ?? 4;

/**
 * @param {Array} matches finished games, any order: { session_id, started_at,
 *   team1: [playerId…], team2: [playerId…], team1_score, team2_score }
 * @param {(playerId) => string} skillOf roster skill_level (the prior)
 * @param {number|null} currentSession only this session's form δ is kept
 * @returns {Map<playerId, {mu, sigma, form, rating, games}>}
 */
export function computeRatings(matches, skillOf, currentSession = null, cfg = {}) {
  const R = { ...RATING_CONFIG, ...cfg };
  const st = new Map();
  const get = (pid) => {
    let p = st.get(pid);
    if (!p) {
      p = {
        mu: tierOf(skillOf(pid)),
        var: R.sigma0 ** 2,
        form: 0,
        fvar: R.tauSession ** 2,
        session: null,
        games: 0,
      };
      st.set(pid, p);
    }
    return p;
  };
  const ordered = [...matches].sort((a, b) => (a.started_at ?? 0) - (b.started_at ?? 0));
  for (const m of ordered) {
    const s1 = m.team1_score;
    const s2 = m.team2_score;
    if (s1 == null || s2 == null || s1 + s2 <= 0) continue;
    const sides = [m.team1, m.team2].map((t) => (t ?? []).filter((x) => x != null));
    if (!sides[0].length || !sides[1].length) continue;
    for (const pid of [...sides[0], ...sides[1]]) {
      const p = get(pid);
      if (p.session !== m.session_id) {
        if (p.session != null) p.var += R.tau ** 2; // new session: form resets, skill loosens
        p.session = m.session_id;
        p.form = 0;
        p.fvar = R.tauSession ** 2;
      }
    }
    // team rating and each player's weight in it (weak-link)
    const team = (ids) => {
      const r = ids.map((pid) => get(pid).mu + get(pid).form);
      if (ids.length === 1) return { T: r[0], w: [1] };
      const lo = r[0] <= r[1] ? 0 : 1;
      const w = [0, 0];
      w[lo] = R.weakLinkW;
      w[1 - lo] = 1 - R.weakLinkW;
      return { T: w[0] * r[0] + w[1] * r[1], w };
    };
    const [a, b] = sides.map(team);
    const e = (s1 - s2) / (s1 + s2) - R.k * (a.T - b.T);
    const h = [...a.w.map((w) => R.k * w), ...b.w.map((w) => -R.k * w)];
    const players = [...sides[0], ...sides[1]].map(get);
    const S = players.reduce((t, p, i) => t + h[i] ** 2 * (p.var + p.fvar), R.sigmaMargin ** 2);
    players.forEach((p, i) => {
      p.mu = Math.min(R.max, Math.max(R.min, p.mu + (p.var * h[i] * e) / S));
      p.form = Math.min(R.maxForm, Math.max(-R.maxForm, p.form + (p.fvar * h[i] * e) / S));
      p.var = Math.max(R.sigmaFloor ** 2, p.var * (1 - (p.var * h[i] ** 2) / S));
      p.fvar = Math.max(0.01, p.fvar * (1 - (p.fvar * h[i] ** 2) / S));
      p.games++;
    });
  }
  const out = new Map();
  for (const [pid, p] of st) {
    const form = currentSession != null && p.session === currentSession ? p.form : 0;
    out.set(pid, { mu: p.mu, sigma: Math.sqrt(p.var), form, rating: p.mu + form, games: p.games });
  }
  return out;
}

/** Ratings from every finished game in the DB, keyed by player id. */
export function loadRatings(db, currentSession = null) {
  const matches = db
    .prepare(`
    SELECT m.session_id, m.started_at, m.team1_score, m.team2_score,
      e1.player_id AS a1, e2.player_id AS a2, e3.player_id AS b1, e4.player_id AS b2
    FROM matches m
    JOIN queue_entries e1 ON e1.id = m.team1_p1
    LEFT JOIN queue_entries e2 ON e2.id = m.team1_p2
    JOIN queue_entries e3 ON e3.id = m.team2_p1
    LEFT JOIN queue_entries e4 ON e4.id = m.team2_p2
    WHERE m.state = 'active' AND m.ended_at IS NOT NULL
  `)
    .all()
    .map((r) => ({
      session_id: r.session_id,
      started_at: r.started_at,
      team1_score: r.team1_score,
      team2_score: r.team2_score,
      team1: [r.a1, r.a2],
      team2: [r.b1, r.b2],
    }));
  const skill = new Map(
    db
      .prepare("SELECT id, skill_level FROM players")
      .all()
      .map((p) => [p.id, p.skill_level]),
  );
  return computeRatings(matches, (pid) => skill.get(pid), currentSession);
}
