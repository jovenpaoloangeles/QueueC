import { cn } from '@/lib/utils'
import { EMPTY_DRAFT } from '@/lib/dnd'
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

export default function CourtsRow({
  session, courts, serverTime, activeMatches, queue, playSeconds,
  selection, drafts = {}, draftedIds = new Set(),
  onStartMatch, onDropPlayer, onDropSlot, onClearSlot, onClearDraft,
}) {
  // Expired courts stay on screen (pulsing red + "Extend +1 Hour"); an expired
  // court with a match in progress is the Last Game case — both need the card.
  // A staggered court waiting for its opens_at offset renders as "Opens in Xm".
  const liveCourts = courts.filter(c => {
    if (!c.enabled) return false
    if (isLive(c, serverTime)) return true
    if (c.active_from != null && serverTime < c.active_from) return true
    return c.expires_at != null && serverTime >= c.expires_at
  })
  const canStartSelection = selection?.length === 2 || selection?.length === 4

  // ponytail: >9 courts scroll the band; raise the breakpoint if a club ever needs it
  return (
    <div className={cn('grid h-full min-h-[300px] auto-rows-[minmax(260px,auto)] gap-4 overflow-y-auto',
      liveCourts.length <= 4 ? 'grid-cols-2' : 'grid-cols-3')}>
      {liveCourts.map(court => {
        const draft = drafts[court.id] ?? EMPTY_DRAFT
        const filled = draft.filter(Boolean)
        // drag-flow (draft) wins over click-flow (selection) when the draft can
        // start a match on its own (2 → singles, 4 → doubles); a half-built
        // draft (1 or 3) never silently discards a startable selection
        const useDraft = filled.length === 2 || filled.length === 4
        const startPlayers = useDraft ? filled : selection
        return (
          <CourtCard
            key={court.id}
            court={court}
            match={activeMatches.find(m => m.court_number === court.id) ?? null}
            queue={queue}
            playSeconds={playSeconds}
            canStart={useDraft || canStartSelection}
            onStartClick={() => onStartMatch(court.id, startPlayers, useDraft ? 'draft' : 'selection')}
            onStartSingles={() => onStartMatch(court.id, [filled[0], filled[1]], 'draft')}
            onDropPlayer={onDropPlayer}
            canDropPlayer={entryId => !draftedIds.has(entryId) && filled.length < 4}
            draft={draft}
            draftedIds={draftedIds}
            onDropSlot={(slotIdx, entryId) => onDropSlot(court.id, slotIdx, entryId)}
            onClearSlot={slotIdx => onClearSlot(court.id, slotIdx)}
            onClearDraft={() => onClearDraft(court.id)}
            serverTime={serverTime}
          />
        )
      })}
    </div>
  )
}
