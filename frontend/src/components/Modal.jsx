import { useEffect } from 'react'
import { useI18n } from '../i18n/core'
import Icon from './Icon'

export default function Modal({ title, subtitle, onClose, children, footer, wide = false, small = false }) {
  const { t } = useI18n()
  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={`modal ${wide ? 'is-wide' : ''} ${small ? 'is-small' : ''}`} role="dialog" aria-modal="true" aria-label={title}>
        {title ? (
          <div className="modal-head">
            <div>
              <h2>{title}</h2>
              {subtitle && <p>{subtitle}</p>}
            </div>
            <button className="icon-btn" onClick={onClose} title={t('close')}>
              <Icon name="x" />
            </button>
          </div>
        ) : (
          <button className="icon-btn modal-x" onClick={onClose} title={t('close')}>
            <Icon name="x" />
          </button>
        )}
        <div className="modal-body">{children}</div>
        {footer && <div className={`modal-foot ${small ? 'is-centered' : ''}`}>{footer}</div>}
      </div>
    </div>
  )
}
