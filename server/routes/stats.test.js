// Run with: bun server/routes/stats.test.js (server must be running on :3001)
import assert from 'node:assert/strict'

const BASE = process.env.BASE_URL ?? 'http://localhost:3001/api'
const SUFFIX = Date.now().toString(36)

async function run() {
  // End any stray unended session first
  const active = await fetch(`${BASE}/sessions/active`).then(r => r.json())
  if (active.session) {
    await fetch(`${BASE}/sessions/${active.session.id}/end`, { method: 'PATCH' })
  }

  // 1) Create + start a session, create 5 unique players, check them in (+ 1 unplayed player to verify ordering)
  const session = (await fetch(`${BASE}/sessions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: `StatsTest-${SUFFIX}`,
      scheduled_start: 1000,
      scheduled_end: 2000,
      court_count: 2
    })
  }).then(r => r.json())).session

  try {
    const players = []
    const entries = []
    for (let i = 0; i < 5; i++) {
      const p = (await fetch(`${BASE}/players`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: `StatsP${i}-${SUFFIX}`, skill_level: 'intermediate' })
      }).then(r => r.json())).player
      players.push(p)

      const e = (await fetch(`${BASE}/sessions/${session.id}/checkin`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ player_id: p.id })
      }).then(r => r.json())).entry
      entries.push(e)
    }

    const neverPlayed = (await fetch(`${BASE}/players`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: `AAANeverPlayed-${SUFFIX}`, skill_level: 'beginner' })
    }).then(r => r.json())).player

    await fetch(`${BASE}/sessions/${session.id}/start`, { method: 'PATCH' })
    const { courts } = await fetch(`${BASE}/sessions/${session.id}/courts`).then(r => r.json())
    const court1 = courts[0]

    // Helper to play and end a match
    async function playAndEnd({ team1_p1, team1_p2, team2_p1, team2_p2, team1_score, team2_score, new_shuttles, used_shuttles }) {
      const startRes = await fetch(`${BASE}/matches`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          session_id: session.id,
          court_number: court1.id,
          team1_p1,
          team1_p2,
          team2_p1,
          team2_p2
        })
      })
      assert.equal(startRes.status, 201, 'Expected 201 starting match')
      const { match } = await startRes.json()

      const endRes = await fetch(`${BASE}/matches/${match.id}/end`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ team1_score, team2_score, new_shuttles, used_shuttles })
      })
      assert.equal(endRes.status, 200, 'Expected 200 ending match')
    }

    // 2) Play and end 3 matches with different scores and shuttle counts across those 5 players
    // Match 1: (P0, P1) beat (P2, P3) 21-15 (+6 / -6), shuttles: 2 new, 1 used
    await playAndEnd({
      team1_p1: entries[0].id,
      team1_p2: entries[1].id,
      team2_p1: entries[2].id,
      team2_p2: entries[3].id,
      team1_score: 21,
      team2_score: 15,
      new_shuttles: 2,
      used_shuttles: 1
    })

    // Match 2: (P0, P4) beat (P1, P2) 21-11 (+10 / -10), shuttles: 1 new, 2 used
    await playAndEnd({
      team1_p1: entries[0].id,
      team1_p2: entries[4].id,
      team2_p1: entries[1].id,
      team2_p2: entries[2].id,
      team1_score: 21,
      team2_score: 11,
      new_shuttles: 1,
      used_shuttles: 2
    })

    // Match 3: P3 beats P2 21-17 (+4 / -4), shuttles: 1 new, 0 used
    await playAndEnd({
      team1_p1: entries[3].id,
      team2_p1: entries[2].id,
      team1_score: 21,
      team2_score: 17,
      new_shuttles: 1,
      used_shuttles: 0
    })

    // 3) Fetch GET /api/sessions/:id/stats
    const statsRes = await fetch(`${BASE}/sessions/${session.id}/stats`)
    assert.equal(statsRes.status, 200, 'Expected 200 from GET /sessions/:id/stats')
    const { stats } = await statsRes.json()

    assert.equal(stats.player_count, 5, 'Expected player_count === 5')
    assert.equal(stats.match_count, 3, 'Expected match_count === 3')
    assert.deepEqual(stats.shuttles, { new: 4, used: 3 }, 'Expected shuttles to match total { new: 4, used: 3 }')

    assert.equal(stats.leaderboard.length, 5, 'Expected all 5 players who played in leaderboard')
    for (const row of stats.leaderboard) {
      for (const key of ['player_id', 'name', 'played', 'wins', 'losses', 'win_rate', 'point_diff']) {
        assert.ok(key in row, `Expected leaderboard row to have ${key}`)
      }
    }

    // Expected order:
    // P0: played 2, wins 2, losses 0, win_rate 100, point_diff +16
    // P4: played 1, wins 1, losses 0, win_rate 100, point_diff +10
    // P3: played 2, wins 1, losses 1, win_rate 50, point_diff -2
    // P1: played 2, wins 1, losses 1, win_rate 50, point_diff -4
    // P2: played 3, wins 0, losses 3, win_rate 0, point_diff -20
    assert.deepEqual(
      stats.leaderboard,
      [
        { player_id: players[0].id, name: players[0].name, played: 2, wins: 2, losses: 0, win_rate: 100, point_diff: 16 },
        { player_id: players[4].id, name: players[4].name, played: 1, wins: 1, losses: 0, win_rate: 100, point_diff: 10 },
        { player_id: players[3].id, name: players[3].name, played: 2, wins: 1, losses: 1, win_rate: 50, point_diff: -2 },
        { player_id: players[1].id, name: players[1].name, played: 2, wins: 1, losses: 1, win_rate: 50, point_diff: -4 },
        { player_id: players[2].id, name: players[2].name, played: 3, wins: 0, losses: 3, win_rate: 0, point_diff: -20 },
      ],
      'Expected leaderboard sorted by win_rate desc, then point_diff desc, then wins desc'
    )

    // 4) Fetch GET /api/players
    const playersRes = await fetch(`${BASE}/players`)
    assert.equal(playersRes.status, 200, 'Expected 200 from GET /players')
    const { players: allPlayers } = await playersRes.json()

    const firstNullIdx = allPlayers.findIndex(p => p.last_played_at === null)
    assert.ok(firstNullIdx > 0, 'Expected at least one played player before unplayed players')

    for (const p of players) {
      const idx = allPlayers.findIndex(ap => ap.id === p.id)
      assert.ok(idx !== -1, `Expected player ${p.name} in GET /api/players`)
      const found = allPlayers[idx]
      assert.ok(found.last_played_at != null, `Expected ${p.name} to have last_played_at != null`)
      assert.ok(found.games_total > 0, `Expected ${p.name} to have games_total > 0`)
      if (firstNullIdx !== -1) {
        assert.ok(idx < firstNullIdx, `Expected played player ${p.name} to appear before any player with last_played_at === null`)
      }
    }

    const neverFound = allPlayers.find(ap => ap.id === neverPlayed.id)
    assert.ok(neverFound, 'Expected neverPlayed player in GET /api/players')
    assert.equal(neverFound.last_played_at, null, 'Expected neverPlayed.last_played_at === null')
    assert.equal(neverFound.games_total, 0, 'Expected neverPlayed.games_total === 0')

    // 5) rested_seconds must not inflate avg wait (isolated session, single waiter)
    const restPlayer = (await fetch(`${BASE}/players`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: `StatsRest-${SUFFIX}`, skill_level: 'beginner' })
    }).then(r => r.json())).player

    const restSession = (await fetch(`${BASE}/sessions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: `StatsRestSession-${SUFFIX}`, scheduled_start: 1000, scheduled_end: 2000, court_count: 1 })
    }).then(r => r.json())).session
    const restCheckin = (await fetch(`${BASE}/sessions/${restSession.id}/checkin`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ player_id: restPlayer.id })
    }).then(r => r.json())).entry
    await fetch(`${BASE}/queue/${restCheckin.id}/status`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'resting' })
    })
    await new Promise(r => setTimeout(r, 2000))
    await fetch(`${BASE}/queue/${restCheckin.id}/status`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'waiting' })
    })

    const restStatsRes = await fetch(`${BASE}/sessions/${restSession.id}/stats`)
    assert.equal(restStatsRes.status, 200, 'Expected 200 from rest-session stats')
    const { stats: restStats } = await restStatsRes.json()
    const nowRef = Math.floor(Date.now() / 1000)
    assert.ok(
      restStats.avg_wait_seconds <= nowRef - restCheckin.checked_in_at - 1,
      `Expected rested time (>=2s) subtracted from avg wait: avg=${restStats.avg_wait_seconds}, upper bound=${nowRef - restCheckin.checked_in_at - 1}`
    )
    await fetch(`${BASE}/sessions/${restSession.id}/end`, { method: 'PATCH' })
  } finally {
    // 5) Clean up in try / finally
    await fetch(`${BASE}/sessions/${session.id}/end`, { method: 'PATCH' })
  }

  console.log('stats.test.js: all assertions passed')
}

run().catch(e => { console.error(e); process.exit(1) })
