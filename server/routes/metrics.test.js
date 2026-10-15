// Run with: bun server/routes/metrics.test.js (server must be running on :3001)
import assert from 'node:assert/strict'

const BASE = process.env.BASE_URL ?? 'http://localhost:3001/api'
const SUFFIX = Date.now().toString(36)

async function run() {
  // End any stray unended session first
  const active = await fetch(`${BASE}/sessions/active`).then(r => r.json())
  if (active.session) {
    await fetch(`${BASE}/sessions/${active.session.id}/end`, { method: 'PATCH' })
  }

  // Create a session with 2 courts (Court 1 with duration_minutes: 60, Court 2 with duration_minutes: null)
  const session = (await fetch(`${BASE}/sessions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: 'MetricsTest',
      scheduled_start: 1000,
      scheduled_end: 2000,
      courts: [
        { label: 'Court 1', duration_minutes: 60 },
        { label: 'Court 2', duration_minutes: null }
      ]
    })
  }).then(r => r.json())).session

  try {
    // Check in 2 players
    const entries = []
    for (let i = 0; i < 2; i++) {
      const p = (await fetch(`${BASE}/players`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: `MetricsP${i}-${SUFFIX}`, skill_level: 'intermediate' })
      }).then(r => r.json())).player
      const e = (await fetch(`${BASE}/sessions/${session.id}/checkin`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ player_id: p.id })
      }).then(r => r.json())).entry
      entries.push(e)
    }

    // Start the session (so Court 1 gets expires_at)
    await fetch(`${BASE}/sessions/${session.id}/start`, { method: 'PATCH' })

    const { courts } = await fetch(`${BASE}/sessions/${session.id}/courts`).then(r => r.json())
    const court1 = courts[0]
    const court2 = courts[1]
    assert.ok(court1.expires_at != null, 'Expected Court 1 to have expires_at after session start')
    assert.equal(court2.expires_at, null, 'Expected Court 2 to have null expires_at')

    // Start a singles match on Court 1
    const matchRes = await fetch(`${BASE}/matches`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        session_id: session.id,
        court_number: court1.id,
        team1_p1: entries[0].id,
        team2_p1: entries[1].id
      })
    })
    assert.equal(matchRes.status, 201, 'Expected 201 when starting singles match')
    const { match } = await matchRes.json()

    // Backstop: an entry already 'playing' cannot be double-booked onto another court
    const doubleBookRes = await fetch(`${BASE}/matches`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        session_id: session.id,
        court_number: court2.id,
        team1_p1: entries[0].id,
        team2_p1: entries[1].id
      })
    })
    assert.equal(doubleBookRes.status, 400, 'Expected 400 when starting a match with a playing entry')
    const doubleBookBody = await doubleBookRes.json()
    assert.equal(doubleBookBody.error, `entry ${entries[0].id} is not waiting`, 'Expected double-booking backstop error')

    // PATCH /api/matches/:id/shuttles with { delta_new: 1, delta_used: -1 } -> 200, match.new_shuttles === 1, match.used_shuttles === 0 (clamped at 0)
    const shuttles1Res = await fetch(`${BASE}/matches/${match.id}/shuttles`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ delta_new: 1, delta_used: -1 })
    })
    assert.equal(shuttles1Res.status, 200, 'Expected 200 on first PATCH shuttles')
    const { match: m1 } = await shuttles1Res.json()
    assert.equal(m1.new_shuttles, 1, 'Expected new_shuttles === 1')
    assert.equal(m1.used_shuttles, 0, 'Expected used_shuttles === 0 (clamped at 0)')

    // PATCH /api/matches/:id/shuttles with { delta_new: 1, delta_used: 2 } -> 200, match.new_shuttles === 2, match.used_shuttles === 2
    const shuttles2Res = await fetch(`${BASE}/matches/${match.id}/shuttles`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ delta_new: 1, delta_used: 2 })
    })
    assert.equal(shuttles2Res.status, 200, 'Expected 200 on second PATCH shuttles')
    const { match: m2 } = await shuttles2Res.json()
    assert.equal(m2.new_shuttles, 2, 'Expected new_shuttles === 2')
    assert.equal(m2.used_shuttles, 2, 'Expected used_shuttles === 2')

    // PATCH /api/courts/:court1Id/extend with { minutes: 60 } on timed Court 1 -> 200, court.expires_at increased by 3600
    const extend1Res = await fetch(`${BASE}/courts/${court1.id}/extend`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ minutes: 60 })
    })
    assert.equal(extend1Res.status, 200, 'Expected 200 when extending timed Court 1')
    const { court: extendedCourt1 } = await extend1Res.json()
    assert.equal(extendedCourt1.expires_at, court1.expires_at + 3600, 'Expected court.expires_at increased by 3600')

    // Extending an already-expired court yields expires_at > now
    await fetch(`${BASE}/courts/${court1.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ expires_at: Math.floor(Date.now() / 1000) - 7200 })
    })
    const extendExpRes = await fetch(`${BASE}/courts/${court1.id}/extend`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ minutes: 60 })
    })
    const { court: extendedExpired } = await extendExpRes.json()
    assert.ok(extendedExpired.expires_at > Math.floor(Date.now() / 1000), 'Expected expired court extended to expires_at > now')

    // PATCH /api/courts/:court2Id/extend with { minutes: 60 } on untimed Court 2 -> 400, error === 'Court has no rental timer'
    const extend2Res = await fetch(`${BASE}/courts/${court2.id}/extend`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ minutes: 60 })
    })
    assert.equal(extend2Res.status, 400, 'Expected 400 when extending untimed Court 2')
    const extend2Body = await extend2Res.json()
    assert.equal(extend2Body.error, 'Court has no rental timer', 'Expected error === "Court has no rental timer"')

    // 1) PATCH /api/queue/:id/status with { status: 'resting' } on a 'playing' entry -> 409 ('Cannot rest a player who is on court')
    const restPlayingRes = await fetch(`${BASE}/queue/${entries[0].id}/status`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'resting' })
    })
    assert.equal(restPlayingRes.status, 409, 'Expected 409 when resting a playing entry')
    const restPlayingBody = await restPlayingRes.json()
    assert.equal(restPlayingBody.error, 'Cannot rest a player who is on court')

    // 2) PATCH /api/queue/:id/status with { status: 'waiting' } on a 'playing' entry -> 409 ('Player must finish the match first')
    const waitPlayingRes = await fetch(`${BASE}/queue/${entries[0].id}/status`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'waiting' })
    })
    assert.equal(waitPlayingRes.status, 409, 'Expected 409 when setting a playing entry to waiting')
    const waitPlayingBody = await waitPlayingRes.json()
    assert.equal(waitPlayingBody.error, 'Player must finish the match first')

    // 3) Check in 4 more players, create a slated match with them (POST /api/matches/slate), then PATCH /api/queue/:id/status with { status: 'resting' } on one of the 'staged' entries -> 409 ('Cannot rest a player drafted into a slated match')
    for (let i = 2; i < 6; i++) {
      const p = (await fetch(`${BASE}/players`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: `MetricsP${i}-${SUFFIX}`, skill_level: 'intermediate' })
      }).then(r => r.json())).player
      const e = (await fetch(`${BASE}/sessions/${session.id}/checkin`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ player_id: p.id })
      }).then(r => r.json())).entry
      entries.push(e)
    }

    const slateRes = await fetch(`${BASE}/matches/slate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        session_id: session.id,
        team1_p1: entries[2].id,
        team1_p2: entries[3].id,
        team2_p1: entries[4].id,
        team2_p2: entries[5].id
      })
    })
    assert.equal(slateRes.status, 201, 'Expected 201 when creating slated match')

    const restStagedRes = await fetch(`${BASE}/queue/${entries[2].id}/status`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'resting' })
    })
    assert.equal(restStagedRes.status, 409, 'Expected 409 when resting a staged entry')
    const restStagedBody = await restStagedRes.json()
    assert.equal(restStagedBody.error, 'Cannot rest a player drafted into a slated match')

    // 4) End the active match on Court 1, then PATCH /api/queue/:id/status { status: 'resting' } on a 'waiting' entry -> 200, and PATCH /api/queue/:id/status { status: 'waiting' } on that 'resting' entry -> 200
    const endMatchRes = await fetch(`${BASE}/matches/${match.id}/end`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ team1_score: 21, team2_score: 18 })
    })
    assert.equal(endMatchRes.status, 200, 'Expected 200 when ending active match')

    const restWaitingRes = await fetch(`${BASE}/queue/${entries[0].id}/status`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'resting' })
    })
    assert.equal(restWaitingRes.status, 200, 'Expected 200 when resting a waiting entry')
    const restWaitingBody = await restWaitingRes.json()
    assert.equal(restWaitingBody.entry.status, 'resting')

    const wakeRestingRes = await fetch(`${BASE}/queue/${entries[0].id}/status`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'waiting' })
    })
    assert.equal(wakeRestingRes.status, 200, 'Expected 200 when waking a resting entry')
    const wakeRestingBody = await wakeRestingRes.json()
    assert.equal(wakeRestingBody.entry.status, 'waiting')
  } finally {
    // Clean up (end session)
    await fetch(`${BASE}/sessions/${session.id}/end`, { method: 'PATCH' })
  }

  console.log('metrics.test.js: all assertions passed')
}

run().catch(e => { console.error(e); process.exit(1) })
