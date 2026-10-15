import { suggestPlayers } from './smartQueue.js'

const now = Math.floor(Date.now() / 1000)

const entries = [
  { id: 1, status: 'waiting', skill_level: 'intermediate', checked_in_at: now - 600, total_seconds_played: 0 },
  { id: 2, status: 'waiting', skill_level: 'beginner',     checked_in_at: now - 500, total_seconds_played: 0 },
  { id: 3, status: 'waiting', skill_level: 'advanced',     checked_in_at: now - 400, total_seconds_played: 0 },
  { id: 4, status: 'waiting', skill_level: 'intermediate', checked_in_at: now - 300, total_seconds_played: 0 },
  { id: 5, status: 'playing', skill_level: 'intermediate', checked_in_at: now - 999, total_seconds_played: 0 },
]

// Singles: top 2 waiters (ids 1, 2)
const singles = suggestPlayers(entries, 'singles')
console.assert(singles.length === 4, 'singles should return 4 slots')
console.assert(singles[0] === 1 && singles[2] === 2, `Expected ids 1,2 got ${singles}`)
console.assert(singles[1] === null && singles[3] === null, 'singles p2 slots should be null')

// Doubles: 4 players suggested, none playing
const doubles = suggestPlayers(entries, 'doubles')
console.assert(doubles.length === 4, 'doubles should return 4 ids')
console.assert(!doubles.includes(5), 'playing player should not be suggested')

// Not enough players
const short = suggestPlayers(entries.slice(0,1), 'singles')
console.assert(short.length === 0, 'should return [] when not enough players')

// 3rd team split [[a,d],[b,c]]: a=7 (prof), b=4 (inter), c=4 (inter), d=1 (newbie)
// Only [[a,d],[b,c]] balances avg skill (4 vs 4)
const splitEntries = [
  { id: 10, status: 'waiting', skill_level: 'professional', checked_in_at: now - 600, total_seconds_played: 0, games_played: 0 },
  { id: 11, status: 'waiting', skill_level: 'intermediate', checked_in_at: now - 500, total_seconds_played: 0, games_played: 0 },
  { id: 12, status: 'waiting', skill_level: 'intermediate', checked_in_at: now - 400, total_seconds_played: 0, games_played: 0 },
  { id: 13, status: 'waiting', skill_level: 'newbie',       checked_in_at: now - 300, total_seconds_played: 0, games_played: 0 },
]
const splitRes = suggestPlayers(splitEntries, 'doubles')
console.assert(
  (splitRes[0] === 10 && splitRes[1] === 13) || (splitRes[2] === 10 && splitRes[3] === 13),
  `Expected [[a,d],[b,c]] pairing (10+13 vs 11+12), got ${splitRes}`
)

// Fairness (games_played penalty): player with 0 games preferred over player with many games despite slightly shorter wait
const fairnessEntries = [
  { id: 20, status: 'waiting', skill_level: 'intermediate', checked_in_at: now - 400, total_seconds_played: 0, games_played: 3 },
  { id: 21, status: 'waiting', skill_level: 'intermediate', checked_in_at: now - 350, total_seconds_played: 0, games_played: 0 },
  { id: 22, status: 'waiting', skill_level: 'intermediate', checked_in_at: now - 340, total_seconds_played: 0, games_played: 0 },
  { id: 23, status: 'waiting', skill_level: 'intermediate', checked_in_at: now - 330, total_seconds_played: 0, games_played: 0 },
  { id: 24, status: 'waiting', skill_level: 'intermediate', checked_in_at: now - 320, total_seconds_played: 0, games_played: 0 },
]
const fairRes = suggestPlayers(fairnessEntries, 'doubles')
console.assert(!fairRes.includes(20), `Expected player 20 (3 games played) to yield to 0-game players, got ${fairRes}`)

// Rest no longer pauses wait (R7): a vestigial rested_seconds field is ignored,
// so the earlier check-in wins on raw wait
const restEntries = [
  { id: 30, status: 'waiting', skill_level: 'intermediate', checked_in_at: now - 500, total_seconds_played: 0, games_played: 0 },
  { id: 31, status: 'waiting', skill_level: 'intermediate', checked_in_at: now - 600, total_seconds_played: 0, games_played: 0, rested_seconds: 300 },
  { id: 32, status: 'waiting', skill_level: 'intermediate', checked_in_at: now - 400, total_seconds_played: 0, games_played: 0 },
  { id: 33, status: 'waiting', skill_level: 'intermediate', checked_in_at: now - 300, total_seconds_played: 0, games_played: 0 },
]
const restRes = suggestPlayers(restEntries, 'singles')
console.assert(restRes[0] === 31, `Expected 31 (checked in 600s ago, rested_seconds ignored) to take slot 1, got ${restRes}`)

console.log('smartQueue.test.js: all assertions passed')
