// Run with: bun server/routes/automatch.test.js (server must be running on :3001)
import assert from 'node:assert/strict'

const BASE = process.env.BASE_URL ?? 'http://localhost:3001/api'
const SUFFIX = Date.now().toString(36)

async function run() {
  // End any stray unended session first
  const active = await fetch(`${BASE}/sessions/active`).then(r => r.json())
  if (active.session) {
    await fetch(`${BASE}/sessions/${active.session.id}/end`, { method: 'PATCH' })
  }

  // 1) Create a session with 3 courts, check in 14 waiting players, start session, and disable Court 3
  const session = (await fetch(`${BASE}/sessions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'AutomatchTest', scheduled_start: 1000, scheduled_end: 2000, court_count: 3 })
  }).then(r => r.json())).session

  try {
    const entries = []
    for (let i = 0; i < 14; i++) {
      const p = (await fetch(`${BASE}/players`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: `AutoP${i}-${SUFFIX}`, skill_level: 'intermediate' })
      }).then(r => r.json())).player
      const e = (await fetch(`${BASE}/sessions/${session.id}/checkin`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ player_id: p.id })
      }).then(r => r.json())).entry
      entries.push(e)
    }

    await fetch(`${BASE}/sessions/${session.id}/start`, { method: 'PATCH' })

    const { courts } = await fetch(`${BASE}/sessions/${session.id}/courts`).then(r => r.json())
    assert.equal(courts.length, 3, 'Expected 3 courts created')
    const [court1, court2, court3] = courts

    const disableRes = await fetch(`${BASE}/courts/${court3.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ enabled: 0 })
    })
    assert.equal(disableRes.status, 200, 'Expected 200 when disabling Court 3')

    // 2) Call POST /api/sessions/:id/automatch -> 200, { started: 2, slated: true }
    const autoRes1 = await fetch(`${BASE}/sessions/${session.id}/automatch`, { method: 'POST' })
    assert.equal(autoRes1.status, 200, 'Expected 200 on first automatch')
    const autoBody1 = await autoRes1.json()
    assert.deepEqual(autoBody1, { started: 2, slated: true }, 'Expected { started: 2, slated: true }')

    // 3) Verify via SSE: 2 active matches on Courts 1 & 2 (none on Court 3), 1 slated match, 2 waiting players remaining
    const sseRes = await fetch(`${BASE}/sse`)
    const reader = sseRes.body.getReader()
    const chunk = new TextDecoder().decode((await reader.read()).value)
    await reader.cancel()
    const dataLine = chunk.split('\n').find(l => l.startsWith('data: '))
    const state = JSON.parse(dataLine.slice(6))

    assert.equal(state.activeMatches.length, 2, 'Expected 2 active matches started')
    const activeCourtIds = state.activeMatches.map(m => m.court_number).sort((a, b) => a - b)
    assert.deepEqual(activeCourtIds, [court1.id, court2.id].sort((a, b) => a - b), 'Expected active matches on Courts 1 & 2 only')
    assert.ok(!activeCourtIds.includes(court3.id), 'Expected no active match on disabled Court 3')

    assert.equal(state.slatedMatches.length, 1, 'Expected 1 slated match created')
    const slatedMatch = state.slatedMatches[0]
    const slatedSlotIds = [slatedMatch.team1_p1, slatedMatch.team1_p2, slatedMatch.team2_p1, slatedMatch.team2_p2].filter(Boolean)
    assert.equal(slatedSlotIds.length, 4, 'Expected 4 staged players in slated match')

    const waitingEntries = state.queue.filter(q => q.status === 'waiting')
    const playingEntries = state.queue.filter(q => q.status === 'playing')
    assert.equal(playingEntries.length, 8, 'Expected 8 playing entries')
    assert.equal(waitingEntries.length, 2, 'Expected 2 waiting players remaining (14 - 8 - 4 = 2)')

    // 4) Call POST /api/sessions/:id/automatch a second time right away -> 409
    const autoRes2 = await fetch(`${BASE}/sessions/${session.id}/automatch`, { method: 'POST' })
    assert.equal(autoRes2.status, 409, 'Expected 409 on second automatch when no free courts and already slated')
  } finally {
    // 5) Clean up in try / finally
    await fetch(`${BASE}/sessions/${session.id}/end`, { method: 'PATCH' })
  }

  console.log('automatch.test.js: all assertions passed')
}

run().catch(e => { console.error(e); process.exit(1) })
