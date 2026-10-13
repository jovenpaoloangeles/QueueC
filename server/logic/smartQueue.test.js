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

console.log('smartQueue.test.js: all assertions passed')
