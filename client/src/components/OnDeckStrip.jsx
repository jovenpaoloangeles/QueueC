import { useEffect, useMemo, useState } from 'react'
import { drag, valid } from '@/lib/dnd'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { updateSlate, cancelSlate } from '../api.js'
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
function SlateSlot({ idx, entryId, name, draftedIds, draft, onDropSlot, onClearSlot }) {
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
      data-testid={`slate-slot-${idx}`}
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
            data-testid={`slate-slot-clear-${idx}`}
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
function SlateMatrix({ draft, draftedIds, nameById, onDropSlot, onClearSlot }) {
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

export default function OnDeckStrip({ slatedMatches, queue = [], draftedIds = new Set(), onEditDraftChange = NOOP }) {
  const toast = useToast()
  const [editingId, setEditingId] = useState(null)
  const [editDraft, setEditDraft] = useState([null, null, null, null])
  const [saving, setSaving] = useState(false)
  const [cancelling, setCancelling] = useState(false)

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

  if (!rows.length) return null

  const startEdit = row => {
    setEditingId(row.id)
    setEditDraft(SLOT_KEYS.map(k => row[k] ?? null))
  }

  const exitEdit = () => {
    setEditingId(null)
    setEditDraft([null, null, null, null])
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

  return (
    <section data-testid="on-deck-strip" className="flex shrink-0 flex-col gap-2">
      {rows.map(row => {
        const editing = editingId === row.id
        const t1 = teamNames(row, 1)
        const t2 = teamNames(row, 2)
        return (
          <div
            key={row.id}
            data-testid={`slate-row-${row.id}`}
            className="flex flex-wrap items-center gap-3 rounded-xl border border-dashed border-border bg-card px-4 py-2.5 shadow-sm"
          >
            {/* the one violet tag — present in display AND edit mode */}
            <span
              data-testid="on-deck-tag"
              className={cn('inline-flex shrink-0 items-center gap-1 rounded-full px-2.5 py-1 text-2xs font-extrabold uppercase tracking-wider', VIOLET_TAG)}
            >
              ⏭ On Deck
            </span>

            {editing ? (
              <div className="flex min-w-0 flex-1 flex-wrap items-center gap-3">
                <SlateMatrix
                  draft={editDraft}
                  draftedIds={draftedIds}
                  nameById={nameById}
                  onDropSlot={dropSlot}
                  onClearSlot={clearSlot}
                />
              </div>
            ) : (
              <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2.5 text-xs">
                <b className="font-semibold">{t1.join(' + ') || '—'}</b>
                <span className="font-extrabold text-muted-foreground">vs</span>
                <b className="font-semibold">{t2.join(' + ') || '—'}</b>
                <span className={cn('text-2xs font-bold', VIOLET_SOFT)}>
                  → auto-promotes to next free court
                </span>
              </div>
            )}

            {row.slate_seq != null && (
              <span className={cn('shrink-0 rounded-full px-2.5 py-1 text-2xs font-extrabold uppercase tracking-wider', VIOLET_TAG)}>
                slated #{row.slate_seq}
              </span>
            )}

            {editing ? (
              <>
                <Button size="xs" data-testid="slate-save" disabled={saving} onClick={() => handleSave(row)}>Save</Button>
                <Button size="xs" variant="ghost" data-testid="slate-cancel-edit" onClick={exitEdit}>Cancel</Button>
              </>
            ) : (
              <>
                <Button size="xs" variant="outline" data-testid={`slate-edit-${row.id}`} onClick={() => startEdit(row)}>
                  ✎ Edit
                </Button>
                <Button
                  size="xs"
                  variant="ghost"
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
        )
      })}
    </section>
  )
}
