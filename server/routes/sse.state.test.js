import assert from 'node:assert/strict'
import db from '../db.js'
import { currentState } from './sse.js'

const now = Math.floor(Date.now() / 1000)

// Save any pre-existing unended sessions so we can isolate our test session
const preExistingUnended = db.prepare('SELECT id FROM sessions WHERE ended_at IS NULL').all().map(s => s.id)
for (const id of preExistingUnended) {
  db.prepare('UPDATE sessions SET ended_at = ? WHERE id = ?').run(now, id)
}

let sid, pids = [], eids = [], slatedMid, endedMid

try {
  // Verify no active session state first
  const emptyState = currentState()
  assert.equal(emptyState.session, null)
  assert.deepEqual(emptyState.slatedMatches, [])

  // Seed session (started_at in the future relative to any other, or unended)
  sid = db.prepare(
    'INSERT INTO sessions (name, scheduled_start, scheduled_end, started_at) VALUES (?, ?, ?, ?)'
  ).run('__sse_test_session__', now, now + 3600, now).lastInsertRowid

  // Seed 5 players
  const names = [
    `__sse_p1_${now}__`,
    `__sse_p2_${now}__`,
    `__sse_p3_${now}__`,
    `__sse_p4_${now}__`,
    `__sse_p5_${now}__`,
  ]
  for (const name of names) {
    const { lastInsertRowid: pid } = db.prepare(
      "INSERT INTO players (name, skill_level, created_at) VALUES (?, 'intermediate', ?)"
    ).run(name, now)
    pids.push(pid)
  }

  // Seed 5 queue_entries: first 4 staged, 5th waiting (checked in 10 mins ago)
  for (let i = 0; i < 4; i++) {
    const { lastInsertRowid: eid } = db.prepare(
      'INSERT INTO queue_entries (session_id, player_id, checked_in_at, status) VALUES (?, ?, ?, ?)'
    ).run(sid, pids[i], now - 300, 'staged')
    eids.push(eid)
  }
  const { lastInsertRowid: waitingEid } = db.prepare(
    'INSERT INTO queue_entries (session_id, player_id, checked_in_at, status, games_played, rested_seconds) VALUES (?, ?, ?, ?, ?, ?)'
  ).run(sid, pids[4], now - 600, 'waiting', 1, 150)
  eids.push(waitingEid)

  // Seed 1 slated match with the 4 staged entries (in deliberately non-id order: eids[2], eids[0], eids[3], eids[1])
  slatedMid = db.prepare(
    `INSERT INTO matches (session_id, court_number, format, team1_p1, team1_p2, team2_p1, team2_p2, started_at, state, slate_seq)
     VALUES (?, NULL, 'doubles', ?, ?, ?, ?, ?, 'slated', 1)`
  ).run(sid, eids[2], eids[0], eids[3], eids[1], now).lastInsertRowid

  // Seed 1 ended match with rating = 4 for the waiting entry
  endedMid = db.prepare(
    `INSERT INTO matches (session_id, court_number, format, team1_p1, team2_p1, started_at, ended_at, state, rating, new_shuttles, used_shuttles)
     VALUES (?, 1, 'singles', ?, ?, ?, ?, 'active', 4, 2, 1)`
  ).run(sid, waitingEid, eids[0], now - 500, now - 100).lastInsertRowid

  const state = currentState()

  assert.equal(state.session?.id, sid, 'Expected active session to match test session')
  assert.equal(state.slatedMatches?.length, 1, 'Expected 1 slated match')
  assert.equal(
    state.slatedMatches[0].names,
    [names[2], names[0], names[3], names[1]].join(','),
    'Expected slatedMatch.names in exact slot order (team1_p1, team1_p2, team2_p1, team2_p2)'
  )
  assert.equal(
    state.slatedMatches[0].team1_names,
    [names[2], names[0]].join(','),
    'Expected slatedMatch.team1_names'
  )
  assert.equal(
    state.slatedMatches[0].team2_names,
    [names[3], names[1]].join(','),
    'Expected slatedMatch.team2_names'
  )

  // Queue excludes staged entries and includes waiting entry
  assert.equal(state.queue.length, 1, 'Expected queue to exclude 4 staged entries and have 1 waiting entry')
  assert.equal(state.queue[0].id, waitingEid, 'Expected waiting entry in queue')
  assert.equal(typeof state.queue[0].fairness, 'number', 'Expected numeric fairness')
  assert.ok(state.queue[0].fairness >= 0, 'Expected fairness >= 0')
  assert.equal(state.queue[0].avg_rating, 4, 'Expected avg_rating === 4')

  // Stats check
  assert.equal(state.stats.match_count, 1, 'Expected match_count to count only active matches')
  assert.deepEqual(state.stats.shuttles, { new: 2, used: 1 }, 'Expected shuttles stats')

  // avg wait excludes rested time: 600s since check-in minus 150s rested → ≈ 450
  assert.ok(
    Math.abs(state.stats.avg_wait_seconds - 450) <= 2,
    `Expected avg_wait_seconds ≈ 450 (rest excluded), got ${state.stats.avg_wait_seconds}`
  )

  console.log('sse.state.test.js: all assertions passed')
} finally {
  if (slatedMid) db.prepare('DELETE FROM matches WHERE id = ?').run(slatedMid)
  if (endedMid) db.prepare('DELETE FROM matches WHERE id = ?').run(endedMid)
  if (sid) {
    db.prepare('DELETE FROM queue_entries WHERE session_id = ?').run(sid)
    db.prepare('DELETE FROM courts WHERE session_id = ?').run(sid)
    db.prepare('DELETE FROM sessions WHERE id = ?').run(sid)
  }
  for (const pid of pids) {
    db.prepare('DELETE FROM players WHERE id = ?').run(pid)
  }
  for (const id of preExistingUnended) {
    db.prepare('UPDATE sessions SET ended_at = NULL WHERE id = ?').run(id)
  }
}
