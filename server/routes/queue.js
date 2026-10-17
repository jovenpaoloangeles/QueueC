import { Hono } from "hono";
import db from "../db.js";
import { suggestPlayers } from "../logic/smartQueue.js";
import { broadcast } from "./sse.js";

const router = new Hono();

/** Next sort_order for a new entry in a session that already has `existingOrders`. */
export function assignSortOrder(existingOrders) {
  return existingOrders.length ? Math.max(...existingOrders) + 1 : 1;
}

const baseCmp = (a, b) => a.localeCompare(b, undefined, { sensitivity: "base" });

/** sort_order at which an entry named `name` slots alphabetically among `waiting`
 *  ([{ sort_order, name }]) — null when it goes after all of them. Scans in
 *  DISPLAY order: the new entry goes before the first waiting entry that sorts
 *  after it by name. (Re-sorting by name first would be wrong once a manual
 *  reorder has moved entries off alphabetical positions.) */
export function alphabeticalSortOrder(waiting, name) {
  const inOrder = [...waiting].sort((a, b) => a.sort_order - b.sort_order);
  const after = inOrder.find((e) => baseCmp(e.name, name) > 0);
  return after ? after.sort_order : null;
}

/** Keep only ids in `allowed`, in the given order, de-duplicated. */
export function normalizeOrder(order, allowed) {
  const ok = new Set(allowed);
  const seen = new Set();
  const out = [];
  for (const id of order ?? []) {
    if (ok.has(id) && !seen.has(id)) {
      seen.add(id);
      out.push(id);
    }
  }
  return out;
}

router.post("/sessions/:id/checkin", async (c) => {
  const id = c.req.param("id");
  const { player_id } = await c.req.json().catch(() => ({}));
  const now = Math.floor(Date.now() / 1000);
  const existing = db
    .prepare("SELECT id FROM queue_entries WHERE session_id = ? AND player_id = ?")
    .get(id, player_id);
  if (existing) return c.json({ error: "Player already checked in" }, 409);

  const existingOrders = db
    .prepare("SELECT sort_order FROM queue_entries WHERE session_id = ?")
    .all(id)
    .map((r) => r.sort_order);

  // New check-ins slot into alphabetical position among the current WAITING
  // entries (case-insensitive); everything at or after that spot shifts down one.
  const name = db.prepare("SELECT name FROM players WHERE id = ?").get(player_id)?.name;
  const insertAt = alphabeticalSortOrder(
    db
      .prepare(
        "SELECT qe.sort_order, p.name FROM queue_entries qe JOIN players p ON p.id = qe.player_id WHERE qe.session_id = ? AND qe.status = 'waiting'",
      )
      .all(id),
    name ?? "",
  );
  let sortOrder;
  if (insertAt == null) {
    sortOrder = assignSortOrder(existingOrders);
  } else {
    sortOrder = insertAt;
    db.prepare(
      "UPDATE queue_entries SET sort_order = sort_order + 1 WHERE session_id = ? AND sort_order >= ?",
    ).run(id, insertAt);
  }

  // Late arrivals inherit the median virtual game count of active players
  // (§2): g_virt = games_played + virt_offset, so they don't queue from zero
  // behind players who've been playing all session.
  const gVirts = db
    .prepare(
      "SELECT games_played + virt_offset AS gv FROM queue_entries WHERE session_id = ? AND status IN ('waiting','playing','resting')",
    )
    .all(id)
    .map((r) => r.gv)
    .sort((a, b) => a - b);
  const virtOffset = gVirts.length
    ? (gVirts[Math.floor((gVirts.length - 1) / 2)] + gVirts[Math.ceil((gVirts.length - 1) / 2)]) / 2
    : 0;

  const { lastInsertRowid } = db
    .prepare(
      "INSERT INTO queue_entries (session_id, player_id, checked_in_at, sort_order, virt_offset, status_updated_at) VALUES (?, ?, ?, ?, ?, ?)",
    )
    .run(id, player_id, now, sortOrder, virtOffset, now);

  const entry = db.prepare("SELECT * FROM queue_entries WHERE id = ?").get(lastInsertRowid);
  broadcast();
  return c.json({ entry }, 201);
});

router.delete("/queue/:entryId", (c) => {
  const entryId = c.req.param("entryId");
  const entry = db.prepare("SELECT * FROM queue_entries WHERE id = ?").get(entryId);
  if (!entry) return c.json({ error: "Entry not found" }, 404);
  // a playing entry's match (or a staged slate row) would be orphaned —
  // removal is for check-in undo only. 'staged' matters for the arm-then-confirm
  // race: the card can leave the grid via SSE between arm and Confirm.
  if (entry.status === "playing" || entry.status === "staged") {
    return c.json({ error: "Cannot remove a playing entry" }, 409);
  }
  db.prepare("DELETE FROM queue_entries WHERE id = ?").run(entryId);
  broadcast();
  return c.json({ ok: true });
});

router.patch("/queue/:entryId/status", async (c) => {
  const entryId = c.req.param("entryId");
  const { status } = await c.req.json().catch(() => ({}));
  const cur = db.prepare("SELECT * FROM queue_entries WHERE id = ?").get(entryId);
  if (!cur) return c.json({ error: "Entry not found" }, 404);
  if (status === "resting" && cur.status === "playing") {
    return c.json({ error: "Cannot rest a player who is on court" }, 409);
  }
  if (status === "resting" && cur.status === "staged") {
    return c.json({ error: "Cannot rest a player drafted into a slated match" }, 409);
  }
  if (cur.status === "playing" && status === "waiting") {
    return c.json({ error: "Player must finish the match first" }, 409);
  }
  const now = Math.floor(Date.now() / 1000);
  // Rest does not pause wait accrual (reversed in R7): wait keeps running,
  // played time alone is subtracted on match end.
  db.prepare("UPDATE queue_entries SET status = ?, status_updated_at = ? WHERE id = ?").run(
    status,
    now,
    entryId,
  );
  const entry = db.prepare("SELECT * FROM queue_entries WHERE id = ?").get(entryId);
  broadcast();
  return c.json({ entry });
});

router.patch("/queue/order", async (c) => {
  const { session_id, order } = await c.req.json().catch(() => ({}));
  const allowed = db
    .prepare("SELECT id FROM queue_entries WHERE session_id = ?")
    .all(session_id)
    .map((r) => r.id);

  const normalized = normalizeOrder(order, allowed);
  const write = db.prepare("UPDATE queue_entries SET sort_order = ? WHERE id = ?");
  const tx = db.transaction((ids) =>
    ids.forEach((id, i) => {
      write.run(i + 1, id);
    }),
  );
  tx(normalized);

  broadcast();
  return c.json({ ok: true });
});

router.get("/sessions/:id/suggest", (c) => {
  const id = c.req.param("id");
  const mode = c.req.query("mode");
  if (mode !== "singles" && mode !== "doubles") {
    return c.json({ error: "mode must be singles or doubles" }, 400);
  }
  const entries = db
    .prepare(
      "SELECT qe.*, p.skill_level FROM queue_entries qe JOIN players p ON p.id = qe.player_id WHERE qe.session_id = ? AND qe.status = 'waiting'",
    )
    .all(id);
  // Completed matches, oldest→newest — the matcher's P/O + consecutive input.
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
  const suggestion = suggestPlayers(entries, mode, { history });
  return c.json({ suggestion });
});

export default router;
