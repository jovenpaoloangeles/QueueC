import express from 'express'
import cors from 'cors'
import sessionsRouter from './routes/sessions.js'
import playersRouter from './routes/players.js'
import queueRouter from './routes/queue.js'
import matchesRouter from './routes/matches.js'
import statsRouter from './routes/stats.js'
import sseRouter, { broadcast } from './routes/sse.js'
import courtsRouter from './routes/courts.js'

const app = express()
app.use(cors())
app.use(express.json())

app.use('/api/sessions', sessionsRouter)
app.use('/api/players', playersRouter)
app.use('/api', queueRouter)
app.use('/api/matches', matchesRouter)
app.use('/api', statsRouter)
app.use('/api/sse', sseRouter)
app.use('/api', courtsRouter)

// Broadcast state every second for live timers
setInterval(broadcast, 1000)

app.listen(3001, () => console.log('Server running on :3001'))
