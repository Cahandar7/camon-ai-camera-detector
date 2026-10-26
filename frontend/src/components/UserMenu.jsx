import { useEffect, useRef, useState } from 'react'
import { useI18n } from '../i18n/core'
import Icon from './Icon'

/** Avatar button in the header with the signed-in account and a sign-out action. */
export default function UserMenu({ user, onLogout, onChangePassword }) {
  const { t } = useI18n()
  const [open, setOpen] = useState(false)
  const ref = useRef(null)

  useEffect(() => {
    if (!open) return undefined
    const onDown = (e) => !ref.current?.contains(e.target) && setOpen(false)
    const onKey = (e) => e.key === 'Escape' && setOpen(false)
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  return (
    <div className="user-menu" ref={ref}>
      <button
        className={`avatar ${open ? 'is-open' : ''}`}
        onClick={() => setOpen((o) => !o)}
        title={user.email}
        aria-haspopup="menu"
        aria-expanded={open}
      >
        {user.email[0].toUpperCase()}
      </button>
      {open && (
        <div className="menu user-dropdown" role="menu">
          <div className="user-card">
            <span className="avatar static">{user.email[0].toUpperCase()}</span>
            <span className="user-card-text">
              <b title={user.email}>{user.email}</b>
              <span className={`role-badge role-${user.role}`}>{t(`role_${user.role}`)}</span>
            </span>
          </div>
          <button
            className="menu-item"
            role="menuitem"
            onClick={() => {
              setOpen(false)
              onChangePassword()
            }}
          >
            <Icon name="lock" size={16} /> {t('changePassword')}
          </button>
          <button className="menu-item danger" role="menuitem" onClick={onLogout}>
            <Icon name="logOut" size={16} /> {t('signOut')}
          </button>
        </div>
      )}
    </div>
  )
}
