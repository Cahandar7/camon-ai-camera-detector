import { useEffect, useState } from 'react'
import { alertText, useI18n } from '../i18n/core'
import Icon from './Icon'

const ICON = { pollution: 'alert', dwell: 'clock', resolved: 'check' }

/** Alert history: its own scroll area, so a busy day never stretches the page. */
export default function AlertsFeed({ alerts, currentId, onOpenSnapshot, onSelectCamera, onClear }) {
  const { t } = useI18n()
  const [filter, setFilter] = useState('all')
  const [, tick] = useState(0)
  useEffect(() => {
    const timer = setInterval(() => tick((n) => n + 1), 15000)
    return () => clearInterval(timer)
  }, [])

  const shown = filter === 'camera' ? alerts.filter((a) => a.camera_id === currentId) : alerts

  return (
    <div className="panel alerts">
      <div className="card-head">
        <span className="eyebrow">
          {t('alerts')}
          {alerts.length > 0 && <span className="count-badge">{alerts.length}</span>}
        </span>
        {alerts.length > 0 && (
          <button className="link-btn" onClick={onClear}>
            {t('clear')}
          </button>
        )}
      </div>
      {alerts.length > 0 && (
        <div className="mini-tabs" role="tablist">
          {['all', 'camera'].map((f) => (
            <button key={f} role="tab" aria-selected={filter === f} className={filter === f ? 'is-active' : ''} onClick={() => setFilter(f)}>
              {f === 'all' ? t('filterAll') : t('filterCamera')}
            </button>
          ))}
        </div>
      )}
      {shown.length === 0 ? (
        <div className="card-empty ok">
          <Icon name="check" size={22} />
          {t('allClear')}
        </div>
      ) : (
        <ul className="alert-list">
          {shown.slice(0, 100).map((a) => {
            const { title, message } = alertText(a, t)
            return (
              <li key={a.id} className={`alert-item sev-${a.severity} ${a.camera_id === currentId ? 'is-current' : ''}`}>
                <span className="alert-icon">
                  <Icon name={ICON[a.type] ?? 'alert'} size={16} />
                </span>
                <div className="alert-body">
                  <div className="alert-title">{title}</div>
                  <div className="alert-msg">{message}</div>
                  <button className="alert-meta" onClick={() => onSelectCamera(a.camera_id)}>
                    {a.camera_name}
                    {a.zone ? ` · ${a.zone}` : ''} · {t.timeAgo(a.ts)}
                  </button>
                </div>
                {a.snapshot && (
                  <button className="alert-thumb" onClick={() => onOpenSnapshot(a)} title={t('openSnapshot')}>
                    <img src={a.snapshot} alt="" loading="lazy" />
                  </button>
                )}
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
