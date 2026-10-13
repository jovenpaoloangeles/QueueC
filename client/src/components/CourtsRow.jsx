import { cn } from '@/lib/utils'
import CourtCard from './CourtCard.jsx'

export default function CourtsRow({ session, activeMatches, queue, playSeconds, selection, onStartMatch, onDropPlayer, armedCourt }) {
  const courts = Array.from({ length: session.court_count }, (_, i) => i + 1)
  const canStart = selection?.length === 2 || selection?.length === 4

  // ponytail: >9 courts scroll the band; raise the breakpoint if a club ever needs it
  return (
    <div className={cn('grid h-full min-h-[300px] gap-4 overflow-y-auto',
      session.court_count <= 4 ? 'grid-cols-2' : 'grid-cols-3')}>
      {courts.map(n => (
        <CourtCard
          key={n}
          courtNumber={n}
          match={activeMatches.find(m => m.court_number === n) ?? null}
          queue={queue}
          playSeconds={playSeconds}
          canStart={canStart}
          onStartClick={courtNum => onStartMatch(courtNum, selection)}
          onDropPlayer={onDropPlayer}
          armedEntryIds={armedCourt === n ? selection : []}
        />
      ))}
    </div>
  )
}
