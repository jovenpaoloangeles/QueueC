import { useState, useEffect } from 'react'
import { cn, SKILL_BADGE } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { checkinPlayer, getPlayers, startSession, addCourt, deleteCourt, updateCourt } from '../api.js'

const fmtTimeInput = ts => {
  if (!ts) return ''
  const d = new Date(ts * 1000)
  return `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`
}

const timeToUnix = (dateRef, timeStr) => {
  const dateStr = new Date(dateRef * 1000).toISOString().split('T')[0]
  return Math.floor(new Date(`${dateStr}T${timeStr}`).getTime() / 1000)
}

const fmtTime = ts =>
  ts ? new Date(ts * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '—'

function SkillChip({ level }) {
  return (
    <Badge className={cn('border-0 text-2xs', SKILL_BADGE[level] ?? SKILL_BADGE.intermediate)}>
      {level?.replace('_', ' ') ?? ''}
    </Badge>
  )
}

export default function SetupScreen({ session, queue, courts }) {
  const [players, setPlayers] = useState([])
  const [loading, setLoading] = useState(true)
  const [fetchError, setFetchError] = useState(false)
  const [starting, setStarting] = useState(false)

  function loadPlayers() {
    setLoading(true)
    setFetchError(false)
    return getPlayers()
      .then(d => setPlayers(d.players))
      .catch(() => setFetchError(true))
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    loadPlayers()
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
          <CardTitle className="text-lg">Session Setup</CardTitle>
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
            {!loading && fetchError && (
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground">Couldn&apos;t load players.</span>
                <Button variant="outline" size="xs" onClick={loadPlayers}>Retry</Button>
              </div>
            )}
            {!loading && !fetchError && pool.length === 0 && (
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

          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <span className="text-sm font-semibold text-foreground">Courts</span>
              <Button
                variant="outline"
                size="xs"
                onClick={() => addCourt(session.id, `Court ${courts.length + 1}`).catch(() => {})}
              >
                + Add Court
              </Button>
            </div>
            {courts.length === 0 && (
              <span className="text-xs text-muted-foreground">No courts yet.</span>
            )}
            <div className="flex flex-col gap-2">
              {courts.map(c => (
                <div
                  key={c.id}
                  className="flex items-center gap-3 rounded-md border border-border bg-muted/30 px-3 py-2 text-sm"
                >
                  <span className="min-w-[64px] font-medium text-foreground">{c.label}</span>
                  <div className="flex items-center gap-1 text-xs text-muted-foreground">
                    <input
                      type="time"
                      className="rounded border border-border bg-background px-1 py-0.5 text-xs"
                      value={fmtTimeInput(c.active_from)}
                      placeholder={fmtTimeInput(session.scheduled_start)}
                      onChange={e => updateCourt(c.id, {
                        active_from: e.target.value ? timeToUnix(session.scheduled_start, e.target.value) : null
                      }).catch(() => {})}
                    />
                    <span>–</span>
                    <input
                      type="time"
                      className="rounded border border-border bg-background px-1 py-0.5 text-xs"
                      value={fmtTimeInput(c.active_until)}
                      placeholder={fmtTimeInput(session.scheduled_end)}
                      onChange={e => updateCourt(c.id, {
                        active_until: e.target.value ? timeToUnix(session.scheduled_start, e.target.value) : null
                      }).catch(() => {})}
                    />
                  </div>
                  <label className="flex items-center gap-1 text-xs text-muted-foreground">
                    <input
                      type="checkbox"
                      checked={!!c.enabled}
                      onChange={e => updateCourt(c.id, { enabled: e.target.checked ? 1 : 0 }).catch(() => {})}
                    />
                    On
                  </label>
                  <Button
                    variant="ghost"
                    size="xs"
                    className="ml-auto text-destructive hover:text-destructive"
                    onClick={() => deleteCourt(c.id).catch(() => {})}
                  >
                    Remove
                  </Button>
                </div>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
