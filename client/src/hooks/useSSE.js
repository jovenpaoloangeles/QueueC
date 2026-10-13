import { useEffect, useRef } from 'react'

export function useSSE(onMessage) {
  const onMessageRef = useRef(onMessage)
  onMessageRef.current = onMessage

  useEffect(() => {
    let es
    let retryTimer

    function connect() {
      es = new EventSource('/api/sse')
      es.addEventListener('state', e => {
        try { onMessageRef.current(JSON.parse(e.data)) } catch {}
      })
      es.onerror = () => {
        es.close()
        retryTimer = setTimeout(connect, 3000)
      }
    }

    connect()
    return () => { es?.close(); clearTimeout(retryTimer) }
  }, [])
}
