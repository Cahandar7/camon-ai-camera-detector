import { useI18n } from '../i18n/core'
import { categoryColor } from '../lib/constants'
import { clock } from '../lib/format'
import Gauge from './Gauge'
import Icon from './Icon'

export default function Insights({ feed, health, settings }) {
  const { t } = useI18n()
  const s = feed.stats
  const online = feed.status === 'online'
  const threshold = settings?.alert_threshold ?? 60
  const dwell = settings?.dwell_alert_seconds ?? 30
  const litterCats = (health?.categories ?? []).filter((c) => c.kind === 'litter')
  const counts = litterCats.map((c) => ({ key: c.key, n: s?.by_class?.[c.key] ?? 0 }))
  const max = Math.max(1, ...counts.map((c) => c.n))

  return (
    <div className="insights-top">
      <div className="panel gauge-card">
        <Gauge score={online ? s?.score : null} level={online ? s?.level : null} threshold={threshold} />
      </div>

      <div className="tiles">
        <Tile icon="users" tone="person" label={t('peopleNow')} value={s?.people ?? 0} />
        <Tile icon="bottle" tone="litter" label={t('litterNow')} value={s?.litter ?? 0} />
        <Tile icon="user" label={t('visitorsSeen')} value={s?.visitors ?? 0} />
        <Tile
          icon="clock"
          tone={s?.oldest_litter >= dwell ? 'danger' : ''}
          label={t('oldestLitter')}
          value={s?.oldest_litter ? clock(s.oldest_litter) : '—'}
        />
      </div>

      <div className="panel breakdown">
        <div className="card-head">
          <span className="eyebrow">{t('litterByType')}</span>
          <span className="card-head-note">{t('detectedInSession', { n: s?.litter_seen ?? 0 })}</span>
        </div>
        <ul>
          {counts.map((c) => (
            <li key={c.key} className={c.n ? '' : 'is-zero'}>
              <span className="bd-label">
                <i style={{ background: categoryColor(c.key) }} />
                <span title={t(`cat_${c.key}`)}>{t(`cat_${c.key}`)}</span>
              </span>
              <span className="bd-bar">
                <span style={{ width: `${(c.n / max) * 100}%`, background: categoryColor(c.key) }} />
              </span>
              <span className="bd-n mono">{c.n}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}

function Tile({ icon, label, value, tone = '' }) {
  return (
    <div className={`panel tile ${tone ? `tone-${tone}` : ''}`}>
      <span className="tile-icon">
        <Icon name={icon} size={16} />
      </span>
      <span className="tile-value">{value}</span>
      <span className="tile-label">{label}</span>
    </div>
  )
}
