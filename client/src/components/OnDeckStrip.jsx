import { useEffect, useMemo, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { drag, valid } from '@/lib/dnd'
import { cn, titleCaseSkill, SKILL_BADGE, balanceHint, fmtClock } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog'
import { updateSlate, cancelSlate, moveSlate, slateMatch, startSlateOnCourt } from '../api.js'
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
        'grid min-h-[44px] place-items-center rounded-lg border-[1.5px] border-dashed px-3 py-2 text-center text-sm font-semibold transition-colors',
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
            className="size-5 font-bold text-muted-foreground hover:text-destructive"
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
              {titleCaseSkill(p.skill_level)}
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

/** Free courts, same rule as the server (automatch.js): enabled, not expired,
 *  active window open, and no live match sitting on the court. */
function freeCourts(courts, activeMatches, now) {
  const busy = new Set((activeMatches ?? []).map(m => m.court_number).filter(v => v != null))
  return (courts ?? []).filter(c =>
    c.enabled &&
    (c.active_from == null || now >= c.active_from) &&
    (c.expires_at == null || now < c.expires_at) &&
    (c.active_until == null || now < c.active_until) &&
    !busy.has(c.id)
  )
}

export default function OnDeckStrip({
  slatedMatches, queue = [], draftedIds = new Set(), onEditDraftChange = NOOP,
  onBuilderDraftChange = NOOP, onSmartFill = NOOP,
  sessionId, courts = [], activeMatches = [],
  open = true, onToggleOpen = NOOP,
}) {
  const toast = useToast()
  const [editingId, setEditingId] = useState(null)
  const [editDraft, setEditDraft] = useState([null, null, null, null])
  const [saving, setSaving] = useState(false)
  const [cancelling, setCancelling] = useState(false)
  const [pendingCancelId, setPendingCancelId] = useState(null) // confirm dialog target
  const [pendingStartId, setPendingStartId] = useState(null) // start-now dialog target
  const [starting, setStarting] = useState(false)
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

  // entryId → skill_level from the same two sources, for the builder's live
  // balance verdict (same balanceHint thresholds as the slated cards).
  const skillById = useMemo(() => {
    const map = new Map()
    for (const e of queueRows) if (e?.id != null && e.skill_level) map.set(e.id, e.skill_level)
    for (const r of rows) SLOT_KEYS.forEach(k => { if (r[k] != null && r[`${k}_skill`]) map.set(r[k], r[`${k}_skill`]) })
    return map
  }, [rows, queueRows])

  // Live verdict for the staged lineup — feedback the moment the 4 slots fill
  // (Smart add or manual), before anything is added to On Deck.
  const draftHint = useMemo(() => {
    if (newDraft.filter(Boolean).length !== 4) return null
    const side = ids => ids.map(id => ({ skill_level: skillById.get(id) }))
    return balanceHint({ team1: side(newDraft.slice(0, 2)), team2: side(newDraft.slice(2, 4)) })
  }, [newDraft, skillById])

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
    // same for the cancel/start-confirm targets: close silently if the slate vanished
    if (pendingCancelId != null && !rows.some(r => r.id === pendingCancelId)) {
      setPendingCancelId(null)
    }
    if (pendingStartId != null && !rows.some(r => r.id === pendingStartId)) {
      setPendingStartId(null)
    }
  }, [rows, editingId, pendingCancelId, pendingStartId])

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

  async function handleStartNow(row, court) {
    if (starting) return // in-flight guard: no double POST / double toast
    setStarting(true)
    try {
      await startSlateOnCourt(row.id, court.id)
      toast(`Lineup started on ${court.label}`, 'success')
      setPendingStartId(null)
    } catch (err) {
      toast(err?.data?.error ?? 'Could not start the lineup', 'error') // keep the dialog open
    } finally {
      setStarting(false)
    }
  }

  const eta = rows.length ? nextFreeCourt(courts, activeMatches, now) : null
  const free = useMemo(() => freeCourts(courts, activeMatches, now), [courts, activeMatches, now])
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
        <div className="flex items-center gap-2">
          <Button size="sm" variant="outline" data-testid="ondeck-smart-fill" disabled={filling} onClick={runSmartFill}>✨ Smart Match</Button>
          <Button size="sm" data-testid="ondeck-add" disabled={filled !== 4 || adding} onClick={handleAdd}>Add to On Deck</Button>
          {draftHint && (
            <span data-testid="ondeck-draft-balance" className={cn('text-xs font-bold', draftHint.tone)}>{draftHint.label}</span>
          )}
        </div>
      </div>
    </div>
  )

  const collapsedHeader = (
    <header className="flex min-h-7 flex-wrap items-center gap-x-3 gap-y-1">
      <h2 className="flex items-center gap-2 text-lg font-black uppercase tracking-wide text-primary">
        ⏭ On Deck
        <span
          data-testid="on-deck-count"
          className="inline-flex min-w-6 items-center justify-center rounded-full bg-primary px-2 py-0.5 text-xs font-extrabold text-primary-foreground"
        >{rows.length}</span>
      </h2>
      <p className="min-w-0 flex-1 text-xs text-muted-foreground">
        {rows.length ? `${rows.length} lined up · hidden` : 'nothing lined up'}
      </p>
      <Button size="sm" variant="outline" data-testid="ondeck-smart-add" disabled={filling} onClick={runSmartFill}>✨ Smart add</Button>
    </header>
  )

  const expandedHeader = (
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
  )

  const collapseBtn = (
    /* collapse toggle: chevron + aria-expanded; open/closed is plain local state */
    <button
      type="button"
      data-testid="ondeck-collapse"
      aria-expanded={open}
      aria-label={open ? 'Collapse On Deck' : 'Expand On Deck'}
      onClick={onToggleOpen}
      className="flex size-6 shrink-0 items-center justify-center rounded text-primary hover:bg-primary/10"
    >
      <span
        aria-hidden="true"
        className="inline-block transition-transform duration-200"
        style={{ transform: open ? 'rotate(90deg)' : 'rotate(-90deg)' }}
      >
        ▸
      </span>
    </button>
  )

  return (
    <section
      data-testid="on-deck-strip"
      className={cn(
        'flex shrink-0 flex-col rounded-2xl border-2 border-primary/60 bg-primary/5 shadow-md',
        open ? 'gap-3 p-3' : 'gap-1 px-3 py-1',
      )}
    >
      {/* collapsed: chevron inline with the header so the slim bar stays one row */}
      {open ? (
        <>
          {collapseBtn}
          {expandedHeader}
        </>
      ) : (
        <div className="flex items-center gap-2">{collapseBtn}{collapsedHeader}</div>
      )}

      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            key="ondeck-body"
            data-testid="ondeck-body"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25, ease: 'easeInOut' }}
            className="flex min-h-0 flex-col gap-3 overflow-hidden"
          >
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
                      data-testid={`slate-start-${row.id}`}
                      disabled={free.length === 0}
                      title={free.length === 0 ? 'No free court' : 'Start this lineup on a free court now'}
                      onClick={() => setPendingStartId(row.id)}
                    >
                      ▶ Start now
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="text-destructive hover:text-destructive"
                      data-testid={`slate-cancel-${row.id}`}
                      disabled={cancelling}
                      onClick={() => setPendingCancelId(row.id)}
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
          </motion.div>
        )}
      </AnimatePresence>

      {/* Cancel-confirm gate: destructive, so the ✕ only arms the dialog.
          Esc/backdrop (onOpenChange false) = abort. One dialog strip-wide. */}
      <Dialog open={pendingCancelId != null} onOpenChange={open => { if (!open) setPendingCancelId(null) }}>
        <DialogContent className="sm:max-w-xs" data-testid="ondeck-cancel-dialog">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <span aria-hidden="true">✕</span>
              Cancel this lineup?
            </DialogTitle>
            <DialogDescription>Players return to the queue.</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button type="button" variant="outline" size="sm" data-testid="ondeck-cancel-abort" onClick={() => setPendingCancelId(null)}>
              Keep
            </Button>
            <Button
              type="button"
              variant="destructive"
              size="sm"
              data-testid="ondeck-cancel-confirm"
              disabled={cancelling}
              onClick={async () => {
                const row = rows.find(r => r.id === pendingCancelId)
                setPendingCancelId(null)
                if (row) await handleCancel(row)
              }}
            >
              Cancel lineup
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Start-now dialog: clicking a free court IS the confirm (it starts
          immediately). Esc/backdrop = abort. One dialog strip-wide. */}
      <Dialog open={pendingStartId != null} onOpenChange={open => { if (!open) setPendingStartId(null) }}>
        <DialogContent className="sm:max-w-xs" data-testid="ondeck-start-dialog">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <span aria-hidden="true">▶</span>
              Start this lineup now?
            </DialogTitle>
            <DialogDescription>Pick a free court — players leave the queue.</DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-1.5">
            {free.length === 0 ? (
              <p className="text-sm text-muted-foreground">No free court right now.</p>
            ) : (
              free.map(c => (
                <Button
                  key={c.id}
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={starting}
                  data-testid={`slate-start-court-${c.id}`}
                  onClick={() => {
                    const row = rows.find(r => r.id === pendingStartId)
                    if (row) handleStartNow(row, c)
                  }}
                >
                  {c.label}
                </Button>
              ))
            )}
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" size="sm" data-testid="slate-start-abort" onClick={() => setPendingStartId(null)}>
              Cancel
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  )
}
