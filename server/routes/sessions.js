import { Router } from 'express'
import db from '../db.js'
import { broadcast } from './sse.js'

const router = Router()

router.get('/active', (req, res) => {
  const session = db.prepare(
    'SELECT * FROM sessions WHERE ended_at IS NULL ORDER BY started_at DESC LIMIT 1'
  ).get()
  res.json({ session: session ?? null })
})

router.post('/', (req, res) => {
  const { name, scheduled_start, scheduled_end, court_count } = req.body
  const { lastInsertRowid } = db.prepare(
    'INSERT INTO sessions (name, scheduled_start, scheduled_end, court_count) VALUES (?, ?, ?, ?)'
  ).run(name, scheduled_start, scheduled_end, court_count ?? 2)
  const session = db.prepare('SELECT * FROM sessions WHERE id = ?').get(lastInsertRowid)
  broadcast()
  res.status(201).json({ session })
})

router.patch('/:id/start', (req, res) => {
  const session = db.prepare('SELECT * FROM sessions WHERE id = ?').get(req.params.id)
  if (!session) return res.status(404).json({ error: 'Session not found' })
  if (session.ended_at) return res.status(400).json({ error: 'Session already ended' })
  if (session.started_at != null) return res.status(400).json({ error: 'Session already started' })
  const now = Math.floor(Date.now() / 1000)
  db.prepare('UPDATE sessions SET started_at = ? WHERE id = ?').run(now, req.params.id)
  const updated = db.prepare('SELECT * FROM sessions WHERE id = ?').get(req.params.id)
  broadcast()
  res.json({ session: updated })
})

router.patch('/:id/end', (req, res) => {
  const now = Math.floor(Date.now() / 1000)
  db.prepare('UPDATE sessions SET ended_at = ? WHERE id = ?').run(now, req.params.id)
  const session = db.prepare('SELECT * FROM sessions WHERE id = ?').get(req.params.id)
  broadcast()
  res.json({ session })
})

export default router
