import { useState, useEffect } from 'react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import PlayerCard from './PlayerCard.jsx'
import { checkinPlayer, getPlayers, getSuggestion, setEntryStatus } from '../api.js'

export default function QueueGrid({ session, queue, waitSeconds, selection, onSelectionChange }) {
  const [mode, setMode] = useState('smart')
  const [allPlayers, setAllPlayers] = useState([])
  const [showCheckin, setShowCheckin] = useState(false)

  useEffect(() => { getPlayers().then(d => setAllPlayers(d.players)) }, [])

  // Apply smart suggestion when mode switches to smart or queue changes
  useEffect(() => {
    if (mode !== 'smart' || !session) return
    const waiting = queue.filter(e => e.status === 'waiting')
    const modeStr = waiting.length >= 4 ? 'doubles' : 'singles'
    getSuggestion(session.id, modeStr).then(d => {
      if (d.suggestion?.length) onSelectionChange(d.suggestion.filter(Boolean))
    })
  }, [mode, queue.length, session?.id])

  function toggleSelect(entryId) {
    if (selection.includes(entryId)) {
      onSelectionChange(selection.filter(id => id !== entryId))
    } else if (selection.length < 4) {
      onSelectionChange([...selection, entryId])
    }
  }

  const waiting = queue.filter(e => e.status === 'waiting')
  const resting = queue.filter(e => e.status === 'resting')
  const notInSession = allPlayers.filter(p => !queue.some(e => e.player_id === p.id))

  return (
    <div className="text-xs">
      <div className="flex justify-between items-center mb-1.5">
        <span className="text-[9px] text-muted-foreground/30 uppercase tracking-widest">
          Queue · {waiting.length} Waiting
          {selection.length > 0 && (
            <span className="text-blue-400 ml-2">
              {selection.length} selected → {selection.length === 2 ? 'Singles' : selection.length === 4 ? 'Doubles' : '...'}
            </span>
          )}
        </span>
        <div className="flex gap-1">
          <Button
            variant={mode === 'manual' ? 'outline' : 'ghost'}
            size="xs"
            onClick={() => { setMode('manual'); onSelectionChange([]) }}
          >
            Manual
          </Button>
          <Button
            variant={mode === 'smart' ? 'outline' : 'ghost'}
            size="xs"
            onClick={() => setMode('smart')}
            className={cn(mode === 'smart' && 'border-accent text-blue-400')}
          >
            ● Smart
          </Button>
          <Button
            variant="ghost"
            size="xs"
            className="ml-1.5"
            onClick={() => setShowCheckin(v => !v)}
          >
            + Check In
          </Button>
        </div>
      </div>

      {showCheckin && notInSession.length > 0 && (
        <div className="mb-2 flex flex-wrap gap-1">
          {notInSession.map(p => (
            <Button
              key={p.id}
              variant="outline"
              size="xs"
              onClick={async () => { await checkinPlayer(session.id, p.id); setShowCheckin(false) }}
            >
              {p.name}
            </Button>
          ))}
        </div>
      )}

      <div className="grid grid-cols-2 gap-1">
        {waiting.map(entry => (
          <PlayerCard
            key={entry.id}
            entry={entry}
            waitSecs={waitSeconds.get(entry.id) ?? 0}
            selectionIndex={selection.indexOf(entry.id)}
            onClick={e => e.shiftKey ? setEntryStatus(entry.id, 'resting') : toggleSelect(entry.id)}
          />
        ))}
      </div>

      {resting.length > 0 && (
        <div className="mt-2">
          <div className="text-[8px] text-muted-foreground/20 uppercase tracking-widest mb-0.5">Resting</div>
          <div className="flex flex-wrap gap-1">
            {resting.map(e => (
              <Button
                key={e.id}
                variant="outline"
                size="xs"
                onClick={() => setEntryStatus(e.id, 'waiting')}
              >
                {e.name} ↩
              </Button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
