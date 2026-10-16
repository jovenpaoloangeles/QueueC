// 7-tier skill weights (100–700) + legacy 'advanced' alias (600)
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

function waitSeconds(entry) {
  const now = Math.floor(Date.now() / 1000);
  return now - entry.checked_in_at - entry.total_seconds_played;
}

function skillValue(entry) {
  return SKILL_MAP[entry.skill_level] ?? 4;
}

// For singles: return the 2 entries with longest wait
// For doubles: find 4-player combo maximising total wait while minimising |avgSkill(t1) - avgSkill(t2)|
// Returns [team1_p1_id, team1_p2_id|null, team2_p1_id, team2_p2_id|null]
export function suggestPlayers(entries, mode) {
  const GAMES_WEIGHT = 120;
  const waiting = entries
    .filter((e) => e.status === "waiting")
    .map((e) => ({
      ...e,
      wait: waitSeconds(e),
      skill: skillValue(e),
      games: e.games_played ?? 0,
      priority: waitSeconds(e) - (e.games_played ?? 0) * GAMES_WEIGHT,
    }))
    .sort((a, b) => b.priority - a.priority);

  if (waiting.length < (mode === "singles" ? 2 : 4)) return [];

  if (mode === "singles") {
    return [waiting[0].id, null, waiting[1].id, null];
  }

  // Doubles: try all C(n,4) combos, pick best score
  // ponytail: O(n⁴) scan — fine for ≤30 players, switch to heuristic if n grows
  const SKILL_WEIGHT = 10;
  let best = null;
  let bestScore = -Infinity;

  for (let i = 0; i < waiting.length; i++) {
    for (let j = i + 1; j < waiting.length; j++) {
      for (let k = j + 1; k < waiting.length; k++) {
        for (let l = k + 1; l < waiting.length; l++) {
          const [a, b, c, d] = [waiting[i], waiting[j], waiting[k], waiting[l]];
          // Try all 3 team splits: (a+b vs c+d), (a+c vs b+d), and (a+d vs b+c)
          for (const [t1, t2] of [
            [
              [a, b],
              [c, d],
            ],
            [
              [a, c],
              [b, d],
            ],
            [
              [a, d],
              [b, c],
            ],
          ]) {
            const totalPriority = [...t1, ...t2].reduce((s, e) => s + e.priority, 0);
            const skillDiff = Math.abs((t1[0].skill + t1[1].skill) / 2 - (t2[0].skill + t2[1].skill) / 2);
            const score = totalPriority - skillDiff * SKILL_WEIGHT;
            if (score > bestScore) {
              bestScore = score;
              best = [t1[0].id, t1[1].id, t2[0].id, t2[1].id];
            }
          }
        }
      }
    }
  }
  return best ?? [];
}
