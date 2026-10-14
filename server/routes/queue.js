import { Router } from 'express'
import db from '../db.js'
import { suggestPlayers } from '../logic/smartQueue.js'
import { broadcast } from './sse.js'

const router = Router()

/** Next sort_order for a new entry in a session that already has `existingOrders`. */
export function assignSortOrder(existingOrders) {
  return existingOrders.length ? Math.max(...existingOrders) + 1 : 1
}

/** Keep only ids in `allowed`, in the given order, de-duplicated. */
export function normalizeOrder(order, allowed) {
  const ok = new Set(allowed)
  const seen = new Set()
  const out = []
  for (const id of order ?? []) {
    if (ok.has(id) && !seen.has(id)) {
      seen.add(id)
      out.push(id)
    }
  }
  return out
}

router.post('/sessions/:id/checkin', (req, res) => {
  const { player_id } = req.body
  const now = Math.floor(Date.now() / 1000)
  const existing = db.prepare(
    'SELECT id FROM queue_entries WHERE session_id = ? AND player_id = ?'
  ).get(req.params.id, player_id)
  if (existing) return res.status(409).json({ error: 'Player already checked in' })

  const existingOrders = db.prepare(
    'SELECT sort_order FROM queue_entries WHERE session_id = ?'
  ).all(req.params.id).map(r => r.sort_order)

  const { lastInsertRowid } = db.prepare(
    'INSERT INTO queue_entries (session_id, player_id, checked_in_at, sort_order) VALUES (?, ?, ?, ?)'
  ).run(req.params.id, player_id, now, assignSortOrder(existingOrders))

  const entry = db.prepare('SELECT * FROM queue_entries WHERE id = ?').get(lastInsertRowid)
  broadcast()
  res.status(201).json({ entry })
})

router.delete('/queue/:entryId', (req, res) => {
  const entry = db.prepare('SELECT * FROM queue_entries WHERE id = ?').get(req.params.entryId)
  if (!entry) return res.status(404).json({ error: 'Entry not found' })
  // a playing entry's match would be orphaned — removal is for check-in undo only
  if (entry.status === 'playing') return res.status(409).json({ error: 'Cannot remove a playing entry' })
  db.prepare('DELETE FROM queue_entries WHERE id = ?').run(req.params.entryId)
  broadcast()
  res.json({ ok: true })
})

router.patch('/queue/:entryId/status', (req, res) => {
  const { status } = req.body
  db.prepare('UPDATE queue_entries SET status = ? WHERE id = ?').run(status, req.params.entryId)
  const entry = db.prepare('SELECT * FROM queue_entries WHERE id = ?').get(req.params.entryId)
  if (!entry) return res.status(404).json({ error: 'Entry not found' })
  broadcast()
  res.json({ entry })
})

router.patch('/queue/order', (req, res) => {
  const { session_id, order } = req.body
  const allowed = db.prepare(
    'SELECT id FROM queue_entries WHERE session_id = ?'
  ).all(session_id).map(r => r.id)

  const normalized = normalizeOrder(order, allowed)
  const write = db.prepare('UPDATE queue_entries SET sort_order = ? WHERE id = ?')
  const tx = db.transaction(ids => ids.forEach((id, i) => write.run(i + 1, id)))
  tx(normalized)

  broadcast()
  res.json({ ok: true })
})

router.get('/sessions/:id/suggest', (req, res) => {
  const { mode } = req.query
  if (mode !== 'singles' && mode !== 'doubles') {
    return res.status(400).json({ error: 'mode must be singles or doubles' })
  }
  const entries = db.prepare(
    "SELECT qe.*, p.skill_level FROM queue_entries qe JOIN players p ON p.id = qe.player_id WHERE qe.session_id = ? AND qe.status = 'waiting'"
  ).all(req.params.id)
  const suggestion = suggestPlayers(entries, mode)
  res.json({ suggestion })
})

export default router
