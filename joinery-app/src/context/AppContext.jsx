import { createContext, useContext, useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'

const AppContext = createContext(null)

export const ROLES = ['Admin', 'Project Manager', 'Setout', 'Designer', 'Production Manager', 'Production Team']

const PERMISSIONS = {
  createJob:   ['Admin', 'Project Manager'],
  editJob:     ['Admin', 'Project Manager'],
  archiveJob:  ['Admin'],
  addTask:     ['Admin', 'Project Manager', 'Production Manager'],
  completeTask:['Admin', 'Project Manager', 'Setout', 'Production Manager', 'Production Team'],
  addSketch:   ['Admin', 'Project Manager', 'Setout'],
  settings:    ['Admin'],
  team:        ['Admin'],
  seeAllJobs:  ['Admin', 'Project Manager', 'Setout', 'Designer', 'Production Manager'],
  deleteProcess: ['Admin', 'Project Manager'],
  useSpecBuilder: ['Admin', 'Project Manager', 'Designer'],
  deleteJob:   ['Admin'],
}

export function AppProvider({ children }) {
  const [user, setUser]           = useState(null)
  const [profile, setProfile]     = useState(null)
  const [connError, setConnError] = useState(false)
  // Preview role is in-memory only — clears on page reload
  const [previewRole, setPreviewRoleState] = useState(null)

  function setPreviewRole(role) {
    setPreviewRoleState(role || null)
  }
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    // Timeout — if Supabase is paused/cold starting, show retry after 15s
    const timeout = setTimeout(() => {
      setConnError(true)
      setLoading(false)
    }, 15000)

    supabase.auth.getSession().then(({ data: { session } }) => {
      clearTimeout(timeout)
      setConnError(false)
      if (session) {
        setUser(session.user)
        loadProfile(session.user.id, true)
      } else {
        setLoading(false)
      }
    }).catch(() => {
      clearTimeout(timeout)
      setConnError(true)
      setLoading(false)
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      setUser(session?.user ?? null)
      if (session?.user) {
        const isInitial = event === 'SIGNED_IN' || event === 'INITIAL_SESSION'
        loadProfile(session.user.id, isInitial)
      } else {
        setProfile(null); setLoading(false)
      }
    })
    return () => { subscription.unsubscribe(); clearTimeout(timeout) }
  }, [])

  async function loadProfile(uid, showLoading = false) {
    // Show app immediately with cached/default profile, then update
    if (showLoading) setLoading(false)
    const { data } = await supabase.from('profiles').select('id,full_name,email,role,phone,position,department,notes').eq('id', uid).single()
    setProfile(data || { id: uid, role: 'Production Team' })
    // Keep Supabase warm — ping every 3 minutes to prevent cold starts
    if (!window._sbKeepAlive) {
      window._sbKeepAlive = setInterval(() => {
        supabase.from('profiles').select('id').limit(1).then(() => {})
      }, 3 * 60 * 1000)
    }
    // mat_colors migration disabled — already ran
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
    const role = previewRole || profile?.role || 'Production Team'
    return (PERMISSIONS[action] || []).includes(role)
  }

  async function signOut() {
    sessionStorage.removeItem('preview_role')
    setPreviewRoleState(null)
    await supabase.auth.signOut()
  }

  return (
    <AppContext.Provider value={{ user, profile, loading, can, signOut, previewRole, setPreviewRole }}>
      {connError ? (
        <div style={{ minHeight:'100vh', display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', background:'#F0F2F5', padding:24 }}>
          <div style={{ background:'#fff', borderRadius:16, padding:'40px 32px', maxWidth:400, width:'100%', textAlign:'center', boxShadow:'0 4px 24px rgba(0,0,0,0.08)' }}>
            <div style={{ fontSize:40, marginBottom:16 }}>🔌</div>
            <div style={{ fontSize:18, fontWeight:800, color:'#2A3042', marginBottom:8 }}>Connecting…</div>
            <div style={{ fontSize:13, color:'#9CA3AF', marginBottom:24, lineHeight:1.6 }}>
              The database is waking up. This can take up to 30 seconds after a period of inactivity.
            </div>
            <button onClick={() => { setConnError(false); setLoading(true); window.location.reload() }}
              style={{ padding:'10px 28px', borderRadius:10, border:'none', background:'#5B8AF0', color:'#fff', fontSize:14, fontWeight:700, cursor:'pointer' }}>
              Try again
            </button>
          </div>
        </div>
      ) : children}
    </AppContext.Provider>
  )
}

export function useApp() {
  return useContext(AppContext)
}
