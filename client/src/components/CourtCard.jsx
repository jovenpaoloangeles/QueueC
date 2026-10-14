import { useState } from 'react'
import { drag, valid, useDragSource, rearrange } from '@/lib/dnd'
import { cn, fmtClock, fmtDur } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { updateMatchTeams, updateCourt, bumpShuttles, extendCourt } from '../api.js'
import { useToast } from '@/components/Toast'
import EndMatchModal from './EndMatchModal.jsx'
import ConfirmEndDialog from './ConfirmEndDialog.jsx'

function playerName(queue, entryId) {
  return queue.find(e => e.id === entryId)?.name ?? '?'
}

function TeamPlayer({ entryId, name }) {
  const dragProps = useDragSource(() => ({ kind: 'player', entryId, status: 'playing' }))
  return (
    <span
      {...dragProps}
      onDragStart={e => { e.stopPropagation(); dragProps.onDragStart(e) }}
    >
      {name}
    </span>
  )
}

function TeamPanel({ side, entryIds, queue, matchId, match }) {
  const dragProps = useDragSource(() => ({ kind: 'team', matchId, side }))
  const [over, setOver] = useState(false)
  const toast = useToast()
  const sideOf = id =>
    [match.team1_p1, match.team1_p2].includes(id) ? 1
    : [match.team2_p1, match.team2_p2].includes(id) ? 2 : null
  const p = drag.current
  const fromSide = p?.kind === 'player' ? sideOf(p.entryId) : null
  const canDrop = !!p && (p.kind === 'team'
    ? valid('team') && p.matchId === matchId && p.side !== side
    : fromSide != null && fromSide !== side)

  return (
    <div
      {...dragProps}
      data-drop={`team-${side}-m${matchId}`}
      data-team-side={side}
      data-match-id={matchId}
      onDragOver={e => { e.preventDefault(); setOver(true) }}
      onDragLeave={() => setOver(false)}
      onDrop={e => {
        e.preventDefault(); setOver(false)
        const q = drag.current
        if (!q) return
        if (q.kind === 'team') {
          if (valid('team') && q.matchId === matchId && q.side !== side) {
            updateMatchTeams(match.id, rearrange(match, q.side, side))
              .catch(err => toast(err?.data?.error ?? 'Could not update teams', 'error'))
          }
        } else if (q.kind === 'player') {
          const from = sideOf(q.entryId)
          if (from != null && from !== side) {
            updateMatchTeams(match.id, rearrange(match, from, side, q.entryId))
              .catch(err => toast(err?.data?.error ?? 'Could not update teams', 'error'))
          }
        }
      }}
      className={cn(
        'rounded-lg border border-border bg-card/80 px-4 py-3 transition-colors',
        over && canDrop && 'border-drop-target-border bg-drop-target',
        over && drag.current && !canDrop && 'border-drop-invalid-border bg-drop-invalid'
      )}
    >
      <div className="text-base font-medium">
        {entryIds.filter(Boolean).map((id, i) => (
          <span key={id}>
            {i > 0 && ' + '}
            <TeamPlayer entryId={id} name={playerName(queue, id)} />
          </span>
        ))}
      </div>
    </div>
  )
}

/** One lineup slot — drop target for a waiting/resting player, clearable once filled. */
function Slot({ courtId, idx, entryId, name, draftedIds = new Set(), draft = [], onDropSlot, onClearSlot }) {
  const [over, setOver] = useState(false)
  const payload = drag.current // read live: drop can run before a dragover re-render flushes
  const filled = entryId != null
  // a player already drafted anywhere (here or another court) can't be dropped again
  const droppable = p => valid('slot', p) && !draftedIds.has(p.entryId) && !draft.includes(p.entryId)
  const canDrop = !filled && !!payload && droppable(payload)

  return (
    <div
      data-drop="slot"
      data-court-id={courtId}
      data-slot-idx={idx}
      data-testid={`slot-${idx}`}
      onDragOver={e => { e.preventDefault(); e.stopPropagation(); setOver(true) }}
      onDragLeave={() => setOver(false)}
      onDrop={e => {
        // stopPropagation: this drop is consumed by the slot, not the court-level zone
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
            data-testid={`slot-clear-${idx}`}
            aria-label={`Clear ${name} from lineup`}
            onClick={() => onClearSlot(idx)}
            className="font-bold text-muted-foreground hover:text-destructive"
          >×</button>
        </span>
      ) : 'Drop…'}
    </div>
  )
}

