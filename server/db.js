import { Database } from "bun:sqlite";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const dbPath = process.env.DB_PATH ?? join(__dirname, "../queuec.db");
const db = new Database(dbPath);

db.exec("PRAGMA journal_mode = WAL");
db.exec("PRAGMA foreign_keys = ON");

export const SKILL_LEVELS = [
  "newbie",
  "beginner",
  "lower_intermediate",
  "intermediate",
  "upper_intermediate",
  "expert",
  "professional",
  "advanced", // legacy alias accepted & normalized to expert
];

export function normalizeSkill(skill) {
  if (skill === "advanced") return "expert";
  return skill;
}

// Preset rows are hand-edited JSON: a missing/typo'd/non-string skill_level
// would violate the players CHECK/NOT NULL (or fail binding) mid-reset. Skip
// the row like a bad name instead of defaulting — a default still can't rescue
// a typo'd value outside SKILL_LEVELS, and skipping keeps an existing pool
// player (and their level) intact.
function isValidSkill(skill) {
  return typeof skill === "string" && SKILL_LEVELS.includes(normalizeSkill(skill));
}

db.exec(`
  CREATE TABLE IF NOT EXISTS players (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    skill_level TEXT NOT NULL CHECK(skill_level IN ('newbie','beginner','lower_intermediate','intermediate','upper_intermediate','expert','professional','advanced')),
    created_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS sessions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    scheduled_start INTEGER NOT NULL,
    scheduled_end INTEGER NOT NULL,
    court_count INTEGER NOT NULL DEFAULT 2,
    checkin_order TEXT NOT NULL DEFAULT 'alphabetical',
    max_consecutive INTEGER NOT NULL DEFAULT 2,
    rest_games INTEGER NOT NULL DEFAULT 0,
    started_at INTEGER,
    ended_at INTEGER
  );

  CREATE TABLE IF NOT EXISTS queue_entries (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id INTEGER NOT NULL REFERENCES sessions(id),
    player_id INTEGER NOT NULL REFERENCES players(id),
    checked_in_at INTEGER NOT NULL,
    status TEXT NOT NULL DEFAULT 'waiting' CHECK(status IN ('waiting','playing','resting','left','staged')),
    last_played_at INTEGER,
    total_seconds_played INTEGER NOT NULL DEFAULT 0,
    sort_order INTEGER NOT NULL DEFAULT 0,
    games_played INTEGER NOT NULL DEFAULT 0,
    status_updated_at INTEGER,
    -- vestigial since R7: rest no longer pauses wait accrual; columns unused
    rested_seconds INTEGER NOT NULL DEFAULT 0,
    rest_started_at INTEGER
  );

  CREATE TABLE IF NOT EXISTS matches (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id INTEGER NOT NULL REFERENCES sessions(id),
    court_number INTEGER,
    format TEXT NOT NULL CHECK(format IN ('singles','doubles')),
    team1_p1 INTEGER NOT NULL REFERENCES queue_entries(id),
    team1_p2 INTEGER REFERENCES queue_entries(id),
    team2_p1 INTEGER NOT NULL REFERENCES queue_entries(id),
    team2_p2 INTEGER REFERENCES queue_entries(id),
    team1_score INTEGER,
    team2_score INTEGER,
    started_at INTEGER NOT NULL,
    ended_at INTEGER,
    state TEXT NOT NULL DEFAULT 'active',
    slate_seq INTEGER,
    new_shuttles INTEGER NOT NULL DEFAULT 0,
    used_shuttles INTEGER NOT NULL DEFAULT 0,
    rating INTEGER
  );

  CREATE TABLE IF NOT EXISTS courts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id INTEGER NOT NULL REFERENCES sessions(id),
    label TEXT NOT NULL,
    active_from INTEGER,
    active_until INTEGER,
    opens_after INTEGER,
    duration_minutes INTEGER,
    expires_at INTEGER,
    enabled INTEGER NOT NULL DEFAULT 1
  );
`);

// Upgrade players CHECK constraint if DB was created with the old 5-tier constraint
const playersSql =
  db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='players'").get()?.sql ?? "";
if (!playersSql.includes("lower_intermediate")) {
  db.exec("PRAGMA foreign_keys = OFF");
  db.transaction(() =>
    db.exec(`
    CREATE TABLE players_new (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      skill_level TEXT NOT NULL CHECK(skill_level IN ('newbie','beginner','lower_intermediate','intermediate','upper_intermediate','expert','professional','advanced')),
      created_at INTEGER NOT NULL
    );
    INSERT INTO players_new (id, name, skill_level, created_at)
      SELECT id, name, CASE WHEN skill_level = 'advanced' THEN 'expert' ELSE skill_level END, created_at FROM players;
    DROP TABLE players;
    ALTER TABLE players_new RENAME TO players;
  `),
  )();
  db.exec("PRAGMA foreign_keys = ON");
} else {
  // Normalize any stray 'advanced' rows to 'expert'
  db.exec("UPDATE players SET skill_level = 'expert' WHERE skill_level = 'advanced'");
}

