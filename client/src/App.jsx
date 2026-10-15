import { useState, useCallback, useEffect, useMemo } from 'react'
import { useSSE } from './hooks/useSSE.js'
import { useTimers } from './hooks/useTimers.js'
import { EMPTY_DRAFT } from './lib/dnd.js'
import { startMatch, slateMatch, setQueueOrder, endSession, autoMatch } from './api.js'
import { useToast } from '@/components/Toast'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import Header from './components/Header.jsx'
import CourtsRow from './components/CourtsRow.jsx'
import OnDeckStrip from './components/OnDeckStrip.jsx'
import QueueGrid from './components/QueueGrid.jsx'
import StatsSidebar from './components/StatsSidebar.jsx'
import CreateSessionModal from './components/CreateSessionModal.jsx'
import SetupScreen from './components/SetupScreen.jsx'
import AddPlayerDialog from './components/AddPlayerDialog.jsx'

export default function App() {
  const [sseData, setSseData] = useState({ session: null, queue: [], activeMatches: [], slatedMatches: [], courts: [], stats: null, serverTime: null })
  const [showCreate, setShowCreate] = useState(false)
  const [confirmNew, setConfirmNew] = useState(false) // both "+ Session" entry points gate on this
  const [selection, setSelection] = useState([])
  // per-court lineup drafts: { [courtId]: [team1_p1, team1_p2, team2_p1, team2_p2] }
  // drag-flow only — the click-to-select `selection` above stays untouched for that flow
  const [drafts, setDrafts] = useState({})
  // live entry ids in the OnDeckStrip slate editor's draft — folded into
  // draftedIds so a court draft can't hold the same entry mid-edit
  const [slateDraftIds, setSlateDraftIds] = useState([])
  const [playersVersion, setPlayersVersion] = useState(0) // bumped after add-player so the pool refetches
  const [showAddPlayer, setShowAddPlayer] = useState(false) // header "+ Add Player" → live add dialog

  const { session, queue, activeMatches, slatedMatches = [], courts, stats } = sseData
  const toast = useToast()

  // header "✨ Smart Match": fill every free court, then slate one more lineup
  async function handleSmartMatch() {
    if (!session) return
    try {
      const r = await autoMatch(session.id)
      const parts = []
      if (r.started) parts.push(`Matched ${r.started} court${r.started === 1 ? '' : 's'}`)
      if (r.slated) parts.push('slated next lineup')
      toast(parts.length ? parts.join(', ') : 'Nothing to auto-match', parts.length ? 'success' : 'info')
    } catch (err) {
      toast(err?.data?.error ?? (err?.status ? err.message : 'Auto-match failed'), 'error')
    }
  }

  async function handleEndSession() {
    if (!session) return
    try {
      await endSession(session.id)
      setDrafts({}); setSelection([]); setSlateDraftIds([]); setShowAddPlayer(false)
    } catch (err) {
      toast(err?.data?.error ?? 'Could not end session', 'error')
    }
  }

  const clearDraft = useCallback(courtId => setDrafts(prev => {
    if (!prev[courtId]?.some(Boolean)) return prev
    return { ...prev, [courtId]: EMPTY_DRAFT }
  }), [])

  const clearSlot = useCallback((courtId, slotIdx) => setDrafts(prev => {
    const cur = prev[courtId]
    if (!cur || cur[slotIdx] == null) return prev
    return { ...prev, [courtId]: cur.map((v, i) => (i === slotIdx ? null : v)) }
  }), [])

  // A new session invalidates every draft entry id (ids come from the old session's queue)
  useEffect(() => {
    setDrafts(prev => (Object.keys(prev).length ? {} : prev))
    setSelection([]); setSlateDraftIds([])
    setShowAddPlayer(false); setConfirmNew(false); setShowCreate(false)
  }, [session?.id])

  // Stale-draft pruning: a draft slot can outlive its entry (started elsewhere,
  // check-in undone, slated into a match). Keep waiting/resting entries — the
  // QM may still be assembling that lineup. Runs every SSE tick; identity-stable
  // when nothing needs pruning so it never causes a render loop.
  useEffect(() => {
    const status = new Map(queue.map(e => [e.id, e.status]))
    setDrafts(prev => {
      let changed = false
      const next = {}
      for (const [courtId, slots] of Object.entries(prev)) {
        const pruned = slots.map(id => {
          const st = id != null ? status.get(id) : 'waiting'
          if (st !== 'waiting' && st !== 'resting') { changed = true; return null }
          return id
        })
        next[courtId] = pruned
      }
      return changed ? next : prev
    })
  }, [queue])

  // Every entry id currently sitting in any court's draft OR in the OnDeck
  // strip's slate edit draft — excluded from the header waiting count so
  // drafted players don't look available.
  const draftedIds = useMemo(
    () => new Set([...Object.values(drafts).flat().filter(Boolean), ...slateDraftIds]),
    [drafts, slateDraftIds]
  )

  // sel: 2 ids → singles (each on its own team), 4 ids → doubles in slot order.
  // source: 'draft' | 'selection' — only the lineup actually used is cleared on
  // success, so a draft-based start never wipes an unrelated selection (and vice
  // versa). A failed start keeps the selection/draft so the QM can fix and retry.
  async function handleStartMatch(courtNumber, sel, source = 'selection') {
    if (!session) return false
    // Stale guard: a draft slot or selection can reference a player who already
    // started elsewhere since the last SSE tick — never double-book them.
    const status = new Map(queue.map(e => [e.id, e.status]))
    const validIds = sel.filter(id => status.get(id) === 'waiting')
    // anything but a full 2 or 4 lineup can't start (3 is a partial doubles)
    if (validIds.length !== 2 && validIds.length !== 4) {
      toast('Not enough available players', 'error')
      return false
    }
    const mapped = validIds.length === 2 ? [validIds[0], null, validIds[1], null] : validIds
    const [t1p1, t1p2, t2p1, t2p2] = mapped
    try {
      await startMatch({
        session_id: session.id,
        court_number: courtNumber,
        team1_p1: t1p1, team1_p2: t1p2 ?? null,
        team2_p1: t2p1, team2_p2: t2p2 ?? null
      })
      if (source === 'draft') clearDraft(courtNumber)
      else setSelection([])
      return true
    } catch (err) {
      toast(err?.data?.error ?? 'Could not start match', 'error')
      return false
    }
  }

  // Slot drop → per-court draft. Auto-start at 4 on an idle court; on an
  // occupied court the 4th name slates the lineup for the next free court.
  async function handleDropOnSlot(courtId, slotIdx, entryId) {
    const draft = drafts[courtId] ?? EMPTY_DRAFT
    if (draft[slotIdx] != null) return           // slot busy — clear it with ✕ first
    if (draft.includes(entryId)) return          // already drafted on this court
    if (draftedIds.has(entryId)) return          // drafted on another court
    const next = draft.map((v, i) => (i === slotIdx ? entryId : v))
    setDrafts(prev => ({ ...prev, [courtId]: next }))
    if (next.filter(Boolean).length < 4) return

    const occupied = activeMatches.some(m => m.court_number === courtId)
    if (!occupied) {
      await handleStartMatch(courtId, next, 'draft') // clears the draft on success
      return
    }
    try {
      await slateMatch({
        session_id: session.id,
        team1_p1: next[0], team1_p2: next[1],
        team2_p1: next[2], team2_p2: next[3],
      })
      toast('Slated — plays on next free court', 'success')
      clearDraft(courtId)
    } catch (err) {
      // keep the draft: the QM swaps the offending player and retries
      toast(err?.data?.error ?? 'Could not slate', 'error')
    }
  }

  // Legacy court-level drop target ([data-drop^="court-"]) → first empty slot.
  // A full court changes nothing (doubles at 4, singles via the Start Singles button).
  function handleDropOnCourt(courtId, entryId) {
    const draft = drafts[courtId] ?? EMPTY_DRAFT
    const idx = draft.findIndex(v => v == null)
    if (idx === -1) return
    handleDropOnSlot(courtId, idx, entryId)
  }

  const handleReorder = useCallback(newOrder => {
    setQueueOrder(session.id, newOrder).catch(err =>
      toast(err?.data?.error ?? 'Could not reorder queue', 'error')) // SSE keeps the truth
  }, [session?.id, toast])

  const [connected, setConnected] = useState(true)
  useSSE(useCallback(data => setSseData(data), []), setConnected)

  useEffect(() => {
    document.title = session?.name ? `${session.name} · QueueC` : 'QueueC'
  }, [session?.name])

  // close the "new session" modal as soon as SSE confirms a draft session arrived
  useEffect(() => {
    if (session != null) setShowCreate(false)
  }, [session])

  const { waitSeconds, playSeconds } = useTimers(sseData.serverTime, sseData.queue, sseData.activeMatches)

  return (
    <div className="flex flex-col h-screen overflow-hidden bg-background">
      <Header
        session={session}
        sseData={sseData}
        draftedIds={draftedIds}
        onSmartMatch={handleSmartMatch}
        onAddPlayer={() => setShowAddPlayer(true)}
        onNewSession={() => setConfirmNew(true)}
        onEndSession={session ? handleEndSession : undefined}
      />
      {!connected && (
        <div data-testid="sse-reconnecting" role="status" className="bg-muted px-4 py-1 text-center text-xs text-muted-foreground">
          Reconnecting…
        </div>
      )}
      {session && session.started_at == null && (
        <SetupScreen session={session} queue={queue} courts={courts} />
      )}
      {session && session.started_at != null && (
        <div className="flex flex-1 overflow-hidden">
          <main className="flex min-w-0 flex-1 flex-col gap-4 overflow-hidden p-4">
            {/* band heights from the target arrangement: courts h-[45%] min-h-[300px], queue flex-1 */}
            <div className="grid h-[45%] min-h-[300px] shrink-0 overflow-hidden">
              <CourtsRow
                session={session}
                courts={courts}
                activeMatches={activeMatches}
                queue={queue}
                playSeconds={playSeconds}
                selection={selection}
                drafts={drafts}
                draftedIds={draftedIds}
                onStartMatch={handleStartMatch}
                onDropPlayer={handleDropOnCourt}
                onDropSlot={handleDropOnSlot}
                onClearSlot={clearSlot}
                onClearDraft={clearDraft}
                serverTime={sseData.serverTime ?? Math.floor(Date.now() / 1000)}
              />
            </div>
            {slatedMatches.length > 0 && (
              <OnDeckStrip
                slatedMatches={slatedMatches}
                queue={queue}
                draftedIds={draftedIds}
                onEditDraftChange={setSlateDraftIds}
              />
            )}
            <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
              <QueueGrid
                session={session}
                queue={queue}
                waitSeconds={waitSeconds}
                playSeconds={playSeconds}
                selection={selection}
                draftedIds={draftedIds}
                onSelectionChange={setSelection}
                onReorder={handleReorder}
                playersVersion={playersVersion}
              />
            </div>
          </main>
          <aside className="w-72 shrink-0 overflow-y-auto border-l border-border bg-card">
            <StatsSidebar stats={stats} onPlayerAdded={() => setPlayersVersion(v => v + 1)} />
          </aside>
        </div>
      )}
      {!session && (
        <div className="flex flex-1 items-center justify-center">
          <Button size="lg" onClick={() => setConfirmNew(true)}>
            + Start New Session
          </Button>
        </div>
      )}
      {showAddPlayer && session && session.started_at != null && (
        <AddPlayerDialog
          session={session}
          queue={queue}
          onClose={() => setShowAddPlayer(false)}
          onPlayersChanged={() => setPlayersVersion(v => v + 1)}
        />
      )}
      {confirmNew && (
        <Dialog open onOpenChange={open => !open && setConfirmNew(false)}>
          <DialogContent className="sm:max-w-xs">
            <DialogHeader>
              <DialogTitle>Start a new session?</DialogTitle>
            </DialogHeader>
            {session && (
              <p className="text-xs text-muted-foreground">
                The current session will be replaced in the header.
              </p>
            )}
            <div className="flex justify-end gap-2">
              <Button variant="outline" size="sm" onClick={() => setConfirmNew(false)}>Cancel</Button>
              <Button size="sm" onClick={() => { setConfirmNew(false); setShowCreate(true) }}>
                Continue
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      )}
      {showCreate && <CreateSessionModal onClose={() => setShowCreate(false)} />}
    </div>
  )
}
