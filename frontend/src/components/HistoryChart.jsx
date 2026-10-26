import { useMemo } from 'react'
import { useI18n } from '../i18n/core'

const W = 600
const H = 150
const WINDOW = 600 // seconds shown

/** Cleanliness over the last 10 minutes with the alert threshold marked. */
export default function HistoryChart({ history, threshold }) {
  const { t } = useI18n()
  const chart = useMemo(() => {
    if (history.length < 2) return null
    const end = history[history.length - 1][0]
    const points = history.filter((p) => p[0] >= end - WINDOW)
    const start = points[0][0]
    const span = Math.max(end - start, 1)
    const x = (ts) => ((ts - start) / span) * W
    const y = (v) => H - (v / 100) * H
    const line = points.map((p, i) => `${i ? 'L' : 'M'}${x(p[0]).toFixed(1)},${y(p[1]).toFixed(1)}`).join('')
    const area = `${line}L${W},${H}L0,${H}Z`
    return { line, area, span }
  }, [history])

  const minutes = chart ? Math.round(chart.span / 60) : 0

  return (
    <div className="panel chart-card">
      <div className="card-head">
        <span className="eyebrow">{t('history')}</span>
        <span className="card-head-note">
          <i className="swatch dashed-warn" /> {t('alertAt', { pct: t.pct(threshold) })}
        </span>
      </div>
      {chart ? (
        <div className="chart">
          <div className="chart-y">
            <span>100</span>
            <span>50</span>
            <span>0</span>
          </div>
          <div className="chart-plot">
            <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none">
              <defs>
                <linearGradient id="chart-fill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0" style={{ stopColor: 'var(--accent)', stopOpacity: 0.28 }} />
                  <stop offset="1" style={{ stopColor: 'var(--accent)', stopOpacity: 0 }} />
                </linearGradient>
              </defs>
              {[25, 50, 75].map((v) => (
                <line key={v} x1="0" x2={W} y1={H - (v / 100) * H} y2={H - (v / 100) * H} className="chart-grid" />
              ))}
              <path d={chart.area} fill="url(#chart-fill)" />
              <path d={chart.line} className="chart-line" />
              <line
                x1="0"
                x2={W}
                y1={H - (threshold / 100) * H}
                y2={H - (threshold / 100) * H}
                className="chart-threshold"
              />
            </svg>
            <div className="chart-x">
              <span>{minutes >= 1 ? t('agoMin', { n: minutes }) : t('agoSec', { n: Math.round(chart.span) })}</span>
              <span>{t('now')}</span>
            </div>
          </div>
        </div>
      ) : (
        <div className="card-empty">{t('collecting')}</div>
      )}
    </div>
  )
}
