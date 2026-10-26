import { useEffect, useRef, useState } from 'react'
import { wsUrl } from '../lib/api'

const UI_INTERVAL = 200 // ms — panels refresh 5×/s; the canvas overlay gets every result

const EMPTY = {
  status: 'connecting',
  error: '',
  stats: null,
  fps: null,
  latency: null,
  resolution: null,
  detections: [],
  history: [],
}

/**
 * Subscribes to one camera's AI results. Every message goes straight to
 * `onDetections` (the canvas overlay, no React render); React state used by the
 * panels is throttled so 15–20 results/s don't re-render the whole dashboard.
 */
export function useCameraFeed(cameraId, onDetections) {
  const [feed, setFeed] = useState(EMPTY)
  const onDetectionsRef = useRef(onDetections)
  useEffect(() => {
    onDetectionsRef.current = onDetections
  })

  useEffect(() => {
    if (!cameraId) return undefined
    let ws
    let retry
    let timer = null
    let closed = false
    let latest = null
    const points = []

    const flush = () => {
      timer = null
      const msg = latest
      const newPoints = points.splice(0)
      setFeed((f) => ({
        ...f,
        status: 'online',
        error: '',
        stats: msg.stats,
        fps: msg.fps,
        latency: msg.latency_ms,
        resolution: msg.resolution,
        detections: msg.detections,
        history: newPoints.length ? [...f.history, ...newPoints].slice(-600) : f.history,
      }))
    }

    const connect = () => {
      ws = new WebSocket(wsUrl(`/api/ws/cameras/${cameraId}`))
      ws.onmessage = (e) => {
        const msg = JSON.parse(e.data)
        if (msg.type === 'result') {
          onDetectionsRef.current?.(msg.detections, msg.resolution)
          latest = msg
          if (msg.point) points.push(msg.point)
          if (!timer) timer = setTimeout(flush, UI_INTERVAL)
        } else if (msg.type === 'init' || msg.type === 'status') {
          const s = msg.summary
          if (s.status !== 'online') onDetectionsRef.current?.([], null)
          setFeed((f) => ({
            ...f,
            status: s.status,
            error: s.error,
            fps: s.fps,
            stats: f.stats ?? (s.score != null ? { score: s.score, level: s.level, people: s.people, litter: s.litter } : null),
            history: msg.history ?? f.history,
          }))
        }
      }
      ws.onclose = () => {
        if (!closed) retry = setTimeout(connect, 1500)
      }
    }
    connect()
    return () => {
      closed = true
      clearTimeout(retry)
      clearTimeout(timer)
      ws?.close()
    }
  }, [cameraId])

  return feed
}
