/** In-flight drag payload. Read in dragover/drop — DataTransfer.getData is only
 *  readable on drop, so validity checks must go through this module state.
 *  ponytail: module-level, no context — one operator, one window, no re-renders on dragover */
export const drag = { current: null }

/** Shared empty lineup draft: slot order = [team1_p1, team1_p2, team2_p1, team2_p2]
 *  (Team A = slots 0,1; Team B = slots 2,3 — mockup .slotgrid). */
export const EMPTY_DRAFT = [null, null, null, null]

export function setDrag(payload) { drag.current = payload }
export function clearDrag() { drag.current = null }

const ACCEPTS = {
  'court':      p => p?.kind === 'player' && p.status === 'waiting',
  'resting':    p => p?.kind === 'player' && p.status === 'waiting',
  'queue':      p => p?.kind === 'player',
  'team':       p => p?.kind === 'team',
  // a lineup slot also takes resting players — the QM is pulling them out of rest to play
  'slot':       p => p?.kind === 'player' && (p.status === 'waiting' || p.status === 'resting'),
}

/** Can `payload` be dropped on `zone`? Zone is 'court' | 'resting' | 'queue' | 'team' | 'slot'. */
export function valid(zone, payload = drag.current) {
  return ACCEPTS[zone]?.(payload) ?? false
}

/** Spread onto a drag source element. */
export function useDragSource(payload) {
  return {
    draggable: true,
    onDragStart: e => {
      const p = typeof payload === 'function' ? payload() : payload
      setDrag(p)
      e.dataTransfer.effectAllowed = 'move'
      e.dataTransfer.setData('text/plain', JSON.stringify(p))
    },
    onDragEnd: () => clearDrag(),
  }
}

/** New team-slot object for a match after a cross-team move.
 *  Without `entryId`: full team swap. With `entryId`: that player swaps with the
 *  target team's same slot index (a null may be left behind — still a valid
 *  rearrangement). Same side, or an entry not on the match, is identity. */
export function rearrange(match, fromSide, toSide, entryId = null) {
  const slots = {
    team1_p1: match.team1_p1 ?? null,
    team1_p2: match.team1_p2 ?? null,
    team2_p1: match.team2_p1 ?? null,
    team2_p2: match.team2_p2 ?? null,
  }
  if (fromSide === toSide) return slots
  if (entryId == null) {
    return {
      team1_p1: slots.team2_p1,
      team1_p2: slots.team2_p2,
      team2_p1: slots.team1_p1,
      team2_p2: slots.team1_p2,
    }
  }
  const fromKey = ['team1_p1', 'team1_p2', 'team2_p1', 'team2_p2'].find(k => slots[k] === entryId)
  if (!fromKey) return slots
  const toKey = `team${toSide}_${fromKey.endsWith('p2') ? 'p2' : 'p1'}`
  const tmp = slots[toKey]
  slots[toKey] = slots[fromKey]
  slots[fromKey] = tmp
  return slots
}

/** New array with `dragId` spliced immediately before `targetId`. Pure. */
export function moveBefore(order, dragId, targetId) {
  const next = [...order]
  const from = next.indexOf(dragId)
  if (from === -1 || dragId === targetId) return next
  next.splice(from, 1)
  const to = next.indexOf(targetId)
  if (to === -1) return [...order]
  next.splice(to, 0, dragId)
  return next
}
