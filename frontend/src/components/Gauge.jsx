import { useI18n } from '../i18n/core'
import { levelColor } from '../lib/constants'
import { pct } from '../lib/format'

const R = 78
const C = 2 * Math.PI * R
const ARC = 0.75 * C // 270° gauge

/** Cleanliness index: 270° ring, coloured by level, with the alert threshold tick. */
export default function Gauge({ score, level, threshold }) {
  const { t } = useI18n()
  const key = level ?? 'none'
  const value = score == null ? 0 : Math.max(0, Math.min(100, score))
  const angle = ((135 + (270 * threshold) / 100) * Math.PI) / 180
  const tick = (r) => [100 + r * Math.cos(angle), 100 + r * Math.sin(angle)]
  const [x1, y1] = tick(R - 13)
  const [x2, y2] = tick(R + 13)

  return (
    <div className="gauge" style={{ '--level': levelColor(level) }}>
      <svg viewBox="0 0 200 200" className="gauge-svg">
        <circle cx="100" cy="100" r={R} className="gauge-track" strokeDasharray={`${ARC} ${C}`} transform="rotate(135 100 100)" />
        <circle
          cx="100"
          cy="100"
          r={R}
          className="gauge-value"
          strokeDasharray={`${(ARC * value) / 100} ${C}`}
          transform="rotate(135 100 100)"
        />
        <line x1={x1} y1={y1} x2={x2} y2={y2} className="gauge-tick" />
      </svg>
      <div className="gauge-center">
        <div className="gauge-score">
          {pct(score)}
          <small>%</small>
        </div>
        <div className="gauge-label">{t(`level_${key}`)}</div>
      </div>
      <div className="gauge-caption">
        <b>{t('cleanlinessIndex')}</b>
        <span>{t(`hint_${key}`)}</span>
      </div>
    </div>
  )
}
