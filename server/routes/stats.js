import { Hono } from 'hono'
import db from '../db.js'

const router = new Hono()

export function computeLeaderboard(sessionId) {
  const rows = db.prepare(`
    SELECT p.id AS player_id, p.name,
      COUNT(*) AS played,
      SUM(CASE WHEN (m.team1_p1=qe.id OR m.team1_p2=qe.id) AND m.team1_score > m.team2_score THEN 1
               WHEN (m.team2_p1=qe.id OR m.team2_p2=qe.id) AND m.team2_score > m.team1_score THEN 1
               ELSE 0 END) AS wins,
      SUM(CASE WHEN m.team1_score = m.team2_score THEN 0
               WHEN (m.team1_p1=qe.id OR m.team1_p2=qe.id) AND m.team1_score < m.team2_score THEN 1
               WHEN (m.team2_p1=qe.id OR m.team2_p2=qe.id) AND m.team2_score < m.team1_score THEN 1
               ELSE 0 END) AS losses,
      SUM(CASE WHEN m.team1_p1=qe.id OR m.team1_p2=qe.id THEN COALESCE(m.team1_score,0) ELSE COALESCE(m.team2_score,0) END)
    - SUM(CASE WHEN m.team1_p1=qe.id OR m.team1_p2=qe.id THEN COALESCE(m.team2_score,0) ELSE COALESCE(m.team1_score,0) END) AS point_diff
    FROM queue_entries qe
    JOIN players p ON p.id = qe.player_id
    JOIN matches m ON m.session_id = qe.session_id
      AND (m.team1_p1=qe.id OR m.team1_p2=qe.id OR m.team2_p1=qe.id OR m.team2_p2=qe.id)
    WHERE qe.session_id = ? AND m.ended_at IS NOT NULL AND m.state = 'active'
    GROUP BY p.id
  `).all(sessionId)

  return rows
    .map(r => {
      const played = Number(r.played)
      const wins = Number(r.wins)
      const losses = Number(r.losses)
      const point_diff = Number(r.point_diff)
      const win_rate = played > 0 ? Math.round((wins / played) * 100) : 0
      return {
        player_id: r.player_id,
        name: r.name,
        played,
        wins,
        losses,
        win_rate,
        point_diff,
      }
    })
    .sort((a, b) =>
      b.win_rate - a.win_rate ||
      (b.played > 0 ? b.wins / b.played : 0) - (a.played > 0 ? a.wins / a.played : 0) ||
      b.point_diff - a.point_diff ||
      b.wins - a.wins ||
      a.name.localeCompare(b.name)
    )
}

router.get('/sessions/:id/stats', (c) => {
  const sid = c.req.param('id')
  const now = Math.floor(Date.now() / 1000)

  const player_count = db.prepare(
    "SELECT COUNT(*) as c FROM queue_entries WHERE session_id = ? AND status NOT IN ('left', 'staged')"
  ).get(sid).c

  const match_count = db.prepare(
    "SELECT COUNT(*) as c FROM matches WHERE session_id = ? AND state = 'active'"
  ).get(sid).c

  const waiters = db.prepare(
    "SELECT checked_in_at, total_seconds_played, rested_seconds FROM queue_entries WHERE session_id = ? AND status = 'waiting'"
  ).all(sid)
  const avg_wait_seconds = waiters.length
    ? Math.round(waiters.reduce((sum, e) => sum + (now - e.checked_in_at - e.total_seconds_played - (e.rested_seconds ?? 0)), 0) / waiters.length)
    : 0

  const shuttles = db.prepare(
    'SELECT COALESCE(SUM(new_shuttles), 0) as new, COALESCE(SUM(used_shuttles), 0) as used FROM matches WHERE session_id = ?'
  ).get(sid)

  const leaderboard = computeLeaderboard(sid)

  return c.json({ stats: { player_count, match_count, avg_wait_seconds, leaderboard, shuttles } })
})

router.get('/players/:id/history', (c) => {
  const pid = c.req.param('id')

  const rows = db.prepare(`
    SELECT
      m.team1_score, m.team2_score,
      qe.id as entry_id,
      CASE WHEN m.team1_p1 = qe.id OR m.team1_p2 = qe.id THEN 1 ELSE 2 END as team
    FROM matches m
    JOIN queue_entries qe ON qe.player_id = ?
      AND (m.team1_p1 = qe.id OR m.team1_p2 = qe.id OR m.team2_p1 = qe.id OR m.team2_p2 = qe.id)
    WHERE m.ended_at IS NOT NULL
  `).all(pid)

  const wins = rows.filter(r =>
    (r.team === 1 && r.team1_score > r.team2_score) ||
    (r.team === 2 && r.team2_score > r.team1_score)
  ).length

  return c.json({ history: { wins, losses: rows.length - wins, matches_played: rows.length } })
})

export default router
