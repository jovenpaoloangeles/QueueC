// Boots a throwaway server (temp DB, fixture players) and runs the API-level
// regression scripts against it — so `bun run test:server` can never write to
// whatever happens to be listening on :3001 (the live container here).
import { spawn } from 'child_process'
import { rmSync } from 'fs'
import { tmpdir } from 'os'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const here = dirname(fileURLToPath(import.meta.url))
const root = join(here, '../..')
const db = join(tmpdir(), `queuec-server-tests-${process.pid}.db`)
const rmDb = () => ['', '-wal', '-shm'].forEach(s => rmSync(db + s, { force: true }))
rmDb()

const PORT = 3991
const server = spawn('bun', ['server/index.js'], {
  cwd: root,
  stdio: 'ignore',
  env: { ...process.env, DB_PATH: db, PLAYERS_PATH: join(root, 'tests/fixtures/players.json'), NODE_ENV: 'test', PORT: String(PORT) },
})
const BASE = `http://localhost:${PORT}`
const deadline = Date.now() + 30000
for (;;) {
  try { if ((await fetch(`${BASE}/api/sessions/active`)).ok) break } catch {}
  if (server.exitCode !== null) throw new Error('server exited early')
  if (Date.now() > deadline) { server.kill(); rmDb(); throw new Error('server start timeout') }
  await new Promise(r => setTimeout(r, 100))
}

let code = 0
for (const f of ['server/routes/two-match-end.test.js', 'server/routes/court-stagger.test.js', 'server/routes/queue-remove.test.js']) {
  const r = Bun.spawnSync(['bun', join(root, f)], {
    cwd: root,
    env: { ...process.env, QC_TEST_BASE: BASE },
    stdout: 'inherit',
    stderr: 'inherit',
  })
  if (r.exitCode !== 0) code = r.exitCode ?? 1
}

server.kill()
rmDb()
process.exit(code)