// v1.2: per-session rotation settings (max_consecutive, rest_games)
const sessionRotationCols = new Set(
  db
    .prepare("PRAGMA table_info(sessions)")
    .all()
    .map((c) => c.name),
);
if (!sessionRotationCols.has("max_consecutive")) {
  db.exec("ALTER TABLE sessions ADD COLUMN max_consecutive INTEGER NOT NULL DEFAULT 2");
}
if (!sessionRotationCols.has("rest_games")) {
  db.exec("ALTER TABLE sessions ADD COLUMN rest_games INTEGER NOT NULL DEFAULT 0");
}

// ponytail: one-shot column additions for queue_entries
const qeCols = new Set(
  db
    .prepare("PRAGMA table_info(queue_entries)")
    .all()
    .map((c) => c.name),
);
if (!qeCols.has("sort_order")) {
  db.exec("ALTER TABLE queue_entries ADD COLUMN sort_order INTEGER NOT NULL DEFAULT 0");
}
if (!qeCols.has("games_played")) {
  db.exec("ALTER TABLE queue_entries ADD COLUMN games_played INTEGER NOT NULL DEFAULT 0");
}
if (!qeCols.has("status_updated_at")) {
  db.exec("ALTER TABLE queue_entries ADD COLUMN status_updated_at INTEGER");
  db.exec(
    "UPDATE queue_entries SET status_updated_at = COALESCE(last_played_at, checked_in_at) WHERE status_updated_at IS NULL",
  );
}

// Upgrade queue_entries CHECK constraint to include 'staged'
const qeSql =
  db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='queue_entries'").get()?.sql ?? "";
if (!qeSql.includes("'staged'")) {
  db.exec("PRAGMA foreign_keys = OFF");
  db.transaction(() =>
    db.exec(`
    CREATE TABLE queue_entries_new (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id INTEGER NOT NULL REFERENCES sessions(id),
      player_id INTEGER NOT NULL REFERENCES players(id),
      checked_in_at INTEGER NOT NULL,
      status TEXT NOT NULL DEFAULT 'waiting' CHECK(status IN ('waiting','playing','resting','left','staged')),
      last_played_at INTEGER,
      total_seconds_played INTEGER NOT NULL DEFAULT 0,
      sort_order INTEGER NOT NULL DEFAULT 0,
      games_played INTEGER NOT NULL DEFAULT 0,
      status_updated_at INTEGER
    );
    INSERT INTO queue_entries_new (id, session_id, player_id, checked_in_at, status, last_played_at, total_seconds_played, sort_order, games_played, status_updated_at)
      SELECT id, session_id, player_id, checked_in_at, status, last_played_at, total_seconds_played, sort_order, games_played, status_updated_at FROM queue_entries;
    DROP TABLE queue_entries;
    ALTER TABLE queue_entries_new RENAME TO queue_entries;
  `),
  )();
  db.exec("PRAGMA foreign_keys = ON");
}

// one-shot column additions and court_number relaxation for matches
const matchCols = new Set(
  db
    .prepare("PRAGMA table_info(matches)")
    .all()
    .map((c) => c.name),
);
if (!matchCols.has("state")) {
  db.exec("ALTER TABLE matches ADD COLUMN state TEXT NOT NULL DEFAULT 'active'");
}
if (!matchCols.has("slate_seq")) {
  db.exec("ALTER TABLE matches ADD COLUMN slate_seq INTEGER");
}
if (!matchCols.has("new_shuttles")) {
  db.exec("ALTER TABLE matches ADD COLUMN new_shuttles INTEGER NOT NULL DEFAULT 0");
}
if (!matchCols.has("used_shuttles")) {
  db.exec("ALTER TABLE matches ADD COLUMN used_shuttles INTEGER NOT NULL DEFAULT 0");
}
if (!matchCols.has("rating")) {
  db.exec("ALTER TABLE matches ADD COLUMN rating INTEGER");
}

const courtNumberCol = db
  .prepare("PRAGMA table_info(matches)")
  .all()
  .find((c) => c.name === "court_number");
