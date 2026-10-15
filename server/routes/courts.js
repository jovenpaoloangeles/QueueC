import { Hono } from 'hono'
import db from '../db.js'
import { broadcast } from './sse.js'

const router = new Hono()

router.get('/sessions/:id/courts', (c) => {
  const id = c.req.param('id')
  const courts = db.prepare('SELECT * FROM courts WHERE session_id = ? ORDER BY id').all(id)
  return c.json({ courts })
})

router.post('/sessions/:id/courts', async (c) => {
  const id = c.req.param('id')
  const { label, duration_minutes, active_from, active_until } = await c.req.json().catch(() => ({}))
  const session = db.prepare('SELECT * FROM sessions WHERE id = ?').get(id)
  if (!session) return c.json({ error: 'Session not found' }, 404)

  const dur = duration_minutes != null && duration_minutes !== '' ? Number(duration_minutes) : null
  const now = Math.floor(Date.now() / 1000)
  const expires_at = dur && session.started_at != null ? now + dur * 60 : null

  const { lastInsertRowid } = db.prepare(
    'INSERT INTO courts (session_id, label, duration_minutes, expires_at, active_from, active_until) VALUES (?, ?, ?, ?, ?, ?)'
  ).run(id, label, dur, expires_at, active_from ?? null, active_until ?? null)
  const court = db.prepare('SELECT * FROM courts WHERE id = ?').get(lastInsertRowid)
  broadcast()
  return c.json({ court }, 201)
})

router.patch('/courts/:id', async (c) => {
  const id = c.req.param('id')
  const { label, active_from, active_until, duration_minutes, expires_at, enabled } = await c.req.json().catch(() => ({}))
  const court = db.prepare('SELECT * FROM courts WHERE id = ?').get(id)
  if (!court) return c.json({ error: 'Court not found' }, 404)
  const session = db.prepare('SELECT * FROM sessions WHERE id = ?').get(court.session_id)

  const nextLabel = label !== undefined ? String(label).trim() || court.label : court.label
  const nextFrom = active_from !== undefined ? active_from : court.active_from
  const nextUntil = active_until !== undefined ? active_until : court.active_until
  const nextDur = duration_minutes !== undefined
    ? (duration_minutes === null || duration_minutes === '' ? null : Number(duration_minutes))
    : court.duration_minutes

  let nextExpires = expires_at !== undefined ? expires_at : court.expires_at
  if (duration_minutes !== undefined && expires_at === undefined) {
    if (nextDur == null) {
      nextExpires = null
    } else if (session?.started_at != null) {
      const base = session.started_at
      nextExpires = base + nextDur * 60
    } else {
      nextExpires = null
    }
  }

  const nextEnabled = enabled !== undefined ? enabled : court.enabled

  db.prepare(
    'UPDATE courts SET label = ?, active_from = ?, active_until = ?, duration_minutes = ?, expires_at = ?, enabled = ? WHERE id = ?'
  ).run(nextLabel, nextFrom, nextUntil, nextDur, nextExpires, nextEnabled, id)

  const updated = db.prepare('SELECT * FROM courts WHERE id = ?').get(id)
  broadcast()
  return c.json({ court: updated })
})

router.delete('/courts/:id', (c) => {
  const id = c.req.param('id')
  const court = db.prepare('SELECT * FROM courts WHERE id = ?').get(id)
  if (!court) return c.json({ error: 'Court not found' }, 404)
  const inUse = db.prepare(
    'SELECT COUNT(*) as c FROM matches WHERE session_id = ? AND court_number = ?'
  ).get(court.session_id, court.id).c
  if (inUse > 0) return c.json({ error: 'Court has matches' }, 409)
  db.prepare('DELETE FROM courts WHERE id = ?').run(id)
  broadcast()
  return c.body(null, 204)
})

router.patch('/courts/:id/extend', async (c) => {
  const id = c.req.param('id')
  const b = await c.req.json().catch(() => ({}))
  const court = db.prepare('SELECT * FROM courts WHERE id = ?').get(id)
  if (!court) return c.json({ error: 'Court not found' }, 404)
  if (court.expires_at == null) return c.json({ error: 'Court has no rental timer' }, 400)
  const mins = Number(b.minutes ?? 60)
  const now = Math.floor(Date.now() / 1000)
  db.prepare('UPDATE courts SET expires_at = MAX(expires_at, ?) + ? WHERE id = ?').run(now, mins * 60, id)
  broadcast()
  return c.json({ court: db.prepare('SELECT * FROM courts WHERE id = ?').get(id) })
})

export default router
