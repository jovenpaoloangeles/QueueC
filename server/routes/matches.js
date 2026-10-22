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
// deleted. Only a not-yet-ended active match aborts.
router.delete("/:id", (c) => {
  const id = c.req.param("id");
  const match = db
    .prepare("SELECT * FROM matches WHERE id = ? AND state = 'active' AND ended_at IS NULL")
    .get(id);
  if (!match) return c.json({ error: "Match not found" }, 404);
  const now = Math.floor(Date.now() / 1000);
  db.transaction(() => {
    const setWaiting = db.prepare(
      "UPDATE queue_entries SET status = 'waiting', status_updated_at = ? WHERE id = ?",
    );
    for (const eid of [match.team1_p1, match.team1_p2, match.team2_p1, match.team2_p2].filter(Boolean)) {
      setWaiting.run(now, eid);
    }
    db.prepare("DELETE FROM matches WHERE id = ?").run(id);
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
    if (v !== undefined && v !== null && (typeof v !== "number" || !Number.isInteger(v) || v < 0 || v > 99)) {
      return c.json({ error: `${name} must be an integer between 0 and 99` }, 400);
    }
  }
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

export default router;
