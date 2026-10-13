import { useState, useEffect } from 'react'
import PlayerCard from './PlayerCard.jsx'
import { checkinPlayer, getPlayers, getSuggestion, setEntryStatus } from '../api.js'

export default function QueueGrid({ session, queue, waitSeconds, selection, onSelectionChange }) {
  const [mode, setMode] = useState('smart')
  const [allPlayers, setAllPlayers] = useState([])
  const [showCheckin, setShowCheckin] = useState(false)

  useEffect(() => { getPlayers().then(d => setAllPlayers(d.players)) }, [])

  // Apply smart suggestion when mode switches to smart or queue changes
  useEffect(() => {
    if (mode !== 'smart' || !session) return
    const waiting = queue.filter(e => e.status === 'waiting')
    const modeStr = waiting.length >= 4 ? 'doubles' : 'singles'
    getSuggestion(session.id, modeStr).then(d => {
      if (d.suggestion?.length) onSelectionChange(d.suggestion.filter(Boolean))
    })
  }, [mode, queue.length, session?.id])

  function toggleSelect(entryId) {
    if (selection.includes(entryId)) {
      onSelectionChange(selection.filter(id => id !== entryId))
    } else if (selection.length < 4) {
      onSelectionChange([...selection, entryId])
    }
  }

  const waiting = queue.filter(e => e.status === 'waiting')
  const resting = queue.filter(e => e.status === 'resting')
  const notInSession = allPlayers.filter(p => !queue.some(e => e.player_id === p.id))

  return (
    <div style={{ fontFamily: 'inherit', fontSize: 11 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
        <span style={{ color: '#334155', fontSize: 9, textTransform: 'uppercase', letterSpacing: 1 }}>
          Queue · {waiting.length} Waiting
          {selection.length > 0 && <span style={{ color: '#60a5fa', marginLeft: 8 }}>{selection.length} selected → {selection.length === 2 ? 'Singles' : selection.length === 4 ? 'Doubles' : '...'}</span>}
        </span>
        <div style={{ display: 'flex', gap: 4 }}>
          <button onClick={() => { setMode('manual'); onSelectionChange([]) }} style={{ background: mode === 'manual' ? '#1e293b' : '#0f172a', color: mode === 'manual' ? '#94a3b8' : '#334155', border: '1px solid #1e293b', borderRadius: 3, padding: '2px 6px', fontSize: 8, cursor: 'pointer', fontFamily: 'inherit' }}>Manual</button>
          <button onClick={() => setMode('smart')} style={{ background: mode === 'smart' ? '#172554' : '#0f172a', color: mode === 'smart' ? '#60a5fa' : '#334155', border: `1px solid ${mode === 'smart' ? '#1d4ed8' : '#1e293b'}`, borderRadius: 3, padding: '2px 6px', fontSize: 8, cursor: 'pointer', fontFamily: 'inherit' }}>● Smart</button>
          <button onClick={() => setShowCheckin(v => !v)} style={{ background: '#0f172a', color: '#475569', border: '1px solid #1e293b', borderRadius: 3, padding: '2px 6px', fontSize: 8, cursor: 'pointer', fontFamily: 'inherit', marginLeft: 6 }}>+ Check In</button>
        </div>
      </div>

      {showCheckin && notInSession.length > 0 && (
        <div style={{ marginBottom: 8, display: 'flex', flexWrap: 'wrap', gap: 4 }}>
          {notInSession.map(p => (
            <button key={p.id} onClick={async () => { await checkinPlayer(session.id, p.id); setShowCheckin(false) }}
              style={{ background: '#0f172a', color: '#64748b', border: '1px solid #1e293b', borderRadius: 3, padding: '2px 7px', fontSize: 9, cursor: 'pointer', fontFamily: 'inherit' }}>
              {p.name}
            </button>
          ))}
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 4 }}>
        {waiting.map(entry => (
          <PlayerCard
            key={entry.id}
            entry={entry}
            waitSecs={waitSeconds.get(entry.id) ?? 0}
            selectionIndex={selection.indexOf(entry.id)}
            onClick={e => e.shiftKey ? setEntryStatus(entry.id, 'resting') : toggleSelect(entry.id)}
          />
        ))}
      </div>

      {resting.length > 0 && (
        <div style={{ marginTop: 8 }}>
          <div style={{ color: '#1e293b', fontSize: 8, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 3 }}>Resting</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 3 }}>
            {resting.map(e => (
              <button key={e.id} onClick={() => setEntryStatus(e.id, 'waiting')}
                style={{ background: '#0f172a', color: '#475569', border: '1px solid #1e293b', borderRadius: 3, padding: '2px 7px', fontSize: 9, cursor: 'pointer', fontFamily: 'inherit' }}>
                {e.name} ↩
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
