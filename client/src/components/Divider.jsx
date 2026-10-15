import { useCallback, useRef, useState } from 'react'
import { cn } from '@/lib/utils'

/**
 * Draggable bento divider (plain pointer events — dependency-light by design).
 *  axis:        'row' (horizontal bar, resizes height) | 'col' (vertical bar, resizes width)
 *  applyDelta:  (pxDelta) => void — called with signed deltas while dragging/arrowing
 *  hit:         px thickness of the hit area (4-6)
 */
export default function Divider({ axis = 'row', applyDelta, testid, label, hit = 5, className }) {
  const last = useRef(0)
  const [active, setActive] = useState(false)
  const vertical = axis === 'row'

  const onPointerDown = useCallback(e => {
    e.preventDefault()
    last.current = vertical ? e.clientY : e.clientX
    setActive(true)
    const move = ev => {
      const cur = vertical ? ev.clientY : ev.clientX
      applyDelta(cur - last.current)
      last.current = cur
    }
    const up = () => {
      setActive(false)
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      window.removeEventListener('pointercancel', up)
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
    }
    document.body.style.cursor = vertical ? 'row-resize' : 'col-resize'
    document.body.style.userSelect = 'none'
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
    window.addEventListener('pointercancel', up)
  }, [vertical, applyDelta])

  const onKeyDown = useCallback(e => {
    const step = e.shiftKey ? 32 : 16
    const back = vertical ? 'ArrowUp' : 'ArrowLeft'
    const fwd = vertical ? 'ArrowDown' : 'ArrowRight'
    if (e.key === back) { e.preventDefault(); applyDelta(-step) }
    else if (e.key === fwd) { e.preventDefault(); applyDelta(+step) }
  }, [vertical, applyDelta])

  return (
    <div
      role="separator"
      tabIndex={0}
      data-testid={testid}
      aria-label={label}
      aria-orientation={vertical ? 'horizontal' : 'vertical'}
      onPointerDown={onPointerDown}
      onKeyDown={onKeyDown}
      className={cn(
        'group relative z-10 flex shrink-0 items-center justify-center touch-none outline-none',
        vertical ? 'w-full cursor-row-resize' : 'h-full cursor-col-resize',
        vertical ? 'py-0' : 'px-0',
        className,
      )}
      style={vertical ? { height: hit } : { width: hit }}
    >
      {/* grip line — 1px quiet by default, accent + thicker on hover/focus/drag */}
      <span
        className={cn(
          'rounded-full transition-colors',
          vertical ? 'h-[3px] w-16' : 'h-16 w-[3px]',
          active
            ? 'bg-primary'
            : 'bg-border group-hover:bg-primary group-focus-visible:bg-primary',
        )}
      />
    </div>
  )
}
