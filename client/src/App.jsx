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

  async function handleStartMatch(courtNumber, sel) {
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

  const { session, queue, activeMatches, stats } = sseData

  return (
    <div className="flex flex-col h-screen overflow-hidden bg-background">
      <Header session={session} onNewSession={() => setShowCreate(true)} />
      {session && (
        <div className="flex flex-1 overflow-hidden">
          <div className="flex flex-col flex-1 overflow-hidden">
            <CourtsRow
              session={session}
              activeMatches={activeMatches}
              queue={queue}
              playSeconds={playSeconds}
              selection={selection}
              onStartMatch={handleStartMatch}
            />
            <div className="flex flex-1 overflow-hidden">
              <div className="flex-1 overflow-auto p-3">
                <QueueGrid
                  session={session}
                  queue={queue}
                  activeMatches={activeMatches}
                  waitSeconds={waitSeconds}
                  selection={selection}
                  onSelectionChange={setSelection}
                />
              </div>
              <div className="w-[180px] border-l border-border overflow-auto">
                <StatsSidebar stats={stats} />
              </div>
            </div>
          </div>
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
