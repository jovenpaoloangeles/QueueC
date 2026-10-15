// Regression: a new check-in slots into ALPHABETICAL POSITION among the current
// WAITING entries — not appended to the end. Playing entries do not participate
// in the comparison (an insert lands relative to waiting entries only).
// Run with: bun server/routes/alphabetical-insert.test.js (server must be running on :3001)
import assert from 'node:assert/strict'

const BASE = process.env.QC_TEST_BASE ?? 'http://localhost:3991'

async function api(path, method = 'GET', body) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : {},
    body: body ? JSON.stringify(body) : undefined,
  })
  if (!res.ok) throw new Error(`${method} ${path} → ${res.status}: ${await res.text()}`)
  return res.json()
}

/** First SSE state frame — the only API surface that exposes queue order. */
async function queueNames() {
  const res = await fetch(`${BASE}/api/sse`)
  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buf = ''
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buf += decoder.decode(value, { stream: true })
    const m = buf.match(/data: (.+)\n\n/)
    if (m) {
      reader.cancel()
      return JSON.parse(m[1]).queue.map(e => e.name)
    }
  }
  throw new Error('no SSE state frame received')
}

async function main() {
  const players = (await api('/api/players')).players
  const byName = Object.fromEntries(players.map(p => [p.name, p]))
  const pick = n => {
    const p = byName[n]
    assert.ok(p, `fixture player missing: ${n}`)
    return p
  }

  const now = Math.floor(Date.now() / 1000)
  const { session } = await api('/api/sessions', 'POST', {
    name: 'AlphaInsert', court_count: 2, scheduled_start: now, scheduled_end: now + 7200,
  })
  await api(`/api/sessions/${session.id}/start`, 'PATCH')
  const entries = {}
  const checkin = async name => {
    const { entry } = await api(`/api/sessions/${session.id}/checkin`, 'POST', { player_id: pick(name).id })
    entries[name] = entry
  }

  // waiting [C1, D2]: "C2" slots in the middle, "B1" slots to the front
  await checkin('Inter C1')
  await checkin('Upper D2')
  await checkin('Inter C2')
  await checkin('Beginner B1')
  assert.deepEqual(await queueNames(), ['Beginner B1', 'Inter C1', 'Inter C2', 'Upper D2'])

  // checkin D1, D3; put D1 vs D3 on court — playing entries keep their spots
  await checkin('Upper D1')
  await checkin('Upper D3')
  await api('/api/matches', 'POST', {
    session_id: session.id, format: 'singles', court_number: 1,
    team1_p1: entries['Upper D1'].id, team2_p1: entries['Upper D3'].id,
  })

  // "C3" compares against WAITING entries only (B1, C1, C2, D2) → lands before
  // D2. If playing D1/D3 participated, it would slot before D1 instead.
  await checkin('Inter C3')
  assert.deepEqual(
    await queueNames(),
    ['Beginner B1', 'Inter C1', 'Inter C2', 'Upper D1', 'Inter C3', 'Upper D2', 'Upper D3']
  )

  // Manual reorder scrambles display order — insertion must scan DISPLAY order
  // (first waiting entry that sorts after the new name), not re-sort by name.
  // Reorder to put playing D1/D3 first, then scramble the waiting entries.
  const order = [
    entries['Upper D1'].id, entries['Upper D3'].id,
    entries['Inter C3'].id, entries['Inter C2'].id,
    entries['Beginner B1'].id, entries['Upper D2'].id, entries['Inter C1'].id,
  ]
  await api('/api/queue/order', 'PATCH', { session_id: session.id, order })
  // "Beginner B3": display scan over WAITING entries hits Inter C3 (name > B3)
  // first → B3 lands just before it (after the playing pair). Name-re-sorting
  // would instead find Inter C1's position and drop B3 at the tail.
  await checkin('Beginner B3')
  const names = await queueNames()
  assert.equal(names[2], 'Beginner B3', `B3 must slot before Inter C3 after scramble, got: ${names.join(', ')}`)

  // cleanup
  await api(`/api/sessions/${session.id}/end`, 'PATCH')
  console.log('alphabetical-insert.test.js: all assertions passed')
}

main().catch(e => { console.error(e); process.exit(1) })
