import { useEffect, useMemo, useState } from 'react'
import { drag, valid } from '@/lib/dnd'
import { cn, SKILL_BADGE, balanceHint, fmtClock } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { updateSlate, cancelSlate, moveSlate, slateMatch } from '../api.js'
import { useToast } from '@/components/Toast'

/** Slot order mirrors the slate payload: Team A = 0,1 · Team B = 2,3. */
const SLOT_KEYS = ['team1_p1', 'team1_p2', 'team2_p1', 'team2_p2']
const SLOT_NAME_KEYS = ['team1_p1_name', 'team1_p2_name', 'team2_p1_name', 'team2_p2_name']

const NOOP = () => {}

// index.css ships no --violet token, so the mockup's violet is expressed with
// arbitrary Tailwind tones plus dark: overrides — violet-100/800 washes out on
// the dark canvas, violet-400/300 keeps the same hue readable there.
const VIOLET_TAG = 'bg-violet-100 text-violet-800 dark:bg-violet-400/15 dark:text-violet-300'
const VIOLET_SOFT = 'text-violet-700 dark:text-violet-300'

function teamNames(row, side) {
  const keys = side === 1 ? ['team1_p1_name', 'team1_p2_name'] : ['team2_p1_name', 'team2_p2_name']
  const direct = keys.map(k => row[k]).filter(Boolean)
  if (direct.length) return direct
  const joined = side === 1 ? row.team1_names : row.team2_names
  return joined ? String(joined).split(',').filter(Boolean) : []
}

/** One lineup slot — drop target for a waiting player, clearable once filled. */
function SlateSlot({ idx, entryId, name, draftedIds, draft, onDropSlot, onClearSlot, slotPrefix = 'slate-slot', clearPrefix = 'slate-slot-clear' }) {
  const [over, setOver] = useState(false)
  const payload = drag.current // read live: drop can run before the dragover re-render flushes
  const filled = entryId != null
  // status === 'waiting': the PATCH route rejects resting substitutions, so a
  // resting drag must read as invalid (red ring) instead of landing a 400.
  const droppable = p =>
    valid('slot', p) && p.status === 'waiting' && !draftedIds.has(p.entryId) && !draft.includes(p.entryId)
  const canDrop = !filled && !!payload && droppable(payload)

  return (
    <div
      data-drop="slate-slot"
      data-slot-idx={idx}
      data-testid={`${slotPrefix}-${idx}`}
      onDragOver={e => { e.preventDefault(); e.stopPropagation(); setOver(true) }}
      onDragLeave={() => setOver(false)}
      onDrop={e => {
        // stopPropagation: the slot consumes the drop, never a parent zone
        e.preventDefault(); e.stopPropagation(); setOver(false)
        const p = drag.current
        if (filled || !p) return
        if (droppable(p)) onDropSlot(idx, p.entryId)
      }}
      className={cn(
        'grid min-h-[30px] place-items-center rounded-lg border-[1.5px] border-dashed px-2 py-1 text-center text-2xs font-semibold transition-colors',
        filled
          ? 'border-solid border-primary bg-accent text-foreground'
          : 'border-border bg-card text-muted-foreground',
        over && canDrop && 'border-primary bg-drop-target',
        over && payload && !canDrop && 'border-drop-invalid-border bg-drop-invalid'
      )}
    >
      {filled ? (
        <span className="flex items-center gap-1">
          <span className="truncate">{name}</span>
          <button
            type="button"
            data-testid={`${clearPrefix}-${idx}`}
            aria-label={`Remove ${name} from slate`}
            onClick={() => onClearSlot(idx)}
            className="font-bold text-muted-foreground hover:text-destructive"
          >×</button>
        </span>
      ) : 'Drop…'}
    </div>
  )
}

