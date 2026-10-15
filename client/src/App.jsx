import { useState, useCallback, useEffect, useMemo } from 'react'
import { useSSE } from './hooks/useSSE.js'
import { useTimers } from './hooks/useTimers.js'
import { EMPTY_DRAFT } from './lib/dnd.js'
import { useLayout, LAYOUT_LIMITS } from './lib/layout.js'
import { startMatch, setQueueOrder, endSession, autoMatch } from './api.js'
import { useToast } from '@/components/Toast'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import Header from './components/Header.jsx'
import CourtsRow from './components/CourtsRow.jsx'
import OnDeckStrip from './components/OnDeckStrip.jsx'
import QueueGrid from './components/QueueGrid.jsx'
import Divider from './components/Divider.jsx'
import StatsSidebar from './components/StatsSidebar.jsx'
import SetupScreen from './components/SetupScreen.jsx'
import AddPlayerDialog from './components/AddPlayerDialog.jsx'
import StartMatchConfirmDialog from './components/StartMatchConfirmDialog.jsx'

export default function App() {
  const [sseData, setSseData] = useState({ session: null, queue: [], activeMatches: [], slatedMatches: [], courts: [], stats: null, serverTime: null })
  const [confirmNew, setConfirmNew] = useState(false) // header "New Session": confirm ending the live session
  const [selection, setSelection] = useState([])
  // per-court lineup drafts: { [courtId]: [team1_p1, team1_p2, team2_p1, team2_p2] }
  // drag-flow only — the click-to-select `selection` above stays untouched for that flow
  const [drafts, setDrafts] = useState({})
  // live entry ids in the OnDeckStrip slate editor's draft — folded into
  // draftedIds so a court draft can't hold the same entry mid-edit
  const [slateDraftIds, setSlateDraftIds] = useState([])
  // live entry ids in the On Deck "Add to On Deck" builder (manual assign)
  const [builderDraftIds, setBuilderDraftIds] = useState([])
  const [playersVersion, setPlayersVersion] = useState(0) // bumped after add-player so the pool refetches
  const [showAddPlayer, setShowAddPlayer] = useState(false) // header "+ Add Player" → live add dialog

  const { session, queue, activeMatches, slatedMatches = [], courts, stats } = sseData
  const toast = useToast()
  // Pending start awaiting confirmation:
  //  { kind:'manual', courtId, sel, source, matches } | { kind:'smart', plan, matches, slate }
  const [pending, setPending] = useState(null)
  const [pendingBusy, setPendingBusy] = useState(false)

  const resolveTeam = ids => ids.map(id => {
    const e = queue.find(q => q.id === id)
    return { name: e?.name ?? '?', skill_level: e?.skill_level }
  })

  // header "✨ Smart Match": ask the server for a dry-run plan, confirm, then execute exactly it
  async function handleSmartMatch() {
    if (!session) return
    try {
      const { plan } = await autoMatch(session.id, { dry_run: true })
      if (!plan || (!plan.matches.length && !plan.slate.length)) {
        toast('Nothing to auto-match', 'info')
        return
      }
      setPending({
        kind: 'smart',
        plan,
        matches: plan.matches.map(m => ({
          courtLabel: m.court_label ?? courts.find(c => c.id === m.court_id)?.label ?? `Court ${m.court_id}`,
          format: m.format, team1: resolveTeam(m.team1), team2: resolveTeam(m.team2),
        })),
        slate: plan.slate.map(m => ({ format: m.format, team1: resolveTeam(m.team1), team2: resolveTeam(m.team2) })),
      })
    } catch (err) {
      toast(err?.data?.error ?? (err?.status ? err.message : 'Auto-match failed'), 'error')
    }
  }

  // On Deck "✨ Smart add" / builder "✨ Smart Match": slate-only dry run whose
  // first slate is poured into the On Deck builder for review — the builder IS
  // the review surface, so no confirm dialog and nothing is slated here.
  // Returns the 4 entry ids to fill (or null after toasting why not).
  async function handleSmartFill() {
    if (!session) return null
    try {
      const { plan } = await autoMatch(session.id, { dry_run: true, slate_only: true })
      const ids = plan?.slate?.[0] ? [plan.slate[0].team1[0], plan.slate[0].team1[1], plan.slate[0].team2[0], plan.slate[0].team2[1]] : null
      if (!ids || ids.some(id => id == null)) {
        toast('Nothing to add — need 4 waiting players', 'info')
        return null
      }
      return ids
    } catch (err) {
      toast(err?.data?.error ?? (err?.status ? err.message : 'Smart add failed'), 'error')
      return null
    }
  }

  async function confirmSmartMatch(plan, slateOnly = false) {
    setPendingBusy(true)
    try {
      const r = await autoMatch(session.id, slateOnly ? { plan, slate_only: true } : { plan })
      const parts = []
      if (r.started) parts.push(`Matched ${r.started} court${r.started === 1 ? '' : 's'}`)
      if (r.slated) parts.push(r.slated_count > 1 ? `added ${r.slated_count} lineups to On Deck` : 'added a lineup to On Deck')
      toast(parts.length ? parts.join(', ') : 'Nothing to auto-match', parts.length ? 'success' : 'info')
    } catch (err) {
      toast(err?.data?.error ?? (err?.status ? err.message : 'Auto-match failed'), 'error')
    } finally {
      setPendingBusy(false)
      setPending(null)
    }
  }

  async function confirmPending() {
    if (!pending || pendingBusy) return
    if (pending.kind === 'smart') return confirmSmartMatch(pending.plan)
    const { courtId, sel, source } = pending
    setPendingBusy(true)
    try {
      await handleStartMatch(courtId, sel, source)
    } finally {
      setPendingBusy(false)
      setPending(null)
    }
  }

  async function handleEndSession() {
    if (!session) return
    try {
      await endSession(session.id)
      setDrafts({}); setSelection([]); setSlateDraftIds([]); setBuilderDraftIds([]); setShowAddPlayer(false)
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
    setSelection([]); setSlateDraftIds([]); setBuilderDraftIds([])
    setShowAddPlayer(false); setConfirmNew(false)
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
    () => new Set([...Object.values(drafts).flat().filter(Boolean), ...slateDraftIds, ...builderDraftIds]),
    [drafts, slateDraftIds, builderDraftIds]
  )

  // Manual start gate: validate, then open the confirm dialog. Nothing starts
  // (and the draft/selection stays intact) until the user confirms.
  function requestStartMatch(courtNumber, sel, source = 'selection') {
    if (!session) return false
    const status = new Map(queue.map(e => [e.id, e.status]))
    const validIds = sel.filter(id => status.get(id) === 'waiting')
    if (validIds.length !== 2 && validIds.length !== 4) {
      toast('Not enough available players', 'error')
      return false
    }
    const team1 = validIds.length === 2 ? [validIds[0]] : validIds.slice(0, 2)
    const team2 = validIds.length === 2 ? [validIds[1]] : validIds.slice(2)
    const court = courts.find(c => c.id === courtNumber)
    setPending({
      kind: 'manual', courtId: courtNumber, sel, source,
      matches: [{
        courtLabel: court?.label ?? `Court ${courtNumber}`,
        format: validIds.length === 2 ? 'singles' : 'doubles',
        team1: resolveTeam(team1), team2: resolveTeam(team2),
      }],
      slate: [],
    })
    return true
  }

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

  // Slot drop → per-court draft on an idle court (live courts render no lineup
  // matrix). The 4th name opens the start confirmation; pre-building a lineup
  // for the next free court lives in the On Deck builder.
  function handleDropOnSlot(courtId, slotIdx, entryId) {
    const draft = drafts[courtId] ?? EMPTY_DRAFT
    if (draft[slotIdx] != null) return           // slot busy — clear it with ✕ first
    if (draft.includes(entryId)) return          // already drafted on this court
    if (draftedIds.has(entryId)) return          // drafted on another court
    const next = draft.map((v, i) => (i === slotIdx ? entryId : v))
    setDrafts(prev => ({ ...prev, [courtId]: next }))
    if (next.filter(Boolean).length === 4) {
      requestStartMatch(courtId, next, 'draft') // confirm dialog; draft cleared on confirmed success
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

  // bento layout: divider-managed band sizes, persisted in localStorage
  const { layout, update: updateLayout } = useLayout()
  const [windowH, setWindowH] = useState(() => (typeof window !== 'undefined' ? window.innerHeight : 800))
  useEffect(() => {
    const onResize = () => setWindowH(window.innerHeight)
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])
  const courtsMax = Math.max(LAYOUT_LIMITS.courtsMin, Math.floor(windowH * LAYOUT_LIMITS.courtsMaxPct))
  // the whole live view must fit on screen: courts + deck + queue (min) + paddings/gaps
  const deckMax = Math.max(
    LAYOUT_LIMITS.deckMin,
    windowH - layout.courtsH - LAYOUT_LIMITS.queueMin - 120,
  )
  // functional updates: divider drags fire many pointermove events between
  // re-renders — a stale `layout.courtsH` closure would drop all but the last
  const growCourts = d => updateLayout(prev => ({ courtsH: Math.min(courtsMax, Math.max(LAYOUT_LIMITS.courtsMin, prev.courtsH + d)) }))
  const growDeck = d => updateLayout(prev => ({ deckH: Math.min(deckMax, Math.max(LAYOUT_LIMITS.deckMin, prev.deckH + d)) }))
  const growSidebar = d => updateLayout(prev => ({ sidebarW: Math.min(LAYOUT_LIMITS.sidebarMax, Math.max(LAYOUT_LIMITS.sidebarMin, prev.sidebarW + d)) }))

  useEffect(() => {
    document.title = session?.name ? `${session.name} · QueueC` : 'QueueC'
  }, [session?.name])

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
      {(!session || session.started_at == null) && (
        <SetupScreen draft={session} />
      )}
      {session && session.started_at != null && (
        <div className="flex flex-1 overflow-hidden">
          <main className="flex min-w-0 flex-1 flex-col overflow-hidden p-4">
            {/* bento bands: heights from the persisted layout, resized via dividers */}
            <div
              className="shrink-0 overflow-hidden"
              style={{ height: layout.courtsH }}
            >
              <CourtsRow
                session={session}
                courts={courts}
                activeMatches={activeMatches}
                queue={queue}
                playSeconds={playSeconds}
                selection={selection}
                drafts={drafts}
                draftedIds={draftedIds}
                onStartMatch={requestStartMatch}
                onDropPlayer={handleDropOnCourt}
                onDropSlot={handleDropOnSlot}
                onClearSlot={clearSlot}
                onClearDraft={clearDraft}
                serverTime={sseData.serverTime ?? Math.floor(Date.now() / 1000)}
              />
            </div>
            <Divider
              axis="row"
              testid="divider-courts"
              label="Resize courts area"
              applyDelta={growCourts}
            />
            <OnDeckStrip
              key={session.id}
              slatedMatches={slatedMatches}
              queue={queue}
              draftedIds={draftedIds}
              onEditDraftChange={setSlateDraftIds}
              onBuilderDraftChange={setBuilderDraftIds}
              onSmartFill={handleSmartFill}
              sessionId={session.id}
              courts={courts}
              activeMatches={activeMatches}
              open={layout.deckOpen}
              height={layout.deckH}
              onToggleOpen={() => updateLayout({ deckOpen: !layout.deckOpen })}
            />
            {layout.deckOpen && (
              <Divider
                axis="row"
                testid="divider-deck"
                label="Resize on deck area"
                applyDelta={growDeck}
              />
            )}
            <div className="flex min-h-[160px] flex-1 flex-col overflow-hidden">
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
          <Divider
            axis="col"
            testid="divider-sidebar"
            label="Resize sidebar"
            applyDelta={growSidebar}
          />
          <aside
            className="shrink-0 overflow-y-auto border-l border-border bg-card"
            style={{ width: layout.sidebarW }}
          >
            <StatsSidebar stats={stats} />
          </aside>
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
      {pending && (
        <StartMatchConfirmDialog
          open
          onOpenChange={open => { if (!open && !pendingBusy) setPending(null) }}
          matches={pending.matches}
          slate={pending.slate}
          busy={pendingBusy}
          onConfirm={confirmPending}
        />
      )}
      {confirmNew && session?.started_at != null && (
        <Dialog open onOpenChange={open => !open && setConfirmNew(false)}>
          <DialogContent className="sm:max-w-xs">
            <DialogHeader>
              <DialogTitle>End current session and start a new one?</DialogTitle>
            </DialogHeader>
            <p className="text-xs text-muted-foreground">
              The live session will be ended and you&apos;ll return to the setup screen.
            </p>
            <div className="flex justify-end gap-2">
              <Button variant="outline" size="sm" onClick={() => setConfirmNew(false)}>Cancel</Button>
              <Button
                size="sm"
                variant="destructive"
                data-testid="confirm-new-session"
                onClick={() => { setConfirmNew(false); handleEndSession() }}
              >
                End &amp; New Session
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </div>
  )
}
