import { useI18n } from '../i18n/core'
import Icon from './Icon'
import ProfileTab from './ProfileTab'
import SettingsTab from './SettingsTab'

/** Full page opened from the avatar menu: the signed-in account and the system settings. */
export default function AccountPage({ tab, onTab, onBack, user, onUserChange, onSignOut, onDeleted, ...settingsProps }) {
  const { t } = useI18n()
  const tabs = [
    { key: 'profile', icon: 'user', label: t('profile') },
    { key: 'settings', icon: 'sliders', label: t('settings') },
  ]

  return (
    <main className="account">
      <button className="back-link" onClick={onBack}>
        <Icon name="arrowLeft" size={16} /> {t('backToMonitoring')}
      </button>

      <div className="acct-hero">
        <span className="avatar xl">{user.email[0].toUpperCase()}</span>
        <div className="acct-hero-text">
          <h1 title={user.email}>{user.email}</h1>
          <div className="acct-meta">
            <span className={`role-badge role-${user.role}`}>{t(`role_${user.role}`)}</span>
            <span>{t('memberSince', { date: t.date(user.created_at) })}</span>
          </div>
        </div>
        <nav className="acct-tabs" role="tablist" aria-label={t('account')}>
          {tabs.map((item) => (
            <button
              key={item.key}
              role="tab"
              aria-selected={tab === item.key}
              className={tab === item.key ? 'is-active' : ''}
              onClick={() => onTab(item.key)}
            >
              <Icon name={item.icon} size={16} /> <span>{item.label}</span>
            </button>
          ))}
        </nav>
      </div>

      <div className="acct-body" key={tab} role="tabpanel">
        {tab === 'profile' ? (
          <ProfileTab user={user} onUserChange={onUserChange} onSignOut={onSignOut} onDeleted={onDeleted} />
        ) : (
          <SettingsTab {...settingsProps} />
        )}
      </div>
    </main>
  )
}
