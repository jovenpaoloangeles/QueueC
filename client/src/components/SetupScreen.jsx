import { useState, useEffect } from 'react'
import { cn, SKILL_BADGE } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { checkinPlayer, getPlayers, startSession } from '../api.js'

const fmtTime = ts =>
  ts ? new Date(ts * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '—'

function SkillChip({ level }) {
  return (
    <Badge className={cn('border-0 text-2xs', SKILL_BADGE[level] ?? SKILL_BADGE.intermediate)}>
      {level?.replace('_', ' ') ?? ''}
    </Badge>
  )
}

export default function SetupScreen({ session, queue }) {
  const [players, setPlayers] = useState([])
  const [loading, setLoading] = useState(true)
  const [starting, setStarting] = useState(false)

  useEffect(() => {
    getPlayers()
      .then(d => setPlayers(d.players))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  const inQueue = new Set(queue.map(e => e.player_id))
  const pool = players.filter(p => !inQueue.has(p.id))
  const canStart = queue.length >= 2

  async function handleStart() {
    setStarting(true)
    try {
      await startSession(session.id)
    } catch {
      // SSE keeps the truth; re-enable the button to retry
    } finally {
      setStarting(false)
    }
  }

  return (
    <div className="flex flex-1 items-center justify-center overflow-y-auto p-4">
      <Card className="w-full max-w-xl border-border bg-card shadow-sm">
        <CardHeader className="gap-1">
          <CardTitle className="text-lg">{session.name}</CardTitle>
          <span className="text-2xs uppercase tracking-wider text-muted-foreground">
            {fmtTime(session.scheduled_start)}–{fmtTime(session.scheduled_end)} · {session.court_count} courts · Not started
          </span>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="flex items-center gap-3">
            <Button size="sm" disabled={!canStart || starting} onClick={handleStart}>
              {starting ? '...' : 'Start Session'}
            </Button>
            {!canStart && (
              <span className="text-xs text-muted-foreground">
                Add at least 2 players from the pool to start.
              </span>
            )}
          </div>

          <div className="flex flex-col gap-2">
            <span className="text-sm font-semibold text-foreground">Player pool</span>
            {loading && (
              <div className="flex flex-wrap gap-2">
                <Skeleton className="h-6 w-24" />
                <Skeleton className="h-6 w-20" />
                <Skeleton className="h-6 w-28" />
              </div>
            )}
            {!loading && pool.length === 0 && (
              <span className="text-xs text-muted-foreground">All registered players are in the queue.</span>
            )}
            <div className="flex flex-wrap gap-2">
              {pool.map(p => (
                <Button
                  key={p.id}
                  variant="outline"
                  size="xs"
                  onClick={() => checkinPlayer(session.id, p.id).catch(() => {})}
                >
                  {p.name}
                  <SkillChip level={p.skill_level} />
                </Button>
              ))}
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <span className="text-sm font-semibold text-foreground">
              Queue · <span className="font-mono tabular-nums">{queue.length}</span>
            </span>
            {queue.length === 0 && (
              <span className="text-xs text-muted-foreground">No players yet.</span>
            )}
            <ol className="flex flex-col gap-1">
              {queue.map((e, i) => (
                <li
                  key={e.id}
                  className="flex items-center gap-2 rounded-md border border-border bg-muted/30 px-3 py-1.5 text-sm"
                >
                  <span className="font-mono text-xs text-muted-foreground">{i + 1}</span>
                  <span className="font-medium text-foreground">{e.name}</span>
                  <SkillChip level={e.skill_level} />
                </li>
              ))}
            </ol>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
