import { useState, useEffect } from 'react'
import { cn, SKILL_BADGE } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { checkinPlayer, getPlayers, startSession, addCourt, deleteCourt, updateCourt, removeEntry } from '../api.js'

// Exact-hour slots spanning the session window (reservations are by the hour).
const hourSlots = session => {
  const out = []
  const start = new Date(session.scheduled_start * 1000)
  start.setMinutes(0, 0, 0)
  const end = new Date(session.scheduled_end * 1000)
  end.setMinutes(59, 59, 999)
  for (let t = start.getTime(); t <= end.getTime(); t += 3600 * 1000) {
    out.push(Math.floor(t / 1000))
  }
  return out
}

const fmtHour = ts =>
  `${String(new Date(ts * 1000).getHours()).padStart(2, '0')}:00`

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
  const [picked, setPicked] = useState([]) // pool player ids toggled for batch check-in

  function togglePick(id) {
    setPicked(p => p.includes(id) ? p.filter(x => x !== id) : [...p, id])
  }

  async function checkInPicked() {
    for (const id of picked) await checkinPlayer(session.id, id).catch(() => {})
    setPicked([])
  }

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
  const hours = hourSlots(session)

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
    <div className="flex flex-1 overflow-y-auto p-4">
      {/* m-auto not items-center: centered flex overflow clips the card's top under
          the header once the pool is tall, making top buttons unclickable */}
      <Card className="m-auto w-full max-w-xl border-border bg-card shadow-sm">
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
            <div className="flex items-center justify-between">
              <span className="text-sm font-semibold text-foreground">Player pool</span>
              <Button size="xs" disabled={picked.length === 0} onClick={checkInPicked}>
                Check In{picked.length > 0 ? ` (${picked.length})` : ''}
              </Button>
            </div>
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
            <div className="flex flex-wrap gap-2" data-testid="player-pool">
              {pool.map(p => (
                <Button
                  key={p.id}
                  variant={picked.includes(p.id) ? 'default' : 'outline'}
                  size="xs"
                  aria-pressed={picked.includes(p.id)}
                  onClick={() => togglePick(p.id)}
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
                  <Button
                    variant="ghost"
                    size="xs"
                    className="ml-auto h-5 w-5 p-0 text-muted-foreground"
                    aria-label={`Remove ${e.name}`}
                    onClick={() => removeEntry(e.id).catch(() => {})}
                  >
                    ×
                  </Button>
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
                    <select
                      aria-label={`${c.label} active from`}
                      className="rounded border border-border bg-background px-1 py-0.5 text-xs"
                      value={c.active_from ?? ''}
                      onChange={e => updateCourt(c.id, {
                        active_from: e.target.value === '' ? null : Number(e.target.value)
                      }).catch(() => {})}
                    >
                      <option value="">—</option>
                      {hours.map(t => (
                        <option key={t} value={t}>{fmtHour(t)}</option>
                      ))}
                    </select>
                    <span>–</span>
                    <select
                      aria-label={`${c.label} active until`}
                      className="rounded border border-border bg-background px-1 py-0.5 text-xs"
                      value={c.active_until ?? ''}
                      onChange={e => updateCourt(c.id, {
                        active_until: e.target.value === '' ? null : Number(e.target.value)
                      }).catch(() => {})}
                    >
                      <option value="">—</option>
                      {hours.map(t => (
                        <option key={t} value={t}>{fmtHour(t)}</option>
                      ))}
                    </select>
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
