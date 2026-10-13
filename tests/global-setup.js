// tests/global-setup.js
import { unlinkSync, existsSync, readFileSync } from 'fs'
import { createRequire } from 'module'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const require = createRequire(import.meta.url)
const Database = require(join(dirname(fileURLToPath(import.meta.url)), '../server/node_modules/better-sqlite3'))

const DB = '/tmp/queuec-test.db'
const PLAYERS_PATH = join(dirname(fileURLToPath(import.meta.url)), 'fixtures/players.json')

export default async function globalSetup() {
  // Wipe DB so fixture players seed fresh (avoids duplicate-name conflicts)
  for (const f of [DB, `${DB}-shm`, `${DB}-wal`]) {
    if (existsSync(f)) unlinkSync(f)
  }

  // Directly create schema + seed fixture players — no server spin needed
  const db = new Database(DB)
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

  const players = JSON.parse(readFileSync(PLAYERS_PATH, 'utf8'))
  const now = Math.floor(Date.now() / 1000)
  const insert = db.prepare(
    'INSERT OR IGNORE INTO players (name, skill_level, created_at) SELECT ?, ?, ? WHERE NOT EXISTS (SELECT 1 FROM players WHERE name = ?)'
  )
  const insertMany = db.transaction((rows) => {
    for (const p of rows) insert.run(p.name, p.skill_level, now, p.name)
  })
  insertMany(players)
  db.close()
}
