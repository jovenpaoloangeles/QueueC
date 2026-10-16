import { useState, useEffect, useMemo, useRef } from 'react'
import { cn, titleCaseSkill, SKILL_TIERS, fmtSessionName } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import { useToast } from '@/components/Toast'
import PlayerSearchAdd, { SkillChip } from './PlayerSearchAdd.jsx'
import { createSession, endSession, checkinPlayer, getPlayers, startSession, updatePlayer } from '../api.js'

const MAX_COURTS = 16
const DEFAULT_HOURS = '2'
const CLICK_DELAY = 220

const pad = n => String(n).padStart(2, '0')

const START_HOURS = Array.from({ length: 18 }, (_, i) => pad(i + 6) + ':00') // 06:00 … 23:00

// Later open times are picked as clock times, 15-min steps up to 4h past start.
const OPEN_STEPS = Array.from({ length: 16 }, (_, i) => (i + 1) * 15)

const toMin = hhmm => { const [h, m] = hhmm.split(':').map(Number); return h * 60 + m }
const fmtClock = min => {
  const m = ((min % 1440) + 1440) % 1440
  const h24 = Math.floor(m / 60)
  const ampm = h24 >= 12 ? 'PM' : 'AM'
  return `${h24 % 12 || 12}:${pad(m % 60)} ${ampm}`
}

// Default start time: the next full hour, clamped into the list (HH:00).
function defaultStartTime() {
  const h = Math.min(23, Math.max(6, new Date().getHours() + 1))
  return `${pad(h)}:00`
}

const validHours = h => {
  const n = Number(h)
  return h !== '' && Number.isFinite(n) && n >= 0.5 && n <= 12
}

// Alphabetical, case-insensitive. Selection never reorders rows.
const byName = (a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' })
const letterOf = name => {
  const c = name.trim().charAt(0).toLocaleUpperCase()
  return /\p{L}/u.test(c) ? c : '#'
}

function CheckBox({ on }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        'flex size-4 shrink-0 items-center justify-center rounded border text-2xs leading-none',
        on ? 'border-primary bg-primary text-primary-foreground' : 'border-border bg-background'
      )}
    >
      {on ? '✓' : ''}
    </span>
  )
}

// One pool row. Single click toggles after a short delay so a double-click
// (inline edit) can cancel it and never double-toggles.
function PoolRow({ p, on, onToggle, onEdit }) {
  const timer = useRef(null)
  useEffect(() => () => clearTimeout(timer.current), [])
  const tip = p.games_total > 0 ? `${p.name} — played ${p.games_total}×` : `${p.name} — new`
  return (
    <div
      data-testid="player-pool"
      role="checkbox"
      aria-checked={on}
      aria-label={p.name}
      tabIndex={0}
      title={tip}
      onClick={() => {
        clearTimeout(timer.current)
        timer.current = setTimeout(onToggle, CLICK_DELAY)
      }}
      onDoubleClick={() => {
        clearTimeout(timer.current)
        onEdit()
      }}
      onKeyDown={e => {
        if (e.target !== e.currentTarget) return
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onToggle() }
      }}
      className={cn(
        'group flex h-8 cursor-pointer select-none items-center gap-2 rounded-md px-2 text-xs outline-none',
        'hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring',
        on && 'bg-primary/10'
      )}
    >
      <CheckBox on={on} />
      <span className={cn('min-w-0 flex-1 truncate', on ? 'font-semibold text-foreground' : 'text-foreground')}>{p.name}</span>
      <button
        type="button"
        aria-label={`Edit ${p.name}`}
        title="Edit player"
        className="rounded px-1 text-muted-foreground opacity-0 hover:text-foreground focus-visible:opacity-100 group-hover:opacity-100"
        onClick={e => { e.stopPropagation(); clearTimeout(timer.current); onEdit() }}
        onDoubleClick={e => e.stopPropagation()}
        onKeyDown={e => e.stopPropagation()}
      >
        ✎
      </button>
      <SkillChip level={p.skill_level} />
    </div>
  )
}

