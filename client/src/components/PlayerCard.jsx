import { useState } from 'react'
import { drag, valid, useDragSource } from '@/lib/dnd'
import { cn, fmtClock, fmtMins, titleCaseSkill, SKILL_BADGE } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'

const WAIT_HIGH_PRIORITY_THRESHOLD_SECS = 15 * 60 // configurable default: 15:00

export default function PlayerCard({ entry, waitSecs, selectionIndex, playSecs, onClick, onDropOn, onToggleRest }) {
  const dragProps = useDragSource(() => ({ kind: 'player', entryId: entry.id, status: entry.status }))
  const [over, setOver] = useState(false)
  const isSelected = selectionIndex !== undefined && selectionIndex !== -1

  const isPlaying = entry.status === 'playing'
  const isWaiting = entry.status === 'waiting'
  const isResting = entry.status === 'resting'
  const wait = waitSecs ?? 0
  const highPriority = isWaiting && wait >= WAIT_HIGH_PRIORITY_THRESHOLD_SECS
  const gamesPlayed = entry.games_played ?? 0
  const fairness = entry.fairness
  const avgRating = entry.avg_rating

  let statusLabel, statusSeconds, statusClass
  if (isPlaying) {
    statusLabel = 'In Game'
    statusSeconds = playSecs ?? 0
    statusClass = 'bg-green-100 text-green-800 border-green-200'
  } else if (isResting) {
    statusLabel = 'Resting'
    statusSeconds = wait
    statusClass = 'bg-muted text-muted-foreground border-border'
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
      // one status attribute per card: [data-entry-id] stays "waiting entries"
      // (tests 9.6 / 18.4), resting rows carry data-resting-id, playing rows
      // data-playing-id (All tab shows them but they are not queue-manageable)
      {...(isResting
        ? { 'data-resting-id': entry.id }
        : isPlaying
          ? { 'data-playing-id': entry.id }
          : { 'data-entry-id': entry.id })}
      className={cn(
        // r5-2 compact card: exactly 2 tight rows — Rest/Wake moved up beside the
        // skill badge, "Xm played" folded into the meta row; no wrapping
        'flex h-full cursor-pointer select-none flex-col gap-1 rounded-lg border p-1 transition-colors',
        isSelected
          ? 'border-accent-foreground/30 bg-accent ring-2 ring-primary/30'
          : 'border-border bg-card shadow-sm hover:border-border/80 hover:bg-muted/40',
        isResting && 'bg-muted/60 opacity-70',
        over && valid('queue') && 'border-drop-target-border bg-drop-target',
        over && drag.current && !valid('queue') && 'border-drop-invalid-border bg-drop-invalid'
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
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
          <span className="truncate text-base font-medium text-foreground">{entry.name}</span>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          {isResting && (
            <span data-testid="resting-tag" className="text-2xs font-semibold uppercase tracking-wider text-muted-foreground">
              resting
            </span>
          )}
          <Badge data-testid="skill-badge" className={cn('border-0 text-2xs', SKILL_BADGE[entry.skill_level] ?? SKILL_BADGE.intermediate)}>
            {titleCaseSkill(entry.skill_level)}
          </Badge>
          {isWaiting && (
            <Button
              variant="ghost"
              size="xs"
              data-testid="rest-toggle"
              onClick={e => { e.stopPropagation(); onToggleRest?.(entry) }}
            >
              Rest
            </Button>
          )}
          {isResting && (
            <Button
              variant="ghost"
              size="xs"
              data-testid="rest-toggle"
              onClick={e => { e.stopPropagation(); onToggleRest?.(entry) }}
            >
              Wake
            </Button>
          )}
        </div>
      </div>
      {/* wraps to a second meta line only on narrow cards — clipping silently
          hides "Xm played" otherwise */}
      <div className="flex flex-wrap items-center gap-x-1.5 text-2xs text-muted-foreground">
        <Badge variant="outline" className={cn('font-mono tabular-nums text-2xs border', statusClass)} data-testid="status-timer-badge">
          {isPlaying ? '🟢' : (highPriority ? '🔴' : '🟡')} {fmtClock(statusSeconds)} {statusLabel}
        </Badge>
        <span data-testid="fairness" className="shrink-0">
          fairness{' '}
          {fairness != null ? (
            <span className="font-semibold tabular-nums text-foreground">{Number(fairness).toFixed(1)}</span>
          ) : (
            <span className="text-muted-foreground/60">—</span>
          )}
        </span>
        <span className="shrink-0">
          <span className="font-semibold text-foreground">{gamesPlayed}</span> games
        </span>
        {avgRating != null && (
          <span data-testid="avg-rating" className="shrink-0 font-semibold text-amber-500">
            ★ {avgRating}
          </span>
        )}
        <span className="truncate">{fmtMins(entry.total_seconds_played ?? 0)} played</span>
      </div>
    </div>
  )
}
