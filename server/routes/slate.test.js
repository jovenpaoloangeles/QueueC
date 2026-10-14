// Run with: bun server/routes/slate.test.js (server must be running on :3001)
import assert from 'node:assert/strict'

const BASE = process.env.BASE_URL ?? 'http://localhost:3001/api'
const SUFFIX = Date.now().toString(36)

async function run() {
  // End any stray unended session first
  const active = await fetch(`${BASE}/sessions/active`).then(r => r.json())
  if (active.session) {
    await fetch(`${BASE}/sessions/${active.session.id}/end`, { method: 'PATCH' })
  }

  // 1) Create + start a session, create 5 players and check them in
  const session = (await fetch(`${BASE}/sessions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'SlateTest', scheduled_start: 1000, scheduled_end: 2000, court_count: 2 })
  }).then(r => r.json())).session

  await fetch(`${BASE}/sessions/${session.id}/start`, { method: 'PATCH' })

  const entries = []
  for (let i = 0; i < 5; i++) {
    const p = (await fetch(`${BASE}/players`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: `SlateP${i}-${SUFFIX}`, skill_level: 'intermediate' })
    }).then(r => r.json())).player
    const e = (await fetch(`${BASE}/sessions/${session.id}/checkin`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ player_id: p.id })
    }).then(r => r.json())).entry
    entries.push(e)
  }

  const [e0, e1, e2, e3, e4] = entries

  try {
    // 2) Duplicate player in POST /matches/slate → 400, error mentions duplicate entry in team slots
    const dupRes = await fetch(`${BASE}/matches/slate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        session_id: session.id,
        team1_p1: e0.id,
        team1_p2: e0.id,
        team2_p1: e1.id,
        team2_p2: e2.id
      })
    })
    assert.equal(dupRes.status, 400, 'Expected 400 on duplicate entry')
    const dupBody = await dupRes.json()
    assert.match(dupBody.error, /duplicate entry in team slots/, 'Expected duplicate error message')

    // 3) Fewer than 4 players → 400
    const fewerRes = await fetch(`${BASE}/matches/slate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        session_id: session.id,
        team1_p1: e0.id,
        team2_p1: e1.id
      })
    })
    assert.equal(fewerRes.status, 400, 'Expected 400 when fewer than 4 players')

    // 4) POST /matches/slate with [e0, e1, e2, e3] → 201
    const createRes = await fetch(`${BASE}/matches/slate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        session_id: session.id,
        team1_p1: e0.id,
        team1_p2: e1.id,
        team2_p1: e2.id,
        team2_p2: e3.id
      })
    })
    assert.equal(createRes.status, 201, 'Expected 201 on valid slate create')
    const { slate } = await createRes.json()
    assert.equal(slate.state, 'slated', 'Expected state slated')
    assert.equal(slate.court_number, null, 'Expected court_number null')
    assert.equal(slate.slate_seq, 1, 'Expected slate_seq 1')

    // 5) Attempting to slate again using e0 (which is now staged, not waiting) → 400 (is not waiting)
    const stagedRes = await fetch(`${BASE}/matches/slate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        session_id: session.id,
        team1_p1: e0.id,
        team1_p2: e1.id,
        team2_p1: e2.id,
        team2_p2: e4.id
      })
    })
    assert.equal(stagedRes.status, 400, 'Expected 400 when entry is already staged')
    const stagedBody = await stagedRes.json()
    assert.match(stagedBody.error, /is not waiting/, 'Expected is not waiting error message')

    // 6) PATCH /matches/:id/slate with rearranged [e2, e3, e0, e1] → 200, slate.team1_p1 === e2.id
    const patchRes = await fetch(`${BASE}/matches/${slate.id}/slate`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        team1_p1: e2.id,
        team1_p2: e3.id,
        team2_p1: e0.id,
        team2_p2: e1.id
      })
    })
    assert.equal(patchRes.status, 200, 'Expected 200 on PATCH slate')
    const { slate: patched } = await patchRes.json()
    assert.equal(patched.team1_p1, e2.id, 'Expected team1_p1 updated to e2.id')
    assert.equal(patched.team1_p2, e3.id, 'Expected team1_p2 updated to e3.id')
    assert.equal(patched.team2_p1, e0.id, 'Expected team2_p1 updated to e0.id')
    assert.equal(patched.team2_p2, e1.id, 'Expected team2_p2 updated to e1.id')

    // 7) DELETE /matches/:id/slate → 204. Verify entries are back to waiting and can be slated again
    const delRes = await fetch(`${BASE}/matches/${slate.id}/slate`, { method: 'DELETE' })
    assert.equal(delRes.status, 204, 'Expected 204 on DELETE slate')

    const suggestRes = await fetch(`${BASE}/sessions/${session.id}/suggest?mode=doubles`).then(r => r.json())
    assert.ok(suggestRes.suggestion, 'Expected suggestion available after entries returned to waiting')

    const reslateRes = await fetch(`${BASE}/matches/slate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        session_id: session.id,
        team1_p1: e0.id,
        team1_p2: e1.id,
        team2_p1: e2.id,
        team2_p2: e3.id
      })
    })
    assert.equal(reslateRes.status, 201, 'Expected 201 when slating again after cancel')
    const { slate: reslated } = await reslateRes.json()
    await fetch(`${BASE}/matches/${reslated.id}/slate`, { method: 'DELETE' })
  } finally {
    // 8) Clean up (end session)
    await fetch(`${BASE}/sessions/${session.id}/end`, { method: 'PATCH' })
  }

  console.log('slate.test.js: all assertions passed')
}

run().catch(e => { console.error(e); process.exit(1) })
