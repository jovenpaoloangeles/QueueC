import { useState } from 'react'
import EndMatchModal from './EndMatchModal.jsx'

function fmt(s) {
  const m = Math.floor(s / 60), sec = s % 60
  return `${String(m).padStart(2,'0')}:${String(sec).padStart(2,'0')}`
}

function playerName(queue, entryId) {
  return queue.find(e => e.id === entryId)?.name ?? '?'
}

export default function CourtCard({ courtNumber, match, queue, playSeconds, onStartClick, canStart }) {
  const [showEnd, setShowEnd] = useState(false)
  const isActive = !!match
  const secs = isActive ? (playSeconds.get(match.id) ?? 0) : 0

  const border = isActive ? '1px solid #166534' : '1px solid #1e293b'
  const bg = isActive ? '#0d1f12' : '#0f172a'

  return (
    <div style={{ flex: 1, minWidth: 180, background: bg, border, borderRadius: 6, padding: '8px 10px', display: 'flex', flexDirection: 'column', gap: 4 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ color: isActive ? '#4ade80' : '#334155', fontSize: 9, fontWeight: 700, letterSpacing: 1 }}>
          {isActive ? '▶' : '·'} COURT {courtNumber}
        </span>
        {isActive && <span style={{ color: '#fbbf24', fontSize: 9, fontWeight: 600 }}>⏱ {fmt(secs)}</span>}
      </div>

      {isActive ? (
        <>
          <div style={{ color: '#86efac', fontSize: 10 }}>
            {playerName(queue, match.team1_p1)}{match.team1_p2 ? ` + ${playerName(queue, match.team1_p2)}` : ''}
            <span style={{ color: '#475569' }}> vs </span>
            {playerName(queue, match.team2_p1)}{match.team2_p2 ? ` + ${playerName(queue, match.team2_p2)}` : ''}
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ background: '#052e16', color: '#4ade80', fontSize: 9, padding: '1px 5px', borderRadius: 2 }}>
              {match.team1_score ?? 0} – {match.team2_score ?? 0}
            </span>
            <button
              onClick={() => setShowEnd(true)}
              style={{ background: '#7f1d1d', color: '#fca5a5', border: 'none', borderRadius: 3, padding: '2px 7px', fontSize: 9, cursor: 'pointer', fontFamily: 'inherit' }}
            >
              End Match
            </button>
          </div>
          {showEnd && <EndMatchModal match={match} onClose={() => setShowEnd(false)} />}
        </>
      ) : (
        <>
          <div style={{ color: '#334155', fontSize: 9, flex: 1 }}>Empty — select players from queue</div>
          <button
            onClick={() => onStartClick(courtNumber)}
            disabled={!canStart}
            style={{ background: canStart ? '#172554' : '#0f172a', color: canStart ? '#60a5fa' : '#1e293b', border: `1px solid ${canStart ? '#1d4ed8' : '#1e293b'}`, borderRadius: 3, padding: '3px', fontSize: 9, cursor: canStart ? 'pointer' : 'default', fontFamily: 'inherit' }}
          >
            ▶ Start Match
          </button>
        </>
      )}
    </div>
  )
}
