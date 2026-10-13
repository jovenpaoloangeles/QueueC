import { Router } from 'express'
import db from '../db.js'
import { broadcast } from './sse.js'

const router = Router()

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

export default router
