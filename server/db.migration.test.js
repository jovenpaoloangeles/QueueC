import assert from "node:assert/strict";
import { Database } from "bun:sqlite";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// Regression: the started_at table rebuild used to run AFTER the v1.2
// conditional ALTERs, so on any DB it fired on (pre-release, started_at NOT
// NULL) it silently dropped max_consecutive/rest_games and POST /api/sessions
// 500'd forever. The rebuild now runs first — this boots db.js against a
// pre-release fixture DB and asserts every live sessions column survives.

const dir = mkdtempSync(join(tmpdir(), "qc-mig-"));
const fixturePath = join(dir, "fixture.db");
const fixture = new Database(fixturePath);
// Pre-release schema, verbatim from `git show 2545790:server/db.js`
fixture.exec(`
  CREATE TABLE players (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    skill_level TEXT NOT NULL CHECK(skill_level IN ('newbie','beginner','intermediate','upper_intermediate','advanced')),
    created_at INTEGER NOT NULL
  );
  CREATE TABLE sessions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    scheduled_start INTEGER NOT NULL,
    scheduled_end INTEGER NOT NULL,
    court_count INTEGER NOT NULL DEFAULT 2,
    started_at INTEGER NOT NULL,
    ended_at INTEGER
  );
  CREATE TABLE queue_entries (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id INTEGER NOT NULL REFERENCES sessions(id),
    player_id INTEGER NOT NULL REFERENCES players(id),
    checked_in_at INTEGER NOT NULL,
    status TEXT NOT NULL DEFAULT 'waiting' CHECK(status IN ('waiting','playing','resting','left')),
    last_played_at INTEGER,
    total_seconds_played INTEGER NOT NULL DEFAULT 0
  );
  CREATE TABLE matches (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id INTEGER NOT NULL REFERENCES sessions(id),
    court_number INTEGER NOT NULL,
    format TEXT NOT NULL CHECK(format IN ('singles','doubles')),
    team1_p1 INTEGER NOT NULL REFERENCES queue_entries(id),
    team1_p2 INTEGER REFERENCES queue_entries(id),
    team2_p1 INTEGER NOT NULL REFERENCES queue_entries(id),
    team2_p2 INTEGER REFERENCES queue_entries(id),
    team1_score INTEGER,
    team2_score INTEGER,
    started_at INTEGER NOT NULL,
    ended_at INTEGER
  );
`);
const now = Math.floor(Date.now() / 1000);
fixture
  .prepare("INSERT INTO players (name, skill_level, created_at) VALUES (?, 'newbie', ?)")
  .run("__mig_p1__", now);
fixture
  .prepare("INSERT INTO sessions (name, scheduled_start, scheduled_end, started_at) VALUES (?, ?, ?, ?)")
  .run("migration-parity", now, now + 3600, now);
fixture.close();

// db.js reads env at import time — set both paths before the dynamic import.
// (schema.test.js can't host this: its static db.js import already evaluated
// the module, so a dynamic import there would reuse the runner-provided DB.)
process.env.DB_PATH = fixturePath;
process.env.PLAYERS_PATH = join(import.meta.dir, "../tests/fixtures/players.json");
const db = (await import("./db.js")).default;

// Every column the live schema ships must survive the migration chain
const expected = [
  "id",
  "name",
  "scheduled_start",
  "scheduled_end",
  "court_count",
  "checkin_order",
  "max_consecutive",
  "rest_games",
  "started_at",
  "ended_at",
  "shuttles_extra",
  "paused_at",
  "court_fee",
  "shuttle_price",
  "fee_split",
];
const got = db.prepare("PRAGMA table_info(sessions)").all().map((c) => c.name);
const missing = expected.filter((c) => !got.includes(c));
assert.deepEqual(missing, [], `sessions missing columns after migration: ${missing.join(", ")}`);
const extra = got.filter((c) => !expected.includes(c));
assert.deepEqual(extra, [], `sessions has unexpected columns: ${extra.join(", ")}`);

// and the fixture row must have been carried through the rebuild
assert.equal(
  db.prepare("SELECT name FROM sessions WHERE name = 'migration-parity'").get()?.name,
  "migration-parity",
);

console.log("db.migration.test.js: sessions migration parity passed");
