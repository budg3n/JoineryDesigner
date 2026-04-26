import { createContext, useContext, useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'

const AppContext = createContext(null)

export const ROLES = ['Admin', 'Project Manager', 'Setout', 'Production Manager', 'Production Team']

const PERMISSIONS = {
  createJob:   ['Admin', 'Project Manager'],
  editJob:     ['Admin', 'Project Manager'],
  archiveJob:  ['Admin'],
  addTask:     ['Admin', 'Project Manager', 'Production Manager'],
  completeTask:['Admin', 'Project Manager', 'Setout', 'Production Manager', 'Production Team'],
  addSketch:   ['Admin', 'Project Manager', 'Setout'],
  settings:    ['Admin'],
  team:        ['Admin'],
  seeAllJobs:  ['Admin', 'Project Manager', 'Setout', 'Production Manager'],
}

export function AppProvider({ children }) {
  const [user, setUser]       = useState(null)
  const [profile, setProfile] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) {
        setUser(session.user)
        loadProfile(session.user.id)
      } else {
        setLoading(false)
      }
    })
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null)
      if (session?.user) loadProfile(session.user.id)
      else { setProfile(null); setLoading(false) }
    })
    return () => subscription.unsubscribe()
  }, [])

  async function loadProfile(uid) {
    const { data } = await supabase.from('profiles').select('*').eq('id', uid).single()
    setProfile(data)
    setLoading(false)
    // Keep Supabase warm — ping every 4 minutes to avoid cold starts
    // (Supabase free tier sleeps after ~5 mins of inactivity)
    if (!window._sbKeepAlive) {
      window._sbKeepAlive = setInterval(() => {
        supabase.from('profiles').select('id').limit(1).then(() => {})
      }, 4 * 60 * 1000)
    }
  }

  function can(action) {
    const role = profile?.role || 'Production Team'
    return (PERMISSIONS[action] || []).includes(role)
  }

  async function signOut() {
    await supabase.auth.signOut()
  }

  return (
    <AppContext.Provider value={{ user, profile, loading, can, signOut }}>
      {children}
    </AppContext.Provider>
  )
}

export function useApp() {
  return useContext(AppContext)
}
