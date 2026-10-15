import { useState, useEffect } from 'react'
import { netWait } from '@/lib/utils'

export function useTimers(serverTime, queue, activeMatches) {
  const [tick, setTick] = useState(0)

  useEffect(() => {
    const id = setInterval(() => setTick(t => t + 1), 1000)
    return () => clearInterval(id)
  }, [])

  useEffect(() => {
    setTick(0)
  }, [serverTime])

  const now = (serverTime ?? Math.floor(Date.now() / 1000)) + tick

  const waitSeconds = new Map()
  for (const e of queue ?? []) {
    if (e.status === 'waiting') {
      waitSeconds.set(e.id, netWait(now, e))
    }
  }

  const playSeconds = new Map()
  for (const m of activeMatches ?? []) {
    playSeconds.set(m.id, Math.max(0, now - m.started_at))
  }

  return { waitSeconds, playSeconds }
}