function EditRow({ p, onSave, onCancel }) {
  const [name, setName] = useState(p.name)
  const [skill, setSkill] = useState(p.skill_level)
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const boxRef = useRef(null)

  async function save() {
    const trimmed = name.trim()
    if (!trimmed) { setError('Name is required'); return }
    if (trimmed === p.name && skill === p.skill_level) { onCancel(); return }
    setSaving(true)
    try {
      await onSave(p.id, { name: trimmed, skill_level: skill })
    } catch (err) {
      setError(err?.data?.error ?? 'Could not save player')
      setSaving(false)
      boxRef.current?.querySelector('input')?.focus() // disabled Save dropped focus; keep Esc/Enter working
    }
  }
  const keys = e => {
    if (e.key === 'Enter') { e.preventDefault(); save() }
    else if (e.key === 'Escape') { e.preventDefault(); onCancel() }
  }
  return (
    <div ref={boxRef} data-testid="player-pool" role="group" aria-label={`Editing ${p.name}`} onKeyDown={e => { if (e.key === 'Escape') { e.preventDefault(); onCancel() } }} className="flex flex-col gap-1 rounded-md border border-border bg-muted/40 p-1.5">
      <div className="flex items-center gap-1.5">
        <Input
          autoFocus
          aria-label="Player name"
          className="h-7 flex-1 text-xs"
          value={name}
          onChange={e => { setName(e.target.value); setError('') }}
          onKeyDown={keys}
        />
        <select
          aria-label="Player skill"
          className="h-7 rounded border border-border bg-background px-1 text-xs text-foreground"
          value={skill}
          onChange={e => setSkill(e.target.value)}
          onKeyDown={keys}
        >
          {SKILL_TIERS.map(s => <option key={s} value={s}>{titleCaseSkill(s)}</option>)}
        </select>
        <Button type="button" size="xs" aria-label="Save player" disabled={saving} onClick={save}>✓</Button>
        <Button type="button" size="xs" variant="outline" aria-label="Cancel edit" onClick={onCancel}>✕</Button>
      </div>
      {error && <span role="alert" data-testid="player-edit-error" className="text-2xs text-destructive">{error}</span>}
    </div>
  )
}

