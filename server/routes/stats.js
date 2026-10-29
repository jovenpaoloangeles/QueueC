import { Hono } from "hono";
import db from "../db.js";
import { loadRatings } from "../logic/ratings.js";
import { broadcast } from "./sse.js";

const router = new Hono();

// v1.4: one query for every leaderboard — `where` scopes the matches
// (this session, or games started since a timestamp for month/all-time).
function leaderboard(where, ...params) {
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
    WHERE ${where} AND m.ended_at IS NOT NULL AND m.state = 'active'
    GROUP BY p.id
  `)
    .all(...params);

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

export const computeLeaderboard = (sessionId) => leaderboard("qe.session_id = ?", sessionId);

// v1.4 fairness: net wait = gaps between a player's games (check-in or
// session start → first game, each game end → next game start). Only closed
// gaps count; a never-called player shows up as games=0 instead.
// ponytail: resting time counts as waiting (rest isn't recorded), add rest
// spans if a rester skews "most bumped".
function computeFairness(session, games, attendance) {
  const done = games.filter((g) => g.state === "active" && g.ended_at != null);
  const players = attendance.map((a) => {
    let prev = Math.max(a.checked_in_at, session.started_at ?? a.checked_in_at);
    const gaps = [];
    for (const g of done) {
      if (![...g.team1, ...g.team2].some((p) => p.entry_id === a.entry_id)) continue;
      gaps.push(Math.max(0, g.started_at - prev));
      prev = g.ended_at;
    }
    return { player_id: a.player_id, name: a.name, games: gaps.length, gaps };
  });
  const counts = players.map((p) => p.games).sort((a, b) => a - b);
  const n = counts.length;
  const allGaps = players.flatMap((p) => p.gaps);
  return {
    games: {
      min: n ? counts[0] : 0,
      median: n ? (counts[(n - 1) >> 1] + counts[n >> 1]) / 2 : 0,
      max: n ? counts[n - 1] : 0,
    },
    avg_wait_seconds: allGaps.length ? Math.round(allGaps.reduce((a, b) => a + b, 0) / allGaps.length) : 0,
    most_bumped: players
      .filter((p) => p.gaps.length)
      .map((p) => ({
        player_id: p.player_id,
        name: p.name,
        games: p.games,
        longest_wait_seconds: Math.max(...p.gaps),
      }))
      .sort((a, b) => b.longest_wait_seconds - a.longest_wait_seconds)
      .slice(0, 3),
  };
}

// v1.6 payments: each attendee's share, rounded to whole pesos. 'equal'
// splits court fee + all shuttles evenly; 'per_game' splits the court fee
// (and session-level extra shuttles) evenly, and each finished game's
// shuttles among the players in it.
function computePayments(session, games, attendance, shuttles) {
  const n = attendance.length;
  const price = session.shuttle_price ?? 0;
  const fee = session.court_fee ?? 0;
  const perGame = session.fee_split === "per_game";
  const done = games.filter((g) => g.state === "active" && g.ended_at != null);
  const rows = attendance.map((a) => {
    let share = n ? (perGame ? fee + shuttles.extra * price : fee + shuttles.total * price) / n : 0;
    if (perGame) {
      for (const g of done) {
        const seats = [...g.team1, ...g.team2];
        if (seats.some((p) => p.entry_id === a.entry_id)) share += (g.new_shuttles * price) / seats.length;
      }
    }
    return {
      entry_id: a.entry_id,
      player_id: a.player_id,
      name: a.name,
      share: Math.round(share),
      paid: !!a.paid,
    };
  });
  return {
    court_fee: fee,
    shuttle_price: price,
    split: session.fee_split ?? "equal",
    rows,
    total: rows.reduce((s, r) => s + r.share, 0),
    collected: rows.filter((r) => r.paid).reduce((s, r) => s + r.share, 0),
  };
}

// v1.4 highlights: in-session win streaks (>=3), consecutive-session
// attendance streaks (>=3) and career-game milestones (25th, 50th, every 100th) reached this session.
const isMilestone = (n) => n === 25 || n === 50 || n % 100 === 0;
function computeHighlights(session, attendance) {
  const rows = db
    .prepare(`
    SELECT m.session_id, qe.player_id,
      CASE WHEN qe.id IN (m.team1_p1, m.team1_p2) THEN m.team1_score > m.team2_score
           ELSE m.team2_score > m.team1_score END AS won
    FROM matches m JOIN queue_entries qe ON qe.id IN (m.team1_p1, m.team1_p2, m.team2_p1, m.team2_p2)
    WHERE m.state = 'active' AND m.ended_at IS NOT NULL
      AND qe.player_id IN (SELECT player_id FROM queue_entries WHERE session_id = ?)
    ORDER BY m.started_at, m.id
  `)
    .all(session.id);
  const byPlayer = new Map();
  for (const r of rows) byPlayer.set(r.player_id, [...(byPlayer.get(r.player_id) ?? []), r]);

  // sessions up to and including this one, oldest first
  const order = db
    .prepare(
      `SELECT id FROM sessions WHERE (ended_at IS NOT NULL OR id = ?)
         AND (scheduled_start < ? OR (scheduled_start = ? AND id <= ?))
       ORDER BY scheduled_start, id`,
    )
    .all(session.id, session.scheduled_start, session.scheduled_start, session.id)
    .map((s) => s.id);
  const attendedBy = new Map();
  for (const r of db.prepare("SELECT DISTINCT session_id, player_id FROM queue_entries").all()) {
    attendedBy.set(r.player_id, (attendedBy.get(r.player_id) ?? new Set()).add(r.session_id));
  }

  const win_streaks = [];
  const attendance_streaks = [];
  const milestones = [];
  const seen = new Set();
  for (const a of attendance) {
    if (seen.has(a.player_id)) continue;
    seen.add(a.player_id);
    const career = byPlayer.get(a.player_id) ?? [];
    let run = 0;
    let best = 0;
    career.forEach((r, i) => {
      if (r.session_id !== session.id) return;
      run = r.won ? run + 1 : 0;
      best = Math.max(best, run);
      if (isMilestone(i + 1)) milestones.push({ player_id: a.player_id, name: a.name, game: i + 1 });
    });
    if (best >= 3) win_streaks.push({ player_id: a.player_id, name: a.name, streak: best });

    const went = attendedBy.get(a.player_id) ?? new Set();
    let streak = 0;
    for (let i = order.length - 1; i >= 0 && went.has(order[i]); i--) streak++;
    if (streak >= 3) attendance_streaks.push({ player_id: a.player_id, name: a.name, streak });
  }
  const desc = (a, b) => b.streak - a.streak || a.name.localeCompare(b.name);
  return {
    win_streaks: win_streaks.sort(desc),
    attendance_streaks: attendance_streaks.sort(desc),
    milestones: milestones.sort((a, b) => b.game - a.game || a.name.localeCompare(b.name)),
  };
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
      "SELECT id, format, state, court_number, started_at, ended_at, team1_score, team2_score, rating, new_shuttles, used_shuttles, team1_p1, team1_p2, team2_p1, team2_p2 FROM matches WHERE session_id = ? AND state != 'slated' ORDER BY started_at, id",
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
      `SELECT qe.id AS entry_id, qe.player_id, p.name, qe.checked_in_at, qe.status, qe.paid
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

  return {
    session,
    leaderboard: computeLeaderboard(sessionId),
    games,
    attendance,
    shuttles,
    fairness: computeFairness(session, games, attendance),
    payments: computePayments(session, games, attendance, shuttles),
    highlights: computeHighlights(session, attendance),
  };
}

