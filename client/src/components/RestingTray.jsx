import { useState } from 'react'
import { drag, valid, useDragSource } from '@/lib/dnd'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'

function RestingChip({ entry, onReturn }) {
  const dragProps = useDragSource(() => ({ kind: 'player', entryId: entry.id, status: 'resting' }))
  return (
    <Button variant="outline" size="sm" onClick={() => onReturn(entry.id)} {...dragProps}>
      {entry.name} ↩
    </Button>
  )
}

export default function RestingTray({ entries, onReturn, onDropEntry }) {
  const [isOver, setIsOver] = useState(false)
  return (
    <div
      data-drop="resting"
      onDragEnter={() => setIsOver(true)}
      onDragLeave={e => { if (!e.currentTarget.contains(e.relatedTarget)) setIsOver(false) }}
      onDrop={e => {
        e.preventDefault(); setIsOver(false)
        const p = drag.current
        if (valid('resting')) onDropEntry(p.entryId)
      }}
      className={cn(
        'shrink-0 rounded-lg border-2 border-dashed border-border bg-muted/30 px-4 py-3 transition-colors',
        isOver && valid('resting') && 'border-solid border-drop-target-border bg-drop-target ring-2 ring-drop-target-border',
        isOver && drag.current && !valid('resting') && 'border-solid border-drop-invalid-border bg-drop-invalid ring-2 ring-drop-invalid-border'
      )}
    >
      <div className="text-2xs font-medium uppercase tracking-wider text-muted-foreground">Resting</div>
      {entries.length === 0 ? (
        <p className="mt-1 text-xs text-muted-foreground">Drop a player here to bench them</p>
      ) : (
        <div className="mt-2 flex flex-wrap gap-2">
          {entries.map(e => (
            <RestingChip key={e.id} entry={e} onReturn={onReturn} />
          ))}
        </div>
      )}
    </div>
  )
}
