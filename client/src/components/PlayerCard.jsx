import { useState } from 'react'
import { drag, valid, useDragSource } from '@/lib/dnd'
import { cn, fmtClock, fmtMins, SKILL_BADGE } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'

export default function PlayerCard({ entry, waitSecs, selectionIndex, onClick, onDropOn }) {
  const dragProps = useDragSource(() => ({ kind: 'player', entryId: entry.id, status: entry.status }))
  const [over, setOver] = useState(false)
  const isSelected = selectionIndex !== undefined && selectionIndex !== -1

  return (
    <div
      {...dragProps}
      onClick={onClick}
      onDragOver={e => { e.preventDefault(); setOver(true) }}
      onDragLeave={() => setOver(false)}
      onDrop={e => {
        e.preventDefault(); setOver(false)
        const p = drag.current
        if (valid('queue')) onDropOn(p.entryId, entry.id)
      }}
      data-entry-id={entry.id}
      className={cn(
        'flex h-full min-h-[110px] cursor-pointer select-none flex-col justify-between gap-3 rounded-lg border p-3 transition-colors',
        isSelected
          ? 'border-accent-foreground/30 bg-accent ring-2 ring-primary/30'
          : 'border-border bg-card shadow-sm hover:border-border/80 hover:bg-muted/40',
        over && valid('queue') && 'border-drop-target-border bg-drop-target',
        over && drag.current && !valid('queue') && 'border-drop-invalid-border bg-drop-invalid'
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2">
          {isSelected && (
            <span className="flex size-5 items-center justify-center rounded-full bg-primary font-mono text-xs font-semibold text-primary-foreground">
              {selectionIndex + 1}
            </span>
          )}
          <span className="text-base font-medium text-foreground">{entry.name}</span>
        </div>
        <Badge className={cn('border-0 text-2xs', SKILL_BADGE[entry.skill_level] ?? SKILL_BADGE.intermediate)}>
          {entry.skill_level?.replace('_', ' ') ?? ''}
        </Badge>
      </div>
      <div className="flex items-baseline justify-between">
        <span className="font-mono text-sm tabular-nums text-foreground">{fmtClock(waitSecs ?? 0)}</span>
        <span className="text-xs text-muted-foreground">{fmtMins(entry.total_seconds_played ?? 0)} played</span>
      </div>
    </div>
  )
}