/** 2×2 lineup matrix (mockup .slots): Team A = slots 0,1; Team B = slots 2,3. */
function SlotsMatrix({ courtId, draft, draftedIds = new Set(), queue, title, onDropSlot, onClearSlot, onClearDraft }) {
  const filled = draft.filter(Boolean).length
  const column = (label, idxs, sideB) => (
    <div className={cn('flex flex-col gap-1.5', sideB && 'b')}>
      <span className={cn('text-2xs font-bold uppercase tracking-wider', sideB ? 'text-emerald-600' : 'text-sky-600')}>
        {label}
      </span>
      {idxs.map(i => (
        <Slot
          key={i}
          courtId={courtId}
          idx={i}
          entryId={draft[i]}
          name={draft[i] ? playerName(queue, draft[i]) : null}
          draftedIds={draftedIds}
          draft={draft}
          onDropSlot={onDropSlot}
          onClearSlot={onClearSlot}
        />
      ))}
    </div>
  )

  return (
    <div className="flex flex-col gap-2 rounded-lg border border-border bg-muted px-2.5 py-2">
      <div className="flex items-center justify-between gap-2 text-2xs">
        <span className="font-semibold uppercase tracking-wider text-muted-foreground">{title}</span>
        <span className="flex items-center gap-2">
          <span className="font-mono tabular-nums text-muted-foreground">({filled}/4 filled)</span>
          {filled > 0 && (
            <Button variant="ghost" size="xs" data-testid="btn-clear-draft" onClick={onClearDraft}>Clear</Button>
          )}
        </span>
      </div>
      <div className="grid grid-cols-2 gap-2">
        {column('Team A', [0, 1], false)}
        {column('Team B', [2, 3], true)}
      </div>
    </div>
  )
}

/** Shuttle counter stepper (mockup .shuttles). Server clamps both counts at 0. */
function ShuttleStepper({ testId, label, value, tone, onDelta }) {
  return (
    <span className="flex items-center gap-1.5 rounded-lg border border-border bg-card px-2 py-0.5 text-2xs" data-testid={testId}>
      <b className={cn('font-mono text-xs font-bold tabular-nums', tone)}>{value}</b>
      <span className="text-muted-foreground">{label}</span>
      <button
        type="button"
        aria-label={`${label} shuttles +`}
        className="px-0.5 font-bold text-muted-foreground hover:text-foreground"
        onClick={() => onDelta(1)}
      >+</button>
      <button
        type="button"
        aria-label={`${label} shuttles −`}
        className="px-0.5 font-bold text-muted-foreground hover:text-foreground"
        onClick={() => onDelta(-1)}
      >−</button>
    </span>
  )
}

