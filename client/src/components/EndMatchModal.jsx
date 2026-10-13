import { useState } from 'react'
import { endMatch } from '../api.js'

export default function EndMatchModal({ match, onClose }) {
  const [scores, setScores] = useState({ team1: match.team1_score ?? 0, team2: match.team2_score ?? 0 })
  const [loading, setLoading] = useState(false)

  async function submit(e) {
    e.preventDefault()
    setLoading(true)
    await endMatch(match.id, { team1_score: Number(scores.team1), team2_score: Number(scores.team2) })
    onClose()
  }

  const inp = { background: '#0a0f1a', border: '1px solid #1e293b', borderRadius: 4, color: '#f1f5f9', padding: '6px 8px', fontSize: 14, fontFamily: 'inherit', width: 60, textAlign: 'center' }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 }}>
      <form onSubmit={submit} style={{ background: '#0f172a', border: '1px solid #1e293b', borderRadius: 8, padding: 24, display: 'flex', flexDirection: 'column', gap: 16, fontFamily: 'inherit', minWidth: 240 }}>
        <h2 style={{ color: '#f1f5f9', fontSize: 14, fontWeight: 700 }}>End Match — Court {match.court_number}</h2>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, justifyContent: 'center' }}>
          <input type="number" min="0" max="99" style={inp} value={scores.team1} onChange={e => setScores(s => ({...s, team1: e.target.value}))} />
          <span style={{ color: '#475569', fontSize: 12 }}>–</span>
          <input type="number" min="0" max="99" style={inp} value={scores.team2} onChange={e => setScores(s => ({...s, team2: e.target.value}))} />
        </div>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button type="button" onClick={onClose} style={{ background: '#1e293b', color: '#94a3b8', border: '1px solid #334155', borderRadius: 4, padding: '6px 14px', fontSize: 11, cursor: 'pointer', fontFamily: 'inherit' }}>Cancel</button>
          <button type="submit" disabled={loading} style={{ background: '#166534', color: '#dcfce7', border: 'none', borderRadius: 4, padding: '6px 14px', fontSize: 11, cursor: 'pointer', fontFamily: 'inherit' }}>
            {loading ? '...' : 'Confirm'}
          </button>
        </div>
      </form>
    </div>
  )
}
