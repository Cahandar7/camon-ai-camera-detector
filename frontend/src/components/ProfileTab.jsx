import { useState } from 'react'
import { useI18n } from '../i18n/core'
import { api } from '../lib/api'
import Icon from './Icon'
import PasswordInput from './PasswordInput'
import Section, { FormStatus } from './Section'

const MIN_LENGTH = 8
const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/

/** Message for a failed account request; `known` overrides it per HTTP status. */
function errorText(err, t, known = {}) {
  if (known[err.status]) return known[err.status]
  if (err.status === 403) return t('wrongCurrent')
  if (err.status === 429) return t('tooManyAttempts')
  return t('serverDown')
}

export default function ProfileTab({ user, onUserChange, onSignOut, onDeleted }) {
  return (
    <div className="acct-grid">
      <EmailForm user={user} onUserChange={onUserChange} />
      <PasswordForm />
      <SessionCard onSignOut={onSignOut} />
      <DeleteAccount onDeleted={onDeleted} />
    </div>
  )
}

function EmailForm({ user, onUserChange }) {
  const { t } = useI18n()
  const [email, setEmail] = useState('')
  const [current, setCurrent] = useState('')
  const [status, setStatus] = useState({})

  const submit = async (e) => {
    e.preventDefault()
    const next = email.trim()
    if (!EMAIL_RE.test(next)) return setStatus({ error: t('emailInvalid') })
    if (next.toLowerCase() === user.email) return setStatus({ error: t('emailSame') })
    setStatus({ busy: true })
    try {
      onUserChange(await api.updateEmail(next, current))
      setEmail('')
      setCurrent('')
      setStatus({ done: t('emailUpdated') })
    } catch (err) {
      setStatus({ error: errorText(err, t, { 409: t('emailTaken'), 422: t('emailInvalid') }) })
    }
  }

  return (
    <Section icon="mail" title={t('emailTitle')} sub={t('emailSub')}>
      <form className="form" onSubmit={submit} noValidate>
        <div className="acct-current">
          <span className="eyebrow">{t('currentEmailLabel')}</span>
          <b title={user.email}>{user.email}</b>
        </div>
        <label className="field">
          <span>{t('newEmail')}</span>
          <span className="input-icon">
            <Icon name="mail" size={17} />
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
              placeholder="name@example.com"
              required
            />
          </span>
        </label>
        <PasswordInput label={t('currentPassword')} value={current} onChange={setCurrent} />
        <FormStatus status={status} />
        <div className="acct-actions">
          <button className="btn btn-primary" disabled={status.busy || !email || !current}>
            {status.busy && <span className="spinner sm dark" />}
            {t('updateEmail')}
          </button>
        </div>
      </form>
    </Section>
  )
}

function PasswordForm() {
  const { t } = useI18n()
  const [current, setCurrent] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [status, setStatus] = useState({})

  const submit = async (e) => {
    e.preventDefault()
    if (password.length < MIN_LENGTH) return setStatus({ error: t('passwordTooShort') })
    if (password !== confirm) return setStatus({ error: t('passwordsMismatch') })
    setStatus({ busy: true })
    try {
      await api.changePassword(current, password)
      setCurrent('')
      setPassword('')
      setConfirm('')
      setStatus({ done: t('passwordChanged') })
    } catch (err) {
      setStatus({ error: errorText(err, t) })
    }
  }

  return (
    <Section icon="lock" title={t('changePassword')} sub={t('passwordSub')}>
      <form className="form" onSubmit={submit}>
        <PasswordInput label={t('currentPassword')} value={current} onChange={setCurrent} />
        <PasswordInput
          label={t('newPassword')}
          value={password}
          onChange={setPassword}
          autoComplete="new-password"
          hint={t('passwordRule')}
        />
        <PasswordInput label={t('confirmPassword')} value={confirm} onChange={setConfirm} autoComplete="new-password" />
        <FormStatus status={status} />
        <div className="acct-actions">
          <button className="btn btn-primary" disabled={status.busy || !current || !password || !confirm}>
            {status.busy && <span className="spinner sm dark" />}
            {t('savePassword')}
          </button>
        </div>
      </form>
    </Section>
  )
}

function SessionCard({ onSignOut }) {
  const { t } = useI18n()
  return (
    <Section icon="logOut" title={t('sessionTitle')} sub={t('sessionSub')} className="acct-compact">
      <div className="acct-actions">
        <button className="btn btn-ghost" onClick={onSignOut}>
          <Icon name="logOut" size={16} /> {t('signOut')}
        </button>
      </div>
    </Section>
  )
}

function DeleteAccount({ onDeleted }) {
  const { t } = useI18n()
  const [open, setOpen] = useState(false)
  const [current, setCurrent] = useState('')
  const [status, setStatus] = useState({})

  const close = () => {
    setOpen(false)
    setCurrent('')
    setStatus({})
  }

  const submit = async (e) => {
    e.preventDefault()
    setStatus({ busy: true })
    try {
      await api.deleteAccount(current)
      onDeleted()
    } catch (err) {
      setStatus({ error: errorText(err, t, { 409: t('lastAdmin') }) })
    }
  }

  return (
    <Section icon="trash" title={t('deleteAccount')} sub={t('deleteSub')} tone="danger" className="acct-compact">
      {open ? (
        <form className="form acct-confirm" onSubmit={submit}>
          <PasswordInput label={t('deleteConfirmLabel')} value={current} onChange={setCurrent} autoFocus />
          <FormStatus status={status} />
          <div className="acct-actions">
            <button type="button" className="btn btn-ghost" onClick={close}>
              {t('cancel')}
            </button>
            <button className="btn btn-danger" disabled={status.busy || !current}>
              <Icon name="trash" size={16} /> {t('deleteForever')}
            </button>
          </div>
        </form>
      ) : (
        <div className="acct-actions">
          <button className="btn btn-ghost danger" onClick={() => setOpen(true)}>
            <Icon name="trash" size={16} /> {t('deleteAccount')}
          </button>
        </div>
      )}
    </Section>
  )
}
