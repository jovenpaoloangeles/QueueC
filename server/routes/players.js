import { Hono } from 'hono'
import db, { normalizeSkill } from '../db.js'
import { broadcast } from './sse.js'

const router = new Hono()

router.get('/', (c) => {
  const players = db.prepare(`
    SELECT p.*,
      (SELECT MAX(m.ended_at) FROM matches m
         JOIN queue_entries qe ON qe.player_id = p.id
         WHERE m.ended_at IS NOT NULL AND m.state = 'active'
           AND (m.team1_p1=qe.id OR m.team1_p2=qe.id OR m.team2_p1=qe.id OR m.team2_p2=qe.id)
      ) AS last_played_at,
      (SELECT COUNT(*) FROM matches m
         JOIN queue_entries qe ON qe.player_id = p.id
         WHERE m.ended_at IS NOT NULL AND m.state = 'active'
           AND (m.team1_p1=qe.id OR m.team1_p2=qe.id OR m.team2_p1=qe.id OR m.team2_p2=qe.id)
      ) AS games_total
    FROM players p
    ORDER BY (last_played_at IS NULL), last_played_at DESC, p.name
  `).all()
  return c.json({ players })
})

router.post('/', async (c) => {
  const body = await c.req.json().catch(() => ({}))
  const name = (body.name ?? '').trim()
  const skill_level = normalizeSkill(body.skill_level ?? 'intermediate')
  if (!name) return c.json({ error: 'Name is required' }, 400)

  const existing = db.prepare(
    'SELECT * FROM players WHERE LOWER(TRIM(name)) = LOWER(TRIM(?))'
  ).get(name)
  if (existing) {
    return c.json({ error: 'Player already exists in database', existing }, 409)
  }

  const now = Math.floor(Date.now() / 1000)
  const { lastInsertRowid } = db.prepare(
    'INSERT INTO players (name, skill_level, created_at) VALUES (?, ?, ?)'
  ).run(name, skill_level, now)
  const player = db.prepare('SELECT * FROM players WHERE id = ?').get(lastInsertRowid)
  broadcast()
  return c.json({ player }, 201)
})

router.patch('/:id', async (c) => {
  const id = c.req.param('id')
  const player = db.prepare('SELECT * FROM players WHERE id = ?').get(id)
  if (!player) return c.json({ error: 'Player not found' }, 404)

  const body = await c.req.json().catch(() => ({}))
  const nextName = body.name !== undefined ? String(body.name).trim() : player.name
  const nextSkill = body.skill_level !== undefined ? normalizeSkill(body.skill_level) : player.skill_level
  if (!nextName) return c.json({ error: 'Name is required' }, 400)

  const collision = db.prepare(
    'SELECT * FROM players WHERE LOWER(TRIM(name)) = LOWER(TRIM(?)) AND id != ?'
  ).get(nextName, id)
  if (collision) {
    return c.json({ error: 'Another player with this name already exists', existing: collision }, 409)
  }

  db.prepare('UPDATE players SET name = ?, skill_level = ? WHERE id = ?').run(nextName, nextSkill, id)
  const updated = db.prepare('SELECT * FROM players WHERE id = ?').get(id)
  broadcast()
  return c.json({ player: updated })
})

export default router
