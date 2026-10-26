import { useState } from 'react'
import { useI18n } from '../i18n/core'
import Icon from './Icon'

/** Password field with a lock icon and a show/hide toggle. */
export default function PasswordInput({ label, value, onChange, autoComplete = 'current-password', autoFocus, hint }) {
  const { t } = useI18n()
  const [visible, setVisible] = useState(false)
  return (
    <label className="field">
      <span>{label}</span>
      <span className="input-icon">
        <Icon name="lock" size={17} />
        <input
          type={visible ? 'text' : 'password'}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          autoComplete={autoComplete}
          autoFocus={autoFocus}
          placeholder="••••••••"
          required
        />
        <button
          type="button"
          className="input-eye"
          onClick={() => setVisible((v) => !v)}
          title={visible ? t('hidePassword') : t('showPassword')}
          aria-label={visible ? t('hidePassword') : t('showPassword')}
        >
          <Icon name={visible ? 'eyeOff' : 'eye'} size={17} />
        </button>
      </span>
      {hint && <small>{hint}</small>}
    </label>
  )
}
