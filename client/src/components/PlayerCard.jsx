import { useState } from 'react'
import { drag, valid, useDragSource } from '@/lib/dnd'
import { cn, fmtClock, fmtMins, titleCaseSkill, TIER_CLASS } from '@/lib/utils'
import { Button } from '@/components/ui/button'

const WAIT_HIGH_PRIORITY_THRESHOLD_SECS = 15 * 60 // overdue threshold — unchanged
const WAIT_WARM_SECS = 6 * 60 // cosmetic mid tier for the wait strip; overdue logic untouched

export default function PlayerCard({ entry, waitSecs, selectionIndex, playSecs, isNext = false, onClick, onDropOn, onToggleRest }) {
  const dragProps = useDragSource(() => ({ kind: 'player', entryId: entry.id, status: entry.status }))
  const [over, setOver] = useState(false)
  const isSelected = selectionIndex !== undefined && selectionIndex !== -1

  const isPlaying = entry.status === 'playing'
  const isWaiting = entry.status === 'waiting'
  const isResting = entry.status === 'resting'
  const wait = waitSecs ?? 0
  const gamesPlayed = entry.games_played ?? 0
  const fairness = entry.fairness
  const avgRating = entry.avg_rating
  const starsOn = Math.max(0, Math.min(5, Math.round(Number(avgRating))))

  let statusLabel, statusSeconds
  // wait heat: left strip + timer ink (draft .waitbar / .wait colors)
  let heatBar, heatInk
  if (isPlaying) {
    statusLabel = 'In Game'
    statusSeconds = playSecs ?? 0
    heatBar = 'bg-primary/50'
    heatInk = 'text-green-deep'
  } else if (isResting) {
    statusLabel = 'Resting'
    statusSeconds = wait
    heatBar = 'bg-border'
    heatInk = 'text-muted-foreground'
  } else if (wait >= WAIT_HIGH_PRIORITY_THRESHOLD_SECS) {
    statusLabel = 'Overdue'
    statusSeconds = wait
    heatBar = 'bg-[#e2a48e] dark:bg-[#e06a52]/70'
    heatInk = 'text-destructive'
  } else if (wait >= WAIT_WARM_SECS) {
    statusLabel = 'Waiting'
    statusSeconds = wait
    heatBar = 'bg-[#ecd9a8] dark:bg-[#d9a441]/70'
    heatInk = 'text-amber'
  } else {
    statusLabel = 'Waiting'
    statusSeconds = wait
    heatBar = 'bg-wash-green'
    heatInk = 'text-primary'
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
        // draft .qcard: white card, 3px wait strip on the left rail, name over
        // tier, mono wait clock + Rest pill on the right, hairline meta row below
        'relative grid h-full cursor-pointer select-none grid-cols-[minmax(0,1fr)_auto] content-start gap-x-2.5 rounded-lg border border-border bg-card py-2.5 pl-4 pr-3 shadow-card transition-all duration-200 ease-out hover:shadow-lift',
        isSelected
          ? 'border-primary/30 bg-accent ring-2 ring-primary/30'
          : 'hover:border-foreground/15 dark:hover:border-foreground/20',
        isResting && 'opacity-70',
        isNext && !isSelected && 'border-court-live-border bg-gradient-to-b from-court-live to-card',
        over && valid('queue') && 'border-drop-target-border bg-drop-target',
        over && drag.current && !valid('queue') && 'border-drop-invalid-border bg-drop-invalid'
      )}
    >
      <span aria-hidden="true" className={cn('absolute bottom-2.5 left-1.5 top-2.5 w-[3px] rounded-full', heatBar)} />

      <div className="flex min-w-0 flex-col gap-1 pl-1">
        <div className="flex min-w-0 items-center gap-1.5">
          {isSelected && (
            <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-primary font-mono text-xs font-semibold text-primary-foreground">
              {selectionIndex + 1}
            </span>
          )}
          {/* .text-base.font-medium is load-bearing: helpers.getQueueNames + 06–14, 19, 26 read names through it */}
          <span className="truncate text-base font-medium text-foreground">{entry.name}</span>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <span data-testid="skill-badge" className={cn('tier', TIER_CLASS[entry.skill_level] ?? TIER_CLASS.intermediate)}>
            {titleCaseSkill(entry.skill_level)}
          </span>
          {isNext && (
            <span className="rounded-full bg-wash-green px-1.5 py-px text-2xs font-semibold text-green-deep">Up next</span>
          )}
          {isResting && (
            <span data-testid="resting-tag" className="text-2xs font-semibold uppercase tracking-wider text-muted-foreground">
              resting
            </span>
          )}
        </div>
      </div>

      <div className="flex shrink-0 flex-col items-end gap-1.5">
        {/* only element on a waiting card carrying font-mono AND tabular-nums — 14.2 reads it by that pair */}
        <div data-testid="status-timer-badge" className={cn('text-right font-mono text-base font-bold leading-none tabular-nums', heatInk)}>
          {fmtClock(statusSeconds)}
          <span className="mt-1 block font-sans text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            {statusLabel}
          </span>
        </div>
        {(isWaiting || isResting) && (
          <Button
            variant="secondary"
            size="xs"
            className="h-6 rounded-full px-2.5 text-xs font-medium"
            data-testid="rest-toggle"
            onClick={e => { e.stopPropagation(); onToggleRest?.(entry) }}
          >
            {isResting ? 'Wake' : 'Rest'}
          </Button>
        )}
      </div>

      {/* meta row: GP left · rating right, above a hairline (draft .line3) */}
      <div className="col-span-full mt-1 flex flex-wrap items-center justify-between gap-x-2 gap-y-0.5 border-t border-border/60 pt-1.5 text-2xs text-muted-foreground">
        <span className="flex min-w-0 flex-wrap items-center gap-x-2">
          <span className="shrink-0">
            GP <span className="font-semibold text-foreground" title="Games played this session" data-testid="games-played-badge">[{gamesPlayed}]</span>
          </span>
          <span data-testid="fairness" className="shrink-0">
            fairness{' '}
            {fairness != null ? (
              <span className="font-semibold tabular-nums text-foreground">{Number(fairness).toFixed(1)}</span>
            ) : (
              <span className="text-muted-foreground/60">—</span>
            )}
          </span>
          <span className="truncate">{fmtMins(entry.total_seconds_played ?? 0)} played</span>
        </span>
        {avgRating != null && (
          <span data-testid="avg-rating" className="flex shrink-0 items-center gap-1">
            <span aria-hidden="true" className="tracking-[0.1em] text-amber">{'★'.repeat(starsOn)}</span>
            <span aria-hidden="true" className="tracking-[0.1em] text-foreground/20">{'☆'.repeat(5 - starsOn)}</span>
            <span className={cn('font-mono text-2xs font-semibold', avgRating < 3.5 ? 'text-destructive' : 'text-foreground')}>
              {avgRating}
            </span>
          </span>
        )}
      </div>
    </div>
  )
}