const MIN_RANKED = 3;

// v1.4 leaderboard windows: games started at/after `since` (unix seconds;
// the client sends its local month start, or 0 for all-time).
router.get("/leaderboard", (c) => {
  const since = Number(c.req.query("since") ?? 0);
  if (!Number.isFinite(since)) return c.json({ error: "since must be a unix timestamp" }, 400);
  // win %-first ranking lets a lone 1-0 top a month; rank players with a real
  // sample first (stable sort keeps the usual order within each group)
  const board = leaderboard("m.started_at >= ?", since);
  return c.json({ leaderboard: board.sort((a, b) => (b.played >= MIN_RANKED) - (a.played >= MIN_RANKED)) });
});

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
  const player = db
    .prepare("SELECT id, name, skill_level, created_at FROM players WHERE id = ?")
    .get(playerId);
  if (!player) return null;

  const rows = db
    .prepare(`
    SELECT m.id, m.team1_score, m.team2_score, m.started_at, m.ended_at,
      m.team1_p1, m.team1_p2, m.team2_p1, m.team2_p2,
      CASE WHEN m.team1_p1 = qe.id OR m.team1_p2 = qe.id THEN 1 ELSE 2 END AS side,
      CASE WHEN m.team1_p1 = qe.id THEN m.team1_p2
           WHEN m.team1_p2 = qe.id THEN m.team1_p1
           WHEN m.team2_p1 = qe.id THEN m.team2_p2
           ELSE m.team2_p1 END AS mate_entry
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
    losses: rows.filter((r) => r.team1_score !== r.team2_score && !won(r)).length,
    win_rate: games > 0 ? Math.round((wins / games) * 100) : 0,
    point_diff: rows.reduce(
      (sum, r) => sum + (r.side === 1 ? r.team1_score - r.team2_score : r.team2_score - r.team1_score),
      0,
    ),
    seconds_played: rows.reduce((sum, r) => sum + (r.ended_at - r.started_at), 0),
  };

  // doubles teammates (the other entry on the player's side) and opponents
  // (every entry on the other side), each with the combined record
  const who = db.prepare(
    "SELECT qe.player_id, p.name FROM queue_entries qe JOIN players p ON p.id = qe.player_id WHERE qe.id = ?",
  );
  const tally = (map, entry, r) => {
    const p = entry == null ? null : who.get(entry);
    if (!p || p.player_id === player.id) return;
    const cur = map.get(p.player_id) ?? {
      player_id: p.player_id,
      name: p.name,
      games: 0,
      wins: 0,
      losses: 0,
    };
    cur.games += 1;
    if (won(r)) cur.wins += 1;
    else if (r.team1_score !== r.team2_score) cur.losses += 1;
    map.set(p.player_id, cur);
  };
  const partners = new Map();
  const opponents = new Map();
  for (const r of rows) {
    tally(partners, r.mate_entry, r);
    for (const e of r.side === 1 ? [r.team2_p1, r.team2_p2] : [r.team1_p1, r.team1_p2])
      tally(opponents, e, r);
  }
  const ranked = (map) =>
    [...map.values()]
      .map((p) => ({ ...p, win_rate: Math.round((p.wins / p.games) * 100) }))
      .sort((a, b) => b.games - a.games || a.name.localeCompare(b.name));

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
    // pre-dating the player only excuses sessions they missed — one they
    // attended always counts (rosters imported after the club's first nights)
    if (s.scheduled_start < player.created_at && !attended.has(s.id)) continue;
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

  const r = loadRatings(db).get(player.id);
  return {
    player,
    // v1.7 learned skill on the tier scale (1 newbie … 7 professional)
    rating: r
      ? { mu: Math.round(r.mu * 100) / 100, sigma: Math.round(r.sigma * 100) / 100, games: r.games }
      : null,
    totals,
    partners: ranked(partners),
    opponents: ranked(opponents),
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
