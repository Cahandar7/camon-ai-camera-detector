import { useI18n } from '../i18n/core'
import Icon from './Icon'
import LangSwitch from './LangSwitch'
import Logo from './Logo'

const FEATURES = [
  { icon: 'monitor', key: 'feat1' },
  { icon: 'sparkles', key: 'feat2' },
  { icon: 'alert', key: 'feat3' },
]

/** Shared frame of the signed-out screens: brand panel on the left, a form card on the right. */
export default function AuthLayout({ children }) {
  const { t } = useI18n()
  return (
    <div className="login">
      <section className="login-brand" aria-hidden="true">
        <div className="login-grid" />
        <span className="login-beam" />
        <div className="login-brand-body">
          <Logo size={72} animated />
          <h1>{t('loginHero')}</h1>
          <ul className="login-feats">
            {FEATURES.map((f) => (
              <li key={f.key}>
                <span className="login-feat-icon">
                  <Icon name={f.icon} size={18} />
                </span>
                {t(f.key)}
              </li>
            ))}
          </ul>
        </div>
        <div className="login-corners">
          <i />
          <i />
          <i />
          <i />
        </div>
      </section>

      <section className="login-panel">
        <div className="login-lang">
          <LangSwitch />
        </div>
        <div className="login-card">
          <div className="login-card-logo">
            <Logo size={44} />
          </div>
          {children}
        </div>
      </section>
    </div>
  )
}
