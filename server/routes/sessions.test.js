// Run with: bun server/routes/sessions.test.js (server must be running on :3001)
import assert from 'node:assert/strict'
import { readFileSync, writeFileSync, rmSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import { tmpdir } from 'os'

const BASE = process.env.BASE_URL ?? 'http://localhost:3991/api'
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

  // Check them in but play nothing — the registrant now has a queue_entry row,
  // which references players(id) with no ON DELETE action
  const checkin = await fetch(`${BASE}/sessions/${created.session.id}/checkin`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ player_id: reg.player.id })
  }).then(res => res.json())
  assert.ok(checkin.entry?.id, 'Expected check-in to create a queue entry')
  const entryId = checkin.entry.id

  // End it — pool resets to the preset; must not FK-fail on the checked-in registrant
  const endRes = await fetch(`${BASE}/sessions/${created.session.id}/end`, { method: 'PATCH' })
  assert.ok(endRes.status < 500, `End session must not 500 with a checked-in registrant (got ${endRes.status})`)
  const ended = await endRes.json()
  assert.ok(ended.session.ended_at !== null, 'Expected ended_at set')

  const afterPool = await fetch(`${BASE}/players`).then(res => res.json())
  const names = new Set(afterPool.players.map(p => p.name.trim().toLowerCase()))
  assert.ok(!names.has(UNIQUE.toLowerCase()), 'Expected mid-session registrant gone after end')
  const presetNames = new Set(presetRows.map(p => p.name.trim().toLowerCase()))
  assert.equal(names.size, presetNames.size, 'Expected pool size to match preset after end')
  for (const n of presetNames) {
    assert.ok(names.has(n), `Expected preset player ${n} in pool after end`)
  }

  // The registrant's queue_entry was removed with them (gone → 404)
  const entryProbe = await fetch(`${BASE}/queue/${entryId}`, { method: 'DELETE' })
  assert.equal(entryProbe.status, 404, 'Expected registrant queue entry gone after end')

  // Starting an ended session → 400
  const afterEnd = await fetch(`${BASE}/sessions/${created.session.id}/start`, { method: 'PATCH' })
  assert.equal(afterEnd.status, 400, 'Start after end must be 400')

  // Active now null
  const final = await fetch(`${BASE}/sessions/active`).then(res => res.json())
  assert.equal(final.session, null, 'Expected null after end')

  console.log('sessions.test.js: all assertions passed')
}

