// Run with: bun server/routes/automatch.test.js (server must be running on :3001)
import assert from 'node:assert/strict'

const BASE = process.env.BASE_URL ?? 'http://localhost:3991/api'
const SUFFIX = Date.now().toString(36)

async function mkSession(playerCount, courtCount, tag = "PlanP") {
  const session = (await fetch(`${BASE}/sessions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'AutomatchTest', scheduled_start: 1000, scheduled_end: 2000, court_count: courtCount })
  }).then(r => r.json())).session
  const entries = []
  for (let i = 0; i < playerCount; i++) {
    const p = (await fetch(`${BASE}/players`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: `${tag}${i}-${SUFFIX}`, skill_level: 'intermediate' })
    }).then(r => r.json())).player
    const e = (await fetch(`${BASE}/sessions/${session.id}/checkin`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ player_id: p.id })
    }).then(r => r.json())).entry
    entries.push(e)
  }
  await fetch(`${BASE}/sessions/${session.id}/start`, { method: 'PATCH' })
  return session
}

async function snap() {
  const r = await fetch(`${BASE}/sse`)
  const reader = r.body.getReader()
  const chunk = new TextDecoder().decode((await reader.read()).value)
  await reader.cancel()
  return JSON.parse(chunk.split('\n').find(l => l.startsWith('data: ')).slice(6))
}

// dry_run / plan contract
async function planTests() {
  const session = await mkSession(12, 2)
  const post = body => fetch(`${BASE}/sessions/${session.id}/automatch`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  })
  try {
    const { courts } = await fetch(`${BASE}/sessions/${session.id}/courts`).then(r => r.json())
    const dry = await post({ dry_run: true })
    assert.equal(dry.status, 200)
    const { plan } = await dry.json()
    assert.deepEqual(plan.matches.map(m => m.court_id), courts.map(c => c.id))
    assert.equal(plan.slate.length, 1)
    for (const m of plan.matches) { assert.equal(m.format, 'doubles'); assert.equal(m.team1.length, 2); assert.equal(m.team2.length, 2) }
    let st = await snap()
    assert.equal(st.activeMatches.length, 0, 'dry run started nothing')
    assert.equal(st.slatedMatches.length, 0, 'dry run slated nothing')
    assert.equal(st.queue.filter(q => q.status === 'waiting').length, 12, 'dry run left everyone waiting')

    // stale plan -> 409, nothing written
    const victim = plan.matches[0].team1[0]
    await fetch(`${BASE}/queue/${victim}/status`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status: 'resting' }),
    })
    const staleRes = await post({ plan })
    assert.equal(staleRes.status, 409, 'stale plan rejected')
    assert.equal((await staleRes.json()).error, 'Queue changed — review and try again')
    assert.equal((await snap()).activeMatches.length, 0, 'stale plan wrote nothing')
    await fetch(`${BASE}/queue/${victim}/status`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status: 'waiting' }),
    })

    // run with the returned plan reproduces it exactly
    const plan2 = (await (await post({ dry_run: true })).json()).plan
    const run = await post({ plan: plan2 })
    assert.equal(run.status, 200)
    assert.deepEqual(await run.json(), { started: 2, slated: true, slated_count: 1 })
    st = await snap()
    for (const m of plan2.matches) {
      const am = st.activeMatches.find(x => x.court_number === m.court_id)
      assert.ok(am, 'planned court has a match')
      assert.deepEqual([am.team1_p1, am.team1_p2].filter(Boolean), m.team1)
      assert.deepEqual([am.team2_p1, am.team2_p2].filter(Boolean), m.team2)
    }
    const sl = st.slatedMatches[0]
    assert.deepEqual([sl.team1_p1, sl.team1_p2], plan2.slate[0].team1)
    assert.deepEqual([sl.team2_p1, sl.team2_p2], plan2.slate[0].team2)
    // re-running the now-stale plan is rejected
    assert.equal((await post({ plan: plan2 })).status, 409)
  } finally {
    await fetch(`${BASE}/sessions/${session.id}/end`, { method: 'PATCH' })
  }
}

// multiple slates / SLATE_CAP / slate_only
async function multiSlateTests() {
  const session = await mkSession(20, 1, "MultiP")
  const post = body => fetch(`${BASE}/sessions/${session.id}/automatch`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  })
  try {
    // 20 players, 1 court: 4 play, 16 left -> capped at 3 slates (12), 4 stay waiting
    const { plan } = await (await post({ dry_run: true })).json()
    assert.equal(plan.matches.length, 1)
    assert.equal(plan.slate.length, 3, 'cap of 3 slates planned')
    const all = [...plan.matches, ...plan.slate].flatMap(m => [...m.team1, ...m.team2])
    assert.equal(new Set(all).size, 16, 'no player planned twice')
    let st = await snap()
    assert.equal(st.slatedMatches.length, 0, 'dry run wrote nothing')

    // slate_only is honored even when the client plan carries court matches:
    // with the matches dropped there is nothing left to write → 409, the free
    // court stays free, nobody leaves the waiting queue
    const guard = await post({ plan: { matches: plan.matches, slate: [] }, slate_only: true })
    assert.equal(guard.status, 409, 'slate_only drops court matches → nothing to write')
    st = await snap()
    assert.equal(st.activeMatches.length, 0, 'slate_only never starts a court match')
    assert.equal(st.queue.filter(q => q.status === 'waiting').length, 20, 'slate_only left everyone waiting')

    // slate_only: no court starts, still capped
    const so = (await (await post({ dry_run: true, slate_only: true })).json()).plan
    assert.equal(so.matches.length, 0)
    assert.equal(so.slate.length, 3)

    // run slate_only plan: creates 3 slates, starts no match
    const r = await post({ plan: so, slate_only: true })
    assert.equal(r.status, 200)
    const rb = await r.json()
    assert.equal(rb.started, 0)
    assert.equal(rb.slated_count, 3)
    st = await snap()
    assert.equal(st.slatedMatches.length, 3)
    assert.equal(st.activeMatches.length, 0)
    assert.deepEqual(st.slatedMatches.map(m => m.slate_seq), [1, 2, 3])

    // existing slates count toward the cap: nothing more to plan, run -> 409
    const again = (await (await post({ dry_run: true, slate_only: true })).json()).plan
    assert.equal(again.slate.length, 0, 'cap includes existing slates')
    assert.equal((await post({ slate_only: true })).status, 409)

    // a plan that would exceed the cap is rejected as stale
    assert.equal((await post({ plan: { matches: [], slate: so.slate.slice(0, 1) } })).status, 409)
    // normal run fills the free court only (cap reached -> no extra slate)
    const full = await post({})
    assert.deepEqual(await full.json(), { started: 1, slated: false, slated_count: 0 })
  } finally {
    await fetch(`${BASE}/sessions/${session.id}/end`, { method: 'PATCH' })
  }
}

async function run() {
  // End any stray unended session first
  const active = await fetch(`${BASE}/sessions/active`).then(r => r.json())
  if (active.session) {
    await fetch(`${BASE}/sessions/${active.session.id}/end`, { method: 'PATCH' })
  }

  await planTests()
  await multiSlateTests()

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
    assert.deepEqual(autoBody1, { started: 2, slated: true, slated_count: 1 }, 'Expected { started: 2, slated: true }')

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
