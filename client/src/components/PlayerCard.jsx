import { useState } from 'react'
import { drag, valid, useDragSource } from '@/lib/dnd'
import { cn, fmtClock, fmtMins, SKILL_BADGE } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'

const WAIT_HIGH_PRIORITY_THRESHOLD_SECS = 15 * 60 // configurable default: 15:00

export default function PlayerCard({ entry, waitSecs, selectionIndex, playSecs, onClick, onDropOn }) {
  const dragProps = useDragSource(() => ({ kind: 'player', entryId: entry.id, status: entry.status }))
  const [over, setOver] = useState(false)
  const isSelected = selectionIndex !== undefined && selectionIndex !== -1

  const isPlaying = entry.status === 'playing'
  const isWaiting = entry.status === 'waiting'
  const wait = waitSecs ?? 0
  const highPriority = isWaiting && wait >= WAIT_HIGH_PRIORITY_THRESHOLD_SECS
  const gamesPlayed = entry.games_played ?? 0

  let statusLabel, statusSeconds, statusClass
  if (isPlaying) {
    statusLabel = 'In Game'
    statusSeconds = playSecs ?? 0
    statusClass = 'bg-green-100 text-green-800 border-green-200'
  } else if (highPriority) {
    statusLabel = 'Overdue'
    statusSeconds = wait
    statusClass = 'bg-red-100 text-red-800 border-red-200'
  } else {
    statusLabel = 'Waiting'
    statusSeconds = wait
    statusClass = 'bg-amber-100 text-amber-800 border-amber-200'
  }

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
          <span
            className="flex size-5 shrink-0 items-center justify-center rounded-full bg-muted text-2xs font-semibold text-muted-foreground font-mono"
            title="Games played this session"
            data-testid="games-played-badge"
          >
            [{gamesPlayed}]
          </span>
          <span className="text-base font-medium text-foreground">{entry.name}</span>
        </div>
        <Badge data-testid="skill-badge" className={cn('border-0 text-2xs', SKILL_BADGE[entry.skill_level] ?? SKILL_BADGE.intermediate)}>
          {entry.skill_level?.replace('_', ' ') ?? ''}
        </Badge>
      </div>
      <div className="flex items-baseline justify-between">
        <Badge variant="outline" className={cn('font-mono tabular-nums text-2xs border', statusClass)} data-testid="status-timer-badge">
          {isPlaying ? '🟢' : (highPriority ? '🔴' : '🟡')} {fmtClock(statusSeconds)} ({statusLabel})
        </Badge>
        <span className="text-xs text-muted-foreground">{fmtMins(entry.total_seconds_played ?? 0)} played</span>
      </div>
    </div>
  )
}
