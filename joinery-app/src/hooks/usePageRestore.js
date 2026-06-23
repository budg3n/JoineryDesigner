// Saves current URL to sessionStorage every navigation.
// On reload, redirects back to where the user was.
import { useEffect } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'

export function usePageRestore() {
  const location = useLocation()
  const navigate  = useNavigate()

  // Save current path on every navigation
  useEffect(() => {
    if (location.pathname !== '/') {
      sessionStorage.setItem('lastPath', location.pathname + location.search)
    }
  }, [location])
}

// Call once at app root — restores the last path on fresh load
export function useRestoreOnLoad() {
  const navigate  = useNavigate()
  const location  = useLocation()

  useEffect(() => {
    const saved = sessionStorage.getItem('lastPath')
    // Only restore if we landed on root (i.e. a reload/backgrounded reload)
    if (saved && saved !== '/' && location.pathname === '/') {
      sessionStorage.removeItem('lastPath')
      navigate(saved, { replace: true })
    }
  }, []) // eslint-disable-line
}
