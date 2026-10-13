import { useState, useEffect } from 'react'

export function useTimers(serverTime, queue, activeMatches) {
  const [tick, setTick] = useState(0)

  useEffect(() => {
    const id = setInterval(() => setTick(t => t + 1), 1000)
    return () => clearInterval(id)
  }, [])

  const now = (serverTime ?? Math.floor(Date.now() / 1000)) + tick

  const waitSeconds = new Map()
  for (const e of queue ?? []) {
    if (e.status === 'waiting') {
      waitSeconds.set(e.id, Math.max(0, now - e.checked_in_at - e.total_seconds_played))
    }
  }

  const playSeconds = new Map()
  for (const m of activeMatches ?? []) {
    playSeconds.set(m.id, Math.max(0, now - m.started_at))
  }

  return { waitSeconds, playSeconds }
}
