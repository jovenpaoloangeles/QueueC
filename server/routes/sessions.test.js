// Run with: bun server/routes/sessions.test.js (server must be running on :3001)
import assert from 'node:assert/strict'

const BASE = 'http://localhost:3001/api'

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

  // End it
  const ended = await fetch(`${BASE}/sessions/${created.session.id}/end`, { method: 'PATCH' }).then(res => res.json())
  assert.ok(ended.session.ended_at !== null, 'Expected ended_at set')

  // Starting an ended session → 400
  const afterEnd = await fetch(`${BASE}/sessions/${created.session.id}/start`, { method: 'PATCH' })
  assert.equal(afterEnd.status, 400, 'Start after end must be 400')

  // Active now null
  const final = await fetch(`${BASE}/sessions/active`).then(res => res.json())
  assert.equal(final.session, null, 'Expected null after end')

  console.log('sessions.test.js: all assertions passed')
}
run().catch(e => { console.error(e); process.exit(1) })
