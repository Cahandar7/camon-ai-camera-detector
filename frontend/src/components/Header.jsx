import { useEffect, useState } from 'react'
import { useI18n } from '../i18n/core'
import Icon from './Icon'
import LangSwitch from './LangSwitch'
import Logo from './Logo'
import UserMenu from './UserMenu'

function Clock() {
  const { t } = useI18n()
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(timer)
  }, [])
  return <span className="header-clock">{t.time(now)}</span>
}

export default function Header({
  view,
  onView,
  health,
  connected,
  sound,
  onToggleSound,
  onSettings,
  showNav,
  user,
  onLogout,
  onChangePassword,
}) {
  const { t } = useI18n()
  return (
    <header className="header">
      <div className="header-left">
        <Logo />
        <span className="header-tagline">{t('tagline')}</span>
      </div>

      {showNav && (
        <nav className="tabs" aria-label="View">
          <button className={view === 'live' ? 'tab is-active' : 'tab'} onClick={() => onView('live')}>
            <Icon name="monitor" size={16} /> <span>{t('tabLive')}</span>
          </button>
          <button className={view === 'overview' ? 'tab is-active' : 'tab'} onClick={() => onView('overview')}>
            <Icon name="grid" size={16} /> <span>{t('tabOverview')}</span>
          </button>
        </nav>
      )}

      <div className="header-right">
        <div className={`sys-chip ${connected ? '' : 'is-down'}`} title={health ? `${health.device}` : ''}>
          <span className="dot" />
          {connected && health ? (
            <>
              <Icon name="sparkles" size={14} />
              <b>{health.model}</b>
              <span className="sys-sep" />
              <span className="sys-runtime">{health.runtime}</span>
            </>
          ) : (
            <span>{connected ? t('connecting') : t('backendOffline')}</span>
          )}
        </div>
        <Clock />
        <LangSwitch />
        <button className="icon-btn" onClick={onToggleSound} title={sound ? t('soundOff') : t('soundOn')}>
          <Icon name={sound ? 'volume' : 'volumeOff'} />
        </button>
        <button className="icon-btn" onClick={onSettings} title={t('settings')}>
          <Icon name="gear" />
        </button>
        <UserMenu user={user} onLogout={onLogout} onChangePassword={onChangePassword} />
      </div>
    </header>
  )
}
