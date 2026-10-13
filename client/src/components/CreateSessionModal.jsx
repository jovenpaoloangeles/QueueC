import { useState } from 'react'
import { createSession } from '../api.js'

function toUnix(dateStr, timeStr) {
  return Math.floor(new Date(`${dateStr}T${timeStr}`).getTime() / 1000)
}

const today = new Date().toISOString().split('T')[0]

export default function CreateSessionModal({ onClose }) {
  const [form, setForm] = useState({ name: 'Evening Session', date: today, start: '18:00', end: '21:00', courts: 2 })
  const [loading, setLoading] = useState(false)

  async function submit(e) {
    e.preventDefault()
    setLoading(true)
    await createSession({
      name: form.name,
      scheduled_start: toUnix(form.date, form.start),
      scheduled_end: toUnix(form.date, form.end),
      court_count: Number(form.courts)
    })
    onClose()
  }

  const inp = { background: '#0f172a', border: '1px solid #1e293b', borderRadius: 4, color: '#f1f5f9', padding: '6px 8px', fontSize: 11, fontFamily: 'inherit', width: '100%' }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 }}>
      <form onSubmit={submit} style={{ background: '#0f172a', border: '1px solid #1e293b', borderRadius: 8, padding: 24, minWidth: 300, display: 'flex', flexDirection: 'column', gap: 12, fontFamily: 'inherit', fontSize: 11 }}>
        <h2 style={{ color: '#f1f5f9', fontSize: 14, fontWeight: 700 }}>New Session</h2>
        <label style={{ color: '#94a3b8' }}>Name<br /><input style={inp} value={form.name} onChange={e => setForm(f => ({...f, name: e.target.value}))} required /></label>
        <label style={{ color: '#94a3b8' }}>Date<br /><input type="date" style={inp} value={form.date} onChange={e => setForm(f => ({...f, date: e.target.value}))} required /></label>
        <div style={{ display: 'flex', gap: 8 }}>
          <label style={{ color: '#94a3b8', flex: 1 }}>Start<br /><input type="time" style={inp} value={form.start} onChange={e => setForm(f => ({...f, start: e.target.value}))} required /></label>
          <label style={{ color: '#94a3b8', flex: 1 }}>End<br /><input type="time" style={inp} value={form.end} onChange={e => setForm(f => ({...f, end: e.target.value}))} required /></label>
        </div>
        <label style={{ color: '#94a3b8' }}>Courts<br /><input type="number" min="1" max="10" style={inp} value={form.courts} onChange={e => setForm(f => ({...f, courts: e.target.value}))} required /></label>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 4 }}>
          <button type="button" onClick={onClose} style={{ background: '#1e293b', color: '#94a3b8', border: '1px solid #334155', borderRadius: 4, padding: '6px 14px', fontSize: 11, cursor: 'pointer', fontFamily: 'inherit' }}>Cancel</button>
          <button type="submit" disabled={loading} style={{ background: '#166534', color: '#dcfce7', border: 'none', borderRadius: 4, padding: '6px 14px', fontSize: 11, cursor: 'pointer', fontFamily: 'inherit' }}>
            {loading ? '...' : 'Start Session'}
          </button>
        </div>
      </form>
    </div>
  )
}
