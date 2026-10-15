// Run with: bun server/routes/slate.test.js (server must be running on :3001)
import assert from 'node:assert/strict'

const BASE = process.env.BASE_URL ?? 'http://localhost:3001/api'
const SUFFIX = Date.now().toString(36)

// Read the current SSE state snapshot (first message on connect)
async function readState() {
  const res = await fetch(`${BASE}/sse`)
  const reader = res.body.getReader()
  const chunk = new TextDecoder().decode((await reader.read()).value)
  await reader.cancel()
  const dataLine = chunk.split('\n').find(l => l.startsWith('data: '))
  return JSON.parse(dataLine.slice(6))
}

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
  for (let i = 0; i < 8; i++) {
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

  const [e0, e1, e2, e3, e4, e5, e6, e7] = entries

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

    // 6b) Substitution: a 5th player checks in and swaps into the slated match
    const subPlayer = (await fetch(`${BASE}/players`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: `SlateSub-${SUFFIX}`, skill_level: 'intermediate' })
    }).then(r => r.json())).player
    const subEntry = (await fetch(`${BASE}/sessions/${session.id}/checkin`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ player_id: subPlayer.id })
    }).then(r => r.json())).entry
    assert.equal(subEntry.status, 'waiting', 'Expected freshly checked-in entry to be waiting')

    // Entry that belongs to a *different* session → 400 naming the entry as unavailable
    const otherSession = (await fetch(`${BASE}/sessions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'SlateOther', scheduled_start: 1000, scheduled_end: 2000, court_count: 1 })
    }).then(r => r.json())).session
    const foreignPlayer = (await fetch(`${BASE}/players`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: `SlateForeign-${SUFFIX}`, skill_level: 'intermediate' })
    }).then(r => r.json())).player
    const foreignEntry = (await fetch(`${BASE}/sessions/${otherSession.id}/checkin`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ player_id: foreignPlayer.id })
    }).then(r => r.json())).entry

    const foreignRes = await fetch(`${BASE}/matches/${slate.id}/slate`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ team1_p1: e2.id, team1_p2: e3.id, team2_p1: e0.id, team2_p2: foreignEntry.id })
    })
    assert.equal(foreignRes.status, 400, 'Expected 400 when entry belongs to another session')
    const foreignBody = await foreignRes.json()
    assert.ok(String(foreignBody.error).includes(String(foreignEntry.id)), `Expected error to name entry ${foreignEntry.id}, got: ${foreignBody.error}`)
    assert.match(foreignBody.error, /not available/, 'Expected "not available" error message')
    await fetch(`${BASE}/sessions/${otherSession.id}/end`, { method: 'PATCH' })

    // Empty slot (one null) → 400
    const nullRes = await fetch(`${BASE}/matches/${slate.id}/slate`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ team1_p1: e2.id, team1_p2: null, team2_p1: e0.id, team2_p2: e1.id })
    })
    assert.equal(nullRes.status, 400, 'Expected 400 when a slot is null')
    assert.match((await nullRes.json()).error, /A slate needs exactly 4 players/, 'Expected exactly-4-players error message')

    // Duplicate id across slots → 400
    const dupPatchRes = await fetch(`${BASE}/matches/${slate.id}/slate`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ team1_p1: e2.id, team1_p2: e2.id, team2_p1: e0.id, team2_p2: e1.id })
    })
    assert.equal(dupPatchRes.status, 400, 'Expected 400 on duplicate entry in PATCH slate')
    assert.match((await dupPatchRes.json()).error, /duplicate entry in team slots/, 'Expected duplicate error message')

    // Now the real substitution: swap staged e3 out for the waiting subEntry
    const beforeSub = await readState()
    const maxSortBefore = Math.max(0, ...beforeSub.queue.map(q => q.sort_order))

    const subRes = await fetch(`${BASE}/matches/${slate.id}/slate`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ team1_p1: e2.id, team1_p2: subEntry.id, team2_p1: e0.id, team2_p2: e1.id })
    })
    assert.equal(subRes.status, 200, `Expected 200 on substitution PATCH, got ${subRes.status}`)
    const { slate: subbed } = await subRes.json()
    assert.equal(subbed.team1_p1, e2.id, 'Expected team1_p1 to stay e2.id')
    assert.equal(subbed.team1_p2, subEntry.id, 'Expected team1_p2 to become the substitute')
    assert.equal(subbed.team2_p1, e0.id, 'Expected team2_p1 to stay e0.id')
    assert.equal(subbed.team2_p2, e1.id, 'Expected team2_p2 to stay e1.id')

    // Removed entry is waiting again, appended after the current MAX(sort_order)
    const afterSub = await readState()
    const returned = afterSub.queue.find(q => q.id === e3.id)
    assert.ok(returned, 'Expected substituted-out entry back in the queue')
    assert.equal(returned.status, 'waiting', 'Expected substituted-out entry status waiting')
    assert.ok(returned.sort_order > maxSortBefore,
      `Expected sort_order ${returned.sort_order} to exceed previous max ${maxSortBefore}`)

    // Added entry is staged: the server refuses to rest a player drafted into a slated match
    const stagedProbe = await fetch(`${BASE}/queue/${subEntry.id}/status`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'resting' })
    })
    assert.equal(stagedProbe.status, 409, 'Expected 409 — substituted-in entry is staged into the slate')
    assert.match((await stagedProbe.json()).error, /drafted into a slated match/, 'Expected staged/drafted error message')

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

    // 8) Auto-promotion on match end + finalization fields (shuttles, rating)
    const { courts } = await fetch(`${BASE}/sessions/${session.id}/courts`).then(r => r.json())
    const court1 = courts[0]

    // Create + start a match on Court 1 with [e0, e1, e2, e3]
    const activeMatchRes = await fetch(`${BASE}/matches`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        session_id: session.id,
        court_number: court1.id,
        team1_p1: e0.id,
        team1_p2: e1.id,
        team2_p1: e2.id,
        team2_p2: e3.id
      })
    })
    assert.equal(activeMatchRes.status, 201, 'Expected 201 when starting match on Court 1')
    const { match: activeMatch } = await activeMatchRes.json()

    // Create a slated match with [e4, e5, e6, e7]
    const nextSlateRes = await fetch(`${BASE}/matches/slate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        session_id: session.id,
        team1_p1: e4.id,
        team1_p2: e5.id,
        team2_p1: e6.id,
        team2_p2: e7.id
      })
    })
    assert.equal(nextSlateRes.status, 201, 'Expected 201 when creating slated match')
    const { slate: nextSlate } = await nextSlateRes.json()

    // Try PATCH /matches/:id/end with invalid rating: 9 → 400
    const badRatingRes = await fetch(`${BASE}/matches/${activeMatch.id}/end`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        team1_score: 21,
        team2_score: 15,
        rating: 9
      })
    })
    assert.equal(badRatingRes.status, 400, 'Expected 400 on invalid rating 9')

    // Negative score → 400 (typed inputs bypass min/max client-side)
    const badScoreRes = await fetch(`${BASE}/matches/${activeMatch.id}/end`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ team1_score: -1, team2_score: 15 })
    })
    assert.equal(badScoreRes.status, 400, 'Expected 400 on negative team1_score')

    // Negative shuttle count → 400
    const badShuttleRes = await fetch(`${BASE}/matches/${activeMatch.id}/end`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ team1_score: 21, team2_score: 15, new_shuttles: -2 })
    })
    assert.equal(badShuttleRes.status, 400, 'Expected 400 on negative new_shuttles')

    // PATCH /matches/:id/end with valid finalization fields → 200
    const endRes = await fetch(`${BASE}/matches/${activeMatch.id}/end`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        team1_score: 21,
        team2_score: 15,
        new_shuttles: 2,
        used_shuttles: 1,
        rating: 4
      })
    })
    assert.equal(endRes.status, 200, 'Expected 200 on valid match end')
    const { match: endedMatch } = await endRes.json()
    assert.equal(endedMatch.new_shuttles, 2, 'Expected new_shuttles === 2')
    assert.equal(endedMatch.used_shuttles, 1, 'Expected used_shuttles === 1')
    assert.equal(endedMatch.rating, 4, 'Expected rating === 4')

    // Verify auto-promotion via SSE state (or DB state)
    const sseRes = await fetch(`${BASE}/sse`)
    const reader = sseRes.body.getReader()
    const chunk = new TextDecoder().decode((await reader.read()).value)
    await reader.cancel()
    const dataLine = chunk.split('\n').find(l => l.startsWith('data: '))
    const state = JSON.parse(dataLine.slice(6))

    assert.equal(state.slatedMatches.length, 0, 'Expected no slated matches remaining')
    const promoted = state.activeMatches.find(m => m.id === nextSlate.id)
    assert.ok(promoted, 'Expected slated match to be promoted to activeMatches')
    assert.equal(promoted.state, 'active', 'Expected promoted match state === active')
    assert.equal(promoted.court_number, court1.id, 'Expected promoted match court_number === court1.id')
    assert.ok(promoted.started_at > 0, 'Expected promoted match started_at > 0')
    assert.equal(promoted.slate_seq, null, 'Expected promoted match slate_seq === null')

    for (const eid of [e4.id, e5.id, e6.id, e7.id]) {
      const qEntry = state.queue.find(q => q.id === eid)
      assert.ok(qEntry, `Expected entry ${eid} in queue`)
      assert.equal(qEntry.status, 'playing', `Expected entry ${eid} status === playing`)
    }

    // 10) reorder + lowest-seq auto-promotion
    const mk = async ids => (await (await fetch(`${BASE}/matches/slate`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ session_id: session.id, team1_p1: ids[0], team1_p2: ids[1], team2_p1: ids[2], team2_p2: ids[3] }),
    })).json()).slate
    const sl = async () => {
      const reader = (await fetch(`${BASE}/sse`)).body.getReader()
      const chunk = new TextDecoder().decode((await reader.read()).value)
      await reader.cancel()
      return JSON.parse(chunk.split('\n').find(l => l.startsWith('data: ')).slice(6)).slatedMatches
    }
    const mv = (id, move) => fetch(`${BASE}/matches/${id}/slate`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ move }),
    })
    const ids4 = []
    for (let i = 0; i < 8; i++) {
      const p = (await fetch(`${BASE}/players`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: `SlateMv${i}-${SUFFIX}`, skill_level: 'intermediate' }) }).then(r => r.json())).player
      const e = (await fetch(`${BASE}/sessions/${session.id}/checkin`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ player_id: p.id }) }).then(r => r.json())).entry
      ids4.push(e.id)
    }
    const sA = await mk(ids4.slice(0, 4))
    const sB = await mk(ids4.slice(4))
    assert.ok(sB.slate_seq > sA.slate_seq, 'second slate gets a later seq')
    assert.equal((await mv(sA.id, 'up')).status, 400, 'first cannot move up')
    assert.equal((await mv(sB.id, 'down')).status, 400, 'last cannot move down')
    assert.equal((await mv(sB.id, 'up')).status, 200)
    let order = (await sl()).filter(x => [sA.id, sB.id].includes(x.id)).map(x => x.id)
    assert.deepEqual(order, [sB.id, sA.id], 'B now ahead of A')
    assert.equal((await mv(sB.id, 'down')).status, 200)
    order = (await sl()).filter(x => [sA.id, sB.id].includes(x.id)).map(x => x.id)
    assert.deepEqual(order, [sA.id, sB.id], 'swapped back')
  } finally {
    // 9) Clean up (end session)
    await fetch(`${BASE}/sessions/${session.id}/end`, { method: 'PATCH' })
  }

  console.log('slate.test.js: all assertions passed')
}

run().catch(e => { console.error(e); process.exit(1) })
