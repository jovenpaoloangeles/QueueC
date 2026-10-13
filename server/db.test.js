import db from './db.js'

// Verify all tables exist
const tables = db.prepare(
  "SELECT name FROM sqlite_master WHERE type='table'"
).all().map(r => r.name)

console.assert(tables.includes('players'), 'players table missing')
console.assert(tables.includes('sessions'), 'sessions table missing')
console.assert(tables.includes('queue_entries'), 'queue_entries table missing')
console.assert(tables.includes('matches'), 'matches table missing')

// Verify FK constraint fires
try {
  db.prepare("INSERT INTO queue_entries (session_id, player_id, checked_in_at) VALUES (999, 999, 1)").run()
  console.assert(false, 'FK constraint should have thrown')
} catch (e) {
  console.assert(e.message.includes('FOREIGN KEY'), `Expected FK error, got: ${e.message}`)
}

console.log('db.test.js: all assertions passed')