if (courtNumberCol?.notnull === 1) {
  db.exec("PRAGMA foreign_keys = OFF");
  db.transaction(() =>
    db.exec(`
    CREATE TABLE matches_new (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id INTEGER NOT NULL REFERENCES sessions(id),
      court_number INTEGER,
      format TEXT NOT NULL CHECK(format IN ('singles','doubles')),
      team1_p1 INTEGER NOT NULL REFERENCES queue_entries(id),
      team1_p2 INTEGER REFERENCES queue_entries(id),
      team2_p1 INTEGER NOT NULL REFERENCES queue_entries(id),
      team2_p2 INTEGER REFERENCES queue_entries(id),
      team1_score INTEGER,
      team2_score INTEGER,
      started_at INTEGER NOT NULL,
      ended_at INTEGER,
      state TEXT NOT NULL DEFAULT 'active',
      slate_seq INTEGER,
      new_shuttles INTEGER NOT NULL DEFAULT 0,
      used_shuttles INTEGER NOT NULL DEFAULT 0,
      rating INTEGER
    );
    INSERT INTO matches_new (id, session_id, court_number, format, team1_p1, team1_p2, team2_p1, team2_p2, team1_score, team2_score, started_at, ended_at, state, slate_seq, new_shuttles, used_shuttles, rating)
      SELECT id, session_id, court_number, format, team1_p1, team1_p2, team2_p1, team2_p2, team1_score, team2_score, started_at, ended_at, state, slate_seq, new_shuttles, used_shuttles, rating FROM matches;
    DROP TABLE matches;
    ALTER TABLE matches_new RENAME TO matches;
  `),
  )();
  db.exec("PRAGMA foreign_keys = ON");
}

// one-shot column additions for courts (duration_minutes, expires_at)
const courtCols = new Set(
  db
    .prepare("PRAGMA table_info(courts)")
    .all()
    .map((c) => c.name),
);
if (!courtCols.has("duration_minutes")) {
  db.exec("ALTER TABLE courts ADD COLUMN duration_minutes INTEGER");
}
if (!courtCols.has("expires_at")) {
  db.exec("ALTER TABLE courts ADD COLUMN expires_at INTEGER");
}
if (!courtCols.has("opens_after")) {
  db.exec("ALTER TABLE courts ADD COLUMN opens_after INTEGER");
}

// ponytail: rebuild sessions to relax started_at — drafts have NULL until PATCH /start
const startedAt = db
  .prepare("PRAGMA table_info(sessions)")
  .all()
  .find((c) => c.name === "started_at");
if (startedAt?.notnull === 1) {
  db.exec("PRAGMA foreign_keys = OFF");
  db.transaction(() =>
    db.exec(`
    CREATE TABLE sessions_new (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      scheduled_start INTEGER NOT NULL,
      scheduled_end INTEGER NOT NULL,
      court_count INTEGER NOT NULL DEFAULT 2,
      started_at INTEGER,
      ended_at INTEGER
    );
    INSERT INTO sessions_new (id, name, scheduled_start, scheduled_end, court_count, started_at, ended_at)
      SELECT id, name, scheduled_start, scheduled_end, court_count, started_at, ended_at FROM sessions;
    DROP TABLE sessions;
    ALTER TABLE sessions_new RENAME TO sessions;
  `),
  )();
  db.exec("PRAGMA foreign_keys = ON");
}

// session-level manual shuttle count (+ New shuttle in the sidebar)
const sessionCols = new Set(
  db
    .prepare("PRAGMA table_info(sessions)")
    .all()
    .map((c) => c.name),
);
if (!sessionCols.has("shuttles_extra")) {
  db.exec("ALTER TABLE sessions ADD COLUMN shuttles_extra INTEGER NOT NULL DEFAULT 0");
}
if (!sessionCols.has("paused_at")) {
  db.exec("ALTER TABLE sessions ADD COLUMN paused_at INTEGER");
}
if (!sessionCols.has("checkin_order")) {
  db.exec("ALTER TABLE sessions ADD COLUMN checkin_order TEXT NOT NULL DEFAULT 'alphabetical'");
}

// Late-arrival virtual game offset: g_virt = games_played + virt_offset.
// Set once at check-in to the median g_virt of then-active entries (§2).
const virtCols = new Set(db.prepare("PRAGMA table_info(queue_entries)").all().map((c) => c.name));
if (!virtCols.has("virt_offset")) {
  db.exec("ALTER TABLE queue_entries ADD COLUMN virt_offset REAL NOT NULL DEFAULT 0");
}

// backfill courts for sessions that predate the courts table
const sessionsNeedingCourts = db
  .prepare(`
  SELECT s.id, s.court_count FROM sessions s
  WHERE s.court_count > 0
    AND NOT EXISTS (SELECT 1 FROM courts c WHERE c.session_id = s.id)
`)
  .all();
if (sessionsNeedingCourts.length > 0) {
  const insertCourt = db.prepare("INSERT INTO courts (session_id, label) VALUES (?, ?)");
  const updateMatches = db.prepare(`
    UPDATE matches SET court_number = (
      SELECT c.id FROM courts c
      WHERE c.session_id = matches.session_id
        AND c.label = 'Court ' || matches.court_number
    )
    WHERE session_id = ?
      AND EXISTS (
        SELECT 1 FROM courts c
        WHERE c.session_id = matches.session_id
          AND c.label = 'Court ' || matches.court_number
      )
  `);
  db.transaction(() => {
    for (const { id, court_count } of sessionsNeedingCourts) {
      for (let i = 1; i <= court_count; i++) {
        insertCourt.run(id, `Court ${i}`);
      }
    }
    for (const { id } of sessionsNeedingCourts) {
      updateMatches.run(id);
    }
  })();
}

