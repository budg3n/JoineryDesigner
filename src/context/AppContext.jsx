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
  deleteJob:   ['Admin'],
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
    if (!window._sbKeepAlive) {
      window._sbKeepAlive = setInterval(() => {
        supabase.from('profiles').select('id').limit(1).then(() => {})
      }, 4 * 60 * 1000)
    }
    // One-time background migration: refresh mat_colors on any jobs
    // where storage_path is missing from the stored JSON (old format)
    if (!window._matColorsMigrated) {
      window._matColorsMigrated = true
      refreshMatColors()
    }
  }

  async function refreshMatColors() {
    try {
      // Get all jobs that have job_materials with images
      const { data: jobs } = await supabase.from('jobs').select('id,mat_colors')
      if (!jobs?.length) return
      const { data: jmRows } = await supabase
        .from('job_materials')
        .select('job_id,materials(name,color,storage_path,supplier,panel_type,thickness)')
      if (!jmRows?.length) return

      // Group by job
      const byJob = {}
      jmRows.forEach(row => {
        if (!row.materials) return
        if (!byJob[row.job_id]) byJob[row.job_id] = []
        byJob[row.job_id].push(row.materials)
      })

      // For each job, check if stored mat_colors is missing storage_path
      const updates = []
      jobs.forEach(job => {
        const mats = byJob[job.id]
        if (!mats?.length) return
        const stored = job.mat_colors ? JSON.parse(job.mat_colors) : []
        const needsUpdate = mats.some(m =>
          m.storage_path && !stored.find(s => s.name === m.name && s.storage_path)
        )
        if (needsUpdate) {
          const freshColors = mats.map(m => ({
            name:         m.name,
            color:        m.color || '#888',
            storage_path: m.storage_path || null,
            supplier:     m.supplier || '',
            panel_type:   m.panel_type || '',
            thickness:    m.thickness || '',
          }))
          updates.push({ id: job.id, mat_colors: JSON.stringify(freshColors) })
        }
      })

      // Apply updates in parallel
      await Promise.all(updates.map(u =>
        supabase.from('jobs').update({ mat_colors: u.mat_colors }).eq('id', u.id)
      ))
      if (updates.length > 0) console.log(`Refreshed mat_colors for ${updates.length} jobs`)
    } catch (e) {
      console.warn('mat_colors migration failed:', e)
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
