import { Hono } from "hono";
import db from "../db.js";
import { broadcast } from "./sse.js";

const router = new Hono();

/**
 * Validate a proposed team arrangement against the entries currently on court.
 * Returns { ok: true, value } or { ok: false, error }.
 * ponytail: membership is fixed at the four on-court entries; bench someone
 * first via PATCH /api/queue/:id/status if you need a different set
 */
export function validateTeamSlots(body, currentIds) {
  const value = {
    team1_p1: body.team1_p1 ?? null,
    team1_p2: body.team1_p2 ?? null,
    team2_p1: body.team2_p1 ?? null,
    team2_p2: body.team2_p2 ?? null,
  };
  if (!value.team1_p1 || !value.team2_p1) {
    return { ok: false, error: "team1_p1 and team2_p1 are required" };
  }
  const provided = [value.team1_p1, value.team1_p2, value.team2_p1, value.team2_p2].filter(Boolean);
  if (new Set(provided).size !== provided.length) {
    return { ok: false, error: "duplicate entry in team slots" };
  }
  const current = new Set(currentIds);
  for (const id of provided) {
    if (!current.has(id)) return { ok: false, error: `entry ${id} is not on this court` };
  }
  if (provided.length !== currentIds.length) {
    return { ok: false, error: "payload must be a rearrangement of the entries on this court" };
  }
  return { ok: true, value };
}

router.post("/", async (c) => {
  const { session_id, court_number, team1_p1, team1_p2, team2_p1, team2_p2 } = await c.req
    .json()
    .catch(() => ({}));
  const session = db.prepare("SELECT * FROM sessions WHERE id = ?").get(session_id);
  if (!session) return c.json({ error: "Session not found" }, 404);
  if (session.started_at == null) return c.json({ error: "Session not started" }, 400);
  if (session.paused_at != null) return c.json({ error: "Session is paused" }, 409);
  const now = Math.floor(Date.now() / 1000);

  const court = db
    .prepare("SELECT * FROM courts WHERE id = ? AND session_id = ?")
    .get(court_number, session_id);
  if (court) {
    if (!court.enabled) return c.json({ error: "Court is disabled" }, 400);
    if (court.active_from != null && now < court.active_from)
      return c.json({ error: "Court is not open yet" }, 400);
    if (court.expires_at != null && now >= court.expires_at)
      return c.json({ error: "Court has expired" }, 400);
    if (court.active_until != null && now >= court.active_until)
      return c.json({ error: "Court reservation has ended" }, 400);
  }

  // Backstop against double-booking: every entry must belong to this session
  // and still be waiting (mirrors the slate route's check)
  for (const id of [team1_p1, team1_p2, team2_p1, team2_p2].filter(Boolean)) {
    const e = db
      .prepare("SELECT status FROM queue_entries WHERE id = ? AND session_id = ?")
      .get(id, session_id);
    if (e?.status !== "waiting") {
      return c.json({ error: `entry ${id} is not waiting` }, 400);
    }
  }

  const format = team1_p2 ? "doubles" : "singles";

  const { lastInsertRowid } = db
    .prepare(`
    INSERT INTO matches (session_id, court_number, format, team1_p1, team1_p2, team2_p1, team2_p2, started_at, new_shuttles)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1)
  `)
    .run(session_id, court_number, format, team1_p1, team1_p2 ?? null, team2_p1, team2_p2 ?? null, now);

  // Mark all involved players as playing
  const playerEntryIds = [team1_p1, team1_p2, team2_p1, team2_p2].filter(Boolean);
  const setPlaying = db.prepare("UPDATE queue_entries SET status = ?, status_updated_at = ? WHERE id = ?");
  for (const id of playerEntryIds) setPlaying.run("playing", now, id);

  const match = db.prepare("SELECT * FROM matches WHERE id = ?").get(lastInsertRowid);
  broadcast();
  return c.json({ match }, 201);
});

