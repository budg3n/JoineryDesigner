// Persists state to sessionStorage so it survives page reloads
// Usage: const [value, setValue] = usePersistentState('key', defaultValue)
import { useState, useEffect } from 'react'

export function usePersistentState(key, defaultValue) {
  const [state, setState] = useState(() => {
    try {
      const saved = sessionStorage.getItem(key)
      return saved !== null ? JSON.parse(saved) : defaultValue
    } catch {
      return defaultValue
    }
  })

  useEffect(() => {
    try {
      sessionStorage.setItem(key, JSON.stringify(state))
    } catch {}
  }, [key, state])

  return [state, setState]
}
