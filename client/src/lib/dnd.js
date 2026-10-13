/** In-flight drag payload. Read in dragover/drop — DataTransfer.getData is only
 *  readable on drop, so validity checks must go through this module state.
 *  ponytail: module-level, no context — one operator, one window, no re-renders on dragover */
export const drag = { current: null }

export function setDrag(payload) { drag.current = payload }
export function clearDrag() { drag.current = null }

const ACCEPTS = {
  'court':      p => p?.kind === 'player' && p.status === 'waiting',
  'resting':    p => p?.kind === 'player' && p.status === 'waiting',
  'queue':      p => p?.kind === 'player',
  'team':       p => p?.kind === 'team',
}

/** Can `payload` be dropped on `zone`? Zone is 'court' | 'resting' | 'queue' | 'team'. */
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
