import { useState } from 'react'
import { cn } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import EndMatchModal from './EndMatchModal.jsx'

function fmt(s) {
  const m = Math.floor(s / 60), sec = s % 60
  return `${String(m).padStart(2,'0')}:${String(sec).padStart(2,'0')}`
}

function playerName(queue, entryId) {
  return queue.find(e => e.id === entryId)?.name ?? '?'
}

export default function CourtCard({ courtNumber, match, queue, playSeconds, onStartClick, canStart }) {
  const [showEnd, setShowEnd] = useState(false)
  const isActive = !!match
  const secs = isActive ? (playSeconds.get(match.id) ?? 0) : 0

  return (
    <Card className={cn(
      'flex-1 min-w-[180px]',
      isActive ? 'border-green-800 bg-[#0d1f12]' : 'border-border bg-card'
    )}>
      <CardHeader className="p-2 pb-1 flex-row justify-between items-center">
        <span className={cn('text-[9px] font-bold tracking-widest', isActive ? 'text-primary' : 'text-muted-foreground/30')}>
          {isActive ? '▶' : '·'} COURT {courtNumber}
        </span>
        {isActive && (
          <span className="text-[9px] font-semibold text-yellow-400">⏱ {fmt(secs)}</span>
        )}
      </CardHeader>

      <CardContent className="p-2 pt-0 flex flex-col gap-1">
        {isActive ? (
          <>
            <div className="text-[10px] text-green-300">
              {playerName(queue, match.team1_p1)}{match.team1_p2 ? ` + ${playerName(queue, match.team1_p2)}` : ''}
              <span className="text-muted-foreground/40"> vs </span>
              {playerName(queue, match.team2_p1)}{match.team2_p2 ? ` + ${playerName(queue, match.team2_p2)}` : ''}
            </div>
            <div className="flex justify-between items-center">
              <Badge variant="outline" className="text-primary border-primary/20 bg-primary/5 text-[9px] px-1.5 py-0">
                {match.team1_score ?? 0} – {match.team2_score ?? 0}
              </Badge>
              <Button
                variant="destructive"
                size="xs"
                onClick={() => setShowEnd(true)}
              >
                End Match
              </Button>
            </div>
            {showEnd && <EndMatchModal match={match} onClose={() => setShowEnd(false)} />}
          </>
        ) : (
          <>
            <div className="text-[9px] text-muted-foreground/20 flex-1">Empty — select players from queue</div>
            <Button
              variant="outline"
              size="xs"
              onClick={() => onStartClick(courtNumber)}
              disabled={!canStart}
              className={cn(canStart && 'border-accent text-blue-400 hover:bg-accent/10')}
            >
              ▶ Start Match
            </Button>
          </>
        )}
      </CardContent>
    </Card>
  )
}
