import { useState, useEffect } from 'react'
import { SKILL_TIERS } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import PlayerSearchAdd, { SkillChip } from './PlayerSearchAdd.jsx'
import {
  checkinPlayer,
  updatePlayer,
  getPlayers,
  startSession,
  addCourt,
  deleteCourt,
  updateCourt,
  removeEntry,
} from '../api.js'

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

const DURATION_OPTIONS = [
  { value: '', label: 'No timer' },
  { value: '60', label: '1h (60m)' },
  { value: '90', label: '1.5h (90m)' },
  { value: '120', label: '2h (120m)' },
  { value: '150', label: '2.5h (150m)' },
  { value: '180', label: '3h (180m)' },
  { value: '240', label: '4h (240m)' },
]

export default function SetupScreen({ session, queue, courts }) {
  const [players, setPlayers] = useState([])
  const [loading, setLoading] = useState(true)
  const [fetchError, setFetchError] = useState(false)
  const [starting, setStarting] = useState(false)
  const [picked, setPicked] = useState([]) // pool player ids toggled for batch check-in

  // On-the-Fly Player Edit state
  const [editingPlayerId, setEditingPlayerId] = useState(null)
  const [editForm, setEditForm] = useState({ name: '', skill_level: 'intermediate' })
  const [editError, setEditError] = useState('')
  const [savingEdit, setSavingEdit] = useState(false)

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

  function startEditPlayer(entry) {
    setEditingPlayerId(entry.player_id)
    setEditForm({ name: entry.name, skill_level: entry.skill_level })
    setEditError('')
  }

  async function saveEditPlayer(playerId) {
    const trimmed = editForm.name.trim()
    if (!trimmed) {
      setEditError('Name is required')
      return
    }
    const collision = players.find(
      p => p.id !== playerId && p.name.trim().toLowerCase() === trimmed.toLowerCase()
    )
    if (collision) {
      setEditError('Player name already exists')
      return
    }
    setSavingEdit(true)
    setEditError('')
    try {
      const { player } = await updatePlayer(playerId, {
        name: trimmed,
        skill_level: editForm.skill_level,
      })
      setPlayers(prev => prev.map(p => (p.id === playerId ? player : p)))
      setEditingPlayerId(null)
    } catch (err) {
      setEditError(err?.data?.error || 'Failed to update player')
    } finally {
      setSavingEdit(false)
    }
  }

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

          {/* Unified Search-and-Add Combobox (shared with the live Add Player dialog) */}
          <PlayerSearchAdd
            session={session}
            queue={queue}
            players={players}
            onPlayersChanged={loadPlayers}
            onCheckedIn={p => setPicked(prev => prev.filter(id => id !== p.id))}
          />

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
              {queue.map((e, i) => {
                const isEditing = editingPlayerId === e.player_id
                return (
                  <li
                    key={e.id}
                    className="flex flex-wrap items-center gap-2 rounded-md border border-border bg-muted/30 px-3 py-1.5 text-sm"
                  >
                    <span className="font-mono text-xs text-muted-foreground">{i + 1}</span>
                    {isEditing ? (
                      <div className="flex flex-1 flex-wrap items-center gap-2">
                        <input
                          type="text"
                          aria-label={`Edit name for ${e.name}`}
                          className="w-32 rounded border border-border bg-background px-2 py-0.5 text-xs text-foreground"
                          value={editForm.name}
                          onChange={ev => setEditForm(f => ({ ...f, name: ev.target.value }))}
                        />
                        <select
                          aria-label={`Edit skill for ${e.name}`}
                          className="rounded border border-border bg-background px-1.5 py-0.5 text-xs text-foreground"
                          value={editForm.skill_level}
                          onChange={ev => setEditForm(f => ({ ...f, skill_level: ev.target.value }))}
                        >
                          {SKILL_TIERS.map(s => (
                            <option key={s} value={s}>{s.replace('_', ' ')}</option>
                          ))}
                        </select>
                        <Button
                          size="xs"
                          disabled={savingEdit}
                          onClick={() => saveEditPlayer(e.player_id)}
                        >
                          Save
                        </Button>
                        <Button
                          variant="ghost"
                          size="xs"
                          onClick={() => { setEditingPlayerId(null); setEditError('') }}
                        >
                          Cancel
                        </Button>
                        {editError && <span className="text-xs text-destructive">{editError}</span>}
                      </div>
                    ) : (
                      <>
                        <span className="font-medium text-foreground">{e.name}</span>
                        <SkillChip level={e.skill_level} />
                        <div className="ml-auto flex items-center gap-1">
                          <Button
                            variant="ghost"
                            size="xs"
                            className="h-5 w-5 p-0 text-muted-foreground"
                            aria-label={`Edit ${e.name}`}
                            onClick={() => startEditPlayer(e)}
                          >
                            ✎
                          </Button>
                          <Button
                            variant="ghost"
                            size="xs"
                            className="h-5 w-5 p-0 text-muted-foreground"
                            aria-label={`Remove ${e.name}`}
                            onClick={() => removeEntry(e.id).catch(() => {})}
                          >
                            ×
                          </Button>
                        </div>
                      </>
                    )}
                  </li>
                )
              })}
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
                    <select
                      aria-label={`${c.label} duration`}
                      className="ml-1 rounded border border-border bg-background px-1 py-0.5 text-xs"
                      value={c.duration_minutes ?? ''}
                      onChange={e => updateCourt(c.id, {
                        duration_minutes: e.target.value === '' ? null : Number(e.target.value)
                      }).catch(() => {})}
                    >
                      {DURATION_OPTIONS.map(opt => (
                        <option key={opt.value} value={opt.value}>{opt.label}</option>
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
