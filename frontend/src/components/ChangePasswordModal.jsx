import { useState } from 'react'
import { useI18n } from '../i18n/core'
import { api } from '../lib/api'
import Icon from './Icon'
import Modal from './Modal'
import PasswordInput from './PasswordInput'

const MIN_LENGTH = 8

/** Signed-in user changes their password: current one + the new one twice. */
export default function ChangePasswordModal({ onClose }) {
  const { t } = useI18n()
  const [current, setCurrent] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [done, setDone] = useState(false)

  const submit = async (e) => {
    e?.preventDefault()
    if (password.length < MIN_LENGTH) return setError(t('passwordTooShort'))
    if (password !== confirm) return setError(t('passwordsMismatch'))
    setBusy(true)
    setError('')
    try {
      await api.changePassword(current, password)
      setDone(true)
      setTimeout(onClose, 1800)
    } catch (err) {
      setError(err.status === 403 ? t('wrongCurrent') : err.status === 429 ? t('tooManyAttempts') : t('serverDown'))
      setBusy(false)
    }
  }

  return (
    <Modal
      title={t('changePassword')}
      onClose={onClose}
      footer={
        !done && (
          <>
            <span className="spacer" />
            <button className="btn btn-ghost" onClick={onClose}>
              {t('cancel')}
            </button>
            <button className="btn btn-primary" onClick={submit} disabled={busy}>
              {t('savePassword')}
            </button>
          </>
        )
      }
    >
      {done ? (
        <div className="auth-state">
          <span className="auth-state-icon">
            <Icon name="check" size={26} />
          </span>
          <p className="login-sub">{t('passwordChanged')}</p>
        </div>
      ) : (
        <form className="form" onSubmit={submit}>
          <PasswordInput label={t('currentPassword')} value={current} onChange={setCurrent} autoFocus />
          <PasswordInput
            label={t('newPassword')}
            value={password}
            onChange={setPassword}
            autoComplete="new-password"
            hint={t('passwordRule')}
          />
          <PasswordInput label={t('confirmPassword')} value={confirm} onChange={setConfirm} autoComplete="new-password" />
          {error && (
            <div className="form-error" role="alert">
              {error}
            </div>
          )}
          <button type="submit" hidden />
        </form>
      )}
    </Modal>
  )
}
