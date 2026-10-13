import Database from 'better-sqlite3'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import { readFileSync, existsSync } from 'fs'

const __dirname = dirname(fileURLToPath(import.meta.url))
const dbPath = process.env.DB_PATH ?? join(__dirname, '../queuec.db')
const db = new Database(dbPath)

db.pragma('journal_mode = WAL')
db.pragma('foreign_keys = ON')

db.exec(`
  CREATE TABLE IF NOT EXISTS players (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    skill_level TEXT NOT NULL CHECK(skill_level IN ('newbie','beginner','intermediate','upper_intermediate','advanced')),
    created_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS sessions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    scheduled_start INTEGER NOT NULL,
    scheduled_end INTEGER NOT NULL,
    court_count INTEGER NOT NULL DEFAULT 2,
    started_at INTEGER,
    ended_at INTEGER
  );

  CREATE TABLE IF NOT EXISTS queue_entries (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id INTEGER NOT NULL REFERENCES sessions(id),
    player_id INTEGER NOT NULL REFERENCES players(id),
    checked_in_at INTEGER NOT NULL,
    status TEXT NOT NULL DEFAULT 'waiting' CHECK(status IN ('waiting','playing','resting','left')),
    last_played_at INTEGER,
    total_seconds_played INTEGER NOT NULL DEFAULT 0,
    sort_order INTEGER NOT NULL DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS matches (
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

  CREATE TABLE IF NOT EXISTS courts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id INTEGER NOT NULL REFERENCES sessions(id),
    label TEXT NOT NULL,
    active_from INTEGER,
    active_until INTEGER,
    enabled INTEGER NOT NULL DEFAULT 1
  );
`)

// ponytail: one-shot column add for DBs created before sort_order existed
const hasSortOrder = db.prepare("PRAGMA table_info(queue_entries)").all()
  .some(c => c.name === 'sort_order')
if (!hasSortOrder) {
  db.exec('ALTER TABLE queue_entries ADD COLUMN sort_order INTEGER NOT NULL DEFAULT 0')
}

// ponytail: rebuild sessions to relax started_at — drafts have NULL until PATCH /start
const startedAt = db.prepare('PRAGMA table_info(sessions)').all()
  .find(c => c.name === 'started_at')
if (startedAt?.notnull === 1) {
  db.pragma('foreign_keys = OFF')
  db.transaction(() => db.exec(`
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
  `))()
  db.pragma('foreign_keys = ON')
}

// backfill courts for sessions that predate the courts table
const sessionsNeedingCourts = db.prepare(`
  SELECT s.id, s.court_count FROM sessions s
  WHERE s.court_count > 0
    AND NOT EXISTS (SELECT 1 FROM courts c WHERE c.session_id = s.id)
`).all()
if (sessionsNeedingCourts.length > 0) {
  const insertCourt = db.prepare(
    'INSERT INTO courts (session_id, label) VALUES (?, ?)'
  )
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
  `)
  db.transaction(() => {
    for (const { id, court_count } of sessionsNeedingCourts) {
      for (let i = 1; i <= court_count; i++) {
        insertCourt.run(id, `Court ${i}`)
      }
    }
    for (const { id } of sessionsNeedingCourts) {
      updateMatches.run(id)
    }
  })()
}

export function seedPlayersFromFile(rows) {
  const now = Math.floor(Date.now() / 1000)
  const insert = db.prepare(
    'INSERT OR IGNORE INTO players (name, skill_level, created_at) SELECT ?, ?, ? WHERE NOT EXISTS (SELECT 1 FROM players WHERE name = ?)'
  )
  for (const { name, skill_level } of rows) {
    insert.run(name, skill_level, now, name)
  }
}

const dbDir = dirname(dbPath)
const presetPath = existsSync(`${dbDir}/players.json`)
  ? `${dbDir}/players.json`
  : join(__dirname, '../players.json')

if (existsSync(presetPath)) {
  try {
    const rows = JSON.parse(readFileSync(presetPath, 'utf8'))
    if (Array.isArray(rows)) seedPlayersFromFile(rows)
  } catch {}
}

export default db
