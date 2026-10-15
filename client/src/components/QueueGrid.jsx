import { useState, useEffect, useMemo } from 'react'
import { drag, moveBefore } from '@/lib/dnd'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import PlayerCard from './PlayerCard.jsx'
import PlayerSearchAdd from './PlayerSearchAdd.jsx'
import { useToast } from './Toast.jsx'
import { getPlayers, setEntryStatus } from '../api.js'

// mockup .queue-tabs: All = everything in the session (waiting + resting, then
// playing), Wait = waiting only, Rest = resting only
const TABS = [
  { id: 'all', label: 'All', testid: 'queue-tab-all' },
  { id: 'wait', label: 'Wait', testid: 'queue-tab-wait' },
  { id: 'rest', label: 'Rest', testid: 'queue-tab-rest' },
]

export default function QueueGrid({ session, queue, waitSeconds, playSeconds, selection, draftedIds = new Set(), onSelectionChange, onReorder, playersVersion = 0, onPlayersChanged }) {
  const [allPlayers, setAllPlayers] = useState([])
  const [playersLoading, setPlayersLoading] = useState(true)
  const [playersError, setPlayersError] = useState(false)
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

  function loadPlayers() {
    setPlayersLoading(true)
    setPlayersError(false)
    getPlayers()
      .then(d => setAllPlayers(d.players))
      .catch(() => setPlayersError(true))
      .finally(() => setPlayersLoading(false))
  }

  useEffect(() => {
    loadPlayers()
  }, [playersVersion])

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

  // drafted entries (court draft / on-deck builder) leave the list entirely —
  // they are not merely disabled
  const notDrafted = e => !draftedIds.has(e.id)
  const waiting = queue.filter(e => e.status === 'waiting' && notDrafted(e))
  const resting = queue.filter(e => e.status === 'resting' && notDrafted(e))
  const playing = queue.filter(e => e.status === 'playing' && notDrafted(e))
  // click-selected OR drag-drafted players both count as "picked" for the header line
  const pickedCount = new Set([...selection, ...draftedIds]).size

  const list = useMemo(() => {
    const idx = new Map(order.map((id, i) => [id, i]))
    const byOrder = (a, b) => (idx.get(a.id) ?? 1e9) - (idx.get(b.id) ?? 1e9)
    const base = tab === 'wait' ? waiting : tab === 'rest' ? resting : [...waiting, ...resting, ...playing]
    const q = filter.trim().toLowerCase()
    return base
      .filter(e => !q || (e.name ?? '').toLowerCase().includes(q))
      .sort(byOrder)
  }, [waiting, resting, playing, order, tab, filter])

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

  const tabCount = id => (id === 'wait' ? waiting.length : id === 'rest' ? resting.length : waiting.length + resting.length + playing.length)

  return (
    <div className="flex flex-col gap-2">
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
            variant="ghost"
            size="sm"
            data-testid="checkin-toggle"
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

      {/* search-driven check-in: nothing listed until the user types — the old
          full pool dump is gone. Stays open for multi-add; PlayerSearchAdd
          clears the query after each check-in / register. */}
      {showCheckin && (
        <div
          data-testid="checkin-panel"
          className="flex flex-col gap-2 rounded-lg border border-border bg-card p-3 shadow-sm"
        >
          {playersLoading ? (
            <div className="flex gap-2">
              <Skeleton className="h-8 w-full" />
            </div>
          ) : playersError ? (
            // pool failed to load — register-new-player still works via
            // PlayerSearchAdd, but the failure must be visible with a way out
            <div className="flex flex-col gap-2" data-testid="checkin-error">
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground">Couldn&apos;t load players.</span>
                <Button variant="outline" size="xs" onClick={loadPlayers}>Retry</Button>
              </div>
              <PlayerSearchAdd
                session={session}
                queue={queue}
                players={[]}
                onPlayersChanged={onPlayersChanged}
                onCheckedIn={p => toast(`Checked in: ${p.name}`, 'success')}
                inputTestid="checkin-search"
                requireConfirm
                placeholder="Search or add player…"
                maxMatches={8}
              />
            </div>
          ) : (
            <PlayerSearchAdd
              session={session}
              queue={queue}
              players={allPlayers}
              onPlayersChanged={onPlayersChanged}
              onCheckedIn={p => toast(`Checked in: ${p.name}`, 'success')}
              inputTestid="checkin-search"
              requireConfirm
              placeholder="Search or add player…"
              hint="Type to search registered players"
              maxMatches={8}
            />
          )}
        </div>
      )}

      {/* 3 cols at xl (4-col cards wrap their meta row); 4 only from 2xl where cards stay wide */}
      <div
        data-queue-list
        // dropping a resting chip on empty list space wakes it (rows handle their own drops)
        onDragOver={e => { if (drag.current?.status === 'resting') e.preventDefault() }}
        onDrop={e => {
          if (e.defaultPrevented || drag.current?.status !== 'resting') return
          e.preventDefault()
          handleDropOnPlayer(drag.current.entryId, null)
        }}
        className="grid auto-rows-min grid-cols-2 gap-1.5 lg:grid-cols-3 2xl:grid-cols-4">
        {list.map(entry => (
          <PlayerCard
            key={entry.id}
            entry={entry}
            waitSecs={waitSeconds.get(entry.id) ?? 0}
            playSecs={playSeconds?.get(entry.id) ?? 0}
            selectionIndex={selection.indexOf(entry.id)}
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
    </div>
  )
}
