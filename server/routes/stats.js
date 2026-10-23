import { Hono } from "hono";
import db from "../db.js";
import { broadcast } from "./sse.js";

const router = new Hono();

export function computeLeaderboard(sessionId) {
  const rows = db
    .prepare(`
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
  `)
    .all(sessionId);

  return rows
    .map((r) => {
      const played = Number(r.played);
      const wins = Number(r.wins);
      const losses = Number(r.losses);
      const point_diff = Number(r.point_diff);
      const win_rate = played > 0 ? Math.round((wins / played) * 100) : 0;
      return {
        player_id: r.player_id,
        name: r.name,
        played,
        wins,
        losses,
        win_rate,
        point_diff,
      };
    })
    .sort(
      (a, b) =>
        b.win_rate - a.win_rate ||
        (b.played > 0 ? b.wins / b.played : 0) - (a.played > 0 ? a.wins / a.played : 0) ||
        b.point_diff - a.point_diff ||
        b.wins - a.wins ||
        a.name.localeCompare(b.name),
    );
}

// v1.3 session detail: everything the history page renders, read straight
// from the tables (no live-broadcast coupling). Export reuses the same
// builder so a downloaded file never diverges from the page.
export function getSessionDetail(sessionId) {
  const session = db.prepare("SELECT * FROM sessions WHERE id = ?").get(sessionId);
  if (!session) return null;

  const seat = (eid) =>
    eid == null
      ? []
      : db
          .prepare(
            `SELECT qe.id AS entry_id, qe.player_id, p.name FROM queue_entries qe
             JOIN players p ON p.id = qe.player_id WHERE qe.id = ?`,
          )
          .all(eid);

  const games = db
    .prepare(
      "SELECT id, format, state, court_number, started_at, ended_at, team1_score, team2_score, rating, new_shuttles, used_shuttles, team1_p1, team1_p2, team2_p1, team2_p2 FROM matches WHERE session_id = ? ORDER BY started_at, id",
    )
    .all(sessionId)
    .map((m) => ({
      id: m.id,
      format: m.format,
      state: m.state,
      court_number: m.court_number,
      started_at: m.started_at,
      ended_at: m.ended_at,
      team1_score: m.team1_score,
      team2_score: m.team2_score,
      rating: m.rating,
      new_shuttles: m.new_shuttles,
      used_shuttles: m.used_shuttles,
      team1: [...seat(m.team1_p1), ...seat(m.team1_p2)],
      team2: [...seat(m.team2_p1), ...seat(m.team2_p2)],
    }));

  const attendance = db
    .prepare(
      `SELECT qe.id AS entry_id, qe.player_id, p.name, qe.checked_in_at, qe.status
       FROM queue_entries qe JOIN players p ON p.id = qe.player_id
       WHERE qe.session_id = ? ORDER BY qe.sort_order, qe.id`,
    )
    .all(sessionId);

  const shuttles = db
    .prepare(
      "SELECT COALESCE(SUM(new_shuttles), 0) as new, COALESCE(SUM(used_shuttles), 0) as used FROM matches WHERE session_id = ?",
    )
    .get(sessionId);
  shuttles.extra = session.shuttles_extra ?? 0;
  shuttles.total = shuttles.new + shuttles.extra;

  return { session, leaderboard: computeLeaderboard(sessionId), games, attendance, shuttles };
}

router.get("/sessions/:id/detail", (c) => {
  const detail = getSessionDetail(c.req.param("id"));
  if (!detail) return c.json({ error: "Session not found" }, 404);
  return c.json(detail);
});

router.get("/sessions/:id/stats", (c) => {
  const sid = c.req.param("id");
  const now = Math.floor(Date.now() / 1000);

  const player_count = db
    .prepare(
      "SELECT COUNT(*) as c FROM queue_entries WHERE session_id = ? AND status NOT IN ('left', 'staged')",
    )
    .get(sid).c;

  const match_count = db
    .prepare("SELECT COUNT(*) as c FROM matches WHERE session_id = ? AND state = 'active'")
    .get(sid).c;

  const waiters = db
    .prepare(
      "SELECT checked_in_at, total_seconds_played FROM queue_entries WHERE session_id = ? AND status = 'waiting'",
    )
    .all(sid);
  const avg_wait_seconds = waiters.length
    ? Math.round(
        waiters.reduce((sum, e) => sum + (now - e.checked_in_at - e.total_seconds_played), 0) /
          waiters.length,
      )
    : 0;

  const shuttles = db
    .prepare(
      "SELECT COALESCE(SUM(new_shuttles), 0) as new, COALESCE(SUM(used_shuttles), 0) as used FROM matches WHERE session_id = ?",
    )
    .get(sid);
  shuttles.extra =
    db.prepare("SELECT shuttles_extra FROM sessions WHERE id = ?").get(sid)?.shuttles_extra ?? 0;
  shuttles.total = shuttles.new + shuttles.extra;

  const leaderboard = computeLeaderboard(sid);

  return c.json({ stats: { player_count, match_count, avg_wait_seconds, leaderboard, shuttles } });
});

