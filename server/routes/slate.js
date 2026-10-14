import { Hono } from 'hono'
import db from '../db.js'
import { broadcast } from './sse.js'
import { validateTeamSlots } from './matches.js'

const router = new Hono()

router.post('/matches/slate', async (c) => {
  const b = await c.req.json().catch(() => ({}))
  const s = db.prepare('SELECT * FROM sessions WHERE id = ?').get(b.session_id)
  if (!s) return c.json({ error: 'Session not found' }, 404)
  if (s.started_at == null) return c.json({ error: 'Session not started' }, 400)
  const ids = [b.team1_p1, b.team1_p2, b.team2_p1, b.team2_p2].filter(Boolean)
  if (ids.length !== 4) return c.json({ error: 'A slate needs exactly 4 players (2v2)' }, 400)
  if (new Set(ids).size !== ids.length) return c.json({ error: 'duplicate entry in team slots' }, 400)
  for (const id of ids) {
    const e = db.prepare('SELECT * FROM queue_entries WHERE id = ? AND session_id = ?').get(id, b.session_id)
    if (!e || e.status !== 'waiting') {
      return c.json({ error: `entry ${id} is not waiting` }, 400)
    }
  }
  const seq = db.prepare('SELECT COALESCE(MAX(slate_seq),0)+1 AS n FROM matches WHERE session_id = ? AND state = ?').get(b.session_id, 'slated').n
  const now = Math.floor(Date.now() / 1000)
  let lastInsertRowid
  db.transaction(() => {
    const res = db.prepare(`
      INSERT INTO matches (session_id, court_number, format, state, slate_seq, team1_p1, team1_p2, team2_p1, team2_p2, started_at)
      VALUES (?, NULL, ?, 'slated', ?, ?, ?, ?, ?, 0)
    `).run(b.session_id, b.team1_p2 ? 'doubles' : 'singles', seq, b.team1_p1, b.team1_p2 ?? null, b.team2_p1, b.team2_p2 ?? null)
    lastInsertRowid = res.lastInsertRowid
    const mark = db.prepare("UPDATE queue_entries SET status = 'staged', status_updated_at = ? WHERE id = ?")
    for (const id of ids) mark.run(now, id)
  })()
  broadcast()
  return c.json({ slate: db.prepare('SELECT * FROM matches WHERE id = ?').get(lastInsertRowid) }, 201)
})

router.patch('/matches/:id/slate', async (c) => {
  const id = c.req.param('id')
  const m = db.prepare("SELECT * FROM matches WHERE id = ? AND state = 'slated'").get(id)
  if (!m) return c.json({ error: 'Slate not found' }, 404)
  const b = await c.req.json().catch(() => ({}))
  const currentIds = [m.team1_p1, m.team1_p2, m.team2_p1, m.team2_p2].filter(Boolean)
  const check = validateTeamSlots(b, currentIds)
  if (!check.ok) return c.json({ error: check.error }, 400)
  const v = check.value
  db.prepare('UPDATE matches SET team1_p1=?, team1_p2=?, team2_p1=?, team2_p2=? WHERE id=?')
    .run(v.team1_p1, v.team1_p2, v.team2_p1, v.team2_p2, id)
  broadcast()
  return c.json({ slate: db.prepare('SELECT * FROM matches WHERE id = ?').get(id) })
})

router.delete('/matches/:id/slate', (c) => {
  const id = c.req.param('id')
  const m = db.prepare("SELECT * FROM matches WHERE id = ? AND state = 'slated'").get(id)
  if (!m) return c.json({ error: 'Slate not found' }, 404)
  const now = Math.floor(Date.now() / 1000)
  db.transaction(() => {
    let next = db.prepare('SELECT COALESCE(MAX(sort_order),0) AS n FROM queue_entries WHERE session_id = ?').get(m.session_id).n
    const back = db.prepare("UPDATE queue_entries SET status = 'waiting', status_updated_at = ?, sort_order = ? WHERE id = ?")
    for (const id2 of [m.team1_p1, m.team1_p2, m.team2_p1, m.team2_p2].filter(Boolean)) {
      back.run(now, ++next, id2)
    }
    db.prepare('DELETE FROM matches WHERE id = ?').run(id)
  })()
  broadcast()
  return c.body(null, 204)
})

export default router
