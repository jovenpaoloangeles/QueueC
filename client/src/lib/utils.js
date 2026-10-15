export { cn } from "cn"

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
