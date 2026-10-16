export { cn } from "cn"

/** Net queue wait in seconds: time since check-in minus time already spent
 *  playing (the server adds total_seconds_played on match end). Rest does not
 *  pause the clock (reversed in R7) — it resets only via played-time accounting. */
export function netWait(now, entry) {
  return Math.max(0, now - (entry.checked_in_at ?? now) - (entry.total_seconds_played ?? 0))
}

/** Duration in seconds → mm:ss. */
export function fmtClock(s) {
  const total = Math.max(0, Math.floor(s ?? 0))
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`
}

/** Duration in seconds → h:mm:ss, for clocks that can exceed an hour. */
export function fmtDur(s) {
  const total = Math.max(0, Math.floor(s ?? 0))
  const h = Math.floor(total / 3600)
  const mm = String(Math.floor((total % 3600) / 60)).padStart(2, '0')
  const ss = String(total % 60).padStart(2, '0')
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`
}

/** Duration in seconds → whole minutes, for "12m played". */
export function fmtMins(s) {
  return `${Math.floor(Math.max(0, s ?? 0) / 60)}m`
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/** Default session name: `ASTIRISK (15-Oct-2026)` — locale-independent. */
export function fmtSessionName(date = new Date()) {
  const dd = String(date.getDate()).padStart(2, '0')
  return `ASTIRISK (${dd}-${MONTHS[date.getMonth()]}-${date.getFullYear()})`
}

// 7-Tier Skill Taxonomy (plus legacy 'advanced' alias)
export const SKILL_TIERS = [
  'newbie',
  'beginner',
  'lower_intermediate',
  'intermediate',
  'upper_intermediate',
  'expert',
  'professional',
]

export const SKILL_WEIGHTS = {
  newbie: 100,
  beginner: 200,
  lower_intermediate: 300,
  intermediate: 400,
  upper_intermediate: 500,
  expert: 600,
  advanced: 600,
  professional: 700,
}

// skill level → redesign-draft tier badge class (index.css .tier recipe)
export const TIER_CLASS = {
  newbie: 't-newbie',
  beginner: 't-beginner',
  lower_intermediate: 't-lower',
  intermediate: 't-int',
  upper_intermediate: 't-upper',
  expert: 't-expert',
  advanced: 't-expert', // legacy alias
  professional: 't-expert',
}

const avgSkill = team => {
  const ws = team.map(p => SKILL_WEIGHTS[p.skill_level]).filter(w => w != null)
  return ws.length ? ws.reduce((a, b) => a + b, 0) / ws.length : null
}

/** Average-skill gap between the two sides → human hint. m = { team1:[{skill_level}], team2:[...] }.
 *  Thresholds: ≤50 Even · ≤150 Slight edge · else Lopsided. null when skill data is missing. */
/** 'upper_intermediate' → 'Upper Intermediate'. Null-safe for missing skill data. */
export function titleCaseSkill(level) {
  return (level ?? '').split('_').map(w => (w ? w[0].toUpperCase() + w.slice(1) : w)).join(' ')
}

export function balanceHint(m) {
  const a = avgSkill(m.team1), b = avgSkill(m.team2)
  if (a == null || b == null) return null
  const d = Math.abs(a - b)
  if (d <= 50) return { label: 'Even', tone: 'text-green-deep' }
  if (d <= 150) return { label: 'Slight edge', tone: 'text-amber' }
  return { label: 'Lopsided', tone: 'text-destructive' }
}
