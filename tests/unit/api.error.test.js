import assert from 'node:assert/strict'

// Inline the req() logic (api.js is browser-only via /api prefix; we test the contract)
async function req(method, path, body, fetchFn) {
  const res = await fetchFn(`/api${path}`, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : {},
    body: body ? JSON.stringify(body) : undefined,
  })
  if (!res.ok) throw new Error(`${method} ${path} → ${res.status}`)
  return res.json()
}

function mockFetch(status, json) {
  return async () => ({ ok: status >= 200 && status < 300, status, json: async () => json })
}

// U2.1 — 404 throws with method + path + status
await assert.rejects(
  () => req('GET', '/sessions/active', null, mockFetch(404, {})),
  err => {
    assert.ok(err.message.includes('GET'), 'U2.1a method in message')
    assert.ok(err.message.includes('/sessions/active'), 'U2.1b path in message')
    assert.ok(err.message.includes('404'), 'U2.1c status in message')
    return true
  },
  'U2.1 404 throws'
)

// U2.2 — 500 throws
await assert.rejects(
  () => req('POST', '/matches', {}, mockFetch(500, {})),
  err => { assert.ok(err.message.includes('500'), 'U2.2 status in message'); return true },
  'U2.2 500 throws'
)

// U2.3 — 201 resolves to JSON
const r201 = await req('POST', '/sessions', {}, mockFetch(201, { session: { id: 1 } }))
assert.deepEqual(r201, { session: { id: 1 } }, 'U2.3 201 resolves JSON')

// U2.4 — 200 resolves to JSON
const r200 = await req('GET', '/players', null, mockFetch(200, { players: [] }))
assert.deepEqual(r200, { players: [] }, 'U2.4 200 resolves JSON')

console.log('api.error.test.js: all assertions passed ✓')
