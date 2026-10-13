// tests/global-setup.js
import { unlinkSync, existsSync } from 'fs'
import { execSync } from 'child_process'

const DB = '/tmp/queuec-test.db'

export default async function globalSetup() {
  // Wipe DB so fixture players seed fresh (avoids duplicate-name conflicts)
  for (const f of [DB, `${DB}-shm`, `${DB}-wal`]) {
    if (existsSync(f)) unlinkSync(f)
  }
  // Spin server briefly just to trigger db.js schema creation + player seed
  const proc = execSync(
    'node server/index.js &',
    {
      cwd: '/home/klodsjoven/QueueC',
      env: { ...process.env, DB_PATH: DB, PLAYERS_PATH: '/home/klodsjoven/QueueC/tests/fixtures/players.json', PORT: '3001' },
      shell: true,
    }
  )
  // Give server 1s to init DB, then kill it (webServer will restart it)
  await new Promise(r => setTimeout(r, 1200))
  execSync('pkill -f "node server/index.js" || true', { shell: true })
  await new Promise(r => setTimeout(r, 300))
}
