import { cn } from '@/lib/utils'
import CourtCard from './CourtCard.jsx'

function isLive(court, serverTime) {
  if (!court.enabled) return false
  if (court.active_from != null && serverTime < court.active_from) return false
  if (court.active_until != null && serverTime >= court.active_until) return false
  // Independent countdown expiry: court removed from the active available pool
  // once remaining_ms <= 0, UNLESS a match is actively in progress (handled
  // gracefully in CourtCard via `isExpiring` — the card shows a Last Game badge
  // and remains visible until the active match ends).
  if (court.expires_at != null && serverTime >= court.expires_at) return false
  return true
}

export default function CourtsRow({ session, courts, serverTime, activeMatches, queue, playSeconds, selection, onStartMatch, onDropPlayer, armedCourt }) {
  const activeCourtIds = new Set(activeMatches.map(m => m.court_number))
  const liveCourts = courts.filter(c => isLive(c, serverTime) || (c.enabled && c.expires_at != null && serverTime >= c.expires_at && activeCourtIds.has(c.id)))
  const canStart = selection?.length === 2 || selection?.length === 4

  // ponytail: >9 courts scroll the band; raise the breakpoint if a club ever needs it
  return (
    <div className={cn('grid h-full min-h-[300px] auto-rows-[minmax(260px,auto)] gap-4 overflow-y-auto',
      liveCourts.length <= 4 ? 'grid-cols-2' : 'grid-cols-3')}>
      {liveCourts.map(court => (
        <CourtCard
          key={court.id}
          court={court}
          match={activeMatches.find(m => m.court_number === court.id) ?? null}
          queue={queue}
          playSeconds={playSeconds}
          canStart={canStart}
          onStartClick={courtId => onStartMatch(courtId, selection)}
          onDropPlayer={onDropPlayer}
          canDropPlayer={entryId => selection.length < 4 || selection.includes(entryId)}
          armedEntryIds={armedCourt === court.id ? selection : []}
          serverTime={serverTime}
        />
      ))}
    </div>
  )
}