/** Compact 2×2 matrix (CourtCard .slots pattern): Team A = 0,1 · Team B = 2,3. */
function SlateMatrix({ draft, draftedIds, nameById, onDropSlot, onClearSlot, slotPrefix, clearPrefix }) {
  const column = (label, idxs, sideB) => (
    <div className="flex flex-col gap-1.5">
      <span className={cn('text-2xs font-bold uppercase tracking-wider', sideB ? 'text-emerald-600' : 'text-sky-600')}>
        {label}
      </span>
      {idxs.map(i => (
        <SlateSlot
          key={i}
          idx={i}
          entryId={draft[i]}
          name={draft[i] != null ? (nameById.get(draft[i]) ?? '?') : null}
          draftedIds={draftedIds}
          draft={draft}
          onDropSlot={onDropSlot}
          onClearSlot={onClearSlot}
          slotPrefix={slotPrefix}
          clearPrefix={clearPrefix}
        />
      ))}
    </div>
  )

  return (
    <div className="grid grid-cols-2 gap-2 rounded-lg border border-border bg-muted px-2.5 py-2">
      {column('Team A', [0, 1], false)}
      {column('Team B', [2, 3], true)}
    </div>
  )
}

/** Rough typical game length — only used for the approximate "next free court" ETA. */
const TYPICAL_GAME_SEC = 20 * 60

function sideOf(row, side) {
  const p = side === 1 ? ['team1_p1', 'team1_p2'] : ['team2_p1', 'team2_p2']
  return p.map(k => (row[k] != null ? { name: row[`${k}_name`] ?? '?', skill_level: row[`${k}_skill`] } : null)).filter(Boolean)
}

function SidePlayers({ label, players, sideB }) {
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <span className={cn('text-2xs font-bold uppercase tracking-wider', sideB ? 'text-emerald-600' : 'text-sky-600')}>{label}</span>
      {players.length ? players.map((p, i) => (
        <span key={i} className="flex min-w-0 items-center gap-1.5 text-sm font-semibold">
          <span className="truncate">{p.name}</span>
          {p.skill_level && (
            <span className={cn('shrink-0 rounded px-1 py-0.5 text-[10px] font-medium leading-none', SKILL_BADGE[p.skill_level])}>
              {p.skill_level.replace(/_/g, ' ')}
            </span>
          )}
        </span>
      )) : <span className="text-sm text-muted-foreground">—</span>}
    </div>
  )
}

/** Approximate time until the soonest active match is likely to finish → { label, secs } | null. */
function nextFreeCourt(courts, activeMatches, now) {
  let best = null
  for (const m of activeMatches ?? []) {
    if (m?.court_number == null || !m.started_at) continue
    const secs = Math.max(0, TYPICAL_GAME_SEC - (now - m.started_at))
    if (!best || secs < best.secs) {
      const c = (courts ?? []).find(x => x.id === m.court_number)
      best = { secs, label: c?.label ?? `Court ${m.court_number}` }
    }
  }
  return best
}

