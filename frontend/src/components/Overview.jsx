import { useEffect, useState } from 'react'
import { useI18n } from '../i18n/core'
import { snapshotUrl } from '../lib/api'
import { STATUS_CLASS, levelColor } from '../lib/constants'
import { pct } from '../lib/format'
import Icon from './Icon'

/** Every camera at a glance. Tiles refresh snapshots instead of holding open streams. */
export default function Overview({ cameras, onOpen, onAdd }) {
  const { t } = useI18n()
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1500)
    return () => clearInterval(timer)
  }, [])

  return (
    <main className="overview">
      <div className="overview-head">
        <div>
          <h1>{t('allZones')}</h1>
          <p>{t('overviewSub', { n: cameras.length })}</p>
        </div>
        <button className="btn btn-primary" onClick={onAdd}>
          <Icon name="plus" size={16} /> {t('addCamera')}
        </button>
      </div>
      <ZonesSummary cameras={cameras} />
      <div className="overview-grid">
        {cameras.map((c) => {
          const online = c.status === 'online'
          const level = online ? c.level : null
          return (
            <button key={c.id} className={`tile-cam ${level ? `level-${level}` : ''}`} onClick={() => onOpen(c.id)}>
              <div className="tile-cam-media">
                {online ? <Snapshot id={c.id} t={now} /> : <div className="tile-cam-off"><Icon name="wifiOff" size={26} /></div>}
                <span className={`status-pill ${STATUS_CLASS[c.status] ?? ''}`}>
                  <span className="status-dot" />
                  {t(`status_${c.status}`)}
                </span>
                {c.alert && (
                  <span className={`tile-cam-alert ${c.alert}`}>
                    <Icon name="alert" size={14} /> {t('needsCleaning')}
                  </span>
                )}
              </div>
              <div className="tile-cam-body">
                <div>
                  <div className="tile-cam-name">{c.name}</div>
                  <div className="tile-cam-zone">{c.zone || t('noZone')}</div>
                </div>
                <div className="tile-cam-score" style={{ color: levelColor(level) }}>
                  {online ? pct(c.score) : '—'}
                  <small>%</small>
                </div>
              </div>
              <div className="tile-cam-stats">
                <span>
                  <Icon name="users" size={14} /> {t('nPeople', { n: online ? c.people : '—' })}
                </span>
                <span>
                  <Icon name="bottle" size={14} /> {t('nLitter', { n: online ? c.litter : '—' })}
                </span>
                <span className="tile-cam-level" style={{ color: levelColor(level) }}>
                  {t(`level_${level ?? 'none'}`)}
                </span>
              </div>
            </button>
          )
        })}
      </div>
    </main>
  )
}

function ZonesSummary({ cameras }) {
  const { t } = useI18n()
  const online = cameras.filter((c) => c.status === 'online' && c.score != null)
  const avg = online.length ? online.reduce((s, c) => s + c.score, 0) / online.length : null
  const sum = (key) => online.reduce((s, c) => s + (c[key] ?? 0), 0)
  const alerts = cameras.filter((c) => c.alert).length
  const items = [
    { icon: 'leaf', label: t('overallCleanliness'), value: avg == null ? '—' : t.pct(pct(avg)), tone: 'accent' },
    { icon: 'camera', label: t('camerasLive'), value: `${online.length}/${cameras.length}` },
    { icon: 'users', label: t('peopleInView'), value: sum('people'), tone: 'person' },
    { icon: 'bottle', label: t('litterOnGround'), value: sum('litter'), tone: 'litter' },
    { icon: 'alert', label: t('zonesToClean'), value: alerts, tone: alerts ? 'danger' : '' },
  ]
  return (
    <div className="zones-summary">
      {items.map((it) => (
        <div key={it.icon} className={`panel tile ${it.tone ? `tone-${it.tone}` : ''}`}>
          <span className="tile-icon">
            <Icon name={it.icon} size={16} />
          </span>
          <span className="tile-value">{it.value}</span>
          <span className="tile-label">{it.label}</span>
        </div>
      ))}
    </div>
  )
}

/** Double-buffered snapshot: the old frame stays visible until the new one has loaded. */
function Snapshot({ id, t }) {
  const [src, setSrc] = useState(null)
  useEffect(() => {
    const img = new Image()
    img.onload = () => setSrc(img.src)
    img.src = snapshotUrl(id, 640, t)
    return () => {
      img.onload = null
    }
  }, [id, t])
  return src ? <img src={src} alt="" /> : <div className="tile-cam-off"><div className="spinner" /></div>
}
