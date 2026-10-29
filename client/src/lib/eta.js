// Rough court-time estimates for the live view. Deliberately crude: every
// game is assumed to take TYPICAL_GAME_SEC.

/** Rough typical game length — only used for approximate ETAs. */
export const TYPICAL_GAME_SEC = 20 * 60;

/** Soonest-finishing live match → {secs, label}, or null with nothing live. */
export function nextFreeCourt(courts, activeMatches, now) {
  let best = null;
  for (const m of activeMatches ?? []) {
    if (m?.court_number == null || !m.started_at) continue;
    const secs = Math.max(0, TYPICAL_GAME_SEC - (now - m.started_at));
    if (!best || secs < best.secs) {
      const c = (courts ?? []).find((x) => x.id === m.court_number);
      best = { secs, label: c?.label ?? `Court ${m.court_number}` };
    }
  }
  return best;
}

/**
 * v1.6 wait ETA: seconds until each waiting player's likely next game.
 * `waitingIds` is longest-waiting first; every slate on deck and every 4
 * players ahead is one game, spread over the usable courts.
 * ponytail: ignores Smart Match's skill balancing and rotation rules — good
 * enough to answer "when do I play?", not a promise.
 */
export function waitEtas({ waitingIds, slates, usableCourts, freeNow, nextFreeSecs }) {
  const etas = new Map();
  if (usableCourts <= 0) return etas;
  const first = freeNow ? 0 : (nextFreeSecs ?? TYPICAL_GAME_SEC);
  waitingIds.forEach((id, rank) => {
    const gamesAhead = slates + Math.floor(rank / 4);
    etas.set(id, first + Math.floor(gamesAhead / usableCourts) * TYPICAL_GAME_SEC);
  });
  return etas;
}
