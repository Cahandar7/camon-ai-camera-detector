import { useEffect, useState } from 'react'
import { useI18n } from '../i18n/core'
import { api } from '../lib/api'
import AuthLayout from './AuthLayout'
import Icon from './Icon'
import PasswordInput from './PasswordInput'

const MIN_LENGTH = 8

/** Opened from the emailed link (/?reset=<token>): set a new password twice.
 * The old password isn't asked — the one-time link proves who it is. */
export default function ResetPasswordPage({ token, onDone }) {
  const { t } = useI18n()
  const [state, setState] = useState('checking') // checking | form | invalid | done
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    api.checkReset(token).then(
      (res) => {
        setEmail(res.email)
        setState('form')
      },
      () => setState('invalid'),
    )
  }, [token])

  const submit = async (e) => {
    e.preventDefault()
    if (password.length < MIN_LENGTH) return setError(t('passwordTooShort'))
    if (password !== confirm) return setError(t('passwordsMismatch'))
    setBusy(true)
    setError('')
    try {
      await api.resetPassword(token, password)
      setState('done')
    } catch (err) {
      if (err.status === 410) setState('invalid')
      else setError(t('serverDown'))
      setBusy(false)
    }
  }

  if (state === 'checking') {
    return (
      <AuthLayout>
        <div className="auth-state">
          <div className="spinner" />
        </div>
      </AuthLayout>
    )
  }

  if (state === 'invalid' || state === 'done') {
    const ok = state === 'done'
    return (
      <AuthLayout>
        <div className="auth-state">
          <span className={`auth-state-icon ${ok ? '' : 'is-bad'}`}>
            <Icon name={ok ? 'check' : 'alert'} size={26} />
          </span>
          <h2>{ok ? t('passwordSaved') : t('resetTitle')}</h2>
          <p className="login-sub">{ok ? t('resetDone') : t('resetInvalid')}</p>
        </div>
        <button className="btn btn-primary lg login-submit" onClick={() => onDone(ok ? 'login' : 'forgot')}>
          {ok ? t('backToLogin') : t('requestNewLink')}
        </button>
      </AuthLayout>
    )
  }

  return (
    <AuthLayout>
      <form className="login-form" onSubmit={submit}>
        <h2>{t('resetTitle')}</h2>
        <p className="login-sub">{t('resetFor', { email })}</p>
        <PasswordInput
          label={t('newPassword')}
          value={password}
          onChange={setPassword}
          autoComplete="new-password"
          autoFocus
          hint={t('passwordRule')}
        />
        <PasswordInput label={t('confirmPassword')} value={confirm} onChange={setConfirm} autoComplete="new-password" />
        {error && (
          <div className="form-error" role="alert">
            {error}
          </div>
        )}
        <button className="btn btn-primary lg login-submit" type="submit" disabled={busy}>
          {busy ? <span className="spinner sm dark" /> : t('savePassword')}
        </button>
      </form>
    </AuthLayout>
  )
}
