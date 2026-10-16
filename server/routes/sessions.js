import { Hono } from 'hono'
import db, { resetPlayersToPreset } from '../db.js'
import { broadcast } from './sse.js'

const router = new Hono()

router.get('/active', (c) => {
  const session = db.prepare(
    'SELECT * FROM sessions WHERE ended_at IS NULL ORDER BY started_at DESC LIMIT 1'
  ).get()
  return c.json({ session: session ?? null })
})

router.post('/', async (c) => {
  const { name, scheduled_start, scheduled_end, court_count, courts } = await c.req.json().catch(() => ({}))
  const count = Array.isArray(courts) && courts.length > 0 ? courts.length : (court_count ?? 2)
  const { lastInsertRowid } = db.prepare(
    'INSERT INTO sessions (name, scheduled_start, scheduled_end, court_count) VALUES (?, ?, ?, ?)'
  ).run(name, scheduled_start, scheduled_end, count)

  // seed courts (custom configuration array or default Court 1..N)
  const insertCourt = db.prepare(
    'INSERT INTO courts (session_id, label, duration_minutes, active_from, active_until, opens_after) VALUES (?, ?, ?, ?, ?, ?)'
  )
  db.transaction(() => {
    if (Array.isArray(courts) && courts.length > 0) {
      courts.forEach((cfg, idx) => {
        const label = (cfg?.label ?? '').trim() || `Court ${idx + 1}`
        const dur = cfg?.duration_minutes != null && cfg?.duration_minutes !== '' ? Number(cfg.duration_minutes) : null
        const from = cfg?.active_from != null && cfg?.active_from !== '' ? Number(cfg.active_from) : null
        const until = cfg?.active_until != null && cfg?.active_until !== '' ? Number(cfg.active_until) : null
        const opens = cfg?.opens_after != null && cfg?.opens_after !== '' ? Number(cfg.opens_after) : null
        insertCourt.run(lastInsertRowid, label, dur, from, until, opens)
      })
    } else {
      for (let i = 1; i <= count; i++) {
        insertCourt.run(lastInsertRowid, `Court ${i}`, null, null, null, null)
      }
    }
  })()

  const session = db.prepare('SELECT * FROM sessions WHERE id = ?').get(lastInsertRowid)
  broadcast()
  return c.json({ session }, 201)
})

router.patch('/:id/start', (c) => {
  const id = c.req.param('id')
  const session = db.prepare('SELECT * FROM sessions WHERE id = ?').get(id)
  if (!session) return c.json({ error: 'Session not found' }, 404)
  if (session.ended_at) return c.json({ error: 'Session already ended' }, 400)
  if (session.started_at != null) return c.json({ error: 'Session already started' }, 400)
  const now = Math.floor(Date.now() / 1000)
  db.prepare('UPDATE sessions SET started_at = ? WHERE id = ?').run(now, id)
  // Staggered starts: a court with opens_after opens that many minutes after the
  // session start (lazy — availability is just active_from <= now everywhere it's
  // checked). Offsets anchor to the SCHEDULED start while it's still in the
  // future (the setup screen shows clock times — "9:00 AM" must mean 9:00 AM
  // even if Start is pressed early); otherwise to the actual start. Each court's
  // rental clock anchors to ITS OWN open time; no-offset courts are as before.
  const base0 = Math.max(now, session.scheduled_start ?? now)
  const updateCourt = db.prepare('UPDATE courts SET active_from = ?, expires_at = ? WHERE id = ?')
  for (const court of db.prepare('SELECT * FROM courts WHERE session_id = ?').all(id)) {
    const opensAt = court.opens_after != null && court.opens_after > 0 && court.active_from == null
      ? base0 + court.opens_after * 60
      : court.active_from
    const base = opensAt != null && opensAt > now ? opensAt : now
    const expires = court.duration_minutes != null && court.duration_minutes > 0 && court.expires_at == null
      ? base + court.duration_minutes * 60
      : court.expires_at
    updateCourt.run(opensAt, expires, court.id)
  }
  const updated = db.prepare('SELECT * FROM sessions WHERE id = ?').get(id)
  broadcast()
  return c.json({ session: updated })
})

router.patch('/:id/end', (c) => {
  const id = c.req.param('id')
  const now = Math.floor(Date.now() / 1000)
  // End + reset atomically: a reset throw rolls ended_at back too, so a failed
  // end can't strand a dead session with an un-reset pool (d495f6f's harm).
  db.transaction(() => {
    db.prepare('UPDATE sessions SET ended_at = ? WHERE id = ?').run(now, id)
    // Reset the pool only when this is the last unended session — ending one
    // session must not wipe other live sessions' registrants, queue entries
    // and in-flight slates.
    const { c: unended } = db.prepare('SELECT COUNT(*) AS c FROM sessions WHERE ended_at IS NULL').get()
    if (unended === 0) resetPlayersToPreset()
  })()
  const session = db.prepare('SELECT * FROM sessions WHERE id = ?').get(id)
  broadcast()
  return c.json({ session })
})

export default router
