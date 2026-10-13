import { useState } from 'react'
import { drag, valid, useDragSource, rearrange } from '@/lib/dnd'
import { cn, fmtClock } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { Empty, EmptyHeader, EmptyTitle, EmptyDescription } from '@/components/ui/empty'
import { updateMatchTeams } from '../api.js'
import EndMatchModal from './EndMatchModal.jsx'

function playerName(queue, entryId) {
  return queue.find(e => e.id === entryId)?.name ?? '?'
}

function TeamPlayer({ entryId, name }) {
  const dragProps = useDragSource(() => ({ kind: 'player', entryId, status: 'playing' }))
  return (
    <span
      {...dragProps}
      onDragStart={e => { e.stopPropagation(); dragProps.onDragStart(e) }}
    >
      {name}
    </span>
  )
}

function TeamPanel({ side, entryIds, queue, matchId, match }) {
  const dragProps = useDragSource(() => ({ kind: 'team', matchId, side }))
  const [over, setOver] = useState(false)
  const sideOf = id =>
    [match.team1_p1, match.team1_p2].includes(id) ? 1
    : [match.team2_p1, match.team2_p2].includes(id) ? 2 : null
  const p = drag.current
  const fromSide = p?.kind === 'player' ? sideOf(p.entryId) : null
  const canDrop = !!p && (p.kind === 'team'
    ? valid('team') && p.matchId === matchId && p.side !== side
    : fromSide != null && fromSide !== side)

  return (
    <div
      {...dragProps}
      data-drop={`team-${side}-m${matchId}`}
      data-team-side={side}
      data-match-id={matchId}
      onDragOver={e => { e.preventDefault(); setOver(true) }}
      onDragLeave={() => setOver(false)}
      onDrop={e => {
        e.preventDefault(); setOver(false)
        const q = drag.current
        if (!q) return
        if (q.kind === 'team') {
          if (valid('team') && q.matchId === matchId && q.side !== side) {
            updateMatchTeams(match.id, rearrange(match, q.side, side)).catch(() => {})
          }
        } else if (q.kind === 'player') {
          const from = sideOf(q.entryId)
          if (from != null && from !== side) {
            updateMatchTeams(match.id, rearrange(match, from, side, q.entryId)).catch(() => {})
          }
        }
      }}
      className={cn(
        'rounded-lg border border-border bg-card/80 px-4 py-3 transition-colors',
        over && canDrop && 'border-drop-target-border bg-drop-target',
        over && drag.current && !canDrop && 'border-drop-invalid-border bg-drop-invalid'
      )}
    >
      <div className="text-base font-medium">
        {entryIds.filter(Boolean).map((id, i) => (
          <span key={id}>
            {i > 0 && ' + '}
            <TeamPlayer entryId={id} name={playerName(queue, id)} />
          </span>
        ))}
      </div>
    </div>
  )
}

export default function CourtCard({ courtNumber, match, queue, playSeconds, onStartClick, canStart, onDropPlayer, armedEntryIds }) {
  const [showEnd, setShowEnd] = useState(false)
  const [over, setOver] = useState(false)
  const isActive = !!match
  const secs = isActive ? (playSeconds.get(match.id) ?? 0) : 0

  return (
    <Card
      data-drop={`court-${courtNumber}`}
      className={cn('flex flex-col border-border bg-card shadow-sm',
        isActive && 'border-court-live-border bg-court-live')}
    >
      {/* grid-cols wins outright (base has no unconditional grid-cols); items-center! is important so it beats base items-start regardless of emission order */}
      <CardHeader className="grid-cols-[1fr_auto] items-center! pb-3">
        <div className="flex items-center gap-2">
          <span className="text-2xs font-medium uppercase tracking-wider text-muted-foreground">Court {courtNumber}</span>
          {isActive && <Badge variant="outline" className="text-2xs uppercase">{match.format}</Badge>}
        </div>
        <div className="flex items-center gap-3">
          {isActive && <span className="font-mono text-sm tabular-nums text-foreground">{fmtClock(secs)}</span>}
          {isActive && (
            <Button variant="destructive" size="sm" onClick={() => setShowEnd(true)}>End Match</Button>
          )}
        </div>
      </CardHeader>

      {isActive && (
        <CardContent className="grid flex-1 grid-cols-[1fr_auto_1fr] items-center gap-4">
          <TeamPanel side={1} entryIds={[match.team1_p1, match.team1_p2]} queue={queue} matchId={match.id} match={match} />
          <div className="flex flex-col items-center gap-1">
            <span className="font-mono text-4xl tabular-nums text-foreground">
              {match.team1_score ?? 0}<span className="mx-2 text-muted-foreground/40">–</span>{match.team2_score ?? 0}
            </span>
            <span className="text-2xs uppercase tracking-wider text-muted-foreground">vs</span>
          </div>
          <TeamPanel side={2} entryIds={[match.team2_p1, match.team2_p2]} queue={queue} matchId={match.id} match={match} />
        </CardContent>
      )}

      {!isActive && (
        <CardContent
          data-drop={`court-${courtNumber}`}
          onDragOver={e => { e.preventDefault(); setOver(true) }}
          onDragLeave={() => setOver(false)}
          onDrop={e => {
            e.preventDefault(); setOver(false)
            const p = drag.current
            if (valid('court')) onDropPlayer(courtNumber, p.entryId)
          }}
          className={cn(
            'flex flex-1 flex-col items-center justify-center gap-2',
            over && valid('court') && 'bg-drop-target ring-2 ring-drop-target-border',
            over && drag.current && !valid('court') && 'bg-drop-invalid ring-2 ring-drop-invalid-border'
          )}
        >
          {armedEntryIds.length > 0 && (
            <div className="rounded-full border border-drop-target-border bg-drop-target/60 px-3 py-1 text-sm font-medium text-foreground">
              {armedEntryIds.map(id => playerName(queue, id)).join(' + ')}
            </div>
          )}
          <Empty className="border border-dashed border-border bg-muted/30 py-10">
            <EmptyHeader>
              <EmptyTitle className="text-base text-muted-foreground">
                {canStart ? 'Drop players here' : 'Select 2 or 4 players'}
              </EmptyTitle>
              <EmptyDescription className="text-xs">
                {canStart ? 'Or start with the players already selected' : 'Drag from the queue, or click to select'}
              </EmptyDescription>
            </EmptyHeader>
            <Button variant="outline" size="sm" onClick={() => onStartClick(courtNumber)} disabled={!canStart}>
              Start Match
            </Button>
          </Empty>
        </CardContent>
      )}

      {showEnd && match && <EndMatchModal match={match} onClose={() => setShowEnd(false)} />}
    </Card>
  )
}
