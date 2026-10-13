import { Router } from 'express'
import db from '../db.js'

const router = Router()

router.get('/', (req, res) => {
  const players = db.prepare('SELECT * FROM players ORDER BY name').all()
  res.json({ players })
})

router.post('/', (req, res) => {
  const { name, skill_level } = req.body
  const now = Math.floor(Date.now() / 1000)
  const { lastInsertRowid } = db.prepare(
    'INSERT INTO players (name, skill_level, created_at) VALUES (?, ?, ?)'
  ).run(name, skill_level, now)
  const player = db.prepare('SELECT * FROM players WHERE id = ?').get(lastInsertRowid)
  res.status(201).json({ player })
})

export default router
