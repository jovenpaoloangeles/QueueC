import { useState, useEffect, useMemo } from 'react'
import { SKILL_TIERS } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import { useToast } from '@/components/Toast'
import PlayerSearchAdd, { SkillChip } from './PlayerSearchAdd.jsx'
import { createSession, endSession, checkinPlayer, getPlayers, startSession } from '../api.js'

const MAX_COURTS = 16
const DEFAULT_HOURS = '2'

const pad = n => String(n).padStart(2, '0')

// Default start time: now rounded UP to the next 15 minutes, as HH:MM (24h).
function defaultStartTime() {
  const d = new Date()
  const mins = Math.ceil((d.getHours() * 60 + d.getMinutes() + (d.getSeconds() > 0 ? 1 : 0)) / 15) * 15
  return `${pad(Math.floor(mins / 60) % 24)}:${pad(mins % 60)}`
}

function todayStr() {
  const d = new Date()
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

const validHours = h => {
  const n = Number(h)
  return h !== '' && Number.isFinite(n) && n >= 0.5 && n <= 12
}

// Returning players first (last_played_at DESC, never-played last), then name.
function byRecency(a, b) {
  const at = a.last_played_at ?? 0
  const bt = b.last_played_at ?? 0
  if ((at === 0) !== (bt === 0)) return at === 0 ? 1 : -1
  if (bt !== at) return bt - at
  return a.name.localeCompare(b.name)
}

const syncCourts = (prev, n) => {
  const next = prev.slice(0, n)
  while (next.length < n) next.push({ label: `Court ${next.length + 1}`, hours: DEFAULT_HOURS })
  return next
}

/**
 * Single-screen session setup (shown whenever there is no live session).
 * Nothing touches the server until "Start Session": create session →
 * check in each selected player → start. `draft` is a leftover un-started
 * session (legacy / failed earlier attempt) and is ended before creating.
 */
export default function SetupScreen({ draft }) {
  const toast = useToast()
  const [name, setName] = useState(() => `Session ${todayStr()}`)
  const [startTime, setStartTime] = useState(defaultStartTime)
  const [courtCount, setCourtCount] = useState('2')
  const [courts, setCourts] = useState(() => syncCourts([], 2))
  const [players, setPlayers] = useState([])
  const [loading, setLoading] = useState(true)
  const [fetchError, setFetchError] = useState(false)
  const [picked, setPicked] = useState([]) // selected player ids, click order = check-in order
  const [tierFilter, setTierFilter] = useState('') // '' = all tiers
  const [starting, setStarting] = useState(false)

  function loadPlayers() {
    setLoading(true)
    setFetchError(false)
    return getPlayers()
      .then(d => setPlayers(d.players))
      .catch(() => setFetchError(true))
      .finally(() => setLoading(false))
  }
  useEffect(() => { loadPlayers() }, [])

  function handleCourtCount(val) {
    setCourtCount(val)
    if (val === '') return
    const n = Math.max(1, Math.min(MAX_COURTS, parseInt(val, 10) || 1))
    setCourts(prev => syncCourts(prev, n))
  }
  const patchCourt = (i, patch) => setCourts(prev => prev.map((c, idx) => (idx === i ? { ...c, ...patch } : c)))

  const pool = useMemo(() => [...players].sort(byRecency), [players])
  const visiblePool = tierFilter ? pool.filter(p => p.skill_level === tierFilter) : pool
  // Selected ids can outlive their pool entry (e.g. player list refreshed) — count only live ones
  const activePicked = picked.filter(id => players.some(p => p.id === id))

  const togglePick = id => setPicked(p => (p.includes(id) ? p.filter(x => x !== id) : [...p, id]))
  const addPick = player => setPicked(p => (p.includes(player.id) ? p : [...p, player.id]))
  function toggleSelectAll() {
    const ids = visiblePool.map(p => p.id)
    if (ids.length === 0) return
    const all = ids.every(id => picked.includes(id))
    setPicked(prev => (all ? prev.filter(id => !ids.includes(id)) : [...new Set([...prev, ...ids])]))
  }

  const hoursOk = courts.every(c => validHours(c.hours))
  const timeOk = /^\d{2}:\d{2}$/.test(startTime)
  const canStart = activePicked.length >= 2 && courts.length >= 1 && hoursOk && timeOk && !starting

  async function handleStart() {
    if (!canStart) return
    setStarting(true)
    let createdId = null
    try {
      // an un-started leftover would otherwise shadow the new session
      if (draft?.id) await endSession(draft.id).catch(() => {})
      const [hh, mm] = startTime.split(':').map(Number)
      const startDate = new Date()
      startDate.setHours(hh, mm, 0, 0)
      const scheduledStart = Math.floor(startDate.getTime() / 1000)
      const maxHours = Math.max(...courts.map(c => Number(c.hours)))
      const { session } = await createSession({
        name: name.trim() || `Session ${todayStr()}`,
        scheduled_start: scheduledStart,
        scheduled_end: scheduledStart + Math.round(maxHours * 3600),
        court_count: courts.length,
        courts: courts.map((c, i) => ({
          label: c.label.trim() || `Court ${i + 1}`,
          duration_minutes: Math.round(Number(c.hours) * 60),
        })),
      })
      createdId = session.id
      for (const pid of activePicked) await checkinPlayer(createdId, pid)
      await startSession(createdId)
    } catch (err) {
      // no half-created state: end the session we just made, keep the form intact
      if (createdId != null) await endSession(createdId).catch(() => {})
      toast(err?.data?.error ?? 'Could not start session', 'error')
      setStarting(false)
    }
  }

  const fieldCls = 'h-8 text-xs'

  return (
    <div className="flex flex-1 overflow-y-auto p-4">
      {/* m-auto not items-center: centered flex overflow clips the content under the header */}
      <div className="m-auto flex w-full max-w-4xl flex-col gap-5" data-testid="session-setup">
        {/* Hero */}
        <div className="flex flex-col items-center gap-1.5 text-center">
          <div className="flex size-12 items-center justify-center rounded-2xl border border-primary/30 bg-primary/10 text-2xl" aria-hidden="true">🏸</div>
          <h1 className="text-2xl font-extrabold tracking-tight text-foreground">Session Setup</h1>
          <p className="max-w-lg text-xs text-muted-foreground">
            Configure courts and rental hours, pick your player pool, then start the session.
          </p>
        </div>

        <div className="grid items-start gap-4 md:grid-cols-2">
          {/* Card 1 — Court Configuration */}
          <Card className="border-border bg-card shadow-sm" data-testid="card-courts">
            <CardHeader className="pb-3">
              <CardTitle className="text-xs uppercase tracking-wider">1 · Court Configuration</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="setup-name">Session name</Label>
                <Input id="setup-name" className={fieldCls} value={name} onChange={e => setName(e.target.value)} />
              </div>
              <div className="flex gap-3">
                <div className="flex flex-1 flex-col gap-1.5">
                  <Label htmlFor="setup-start">Start time</Label>
                  <Input id="setup-start" type="time" className={fieldCls} value={startTime} onChange={e => setStartTime(e.target.value)} required />
                </div>
                <div className="flex flex-1 flex-col gap-1.5">
                  <Label htmlFor="setup-courts">Number of courts</Label>
                  <Input
                    id="setup-courts"
                    type="number"
                    min="1"
                    max={MAX_COURTS}
                    className={fieldCls}
                    value={courtCount}
                    onChange={e => handleCourtCount(e.target.value)}
                    onBlur={() => { if (courtCount === '') handleCourtCount('1') }}
                  />
                </div>
              </div>

              <div className="flex max-h-60 flex-col gap-2 overflow-y-auto pr-1" data-testid="court-rows">
                <span className="text-xs font-semibold text-foreground">Court rental (hours)</span>
                {courts.map((c, i) => (
                  <div key={i} className="flex items-center gap-2 rounded-md border border-border bg-muted/30 p-2 text-xs" data-testid="court-row">
                    <Input
                      type="text"
                      aria-label={`Court ${i + 1} label`}
                      className="h-7 flex-1 text-xs"
                      value={c.label}
                      onChange={e => patchCourt(i, { label: e.target.value })}
                    />
                    <Input
                      type="number"
                      step="0.5"
                      min="0.5"
                      max="12"
                      aria-label={`Court ${i + 1} hours`}
                      aria-invalid={!validHours(c.hours)}
                      className="h-7 w-20 text-center text-xs font-bold"
                      value={c.hours}
                      onChange={e => patchCourt(i, { hours: e.target.value })}
                      onBlur={() => { if (!validHours(c.hours)) patchCourt(i, { hours: DEFAULT_HOURS }) }}
                    />
                    <span className="text-2xs text-muted-foreground">hrs</span>
                  </div>
                ))}
              </div>
              <p className="text-2xs text-muted-foreground">
                Each court&apos;s timer runs for its hours from the moment you press Start Session, and can be extended live.
              </p>
            </CardContent>
          </Card>

          {/* Card 2 — Active Waiting Pool */}
          <Card className="border-border bg-card shadow-sm" data-testid="card-pool">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center justify-between text-xs uppercase tracking-wider">
                <span>2 · Active Waiting Pool</span>
                <span className="text-2xs font-semibold normal-case text-muted-foreground" data-testid="selected-count">
                  {activePicked.length} selected
                </span>
              </CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              <PlayerSearchAdd
                players={players}
                selectedIds={activePicked}
                onPick={addPick}
                onPlayersChanged={loadPlayers}
              />

              <div className="flex flex-col gap-2">
                <div className="flex items-center justify-between gap-2">
                  <Button
                    variant="outline"
                    size="xs"
                    data-testid="select-all"
                    disabled={visiblePool.length === 0}
                    onClick={toggleSelectAll}
                  >
                    Select all
                  </Button>
                  <select
                    aria-label="Filter tier"
                    className="rounded border border-border bg-background px-2 py-1 text-xs text-foreground"
                    value={tierFilter}
                    onChange={e => setTierFilter(e.target.value)}
                  >
                    <option value="">All tiers</option>
                    {SKILL_TIERS.map(s => (
                      <option key={s} value={s}>{s.replace('_', ' ')}</option>
                    ))}
                  </select>
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
                  <span className="text-xs text-muted-foreground">No registered players yet — search above to register one.</span>
                )}
                {!loading && !fetchError && pool.length > 0 && visiblePool.length === 0 && (
                  <span className="text-xs text-muted-foreground">No players in this tier.</span>
                )}
                {/* History sublabel: returning players show games played, rookies show "new" */}
                <div className="flex max-h-60 flex-wrap gap-2 overflow-y-auto pr-1" data-testid="player-pool">
                  {visiblePool.map(p => (
                    <Button
                      key={p.id}
                      variant={picked.includes(p.id) ? 'default' : 'outline'}
                      size="xs"
                      aria-pressed={picked.includes(p.id)}
                      onClick={() => togglePick(p.id)}
                    >
                      {p.name}
                      <SkillChip level={p.skill_level} />
                      <span className="text-2xs opacity-70">
                        {p.games_total > 0 ? `played ${p.games_total}×` : 'new'}
                      </span>
                    </Button>
                  ))}
                </div>
              </div>
              <p className="text-center text-2xs text-muted-foreground">
                Players can also be added anytime during play.
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Footer CTA */}
        <div className="flex flex-col items-center gap-2">
          <Button
            size="lg"
            className="w-full max-w-md"
            aria-label="Start Session"
            data-testid="start-session"
            disabled={!canStart}
            onClick={handleStart}
          >
            {starting ? 'Starting…' : 'Start Session'}
          </Button>
          {!canStart && !starting && (
            <span className="text-xs text-muted-foreground">
              {activePicked.length < 2
                ? 'Select at least 2 players to start.'
                : !hoursOk
                  ? 'Court hours must be between 0.5 and 12.'
                  : 'Set a start time.'}
            </span>
          )}
        </div>
      </div>
    </div>
  )
}
