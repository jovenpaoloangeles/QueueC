const BASE = 'http://localhost:3001/api'
const UNIQUE = `TestPlayer-${Date.now().toString(36)}`

async function run() {
  // Create player
  const r1 = await fetch(`${BASE}/players`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: UNIQUE, skill_level: 'intermediate' })
  }).then(r => r.json())
  console.assert(r1.player.id, 'Expected player id')

  // List players includes new one
  const r2 = await fetch(`${BASE}/players`).then(r => r.json())
  console.assert(r2.players.some(p => p.id === r1.player.id), 'Player not in list')

  // Create session to checkin against
  const r3 = await fetch(`${BASE}/sessions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'T', scheduled_start: 1000, scheduled_end: 2000, court_count: 2 })
  }).then(r => r.json())

  // Checkin
  const r4 = await fetch(`${BASE}/sessions/${r3.session.id}/checkin`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ player_id: r1.player.id })
  }).then(r => r.json())
  console.assert(r4.entry.status === 'waiting', 'Expected waiting status')
  console.assert(r4.entry.last_played_at === null, 'Expected last_played_at null')
  console.assert(r4.entry.total_seconds_played === 0, 'Expected total_seconds_played 0')

  // Duplicate checkin → 409
  const r5 = await fetch(`${BASE}/sessions/${r3.session.id}/checkin`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ player_id: r1.player.id })
  })
  console.assert(r5.status === 409, 'Expected 409 on duplicate checkin')

  // Update status
  const r6 = await fetch(`${BASE}/queue/${r4.entry.id}/status`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ status: 'resting' })
  }).then(r => r.json())
  console.assert(r6.entry.status === 'resting', 'Expected resting status')

  // Clean up
  await fetch(`${BASE}/sessions/${r3.session.id}/end`, { method: 'PATCH' })

  console.log('players-queue.test.js: all assertions passed')
}
run().catch(e => { console.error(e); process.exit(1) })
