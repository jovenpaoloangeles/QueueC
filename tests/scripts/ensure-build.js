// Skip the client build when client/dist is newer than every source file.
import { statSync, readdirSync, existsSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
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
const dist = join(client, 'dist', 'index.html')
if (existsSync(dist) && statSync(dist).mtimeMs >= Math.max(...inputs)) {
  console.log('[ensure-build] client/dist up to date, skipping build'); process.exit(0)
}
console.log('[ensure-build] building client…')
process.exit(spawnSync('bun', ['run', 'build'], { cwd: client, stdio: 'inherit' }).status ?? 1)
