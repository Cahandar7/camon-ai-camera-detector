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

/** Shown only while the backend connection is lost (after a short grace period on page load). */
function OfflineChip({ connected }) {
  const { t } = useI18n()
  const [down, setDown] = useState(false)
  useEffect(() => {
    if (connected) return undefined
    const timer = setTimeout(() => setDown(true), 2000)
    return () => clearTimeout(timer)
  }, [connected])
  if (connected || !down) return null
  return (
    <div className="sys-chip is-down" role="status">
      <span className="dot" />
      <span>{t('backendOffline')}</span>
    </div>
  )
}

export default function Header({
  view,
  onView,
  connected,
  sound,
  onToggleSound,
  showNav,
  user,
  onOpenAccount,
  onSignOut,
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
        <OfflineChip connected={connected} />
        <Clock />
        <LangSwitch />
        <button className="icon-btn" onClick={onToggleSound} title={sound ? t('soundOff') : t('soundOn')}>
          <Icon name={sound ? 'volume' : 'volumeOff'} />
        </button>
        <UserMenu user={user} onOpen={onOpenAccount} onSignOut={onSignOut} />
      </div>
    </header>
  )
}