// Abort a live match — the undo of POST /. Entries return to waiting with
// sort_order untouched (they never left the queue's ordering); the row is
// deleted. v1.3: ended matches delete too (history correction), but only via
// the explicit ?historical=1 path — a bare DELETE (the toast-undo's abort)
// 409s, so a stray undo click can't erase a fully-played game. The row goes
// and the ex-players' derived stats are recomputed from the remaining log.
// Slated rows still refuse: unstage them via DELETE /matches/:id/slate.
router.delete("/:id", (c) => {
  const id = c.req.param("id");
  const match = db.prepare("SELECT * FROM matches WHERE id = ? AND state = 'active'").get(id);
  if (!match) return c.json({ error: "Match not found" }, 404);
  if (match.ended_at != null && c.req.query("historical") !== "1") {
    return c.json({ error: "Match already ended — delete it from the session history page" }, 409);
  }
  const now = Math.floor(Date.now() / 1000);
  const entryIds = [match.team1_p1, match.team1_p2, match.team2_p1, match.team2_p2].filter(Boolean);
  db.transaction(() => {
    if (match.ended_at == null) {
      const setWaiting = db.prepare(
        "UPDATE queue_entries SET status = 'waiting', status_updated_at = ? WHERE id = ?",
      );
      for (const eid of entryIds) setWaiting.run(now, eid);
    }
    db.prepare("DELETE FROM matches WHERE id = ?").run(id);
    if (match.ended_at != null) recomputeEntries(entryIds);
  })();
  broadcast();
  return c.json({ ok: true });
});

router.patch("/:id/end", async (c) => {
  const id = c.req.param("id");
  const { team1_score, team2_score, new_shuttles, used_shuttles, rating } = await c.req
    .json()
    .catch(() => ({}));
  if (rating !== undefined && rating !== null) {
    if (typeof rating !== "number" || !Number.isFinite(rating) || rating < 1 || rating > 5) {
      return c.json({ error: "rating must be between 1 and 5" }, 400);
    }
  }
  for (const [name, v] of [
    ["team1_score", team1_score],
    ["team2_score", team2_score],
  ]) {
    if (typeof v !== "number" || !Number.isInteger(v) || v < 0 || v > 99) {
      return c.json({ error: `${name} must be an integer between 0 and 99` }, 400);
    }
  }
  // badminton has no draws — a tie is always a typo
  if (team1_score === team2_score) return c.json({ error: "Scores can't be tied" }, 400);
  for (const [name, v] of [
    ["new_shuttles", new_shuttles],
    ["used_shuttles", used_shuttles],
  ]) {
    if (v !== undefined && v !== null && (typeof v !== "number" || !Number.isInteger(v) || v < 0)) {
      return c.json({ error: `${name} must be a non-negative integer` }, 400);
    }
  }
  const now = Math.floor(Date.now() / 1000);

  const match = db.prepare("SELECT * FROM matches WHERE id = ? AND state = 'active'").get(id);
  if (!match) return c.json({ error: "Match not found" }, 404);
  if (db.prepare("SELECT paused_at FROM sessions WHERE id = ?").get(match.session_id)?.paused_at != null) {
    return c.json({ error: "Session is paused" }, 409);
  }

  const duration = now - match.started_at;

  db.transaction(() => {
    db.prepare(`
      UPDATE matches
      SET team1_score = ?,
          team2_score = ?,
          new_shuttles = COALESCE(?, new_shuttles),
          used_shuttles = COALESCE(?, used_shuttles),
          rating = COALESCE(?, rating),
          ended_at = ?
      WHERE id = ?
    `).run(team1_score, team2_score, new_shuttles ?? null, used_shuttles ?? null, rating ?? null, now, id);

    // Update queue entries: back to waiting, last_played_at, total_seconds_played, games_played, status_updated_at
    const playerEntryIds = [match.team1_p1, match.team1_p2, match.team2_p1, match.team2_p2].filter(Boolean);
    const updateEntry = db.prepare(`
      UPDATE queue_entries
      SET status = 'waiting',
          last_played_at = ?,
          status_updated_at = ?,
          total_seconds_played = total_seconds_played + ?,
          games_played = games_played + 1
      WHERE id = ?
    `);
    for (const entryId of playerEntryIds) updateEntry.run(now, now, duration, entryId);

    const freed = match.court_number;
    const court = db.prepare("SELECT * FROM courts WHERE id = ?").get(freed);
    const usable =
      court?.enabled &&
      (court.active_from == null || now >= court.active_from) &&
      (court.expires_at == null || now < court.expires_at) &&
      (court.active_until == null || now < court.active_until);
    if (usable) {
      const next = db
        .prepare(
          "SELECT * FROM matches WHERE session_id = ? AND state = 'slated' AND ended_at IS NULL ORDER BY slate_seq, id LIMIT 1",
        )
        .get(match.session_id);
      if (next) {
        db.prepare(
          "UPDATE matches SET state = 'active', court_number = ?, started_at = ?, slate_seq = NULL, new_shuttles = 1 WHERE id = ?",
        ).run(freed, now, next.id);
        const slatedEntryIds = [next.team1_p1, next.team1_p2, next.team2_p1, next.team2_p2].filter(Boolean);
        const toPlay = db.prepare(
          "UPDATE queue_entries SET status = 'playing', status_updated_at = ? WHERE id = ?",
        );
        for (const eid of slatedEntryIds) toPlay.run(now, eid);
      }
    }
  })();

  const updated = db.prepare("SELECT * FROM matches WHERE id = ?").get(id);
  broadcast();
  return c.json({ match: updated });
});