// v1.3 career page: all-time totals, doubles partners, session attendance and
// monthly attendance % (a session counts toward a month iff the player
// existed when it was scheduled). Export reuses this builder.
export function getCareer(playerId) {
  const player = db.prepare("SELECT id, name, skill_level FROM players WHERE id = ?").get(playerId);
  if (!player) return null;

  const rows = db
    .prepare(`
    SELECT m.id, m.team1_score, m.team2_score, m.started_at, m.ended_at,
      m.team1_p1, m.team1_p2, m.team2_p1, m.team2_p2,
      CASE WHEN m.team1_p1 = qe.id OR m.team1_p2 = qe.id THEN 1 ELSE 2 END AS side
    FROM matches m
    JOIN queue_entries qe ON qe.id IN (m.team1_p1, m.team1_p2, m.team2_p1, m.team2_p2)
    WHERE qe.player_id = ? AND m.state = 'active' AND m.ended_at IS NOT NULL
    ORDER BY m.started_at, m.id
  `)
    .all(playerId);

  const won = (r) => (r.side === 1 ? r.team1_score > r.team2_score : r.team2_score > r.team1_score);
  const games = rows.length;
  const wins = rows.filter(won).length;
  const totals = {
    games,
    wins,
    losses: games - wins,
    win_rate: games > 0 ? Math.round((wins / games) * 100) : 0,
    point_diff: rows.reduce(
      (sum, r) => sum + (r.side === 1 ? r.team1_score - r.team2_score : r.team2_score - r.team1_score),
      0,
    ),
    seconds_played: rows.reduce((sum, r) => sum + (r.ended_at - r.started_at), 0),
  };

  // doubles teammates only: the other entry on the player's side
  const partners = new Map();
  for (const r of rows) {
    const mateEntry = r.side === 1 ? r.team1_p2 : r.team2_p2;
    if (mateEntry == null) continue;
    const mate = db
      .prepare(
        "SELECT qe.player_id, p.name FROM queue_entries qe JOIN players p ON p.id = qe.player_id WHERE qe.id = ?",
      )
      .get(mateEntry);
    if (!mate || mate.player_id === player.id) continue;
    const cur = partners.get(mate.player_id) ?? { player_id: mate.player_id, name: mate.name, games: 0, wins: 0, losses: 0 };
    cur.games += 1;
    if (won(r)) cur.wins += 1;
    else cur.losses += 1;
    partners.set(mate.player_id, cur);
  }

  const sessions = db
    .prepare(`
    SELECT s.id AS session_id, s.name, s.scheduled_start AS date,
      (SELECT COUNT(*) FROM matches m WHERE m.state = 'active' AND m.ended_at IS NOT NULL
         AND qe.id IN (m.team1_p1, m.team1_p2, m.team2_p1, m.team2_p2)) AS games_played
    FROM queue_entries qe JOIN sessions s ON s.id = qe.session_id
    WHERE qe.player_id = ? AND s.ended_at IS NOT NULL
    ORDER BY s.ended_at DESC
  `)
    .all(playerId);

  // monthly %: denominator is every ended session eligible for this player
  // (scheduled after they joined the pool), numerator is the ones they
  // actually appear in — missed sessions must count against the percentage.
  const attended = new Set(sessions.map((s) => s.session_id));
  const byMonth = new Map();
  for (const s of db
    .prepare("SELECT id, scheduled_start FROM sessions WHERE ended_at IS NOT NULL ORDER BY scheduled_start")
    .all()) {
    if (s.scheduled_start < player.created_at) continue;
    const month = new Date(s.scheduled_start * 1000).toISOString().slice(0, 7);
    const cur = byMonth.get(month) ?? { month, attended: 0, total: 0 };
    cur.total += 1;
    if (attended.has(s.id)) cur.attended += 1;
    byMonth.set(month, cur);
  }
  const months = [...byMonth.values()].map((m) => ({
    ...m,
    pct: m.total > 0 ? Math.round((m.attended / m.total) * 100) : 0,
  }));

  return {
    player,
    totals,
    partners: [...partners.values()].sort((a, b) => b.games - a.games || a.name.localeCompare(b.name)),
    attendance: { sessions, months },
  };
}

router.get("/players/:id/career", (c) => {
  const career = getCareer(c.req.param("id"));
  if (!career) return c.json({ error: "Player not found" }, 404);
  return c.json(career);
});

router.get("/players/:id/history", (c) => {
  const pid = c.req.param("id");

  const rows = db
    .prepare(`
    SELECT
      m.team1_score, m.team2_score,
      qe.id as entry_id,
      CASE WHEN m.team1_p1 = qe.id OR m.team1_p2 = qe.id THEN 1 ELSE 2 END as team
    FROM matches m
    JOIN queue_entries qe ON qe.player_id = ?
      AND (m.team1_p1 = qe.id OR m.team1_p2 = qe.id OR m.team2_p1 = qe.id OR m.team2_p2 = qe.id)
    WHERE m.ended_at IS NOT NULL
  `)
    .all(pid);

  const wins = rows.filter(
    (r) => (r.team === 1 && r.team1_score > r.team2_score) || (r.team === 2 && r.team2_score > r.team1_score),
  ).length;

  return c.json({ history: { wins, losses: rows.length - wins, matches_played: rows.length } });
});

// session-level shuttle adjustments (+ New shuttle button): delta on top of the
// per-game defaults, clamped so extra can't go negative
router.patch("/sessions/:id/shuttles", async (c) => {
  const session = db.prepare("SELECT id FROM sessions WHERE id = ?").get(c.req.param("id"));
  if (!session) return c.json({ error: "Session not found" }, 404);
  const body = await c.req.json().catch(() => ({}));
  const delta = Number(body.delta);
  if (!Number.isInteger(delta) || delta === 0) {
    return c.json({ error: "delta must be a non-zero integer" }, 400);
  }
  db.prepare("UPDATE sessions SET shuttles_extra = MAX(0, shuttles_extra + ?) WHERE id = ?").run(
    delta,
    session.id,
  );
  broadcast();
  return c.json({
    shuttles_extra: db.prepare("SELECT shuttles_extra FROM sessions WHERE id = ?").get(session.id)
      .shuttles_extra,
  });
});

export default router;
