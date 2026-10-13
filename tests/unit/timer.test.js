import assert from 'node:assert/strict'

function computeTimers(serverTime, queue, activeMatches) {
  const waitSeconds = new Map()
  for (const e of queue ?? []) {
    if (e.status === 'waiting') {
      waitSeconds.set(e.id, Math.max(0, serverTime - e.checked_in_at - e.total_seconds_played))
    }
  }
  const playSeconds = new Map()
  for (const m of activeMatches ?? []) {
    playSeconds.set(m.id, Math.max(0, serverTime - m.started_at))
  }
  return { waitSeconds, playSeconds }
}

const now = 1000

// U3.1 — waiting player wait time
const { waitSeconds: w1 } = computeTimers(now,
  [{ id: 1, status: 'waiting', checked_in_at: 400, total_seconds_played: 0 }], [])
assert.equal(w1.get(1), 600, 'U3.1 wait = serverTime - checked_in_at - played')

// U3.2 — playing player not in waitSeconds
const { waitSeconds: w2 } = computeTimers(now,
  [{ id: 2, status: 'playing', checked_in_at: 300, total_seconds_played: 200 }], [])
assert.equal(w2.has(2), false, 'U3.2 playing player absent from waitSeconds')

// U3.3 — active match play time
const { playSeconds: p3 } = computeTimers(now, [], [{ id: 10, started_at: 900 }])
assert.equal(p3.get(10), 100, 'U3.3 play = serverTime - started_at')

// U3.4 — negative clamped to 0
const { waitSeconds: w4 } = computeTimers(100,
  [{ id: 3, status: 'waiting', checked_in_at: 50, total_seconds_played: 200 }], [])
assert.equal(w4.get(3), 0, 'U3.4 negative result clamped to 0')

// U3.5 — null/undefined handled gracefully
const { waitSeconds: w5, playSeconds: p5 } = computeTimers(now, null, undefined)
assert.equal(w5.size, 0, 'U3.5a null queue → empty map')
assert.equal(p5.size, 0, 'U3.5b undefined matches → empty map')

console.log('timer.test.js: all assertions passed ✓')
