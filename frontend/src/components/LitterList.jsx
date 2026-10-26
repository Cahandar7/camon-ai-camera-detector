import { useI18n } from '../i18n/core'
import { categoryColor } from '../lib/constants'
import { clock } from '../lib/format'
import Icon from './Icon'

/**
 * Litter on the ground now, oldest first, with time until the dwell alert.
 * Confirmed items come from the backend's tracker registry (stable); items still
 * being verified or carried by someone come from the current frame.
 */
export default function LitterList({ items = [], detections, dwellLimit }) {
  const { t } = useI18n()
  const rows = [
    ...[...items].sort((a, b) => b.age - a.age).map((d) => ({ ...d, st: 'litter' })),
    ...detections.filter((d) => d.st === 'pending' || d.st === 'held'),
  ]

  return (
    <div className="panel litter-card">
      <div className="card-head">
        <span className="eyebrow">{t('onGround')}</span>
        <span className="card-head-note">{t('alertAfter', { time: clock(dwellLimit) })}</span>
      </div>
      {rows.length === 0 ? (
        <div className="card-empty ok">
          <Icon name="check" size={22} />
          {t('nothingOnGround')}
        </div>
      ) : (
        <ul className="litter-list">
          {rows.slice(0, 8).map((d, i) => {
            const overdue = d.st === 'litter' && d.age >= dwellLimit
            return (
              <li key={`${d.st}-${d.id ?? i}`} className={`litter-row st-${d.st} ${overdue ? 'is-overdue' : ''}`}>
                <span className="litter-dot" style={{ background: categoryColor(d.c) }} />
                <span className="litter-name">
                  {t(`cat_${d.c}`)}
                  {d.id != null && <small>#{d.id}</small>}
                </span>
                {d.st === 'litter' ? (
                  <>
                    <span className="litter-bar">
                      <span style={{ width: `${Math.min(1, d.age / dwellLimit) * 100}%` }} />
                    </span>
                    <span className="litter-time mono">{clock(d.age)}</span>
                  </>
                ) : (
                  <span className="litter-state">{d.st === 'held' ? t('carriedByPerson') : t('verifyingDots')}</span>
                )}
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
