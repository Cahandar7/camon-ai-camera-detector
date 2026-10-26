import { useEffect, useRef, useState } from 'react'
import { LANGS, useI18n } from '../i18n/core'
import Icon from './Icon'

/** Header language menu: AZE / ENG / RUS / TURK. */
export default function LangSwitch() {
  const { lang, setLang, t } = useI18n()
  const [open, setOpen] = useState(false)
  const ref = useRef(null)
  const current = LANGS.find((l) => l.code === lang)

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
    <div className="lang" ref={ref}>
      <button
        className={`lang-btn ${open ? 'is-open' : ''}`}
        onClick={() => setOpen((o) => !o)}
        title={t('language')}
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <Icon name="globe" size={16} />
        <span>{current.label}</span>
        <Icon name="chevronDown" size={14} />
      </button>
      {open && (
        <ul className="lang-menu" role="listbox" aria-label={t('language')}>
          {LANGS.map((l) => (
            <li key={l.code}>
              <button
                role="option"
                aria-selected={l.code === lang}
                className={l.code === lang ? 'is-active' : ''}
                onClick={() => {
                  setLang(l.code)
                  setOpen(false)
                }}
              >
                <b>{l.label}</b>
                <span>{l.name}</span>
                {l.code === lang && <Icon name="tick" size={15} />}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
