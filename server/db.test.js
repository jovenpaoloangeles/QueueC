import assert from "node:assert/strict";
import db, { seedPlayersFromFile } from "./db.js";

// Verify all tables exist
const tables = db
  .prepare("SELECT name FROM sqlite_master WHERE type='table'")
  .all()
  .map((r) => r.name);

console.assert(tables.includes("players"), "players table missing");
console.assert(tables.includes("sessions"), "sessions table missing");
console.assert(tables.includes("queue_entries"), "queue_entries table missing");
console.assert(tables.includes("matches"), "matches table missing");

// Verify FK constraint fires
try {
  db.prepare("INSERT INTO queue_entries (session_id, player_id, checked_in_at) VALUES (999, 999, 1)").run();
  console.assert(false, "FK constraint should have thrown");
} catch (e) {
  console.assert(e.message.includes("FOREIGN KEY"), `Expected FK error, got: ${e.message}`);
}

// Test seedPlayersFromFile
const before = db.prepare("SELECT COUNT(*) as c FROM players").get().c;
seedPlayersFromFile([
  { name: "__test_seed_alice__", skill_level: "beginner" },
  { name: "__test_seed_alice__", skill_level: "beginner" }, // duplicate — should skip
]);
const after = db.prepare("SELECT COUNT(*) as c FROM players").get().c;
assert.equal(after - before, 1, "should insert exactly 1 (duplicate skipped)");

// cleanup
db.prepare("DELETE FROM players WHERE name LIKE '__test_seed_%'").run();
console.log("db.test.js: seedPlayersFromFile assertions passed");
