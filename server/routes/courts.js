import { Router } from 'express'
import db from '../db.js'
import { broadcast } from './sse.js'

const router = Router()

router.get('/sessions/:id/courts', (req, res) => {
  const courts = db.prepare('SELECT * FROM courts WHERE session_id = ? ORDER BY id').all(req.params.id)
  res.json({ courts })
})

router.post('/sessions/:id/courts', (req, res) => {
  const { label } = req.body
  const session = db.prepare('SELECT id FROM sessions WHERE id = ?').get(req.params.id)
  if (!session) return res.status(404).json({ error: 'Session not found' })
  const { lastInsertRowid } = db.prepare(
    'INSERT INTO courts (session_id, label) VALUES (?, ?)'
  ).run(req.params.id, label)
  const court = db.prepare('SELECT * FROM courts WHERE id = ?').get(lastInsertRowid)
  broadcast()
  res.status(201).json({ court })
})

router.patch('/courts/:id', (req, res) => {
  const { active_from, active_until, enabled } = req.body
  const court = db.prepare('SELECT * FROM courts WHERE id = ?').get(req.params.id)
  if (!court) return res.status(404).json({ error: 'Court not found' })
  db.prepare(
    'UPDATE courts SET active_from = ?, active_until = ?, enabled = ? WHERE id = ?'
  ).run(
    active_from !== undefined ? active_from : court.active_from,
    active_until !== undefined ? active_until : court.active_until,
    enabled !== undefined ? enabled : court.enabled,
    req.params.id
  )
  const updated = db.prepare('SELECT * FROM courts WHERE id = ?').get(req.params.id)
  broadcast()
  res.json({ court: updated })
})

router.delete('/courts/:id', (req, res) => {
  const court = db.prepare('SELECT * FROM courts WHERE id = ?').get(req.params.id)
  if (!court) return res.status(404).json({ error: 'Court not found' })
  const inUse = db.prepare(
    'SELECT COUNT(*) as c FROM matches WHERE session_id = ? AND court_number = ?'
  ).get(court.session_id, court.id).c
  if (inUse > 0) return res.status(409).json({ error: 'Court has matches' })
  db.prepare('DELETE FROM courts WHERE id = ?').run(req.params.id)
  broadcast()
  res.status(204).end()
})

export default router
