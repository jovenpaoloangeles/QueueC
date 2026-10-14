import { Database } from 'bun:sqlite'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import { readFileSync, existsSync } from 'fs'

const __dirname = dirname(fileURLToPath(import.meta.url))
const dbPath = process.env.DB_PATH ?? join(__dirname, '../queuec.db')
const db = new Database(dbPath)

db.exec('PRAGMA journal_mode = WAL')
db.exec('PRAGMA foreign_keys = ON')

export const SKILL_LEVELS = [
  'newbie',
  'beginner',
  'lower_intermediate',
  'intermediate',
  'upper_intermediate',
  'expert',
  'professional',
  'advanced', // legacy alias accepted & normalized to expert
]

export function normalizeSkill(skill) {
  if (skill === 'advanced') return 'expert'
  return skill
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
    sort_order INTEGER NOT NULL DEFAULT 0,
    games_played INTEGER NOT NULL DEFAULT 0,
    status_updated_at INTEGER
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
    duration_minutes INTEGER,
    expires_at INTEGER,
    enabled INTEGER NOT NULL DEFAULT 1
  );
`)

// Upgrade players CHECK constraint if DB was created with the old 5-tier constraint
const playersSql = db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='players'").get()?.sql ?? ''
if (!playersSql.includes('lower_intermediate')) {
  db.exec('PRAGMA foreign_keys = OFF')
  db.transaction(() => db.exec(`
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
  `))()
  db.exec('PRAGMA foreign_keys = ON')
} else {
  // Normalize any stray 'advanced' rows to 'expert'
  db.exec("UPDATE players SET skill_level = 'expert' WHERE skill_level = 'advanced'")
}

// ponytail: one-shot column additions for queue_entries
const qeCols = new Set(db.prepare("PRAGMA table_info(queue_entries)").all().map(c => c.name))
if (!qeCols.has('sort_order')) {
  db.exec('ALTER TABLE queue_entries ADD COLUMN sort_order INTEGER NOT NULL DEFAULT 0')
}
if (!qeCols.has('games_played')) {
  db.exec('ALTER TABLE queue_entries ADD COLUMN games_played INTEGER NOT NULL DEFAULT 0')
}
if (!qeCols.has('status_updated_at')) {
  db.exec('ALTER TABLE queue_entries ADD COLUMN status_updated_at INTEGER')
  db.exec('UPDATE queue_entries SET status_updated_at = COALESCE(last_played_at, checked_in_at) WHERE status_updated_at IS NULL')
}

// one-shot column additions for courts (duration_minutes, expires_at)
const courtCols = new Set(db.prepare("PRAGMA table_info(courts)").all().map(c => c.name))
if (!courtCols.has('duration_minutes')) {
  db.exec('ALTER TABLE courts ADD COLUMN duration_minutes INTEGER')
}
if (!courtCols.has('expires_at')) {
  db.exec('ALTER TABLE courts ADD COLUMN expires_at INTEGER')
}

// ponytail: rebuild sessions to relax started_at — drafts have NULL until PATCH /start
const startedAt = db.prepare('PRAGMA table_info(sessions)').all()
  .find(c => c.name === 'started_at')
if (startedAt?.notnull === 1) {
  db.exec('PRAGMA foreign_keys = OFF')
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
  db.exec('PRAGMA foreign_keys = ON')
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
    'INSERT OR IGNORE INTO players (name, skill_level, created_at) SELECT ?, ?, ? WHERE NOT EXISTS (SELECT 1 FROM players WHERE LOWER(TRIM(name)) = LOWER(TRIM(?)))'
  )
  for (const { name, skill_level } of rows) {
    if (!name?.trim()) continue
    insert.run(name.trim(), normalizeSkill(skill_level), now, name.trim())
  }
}

const dbDir = dirname(dbPath)
const presetPath = process.env.PLAYERS_PATH
  ?? (existsSync(`${dbDir}/players.json`) ? `${dbDir}/players.json` : join(__dirname, '../players.json'))

if (existsSync(presetPath)) {
  try {
    const rows = JSON.parse(readFileSync(presetPath, 'utf8'))
    if (Array.isArray(rows)) seedPlayersFromFile(rows)
  } catch {}
}

export default db
