import { useState } from 'react'
import { createPlayer } from '../api.js'

const SKILL_LEVELS = ['newbie', 'beginner', 'intermediate', 'upper_intermediate', 'advanced']

function fmtWait(s) {
  if (!s) return '0m'
  const m = Math.floor(s / 60)
  return m < 60 ? `${m}m` : `${Math.floor(m/60)}h ${m%60}m`
}

export default function StatsSidebar({ stats }) {
  const [showAdd, setShowAdd] = useState(false)
  const [form, setForm] = useState({ name: '', skill_level: 'intermediate' })
  const [saving, setSaving] = useState(false)

  async function addPlayer(e) {
    e.preventDefault()
    setSaving(true)
    await createPlayer(form)
    setForm({ name: '', skill_level: 'intermediate' })
    setSaving(false)
    setShowAdd(false)
  }

  const cell = { background: '#0f172a', border: '1px solid #1e293b', borderRadius: 4, padding: '6px 8px', textAlign: 'center', marginBottom: 4 }
  const inp = { background: '#0a0f1a', border: '1px solid #1e293b', borderRadius: 3, color: '#f1f5f9', padding: '4px 6px', fontSize: 10, fontFamily: 'inherit', width: '100%' }

  return (
    <div style={{ padding: '8px 8px', fontFamily: 'inherit', fontSize: 10, display: 'flex', flexDirection: 'column', gap: 4 }}>
      <div style={{ color: '#1e293b', fontSize: 7, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 2 }}>Session</div>

      <div style={cell}>
        <div style={{ color: '#334155', fontSize: 7 }}>Players</div>
        <div style={{ color: '#f1f5f9', fontSize: 18, fontWeight: 700, lineHeight: 1.2 }}>{stats?.player_count ?? 0}</div>
      </div>
      <div style={cell}>
        <div style={{ color: '#334155', fontSize: 7 }}>Matches</div>
        <div style={{ color: '#f1f5f9', fontSize: 18, fontWeight: 700, lineHeight: 1.2 }}>{stats?.match_count ?? 0}</div>
      </div>
      <div style={cell}>
        <div style={{ color: '#334155', fontSize: 7 }}>Avg Wait</div>
        <div style={{ color: '#fbbf24', fontSize: 15, fontWeight: 700, lineHeight: 1.2 }}>{fmtWait(stats?.avg_wait_seconds)}</div>
      </div>

      {stats?.leaderboard?.length > 0 && (
        <div style={{ background: '#0f172a', border: '1px solid #1e293b', borderRadius: 4, padding: '6px 8px', marginBottom: 4 }}>
          <div style={{ color: '#1e293b', fontSize: 7, textTransform: 'uppercase', marginBottom: 4 }}>Wins Today</div>
          {stats.leaderboard.map((p, i) => (
            <div key={p.player_id} style={{ color: i === 0 ? '#f1f5f9' : '#64748b', fontSize: 9, marginBottom: 2 }}>
              {['🥇','🥈','🥉','4.','5.'][i]} {p.name} · {p.wins}W
            </div>
          ))}
        </div>
      )}

      <button
        onClick={() => setShowAdd(v => !v)}
        style={{ background: '#0f172a', color: '#475569', border: '1px solid #1e293b', borderRadius: 3, padding: '4px', fontSize: 9, cursor: 'pointer', fontFamily: 'inherit', marginTop: 'auto' }}
      >
        + Add Player
      </button>

      {showAdd && (
        <form onSubmit={addPlayer} style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <input placeholder="Name" required style={inp} value={form.name} onChange={e => setForm(f => ({...f, name: e.target.value}))} />
          <select style={inp} value={form.skill_level} onChange={e => setForm(f => ({...f, skill_level: e.target.value}))}>
            {SKILL_LEVELS.map(s => <option key={s} value={s}>{s.replace('_',' ')}</option>)}
          </select>
          <button type="submit" disabled={saving} style={{ background: '#166534', color: '#dcfce7', border: 'none', borderRadius: 3, padding: '4px', fontSize: 9, cursor: 'pointer', fontFamily: 'inherit' }}>
            {saving ? '...' : 'Add'}
          </button>
        </form>
      )}
    </div>
  )
}