// Checked-in players from OLD sessions with matches must be removable FK-safely
// (in-process, temp DB + temp preset; query string busts the module cache so the
// fresh DB_PATH/PLAYERS_PATH take effect)
async function fkCleanupTest() {
  const dbPath = join(tmpdir(), `queuec-reset-fk-${Date.now()}.db`)
  const presetFile = join(tmpdir(), `queuec-reset-fk-preset-${Date.now()}.json`)
  writeFileSync(presetFile, JSON.stringify([
    { name: 'Fk Preset One', skill_level: 'beginner' },
    { name: 'Fk Preset Two', skill_level: 'intermediate' },
  ]))
  process.env.DB_PATH = dbPath
  process.env.PLAYERS_PATH = presetFile
  const { default: db, resetPlayersToPreset } = await import('../db.js?fk-cleanup')
  try {
    const { lastInsertRowid: sessionId } = db.prepare(
      'INSERT INTO sessions (name, scheduled_start, scheduled_end) VALUES (?, ?, ?)'
    ).run('Old Session', 1, 2)
    const insPlayer = db.prepare("INSERT INTO players (name, skill_level, created_at) VALUES (?, 'beginner', 1)")
    const { lastInsertRowid: presetId } = insPlayer.run('Fk Preset One')
    const { lastInsertRowid: strayA } = insPlayer.run('Fk Stray A')
    const { lastInsertRowid: strayB } = insPlayer.run('Fk Stray B')
    const insEntry = db.prepare(
      'INSERT INTO queue_entries (session_id, player_id, checked_in_at, sort_order, status_updated_at) VALUES (?, ?, 1, 1, 1)'
    )
    const { lastInsertRowid: presetEntry } = insEntry.run(sessionId, presetId)
    const { lastInsertRowid: entryA } = insEntry.run(sessionId, strayA)
    const { lastInsertRowid: entryB } = insEntry.run(sessionId, strayB)
    const { lastInsertRowid: strayMatch } = db.prepare(
      "INSERT INTO matches (session_id, court_number, format, team1_p1, team2_p1, started_at) VALUES (?, 1, 'singles', ?, ?, 1)"
    ).run(sessionId, entryA, entryB)
    const { lastInsertRowid: presetMatch } = db.prepare(
      "INSERT INTO matches (session_id, court_number, format, team1_p1, team2_p1, started_at) VALUES (?, 2, 'singles', ?, ?, 1)"
    ).run(sessionId, presetEntry, presetEntry)

    resetPlayersToPreset()

    assert.ok(!db.prepare('SELECT id FROM players WHERE id = ?').get(strayA), 'Expected stray player A gone')
    assert.ok(!db.prepare('SELECT id FROM players WHERE id = ?').get(strayB), 'Expected stray player B gone')
    assert.ok(!db.prepare('SELECT id FROM queue_entries WHERE id = ?').get(entryA), 'Expected stray entry A gone')
    assert.ok(!db.prepare('SELECT id FROM queue_entries WHERE id = ?').get(entryB), 'Expected stray entry B gone')
    assert.ok(!db.prepare('SELECT id FROM matches WHERE id = ?').get(strayMatch), 'Expected match on stray entries gone')
    assert.ok(db.prepare('SELECT id FROM players WHERE id = ?').get(presetId), 'Expected preset player kept')
    assert.ok(db.prepare('SELECT id FROM queue_entries WHERE id = ?').get(presetEntry), 'Expected preset player entry kept')
    assert.ok(db.prepare('SELECT id FROM matches WHERE id = ?').get(presetMatch), 'Expected preset player match kept')
    console.log('sessions.test.js: FK-safe cleanup assertions passed')
  } finally {
    db.close()
    for (const s of ['', '-wal', '-shm']) rmSync(dbPath + s, { force: true })
    rmSync(presetFile, { force: true })
  }
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

// Malformed preset rows — bare null elements, non-string names, missing/typo'd
// skill_level — must not throw and must leave the pool equal to the VALID
// preset rows (in-process, temp DB + temp preset; query busts the module cache)
async function malformedPresetTest() {
  const dbPath = join(tmpdir(), `queuec-reset-malformed-${Date.now()}.db`)
  const presetFile = join(tmpdir(), `queuec-reset-malformed-preset-${Date.now()}.json`)
  writeFileSync(presetFile, JSON.stringify([
    { name: 'Malformed Anchor', skill_level: 'beginner' },
    null, // bare non-element
    { name: 123, skill_level: 'intermediate' }, // non-string name
    { name: 'Malformed Typo', skill_level: 'rockstar' }, // typo'd skill on an existing player
    { name: 'Malformed Missing' }, // missing skill on an existing player
  ]))
  process.env.DB_PATH = dbPath
  process.env.PLAYERS_PATH = presetFile
  const { default: db, resetPlayersToPreset } = await import('../db.js?malformed-preset')
  try {
    // Existing pool players named by the bad-skill rows must survive the reset
    const ins = db.prepare("INSERT INTO players (name, skill_level, created_at) VALUES (?, ?, 1)")
    ins.run('Malformed Typo', 'expert')
    ins.run('Malformed Missing', 'expert')
    ins.run('Malformed Stray', 'beginner')

    resetPlayersToPreset() // must not throw on any of the malformed rows

    const pool = db.prepare('SELECT name, skill_level FROM players ORDER BY name').all()
    assert.deepEqual(pool, [
      { name: 'Malformed Anchor', skill_level: 'beginner' },
      { name: 'Malformed Missing', skill_level: 'expert' },
      { name: 'Malformed Typo', skill_level: 'expert' },
    ], 'Expected pool == valid preset rows, garbage skipped, bad-skill levels preserved')
    console.log('sessions.test.js: malformed-preset assertions passed')
  } finally {
    db.close()
    for (const s of ['', '-wal', '-shm']) rmSync(dbPath + s, { force: true })
    rmSync(presetFile, { force: true })
  }
}

run()
  .then(fkCleanupTest)
  .then(resetNoPresetTest)
  .then(malformedPresetTest)
  .catch(e => { console.error(e); process.exit(1) })
