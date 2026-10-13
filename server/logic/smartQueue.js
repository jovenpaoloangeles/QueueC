const SKILL_MAP = { newbie: 1, beginner: 2, intermediate: 3, upper_intermediate: 4, advanced: 5 }

function waitSeconds(entry) {
  const now = Math.floor(Date.now() / 1000)
  return now - entry.checked_in_at - entry.total_seconds_played
}

function skillValue(entry) {
  return SKILL_MAP[entry.skill_level] ?? 3
}

// For singles: return the 2 entries with longest wait
// For doubles: find 4-player combo maximising total wait while minimising |avgSkill(t1) - avgSkill(t2)|
// Returns [team1_p1_id, team1_p2_id|null, team2_p1_id, team2_p2_id|null]
export function suggestPlayers(entries, mode) {
  const waiting = entries
    .filter(e => e.status === 'waiting')
    .map(e => ({ ...e, wait: waitSeconds(e), skill: skillValue(e) }))
    .sort((a, b) => b.wait - a.wait)

  if (waiting.length < (mode === 'singles' ? 2 : 4)) return []

  if (mode === 'singles') {
    return [waiting[0].id, null, waiting[1].id, null]
  }

  // Doubles: try all C(n,4) combos, pick best score
  // ponytail: O(n⁴) scan — fine for ≤30 players, switch to heuristic if n grows
  const SKILL_WEIGHT = 10
  let best = null
  let bestScore = -Infinity

  for (let i = 0; i < waiting.length; i++) {
    for (let j = i + 1; j < waiting.length; j++) {
      for (let k = j + 1; k < waiting.length; k++) {
        for (let l = k + 1; l < waiting.length; l++) {
          const [a, b, c, d] = [waiting[i], waiting[j], waiting[k], waiting[l]]
          // Try both team splits: (a+b vs c+d) and (a+c vs b+d)
          for (const [t1, t2] of [[[a,b],[c,d]], [[a,c],[b,d]]]) {
            const totalWait = [...t1,...t2].reduce((s, e) => s + e.wait, 0)
            const skillDiff = Math.abs(
              (t1[0].skill + t1[1].skill) / 2 - (t2[0].skill + t2[1].skill) / 2
            )
            const score = totalWait - skillDiff * SKILL_WEIGHT
            if (score > bestScore) {
              bestScore = score
              best = [t1[0].id, t1[1].id, t2[0].id, t2[1].id]
            }
          }
        }
      }
    }
  }
  return best ?? []
}
