import { createContext, useContext } from 'react'
import { MESSAGES } from './messages'

export const LANGS = [
  { code: 'az', label: 'AZE', name: 'Azərbaycanca', locale: 'az-Latn-AZ' },
  { code: 'en', label: 'ENG', name: 'English', locale: 'en-US' },
  { code: 'ru', label: 'RUS', name: 'Русский', locale: 'ru-RU' },
  { code: 'tr', label: 'TURK', name: 'Türkçe', locale: 'tr-TR' },
]

const AZ_MONTHS = ['yanvar', 'fevral', 'mart', 'aprel', 'may', 'iyun', 'iyul', 'avqust', 'sentyabr', 'oktyabr', 'noyabr', 'dekabr']

export const I18nContext = createContext(null)
export const useI18n = () => useContext(I18nContext)

export function detectLang() {
  const nav = (navigator.language || 'en').slice(0, 2).toLowerCase()
  return LANGS.some((l) => l.code === nav) ? nav : 'en'
}

/** t(key, vars) for one language, plus formatting helpers hung on it. */
export function makeT(lang) {
  const dict = MESSAGES[lang]
  const t = (key, vars = {}) => {
    const msg = dict[key] ?? MESSAGES.en[key] ?? key
    if (typeof msg === 'function') return msg(vars)
    return msg.replace(/\{(\w+)\}/g, (_, name) => (vars[name] ?? `{${name}}`))
  }
  t.lang = lang
  t.locale = LANGS.find((l) => l.code === lang).locale
  // Turkish writes the percent sign first: %85
  t.pct = (value) => (lang === 'tr' ? `%${value}` : `${value}%`)
  t.duration = (seconds) => {
    const s = Math.max(0, Math.floor(seconds))
    if (s < 60) return t('durS', { s })
    if (s < 3600) return t('durM', { m: Math.floor(s / 60), s: String(s % 60).padStart(2, '0') })
    return t('durH', { h: Math.floor(s / 3600), m: String(Math.floor((s % 3600) / 60)).padStart(2, '0') })
  }
  t.timeAgo = (ts, now = Date.now() / 1000) => {
    const d = Math.max(0, now - ts)
    if (d < 10) return t('justNow')
    if (d < 60) return t('secondsAgo', { n: Math.floor(d) })
    if (d < 3600) return t('minutesAgo', { n: Math.floor(d / 60) })
    if (d < 86400) return t('hoursAgo', { n: Math.floor(d / 3600) })
    return new Date(ts * 1000).toLocaleDateString(t.locale)
  }
  t.time = (date) => date.toLocaleTimeString(t.locale, { hour: '2-digit', minute: '2-digit', second: '2-digit' })
  t.date = (iso) => {
    const d = new Date(iso)
    // Browsers ship no Azerbaijani month names (they print "2026 M10 26"), so spell them out
    if (lang === 'az') return `${d.getDate()} ${AZ_MONTHS[d.getMonth()]} ${d.getFullYear()}`
    return d.toLocaleDateString(t.locale, { day: 'numeric', month: 'long', year: 'numeric' })
  }
  return t
}

/** Alert title/message in the current language. Alerts saved by an older backend
 * (without `params`) keep their original English message. */
export function alertText(alert, t) {
  const titleKey = {
    pollution: alert.severity === 'critical' ? 'alertCriticalTitle' : 'alertDirtyTitle',
    dwell: 'alertDwellTitle',
    resolved: 'alertResolvedTitle',
  }[alert.type]
  const title = titleKey ? t(titleKey) : alert.title
  const p = alert.params
  if (!p) return { title, message: alert.message }
  const score = t.pct(Math.round(alert.score))
  const message = {
    pollution: () => t('alertDirtyMsg', { score, threshold: t.pct(p.threshold) }),
    dwell: () => t('alertDwellMsg', { item: t(`cat_${p.category}`), duration: t.duration(p.seconds) }),
    resolved: () => t('alertResolvedMsg', { duration: t.duration(p.seconds), score }),
  }[alert.type]
  return { title, message: message ? message() : alert.message }
}
