import { useState } from 'react'
import { useI18n } from '../i18n/core'
import Icon from './Icon'
import Modal from './Modal'

/** In-app replacement for window.confirm, styled like the rest of the dashboard. */
export default function ConfirmModal({ title, text, confirmLabel, onConfirm, onClose }) {
  const { t } = useI18n()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const confirm = async () => {
    setBusy(true)
    try {
      await onConfirm()
      onClose()
    } catch (e) {
      setError(e.message)
      setBusy(false)
    }
  }

  return (
    <Modal
      onClose={onClose}
      small
      footer={
        <>
          <button className="btn btn-ghost" onClick={onClose} autoFocus>
            {t('cancel')}
          </button>
          <button className="btn btn-danger" onClick={confirm} disabled={busy}>
            <Icon name="trash" size={16} /> {confirmLabel}
          </button>
        </>
      }
    >
      <div className="confirm">
        <span className="confirm-icon">
          <Icon name="trash" size={24} />
        </span>
        <h2>{title}</h2>
        <p>{text}</p>
        {error && <div className="form-error">{error}</div>}
      </div>
    </Modal>
  )
}
