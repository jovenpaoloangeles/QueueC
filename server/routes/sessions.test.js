// Run with: node server/routes/sessions.test.js (server must be running on :3001)
const BASE = 'http://localhost:3001/api'

async function run() {
  // No active session initially
  const r1 = await fetch(`${BASE}/sessions/active`).then(r => r.json())
  console.assert(r1.session === null, 'Expected null active session')

  // Create session
  const r2 = await fetch(`${BASE}/sessions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'Test', scheduled_start: 1000, scheduled_end: 2000, court_count: 2 })
  }).then(r => r.json())
  console.assert(r2.session.id, 'Expected session id')
  console.assert(r2.session.court_count === 2, 'Expected court_count 2')

  // Active session returns it
  const r3 = await fetch(`${BASE}/sessions/active`).then(r => r.json())
  console.assert(r3.session.id === r2.session.id, 'Active session mismatch')

  // End it
  const r4 = await fetch(`${BASE}/sessions/${r2.session.id}/end`, { method: 'PATCH' }).then(r => r.json())
  console.assert(r4.session.ended_at !== null, 'Expected ended_at set')

  // Active now null
  const r5 = await fetch(`${BASE}/sessions/active`).then(r => r.json())
  console.assert(r5.session === null, 'Expected null after end')

  console.log('sessions.test.js: all assertions passed')
}
run().catch(e => { console.error(e); process.exit(1) })
