import { useI18n } from '../i18n/core'
import Icon from './Icon'
import Logo from './Logo'

const STEPS = [
  { icon: 'phone', n: 1 },
  { icon: 'link', n: 2 },
  { icon: 'sparkles', n: 3 },
]

export default function EmptyState({ onAdd }) {
  const { t } = useI18n()
  return (
    <main className="empty">
      <div className="empty-hero">
        <Logo size={72} showText={false} />
        <h1>
          {t('emptyTitle1')}
          <span>{t('emptyTitleAccent')}</span>
          {t('emptyTitle2')}
        </h1>
        <p>{t('emptyText')}</p>
        <button className="btn btn-primary lg" onClick={onAdd}>
          <Icon name="plus" size={18} /> {t('addFirstCamera')}
        </button>
      </div>
      <ol className="empty-steps">
        {STEPS.map((s) => (
          <li key={s.n} className="panel">
            <span className="step-n">{s.n}</span>
            <Icon name={s.icon} size={22} />
            <b>{t(`step${s.n}Title`)}</b>
            <span>{t(`step${s.n}Text`)}</span>
          </li>
        ))}
      </ol>
    </main>
  )
}
