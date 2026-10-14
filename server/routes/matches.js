import { Hono } from 'hono'
import db from '../db.js'
import { broadcast } from './sse.js'

const router = new Hono()

/**
 * Validate a proposed team arrangement against the entries currently on court.
 * Returns { ok: true, value } or { ok: false, error }.
 * ponytail: membership is fixed at the four on-court entries; bench someone
 * first via PATCH /api/queue/:id/status if you need a different set
 */
export function validateTeamSlots(body, currentIds) {
  const value = {
    team1_p1: body.team1_p1 ?? null,
    team1_p2: body.team1_p2 ?? null,
    team2_p1: body.team2_p1 ?? null,
    team2_p2: body.team2_p2 ?? null,
  }
  if (!value.team1_p1 || !value.team2_p1) {
    return { ok: false, error: 'team1_p1 and team2_p1 are required' }
  }
  const provided = [value.team1_p1, value.team1_p2, value.team2_p1, value.team2_p2].filter(Boolean)
  if (new Set(provided).size !== provided.length) {
    return { ok: false, error: 'duplicate entry in team slots' }
  }
  const current = new Set(currentIds)
  for (const id of provided) {
    if (!current.has(id)) return { ok: false, error: `entry ${id} is not on this court` }
  }
  if (provided.length !== currentIds.length) {
    return { ok: false, error: 'payload must be a rearrangement of the entries on this court' }
  }
  return { ok: true, value }
}

router.post('/', async (c) => {
  const { session_id, court_number, team1_p1, team1_p2, team2_p1, team2_p2 } = await c.req.json().catch(() => ({}))
  const session = db.prepare('SELECT * FROM sessions WHERE id = ?').get(session_id)
  if (!session) return c.json({ error: 'Session not found' }, 404)
  if (session.started_at == null) return c.json({ error: 'Session not started' }, 400)
  const now = Math.floor(Date.now() / 1000)

  const court = db.prepare('SELECT * FROM courts WHERE id = ? AND session_id = ?').get(court_number, session_id)
  if (court) {
    if (!court.enabled) return c.json({ error: 'Court is disabled' }, 400)
    if (court.expires_at != null && now >= court.expires_at) return c.json({ error: 'Court has expired' }, 400)
    if (court.active_until != null && now >= court.active_until) return c.json({ error: 'Court reservation has ended' }, 400)
  }

  const format = team1_p2 ? 'doubles' : 'singles'

  const { lastInsertRowid } = db.prepare(`
    INSERT INTO matches (session_id, court_number, format, team1_p1, team1_p2, team2_p1, team2_p2, started_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(session_id, court_number, format, team1_p1, team1_p2 ?? null, team2_p1, team2_p2 ?? null, now)

  // Mark all involved players as playing
  const playerEntryIds = [team1_p1, team1_p2, team2_p1, team2_p2].filter(Boolean)
  const setPlaying = db.prepare('UPDATE queue_entries SET status = ?, status_updated_at = ? WHERE id = ?')
  for (const id of playerEntryIds) setPlaying.run('playing', now, id)

  const match = db.prepare('SELECT * FROM matches WHERE id = ?').get(lastInsertRowid)
  broadcast()
  return c.json({ match }, 201)
})

router.patch('/:id/end', async (c) => {
  const id = c.req.param('id')
  const { team1_score, team2_score } = await c.req.json().catch(() => ({}))
  const now = Math.floor(Date.now() / 1000)

  const match = db.prepare('SELECT * FROM matches WHERE id = ?').get(id)
  if (!match) return c.json({ error: 'Match not found' }, 404)

  const duration = now - match.started_at

  db.prepare(
    'UPDATE matches SET team1_score = ?, team2_score = ?, ended_at = ? WHERE id = ?'
  ).run(team1_score, team2_score, now, id)

  // Update queue entries: back to waiting, last_played_at, total_seconds_played, games_played, status_updated_at
  const playerEntryIds = [match.team1_p1, match.team1_p2, match.team2_p1, match.team2_p2].filter(Boolean)
  const updateEntry = db.prepare(`
    UPDATE queue_entries
    SET status = 'waiting',
        last_played_at = ?,
        status_updated_at = ?,
        total_seconds_played = total_seconds_played + ?,
        games_played = games_played + 1
    WHERE id = ?
  `)
  for (const entryId of playerEntryIds) updateEntry.run(now, now, duration, entryId)

  const updated = db.prepare('SELECT * FROM matches WHERE id = ?').get(id)
  broadcast()
  return c.json({ match: updated })
})

router.patch('/:id/teams', async (c) => {
  const id = c.req.param('id')
  const match = db.prepare('SELECT * FROM matches WHERE id = ?').get(id)
  if (!match) return c.json({ error: 'Match not found' }, 404)
  if (match.ended_at) return c.json({ error: 'Match already ended' }, 404)

  const body = await c.req.json().catch(() => ({}))
  const currentIds = [match.team1_p1, match.team1_p2, match.team2_p1, match.team2_p2].filter(Boolean)
  const check = validateTeamSlots(body, currentIds)
  if (!check.ok) return c.json({ error: check.error }, 400)

  const v = check.value
  db.prepare(`
    UPDATE matches
    SET team1_p1 = ?, team1_p2 = ?, team2_p1 = ?, team2_p2 = ?
    WHERE id = ?
  `).run(v.team1_p1, v.team1_p2, v.team2_p1, v.team2_p2, id)

  const updated = db.prepare('SELECT * FROM matches WHERE id = ?').get(id)
  broadcast()
  return c.json({ match: updated })
})

export default router
