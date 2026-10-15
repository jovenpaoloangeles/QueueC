// Run with: bun server/routes/sessions.test.js (server must be running on :3001)
import assert from 'node:assert/strict'
import { readFileSync, rmSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import { tmpdir } from 'os'

const BASE = process.env.BASE_URL ?? 'http://localhost:3001/api'
const here = dirname(fileURLToPath(import.meta.url))

// Same preset resolution the server uses
const presetPath = process.env.PLAYERS_PATH ?? join(here, '../../players.json')
const presetRows = JSON.parse(readFileSync(presetPath, 'utf8'))

async function run() {
  // No active session initially (end any stray unended session first)
  let r = await fetch(`${BASE}/sessions/active`).then(res => res.json())
  if (r.session) {
    await fetch(`${BASE}/sessions/${r.session.id}/end`, { method: 'PATCH' })
  }
  r = await fetch(`${BASE}/sessions/active`).then(res => res.json())
  assert.equal(r.session, null, 'Expected null active session')

  // Create session → draft (started_at null)
  const created = await fetch(`${BASE}/sessions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'Test', scheduled_start: 1000, scheduled_end: 2000, court_count: 2 })
  }).then(res => res.json())
  assert.ok(created.session.id, 'Expected session id')
  assert.equal(created.session.court_count, 2, 'Expected court_count 2')
  assert.equal(created.session.started_at, null, 'Draft session must have started_at null')

  // Active session returns the draft
  const active = await fetch(`${BASE}/sessions/active`).then(res => res.json())
  assert.equal(active.session.id, created.session.id, 'Active session mismatch')

  // Starting a match on a draft is rejected
  const matchRes = await fetch(`${BASE}/matches`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ session_id: created.session.id, court_number: 1, team1_p1: 1, team2_p1: 2 })
  })
  assert.equal(matchRes.status, 400, 'Match on draft session must be 400')

  // Start the session → started_at set
  const started = await fetch(`${BASE}/sessions/${created.session.id}/start`, { method: 'PATCH' }).then(res => res.json())
  assert.ok(started.session.started_at !== null, 'Expected started_at set after start')

  // Starting twice → 400
  const again = await fetch(`${BASE}/sessions/${created.session.id}/start`, { method: 'PATCH' })
  assert.equal(again.status, 400, 'Second start must be 400')

  // Register a player mid-session — allowed while live, gone after end
  const UNIQUE = `TempPlayer-${Date.now().toString(36)}`
  const reg = await fetch(`${BASE}/players`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: UNIQUE, skill_level: 'intermediate' })
  }).then(res => res.json())
  assert.ok(reg.player?.id, 'Expected mid-session registration to succeed')
  const midPool = await fetch(`${BASE}/players`).then(res => res.json())
  assert.ok(midPool.players.some(p => p.name === UNIQUE), 'Expected mid-session registrant in pool while live')

  // End it — pool resets to the preset
  const ended = await fetch(`${BASE}/sessions/${created.session.id}/end`, { method: 'PATCH' }).then(res => res.json())
  assert.ok(ended.session.ended_at !== null, 'Expected ended_at set')

  const afterPool = await fetch(`${BASE}/players`).then(res => res.json())
  const names = new Set(afterPool.players.map(p => p.name.trim().toLowerCase()))
  assert.ok(!names.has(UNIQUE.toLowerCase()), 'Expected mid-session registrant gone after end')
  const presetNames = new Set(presetRows.map(p => p.name.trim().toLowerCase()))
  assert.equal(names.size, presetNames.size, 'Expected pool size to match preset after end')
  for (const n of presetNames) {
    assert.ok(names.has(n), `Expected preset player ${n} in pool after end`)
  }

  // Starting an ended session → 400
  const afterEnd = await fetch(`${BASE}/sessions/${created.session.id}/start`, { method: 'PATCH' })
  assert.equal(afterEnd.status, 400, 'Start after end must be 400')

  // Active now null
  const final = await fetch(`${BASE}/sessions/active`).then(res => res.json())
  assert.equal(final.session, null, 'Expected null after end')

  console.log('sessions.test.js: all assertions passed')
}

// Missing/unparseable preset file → reset is a no-op (in-process, temp DB)
async function resetNoPresetTest() {
  const dbPath = join(tmpdir(), `queuec-reset-nopreset-${Date.now()}.db`)
  process.env.DB_PATH = dbPath
  process.env.PLAYERS_PATH = join(tmpdir(), `no-such-preset-${Date.now()}.json`)
  const { default: db, resetPlayersToPreset } = await import('../db.js')
  try {
    db.prepare("INSERT INTO players (name, skill_level, created_at) VALUES ('Keep Me', 'beginner', 1)").run()
    resetPlayersToPreset()
    const left = db.prepare('SELECT name FROM players').all()
    assert.deepEqual(left.map(p => p.name), ['Keep Me'], 'Expected reset to be a no-op without a preset file')
    console.log('sessions.test.js: missing-preset no-op assertion passed')
  } finally {
    db.close()
    for (const s of ['', '-wal', '-shm']) rmSync(dbPath + s, { force: true })
  }
}

run()
  .then(resetNoPresetTest)
  .catch(e => { console.error(e); process.exit(1) })
