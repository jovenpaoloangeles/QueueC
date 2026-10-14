import { createRequire } from 'module'
import { readFileSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const require = createRequire(import.meta.url)
const Database = require(join(dirname(fileURLToPath(import.meta.url)), '../server/node_modules/better-sqlite3'))

const DB = '/tmp/queuec-test.db'

export default async function globalSetup() {
  // Playwright boots the webServer BEFORE globalSetup, so the server already has
  // this file open — deleting it would leave the server writing to a deleted
  // inode while everything else sees a fresh empty DB. Wipe rows instead; the
  // server has already created the schema and seeded fixture players.
  const db = new Database(DB)
  const fixture = JSON.parse(readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'fixtures/players.json'), 'utf8'))
  const keep = fixture.map(p => `'${p.name.replace(/'/g, "''")}'`).join(',')
  db.exec(`
    DELETE FROM matches;
    DELETE FROM courts;
    DELETE FROM queue_entries;
    DELETE FROM sessions;
    DELETE FROM players WHERE name NOT IN (${keep});
  `)
  db.close()
}
