import { useState, useCallback, useEffect } from 'react'
import { useSSE } from './hooks/useSSE.js'
import { useTimers } from './hooks/useTimers.js'
import { startMatch, setQueueOrder, endSession, autoMatch } from './api.js'
import { useToast } from '@/components/Toast'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import Header from './components/Header.jsx'
import CourtsRow from './components/CourtsRow.jsx'
import QueueGrid from './components/QueueGrid.jsx'
import StatsSidebar from './components/StatsSidebar.jsx'
import CreateSessionModal from './components/CreateSessionModal.jsx'
import SetupScreen from './components/SetupScreen.jsx'

export default function App() {
  const [sseData, setSseData] = useState({ session: null, queue: [], activeMatches: [], courts: [], stats: null, serverTime: null })
  const [showCreate, setShowCreate] = useState(false)
  const [confirmNew, setConfirmNew] = useState(false) // both "+ Session" entry points gate on this
  const [selection, setSelection] = useState([])
  const [armedCourt, setArmedCourt] = useState(null)
  const [playersVersion, setPlayersVersion] = useState(0) // bumped after add-player so the pool refetches
  const [showAddPlayer, setShowAddPlayer] = useState(false) // dialog itself lands in Task 15

  const { session, queue, activeMatches, courts, stats } = sseData
  const toast = useToast()

  // header "✨ Smart Match": fill every free court, then slate one more lineup
  async function handleSmartMatch() {
    if (!session) return
    try {
      const r = await autoMatch(session.id)
      toast(`Started ${r.started} match(es)${r.slated ? ', slated next' : ''}`, 'success')
    } catch (err) {
      toast(err?.data?.error ?? (err?.status ? err.message : 'Auto-match failed'), 'error')
    }
  }

  async function handleStartMatch(courtNumber, sel) {
    if (!session) return
    const mapped = sel.length === 2 ? [sel[0], null, sel[1], null] : sel
    const [t1p1, t1p2, t2p1, t2p2] = mapped
    await startMatch({
      session_id: session.id,
      court_number: courtNumber,
      team1_p1: t1p1, team1_p2: t1p2 ?? null,
      team2_p1: t2p1, team2_p2: t2p2 ?? null
    })
    setSelection([])
    setArmedCourt(null) // after the await: a rejected start keeps the arm so the retry affordance survives
  }

  // arm-then-auto-start: accumulate the drop into selection; auto-start only at 4.
  // A 5th NEW player onto a full selection is invalid — change nothing (ruling: doubles at 4, singles via button).
  async function handleDropOnCourt(courtNumber, entryId) {
    if (selection.length >= 4 && !selection.includes(entryId)) return
    const next = selection.includes(entryId) ? selection : [...selection, entryId]
    setSelection(next)
    setArmedCourt(courtNumber)
    if (next.length === 4) {
      await handleStartMatch(courtNumber, next) // clears selection
      setArmedCourt(null)
    }
  }

  const handleReorder = useCallback(newOrder => {
    setQueueOrder(session.id, newOrder).catch(() => {}) // SSE keeps the truth on failure
  }, [session?.id])

  useSSE(useCallback(data => setSseData(data), []))

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
        onSmartMatch={handleSmartMatch}
        onAddPlayer={() => setShowAddPlayer(true)}
        onNewSession={() => setConfirmNew(true)}
        onEndSession={session ? () => endSession(session.id).catch(() => {}) : undefined}
      />
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
                onStartMatch={handleStartMatch}
                onDropPlayer={handleDropOnCourt}
                armedCourt={armedCourt}
                serverTime={sseData.serverTime ?? Math.floor(Date.now() / 1000)}
              />
            </div>
            <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
              <QueueGrid
                session={session}
                queue={queue}
                waitSeconds={waitSeconds}
                playSeconds={playSeconds}
                selection={selection}
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
