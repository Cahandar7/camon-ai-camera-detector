import { alertText, useI18n } from '../i18n/core'
import Icon from './Icon'

const ICON = { pollution: 'alert', dwell: 'clock', resolved: 'check' }

export default function Toasts({ toasts, onOpen, onDismiss }) {
  const { t } = useI18n()
  return (
    <div className="toasts" aria-live="polite">
      {toasts.map((a) => {
        const { title, message } = alertText(a, t)
        return (
          <div key={a.id} className={`toast sev-${a.severity}`}>
            <button className="toast-main" onClick={() => onOpen(a)}>
              <span className="alert-icon">
                <Icon name={ICON[a.type] ?? 'alert'} size={16} />
              </span>
              <span>
                <b>{title}</b>
                <span>
                  {a.camera_name}
                  {a.zone ? ` · ${a.zone}` : ''} — {message}
                </span>
              </span>
            </button>
            <button className="icon-btn sm" onClick={() => onDismiss(a.id)} title={t('dismiss')}>
              <Icon name="x" size={14} />
            </button>
          </div>
        )
      })}
    </div>
  )
}
