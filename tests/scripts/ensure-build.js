// Skip the client build when client/dist is newer than every source file.
// Runs as the Playwright globalSetup (tests/playwright.config.js) so a direct
// `bunx playwright test` can't run against a stale dist — a stale bundle looks
// like 16 false failures, not like a build problem. Also runnable directly:
//   bun scripts/ensure-build.js
import { statSync, readdirSync, existsSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath, pathToFileURL } from 'url'
import { spawnSync } from 'child_process'

const client = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'client')
const newest = (dir) => readdirSync(dir, { withFileTypes: true }).reduce((m, e) => {
  const p = join(dir, e.name)
  return Math.max(m, e.isDirectory() ? newest(p) : statSync(p).mtimeMs)
}, 0)
const inputs = ['src', 'public'].map(d => join(client, d)).filter(existsSync).map(newest)
for (const f of ['index.html', 'package.json', 'vite.config.js', 'vite.config.ts']) {
  if (existsSync(join(client, f))) inputs.push(statSync(join(client, f)).mtimeMs)
}

export function ensureBuild() {
  const dist = join(client, 'dist', 'index.html')
  if (existsSync(dist) && statSync(dist).mtimeMs >= Math.max(...inputs)) {
    console.log('[ensure-build] client/dist up to date, skipping build')
    return 0
  }
  console.log('[ensure-build] building client…')
  return spawnSync('bun', ['run', 'build'], { cwd: client, stdio: 'inherit' }).status ?? 1
}

export default () => {
  const status = ensureBuild()
  if (status !== 0) throw new Error(`client build failed (exit ${status})`)
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exit(ensureBuild())
}
