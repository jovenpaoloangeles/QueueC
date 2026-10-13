import { useState } from 'react'
import { cn, fmtClock } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { Empty, EmptyHeader, EmptyTitle, EmptyDescription } from '@/components/ui/empty'
import EndMatchModal from './EndMatchModal.jsx'

function playerName(queue, entryId) {
  return queue.find(e => e.id === entryId)?.name ?? '?'
}

function TeamPanel({ side, entryIds, queue, matchId }) {
  return (
    <div
      data-drop={`team-${side}-m${matchId}`}
      data-team-side={side}
      data-match-id={matchId}
      className="rounded-lg border border-border bg-card/80 px-4 py-3"
    >
      <div className="text-base font-medium">
        {entryIds.filter(Boolean).map(id => playerName(queue, id)).join(' + ')}
      </div>
    </div>
  )
}

export default function CourtCard({ courtNumber, match, queue, playSeconds, onStartClick, canStart }) {
  const [showEnd, setShowEnd] = useState(false)
  const isActive = !!match
  const secs = isActive ? (playSeconds.get(match.id) ?? 0) : 0

  return (
    <Card
      data-drop={`court-${courtNumber}`}
      className={cn('flex h-full flex-col border-border bg-card shadow-sm',
        isActive && 'border-court-live-border bg-court-live')}
    >
      <CardHeader className="flex flex-row items-center justify-between pb-3">
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
          <TeamPanel side={1} entryIds={[match.team1_p1, match.team1_p2]} queue={queue} matchId={match.id} />
          <div className="flex flex-col items-center gap-1">
            <span className="font-mono text-4xl tabular-nums text-foreground">
              {match.team1_score ?? 0}<span className="mx-2 text-muted-foreground/40">–</span>{match.team2_score ?? 0}
            </span>
            <span className="text-2xs uppercase tracking-wider text-muted-foreground">vs</span>
          </div>
          <TeamPanel side={2} entryIds={[match.team2_p1, match.team2_p2]} queue={queue} matchId={match.id} />
        </CardContent>
      )}

      {!isActive && (
        <CardContent data-drop={`court-${courtNumber}`} className="flex flex-1 items-center justify-center">
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

      {showEnd && <EndMatchModal match={match} onClose={() => setShowEnd(false)} />}
    </Card>
  )
}
