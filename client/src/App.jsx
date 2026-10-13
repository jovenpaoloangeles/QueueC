import { useState, useCallback } from 'react'
import { useSSE } from './hooks/useSSE.js'
import { useTimers } from './hooks/useTimers.js'
import { startMatch } from './api.js'
import { Button } from '@/components/ui/button'
import Header from './components/Header.jsx'
import CourtsRow from './components/CourtsRow.jsx'
import QueueGrid from './components/QueueGrid.jsx'
import StatsSidebar from './components/StatsSidebar.jsx'
import CreateSessionModal from './components/CreateSessionModal.jsx'

export default function App() {
  const [sseData, setSseData] = useState({ session: null, queue: [], activeMatches: [], stats: null, serverTime: null })
  const [showCreate, setShowCreate] = useState(false)
  const [selection, setSelection] = useState([])

  const { session, queue, activeMatches, stats } = sseData

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
  }

  useSSE(useCallback(data => setSseData(data), []))

  const { waitSeconds, playSeconds } = useTimers(sseData.serverTime, sseData.queue, sseData.activeMatches)

  return (
    <div className="flex flex-col h-screen overflow-hidden bg-background">
      <Header session={session} onNewSession={() => setShowCreate(true)} />
      {session && (
        <div className="flex flex-1 overflow-hidden">
          <main className="flex min-w-0 flex-1 flex-col gap-4 overflow-hidden p-4">
            {/* band heights from the target arrangement: courts h-[45%] min-h-[300px], queue flex-1 */}
            <div className="grid h-[45%] min-h-[300px] shrink-0 overflow-hidden">
              <CourtsRow
                session={session}
                activeMatches={activeMatches}
                queue={queue}
                playSeconds={playSeconds}
                selection={selection}
                onStartMatch={handleStartMatch}
              />
            </div>
            <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
              <QueueGrid
                session={session}
                queue={queue}
                waitSeconds={waitSeconds}
                selection={selection}
                onSelectionChange={setSelection}
              />
            </div>
          </main>
          <aside className="w-72 shrink-0 overflow-y-auto border-l border-border bg-card">
            <StatsSidebar stats={stats} />
          </aside>
        </div>
      )}
      {!session && (
        <div className="flex-1 flex items-center justify-center">
          <Button size="lg" onClick={() => setShowCreate(true)}>
            + Start New Session
          </Button>
        </div>
      )}
      {showCreate && <CreateSessionModal onClose={() => setShowCreate(false)} />}
    </div>
  )
}
