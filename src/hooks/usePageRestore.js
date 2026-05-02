import { useEffect } from 'react'
import { useLocation } from 'react-router-dom'

// Just save current path - no redirects
export function usePageRestore() {
  const location = useLocation()
  useEffect(() => {
    const path = location.pathname + location.search
    if (path && path !== '/') {
      sessionStorage.setItem('lastPath', path)
    }
  }, [location.pathname, location.search])
}

// No-op - redirect behaviour removed, RequireAuth overlay handles persistence
export function useRestoreOnLoad() {}
