import { useEffect, useRef, useState } from 'react'
import { wsUrl } from '../lib/api'

/** Live camera summaries (1/s) and alerts (instant) for every zone. */
export function useEvents(onAlert) {
  const [summaries, setSummaries] = useState({})
  const [connected, setConnected] = useState(false)
  const onAlertRef = useRef(onAlert)
  useEffect(() => {
    onAlertRef.current = onAlert
  })

  useEffect(() => {
    let ws
    let retry
    let closed = false
    const connect = () => {
      ws = new WebSocket(wsUrl('/api/ws/events'))
      ws.onopen = () => setConnected(true)
      ws.onmessage = (e) => {
        const msg = JSON.parse(e.data)
        if (msg.type === 'cameras') {
          setSummaries(Object.fromEntries(msg.cameras.map((c) => [c.id, c])))
        } else if (msg.type === 'alert') {
          onAlertRef.current?.(msg.alert)
        }
      }
      ws.onclose = () => {
        setConnected(false)
        if (!closed) retry = setTimeout(connect, 1500)
      }
    }
    connect()
    return () => {
      closed = true
      clearTimeout(retry)
      ws?.close()
    }
  }, [])

  return { summaries, connected }
}
