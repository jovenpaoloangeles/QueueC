import { Hono } from 'hono'
import db from '../db.js'

const router = new Hono()
const clients = new Set()

export function broadcast() {
  if (clients.size === 0) return
  const payload = currentState()
  const data = `event: state
data: ${JSON.stringify(payload)}

`
  for (const ctrl of clients) {
    try {
      ctrl.write(data)
      ctrl.flush()
    } catch {
      clients.delete(ctrl)
    }
  }
}

function currentState() {
  const session = db.prepare(
    'SELECT * FROM sessions WHERE ended_at IS NULL ORDER BY started_at DESC LIMIT 1'
  ).get() ?? null

  if (!session) return { session: null, queue: [], activeMatches: [], courts: [], stats: null, serverTime: Math.floor(Date.now() / 1000) }

  const queue = db.prepare(
    "SELECT qe.*, p.name, p.skill_level FROM queue_entries qe JOIN players p ON p.id = qe.player_id WHERE qe.session_id = ? AND qe.status != 'left' ORDER BY qe.sort_order, qe.checked_in_at, qe.id"
  ).all(session.id)

  const activeMatches = db.prepare(
    'SELECT * FROM matches WHERE session_id = ? AND ended_at IS NULL'
  ).all(session.id)

  const courts = db.prepare(
    'SELECT * FROM courts WHERE session_id = ? ORDER BY id'
  ).all(session.id)

  const now = Math.floor(Date.now() / 1000)
  const waiters = queue.filter(e => e.status === 'waiting')
  const avg_wait_seconds = waiters.length
    ? Math.round(waiters.reduce((s, e) => s + (now - e.checked_in_at - e.total_seconds_played), 0) / waiters.length)
    : 0

  const match_count = db.prepare(
    'SELECT COUNT(*) as c FROM matches WHERE session_id = ?'
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
    courts,
    stats: { player_count: queue.length, match_count, avg_wait_seconds, leaderboard },
    serverTime: now
  }
}

router.get('/', (c) => {
  let ctrl
  const stream = new ReadableStream({
    type: 'direct',
    pull(controller) {
      ctrl = controller
      clients.add(ctrl)
      // Send immediately on connect
      ctrl.write(`event: state
data: ${JSON.stringify(currentState())}

`)
      ctrl.flush()
      return new Promise((resolve) => {
        c.req.raw.signal.addEventListener('abort', () => {
          clients.delete(ctrl)
          resolve()
        })
      })
    },
    cancel() {
      clients.delete(ctrl)
    }
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    }
  })
})

export default router