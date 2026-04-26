import { Outlet, useNavigate, useLocation, NavLink } from 'react-router-dom'
import { useApp } from '../context/AppContext'
import { useState } from 'react'

const PALETTE = ['#5B8AF0','#1D9E75','#EF9F27','#7F77DD','#E24B4A','#D4537E','#5DCAA5']

function Icon({ d, size = 16 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d={d} />
    </svg>
  )
}

function SbIcon({ children }) {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      {children}
    </svg>
  )
}

const NAV = [
  {
    section: 'Menu',
    items: [
      { label: 'Dashboard', to: '/', icon: <SbIcon><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></SbIcon>, exact: true },
      { label: 'Schedule',  to: '/calendar', icon: <SbIcon><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></SbIcon> },
      { label: 'Customers', to: '/settings/customers', icon: <SbIcon><circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7"/></SbIcon> },
    ]
  },
  {
    section: 'Settings',
    items: [
      { label: 'Materials', to: '/settings/materials', icon: <SbIcon><rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8M12 17v4"/></SbIcon> },
      { label: 'Team',      to: '/settings/team',      icon: <SbIcon><circle cx="9" cy="7" r="4"/><path d="M3 21v-2a4 4 0 014-4h4"/><path d="M16 11l2 2 4-4"/></SbIcon> },
      { label: 'Settings',  to: '/settings',           icon: <SbIcon><path d="M20 7h-9"/><path d="M14 17H5"/><circle cx="17" cy="17" r="3"/><circle cx="7" cy="7" r="3"/></SbIcon> },
    ]
  }
]

const ROLE_COLORS = {
  'Admin':              '#5B8AF0',
  'Project Manager':    '#1D9E75',
  'Setout':             '#EF9F27',
  'Production Manager': '#7F77DD',
  'Production Team':    '#6B7280',
}

function initials(name, email) {
  if (name) return name.split(' ').map(w=>w[0]).slice(0,2).join('').toUpperCase()
  return (email||'?')[0].toUpperCase()
}

export default function Layout() {
  const { profile, can, signOut } = useApp()
  const navigate  = useNavigate()
  const location  = useLocation()
  const [mobileOpen, setMobileOpen] = useState(false)

  const isDash = location.pathname === '/'
  const role   = profile?.role || 'Production Team'
  const avatarColor = ROLE_COLORS[role] || '#6B7280'

  // topbar title
  const PAGE_TITLES = {
    '/':                   'Dashboard',
    '/calendar':           'Schedule',
    '/settings':           'Settings',
    '/settings/materials': 'Materials',
    '/settings/customers': 'Customers',
    '/settings/team':      'Team',
  }
  const title = PAGE_TITLES[location.pathname] || (location.pathname.startsWith('/job/') ? 'Job details' : 'Joinery Jobs')

  return (
    <div style={{ display:'flex', minHeight:'100vh', background:'#F0F2F5' }}>
      {/* ── SIDEBAR ── */}
      <aside style={{
        width: 220, flexShrink: 0, background: '#111318',
        display: 'flex', flexDirection: 'column',
        position: 'sticky', top: 0, height: '100vh',
        overflowY: 'auto',
      }}>
        {/* brand */}
        <div style={{ display:'flex', alignItems:'center', gap:10, padding:'20px 20px 16px', borderBottom:'1px solid rgba(255,255,255,0.06)' }}>
          <div style={{ width:32, height:32, background:'#5B8AF0', borderRadius:8, display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2"><rect x="3" y="3" width="8" height="8" rx="1"/><rect x="13" y="3" width="8" height="8" rx="1"/><rect x="3" y="13" width="8" height="8" rx="1"/><rect x="13" y="13" width="8" height="8" rx="1"/></svg>
          </div>
          <span style={{ fontSize:15, fontWeight:800, color:'#fff', letterSpacing:'-.01em' }}>Joinery Jobs</span>
        </div>

        {/* nav */}
        <nav style={{ flex:1, paddingTop:8 }}>
          {NAV.map(group => (
            <div key={group.section}>
              <div style={{ fontSize:10, fontWeight:700, color:'rgba(255,255,255,0.35)', letterSpacing:'.07em', textTransform:'uppercase', padding:'16px 24px 6px' }}>
                {group.section}
              </div>
              {group.items.map(item => {
                const active = item.exact ? location.pathname === item.to : location.pathname.startsWith(item.to) && item.to !== '/'
                  ? true : item.exact && location.pathname === item.to
                const isActive = item.exact ? location.pathname === '/' : location.pathname === item.to || location.pathname.startsWith(item.to + '/')
                return (
                  <div key={item.to}
                    onClick={() => navigate(item.to)}
                    style={{
                      display:'flex', alignItems:'center', gap:10,
                      padding:'9px 12px', margin:'1px 8px', borderRadius:10,
                      cursor:'pointer', transition:'background .12s',
                      background: isActive ? 'rgba(91,138,240,0.22)' : 'transparent',
                      color: isActive ? '#fff' : 'rgba(255,255,255,0.75)',
                    }}
                    onMouseEnter={e => { if (!isActive) e.currentTarget.style.background = 'rgba(255,255,255,0.08)' }}
                    onMouseLeave={e => { if (!isActive) e.currentTarget.style.background = 'transparent' }}>
                    <span style={{ color: isActive ? '#5B8AF0' : 'rgba(255,255,255,0.55)', display:'flex', flexShrink:0 }}>{item.icon}</span>
                    <span style={{ fontSize:13, fontWeight: isActive ? 700 : 500 }}>{item.label}</span>
                  </div>
                )
              })}
            </div>
          ))}
        </nav>

        {/* user footer */}
        <div style={{ padding:'12px 16px', borderTop:'1px solid rgba(255,255,255,0.08)' }}>
          <div style={{ display:'flex', alignItems:'center', gap:10 }}>
            <div style={{ width:34, height:34, borderRadius:'50%', background:avatarColor, display:'flex', alignItems:'center', justifyContent:'center', fontSize:12, fontWeight:700, color:'#fff', flexShrink:0 }}>
              {initials(profile?.full_name, profile?.email)}
            </div>
            <div style={{ flex:1, minWidth:0 }}>
              <div style={{ fontSize:13, fontWeight:700, color:'#fff', whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>{profile?.full_name || profile?.email || '—'}</div>
              <div style={{ fontSize:11, color:'rgba(255,255,255,0.45)' }}>{role}</div>
            </div>
            <button onClick={signOut} title="Sign out"
              style={{ background:'none', border:'none', cursor:'pointer', color:'rgba(255,255,255,0.4)', padding:4, borderRadius:6, display:'flex' }}
              onMouseEnter={e => e.currentTarget.style.color='rgba(255,255,255,0.9)'}
              onMouseLeave={e => e.currentTarget.style.color='rgba(255,255,255,0.4)'}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
            </button>
          </div>
        </div>
      </aside>

      {/* ── MAIN COLUMN ── */}
      <div style={{ flex:1, display:'flex', flexDirection:'column', minWidth:0 }}>
        {/* topbar */}
        <header style={{
          background:'#fff', height:60, display:'flex', alignItems:'center',
          justifyContent:'space-between', padding:'0 24px',
          borderBottom:'1px solid #E8ECF0', position:'sticky', top:0, zIndex:100,
        }}>
          <div style={{ display:'flex', alignItems:'center', gap:12 }}>
            {location.pathname !== '/' && (
              <button onClick={() => navigate(-1)}
                style={{ background:'none', border:'none', cursor:'pointer', color:'#6B7280', display:'flex', alignItems:'center', gap:6, fontSize:13, padding:'6px 0' }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/></svg>
              </button>
            )}
            <h1 style={{ fontSize:16, fontWeight:700, color:'#2A3042', margin:0 }}>{title}</h1>
          </div>
          <div style={{ display:'flex', alignItems:'center', gap:8 }}>
            {/* notification bell */}
            <div style={{ width:36, height:36, borderRadius:9, border:'1px solid #E8ECF0', background:'#fff', display:'flex', alignItems:'center', justifyContent:'center', cursor:'pointer', position:'relative' }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#6B7280" strokeWidth="1.8"><path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 01-3.46 0"/></svg>
            </div>
            {isDash && can('createJob') && (
              <button onClick={() => {}} className="btn-primary" style={{ height:36, fontSize:13, padding:'0 16px', borderRadius:9 }}>
                + New job
              </button>
            )}
          </div>
        </header>

        {/* page content */}
        <main style={{ flex:1, padding:24, minWidth:0 }} className="page-enter">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
