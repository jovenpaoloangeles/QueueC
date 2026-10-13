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

// ponytail: five static class pairs in one place beats five CSS variables
export const SKILL_BADGE = {
  newbie: 'bg-zinc-100 text-zinc-700',
  beginner: 'bg-amber-100 text-amber-800',
  intermediate: 'bg-blue-100 text-blue-800',
  upper_intermediate: 'bg-green-100 text-green-800',
  advanced: 'bg-emerald-100 text-emerald-800',
}

