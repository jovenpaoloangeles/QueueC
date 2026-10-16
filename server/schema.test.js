import assert from "node:assert/strict";
import db from "./db.js";

const mc = new Set(
  db
    .prepare("PRAGMA table_info(matches)")
    .all()
    .map((c) => c.name),
);
for (const col of ["state", "slate_seq", "new_shuttles", "used_shuttles", "rating"]) {
  assert.ok(mc.has(col), `matches missing ${col}`);
}

const now = Math.floor(Date.now() / 1000);
const { lastInsertRowid: sid } = db
  .prepare("INSERT INTO sessions (name, scheduled_start, scheduled_end) VALUES (?, ?, ?)")
  .run("schema-test", now, now + 3600);

const { lastInsertRowid: pid1 } = db
  .prepare("INSERT INTO players (name, skill_level, created_at) VALUES (?, 'newbie', ?)")
  .run(`__schema_p1_${now}__`, now);
const { lastInsertRowid: pid2 } = db
  .prepare("INSERT INTO players (name, skill_level, created_at) VALUES (?, 'newbie', ?)")
  .run(`__schema_p2_${now}__`, now);

const { lastInsertRowid: eid1 } = db
  .prepare("INSERT INTO queue_entries (session_id, player_id, checked_in_at, status) VALUES (?, ?, ?, ?)")
  .run(sid, pid1, now, "staged");
const { lastInsertRowid: eid2 } = db
  .prepare("INSERT INTO queue_entries (session_id, player_id, checked_in_at, status) VALUES (?, ?, ?, ?)")
  .run(sid, pid2, now, "staged");

const { lastInsertRowid: mid } = db
  .prepare(
    `INSERT INTO matches (session_id, court_number, format, team1_p1, team2_p1, started_at, state)
   VALUES (?, NULL, 'singles', ?, ?, ?, 'slated')`,
  )
  .run(sid, eid1, eid2, now);

assert.equal(db.prepare("SELECT state FROM matches WHERE id = ?").get(mid).state, "slated");
assert.equal(db.prepare("SELECT new_shuttles FROM matches WHERE id = ?").get(mid).new_shuttles, 0);
assert.equal(db.prepare("SELECT used_shuttles FROM matches WHERE id = ?").get(mid).used_shuttles, 0);

// Clean up test rows
db.prepare("DELETE FROM matches WHERE id = ?").run(mid);
db.prepare("DELETE FROM queue_entries WHERE session_id = ?").run(sid);
db.prepare("DELETE FROM sessions WHERE id = ?").run(sid);
db.prepare("DELETE FROM players WHERE name LIKE '__schema_p%'").run();

console.log("schema.test.js: migration assertions passed");
