import { Router } from 'express'
import db from '../db.js'
import { broadcast } from './sse.js'

const router = Router()

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

router.post('/', (req, res) => {
  const { session_id, court_number, team1_p1, team1_p2, team2_p1, team2_p2 } = req.body
  const now = Math.floor(Date.now() / 1000)
  const format = team1_p2 ? 'doubles' : 'singles'

  const { lastInsertRowid } = db.prepare(`
    INSERT INTO matches (session_id, court_number, format, team1_p1, team1_p2, team2_p1, team2_p2, started_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(session_id, court_number, format, team1_p1, team1_p2 ?? null, team2_p1, team2_p2 ?? null, now)

  // Mark all involved players as playing
  const playerEntryIds = [team1_p1, team1_p2, team2_p1, team2_p2].filter(Boolean)
  const setPlaying = db.prepare('UPDATE queue_entries SET status = ? WHERE id = ?')
  for (const id of playerEntryIds) setPlaying.run('playing', id)

  const match = db.prepare('SELECT * FROM matches WHERE id = ?').get(lastInsertRowid)
  broadcast()
  res.status(201).json({ match })
})

router.patch('/:id/end', (req, res) => {
  const { team1_score, team2_score } = req.body
  const now = Math.floor(Date.now() / 1000)

  const match = db.prepare('SELECT * FROM matches WHERE id = ?').get(req.params.id)
  if (!match) return res.status(404).json({ error: 'Match not found' })

  const duration = now - match.started_at

  db.prepare(
    'UPDATE matches SET team1_score = ?, team2_score = ?, ended_at = ? WHERE id = ?'
  ).run(team1_score, team2_score, now, req.params.id)

  // Update queue entries: back to waiting, last_played_at, total_seconds_played
  const playerEntryIds = [match.team1_p1, match.team1_p2, match.team2_p1, match.team2_p2].filter(Boolean)
  const updateEntry = db.prepare(`
    UPDATE queue_entries
    SET status = 'waiting', last_played_at = ?, total_seconds_played = total_seconds_played + ?
    WHERE id = ?
  `)
  for (const id of playerEntryIds) updateEntry.run(now, duration, id)

  const updated = db.prepare('SELECT * FROM matches WHERE id = ?').get(req.params.id)
  broadcast()
  res.json({ match: updated })
})

router.patch('/:id/teams', (req, res) => {
  const match = db.prepare('SELECT * FROM matches WHERE id = ?').get(req.params.id)
  if (!match) return res.status(404).json({ error: 'Match not found' })
  if (match.ended_at) return res.status(404).json({ error: 'Match already ended' })

  const currentIds = [match.team1_p1, match.team1_p2, match.team2_p1, match.team2_p2].filter(Boolean)
  const check = validateTeamSlots(req.body, currentIds)
  if (!check.ok) return res.status(400).json({ error: check.error })

  const v = check.value
  db.prepare(`
    UPDATE matches
    SET team1_p1 = ?, team1_p2 = ?, team2_p1 = ?, team2_p2 = ?
    WHERE id = ?
  `).run(v.team1_p1, v.team1_p2, v.team2_p1, v.team2_p2, req.params.id)

  const updated = db.prepare('SELECT * FROM matches WHERE id = ?').get(req.params.id)
  broadcast()
  res.json({ match: updated })
})

export default router
