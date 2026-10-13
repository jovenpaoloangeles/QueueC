import { Router } from 'express'
import db from '../db.js'

const router = Router()

router.get('/sessions/:id/stats', (req, res) => {
  const sid = req.params.id
  const now = Math.floor(Date.now() / 1000)

  const player_count = db.prepare(
    "SELECT COUNT(*) as c FROM queue_entries WHERE session_id = ? AND status != 'left'"
  ).get(sid).c

  const match_count = db.prepare(
    'SELECT COUNT(*) as c FROM matches WHERE session_id = ?'
  ).get(sid).c

  const waiters = db.prepare(
    "SELECT checked_in_at, total_seconds_played FROM queue_entries WHERE session_id = ? AND status = 'waiting'"
  ).all(sid)
  const avg_wait_seconds = waiters.length
    ? Math.round(waiters.reduce((sum, e) => sum + (now - e.checked_in_at - e.total_seconds_played), 0) / waiters.length)
    : 0

  // Leaderboard: count wins from ended matches this session
  const leaderboard = db.prepare(`
    SELECT p.id as player_id, p.name,
      SUM(
        CASE
          WHEN (m.team1_p1 = qe.id OR m.team1_p2 = qe.id) AND m.team1_score > m.team2_score THEN 1
          WHEN (m.team2_p1 = qe.id OR m.team2_p2 = qe.id) AND m.team2_score > m.team1_score THEN 1
          ELSE 0
        END
      ) as wins
    FROM matches m
    JOIN queue_entries qe ON (qe.id = m.team1_p1 OR qe.id = m.team1_p2 OR qe.id = m.team2_p1 OR qe.id = m.team2_p2)
    JOIN players p ON p.id = qe.player_id
    WHERE m.session_id = ? AND m.ended_at IS NOT NULL
    GROUP BY p.id
    ORDER BY wins DESC
    LIMIT 5
  `).all(sid)

  res.json({ stats: { player_count, match_count, avg_wait_seconds, leaderboard } })
})

router.get('/players/:id/history', (req, res) => {
  const pid = req.params.id

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

  res.json({ history: { wins, losses: rows.length - wins, matches_played: rows.length } })
})

export default router