const syncCourts = (prev, n) => {
  const next = prev.slice(0, n)
  while (next.length < n) next.push({ label: `Court ${next.length + 1}`, hours: DEFAULT_HOURS, opens: '0' })
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
  const [name, setName] = useState(fmtSessionName)
  const [startTime, setStartTime] = useState(defaultStartTime)
  const [courtCount, setCourtCount] = useState('2')
  const [courts, setCourts] = useState(() => syncCourts([], 2))
  const [players, setPlayers] = useState([])
  const [loading, setLoading] = useState(true)
  const [fetchError, setFetchError] = useState(false)
  const [picked, setPicked] = useState([]) // selected player ids, click order = check-in order
  const [tierFilter, setTierFilter] = useState('') // '' = all tiers
  const [starting, setStarting] = useState(false)
  const [editingId, setEditingId] = useState(null)

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

  const pool = useMemo(() => [...players].sort(byName), [players])
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

  const groups = useMemo(() => {
    const out = []
    for (const p of visiblePool) {
      const l = letterOf(p.name)
      if (out.length && out[out.length - 1].letter === l) out[out.length - 1].items.push(p)
      else out.push({ letter: l, items: [p] })
    }
    return out
  }, [visiblePool])

  async function savePlayer(id, patch) {
    const { player } = await updatePlayer(id, patch)
    setPlayers(prev => prev.map(p => (p.id === id ? { ...p, ...player } : p)))
    setEditingId(null)
  }

  const hoursOk = courts.every(c => validHours(c.hours))
  const opensAfterOf = c => Math.max(0, Math.round(Number(c.opens) || 0))
  const startMin = toMin(startTime)
  // timeline window: session start → latest court end (open time + rental)
  const rentalMinOf = c => Math.max(0.5, Number(c.hours) || 0) * 60
  const windowEnd = Math.max(startMin + 60, ...courts.map(c => startMin + opensAfterOf(c) + rentalMinOf(c)))
  const span = windowEnd - startMin
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
        name: name.trim() || fmtSessionName(),
        scheduled_start: scheduledStart,
        scheduled_end: scheduledStart + Math.round(maxHours * 3600),
        court_count: courts.length,
        courts: courts.map((c, i) => ({
          label: c.label.trim() || `Court ${i + 1}`,
          duration_minutes: Math.round(Number(c.hours) * 60),
          opens_after: opensAfterOf(c),
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
                  <select
                    id="setup-start"
                    className="h-8 rounded-md border border-input bg-background px-2 text-xs text-foreground"
                    value={startTime}
                    onChange={e => setStartTime(e.target.value)}
                  >
                    {START_HOURS.map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
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
                <div className="flex items-center gap-2 px-2 text-2xs text-muted-foreground" data-testid="court-cols">
                  <span className="flex-1">Court</span>
                  <span className="w-20 text-center">Rental</span>
                  <span className="text-2xs">hrs</span>
                  {courts.length > 1 && <span className="w-[6.5rem] text-center">Opens</span>}
                </div>
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
                    {courts.length > 1 && (
                      <select
                        aria-label={`Court ${i + 1} opens at`}
                        className="h-7 w-[6.5rem] rounded-md border border-input bg-background px-1 text-xs text-foreground"
                        value={String(opensAfterOf(c))}
                        onChange={e => patchCourt(i, { opens: e.target.value })}
                      >
                        <option value="0">With session</option>
                        {OPEN_STEPS.map(m => (
                          <option key={m} value={String(m)}>{fmtClock(startMin + m)}</option>
                        ))}
                      </select>
                    )}
                  </div>
                ))}
              </div>
              {courts.length > 1 && (
                <div className="flex flex-col gap-1.5 rounded-md border border-border bg-muted/20 p-2" data-testid="court-timeline">
                  <div className="flex justify-between text-2xs text-muted-foreground">
                    <span>{fmtClock(startMin)}</span>
                    <span>Rental window</span>
                    <span>{fmtClock(windowEnd)}</span>
                  </div>
                  {courts.map((c, i) => {
                    const open = startMin + opensAfterOf(c)
                    const mins = rentalMinOf(c)
                    const label = c.label.trim() || `Court ${i + 1}`
                    return (
                      <div key={i} className="flex items-center gap-1.5">
                        <span className="w-14 shrink-0 truncate text-2xs text-muted-foreground" title={label}>{label}</span>
                        <div className="relative h-3 flex-1 overflow-hidden rounded-sm bg-background">
                          <div
                            className="absolute inset-y-0 rounded-sm border border-primary/40 bg-primary/25"
                            style={{ left: `${((open - startMin) / span) * 100}%`, width: `${Math.max(3, (mins / span) * 100)}%` }}
                            title={`${label} · ${fmtClock(open)} – ${fmtClock(open + mins)}`}
                          />
                        </div>
                        <span className="w-[6.5rem] shrink-0 text-right text-2xs tabular-nums text-muted-foreground">
                          {fmtClock(open)}–{fmtClock(open + mins)}
                        </span>
                      </div>
                    )
                  })}
                </div>
              )}
              <p className="text-2xs text-muted-foreground">
                Each court&apos;s timer runs for its rental hours from the moment it opens, and can be extended live.
                A court with a later open time joins the rotation automatically when its time comes.
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
            <CardContent className="flex flex-col min-h-0 gap-4">
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
                      <option key={s} value={s}>{titleCaseSkill(s)}</option>
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
                <div className="max-h-[34rem] flex-1 min-h-0 overflow-y-auto rounded-md border border-border pr-0.5" data-testid="player-list">
                  {groups.map(g => (
                    <div key={g.letter} data-testid="pool-group">
                      <div
                        data-testid="pool-letter"
                        className="sticky top-0 z-10 border-b border-border bg-muted px-2 py-0.5 text-2xs font-bold uppercase tracking-wider text-muted-foreground"
                      >
                        {g.letter}
                      </div>
                      {g.items.map(p =>
                        editingId === p.id ? (
                          <EditRow key={p.id} p={p} onSave={savePlayer} onCancel={() => setEditingId(null)} />
                        ) : (
                          <PoolRow key={p.id} p={p} on={picked.includes(p.id)} onToggle={() => togglePick(p.id)} onEdit={() => setEditingId(p.id)} />
                        )
                      )}
                    </div>
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
