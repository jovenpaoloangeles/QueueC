const BASE = process.env.QC_TEST_BASE ?? process.env.BASE_URL ?? 'http://localhost:3991/api'
const SUFFIX = Date.now().toString(36)

async function run() {
  // Setup: session + 4 players + check them in
  const session = (await fetch(`${BASE}/sessions`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'T', scheduled_start: 1000, scheduled_end: 2000, court_count: 2 })
  }).then(r => r.json())).session

  const names = [`P1-${SUFFIX}`,`P2-${SUFFIX}`,`P3-${SUFFIX}`,`P4-${SUFFIX}`]
  const entries = []
  for (const name of names) {
    const p = (await fetch(`${BASE}/players`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, skill_level: 'intermediate' })
    }).then(r => r.json())).player
    const e = (await fetch(`${BASE}/sessions/${session.id}/checkin`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ player_id: p.id })
    }).then(r => r.json())).entry
    entries.push(e)
  }

  // Start the session (matches are rejected on drafts)
  await fetch(`${BASE}/sessions/${session.id}/start`, { method: 'PATCH' })

  // Start doubles match
  const m = (await fetch(`${BASE}/matches`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      session_id: session.id, court_number: 1,
      team1_p1: entries[0].id, team1_p2: entries[1].id,
      team2_p1: entries[2].id, team2_p2: entries[3].id
    })
  }).then(r => r.json())).match
  console.assert(m.format === 'doubles', 'Expected doubles')
  console.assert(m.ended_at === null, 'Expected no ended_at yet')

  // End match
  const ended = (await fetch(`${BASE}/matches/${m.id}/end`, {
    method: 'PATCH', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ team1_score: 21, team2_score: 15 })
  }).then(r => r.json())).match
  console.assert(ended.team1_score === 21, 'Expected score 21')
  console.assert(ended.ended_at !== null, 'Expected ended_at set')

  console.log('matches.test.js: all assertions passed')
}
run().catch(e => { console.error(e); process.exit(1) })