import { useEffect, useMemo, useState } from 'react'
import { drag, valid } from '@/lib/dnd'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { updateSlate, cancelSlate } from '../api.js'
import { useToast } from '@/components/Toast'

/** Slot order mirrors the slate payload: Team A = 0,1 · Team B = 2,3. */
const SLOT_KEYS = ['team1_p1', 'team1_p2', 'team2_p1', 'team2_p2']
const SLOT_NAME_KEYS = ['team1_p1_name', 'team1_p2_name', 'team2_p1_name', 'team2_p2_name']

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

/** One lineup slot — drop target for a waiting/resting player, clearable once filled. */
function SlateSlot({ idx, entryId, name, draftedIds, draft, onDropSlot, onClearSlot }) {
  const [over, setOver] = useState(false)
  const payload = drag.current // read live: drop can run before the dragover re-render flushes
  const filled = entryId != null
  const droppable = p => valid('slot', p) && !draftedIds.has(p.entryId) && !draft.includes(p.entryId)
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

export default function OnDeckStrip({ slatedMatches, draftedIds = new Set() }) {
  const toast = useToast()
  const [editingId, setEditingId] = useState(null)
  const [editDraft, setEditDraft] = useState([null, null, null, null])

  const rows = Array.isArray(slatedMatches) ? slatedMatches : []

  // entryId → name for every player sitting in any slate (the strip never takes
  // `queue` — slatedMatches is its only name source).
  const nameById = useMemo(() => {
    const map = new Map()
    for (const r of rows) {
      SLOT_KEYS.forEach((k, i) => {
        if (r[k] != null && r[SLOT_NAME_KEYS[i]]) map.set(r[k], r[SLOT_NAME_KEYS[i]])
      })
    }
    return map
  }, [rows])

  // A slate can vanish under the editor (promoted to a court, cancelled elsewhere)
  useEffect(() => {
    if (editingId != null && !rows.some(r => r.id === editingId)) {
      setEditingId(null)
      setEditDraft([null, null, null, null])
    }
  }, [rows, editingId])

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
    if (editDraft.filter(Boolean).length !== 4) {
      toast('A slate needs exactly 4 players', 'error')
      return
    }
    try {
      await updateSlate(row.id, {
        team1_p1: editDraft[0], team1_p2: editDraft[1],
        team2_p1: editDraft[2], team2_p2: editDraft[3],
      })
      toast('Slated lineup updated', 'success')
      exitEdit()
    } catch (err) {
      toast(err?.data?.error ?? 'Could not update slate', 'error')
    }
  }

  async function handleCancel(row) {
    try {
      await cancelSlate(row.id)
      toast('Slated match cancelled — players returned to waiting', 'info')
      if (editingId === row.id) exitEdit()
    } catch (err) {
      toast(err?.data?.error ?? 'Could not cancel slate', 'error')
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

            <span className={cn('shrink-0 rounded-full px-2.5 py-1 text-2xs font-extrabold uppercase tracking-wider', VIOLET_TAG)}>
              slated #{row.slate_seq}
            </span>

            {editing ? (
              <>
                <Button size="xs" data-testid="slate-save" onClick={() => handleSave(row)}>Save</Button>
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