router.patch("/:id/teams", async (c) => {
  const id = c.req.param("id");
  const match = db.prepare("SELECT * FROM matches WHERE id = ?").get(id);
  if (!match) return c.json({ error: "Match not found" }, 404);
  if (match.ended_at) return c.json({ error: "Match already ended" }, 404);

  const body = await c.req.json().catch(() => ({}));
  const currentIds = [match.team1_p1, match.team1_p2, match.team2_p1, match.team2_p2].filter(Boolean);
  const check = validateTeamSlots(body, currentIds);
  if (!check.ok) return c.json({ error: check.error }, 400);

  const v = check.value;
  db.prepare(`
    UPDATE matches
    SET team1_p1 = ?, team1_p2 = ?, team2_p1 = ?, team2_p2 = ?
    WHERE id = ?
  `).run(v.team1_p1, v.team1_p2, v.team2_p1, v.team2_p2, id);

  const updated = db.prepare("SELECT * FROM matches WHERE id = ?").get(id);
  broadcast();
  return c.json({ match: updated });
});

router.patch("/:id/shuttles", async (c) => {
  const id = c.req.param("id");
  const b = await c.req.json().catch(() => ({}));
  const m = db
    .prepare("SELECT * FROM matches WHERE id = ? AND state = 'active' AND ended_at IS NULL")
    .get(id);
  if (!m) return c.json({ error: "Active match not found" }, 404);
  db.prepare(
    "UPDATE matches SET new_shuttles = MAX(0, new_shuttles + ?), used_shuttles = MAX(0, used_shuttles + ?) WHERE id = ?",
  ).run(Number(b.delta_new ?? 0), Number(b.delta_used ?? 0), id);
  broadcast();
  return c.json({ match: db.prepare("SELECT * FROM matches WHERE id = ?").get(id) });
});

// v1.3: rebuild derived stats from the match log. Ended matches are the source
// of truth, so corrections and deletes call this instead of decrementing —
// games_played/total_seconds_played/last_played_at can never drift. Does NOT
// touch status/sort_order/virt_offset/checked_in_at.
export function recomputeEntries(entryIds) {
  const agg = db.prepare(`
    SELECT COUNT(*) AS games,
           COALESCE(SUM(m.ended_at - m.started_at), 0) AS seconds,
           MAX(m.ended_at) AS last
    FROM matches m
    WHERE m.state = 'active' AND m.ended_at IS NOT NULL
      AND ? IN (m.team1_p1, m.team1_p2, m.team2_p1, m.team2_p2)
  `);
  const update = db.prepare(
    "UPDATE queue_entries SET games_played = ?, total_seconds_played = ?, last_played_at = ? WHERE id = ?",
  );
  for (const eid of entryIds) {
    const { games, seconds, last } = agg.get(eid);
    update.run(games, seconds, last, eid);
  }
}

