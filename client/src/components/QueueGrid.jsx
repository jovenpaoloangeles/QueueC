import { useState, useEffect, useMemo } from 'react'
import { drag, moveBefore } from '@/lib/dnd'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import PlayerCard from './PlayerCard.jsx'
import RestingTray from './RestingTray.jsx'
import { checkinPlayer, getPlayers, getSuggestion, setEntryStatus } from '../api.js'

export default function QueueGrid({ session, queue, waitSeconds, selection, onSelectionChange, onReorder, playersVersion = 0 }) {
  const [mode, setMode] = useState('smart')
  const [allPlayers, setAllPlayers] = useState([])
  const [playersLoading, setPlayersLoading] = useState(true)
  const [showCheckin, setShowCheckin] = useState(false)
  const [order, setOrder] = useState([])

  // order survives SSE pushes (every 1s): initialise once from the first
  // non-empty queue, thereafter only append genuinely new entry ids
  useEffect(() => {
    setOrder(prev => {
      if (prev.length === 0) return queue.map(e => e.id)
      const known = new Set(prev)
      const fresh = queue.map(e => e.id).filter(id => !known.has(id))
      return fresh.length ? [...prev, ...fresh] : prev
    })
  }, [queue])

  useEffect(() => {
    getPlayers()
      .then(d => setAllPlayers(d.players))
      .finally(() => setPlayersLoading(false))
  }, [playersVersion])

  // Apply smart suggestion when mode switches to smart or the waiting set
  // changes (queue.length never changes — playing entries stay in the array)
  const waitingSig = queue.filter(e => e.status === 'waiting').map(e => e.id).join(',')
  useEffect(() => {
    if (mode !== 'smart' || !session) return
    const waiting = queue.filter(e => e.status === 'waiting')
    const modeStr = waiting.length >= 4 ? 'doubles' : 'singles'
    getSuggestion(session.id, modeStr).then(d => {
      if (d.suggestion?.length) onSelectionChange(d.suggestion.filter(Boolean))
    })
  }, [mode, waitingSig, session?.id])

  function toggleSelect(entryId) {
    if (selection.includes(entryId)) {
      onSelectionChange(selection.filter(id => id !== entryId))
    } else if (selection.length < 4) {
      onSelectionChange([...selection, entryId])
    }
  }

  // benching must also leave the selection, or handleStartMatch would put a
  // resting player on court
  function bench(id) {
    setEntryStatus(id, 'resting')
    onSelectionChange(selection.filter(s => s !== id))
  }

  const waiting = queue.filter(e => e.status === 'waiting')
  const resting = queue.filter(e => e.status === 'resting')
  const notInSession = allPlayers.filter(p => !queue.some(e => e.player_id === p.id))

  const list = useMemo(() => {
    const idx = new Map(order.map((id, i) => [id, i]))
    return [...waiting].sort((a, b) => (idx.get(a.id) ?? 1e9) - (idx.get(b.id) ?? 1e9))
  }, [waiting, order])

  function handleDropOnPlayer(dragId, targetId) {
    if (drag.current?.status === 'resting') {
      setEntryStatus(dragId, 'waiting')
      return
    }
    const next = moveBefore(order, dragId, targetId)
    setOrder(next)
    // full session order, every entry id exactly once, built after the local reorder
    const waitingIds = new Set(waiting.map(e => e.id))
    const waitingInOrder = next.filter(id => waitingIds.has(id))
    const restingIds = resting.map(e => e.id)
    const playingIds = queue.filter(e => e.status === 'playing').map(e => e.id)
    onReorder([...waitingInOrder, ...restingIds, ...playingIds])
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      <div className="flex items-center justify-between gap-3">
        <span className="text-sm font-semibold text-foreground">
          Queue · <span className="font-mono tabular-nums">{waiting.length}</span> Waiting
          {selection.length > 0 && (
            <span className="ml-2 text-primary">
              {selection.length} selected → {selection.length === 2 ? 'Singles' : selection.length === 4 ? 'Doubles' : '...'}
            </span>
          )}
        </span>
        <div className="flex gap-2">
          <Button
            variant={mode === 'manual' ? 'outline' : 'ghost'}
            size="sm"
            onClick={() => { setMode('manual'); onSelectionChange([]) }}
          >
            Manual
          </Button>
          <Button
            variant={mode === 'smart' ? 'outline' : 'ghost'}
            size="sm"
            onClick={() => setMode('smart')}
            className={cn(mode === 'smart' && 'border-accent text-primary')}
          >
            ● Smart
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setShowCheckin(v => !v)}
          >
            + Check In
          </Button>
        </div>
      </div>

      {showCheckin && playersLoading && (
        <div className="flex flex-wrap gap-2">
          <Skeleton className="h-6 w-24" />
          <Skeleton className="h-6 w-20" />
          <Skeleton className="h-6 w-28" />
        </div>
      )}

      {showCheckin && !playersLoading && notInSession.length > 0 && (
        <div className="flex flex-wrap gap-2">
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

      <div className="grid auto-rows-min content-start flex-1 grid-cols-2 gap-3 overflow-y-auto lg:grid-cols-3 xl:grid-cols-4">
        {list.map(entry => (
          <PlayerCard
            key={entry.id}
            entry={entry}
            waitSecs={waitSeconds.get(entry.id) ?? 0}
            selectionIndex={selection.indexOf(entry.id)}
            onClick={e => e.shiftKey ? bench(entry.id) : toggleSelect(entry.id)}
            onDropOn={handleDropOnPlayer}
          />
        ))}
      </div>

      <RestingTray
        entries={resting}
        onReturn={id => setEntryStatus(id, 'waiting')}
        onDropEntry={bench}
      />
    </div>
  )
}
