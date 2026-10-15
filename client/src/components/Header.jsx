import { useState, useEffect } from 'react'
import { cn, fmtDur, fmtClock, netWait } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { toggleTheme } from '@/lib/theme'
import EndSessionConfirmDialog from './EndSessionConfirmDialog.jsx'

export default function Header({ session, sseData, draftedIds = new Set(), onSmartMatch, onAddPlayer, onNewSession, onEndSession }) {
  const [elapsed, setElapsed] = useState(0)
  const [confirmEnd, setConfirmEnd] = useState(false)

  useEffect(() => {
    if (!session || session.started_at == null) return
    const base = Math.floor(Date.now() / 1000) - session.started_at
    setElapsed(base)
    const id = setInterval(() => setElapsed(e => e + 1), 1000)
    return () => clearInterval(id)
  }, [session?.id, session?.started_at])

  const fmtTime = ts => ts ? new Date(ts * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '—'

  // ---- live indicators, all derived client-side from the SSE payload ----
  const queue = sseData?.queue ?? []
  const courts = sseData?.courts ?? []
  const stats = sseData?.stats
  const serverTime = sseData?.serverTime ?? Math.floor(Date.now() / 1000)

  const courtsLive = courts.filter(c =>
    c.enabled &&
    (c.expires_at == null || serverTime < c.expires_at) &&
    (c.active_from == null || serverTime >= c.active_from) &&
    (c.active_until == null || serverTime < c.active_until)
  ).length

  // staged entries are excluded server-side from the SSE queue; drafted entries
  // (sitting in a court's lineup slots) are held locally and don't read as available
  const waiting = queue.filter(e => e.status === 'waiting' && !draftedIds.has(e.id))
  const longest = waiting.reduce(
    (best, e) => {
      const secs = netWait(serverTime, e)
      return secs > best.secs ? { secs, name: e.name } : best
    },
    { secs: 0, name: null }
  )

  const Sep = <span className="mx-2 h-3.5 w-px shrink-0 bg-border" aria-hidden="true" />

  // session name "NAME (date)" → two-line block: NAME (uppercased) over date;
  // without ' (' the full name renders on the single name line (defensive path)
  function SessionNameBlock({ name }) {
    const idx = (name ?? '').indexOf(' (')
    const namePart = idx === -1 ? (name ?? '') : name.slice(0, idx)
    const datePart = idx === -1 ? null : name.slice(idx + 2, name.length - 1)
    return (
      <span data-testid="header-session-name" className="flex flex-col leading-tight">
        <span className="text-sm font-semibold text-foreground">{namePart.toUpperCase()}</span>
        {datePart != null && (
          <span className="text-2xs text-muted-foreground">{datePart}</span>
        )}
      </span>
    )
  }

  return (
    <div className="flex h-14 shrink-0 items-center justify-between gap-4 bg-card px-4">
      {/* brand — one line; session name split into NAME over date as two lines */}
      <div className="flex items-baseline gap-3">
        <span className="text-base font-semibold text-foreground">🏸 QueueC</span>
        {session ? (
          <>
            <SessionNameBlock name={session.name} />
            <span data-testid="header-time-range" className="text-2xs uppercase tracking-wider text-muted-foreground">
              {fmtTime(session.scheduled_start)}–{fmtTime(session.scheduled_end)}
            </span>
          </>
        ) : (
          <span className="text-2xs uppercase tracking-wider text-muted-foreground">No active session</span>
        )}
      </div>

      {/* live status indicators — mockup `.indicators`, hidden under lg */}
      <div className="hidden lg:flex items-center gap-1 rounded-xl border border-border bg-muted px-3 py-1.5 text-xs">
        <span className="inline-block size-1.5 shrink-0 animate-pulse rounded-full bg-green-600" aria-hidden="true" />
        <span className="text-muted-foreground">Courts:</span>
        <b data-testid="hdr-courts" className="font-extrabold tabular-nums">{courtsLive} / {courts.length}</b>
        {Sep}
        <span className="inline-block size-1.5 shrink-0 rounded-full bg-amber-500" aria-hidden="true" />
        <span className="text-muted-foreground">Waiting:</span>
        <b data-testid="hdr-waiting" className="font-extrabold tabular-nums text-amber-600 dark:text-amber-400">
          {waiting.length}
        </b>
        {Sep}
        <span className="inline-block size-1.5 shrink-0 rounded-full bg-red-500" aria-hidden="true" />
        <span className="text-muted-foreground">Longest:</span>
        <b data-testid="hdr-longest" className={cn('font-extrabold', !longest.name && 'text-muted-foreground')}>
          {longest.name
            ? <>{longest.name} <span className="font-mono font-semibold text-amber-600 dark:text-amber-400">({fmtDur(longest.secs)})</span></>
            : '—'}
        </b>
        {Sep}
        <span className="text-muted-foreground">Avg wait:</span>
        <b data-testid="hdr-avg" className="font-mono font-extrabold tabular-nums">
          {fmtClock(stats?.avg_wait_seconds)}
        </b>
      </div>

      {/* quick actions + session controls */}
      <div className="flex items-center gap-2">
        {session && session.started_at != null && (
          <Badge variant="outline" className="font-mono tabular-nums text-primary border-primary/30">
            ● {fmtDur(elapsed)}
          </Badge>
        )}
        {session && session.started_at == null && (
          <Badge variant="outline" className="text-2xs uppercase tracking-wider text-muted-foreground">
            Not started
          </Badge>
        )}
        <Button
          size="sm"
          data-testid="btn-smart-match"
          title="Auto-match across all free courts"
          disabled={!session || session.started_at == null}
          onClick={() => onSmartMatch?.()}
        >
          ✨ Smart Match
        </Button>
        <Button
          size="sm"
          variant="outline"
          data-testid="btn-add-player"
          title="Add player to active session"
          onClick={() => onAddPlayer?.()}
        >
          + Add Player
        </Button>
        {session && session.started_at != null && (
          <Button
            size="sm"
            variant="ghost"
            data-testid="btn-new-session"
            title="End this session and return to setup"
            onClick={() => onNewSession?.()}
          >
            ⟳ New Session
          </Button>
        )}
        <Button
          size="sm"
          variant="ghost"
          data-testid="btn-dark-toggle"
          aria-label="Toggle dark mode"
          title="Toggle dark mode"
          className="px-2"
          onClick={() => toggleTheme()}
        >
          ☾
        </Button>
        {session && onEndSession && (
          <>
            <Button size="sm" variant="destructive" onClick={() => setConfirmEnd(true)}>
              End Session
            </Button>
            <EndSessionConfirmDialog
              open={confirmEnd}
              onOpenChange={setConfirmEnd}
              onConfirm={() => {
                setConfirmEnd(false)
                onEndSession?.()
              }}
            />
          </>
        )}
      </div>
    </div>
  )
}
