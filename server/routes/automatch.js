import { Hono } from "hono";
import db from "../db.js";
import { loadRatings } from "../logic/ratings.js";
import { planBatch, suggestPlayers } from "../logic/smartQueue.js";
import { broadcast } from "./sse.js";

/** Max lineups allowed on deck at once (existing + newly planned). */
export const SLATE_CAP = 3;

function freeCourtsOf(id, now) {
  return db
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
}

function waitingOf(id) {
  return db
    .prepare(`
  SELECT qe.*, p.skill_level
  FROM queue_entries qe
  JOIN players p ON p.id = qe.player_id
  WHERE qe.session_id = ? AND qe.status = 'waiting'
  ORDER BY qe.sort_order, qe.checked_in_at, qe.id
`)
    .all(id);
}

// Pure planner: same rules for dry-run and the real run (no writes).
// One ε-lexicographic batch over courts + slate slots (§5): quartets are
// picked jointly, not greedily court-by-court.
function computePlanFor(id, s, now, { slateOnly, locked = [], excluded = [], bans = [] }) {
  // v1.7: learned ratings (μ + tonight's form) replace static tiers in the matcher
  const ratings = loadRatings(db, Number(id));
  const skip = new Set(excluded);
  const waiting = waitingOf(id)
    .filter((e) => !skip.has(e.id))
    .map((e) => ({ ...e, rating: ratings.get(e.player_id)?.rating }));
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
  const courts = slateOnly ? [] : freeCourtsOf(id, now);
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
      bans,
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

/** Insert planned deck lineups and stage their players. Returns the new match
 *  ids. No transaction of its own — the caller wraps it (route, refill, rerun). */
function insertSlates(id, slate, now) {
  const slateIds = [];
  const setStaged = db.prepare(
    "UPDATE queue_entries SET status = 'staged', status_updated_at = ? WHERE id = ?",
  );
  for (const m of slate) {
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
  }
  return slateIds;
}

/** Top the deck back up to SLATE_CAP after a lineup left it through an
 *  auto-promotion. Call inside the promotion's transaction, before broadcast.
 *  Fewer than 4 waiting players (or a full deck) → nothing to add.
 *  ✕ Cancel and ▶ Start now deliberately do not call this: a lineup the queue
 *  master removed or sent out by hand must not be re-planned behind their back.
 *  ponytail: always on — add a per-session setting if a queue master who
 *  builds lineups by hand needs the old behaviour. */
export function refillDeck(sessionId, now = Math.floor(Date.now() / 1000)) {
  const s = db.prepare("SELECT * FROM sessions WHERE id = ?").get(sessionId);
  if (!s || s.ended_at != null) return [];
  const plan = computePlanFor(sessionId, s, now, { slateOnly: true });
  return insertSlates(sessionId, plan.slate, now);
}
class NoPlan extends Error {}

const router = new Hono();

router.post("/sessions/:id/automatch", async (c) => {
  const id = c.req.param("id");
  const s = db.prepare("SELECT * FROM sessions WHERE id = ?").get(id);
  if (!s) return c.json({ error: "Session not found" }, 404);
  if (s.started_at == null) return c.json({ error: "Session not started" }, 400);
  if (s.ended_at != null) return c.json({ error: "Session already ended" }, 409);

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
  // excluded: entry ids the plan must not pick (On Deck "repick" re-click — it sends the whole draft, so up to 4)
  let excluded = [];
  if (Array.isArray(body?.excluded)) {
    if (
      body.excluded.length > 4 ||
      body.excluded.some((x) => !Number.isInteger(x)) ||
      new Set(body.excluded).size !== body.excluded.length
    ) {
      return c.json({ error: "excluded must be unique queue-entry ids (0–4 of them)" }, 400);
    }
    if (!slateOnly) return c.json({ error: "excluded requires slate_only" }, 400);
    excluded = body.excluded;
  }

  // "↻ Rerun deck": release every deck lineup and re-plan the deck so that
  // none of the old pairings survives. One transaction — when nothing else can
  // be planned, the old lineups stay exactly as they were.
  if (body?.rerun_deck === true) {
    if (dryRun || givenPlan || locked.length || excluded.length) {
      return c.json({ error: "rerun_deck cannot be combined with dry_run, plan, locked or excluded" }, 400);
    }
    let out;
    try {
      db.transaction(() => {
        const old = db
          .prepare(
            "SELECT * FROM matches WHERE session_id = ? AND state = 'slated' AND ended_at IS NULL ORDER BY slate_seq, id",
          )
          .all(id);
        // status only — sort_order is the queue master's manual order and a
        // rerun is not a cancellation
        const release = db.prepare(
          "UPDATE queue_entries SET status = 'waiting', status_updated_at = ? WHERE id = ?",
        );
        for (const m of old) {
          for (const eid of [m.team1_p1, m.team1_p2, m.team2_p1, m.team2_p2].filter(Boolean)) {
            release.run(now, eid);
          }
        }
        db.prepare("DELETE FROM matches WHERE session_id = ? AND state = 'slated' AND ended_at IS NULL").run(
          id,
        );
        // the matcher treats these as hard no-partner pairs for this one plan
        const bans = old
          .flatMap((m) => [
            [m.team1_p1, m.team1_p2],
            [m.team2_p1, m.team2_p2],
          ])
          .filter(([a, b]) => a != null && b != null);
        const plan = computePlanFor(id, s, now, { slateOnly: true, bans });
        if (!plan.slate.length) throw new NoPlan();
        out = {
          replaced: old.length,
          slated_count: plan.slate.length,
          slate_ids: insertSlates(id, plan.slate, now),
        };
      })();
    } catch (err) {
      if (err instanceof NoPlan) return c.json({ error: "No other fair lineups right now — deck kept" }, 409);
      throw err;
    }
    broadcast();
    return c.json(out);
  }

  if (locked.length) {
    const waitingIds = new Set(waitingOf(id).map((e) => e.id));
    if (!locked.every((x) => waitingIds.has(x))) {
      return c.json({ error: "locked ids must all be currently waiting" }, 400);
    }
  }

  if (dryRun) return c.json({ plan: computePlanFor(id, s, now, { slateOnly, locked, excluded }) });
  // slating is fine on a frozen clock; starting a match isn't
  if (!slateOnly && s.paused_at != null) return c.json({ error: "Session is paused" }, 409);

  let plan = computePlanFor(id, s, now, { slateOnly, locked });
  if (locked.length && givenPlan) {
    // a client plan executes exactly as sent — locked has nothing to add
    return c.json({ error: "locked requires server-computed plan (no plan in body)" }, 400);
  }
  if (givenPlan) {
    // Re-validate the client's plan against live state; execute exactly it.
    const stale = () => c.json({ error: "Queue changed — review and try again" }, 409);
    const pMatches = Array.isArray(givenPlan.matches) ? givenPlan.matches : [];
    const pSlate = Array.isArray(givenPlan.slate) ? givenPlan.slate : [];
    const freeIds = new Set(freeCourtsOf(id, now).map((x) => x.id));
    const waitingIds = new Set(waitingOf(id).map((e) => e.id));
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
    const labels = new Map(freeCourtsOf(id, now).map((x) => [x.id, x.label ?? null]));
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
  const slateIds = [];
  const matchIds = []; // started matches — the client's Undo aborts exactly these
  db.transaction(() => {
    const setPlaying = db.prepare(
      "UPDATE queue_entries SET status = 'playing', status_updated_at = ? WHERE id = ?",
    );
    for (const m of plan.matches) {
      const [t1p1, t1p2] = m.team1;
      const [t2p1, t2p2] = m.team2;
      const { lastInsertRowid } = db
        .prepare(`
        INSERT INTO matches (session_id, court_number, format, state, team1_p1, team1_p2, team2_p1, team2_p2, started_at, new_shuttles)
        VALUES (?, ?, ?, 'active', ?, ?, ?, ?, ?, 1)
      `)
        .run(id, m.court_id, m.format, t1p1, t1p2 ?? null, t2p1, t2p2 ?? null, now);
      matchIds.push(lastInsertRowid);
      for (const eid of [...m.team1, ...m.team2]) setPlaying.run(now, eid);
      started++;
    }
    slateIds.push(...insertSlates(id, plan.slate, now));
  })();
  const slated = slateIds.length;
  if (!started && !slated) {
    return c.json(
      { error: "Nothing to auto-match — need a free court and ≥2 waiting players (or ≥4 to slate)." },
      409,
    );
  }

  broadcast();
  return c.json({
    started,
    slated: slated > 0,
    slated_count: slated,
    slate_ids: slateIds,
    match_ids: matchIds,
  });
});

export default router;
