import { useState, useCallback } from 'react'
import { useSSE } from './hooks/useSSE.js'
import { useTimers } from './hooks/useTimers.js'
import { startMatch } from './api.js'
import Header from './components/Header.jsx'
import CourtsRow from './components/CourtsRow.jsx'
import QueueGrid from './components/QueueGrid.jsx'
import StatsSidebar from './components/StatsSidebar.jsx'
import CreateSessionModal from './components/CreateSessionModal.jsx'

const styles = {
  app: { display: 'flex', flexDirection: 'column', height: '100vh', overflow: 'hidden' },
  body: { display: 'flex', flex: 1, overflow: 'hidden' },
  main: { flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' },
  bottom: { display: 'flex', flex: 1, overflow: 'hidden' },
  queueWrap: { flex: 1, overflow: 'auto', padding: '8px 12px' },
  sidebar: { width: 180, borderLeft: '1px solid #1e293b', overflow: 'auto' },
}

export default function App() {
  const [sseData, setSseData] = useState({ session: null, queue: [], activeMatches: [], stats: null, serverTime: null })
  const [showCreate, setShowCreate] = useState(false)
  const [selection, setSelection] = useState([])

  async function handleStartMatch(courtNumber, sel) {
    const [t1p1, t1p2, t2p1, t2p2] = sel
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
    <div style={styles.app}>
      <Header session={session} onNewSession={() => setShowCreate(true)} />
      {session && (
        <div style={styles.body}>
          <div style={styles.main}>
            <CourtsRow
              session={session}
              activeMatches={activeMatches}
              queue={queue}
              playSeconds={playSeconds}
              selection={selection}
              onStartMatch={handleStartMatch}
            />
            <div style={styles.bottom}>
              <div style={styles.queueWrap}>
                <QueueGrid
                  session={session}
                  queue={queue}
                  activeMatches={activeMatches}
                  waitSeconds={waitSeconds}
                  selection={selection}
                  onSelectionChange={setSelection}
                />
              </div>
              <div style={styles.sidebar}>
                <StatsSidebar stats={stats} />
              </div>
            </div>
          </div>
        </div>
      )}
      {!session && (
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <button
            onClick={() => setShowCreate(true)}
            style={{ background: '#166534', color: '#dcfce7', border: 'none', borderRadius: 6, padding: '12px 24px', fontSize: 14, cursor: 'pointer', fontFamily: 'inherit' }}
          >
            + Start New Session
          </button>
        </div>
      )}
      {showCreate && <CreateSessionModal onClose={() => setShowCreate(false)} />}
    </div>
  )
}
