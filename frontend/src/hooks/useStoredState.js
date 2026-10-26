import { useEffect, useState } from 'react'

/** useState that survives page reloads (localStorage). */
export function useStoredState(key, initial) {
  const [value, setValue] = useState(() => {
    try {
      const raw = localStorage.getItem(key)
      return raw == null ? initial : JSON.parse(raw)
    } catch {
      return initial
    }
  })
  useEffect(() => {
    try {
      localStorage.setItem(key, JSON.stringify(value))
    } catch {
      /* private mode */
    }
  }, [key, value])
  return [value, setValue]
}
