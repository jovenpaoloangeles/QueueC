// tests/e2e/../server regression: two simultaneous match ends return all 8 players to waiting.
// Demoted from e2e/19-queue-master.spec.js QM.7 — pure server state, no UI assertion needed.
// Run with: bun server/routes/two-match-end.test.js (server must be running on :3001)
import assert from 'node:assert/strict'

const BASE = process.env.QC_TEST_BASE ?? 'http://localhost:3001'

async function main() {
  // fresh session, 2 courts, 8 players
  const players = (await (await fetch(`${BASE}/api/players`)).json()).players
  const eight = players.slice(0, 8)
  assert.equal(eight.length, 8, 'need at least 8 fixture players')

  const now = Math.floor(Date.now() / 1000)
  const { session } = await (await fetch(`${BASE}/api/sessions`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'TwoEnd', court_count: 2, scheduled_start: now, scheduled_end: now + 7200 }),
  })).json()

  const entries = []
  for (const p of eight) {
    const { entry } = await (await fetch(`${BASE}/api/sessions/${session.id}/checkin`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ player_id: p.id }),
    })).json()
    entries.push(entry)
  }
  await fetch(`${BASE}/api/sessions/${session.id}/start`, { method: 'PATCH' })

  const startMatch = async (courtId, four) => {
    const res = await fetch(`${BASE}/api/matches`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        session_id: session.id, court_number: courtId,
        team1_p1: four[0].id, team1_p2: four[1].id,
        team2_p1: four[2].id, team2_p2: four[3].id,
      }),
    })
    assert.equal(res.status, 201, `start match on court ${courtId}: ${res.status}`)
    return (await res.json()).match
  }

  const m1 = await startMatch(1, entries.slice(0, 4))
  const m2 = await startMatch(2, entries.slice(4, 8))
  assert.notEqual(m1.id, m2.id)

  // end both back-to-back, no UI in between
  for (const m of [m1, m2]) {
    const res = await fetch(`${BASE}/api/matches/${m.id}/end`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ team1_score: 21, team2_score: 15 }),
    })
    assert.equal(res.status, 200, `end match ${m.id}: ${res.status}`)
  }

  const st = await (await fetch(`${BASE}/api/sessions/${session.id}/stats`)).json()
  const waiting = st.stats.player_count
  assert.equal(waiting, 8, `all 8 players should be non-left/non-staged after both ends, got ${waiting}`)

  const { suggestion } = await (await fetch(`${BASE}/api/sessions/${session.id}/suggest?mode=doubles`)).json()
  assert.ok(suggestion, 'a fresh doubles suggestion should exist after both matches end')

  // cleanup
  await fetch(`${BASE}/api/sessions/${session.id}/end`, { method: 'PATCH' })
  console.log('two-match-end.test.js: all assertions passed')
}

main().catch(e => { console.error(e); process.exit(1) })
