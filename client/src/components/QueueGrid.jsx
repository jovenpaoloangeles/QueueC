import { useState, useEffect, useMemo } from 'react'
import { drag, moveBefore } from '@/lib/dnd'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import PlayerCard from './PlayerCard.jsx'
import RestingTray from './RestingTray.jsx'
import { useToast } from './Toast.jsx'
import { checkinPlayer, getPlayers, getSuggestion, setEntryStatus } from '../api.js'

// mockup .queue-tabs: All = waiting + resting (playing entries live on courts),
// Wait = waiting only, Rest = resting only
const TABS = [
  { id: 'all', label: 'All', testid: 'queue-tab-all' },
  { id: 'wait', label: 'Wait', testid: 'queue-tab-wait' },
  { id: 'rest', label: 'Rest', testid: 'queue-tab-rest' },
]

export default function QueueGrid({ session, queue, waitSeconds, playSeconds, selection, draftedIds = new Set(), onSelectionChange, onReorder, playersVersion = 0 }) {
  const [mode, setMode] = useState('smart')
  const [allPlayers, setAllPlayers] = useState([])
  const [playersLoading, setPlayersLoading] = useState(true)
  const [showCheckin, setShowCheckin] = useState(false)
  const [order, setOrder] = useState([])
  const [tab, setTab] = useState('all')
  const [filter, setFilter] = useState('')
  const toast = useToast()

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
      .catch(() => {})
      .finally(() => setPlayersLoading(false))
  }, [playersVersion])

  // Apply smart suggestion when mode switches to smart, the waiting set
  // changes (queue.length never changes — playing entries stay in the array),
  // or a court draft claims players out from under the selection
  const waitingSig = queue.filter(e => e.status === 'waiting').map(e => e.id).join(',')
  useEffect(() => {
    if (mode !== 'smart' || !session) return
    const waiting = queue.filter(e => e.status === 'waiting')
    const modeStr = waiting.length >= 4 ? 'doubles' : 'singles'
    getSuggestion(session.id, modeStr).then(d => {
      // drafted players are already committed to a court — never (re-)select them
      if (d.suggestion?.length) {
        onSelectionChange(d.suggestion.filter(Boolean).filter(id => !draftedIds.has(id)))
      }
    }).catch(() => {}) // suggestion is best-effort
  }, [mode, waitingSig, session?.id, draftedIds])

  function toggleSelect(entryId) {
    if (draftedIds.has(entryId)) return // already drafted onto a court — selecting would double-book them
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
      .then(() => onSelectionChange(selection.filter(s => s !== id)))
      .catch(err => toast(err?.data?.error ?? 'Could not update', 'error'))
  }

  // Rest/Wake toggle on a queue row: waiting → resting (also leaves the
  // selection), resting → waiting. 409s (playing/staged) surface as toasts.
  function toggleRest(entry) {
    const next = entry.status === 'resting' ? 'waiting' : 'resting'
    setEntryStatus(entry.id, next)
      .then(() => {
        if (next === 'resting') onSelectionChange(selection.filter(s => s !== entry.id))
      })
      .catch(err => toast(err?.data?.error ?? 'Could not update', 'error'))
  }

  const waiting = queue.filter(e => e.status === 'waiting')
  const resting = queue.filter(e => e.status === 'resting')
  const notInSession = allPlayers.filter(p => !queue.some(e => e.player_id === p.id))
  // click-selected OR drag-drafted players both count as "picked" for the header line
  const pickedCount = new Set([...selection, ...draftedIds]).size

  const list = useMemo(() => {
    const idx = new Map(order.map((id, i) => [id, i]))
    const byOrder = (a, b) => (idx.get(a.id) ?? 1e9) - (idx.get(b.id) ?? 1e9)
    const base = tab === 'wait' ? waiting : tab === 'rest' ? resting : [...waiting, ...resting]
    const q = filter.trim().toLowerCase()
    return base
      .filter(e => !q || (e.name ?? '').toLowerCase().includes(q))
      .sort(byOrder)
  }, [waiting, resting, order, tab, filter])

  function handleDropOnPlayer(dragId, targetId) {
    if (drag.current?.status === 'resting') {
      setEntryStatus(dragId, 'waiting')
        .then(() => onSelectionChange(selection.filter(s => s !== dragId)))
        .catch(err => toast(err?.data?.error ?? 'Could not update', 'error'))
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

  const tabCount = id => (id === 'wait' ? waiting.length : id === 'rest' ? resting.length : waiting.length + resting.length)

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      <div className="flex items-center justify-between gap-3">
        <span className="text-sm font-semibold text-foreground">
          Queue · <span className="font-mono tabular-nums">{waiting.length}</span> Waiting
          {pickedCount > 0 && (
            <span className="ml-2 text-primary">
              {pickedCount} selected → {pickedCount === 2 ? 'Singles' : pickedCount === 4 ? 'Doubles' : '...'}
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

      {/* mockup panel-head controls: filter search + All/Wait/Rest segmented tabs */}
      <div className="flex flex-wrap items-center justify-end gap-2">
        <Input
          type="search"
          aria-label="Filter queue"
          placeholder="Filter queue…"
          value={filter}
          onChange={e => setFilter(e.target.value)}
          className="h-7 w-44 text-xs"
        />
        <div className="flex items-center gap-1 rounded-lg border bg-muted/40 p-1">
          {TABS.map(t => (
            <Button
              key={t.id}
              variant={tab === t.id ? 'outline' : 'ghost'}
              size="xs"
              data-testid={t.testid}
              className={cn('text-2xs', tab === t.id && 'bg-background shadow-sm')}
              onClick={() => setTab(t.id)}
            >
              {t.label} ({tabCount(t.id)})
            </Button>
          ))}
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
            playSecs={playSeconds?.get(entry.id) ?? 0}
            selectionIndex={selection.indexOf(entry.id)}
            drafted={draftedIds.has(entry.id)}
            onClick={e => {
              if (entry.status !== 'waiting') return // resting rows are not selectable
              if (e.shiftKey) {
                if (!draftedIds.has(entry.id)) bench(entry.id)
              } else {
                toggleSelect(entry.id)
              }
            }}
            onDropOn={handleDropOnPlayer}
            onToggleRest={toggleRest}
          />
        ))}
      </div>

      <RestingTray
        entries={resting}
        onReturn={id => setEntryStatus(id, 'waiting').catch(err => toast(err?.data?.error ?? 'Could not update', 'error'))}
        onDropEntry={bench}
      />
    </div>
  )
}
