import { useI18n } from '../i18n/core'
import { STATUS_CLASS, levelColor } from '../lib/constants'
import { pct } from '../lib/format'
import Icon from './Icon'

export default function Sidebar({ cameras, selectedId, onSelect, onAdd }) {
  const { t } = useI18n()
  const scored = cameras.filter((c) => c.status === 'online' && c.score != null)
  const avg = scored.length ? scored.reduce((s, c) => s + c.score, 0) / scored.length : null
  const online = cameras.filter((c) => c.status === 'online').length
  const alerts = cameras.filter((c) => c.alert).length

  return (
    <aside className="sidebar panel">
      <div className="summary-card">
        <div className="summary-card-top">
          <span className="eyebrow">{t('overallAverage')}</span>
          <span className="summary-online">{t('liveCount', { online, total: cameras.length })}</span>
        </div>
        <div className="summary-score">
          {pct(avg)}
          <small>%</small>
        </div>
        <div className="summary-bar">
          <span style={{ width: `${avg ?? 0}%`, background: avg == null ? 'var(--muted)' : scoreColor(avg) }} />
        </div>
        <div className={`summary-alerts ${alerts ? 'has-alerts' : ''}`}>
          <Icon name={alerts ? 'alert' : 'check'} size={14} />
          {alerts ? t('zonesNeedCleaning', { n: alerts }) : t('allUnderControl')}
        </div>
      </div>

      <div className="sidebar-head">
        <span className="eyebrow">{t('cameras')}</span>
        <button className="icon-btn sm" onClick={onAdd} title={t('addCamera')}>
          <Icon name="plus" size={16} />
        </button>
      </div>

      <ul className="cam-list">
        {cameras.map((c) => {
          const online = c.status === 'online'
          return (
            <li key={c.id}>
              <button
                className={`cam-item ${c.id === selectedId ? 'is-active' : ''} ${c.alert ? `alert-${c.alert}` : ''}`}
                onClick={() => onSelect(c.id)}
              >
                <span className={`status-dot ${STATUS_CLASS[c.status] ?? ''}`} />
                <span className="cam-item-body">
                  <span className="cam-item-name">{c.name}</span>
                  <span className="cam-item-meta">
                    {c.zone || t('noZone')}
                    {online && (
                      <>
                        {' · '}
                        <Icon name="user" size={11} /> {c.people}
                        {' · '}
                        <Icon name="bottle" size={11} /> {c.litter}
                      </>
                    )}
                  </span>
                </span>
                <span className="cam-item-score" style={{ color: levelColor(online ? c.level : null) }}>
                  {online ? t.pct(pct(c.score)) : t(`status_${c.status}`)}
                </span>
              </button>
            </li>
          )
        })}
      </ul>

      <button className="btn btn-ghost add-cam" onClick={onAdd}>
        <Icon name="plus" size={16} /> {t('addCamera')}
      </button>
    </aside>
  )
}

function scoreColor(score) {
  if (score >= 80) return 'var(--ok)'
  if (score >= 60) return 'var(--accent-2)'
  if (score >= 40) return 'var(--warn)'
  return 'var(--danger)'
}
