export { cn } from "cn"

/** Net queue wait in seconds: time since check-in minus time already spent
 *  playing (the server adds total_seconds_played on match end) minus time
 *  spent resting (the server accrues rested_seconds when a player wakes). */
export function netWait(now, entry) {
  return Math.max(0, now - (entry.checked_in_at ?? now) - (entry.total_seconds_played ?? 0) - (entry.rested_seconds ?? 0))
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

export const SKILL_BADGE = {
  newbie: 'bg-slate-100 text-slate-700',              // #64748B Slate / Gray (100)
  beginner: 'bg-sky-100 text-sky-800',                // #0EA5E9 Sky Blue (200)
  lower_intermediate: 'bg-emerald-100 text-emerald-800', // #10B981 Emerald Green (300)
  intermediate: 'bg-amber-100 text-amber-800',        // #F59E0B Amber / Gold (400)
  upper_intermediate: 'bg-orange-100 text-orange-800',// #F97316 Orange (500)
  expert: 'bg-rose-100 text-rose-800',                // #E11D48 Rose / Crimson (600)
  advanced: 'bg-rose-100 text-rose-800',              // legacy alias → Expert
  professional: 'bg-purple-100 text-purple-800',      // #7C3AED Royal Purple (700)
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
  if (d <= 50) return { label: 'Even', tone: 'text-emerald-600' }
  if (d <= 150) return { label: 'Slight edge', tone: 'text-amber-600' }
  return { label: 'Lopsided', tone: 'text-rose-600' }
}
