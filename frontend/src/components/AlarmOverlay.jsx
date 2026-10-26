import { useI18n } from '../i18n/core'
import Icon from './Icon'

/**
 * Full-screen alarm effect. Critical alerts: pulsing red vignette, a sweeping scan
 * line and a "GARBAGE DETECTED" banner; warnings: a short amber edge flash.
 * Purely visual — sound is played separately (lib/sound.js).
 */
export default function AlarmOverlay({ alarm, onOpen, onClose }) {
  const { t } = useI18n()
  if (!alarm) return null
  const critical = alarm.severity === 'critical'

  return (
    <div className={`alarm ${critical ? 'is-critical' : 'is-warning'}`} key={alarm.key}>
      <div className="alarm-vignette" />
      {critical && <div className="alarm-sweep" />}
      {critical && (
        <div className="alarm-banner" role="alert">
          <span className="alarm-icon">
            <Icon name="alert" size={22} />
          </span>
          <span className="alarm-text">
            <b>{t('garbageDetected')}</b>
            <span>
              {alarm.camera_name}
              {alarm.zone ? ` · ${alarm.zone}` : ''}
              {alarm.score != null ? ` · ${t.pct(Math.round(alarm.score))}` : ''}
            </span>
          </span>
          {alarm.camera_id && (
            <button className="btn btn-danger sm" onClick={onOpen}>
              {t('openCamera')}
            </button>
          )}
          <button className="icon-btn sm alarm-close" onClick={onClose} title={t('close')}>
            <Icon name="x" size={16} />
          </button>
        </div>
      )}
    </div>
  )
}
