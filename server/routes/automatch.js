import { Hono } from "hono";
import db from "../db.js";
import { planBatch, suggestPlayers } from "../logic/smartQueue.js";
import { broadcast } from "./sse.js";

/** Max lineups allowed on deck at once (existing + newly planned). */
export const SLATE_CAP = 3;

const router = new Hono();

router.post("/sessions/:id/automatch", async (c) => {
  const id = c.req.param("id");
  const s = db.prepare("SELECT * FROM sessions WHERE id = ?").get(id);
  if (!s) return c.json({ error: "Session not found" }, 404);
  if (s.started_at == null) return c.json({ error: "Session not started" }, 400);

  const now = Math.floor(Date.now() / 1000);
  const body = await c.req.json().catch(() => ({}));
  const dryRun = body?.dry_run === true;
  const slateOnly = body?.slate_only === true;
  const givenPlan = body?.plan && typeof body.plan === "object" ? body.plan : null;
  // locked: queue-entry ids to pin into exactly one planned quartet (slate-only)
  let locked = [];
  if (Array.isArray(body?.locked)) {
    if (
      body.locked.length > 3 ||
      body.locked.some((x) => !Number.isInteger(x)) ||
      new Set(body.locked).size !== body.locked.length
    ) {
      return c.json({ error: "locked must be unique queue-entry ids (0–3 of them)" }, 400);
    }
    if (!slateOnly) return c.json({ error: "locked requires slate_only" }, 400);
    locked = body.locked;
  }

  const freeCourts = () =>
    db
      .prepare(`
    SELECT * FROM courts
    WHERE session_id = ? AND enabled = 1
      AND (active_from IS NULL OR active_from <= ?)
      AND (expires_at IS NULL OR expires_at > ?)
      AND (active_until IS NULL OR active_until > ?)
      AND id NOT IN (
        SELECT court_number FROM matches
        WHERE session_id = ? AND state = 'active' AND ended_at IS NULL AND court_number IS NOT NULL
      )
    ORDER BY id
  `)
      .all(id, now, now, now, id);

  const getWaiting = () =>
    db
      .prepare(`
    SELECT qe.*, p.skill_level
    FROM queue_entries qe
    JOIN players p ON p.id = qe.player_id
    WHERE qe.session_id = ? AND qe.status = 'waiting'
    ORDER BY qe.sort_order, qe.checked_in_at, qe.id
  `)
      .all(id);

  // Pure planner: same rules for dry-run and the real run (no writes).
  // One ε-lexicographic batch over courts + slate slots (§5): quartets are
  // picked jointly, not greedily court-by-court.
  function computePlan(locked = []) {
    const waiting = getWaiting();
    const history = db
      .prepare(
        "SELECT team1_p1, team1_p2, team2_p1, team2_p2, started_at, ended_at FROM matches WHERE session_id = ? AND ended_at IS NOT NULL ORDER BY started_at, id",
      )
      .all(id)
      .map((m) => ({
        team1: [m.team1_p1, m.team1_p2].filter((x) => x != null),
        team2: [m.team2_p1, m.team2_p2].filter((x) => x != null),
        started_at: m.started_at,
        ended_at: m.ended_at,
      }));
    const courts = slateOnly ? [] : freeCourts();
    const existing = db
      .prepare(
        "SELECT COUNT(*) AS n FROM matches WHERE session_id = ? AND state = 'slated' AND ended_at IS NULL",
      )
      .get(id).n;
    const courtCount = courts.length + Math.max(0, SLATE_CAP - existing);

    const matches = [];
    const slate = [];
    let relaxed = false;
    if (waiting.length >= 4 && courtCount > 0) {
      // every session entry's tier (history includes players now on court)
      const skillOf = new Map(
        db
          .prepare(
            "SELECT qe.id, p.skill_level FROM queue_entries qe JOIN players p ON p.id = qe.player_id WHERE qe.session_id = ?",
          )
          .all(id)
          .map((r) => [r.id, r.skill_level]),
      );
      const plan = planBatch({
        waiting,
        history,
        skillOf,
        courtCount,
        now,
        cfg: { maxConsecutive: s.max_consecutive, restGames: s.rest_games },
        locked,
      });
      relaxed = plan.relaxed;
      plan.matches.forEach((m, i) => {
        if (i < courts.length) {
          matches.push({
            court_id: courts[i].id,
            court_label: courts[i].label ?? null,
            format: "doubles",
            team1: m.team1,
            team2: m.team2,
          });
        } else {
          slate.push({ format: "doubles", team1: m.team1, team2: m.team2 });
        }
      });
    } else if (waiting.length >= 2 && courts.length > 0) {
      // 2–3 waiting: singles fallback, best-π pair.
      const slots = suggestPlayers(waiting, "singles", { history, now });
      matches.push({
        court_id: courts[0].id,
        court_label: courts[0].label ?? null,
        format: "singles",
        team1: [slots[0]],
        team2: [slots[2]],
      });
    }
    return { matches, slate, relaxed_consecutive_rule: relaxed };
  }

  if (locked.length) {
    const waitingIds = new Set(getWaiting().map((e) => e.id));
    if (!locked.every((x) => waitingIds.has(x))) {
      return c.json({ error: "locked ids must all be currently waiting" }, 400);
    }
  }

  if (dryRun) return c.json({ plan: computePlan(locked) });
  // slating is fine on a frozen clock; starting a match isn't
  if (!slateOnly && s.paused_at != null) return c.json({ error: "Session is paused" }, 409);

  let plan = computePlan(locked);
  if (locked.length && givenPlan) {
    // a client plan executes exactly as sent — locked has nothing to add
    return c.json({ error: "locked requires server-computed plan (no plan in body)" }, 400);
  }
  if (givenPlan) {
    // Re-validate the client's plan against live state; execute exactly it.
    const stale = () => c.json({ error: "Queue changed — review and try again" }, 409);
    const pMatches = Array.isArray(givenPlan.matches) ? givenPlan.matches : [];
    const pSlate = Array.isArray(givenPlan.slate) ? givenPlan.slate : [];
    const freeIds = new Set(freeCourts().map((x) => x.id));
    const waitingIds = new Set(getWaiting().map((e) => e.id));
    const seen = new Set();
    const okEntries = (ids) => {
      for (const e of ids) {
        if (!waitingIds.has(e) || seen.has(e)) return false;
        seen.add(e);
      }
      return true;
    };
    const shape = (m) =>
      m &&
      Array.isArray(m.team1) &&
      Array.isArray(m.team2) &&
      m.team1.length >= 1 &&
      m.team1.length === m.team2.length &&
      m.team1.length <= 2;
    const courtsSeen = new Set();
    for (const m of pMatches) {
      if (!shape(m) || !freeIds.has(m.court_id) || courtsSeen.has(m.court_id)) return stale();
      courtsSeen.add(m.court_id);
      if (!okEntries([...m.team1, ...m.team2])) return stale();
    }
    for (const m of pSlate) {
      if (!shape(m) || m.team1.length !== 2) return stale();
      if (!okEntries([...m.team1, ...m.team2])) return stale();
    }
    if (pSlate.length) {
      const have = db
        .prepare(
          "SELECT COUNT(*) AS n FROM matches WHERE session_id = ? AND state = 'slated' AND ended_at IS NULL",
        )
        .get(id).n;
      if (have + pSlate.length > SLATE_CAP) return stale();
    }
    const labels = new Map(freeCourts().map((x) => [x.id, x.label ?? null]));
    plan = {
      // slate_only is a hard rule: a client-supplied plan never starts a court
      // match, whatever matches array it sends
      matches: slateOnly
        ? []
        : pMatches.map((m) => ({
            court_id: m.court_id,
            court_label: labels.get(m.court_id),
            format: m.team1.length === 2 ? "doubles" : "singles",
            team1: m.team1,
            team2: m.team2,
          })),
      slate: pSlate.map((m) => ({ format: "doubles", team1: m.team1, team2: m.team2 })),
    };
  }

  let started = 0;
  let slated = 0;
  const slateIds = [];
  db.transaction(() => {
    const setPlaying = db.prepare(
      "UPDATE queue_entries SET status = 'playing', status_updated_at = ? WHERE id = ?",
    );
    for (const m of plan.matches) {
      const [t1p1, t1p2] = m.team1;
      const [t2p1, t2p2] = m.team2;
      db.prepare(`
        INSERT INTO matches (session_id, court_number, format, state, team1_p1, team1_p2, team2_p1, team2_p2, started_at, new_shuttles)
        VALUES (?, ?, ?, 'active', ?, ?, ?, ?, ?, 1)
      `).run(id, m.court_id, m.format, t1p1, t1p2 ?? null, t2p1, t2p2 ?? null, now);
      for (const eid of [...m.team1, ...m.team2]) setPlaying.run(now, eid);
      started++;
    }
    const setStaged = db.prepare(
      "UPDATE queue_entries SET status = 'staged', status_updated_at = ? WHERE id = ?",
    );
    for (const m of plan.slate) {
      const seq = db
        .prepare(
          "SELECT COALESCE(MAX(slate_seq),0)+1 AS n FROM matches WHERE session_id = ? AND state = 'slated'",
        )
        .get(id).n;
      const [t1p1, t1p2] = m.team1;
      const [t2p1, t2p2] = m.team2;
      const { lastInsertRowid } = db
        .prepare(`
        INSERT INTO matches (session_id, court_number, format, state, slate_seq, team1_p1, team1_p2, team2_p1, team2_p2, started_at)
        VALUES (?, NULL, 'doubles', 'slated', ?, ?, ?, ?, ?, 0)
      `)
        .run(id, seq, t1p1, t1p2, t2p1, t2p2);
      for (const eid of [...m.team1, ...m.team2]) setStaged.run(now, eid);
      slateIds.push(lastInsertRowid);
      slated++;
    }
  })();

  if (!started && !slated) {
    return c.json(
      { error: "Nothing to auto-match — need a free court and ≥2 waiting players (or ≥4 to slate)." },
      409,
    );
  }

  broadcast();
  return c.json({ started, slated: slated > 0, slated_count: slated, slate_ids: slateIds });
});

export default router;