export default function CourtCard({
  court, match, queue, playSeconds, serverTime,
  onStartClick, onStartSingles, canStart,
  onDropPlayer, canDropPlayer,
  draft = [], draftedIds = new Set(), onDropSlot, onClearSlot, onClearDraft,
}) {
  const [showEnd, setShowEnd] = useState(false)
  const [showConfirm, setShowConfirm] = useState(false)
  const [over, setOver] = useState(false)
  const toast = useToast()
  const isActive = !!match
  const secs = isActive ? (playSeconds.get(match.id) ?? 0) : 0

  // Independent countdown expiration logic (remaining_ms = expires_at - now())
  const hasTimer = court.expires_at != null
  const remainingSecs = hasTimer ? Math.max(0, court.expires_at - (serverTime ?? Math.floor(Date.now() / 1000))) : null
  const isExpired = hasTimer && remainingSecs <= 0
  const isExpiring = isExpired && isActive // timer hit zero mid-game — Last Game

  const draftFilled = draft.filter(Boolean)
  const canStartSingles = !isActive && draftFilled.length === 2 // any two slots → singles

  // live check: drop may run before the dragover re-render flushes (batched), so never snapshot it.
  // Resting players are welcome too — a lineup slot takes them straight out of rest.
  const dropAllowed = () => {
    const p = drag.current
    const isPlayer = p?.kind === 'player' && (p.status === 'waiting' || p.status === 'resting')
    return isPlayer && canDropPlayer(p.entryId)
  }
  const canAcceptNewMatch = !isExpired

  async function handleExtend() {
    try {
      await extendCourt(court.id, 60)
      toast('Court extended by 60 min', 'success')
    } catch (err) {
      toast(err?.data?.error ?? 'Could not extend court', 'error')
    }
  }

  async function handleShuttle(kind, delta) {
    const d = kind === 'new' ? { delta_new: delta, delta_used: 0 } : { delta_new: 0, delta_used: delta }
    try {
      await bumpShuttles(match.id, d)
    } catch (err) {
      toast(err?.data?.error ?? 'Could not update shuttles', 'error')
    }
  }

  return (
    <Card
      data-drop={`court-${court.id}`}
      className={cn('flex flex-col border-border bg-card shadow-sm',
        isExpiring && 'border-amber-400 bg-amber-50/40',
        isExpired && !isActive && 'animate-redpulse border-destructive',
        isActive && !isExpiring && 'border-court-live-border bg-court-live')}
    >
      {/* grid-cols wins outright (base has no unconditional grid-cols); items-center! is important so it beats base items-start regardless of emission order */}
      <CardHeader className="grid-cols-[1fr_auto] items-center! pb-3">
        <div className="flex items-center gap-2">
          <span className="text-2xs font-medium uppercase tracking-wider text-muted-foreground">{court.label}</span>
          {isActive && <Badge variant="outline" className="text-2xs uppercase">{match.format}</Badge>}
          {isActive && !isExpiring && (
            <span data-testid="live-badge" className="flex items-center gap-1 text-2xs font-extrabold uppercase tracking-wider text-green-600">
              <span className="inline-block size-1.5 animate-pulse rounded-full bg-green-600" aria-hidden="true" />
              LIVE
            </span>
          )}
          {isExpiring && (
            <Badge className="border-0 bg-amber-100 text-amber-800 text-2xs uppercase" data-testid="expiring-last-game-badge">
              ⏳ Last Game
            </Badge>
          )}
          {isExpired && !isActive && (
            <span data-testid="expired-badge" className="text-2xs font-extrabold uppercase tracking-wider text-red-600">
              EXPIRED
            </span>
          )}
        </div>
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-1 text-xs text-muted-foreground cursor-pointer select-none">
            <input
              type="checkbox"
              checked={!!court.enabled}
              onChange={e => updateCourt(court.id, { enabled: e.target.checked ? 1 : 0 }).catch(() => {})}
            />
            Open
          </label>
          {hasTimer && (
            <span
              className={cn(
                'font-mono text-sm tabular-nums',
                isExpired ? 'font-semibold text-red-600' : remainingSecs < 15 * 60 ? 'text-amber-600' : 'text-foreground'
              )}
              data-testid="court-countdown"
            >
              ⏱ {fmtDur(remainingSecs)}
            </span>
          )}
          {isActive && <span className="font-mono text-sm tabular-nums text-foreground">{fmtClock(secs)}</span>}
          {isActive && (
            <Button variant="destructive" size="sm" onClick={() => setShowConfirm(true)}>End Match</Button>
          )}
        </div>
      </CardHeader>

      {isActive && (
        <CardContent className="flex flex-1 flex-col justify-center gap-2">
          <div className="flex items-center justify-between border-b border-dashed border-border pb-1 text-2xs">
            <span className="font-extrabold uppercase tracking-wider text-green-600">● Live match</span>
            <span className="font-mono tabular-nums text-muted-foreground">{fmtClock(secs)}</span>
          </div>
          <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3">
            <div className="flex flex-col gap-1">
              <span className="text-2xs font-bold uppercase tracking-wider text-sky-600">Team A</span>
              <TeamPanel side={1} entryIds={[match.team1_p1, match.team1_p2]} queue={queue} matchId={match.id} match={match} />
            </div>
            <div className="flex flex-col items-center gap-0.5">
              <span className="font-mono text-3xl tabular-nums text-foreground">
                {match.team1_score ?? 0}<span className="mx-1.5 text-muted-foreground/40">–</span>{match.team2_score ?? 0}
              </span>
              <span className="text-2xs uppercase tracking-wider text-muted-foreground">vs</span>
            </div>
            <div className="flex flex-col gap-1">
              <span className="text-2xs font-bold uppercase tracking-wider text-emerald-600">Team B</span>
              <TeamPanel side={2} entryIds={[match.team2_p1, match.team2_p2]} queue={queue} matchId={match.id} match={match} />
            </div>
          </div>
          <div className="flex items-center justify-between rounded-lg border border-border bg-muted px-2.5 py-1.5 text-2xs">
            <span className="font-semibold uppercase tracking-wider text-muted-foreground">🏸 Shuttles</span>
            <div className="flex gap-1.5">
              <ShuttleStepper testId="shuttle-new" label="New" value={match.new_shuttles ?? 0} tone="text-green-600" onDelta={d => handleShuttle('new', d)} />
              <ShuttleStepper testId="shuttle-used" label="Used" value={match.used_shuttles ?? 0} tone="text-amber-600" onDelta={d => handleShuttle('used', d)} />
            </div>
          </div>
          {/* drafting here pre-builds the NEXT lineup — auto-slates for the next free court at 4/4 */}
          <SlotsMatrix
            courtId={court.id}
            draft={draft}
            draftedIds={draftedIds}
            queue={queue}
            title="Next match lineup"
            onDropSlot={onDropSlot}
            onClearSlot={onClearSlot}
            onClearDraft={onClearDraft}
          />
        </CardContent>
      )}

      {!isActive && (
        <CardContent
          data-drop={`court-${court.id}`}
          onDragOver={e => { if (canAcceptNewMatch) { e.preventDefault(); setOver(true) } }}
          onDragLeave={() => setOver(false)}
          onDrop={e => {
            e.preventDefault(); setOver(false)
            if (canAcceptNewMatch && dropAllowed()) onDropPlayer(court.id, drag.current.entryId)
          }}
          className={cn(
            'flex flex-1 flex-col justify-center gap-2',
            isExpired && 'bg-red-50/40',
            over && canAcceptNewMatch && dropAllowed() && 'bg-drop-target ring-2 ring-drop-target-border',
            over && canAcceptNewMatch && drag.current && !dropAllowed() && 'bg-drop-invalid ring-2 ring-drop-invalid-border'
          )}
        >
          {isExpired ? (
            <div className="flex flex-col items-center gap-2 rounded-lg border border-red-200 bg-red-50/60 px-3 py-6 text-center">
              <span className="text-xs font-bold text-red-700">
                ⚠ Rental time has run out — court removed from the available pool
              </span>
              <Button variant="destructive" size="sm" data-testid="btn-extend-court" onClick={handleExtend}>
                Extend +1 Hour
              </Button>
            </div>
          ) : (
            <>
              <SlotsMatrix
                courtId={court.id}
                draft={draft}
                draftedIds={draftedIds}
                queue={queue}
                title="2×2 Match Lineup"
                onDropSlot={onDropSlot}
                onClearSlot={onClearSlot}
                onClearDraft={onClearDraft}
              />
              <p className="text-center text-2xs text-muted-foreground">
                <span className="font-medium text-foreground/80">
                  {canStart ? 'Drop players here' : 'Select 2 or 4 players'}
                </span>
                {' · '}
                {canStart ? 'Or start with the players already selected' : 'Drag from the queue, or click to select'}
              </p>
              <div className="flex items-center justify-end gap-2">
                {canStartSingles && (
                  <Button size="sm" data-testid="btn-start-singles" onClick={onStartSingles}>
                    Start Singles
                  </Button>
                )}
                <Button
                  size="sm"
                  data-testid="btn-start-match"
                  disabled={!canStart}
                  onClick={() => onStartClick()}
                >
                  Start Match
                </Button>
              </div>
            </>
          )}
        </CardContent>
      )}

      <ConfirmEndDialog
        open={showConfirm}
        onOpenChange={setShowConfirm}
        onConfirm={() => { setShowConfirm(false); setShowEnd(true) }}
      />
      {showEnd && match && <EndMatchModal match={match} onClose={() => setShowEnd(false)} />}
    </Card>
  )
}
