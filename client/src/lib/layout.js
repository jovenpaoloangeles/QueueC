import { useCallback, useState } from 'react'

/** Persisted bento-layout state (`queuec-layout` in localStorage) — follows the
 *  theme.js pattern: tiny lib module, try/catch-guarded storage, safe defaults.
 *
 *  Shape:
 *    courtsH   px height of the courts band (divider-courts)
 *    deckH     px height of the On Deck band (divider-deck) — expanded only
 *    deckOpen  On Deck collapsed (slim bar) vs expanded
 *    sidebarW  px width of the stats sidebar (divider-sidebar)
 */
const KEY = 'queuec-layout'

export const LAYOUT_DEFAULTS = {
  courtsH: 340,
  deckH: 220,
  deckOpen: true,
  sidebarW: 288, // the old w-72
}

export const LAYOUT_LIMITS = {
  courtsMin: 200,
  courtsMaxPct: 0.7, // of the window height
  sidebarMin: 200,
  sidebarMax: 420,
  deckMin: 120,
  queueMin: 160,
}

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v))
function load() {
  try {
    const raw = typeof localStorage !== 'undefined' ? localStorage.getItem(KEY) : null
    if (!raw) return { ...LAYOUT_DEFAULTS }
    const saved = JSON.parse(raw)
    return {
      courtsH: clamp(Number(saved.courtsH) || LAYOUT_DEFAULTS.courtsH, LAYOUT_LIMITS.courtsMin, 1000),
      deckH: clamp(Number(saved.deckH) || LAYOUT_DEFAULTS.deckH, LAYOUT_LIMITS.deckMin, 1000),
      deckOpen: typeof saved.deckOpen === 'boolean' ? saved.deckOpen : LAYOUT_DEFAULTS.deckOpen,
      sidebarW: clamp(Number(saved.sidebarW) || LAYOUT_DEFAULTS.sidebarW, LAYOUT_LIMITS.sidebarMin, LAYOUT_LIMITS.sidebarMax),
    }
  } catch {
    return { ...LAYOUT_DEFAULTS }
  }
}

function persist(state) {
  try {
    localStorage.setItem(KEY, JSON.stringify(state))
  } catch {}
}

/** Shared layout state + clamped update. `windowH` (from App's resize listener)
 *  keeps the courts band under its 70%-of-window max. */
export function useLayout() {
  const [layout, setLayout] = useState(load)

  const update = useCallback(patch => {
    setLayout(prev => {
      const delta = typeof patch === 'function' ? patch(prev) : patch
      const next = { ...prev, ...delta }
      persist(next)
      return next
    })
  }, [])

  return { layout, update }
}
