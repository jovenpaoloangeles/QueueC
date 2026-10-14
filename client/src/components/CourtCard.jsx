import { useState } from 'react'
import { drag, valid, useDragSource, rearrange } from '@/lib/dnd'
import { cn, fmtClock, fmtDur } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { Empty, EmptyHeader, EmptyTitle, EmptyDescription } from '@/components/ui/empty'
import { updateMatchTeams, updateCourt } from '../api.js'
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

export default function CourtCard({ court, match, queue, playSeconds, onStartClick, canStart, onDropPlayer, canDropPlayer, armedEntryIds, serverTime }) {
  const [showEnd, setShowEnd] = useState(false)
  const [over, setOver] = useState(false)
  const isActive = !!match
  const secs = isActive ? (playSeconds.get(match.id) ?? 0) : 0

  // Independent countdown expiration logic (remaining_ms = expires_at - now())
  const hasTimer = court.expires_at != null
  const remainingSecs = hasTimer ? Math.max(0, court.expires_at - (serverTime ?? Math.floor(Date.now() / 1000))) : null
  const isExpired = hasTimer && remainingSecs <= 0
  const isExpiring = isExpired && isActive // timer hit zero mid-game — Last Game

  // live check: drop may run before the dragover re-render flushes (batched), so never snapshot it
  const dropAllowed = () => valid('court') && canDropPlayer(drag.current?.entryId)
  const canAcceptNewMatch = !isExpired

  return (
    <Card
      data-drop={`court-${court.id}`}
      className={cn('flex flex-col border-border bg-card shadow-sm',
        isExpiring && 'border-amber-400 bg-amber-50/40',
        isActive && !isExpiring && 'border-court-live-border bg-court-live')}
    >
      {/* grid-cols wins outright (base has no unconditional grid-cols); items-center! is important so it beats base items-start regardless of emission order */}
      <CardHeader className="grid-cols-[1fr_auto] items-center! pb-3">
        <div className="flex items-center gap-2">
          <span className="text-2xs font-medium uppercase tracking-wider text-muted-foreground">{court.label}</span>
          {isActive && <Badge variant="outline" className="text-2xs uppercase">{match.format}</Badge>}
          {isExpiring && (
            <Badge className="border-0 bg-amber-100 text-amber-800 text-2xs uppercase" data-testid="expiring-last-game-badge">
              ⏳ Last Game
            </Badge>
          )}
        </div>
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-1 text-xs text-muted-foreground cursor-pointer select-none">
            <input
              type="checkbox"
              checked={!!court.enabled}
              onChange={e => updateCourt(court.id, { enabled: e.target.checked ? 1 : 0 }).catch(() => {})}
            />
            Open
          </label>
          {hasTimer && (
            <span
              className={cn(
                'font-mono text-sm tabular-nums',
                isExpired ? 'font-semibold text-red-600' : remainingSecs < 15 * 60 ? 'text-amber-600' : 'text-foreground'
              )}
              data-testid="court-countdown"
            >
              ⏱ {fmtDur(remainingSecs)}
            </span>
          )}
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
          data-drop={`court-${court.id}`}
          onDragOver={e => { if (canAcceptNewMatch) { e.preventDefault(); setOver(true) } }}
          onDragLeave={() => setOver(false)}
          onDrop={e => {
            e.preventDefault(); setOver(false)
            if (canAcceptNewMatch && dropAllowed()) onDropPlayer(court.id, drag.current.entryId)
          }}
          className={cn(
            'flex flex-1 flex-col items-center justify-center gap-2',
            isExpired && 'bg-red-50/60 opacity-80',
            over && canAcceptNewMatch && dropAllowed() && 'bg-drop-target ring-2 ring-drop-target-border',
            over && canAcceptNewMatch && drag.current && !dropAllowed() && 'bg-drop-invalid ring-2 ring-drop-invalid-border'
          )}
        >
          {isExpired ? (
            <Empty className="border border-dashed border-red-200 bg-red-50/40 py-10">
              <EmptyHeader>
                <EmptyTitle className="text-base text-red-700">Court Expired</EmptyTitle>
                <EmptyDescription className="text-xs text-red-600">
                  Timer has run out — removed from the available court pool.
                </EmptyDescription>
              </EmptyHeader>
            </Empty>
          ) : (
            <>
              {armedEntryIds.length > 0 && (
                <div className="flex items-center gap-2 rounded-full border border-drop-target-border bg-drop-target/60 px-3 py-1 text-sm font-medium text-foreground">
                  <span>{armedEntryIds.map(id => playerName(queue, id)).join(' + ')}</span>
                  {armedEntryIds.length === 2 && (
                    <Button size="xs" onClick={() => onStartClick(court.id)}>Start Singles</Button>
                  )}
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
                {armedEntryIds.length !== 2 && (
                  <Button variant="outline" size="sm" onClick={() => onStartClick(court.id)} disabled={!canStart}>
                    Start Match
                  </Button>
                )}
              </Empty>
            </>
          )}
        </CardContent>
      )}

      {showEnd && match && <EndMatchModal match={match} onClose={() => setShowEnd(false)} />}
    </Card>
  )
}
