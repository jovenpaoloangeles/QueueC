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
  deckOpen: false, // r5-2: On Deck starts collapsed — the slim bar; persisted toggles win
  sidebarW: 288, // the old w-72
}

export const LAYOUT_LIMITS = {
  courtsMin: 200,
  courtsMaxPct: 0.7, // of the window height
  sidebarMin: 200,
  sidebarMax: 420,
  sidebarMaxPct: 0.35, // of the window width — narrow windows clamp below sidebarMax
  deckMin: 120,
  queueMin: 340, // floor fits ~4 rows of compact queue cards (+ tab/header rows)
}

// Vertical chrome every band budget reserves: h-14 header (56) + main p-4 (32)
// + a row divider (5) + the collapsed On Deck slim bar (~36).
const CHROME_H = 130

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v))

/** Global band budget (r6): the max height one band may take given the window
 *  and the heights of the OTHER expanded vertical bands — the queue's floor
 *  always holds, so the live view never overflows the viewport. */
export function maxBandH(windowH, otherH = 0, floor = 0) {
  return Math.max(floor, windowH - CHROME_H - LAYOUT_LIMITS.queueMin - otherH)
}

/** Sidebar max for the current window width (fixed cap, pct-clamped below it). */
export function sidebarMaxW(windowW) {
  return clamp(Math.floor(windowW * LAYOUT_LIMITS.sidebarMaxPct), LAYOUT_LIMITS.sidebarMin, LAYOUT_LIMITS.sidebarMax)
}

/** Re-clamp a (persisted) layout into the CURRENT window's budget — the fixed
 *  1000px caps in load() alone let a tall-window layout overflow a short one.
 *  Returns the same object when nothing changes so callers can identity-skip. */
export function clampLayout(layout, windowH, windowW) {
  const courtsH = clamp(layout.courtsH, LAYOUT_LIMITS.courtsMin,
    maxBandH(windowH, layout.deckOpen ? layout.deckH : 0, LAYOUT_LIMITS.courtsMin))
  const deckH = clamp(layout.deckH, LAYOUT_LIMITS.deckMin,
    maxBandH(windowH, courtsH, LAYOUT_LIMITS.deckMin))
  const sidebarW = clamp(layout.sidebarW, LAYOUT_LIMITS.sidebarMin, sidebarMaxW(windowW))
  if (courtsH === layout.courtsH && deckH === layout.deckH && sidebarW === layout.sidebarW) return layout
  return { ...layout, courtsH, deckH, sidebarW }
}
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
