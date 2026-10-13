import { useState, useEffect } from 'react'
import { fmtDur } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'

export default function Header({ session, onNewSession }) {
  const [elapsed, setElapsed] = useState(0)

  useEffect(() => {
    if (!session) return
    const base = Math.floor(Date.now() / 1000) - session.started_at
    setElapsed(base)
    const id = setInterval(() => setElapsed(e => e + 1), 1000)
    return () => clearInterval(id)
  }, [session?.id])

  const fmtTime = ts => ts ? new Date(ts * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '—'

  return (
    <div className="flex h-14 shrink-0 items-center justify-between gap-4 bg-card px-4">
      <div className="flex items-baseline gap-3">
        <span className="text-base font-semibold text-foreground">🏸 QueueC</span>
        {session ? (
          <>
            <span className="text-base text-muted-foreground">{session.name}</span>
            <span className="text-2xs uppercase tracking-wider text-muted-foreground">
              {fmtTime(session.scheduled_start)}–{fmtTime(session.scheduled_end)}
            </span>
          </>
        ) : (
          <span className="text-2xs uppercase tracking-wider text-muted-foreground">No active session</span>
        )}
      </div>
      <div className="flex items-center gap-3">
        {session && (
          <Badge variant="outline" className="font-mono tabular-nums text-primary border-primary/30">
            ● {fmtDur(elapsed)}
          </Badge>
        )}
        <Button size="sm" onClick={onNewSession}>
          + Session
        </Button>
      </div>
    </div>
  )
}
