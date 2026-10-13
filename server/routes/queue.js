import { Router } from 'express'
import db from '../db.js'
import { suggestPlayers } from '../logic/smartQueue.js'
import { broadcast } from './sse.js'

const router = Router()

router.post('/sessions/:id/checkin', (req, res) => {
  const { player_id } = req.body
  const now = Math.floor(Date.now() / 1000)
  const existing = db.prepare(
    'SELECT id FROM queue_entries WHERE session_id = ? AND player_id = ?'
  ).get(req.params.id, player_id)
  if (existing) return res.status(409).json({ error: 'Player already checked in' })

  const { lastInsertRowid } = db.prepare(
    'INSERT INTO queue_entries (session_id, player_id, checked_in_at) VALUES (?, ?, ?)'
  ).run(req.params.id, player_id, now)
  const entry = db.prepare('SELECT * FROM queue_entries WHERE id = ?').get(lastInsertRowid)
  broadcast()
  res.status(201).json({ entry })
})

router.patch('/queue/:entryId/status', (req, res) => {
  const { status } = req.body
  db.prepare('UPDATE queue_entries SET status = ? WHERE id = ?').run(status, req.params.entryId)
  const entry = db.prepare('SELECT * FROM queue_entries WHERE id = ?').get(req.params.entryId)
  if (!entry) return res.status(404).json({ error: 'Entry not found' })
  broadcast()
  res.json({ entry })
})

router.get('/sessions/:id/suggest', (req, res) => {
  const { mode } = req.query
  if (mode !== 'singles' && mode !== 'doubles') {
    return res.status(400).json({ error: 'mode must be singles or doubles' })
  }
  const entries = db.prepare(
    "SELECT qe.*, p.skill_level FROM queue_entries qe JOIN players p ON p.id = qe.player_id WHERE qe.session_id = ?"
  ).all(req.params.id)
  const suggestion = suggestPlayers(entries, mode)
  res.json({ suggestion })
})

export default router
