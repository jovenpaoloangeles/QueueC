import { useState, useEffect } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'

function fmt(s) {
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60
  return `${h ? h + ':' : ''}${String(m).padStart(2,'0')}:${String(sec).padStart(2,'0')}`
}

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
    <div className="flex flex-col bg-card">
      <div className="flex justify-between items-center px-3.5 py-1.5 text-xs">
        <div className="flex items-center gap-3">
          <span className="font-bold text-sm text-foreground">🏸 QueueC</span>
          {session ? (
            <>
              <span className="text-muted-foreground/30">·</span>
              <span className="text-muted-foreground">{session.name}</span>
              <span className="text-muted-foreground/30">·</span>
              <span className="text-muted-foreground/60">{fmtTime(session.scheduled_start)}–{fmtTime(session.scheduled_end)}</span>
            </>
          ) : (
            <span className="text-muted-foreground/20">No active session</span>
          )}
        </div>
        <div className="flex items-center gap-2.5">
          {session && (
            <Badge variant="outline" className="text-primary border-primary/30 text-[10px] px-1.5 py-0">
              ● {fmt(elapsed)}
            </Badge>
          )}
          <Button variant="outline" size="xs" onClick={onNewSession}>
            + Session
          </Button>
        </div>
      </div>
      <Separator />
    </div>
  )
}
