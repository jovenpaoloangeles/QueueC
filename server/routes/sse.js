import { Router } from 'express'
import db from '../db.js'

const router = Router()
const clients = new Set()

export function broadcast() {
  if (clients.size === 0) return
  const payload = currentState()
  const data = `event: state\ndata: ${JSON.stringify(payload)}\n\n`
  for (const res of clients) res.write(data)
}

function currentState() {
  const session = db.prepare(
    'SELECT * FROM sessions WHERE ended_at IS NULL ORDER BY started_at DESC LIMIT 1'
  ).get() ?? null

  if (!session) return { session: null, queue: [], activeMatches: [], stats: null, serverTime: Math.floor(Date.now() / 1000) }

  const queue = db.prepare(
    "SELECT qe.*, p.name, p.skill_level FROM queue_entries qe JOIN players p ON p.id = qe.player_id WHERE qe.session_id = ? AND qe.status != 'left' ORDER BY qe.checked_in_at"
  ).all(session.id)

  const activeMatches = db.prepare(
    'SELECT * FROM matches WHERE session_id = ? AND ended_at IS NULL'
  ).all(session.id)

  const now = Math.floor(Date.now() / 1000)
  const waiters = queue.filter(e => e.status === 'waiting')
  const avg_wait_seconds = waiters.length
    ? Math.round(waiters.reduce((s, e) => s + (now - e.checked_in_at - e.total_seconds_played), 0) / waiters.length)
    : 0

  const match_count = db.prepare(
    'SELECT COUNT(*) as c FROM matches WHERE session_id = ? AND ended_at IS NOT NULL'
  ).get(session.id).c

  const leaderboard = db.prepare(`
    SELECT p.id as player_id, p.name,
      SUM(CASE
        WHEN (m.team1_p1 = qe.id OR m.team1_p2 = qe.id) AND m.team1_score > m.team2_score THEN 1
        WHEN (m.team2_p1 = qe.id OR m.team2_p2 = qe.id) AND m.team2_score > m.team1_score THEN 1
        ELSE 0 END) as wins
    FROM matches m
    JOIN queue_entries qe ON (qe.id = m.team1_p1 OR qe.id = m.team1_p2 OR qe.id = m.team2_p1 OR qe.id = m.team2_p2)
    JOIN players p ON p.id = qe.player_id
    WHERE m.session_id = ? AND m.ended_at IS NOT NULL
    GROUP BY p.id ORDER BY wins DESC LIMIT 5
  `).all(session.id)

  return {
    session,
    queue,
    activeMatches,
    stats: { player_count: queue.length, match_count, avg_wait_seconds, leaderboard },
    serverTime: now
  }
}

router.get('/', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream')
  res.setHeader('Cache-Control', 'no-cache')
  res.setHeader('Connection', 'keep-alive')
  res.flushHeaders()

  // Send immediately on connect
  res.write(`event: state\ndata: ${JSON.stringify(currentState())}\n\n`)
  clients.add(res)

  req.on('close', () => clients.delete(res))
})

export default router
