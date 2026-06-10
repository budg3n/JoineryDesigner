import { Outlet, useNavigate, useLocation } from 'react-router-dom'
import { useApp } from '../context/AppContext'
import { useState, useRef, useEffect } from 'react'
import JobProcessesDropdown from '../screens/JobProcesses'
import NotificationBell from './NotificationBell'
import RFIBell from './RFIBell'
import TaskCounter from './TaskCounter'
import WeekSnapshot from './WeekSnapshot'
import JobClock from './JobClock'

function SbIcon({ children }) {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      {children}
    </svg>
  )
}

const NAV = [
  { section:'Menu', items:[
    { label:'Dashboard', to:'/',                    exact:true, icon:<SbIcon><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></SbIcon> },
    { label:'Schedule',  to:'/calendar',             icon:<SbIcon><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></SbIcon> },
    { label:'Spec Builder',   to:'/spec-builder',       icon:<SbIcon><path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2"/><rect x="9" y="3" width="6" height="4" rx="1"/><line x1="9" y1="12" x2="15" y2="12"/><line x1="9" y1="16" x2="13" y2="16"/></SbIcon>, roles:['Admin','Project Manager','Designer'] },
    { label:'Notes',          to:'/notes',              icon:<SbIcon><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></SbIcon> },
    { label:'Formula Writer', to:'/formula-writer',       icon:<SbIcon><path d="M4 7h4"/><path d="M4 12h4"/><path d="M4 17h4"/><path d="M11 7l2 10"/><path d="M17 7l2 10"/><path d="M10 10h8"/><path d="M11 14h6"/></SbIcon> },
    { label:'Reports',  to:'/reports',             icon:<SbIcon><path d="M18 20V10"/><path d="M12 20V4"/><path d="M6 20v-6"/></SbIcon>, roles:['Admin','Project Manager'] },
    { label:'Customers', to:'/settings/customers',   icon:<SbIcon><circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7"/></SbIcon> },
  ]},
  { section:'Library', items:[
    { label:'Materials',  to:'/materials',  icon:<SbIcon><rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8M12 17v4"/></SbIcon> },
    { label:'Appliances', to:'/appliances', icon:<SbIcon><rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 3h-8"/><path d="M12 3v4"/></SbIcon> },
  ]},
  { section:'Settings', items:[
    { label:'Team',       to:'/settings/team',       icon:<SbIcon><circle cx="9" cy="7" r="4"/><path d="M3 21v-2a4 4 0 014-4h4"/><path d="M16 11l2 2 4-4"/></SbIcon> },
    { label:'Settings',   to:'/settings',            icon:<SbIcon><path d="M20 7h-9"/><path d="M14 17H5"/><circle cx="17" cy="17" r="3"/><circle cx="7" cy="7" r="3"/></SbIcon> },
  ]},
]

const ROLE_COLORS = { 'Admin':'#5B8AF0','Project Manager':'#1D9E75','Setout':'#EF9F27','Designer':'#E24B4A','Production Manager':'#7F77DD','Production Team':'#6B7280' }

function initials(name, email) {
  if (name) return name.split(' ').map(w=>w[0]).slice(0,2).join('').toUpperCase()
  return (email||'?')[0].toUpperCase()
}

const PAGE_TITLES = {
  '/':'Dashboard','/calendar':'Schedule','/notes':'Notes','/materials':'Materials','/appliances':'Appliances',
  '/formula-writer':'Formula Writer',
  '/settings':'Settings','/settings/materials':'Materials library','/settings/materials/library':'Materials',
  '/settings/appliances':'Appliances','/settings/appliances/library':'Appliance library',
  '/reports':'Reports','/spec-builder':'Spec Builder',
  '/settings/customers':'Customers','/settings/team':'Team',
  '/settings/file-types':'File types',
}

export default function Layout() {
  const { profile, can, signOut, previewRole, setPreviewRole } = useApp()
  const navigate  = useNavigate()
  const location  = useLocation()
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [jobActions, setJobActions]   = useState(null)
  const jobActionsRef = useRef(null)
  const [showProcesses, setShowProcesses] = useState(false)
  const processBtnRef = useRef(null)
  const processDropRef = useRef(null)
  const [pendingCount, setPendingCount] = useState(0)

  const isJob = location.pathname.startsWith('/job/') && !location.pathname.includes('/sketch')
  const isDash = location.pathname === '/'
  const role   = previewRole || profile?.role || 'Production Team'
  const avatarColor = ROLE_COLORS[profile?.role] || '#6B7280'  // always use real role for avatar colour
  const [showRoleMenu, setShowRoleMenu] = useState(false)
  const title  = PAGE_TITLES[location.pathname] || (isJob ? 'Job details' : 'Joinery Jobs')

  // Close sidebar on navigation
  useEffect(() => { setSidebarOpen(false) }, [location.pathname])

  // Close processes dropdown on outside click
  useEffect(() => {
    if (!showProcesses) return
    const handler = e => {
      if (processBtnRef.current?.contains(e.target)) return
      if (processDropRef.current?.contains(e.target)) return
      setShowProcesses(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [showProcesses])

  // Job actions broadcast — persist in ref so buttons never flash away
  useEffect(() => {
    const handler = e => {
      jobActionsRef.current = e.detail || jobActionsRef.current
      setJobActions(e.detail || jobActionsRef.current)
    }
    window.addEventListener('job-actions', handler)
    return () => { window.removeEventListener('job-actions', handler) }
  }, [])
  useEffect(() => {
    if (!isJob) { jobActionsRef.current = null; setJobActions(null) }
  }, [isJob])

  // Pending approvals count
  useEffect(() => {
    if (!profile?.id || !['Admin','Project Manager'].includes(profile?.role)) return
    import('../lib/supabase').then(({ supabase }) => {
      supabase.from('approval_requests').select('id',{count:'exact',head:true})
        .eq('status','pending').eq('reviewed_by', profile.id)
        .then(({ count }) => setPendingCount(count||0))
    })
  }, [profile?.id, location.pathname])

  const SidebarContent = () => (
    <>
      {/* brand */}
      <div style={{ display:'flex', alignItems:'center', gap:10, padding:'20px 20px 16px', borderBottom:'1px solid rgba(255,255,255,0.07)', flexShrink:0 }}>
        <div style={{ width:32, height:32, background:'#5B8AF0', borderRadius:8, display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2"><rect x="3" y="3" width="8" height="8" rx="1"/><rect x="13" y="3" width="8" height="8" rx="1"/><rect x="3" y="13" width="8" height="8" rx="1"/><rect x="13" y="13" width="8" height="8" rx="1"/></svg>
        </div>
        <span style={{ fontSize:15, fontWeight:800, color:'#fff' }}>Joinery Jobs</span>
        {/* close button mobile */}
        <button onClick={() => setSidebarOpen(false)}
          style={{ marginLeft:'auto', background:'none', border:'none', cursor:'pointer', color:'rgba(255,255,255,0.4)', display:'flex', padding:4, borderRadius:6 }}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        </button>
      </div>

      {/* nav */}
      <nav style={{ flex:1, overflowY:'auto', paddingTop:8, paddingBottom:8 }}>
        {NAV.map(group => (
          <div key={group.section}>
            <div style={{ fontSize:10, fontWeight:700, color:'rgba(255,255,255,0.35)', letterSpacing:'.08em', textTransform:'uppercase', padding:'14px 24px 6px' }}>{group.section}</div>
            {group.items.filter(item => !item.roles || item.roles.includes(role)).map(item => {
              const isActive = item.exact ? location.pathname === '/' : location.pathname === item.to || location.pathname.startsWith(item.to + '/')
              return (
                <div key={item.to} onClick={() => navigate(item.to)}
                  style={{ display:'flex', alignItems:'center', gap:10, padding:'10px 12px', margin:'1px 8px', borderRadius:10, cursor:'pointer', transition:'background .12s', background: isActive ? 'rgba(91,138,240,0.22)' : 'transparent', color: isActive ? '#fff' : 'rgba(255,255,255,0.75)' }}
                  onMouseEnter={e => { if (!isActive) e.currentTarget.style.background='rgba(255,255,255,0.08)' }}
                  onMouseLeave={e => { if (!isActive) e.currentTarget.style.background='transparent' }}>
                  <span style={{ color: isActive ? '#5B8AF0' : 'rgba(255,255,255,0.55)', display:'flex', flexShrink:0 }}>{item.icon}</span>
                  <span style={{ fontSize:13, fontWeight: isActive ? 700 : 500 }}>{item.label}</span>
                </div>
              )
            })}
          </div>
        ))}
      </nav>

      {/* user footer */}
      <div style={{ padding:'12px 16px', borderTop:'1px solid rgba(255,255,255,0.08)', flexShrink:0 }}>
        {/* Preview role banner */}
        {previewRole && (
          <div style={{ marginBottom:8, background:'rgba(251,191,36,0.15)', border:'1px solid rgba(251,191,36,0.3)', borderRadius:8, padding:'5px 10px', display:'flex', alignItems:'center', justifyContent:'space-between', gap:8 }}>
            <div style={{ display:'flex', alignItems:'center', gap:6 }}>
              <span style={{ fontSize:11 }}>👁</span>
              <span style={{ fontSize:11, fontWeight:700, color:'#FCD34D' }}>Viewing as {previewRole}</span>
            </div>
            <button onClick={() => { setPreviewRole(null); navigate('/') }} title="Back to Admin"
              style={{ background:'none', border:'none', cursor:'pointer', color:'rgba(252,211,77,0.7)', fontSize:14, lineHeight:1, padding:0 }}
              onMouseEnter={e=>e.currentTarget.style.color='#FCD34D'} onMouseLeave={e=>e.currentTarget.style.color='rgba(252,211,77,0.7)'}>×</button>
          </div>
        )}

        <div style={{ display:'flex', alignItems:'center', gap:10 }}>
          {/* Clickable avatar — shows role menu for Admin */}
          <div
            onClick={() => profile?.role === 'Admin' && setShowRoleMenu(s=>!s)}
            style={{ position:'relative', width:34, height:34, borderRadius:'50%', background: previewRole ? '#F59E0B' : avatarColor, display:'flex', alignItems:'center', justifyContent:'center', fontSize:12, fontWeight:700, color:'#fff', flexShrink:0, cursor: profile?.role==='Admin' ? 'pointer' : 'default' }}
            title={profile?.role === 'Admin' ? 'Preview as another role' : ''}>
            {initials(profile?.full_name, profile?.email)}
          </div>
          <div style={{ flex:1, minWidth:0 }}>
            <div style={{ fontSize:13, fontWeight:700, color:'#fff', whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>{profile?.full_name || profile?.email || '—'}</div>
            <div style={{ fontSize:11, color:'rgba(255,255,255,0.45)' }}>{previewRole ? previewRole : role}</div>
          </div>
          <button onClick={signOut} title="Sign out"
            style={{ background:'none', border:'none', cursor:'pointer', color:'rgba(255,255,255,0.4)', padding:4, borderRadius:6, display:'flex' }}
            onMouseEnter={e=>e.currentTarget.style.color='rgba(255,255,255,0.9)'}
            onMouseLeave={e=>e.currentTarget.style.color='rgba(255,255,255,0.4)'}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
          </button>
        </div>

        {/* Role switcher menu */}
        {showRoleMenu && profile?.role === 'Admin' && (
          <div style={{ marginTop:10, background:'rgba(255,255,255,0.08)', borderRadius:10, overflow:'hidden', border:'1px solid rgba(255,255,255,0.1)' }}>
            <div style={{ padding:'8px 12px 4px', fontSize:10, fontWeight:700, color:'rgba(255,255,255,0.35)', textTransform:'uppercase', letterSpacing:'.08em' }}>Preview as</div>
            {['Admin','Project Manager','Setout','Designer','Production Team'].map(r => (
              <button key={r} onClick={() => {
                  setPreviewRole(r === 'Admin' ? null : r)
                  setShowRoleMenu(false)
                  navigate(r === 'Production Team' ? '/production' : '/')
                }}
                style={{ width:'100%', textAlign:'left', padding:'8px 12px', background: (previewRole===r || (!previewRole&&r==='Admin')) ? 'rgba(255,255,255,0.12)' : 'none',
                  border:'none', cursor:'pointer', color:'#fff', fontSize:13, display:'flex', alignItems:'center', gap:8 }}
                onMouseEnter={e=>e.currentTarget.style.background='rgba(255,255,255,0.12)'}
                onMouseLeave={e=>e.currentTarget.style.background=(previewRole===r||(!previewRole&&r==='Admin'))?'rgba(255,255,255,0.12)':'none'}>
                <div style={{ width:8, height:8, borderRadius:'50%', background: ROLE_COLORS[r]||'#6B7280', flexShrink:0 }} />
                {r}
                {(previewRole===r || (!previewRole&&r==='Admin')) && <span style={{ marginLeft:'auto', fontSize:10, color:'rgba(255,255,255,0.5)' }}>current</span>}
              </button>
            ))}
          </div>
        )}
      </div>
    </>
  )

  return (
    <div style={{ display:'flex', height:'100vh', overflow:'hidden', background:'#F0F2F5' }}>

      {/* ── DESKTOP SIDEBAR ── */}
      {role === 'Production Team' ? (
        /* Production Team — slim sidebar, username + sign out only */
        <aside style={{ width:220, flexShrink:0, background:'#111318', display:'flex', flexDirection:'column', position:'sticky', top:0, height:'100vh' }}
          className="desktop-sidebar">
          {/* header */}
          <div style={{ padding:'20px 16px 16px', borderBottom:'1px solid rgba(255,255,255,0.08)' }}>
            <div style={{ fontSize:15, fontWeight:800, color:'#fff', letterSpacing:'-.01em' }}>Joinery</div>
            <div style={{ fontSize:11, color:'rgba(255,255,255,0.35)', marginTop:2 }}>Production</div>
          </div>
          {/* spacer */}
          <div style={{ flex:1 }} />
          {/* user footer */}
          <div style={{ padding:'12px 16px', borderTop:'1px solid rgba(255,255,255,0.08)' }}>
            {/* Preview role banner */}
            {previewRole && (
              <div style={{ marginBottom:8, background:'rgba(251,191,36,0.15)', border:'1px solid rgba(251,191,36,0.3)', borderRadius:8, padding:'5px 10px', display:'flex', alignItems:'center', justifyContent:'space-between', gap:8 }}>
                <span style={{ fontSize:11, fontWeight:700, color:'#FCD34D' }}>👁 {previewRole}</span>
                <button onClick={() => setPreviewRole(null)} style={{ background:'none', border:'none', cursor:'pointer', color:'rgba(252,211,77,0.7)', fontSize:14, lineHeight:1, padding:0 }}>×</button>
              </div>
            )}
            <div style={{ display:'flex', alignItems:'center', gap:10 }}>
              <div style={{ width:34, height:34, borderRadius:'50%', background:ROLE_COLORS['Production Team'], display:'flex', alignItems:'center', justifyContent:'center', fontSize:12, fontWeight:700, color:'#fff', flexShrink:0 }}>
                {initials(profile?.full_name, profile?.email)}
              </div>
              <div style={{ flex:1, minWidth:0 }}>
                <div style={{ fontSize:13, fontWeight:700, color:'#fff', whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>{profile?.full_name || profile?.email || '—'}</div>
                <div style={{ fontSize:11, color:'rgba(255,255,255,0.45)' }}>{previewRole || 'Production Team'}</div>
              </div>
              <button onClick={signOut} title="Sign out"
                style={{ background:'none', border:'none', cursor:'pointer', color:'rgba(255,255,255,0.4)', padding:4, borderRadius:6, display:'flex' }}
                onMouseEnter={e=>e.currentTarget.style.color='rgba(255,255,255,0.9)'}
                onMouseLeave={e=>e.currentTarget.style.color='rgba(255,255,255,0.4)'}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
              </button>
            </div>
          </div>
        </aside>
      ) : (
        /* All other roles — full sidebar */
        <aside style={{ width:220, flexShrink:0, background:'#111318', display:'flex', flexDirection:'column', position:'sticky', top:0, height:'100vh', overflowY:'auto' }}
          className="desktop-sidebar">
          <SidebarContent />
        </aside>
      )}

      {/* ── MOBILE OVERLAY — for all roles ── */}
      {sidebarOpen && (
        <div style={{ position:'fixed', inset:0, zIndex:300 }}>
          <div style={{ position:'absolute', inset:0, background:'rgba(0,0,0,0.5)' }} onClick={() => setSidebarOpen(false)} />
          <div style={{ position:'absolute', left:0, top:0, bottom:0, width:260, background:'#111318', display:'flex', flexDirection:'column', boxShadow:'4px 0 24px rgba(0,0,0,0.3)' }}>
            {role === 'Production Team' ? (
              <>
                <div style={{ padding:'20px 16px 16px', borderBottom:'1px solid rgba(255,255,255,0.08)', display:'flex', alignItems:'center', justifyContent:'space-between' }}>
                  <div>
                    <div style={{ fontSize:15, fontWeight:800, color:'#fff' }}>Joinery</div>
                    <div style={{ fontSize:11, color:'rgba(255,255,255,0.35)', marginTop:2 }}>Production</div>
                  </div>
                  <button onClick={() => setSidebarOpen(false)} style={{ background:'rgba(255,255,255,0.1)', border:'none', borderRadius:8, color:'#fff', width:28, height:28, cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', fontSize:16 }}>×</button>
                </div>
                <div style={{ flex:1 }} />
                <div style={{ padding:'12px 16px', borderTop:'1px solid rgba(255,255,255,0.08)', display:'flex', alignItems:'center', gap:10 }}>
                  <div style={{ width:34, height:34, borderRadius:'50%', background:ROLE_COLORS['Production Team'], display:'flex', alignItems:'center', justifyContent:'center', fontSize:12, fontWeight:700, color:'#fff', flexShrink:0 }}>
                    {initials(profile?.full_name, profile?.email)}
                  </div>
                  <div style={{ flex:1, minWidth:0 }}>
                    <div style={{ fontSize:13, fontWeight:700, color:'#fff', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{profile?.full_name || profile?.email || '—'}</div>
                    <div style={{ fontSize:11, color:'rgba(255,255,255,0.45)' }}>Production Team</div>
                  </div>
                  <button onClick={signOut} title="Sign out" style={{ background:'none', border:'none', cursor:'pointer', color:'rgba(255,255,255,0.4)', padding:4, borderRadius:6, display:'flex' }}
                    onMouseEnter={e=>e.currentTarget.style.color='rgba(255,255,255,0.9)'} onMouseLeave={e=>e.currentTarget.style.color='rgba(255,255,255,0.4)'}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
                  </button>
                </div>
              </>
            ) : (
              <SidebarContent />
            )}
          </div>
        </div>
      )}

      {/* ── MAIN COLUMN ── */}
      <div style={{ flex:1, display:'flex', flexDirection:'column', minWidth:0, height:'100vh', overflowY:'auto' }}>
        {/* topbar */}
        <header style={{ background:'#fff', height:56, display:'flex', alignItems:'center', justifyContent:'space-between', padding:'0 16px', borderBottom:'1px solid #E8ECF0', position:'sticky', top:0, zIndex:100, gap:8 }}>
          <div style={{ display:'flex', alignItems:'center', gap:10, minWidth:0 }}>
            {/* hamburger — mobile only */}
            <button onClick={() => setSidebarOpen(true)}
              className="mobile-only-hamburger"
              style={{ background:'none', border:'none', cursor:'pointer', color:'#6B7280', display:'flex', padding:4, borderRadius:8, flexShrink:0 }}
              onMouseEnter={e=>e.currentTarget.style.background='#F3F4F6'}
              onMouseLeave={e=>e.currentTarget.style.background='none'}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/></svg>
            </button>
            {location.pathname !== '/' && (
              <button onClick={() => navigate(-1)}
                style={{ background:'none', border:'none', cursor:'pointer', color:'#6B7280', display:'flex', alignItems:'center', gap:4, fontSize:13, padding:'4px 0', flexShrink:0 }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/></svg>
              </button>
            )}
            <h1 style={{ fontSize:15, fontWeight:700, color:'#2A3042', margin:0, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{title}</h1>
          </div>
          <div style={{ display:'flex', alignItems:'center', gap:6, flexShrink:0 }}>
            {/* job action buttons */}
            {isJob && (jobActions || jobActionsRef.current) && (<>
              <button onClick={(jobActions||jobActionsRef.current).onSketch}
                style={{ height:34, fontSize:12, fontWeight:600, padding:'0 12px', borderRadius:8, border:'1px solid #E8ECF0', background:'#F9FAFB', color:'#374151', cursor:'pointer', display:'flex', alignItems:'center', gap:6 }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 013 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>
                Sketch
              </button>
              {(jobActions||jobActionsRef.current).dirty && (
                <button onClick={(jobActions||jobActionsRef.current).onSave} disabled={(jobActions||jobActionsRef.current).saving}
                  style={{ height:34, fontSize:12, fontWeight:700, padding:'0 14px', borderRadius:8, border:'none', background:'#5B8AF0', color:'#fff', cursor:(jobActions||jobActionsRef.current).saving?'not-allowed':'pointer', opacity:(jobActions||jobActionsRef.current).saving?0.7:1, boxShadow:'0 2px 8px rgba(91,138,240,0.35)' }}>
                  {(jobActions||jobActionsRef.current).saving ? '…' : 'Save'}
                </button>
              )}
            </>)}

            <TaskCounter />
            <RFIBell />
            <WeekSnapshot />
            <JobClock />
            <NotificationBell />
            {isDash && can('createJob') && (
              <button onClick={() => window.dispatchEvent(new CustomEvent('open-new-job'))}
                style={{ height:34, fontSize:12, fontWeight:700, padding:'0 12px', borderRadius:8, border:'none', background:'#5B8AF0', color:'#fff', cursor:'pointer' }}>
                + New job
              </button>
            )}
          </div>
        </header>

        {/* page content */}
        <main style={{ flex:1, padding:'16px', minWidth:0, overflowX:'hidden' }} className="page-enter">
          <Outlet />
        </main>
      </div>

      <style>{`
        @media (min-width: 768px) {
          .desktop-sidebar { display: flex !important; }
          .mobile-only-hamburger { display: none !important; }
        }
        @media (max-width: 767px) {
          .desktop-sidebar { display: none !important; }
          .mobile-only-hamburger { display: flex !important; }
        }
      `}</style>
    </div>
  )
}
