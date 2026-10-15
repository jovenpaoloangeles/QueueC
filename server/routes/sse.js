import { Hono } from 'hono'
import db from '../db.js'
import { computeLeaderboard } from './stats.js'

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

export function currentState() {
  const session = db.prepare(
    'SELECT * FROM sessions WHERE ended_at IS NULL ORDER BY started_at DESC LIMIT 1'
  ).get() ?? null

  if (!session) return { session: null, queue: [], activeMatches: [], slatedMatches: [], courts: [], stats: null, serverTime: Math.floor(Date.now() / 1000) }

  const now = Math.floor(Date.now() / 1000)

  const queue = db.prepare(`
    SELECT qe.*, p.name, p.skill_level,
           ROUND(MAX(0, ? - qe.checked_in_at - qe.total_seconds_played) / 60.0 / (qe.games_played + 1), 2) AS fairness,
           (SELECT ROUND(AVG(m.rating), 1) FROM matches m
             WHERE m.session_id = qe.session_id AND m.rating IS NOT NULL
               AND (m.team1_p1 = qe.id OR m.team1_p2 = qe.id
                 OR m.team2_p1 = qe.id OR m.team2_p2 = qe.id)) AS avg_rating
    FROM queue_entries qe JOIN players p ON p.id = qe.player_id
    WHERE qe.session_id = ? AND qe.status NOT IN ('left','staged')
    ORDER BY qe.sort_order, qe.checked_in_at, qe.id
  `).all(now, session.id)

  const activeMatches = db.prepare(
    "SELECT * FROM matches WHERE session_id = ? AND state = 'active' AND ended_at IS NULL"
  ).all(session.id)

  const slatedRows = db.prepare(`
    SELECT m.*,
      (SELECT p.name FROM queue_entries qe JOIN players p ON p.id = qe.player_id WHERE qe.id = m.team1_p1) AS team1_p1_name,
      (SELECT p.skill_level FROM queue_entries qe JOIN players p ON p.id = qe.player_id WHERE qe.id = m.team1_p1) AS team1_p1_skill,
      (SELECT p.name FROM queue_entries qe JOIN players p ON p.id = qe.player_id WHERE qe.id = m.team1_p2) AS team1_p2_name,
      (SELECT p.skill_level FROM queue_entries qe JOIN players p ON p.id = qe.player_id WHERE qe.id = m.team1_p2) AS team1_p2_skill,
      (SELECT p.name FROM queue_entries qe JOIN players p ON p.id = qe.player_id WHERE qe.id = m.team2_p1) AS team2_p1_name,
      (SELECT p.skill_level FROM queue_entries qe JOIN players p ON p.id = qe.player_id WHERE qe.id = m.team2_p1) AS team2_p1_skill,
      (SELECT p.name FROM queue_entries qe JOIN players p ON p.id = qe.player_id WHERE qe.id = m.team2_p2) AS team2_p2_name,
      (SELECT p.skill_level FROM queue_entries qe JOIN players p ON p.id = qe.player_id WHERE qe.id = m.team2_p2) AS team2_p2_skill
    FROM matches m
    WHERE m.session_id = ? AND m.state = 'slated' AND m.ended_at IS NULL
    ORDER BY m.slate_seq, m.id
  `).all(session.id)

  const slatedMatches = slatedRows.map(r => ({
    ...r,
    team1_names: [r.team1_p1_name, r.team1_p2_name].filter(Boolean).join(','),
    team2_names: [r.team2_p1_name, r.team2_p2_name].filter(Boolean).join(','),
    names: [r.team1_p1_name, r.team1_p2_name, r.team2_p1_name, r.team2_p2_name].filter(Boolean).join(','),
  }))

  const courts = db.prepare(
    'SELECT * FROM courts WHERE session_id = ? ORDER BY id'
  ).all(session.id)

  const waiters = queue.filter(e => e.status === 'waiting')
  const avg_wait_seconds = waiters.length
    ? Math.round(waiters.reduce((s, e) => s + (now - e.checked_in_at - e.total_seconds_played), 0) / waiters.length)
    : 0

  const match_count = db.prepare(
    "SELECT COUNT(*) as c FROM matches WHERE session_id = ? AND state = 'active'"
  ).get(session.id).c

  const shuttles = db.prepare(
    'SELECT COALESCE(SUM(new_shuttles), 0) as new, COALESCE(SUM(used_shuttles), 0) as used FROM matches WHERE session_id = ?'
  ).get(session.id)

  const leaderboard = computeLeaderboard(session.id)

  return {
    session,
    queue,
    activeMatches,
    slatedMatches,
    courts,
    stats: { player_count: queue.length, match_count, avg_wait_seconds, leaderboard, shuttles },
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