export function seedPlayersFromFile(rows) {
  const now = Math.floor(Date.now() / 1000);
  const insert = db.prepare(
    "INSERT OR IGNORE INTO players (name, skill_level, created_at) SELECT ?, ?, ? WHERE NOT EXISTS (SELECT 1 FROM players WHERE LOWER(TRIM(name)) = LOWER(TRIM(?)))",
  );
  for (const row of rows) {
    if (row == null || typeof row !== "object") continue; // bare non-element rows, e.g. [null]
    const { name, skill_level } = row;
    if (typeof name !== "string" || !name.trim()) continue;
    if (!isValidSkill(skill_level)) continue;
    insert.run(name.trim(), normalizeSkill(skill_level), now, name.trim());
  }
}

const dbDir = dirname(dbPath);
const presetPath =
  process.env.PLAYERS_PATH ??
  (existsSync(`${dbDir}/players.json`) ? `${dbDir}/players.json` : join(__dirname, "../players.json"));

function loadPresetRows() {
  if (!existsSync(presetPath)) return null;
  try {
    const rows = JSON.parse(readFileSync(presetPath, "utf8"));
    return Array.isArray(rows) ? rows : null;
  } catch {
    return null;
  }
}

// Reset the pool to the preset: drop non-preset players with no match history
// (v1.3: anyone who actually played is kept so history/career survive session
// end), resync preset skills, re-add any missing preset players.
// Missing/unparseable file = no-op.
export function resetPlayersToPreset() {
  const rows = loadPresetRows();
  if (!rows) return;
  db.transaction(() => {
    const valid = rows.filter((r) => typeof r?.name === "string" && r.name.trim());
    const names = valid.map((r) => r.name.trim());
    const placeholders = names.map(() => "LOWER(TRIM(?))").join(",");

    // Collect players leaving the pool BEFORE deleting anything, so their
    // dependent rows can go first — queue_entries/matches reference players.id
    // with no ON DELETE action and foreign_keys is ON.
    const nonPreset = names.length
      ? db.prepare(`SELECT id FROM players WHERE LOWER(TRIM(name)) NOT IN (${placeholders})`).all(...names)
      : db.prepare("SELECT id FROM players").all();
    // A player appears in any match = match history = kept (history joins
    // their queue_entries; deleting them would orphan the session record).
    const played = new Set(
      db
        .prepare(
          `SELECT DISTINCT qe.player_id AS pid FROM queue_entries qe
           WHERE qe.id IN (SELECT team1_p1 FROM matches WHERE state != 'slated'
                           UNION SELECT team1_p2 FROM matches WHERE state != 'slated'
                           UNION SELECT team2_p1 FROM matches WHERE state != 'slated'
                           UNION SELECT team2_p2 FROM matches WHERE state != 'slated')`,
        )
        .all()
        .map((r) => r.pid),
    );
    const doomed = nonPreset.filter((p) => !played.has(p.id));
    if (doomed.length) {
      const playerIds = doomed.map((r) => r.id);
      const idPh = playerIds.map(() => "?").join(",");
      const entryIds = db
        .prepare(`SELECT id FROM queue_entries WHERE player_id IN (${idPh})`)
        .all(...playerIds)
        .map((r) => r.id);
      if (entryIds.length) {
        const entryPh = entryIds.map(() => "?").join(",");
        db.prepare(
          `DELETE FROM matches WHERE team1_p1 IN (${entryPh}) OR team1_p2 IN (${entryPh}) OR team2_p1 IN (${entryPh}) OR team2_p2 IN (${entryPh})`,
        ).run(...entryIds, ...entryIds, ...entryIds, ...entryIds);
        db.prepare(`DELETE FROM queue_entries WHERE id IN (${entryPh})`).run(...entryIds);
      }
      db.prepare(`DELETE FROM players WHERE id IN (${idPh})`).run(...playerIds);
    }

    seedPlayersFromFile(rows);
    const update = db.prepare("UPDATE players SET skill_level = ? WHERE LOWER(TRIM(name)) = LOWER(TRIM(?))");
    for (const { name, skill_level } of valid) {
      if (!isValidSkill(skill_level)) continue; // name above already kept the player; keep their level too
      update.run(normalizeSkill(skill_level), name.trim());
    }
  })();
}

const presetRows = loadPresetRows();
if (presetRows) seedPlayersFromFile(presetRows);

export default db;
