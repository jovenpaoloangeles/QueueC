import { useState, useCallback } from 'react'
import { useSSE } from './hooks/useSSE.js'
import { useTimers } from './hooks/useTimers.js'
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
            />
            <div style={styles.bottom}>
              <div style={styles.queueWrap}>
                <QueueGrid
                  session={session}
                  queue={queue}
                  activeMatches={activeMatches}
                  waitSeconds={waitSeconds}
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
