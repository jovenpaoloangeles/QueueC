import { execFileSync } from 'child_process'
import { readFileSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const DB = '/tmp/queuec-test.db'

export default async function globalSetup() {
  // Playwright boots the webServer BEFORE globalSetup, so the server already has
  // this file open — deleting it would leave the server writing to a deleted
  // inode while everything else sees a fresh empty DB. Wipe rows instead; the
  // server has already created the schema and seeded fixture players.
  const fixture = JSON.parse(readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'fixtures/players.json'), 'utf8'))
  const keep = fixture.map(p => `'${p.name.replace(/'/g, "''")}'`).join(',')
  const sql = `
    DELETE FROM matches;
    DELETE FROM courts;
    DELETE FROM queue_entries;
    DELETE FROM sessions;
    DELETE FROM players WHERE name NOT IN (${keep});
  `
  execFileSync('bun', ['-e', `import { Database } from 'bun:sqlite'; const db = new Database(${JSON.stringify(DB)}); db.exec(${JSON.stringify(sql)}); db.close();`])
}
