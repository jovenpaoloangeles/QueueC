import { useState, useEffect } from 'react'

function fmt(s) {
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60
  return `${h ? h + ':' : ''}${String(m).padStart(2,'0')}:${String(sec).padStart(2,'0')}`
}

export default function Header({ session, onNewSession }) {
  const [elapsed, setElapsed] = useState(0)

  useEffect(() => {
    if (!session) return
    const base = Math.floor(Date.now() / 1000) - session.started_at
    setElapsed(base)
    const id = setInterval(() => setElapsed(e => e + 1), 1000)
    return () => clearInterval(id)
  }, [session?.id])

  const fmtTime = ts => ts ? new Date(ts * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '—'

  return (
    <div style={{ background: '#0f172a', borderBottom: '1px solid #1e293b', padding: '6px 14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 11, fontFamily: 'inherit' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <span style={{ color: '#f1f5f9', fontWeight: 700, fontSize: 13 }}>🏸 QueueC</span>
        {session ? (
          <>
            <span style={{ color: '#475569' }}>·</span>
            <span style={{ color: '#94a3b8' }}>{session.name}</span>
            <span style={{ color: '#475569' }}>·</span>
            <span style={{ color: '#64748b' }}>{fmtTime(session.scheduled_start)}–{fmtTime(session.scheduled_end)}</span>
          </>
        ) : (
          <span style={{ color: '#334155' }}>No active session</span>
        )}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        {session && <span style={{ color: '#4ade80', fontSize: 10 }}>● {fmt(elapsed)}</span>}
        <button
          onClick={onNewSession}
          style={{ background: '#1e293b', color: '#94a3b8', border: '1px solid #334155', borderRadius: 4, padding: '3px 8px', fontSize: 10, cursor: 'pointer', fontFamily: 'inherit' }}
        >
          + Session
        </button>
      </div>
    </div>
  )
}
