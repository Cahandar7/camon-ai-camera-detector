import { useEffect, useState } from 'react'

const readHash = (pages) => {
  const hash = location.hash.slice(1)
  return pages.includes(hash) ? hash : null
}

/** A page addressed by the URL hash (#profile), so a reload keeps it open and the
 * browser Back button closes it. `go(null)` returns to the dashboard. */
export function useHashPage(pages) {
  const [page, setPage] = useState(() => readHash(pages))

  useEffect(() => {
    const sync = () => setPage(readHash(pages))
    window.addEventListener('popstate', sync)
    return () => window.removeEventListener('popstate', sync)
  }, [pages])

  const go = (next) => {
    if (next === page) return
    // Opened from the app: step back instead of piling up history entries
    if (!next && history.state?.camonPage) return history.back()
    const url = next ? `#${next}` : location.pathname + location.search
    if (page) history.replaceState(history.state, '', url) // switching tabs
    else history.pushState({ camonPage: true }, '', url)
    setPage(next)
  }

  return [page, go]
}

/** Drop the page from the address bar, e.g. on sign-out, so the next sign-in starts on the dashboard. */
export const clearHashPage = () => history.replaceState(null, '', location.pathname + location.search)
