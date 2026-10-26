import { useState } from 'react'
import { useI18n } from '../i18n/core'
import { api } from '../lib/api'
import { unlockAudio } from '../lib/sound'
import AuthLayout from './AuthLayout'
import Icon from './Icon'
import PasswordInput from './PasswordInput'

/** The only public screen. There is no sign-up: an administrator creates accounts.
 * Also hosts "forgot password": request a reset link by email. */
export default function LoginPage({ onLogin, initialMode = 'login' }) {
  const { t, lang } = useI18n()
  const [mode, setMode] = useState(initialMode) // login | forgot | sent
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const fail = (err) => {
    setError(err.status === 401 ? t('invalidLogin') : err.status === 429 ? t('tooManyAttempts') : t('serverDown'))
    setBusy(false)
  }

  const login = async (e) => {
    e.preventDefault()
    unlockAudio() // a click is the only moment browsers allow audio to start
    setBusy(true)
    setError('')
    try {
      onLogin(await api.login(email.trim(), password))
    } catch (err) {
      fail(err)
    }
  }

  const requestReset = async (e) => {
    e.preventDefault()
    setBusy(true)
    setError('')
    try {
      await api.forgotPassword(email.trim(), lang)
      setMode('sent')
      setBusy(false)
    } catch (err) {
      fail(err)
    }
  }

  const switchTo = (next) => {
    setMode(next)
    setError('')
  }

  const emailField = (
    <label className="field">
      <span>{t('email')}</span>
      <span className="input-icon">
        <Icon name="mail" size={17} />
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          autoComplete="username"
          placeholder="name@example.com"
          required
          autoFocus
        />
      </span>
    </label>
  )

  const errorBox = error && (
    <div className="form-error" role="alert">
      {error}
    </div>
  )

  if (mode === 'sent') {
    return (
      <AuthLayout>
        <div className="auth-state">
          <span className="auth-state-icon">
            <Icon name="mail" size={26} />
          </span>
          <h2>{t('forgotSentTitle')}</h2>
          <p className="login-sub">{t('forgotSent', { email: email.trim() })}</p>
        </div>
        <button className="btn btn-ghost lg login-submit" onClick={() => switchTo('login')}>
          {t('backToLogin')}
        </button>
      </AuthLayout>
    )
  }

  if (mode === 'forgot') {
    return (
      <AuthLayout>
        <form className="login-form" onSubmit={requestReset}>
          <h2>{t('forgotTitle')}</h2>
          <p className="login-sub">{t('forgotSub')}</p>
          {emailField}
          {errorBox}
          <button className="btn btn-primary lg login-submit" type="submit" disabled={busy}>
            {busy ? (
              <>
                <span className="spinner sm dark" /> {t('sending')}
              </>
            ) : (
              t('sendLink')
            )}
          </button>
          <button type="button" className="link-btn login-back" onClick={() => switchTo('login')}>
            ← {t('backToLogin')}
          </button>
        </form>
      </AuthLayout>
    )
  }

  return (
    <AuthLayout>
      <form className="login-form" onSubmit={login}>
        <h2>{t('loginTitle')}</h2>
        <p className="login-sub">{t('loginSub')}</p>
        {emailField}
        <PasswordInput label={t('password')} value={password} onChange={setPassword} />
        <button type="button" className="link-btn login-forgot" onClick={() => switchTo('forgot')}>
          {t('forgotLink')}
        </button>
        {errorBox}
        <button className="btn btn-primary lg login-submit" type="submit" disabled={busy}>
          {busy ? (
            <>
              <span className="spinner sm dark" /> {t('signingIn')}
            </>
          ) : (
            t('signIn')
          )}
        </button>
        <p className="login-note">
          <Icon name="shield" size={15} />
          {t('noSignup')}
        </p>
      </form>
    </AuthLayout>
  )
}