export default function OnDeckStrip({
  slatedMatches, queue = [], draftedIds = new Set(), onEditDraftChange = NOOP,
  onBuilderDraftChange = NOOP, onSmartFill = NOOP,
  sessionId, courts = [], activeMatches = [],
}) {
  const toast = useToast()
  const [editingId, setEditingId] = useState(null)
  const [editDraft, setEditDraft] = useState([null, null, null, null])
  const [saving, setSaving] = useState(false)
  const [cancelling, setCancelling] = useState(false)
  const [building, setBuilding] = useState(false)       // builder panel open
  const [newDraft, setNewDraft] = useState([null, null, null, null])
  const [adding, setAdding] = useState(false)
  const [moving, setMoving] = useState(false)
  const [now, setNow] = useState(() => Math.floor(Date.now() / 1000))
  useEffect(() => {
    const t = setInterval(() => setNow(Math.floor(Date.now() / 1000)), 1000)
    return () => clearInterval(t)
  }, [])

  const rows = Array.isArray(slatedMatches) ? slatedMatches : []
  const queueRows = Array.isArray(queue) ? queue : []

  // entryId → name for every player the strip can show: waiting/resting names
  // come from `queue` (substituted-in players aren't in slatedMatches rows),
  // the staged slate occupants from their own *_name fields. The two sources
  // can't overlap — slated/staged entries are excluded from queue, waiting
  // ones are excluded from slatedMatches — so merging is conflict-free.
  const nameById = useMemo(() => {
    const map = new Map()
    for (const e of queueRows) {
      if (e?.id != null && e.name) map.set(e.id, e.name)
    }
    for (const r of rows) {
      SLOT_KEYS.forEach((k, i) => {
        if (r[k] != null && r[SLOT_NAME_KEYS[i]]) map.set(r[k], r[SLOT_NAME_KEYS[i]])
      })
    }
    return map
  }, [rows, queueRows])

  // Ids that may legally sit in the edit draft — the PATCH route's rule in
  // client form: one of this slate's current four (rearrangement) or a queue
  // entry still waiting (substitution). Resting/playing/staged → unavailable.
  const availableFor = row => {
    const ok = new Set(SLOT_KEYS.map(k => row[k]).filter(v => v != null))
    for (const e of queueRows) if (e?.status === 'waiting') ok.add(e.id)
    return ok
  }

  // A slate can vanish under the editor (promoted to a court, cancelled elsewhere)
  useEffect(() => {
    if (editingId != null && !rows.some(r => r.id === editingId)) {
      setEditingId(null)
      setEditDraft([null, null, null, null])
    }
  }, [rows, editingId])

  // Stale-draft pruning: a slot can outlive its entry's availability (started
  // elsewhere, rested, slated into another match). Null it out — the Save-time
  // check catches the same race at click time, pruning keeps the matrix honest
  // between SSE ticks. Identity-stable when nothing needs pruning.
  useEffect(() => {
    if (editingId == null) return
    const row = rows.find(r => r.id === editingId)
    if (!row) return // the vanish effect above clears the editor
    const ok = availableFor(row)
    setEditDraft(prev => {
      const next = prev.map(id => (id != null && !ok.has(id) ? null : id))
      return next.every((v, i) => v === prev[i]) ? prev : next
    })
  }, [rows, queueRows, editingId])

  // Cross-zone exclusion: mirror the live edit draft into App so a court
  // draft can't hold the same entry. Fires on edit start and every draft
  // change; empty array on save success, cancel and exit.
  useEffect(() => {
    onEditDraftChange(editingId != null ? editDraft.filter(Boolean) : [])
  }, [editingId, editDraft, onEditDraftChange])

  // Builder draft → App (drafted union), and stale pruning (entry no longer waiting)
  useEffect(() => { onBuilderDraftChange(newDraft.filter(Boolean)) }, [newDraft, onBuilderDraftChange])
  useEffect(() => {
    const waiting = new Set(queueRows.filter(e => e?.status === 'waiting').map(e => e.id))
    setNewDraft(prev => {
      const next = prev.map(id => (id != null && !waiting.has(id) ? null : id))
      return next.every((v, i) => v === prev[i]) ? prev : next
    })
  }, [queueRows])
  useEffect(() => () => onBuilderDraftChange([]), [onBuilderDraftChange])

  const startEdit = row => {
    setEditingId(row.id)
    setEditDraft(SLOT_KEYS.map(k => row[k] ?? null))
  }

  const exitEdit = () => {
    setEditingId(null)
    setEditDraft([null, null, null, null])
  }

  const builderDrop = (idx, entryId) => setNewDraft(prev => {
    if (prev[idx] != null || prev.includes(entryId) || draftedIds.has(entryId)) return prev
    return prev.map((v, i) => (i === idx ? entryId : v))
  })
  const builderClear = idx => setNewDraft(prev => (
    prev[idx] == null ? prev : prev.map((v, i) => (i === idx ? null : v))
  ))

  // ✨ Smart Match: dry-run slate plan poured into the builder for review —
  // NO confirm dialog and NO slating here; the QM edits the slots and presses
  // "Add to on Deck". A player already claimed by another zone (court draft or
  // slate-editor draft) leaves that slot empty rather than double-claiming;
  // the builder's own previous contents are replaced wholesale.
  const [filling, setFilling] = useState(false)
  async function runSmartFill() {
    if (filling) return
    setFilling(true)
    try {
      const ids = await onSmartFill()
      if (ids) {
        setBuilding(true)
        const other = new Set([...draftedIds].filter(id => !newDraft.includes(id)))
        setNewDraft(ids.map(id => (other.has(id) ? null : id)))
      }
    } finally {
      setFilling(false)
    }
  }

  async function handleAdd() {
    if (adding) return
    if (newDraft.filter(Boolean).length !== 4) { toast('A lineup needs exactly 4 players', 'error'); return }
    setAdding(true)
    try {
      await slateMatch({
        session_id: sessionId,
        team1_p1: newDraft[0], team1_p2: newDraft[1],
        team2_p1: newDraft[2], team2_p2: newDraft[3],
      })
      toast('Added to On Deck', 'success')
      setNewDraft([null, null, null, null])
    } catch (err) {
      toast(err?.data?.error ?? 'Could not add to On Deck', 'error') // keep the builder
    } finally {
      setAdding(false)
    }
  }

  async function handleMove(row, dir) {
    if (moving) return
    setMoving(true)
    try { await moveSlate(row.id, dir) }
    catch (err) { toast(err?.data?.error ?? 'Could not reorder', 'error') }
    finally { setMoving(false) }
  }

  const dropSlot = (idx, entryId) => setEditDraft(prev => {
    if (prev[idx] != null || prev.includes(entryId) || draftedIds.has(entryId)) return prev
    return prev.map((v, i) => (i === idx ? entryId : v))
  })

  const clearSlot = idx => setEditDraft(prev => (
    prev[idx] == null ? prev : prev.map((v, i) => (i === idx ? null : v))
  ))

  async function handleSave(row) {
    if (saving) return // in-flight guard: no double PATCH / double toast
    if (editDraft.filter(Boolean).length !== 4) {
      toast('A slate needs exactly 4 players', 'error')
      return
    }
    // Stale guard: a slot can reference a player who became unavailable since
    // the last SSE tick — fail locally before the PATCH 400s.
    const ok = availableFor(row)
    if (editDraft.some(id => !ok.has(id))) {
      toast('A player in this lineup is no longer available', 'error')
      return
    }
    setSaving(true)
    try {
      await updateSlate(row.id, {
        team1_p1: editDraft[0], team1_p2: editDraft[1],
        team2_p1: editDraft[2], team2_p2: editDraft[3],
      })
      toast('Slated lineup updated', 'success')
      exitEdit()
    } catch (err) {
      toast(err?.data?.error ?? 'Could not update slate', 'error')
    } finally {
      setSaving(false)
    }
  }

  async function handleCancel(row) {
    if (cancelling) return // in-flight guard: no double DELETE / double 404 toast
    setCancelling(true)
    try {
      await cancelSlate(row.id)
      toast('Slated match cancelled — players returned to waiting', 'info')
    } catch (err) {
      toast(err?.data?.error ?? 'Could not cancel slate', 'error')
    } finally {
      setCancelling(false)
    }
  }

  const eta = rows.length ? nextFreeCourt(courts, activeMatches, now) : null
  const filled = newDraft.filter(Boolean).length

  const builder = (
    <div data-testid="ondeck-builder" className="flex flex-wrap items-center gap-3 rounded-lg border border-border bg-card p-3">
      <SlateMatrix
        draft={newDraft}
        draftedIds={draftedIds}
        nameById={nameById}
        onDropSlot={builderDrop}
        onClearSlot={builderClear}
        slotPrefix="ondeck-new-slot"
        clearPrefix="ondeck-new-clear"
      />
      <div className="flex flex-col gap-1.5">
        <p className="max-w-[16rem] text-2xs text-muted-foreground">
          Drag 4 waiting players in, or ✨ Smart Match to fill from the waiting queue — review and adjust before adding.
        </p>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" data-testid="ondeck-smart-fill" disabled={filling} onClick={runSmartFill}>✨ Smart Match</Button>
          <Button size="sm" data-testid="ondeck-add" disabled={filled !== 4 || adding} onClick={handleAdd}>Add to On Deck</Button>
        </div>
      </div>
    </div>
  )

  return (
    <section
      data-testid="on-deck-strip"
      className="flex max-h-[36vh] shrink-0 flex-col gap-3 overflow-y-auto rounded-2xl border-2 border-primary/60 bg-primary/5 p-3 shadow-md"
    >
      <header className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <h2 className="flex items-center gap-2 text-lg font-black uppercase tracking-wide text-primary">
          ⏭ On Deck
          <span
            data-testid="on-deck-count"
            className="inline-flex min-w-6 items-center justify-center rounded-full bg-primary px-2 py-0.5 text-xs font-extrabold text-primary-foreground"
          >{rows.length}</span>
        </h2>
        <p className="min-w-0 flex-1 text-xs text-muted-foreground">Plays on the next free court · in order</p>
        <Button size="sm" variant="outline" data-testid="ondeck-smart-add" disabled={filling} onClick={runSmartFill}>✨ Smart add</Button>
        <Button size="sm" variant={building ? 'secondary' : 'default'} data-testid="ondeck-builder-toggle" onClick={() => setBuilding(b => !b)}>
          {building ? 'Close builder' : '＋ Build lineup'}
        </Button>
      </header>

      {building && builder}

      {!rows.length && (
        <div data-testid="on-deck-empty" className="flex flex-wrap items-baseline gap-x-2 rounded-lg border border-dashed border-primary/40 bg-card px-3 py-1.5">
          <p className="text-sm font-bold">Nothing on deck</p>
          <p className="text-xs text-muted-foreground">
            Line up the next match so it starts the moment a court frees up — Smart add or build a lineup.
          </p>
        </div>
      )}

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {rows.map((row, i) => {
          const editing = editingId === row.id
          const pos = i + 1
          const t1 = sideOf(row, 1)
          const t2 = sideOf(row, 2)
          const hint = balanceHint({ team1: t1, team2: t2 })
          return (
            <div
              key={row.id}
              data-testid={`slate-row-${row.id}`}
              className={cn(
                'flex flex-col gap-2.5 rounded-xl border bg-card px-4 py-3 shadow-sm',
                pos === 1 ? 'border-primary' : 'border-dashed border-border'
              )}
            >
              <div className="flex flex-wrap items-center gap-2">
                <span
                  data-testid={`on-deck-pos-${pos}`}
                  className="rounded-full bg-primary px-2.5 py-1 text-xs font-extrabold text-primary-foreground"
                >
                  #{pos}{pos === 1 ? ' · Up next' : ''}
                </span>
                {/* the one violet tag — present in display AND edit mode */}
                <span
                  data-testid="on-deck-tag"
                  className={cn('inline-flex shrink-0 items-center gap-1 rounded-full px-2.5 py-1 text-2xs font-extrabold uppercase tracking-wider', VIOLET_TAG)}
                >
                  ⏭ On Deck
                </span>
                {hint && !editing && (
                  <span data-testid="on-deck-balance" className={cn('text-xs font-bold', hint.tone)}>{hint.label}</span>
                )}
                {row.slate_seq != null && (
                  <span className={cn('ml-auto shrink-0 rounded-full px-2 py-0.5 text-2xs font-bold uppercase tracking-wider', VIOLET_TAG)}>
                    slated #{row.slate_seq}
                  </span>
                )}
              </div>

              {editing ? (
                <SlateMatrix
                  draft={editDraft}
                  draftedIds={draftedIds}
                  nameById={nameById}
                  onDropSlot={dropSlot}
                  onClearSlot={clearSlot}
                />
              ) : (
                <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2">
                  <SidePlayers label="Team A" players={t1} />
                  <span className="text-xs font-extrabold text-muted-foreground">vs</span>
                  <SidePlayers label="Team B" players={t2} sideB />
                </div>
              )}

              {pos === 1 && eta && !editing && (
                <p data-testid="on-deck-eta" className={cn('text-xs font-semibold', VIOLET_SOFT)}>
                  next free court: {eta.label} in ~{fmtClock(eta.secs)}
                </p>
              )}

              <div className="flex flex-wrap items-center gap-2">
                {editing ? (
                  <>
                    <Button size="sm" data-testid="slate-save" disabled={saving} onClick={() => handleSave(row)}>Save</Button>
                    <Button size="sm" variant="ghost" data-testid="slate-cancel-edit" onClick={exitEdit}>Cancel</Button>
                  </>
                ) : (
                  <>
                    <Button size="sm" variant="outline" data-testid={`slate-up-${row.id}`} aria-label="Move up" disabled={i === 0 || moving} onClick={() => handleMove(row, 'up')}>↑</Button>
                    <Button size="sm" variant="outline" data-testid={`slate-down-${row.id}`} aria-label="Move down" disabled={i === rows.length - 1 || moving} onClick={() => handleMove(row, 'down')}>↓</Button>
                    <Button size="sm" variant="outline" className="ml-auto" data-testid={`slate-edit-${row.id}`} onClick={() => startEdit(row)}>
                      ✎ Edit
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="text-destructive hover:text-destructive"
                      data-testid={`slate-cancel-${row.id}`}
                      disabled={cancelling}
                      onClick={() => handleCancel(row)}
                    >
                      ✕ Cancel
                    </Button>
                  </>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </section>
  )
}
