import { Hono } from 'hono'
import db from '../db.js'
import { suggestPlayers } from '../logic/smartQueue.js'
import { broadcast } from './sse.js'

const router = new Hono()

router.post('/sessions/:id/automatch', (c) => {
  const id = c.req.param('id')
  const s = db.prepare('SELECT * FROM sessions WHERE id = ?').get(id)
  if (!s) return c.json({ error: 'Session not found' }, 404)
  if (s.started_at == null) return c.json({ error: 'Session not started' }, 400)

  const now = Math.floor(Date.now() / 1000)
  const free = db.prepare(`
    SELECT * FROM courts
    WHERE session_id = ? AND enabled = 1
      AND (active_from IS NULL OR active_from <= ?)
      AND (expires_at IS NULL OR expires_at > ?)
      AND (active_until IS NULL OR active_until > ?)
      AND id NOT IN (
        SELECT court_number FROM matches
        WHERE session_id = ? AND state = 'active' AND ended_at IS NULL AND court_number IS NOT NULL
      )
    ORDER BY id
  `).all(id, now, now, now, id)

  const getWaiting = () => db.prepare(`
    SELECT qe.*, p.skill_level
    FROM queue_entries qe
    JOIN players p ON p.id = qe.player_id
    WHERE qe.session_id = ? AND qe.status = 'waiting'
    ORDER BY qe.sort_order, qe.checked_in_at, qe.id
  `).all(id)

  let started = 0
  let slated = false

  db.transaction(() => {
    for (const court of free) {
      const pool = getWaiting()
      const mode = pool.length >= 4 ? 'doubles' : pool.length >= 2 ? 'singles' : null
      if (!mode) break
      const slots = suggestPlayers(pool, mode)
      const ids = slots.filter(Boolean)
      if (ids.length < 2) break
      const [t1p1, t1p2, t2p1, t2p2] = slots
      db.prepare(`
        INSERT INTO matches (session_id, court_number, format, state, team1_p1, team1_p2, team2_p1, team2_p2, started_at)
        VALUES (?, ?, ?, 'active', ?, ?, ?, ?, ?)
      `).run(id, court.id, mode, t1p1, t1p2 ?? null, t2p1, t2p2 ?? null, now)
      const setPlaying = db.prepare("UPDATE queue_entries SET status = 'playing', status_updated_at = ? WHERE id = ?")
      for (const eid of ids) setPlaying.run(now, eid)
      started++
    }

    const hasSlate = db.prepare("SELECT 1 FROM matches WHERE session_id = ? AND state = 'slated' AND ended_at IS NULL").get(id)
    const remaining = getWaiting()
    if (!hasSlate && remaining.length >= 4) {
      const slots = suggestPlayers(remaining, 'doubles')
      const ids = slots.filter(Boolean)
      if (ids.length === 4) {
        const seq = db.prepare("SELECT COALESCE(MAX(slate_seq),0)+1 AS n FROM matches WHERE session_id = ? AND state = 'slated'").get(id).n
        const [t1p1, t1p2, t2p1, t2p2] = slots
        db.prepare(`
          INSERT INTO matches (session_id, court_number, format, state, slate_seq, team1_p1, team1_p2, team2_p1, team2_p2, started_at)
          VALUES (?, NULL, 'doubles', 'slated', ?, ?, ?, ?, ?, 0)
        `).run(id, seq, t1p1, t1p2, t2p1, t2p2)
        const setStaged = db.prepare("UPDATE queue_entries SET status = 'staged', status_updated_at = ? WHERE id = ?")
        for (const eid of ids) setStaged.run(now, eid)
        slated = true
      }
    }
  })()

  if (!started && !slated) {
    return c.json({ error: 'Nothing to auto-match — need a free court and ≥2 waiting players (or ≥4 to slate).' }, 409)
  }

  broadcast()
  return c.json({ started, slated })
})

export default router
