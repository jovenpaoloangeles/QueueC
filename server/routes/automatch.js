import { Hono } from "hono";
import db from "../db.js";
import { suggestPlayers } from "../logic/smartQueue.js";
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
  function computePlan() {
    const matches = [];
    const taken = new Set();
    const pool = () => getWaiting().filter((e) => !taken.has(e.id));
    for (const court of slateOnly ? [] : freeCourts()) {
      const p = pool();
      const mode = p.length >= 4 ? "doubles" : p.length >= 2 ? "singles" : null;
      if (!mode) break;
      const slots = suggestPlayers(p, mode);
      const ids = slots.filter(Boolean);
      if (ids.length < 2) break;
      const [t1p1, t1p2, t2p1, t2p2] = slots;
      matches.push({
        court_id: court.id,
        court_label: court.label ?? null,
        format: mode,
        team1: [t1p1, t1p2].filter(Boolean),
        team2: [t2p1, t2p2].filter(Boolean),
      });
      for (const eid of ids) taken.add(eid);
    }
    const slate = [];
    const existing = db
      .prepare(
        "SELECT COUNT(*) AS n FROM matches WHERE session_id = ? AND state = 'slated' AND ended_at IS NULL",
      )
      .get(id).n;
    while (existing + slate.length < SLATE_CAP) {
      const remaining = pool();
      if (remaining.length < 4) break;
      const slots = suggestPlayers(remaining, "doubles");
      if (slots.filter(Boolean).length !== 4) break;
      slate.push({ format: "doubles", team1: [slots[0], slots[1]], team2: [slots[2], slots[3]] });
      for (const eid of slots) taken.add(eid);
    }
    return { matches, slate };
  }

  if (dryRun) return c.json({ plan: computePlan() });

  let plan = computePlan();
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
      db.prepare(`
        INSERT INTO matches (session_id, court_number, format, state, slate_seq, team1_p1, team1_p2, team2_p1, team2_p2, started_at)
        VALUES (?, NULL, 'doubles', 'slated', ?, ?, ?, ?, ?, 0)
      `).run(id, seq, t1p1, t1p2, t2p1, t2p2);
      for (const eid of [...m.team1, ...m.team2]) setStaged.run(now, eid);
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
  return c.json({ started, slated: slated > 0, slated_count: slated });
});

export default router;