// Correct an ended match: scores, shuttles, rating, and the lineup itself.
// The recompute (not arithmetic) updates the affected entries' stats, so a
// player swap leaves both the removed and the added entry exact.
router.patch("/:id/correct", async (c) => {
  const id = c.req.param("id");
  const match = db
    .prepare("SELECT * FROM matches WHERE id = ? AND state = 'active' AND ended_at IS NOT NULL")
    .get(id);
  if (!match) return c.json({ error: "Ended match not found" }, 404);

  const b = await c.req.json().catch(() => ({}));
  const fields = ["team1_score", "team2_score", "new_shuttles", "used_shuttles", "rating", "players"];
  if (!fields.some((k) => b[k] !== undefined)) {
    return c.json({ error: "Nothing to correct" }, 400);
  }
  for (const [name, v] of [
    ["team1_score", b.team1_score],
    ["team2_score", b.team2_score],
  ]) {
    if (v !== undefined && (typeof v !== "number" || !Number.isInteger(v) || v < 0 || v > 99)) {
      return c.json({ error: `${name} must be an integer between 0 and 99` }, 400);
    }
  }
  if ((b.team1_score ?? match.team1_score) === (b.team2_score ?? match.team2_score)) {
    return c.json({ error: "Scores can't be tied" }, 400);
  }
  for (const name of ["new_shuttles", "used_shuttles"]) {
    const v = b[name];
    if (v !== undefined && (typeof v !== "number" || !Number.isInteger(v) || v < 0)) {
      return c.json({ error: `${name} must be a non-negative integer` }, 400);
    }
  }
  if (
    b.rating !== undefined &&
    (typeof b.rating !== "number" || !Number.isFinite(b.rating) || b.rating < 1 || b.rating > 5)
  ) {
    return c.json({ error: "rating must be between 1 and 5" }, 400);
  }

  let slots = null;
  if (b.players !== undefined) {
    if (!Array.isArray(b.players)) return c.json({ error: "players must be an array" }, 400);
    const expected = match.format === "doubles" ? 4 : 2;
    if (b.players.length !== expected) {
      return c.json({ error: `a ${match.format} match takes ${expected} players` }, 400);
    }
    if (new Set(b.players).size !== b.players.length) {
      return c.json({ error: "duplicate entry in players" }, 400);
    }
    const inSession = db.prepare("SELECT id FROM queue_entries WHERE id = ? AND session_id = ?");
    const inLive = db.prepare(`
      SELECT 1 FROM matches
      WHERE state = 'active' AND ended_at IS NULL
        AND ? IN (team1_p1, team1_p2, team2_p1, team2_p2) LIMIT 1
    `);
    for (const eid of b.players) {
      if (!inSession.get(eid, match.session_id)) {
        return c.json({ error: `entry ${eid} is not in this session` }, 400);
      }
      if (inLive.get(eid)) {
        return c.json({ error: `entry ${eid} is playing a match` }, 409);
      }
    }
    slots =
      match.format === "doubles"
        ? { team1_p1: b.players[0], team1_p2: b.players[1], team2_p1: b.players[2], team2_p2: b.players[3] }
        : { team1_p1: b.players[0], team1_p2: null, team2_p1: b.players[1], team2_p2: null };
  }

  const to = slots ?? {
    team1_p1: match.team1_p1,
    team1_p2: match.team1_p2,
    team2_p1: match.team2_p1,
    team2_p2: match.team2_p2,
  };

  db.transaction(() => {
    db.prepare(`
      UPDATE matches
      SET team1_score = COALESCE(?, team1_score),
          team2_score = COALESCE(?, team2_score),
          new_shuttles = COALESCE(?, new_shuttles),
          used_shuttles = COALESCE(?, used_shuttles),
          rating = COALESCE(?, rating),
          team1_p1 = ?, team1_p2 = ?, team2_p1 = ?, team2_p2 = ?
      WHERE id = ?
    `).run(
      b.team1_score ?? null,
      b.team2_score ?? null,
      b.new_shuttles ?? null,
      b.used_shuttles ?? null,
      b.rating ?? null,
      to.team1_p1,
      to.team1_p2,
      to.team2_p1,
      to.team2_p2,
      id,
    );
    const affected = new Set(
      [
        match.team1_p1,
        match.team1_p2,
        match.team2_p1,
        match.team2_p2,
        to.team1_p1,
        to.team1_p2,
        to.team2_p1,
        to.team2_p2,
      ].filter(Boolean),
    );
    recomputeEntries([...affected]);
  })();

  broadcast();
  return c.json({ match: db.prepare("SELECT * FROM matches WHERE id = ?").get(id) });
});

export default router;
