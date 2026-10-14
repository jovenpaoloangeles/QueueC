import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { fileURLToPath } from 'url'
import { join, dirname } from 'path'
import { existsSync } from 'fs'
import sessionsRouter from './routes/sessions.js'
import playersRouter from './routes/players.js'
import queueRouter from './routes/queue.js'
import matchesRouter from './routes/matches.js'
import slateRouter from './routes/slate.js'
import statsRouter from './routes/stats.js'
import sseRouter, { broadcast } from './routes/sse.js'
import courtsRouter from './routes/courts.js'
import automatchRouter from './routes/automatch.js'

const app = new Hono()
app.use('*', cors())

app.route('/api/sessions', sessionsRouter)
app.route('/api/players', playersRouter)
app.route('/api', queueRouter)
app.route('/api', slateRouter)
app.route('/api/matches', matchesRouter)
app.route('/api', statsRouter)
app.route('/api/sse', sseRouter)
app.route('/api', courtsRouter)
app.route('/api', automatchRouter)

// Broadcast state every second for live timers
setInterval(broadcast, 1000)

const __dirname = dirname(fileURLToPath(import.meta.url))
const publicDir = existsSync(join(__dirname, '..', 'public'))
  ? join(__dirname, '..', 'public')
  : join(__dirname, '..', 'client', 'dist')

app.get('*', async (c) => {
  if (c.req.path.startsWith('/api')) return c.notFound()
  const reqPath = c.req.path === '/' ? '/index.html' : c.req.path
  const file = Bun.file(join(publicDir, reqPath))
  if (await file.exists()) {
    return new Response(file, {
      headers: file.type ? { 'Content-Type': file.type } : {}
    })
  }
  const index = Bun.file(join(publicDir, 'index.html'))
  if (await index.exists()) {
    return new Response(index, {
      headers: { 'Content-Type': 'text/html; charset=utf-8' }
    })
  }
  return c.notFound()
})

const PORT = Number(process.env.PORT ?? 3001)
Bun.serve({
  port: PORT,
  idleTimeout: 0,
  fetch: app.fetch,
})
console.log(`Server running on :${PORT}`)
