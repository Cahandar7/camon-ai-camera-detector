import { useEffect, useMemo } from 'react'
import { useStoredState } from '../hooks/useStoredState'
import { I18nContext, detectLang, makeT } from './core'
import { MESSAGES } from './messages'

export function I18nProvider({ children }) {
  const [lang, setLang] = useStoredState('camon.lang', detectLang())
  const code = MESSAGES[lang] ? lang : 'en'
  const value = useMemo(() => ({ lang: code, setLang, t: makeT(code) }), [code, setLang])

  useEffect(() => {
    document.documentElement.lang = code
    document.title = `CamOn — ${value.t('tagline')}`
  }, [code, value])

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>
}
