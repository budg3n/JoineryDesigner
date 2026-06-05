import { useState } from 'react'
import { useNavigate } from 'react-router-dom'

// ── Shared components ──────────────────────────────────────────────
function NavRow({ icon, iconBg, iconColor, label, sub, to }) {
  const navigate = useNavigate()
  return (
    <div onClick={() => navigate(to)}
      style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'14px 18px', cursor:'pointer', borderBottom:'1px solid #F3F4F6', transition:'background .1s' }}
      onMouseEnter={e=>e.currentTarget.style.background='#FAFAFA'}
      onMouseLeave={e=>e.currentTarget.style.background='transparent'}>
      <div style={{ display:'flex', alignItems:'center', gap:14 }}>
        <div style={{ width:38, height:38, borderRadius:10, background:iconBg, display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={iconColor} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">{icon}</svg>
        </div>
        <div>
          <div style={{ fontSize:14, fontWeight:600, color:'#2A3042' }}>{label}</div>
          <div style={{ fontSize:12, color:'#9CA3AF', marginTop:1 }}>{sub}</div>
        </div>
      </div>
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#C4C9D4" strokeWidth="2"><polyline points="9 18 15 12 9 6"/></svg>
    </div>
  )
}

// ── Tab definitions ────────────────────────────────────────────────
const TABS = [
  { key:'library',    label:'Library',    icon:<><rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8M12 17v4"/></> },
  { key:'team',       label:'Team',       icon:<><circle cx="9" cy="7" r="4"/><path d="M3 21v-2a4 4 0 014-4h4"/><path d="M16 11l2 2 4-4"/></> },
  { key:'jobs',       label:'Jobs',       icon:<><rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 3h-8"/><path d="M12 3v4"/></> },
  { key:'general',    label:'General',    icon:<><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z"/></> },
]

export default function Settings() {
  const [tab, setTab] = useState('library')

  return (
    <div style={{ maxWidth:680, margin:'0 auto' }}>
      <div style={{ marginBottom:22 }}>
        <h1 style={{ fontSize:20, fontWeight:800, color:'#2A3042', margin:'0 0 4px' }}>Settings</h1>
        <p style={{ fontSize:13, color:'#9CA3AF', margin:0 }}>Configure your workspace</p>
      </div>

      {/* Tab bar */}
      <div style={{ display:'flex', gap:2, background:'#F3F4F6', borderRadius:12, padding:4, marginBottom:20 }}>
        {TABS.map(t => (
          <button key={t.key} onClick={() => setTab(t.key)}
            style={{ flex:1, display:'flex', alignItems:'center', justifyContent:'center', gap:7, padding:'9px 12px', borderRadius:9, border:'none', cursor:'pointer', fontSize:13, fontWeight:tab===t.key?700:500,
              background: tab===t.key ? '#fff' : 'transparent',
              color: tab===t.key ? '#2A3042' : '#6B7280',
              boxShadow: tab===t.key ? '0 1px 4px rgba(0,0,0,0.1)' : 'none',
              transition: 'all .15s' }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">{t.icon}</svg>
            {t.label}
          </button>
        ))}
      </div>

      {/* Content */}
      <div style={{ background:'#fff', borderRadius:14, border:'1px solid #E8ECF0', overflow:'hidden' }}>

        {/* LIBRARY */}
        {tab === 'library' && <>
          <div style={{ padding:'14px 18px', borderBottom:'1px solid #F3F4F6' }}>
            <div style={{ fontSize:11, fontWeight:700, color:'#9CA3AF', textTransform:'uppercase', letterSpacing:'.06em' }}>Materials</div>
          </div>
          <NavRow icon={<><rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8M12 17v4"/></>}
            iconBg="#ECFDF5" iconColor="#1D9E75"
            label="Materials library"
            sub="Categories, subcategories and custom fields"
            to="/settings/materials" />
          <div style={{ padding:'14px 18px', borderBottom:'1px solid #F3F4F6', borderTop:'1px solid #F3F4F6' }}>
            <div style={{ fontSize:11, fontWeight:700, color:'#9CA3AF', textTransform:'uppercase', letterSpacing:'.06em' }}>Appliances</div>
          </div>
          <NavRow icon={<><path d="M18 20V10"/><path d="M12 20V4"/><path d="M6 20v-6"/></>}
            iconBg="#FFF7ED" iconColor="#F97316"
            label="Appliances"
            sub="Categories, subcategories and custom fields"
            to="/settings/appliances" />
        </>}

        {/* TEAM */}
        {tab === 'team' && <>
          <div style={{ padding:'14px 18px', borderBottom:'1px solid #F3F4F6' }}>
            <div style={{ fontSize:11, fontWeight:700, color:'#9CA3AF', textTransform:'uppercase', letterSpacing:'.06em' }}>People</div>
          </div>
          <NavRow icon={<><circle cx="9" cy="7" r="4"/><path d="M3 21v-2a4 4 0 014-4h4"/><path d="M16 11l2 2 4-4"/></>}
            iconBg="#FEF3C7" iconColor="#D97706"
            label="Team members"
            sub="Manage users, roles and module access"
            to="/settings/team" />
          <NavRow icon={<><circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7"/></>}
            iconBg="#EEF2FF" iconColor="#5B8AF0"
            label="Customers"
            sub="Manage customer database"
            to="/settings/customers" />
        </>}

        {/* JOBS */}
        {tab === 'jobs' && <>
          <div style={{ padding:'14px 18px', borderBottom:'1px solid #F3F4F6' }}>
            <div style={{ fontSize:11, fontWeight:700, color:'#9CA3AF', textTransform:'uppercase', letterSpacing:'.06em' }}>Production</div>
          </div>
          <NavRow icon={<><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z"/></>}
            iconBg="#ECFDF5" iconColor="#1D9E75"
            label="Job processes"
            sub="Define production stages for jobs"
            to="/settings/processes" />
          <div style={{ padding:'14px 18px', borderBottom:'1px solid #F3F4F6', borderTop:'1px solid #F3F4F6' }}>
            <div style={{ fontSize:11, fontWeight:700, color:'#9CA3AF', textTransform:'uppercase', letterSpacing:'.06em' }}>Files</div>
          </div>
          <NavRow icon={<><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/></>}
            iconBg="#F5F3FF" iconColor="#7F77DD"
            label="File types"
            sub="Document types and approval settings"
            to="/settings/file-types" />
        </>}

        {/* GENERAL */}
        {tab === 'general' && <>
          <div style={{ padding:'14px 18px', borderBottom:'1px solid #F3F4F6' }}>
            <div style={{ fontSize:11, fontWeight:700, color:'#9CA3AF', textTransform:'uppercase', letterSpacing:'.06em' }}>Order sheet</div>
          </div>
          <NavRow icon={<><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></>}
            iconBg="#FFF7ED" iconColor="#C2410C"
            label="Copy format"
            sub="Configure order description copy template"
            to="/settings/copy-format" />
          <NavRow icon={<><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/></>}
            iconBg="#EEF2FF" iconColor="#5B8AF0"
            label="Unit types"
            sub="Units available for materials and orders (sheets, pcs, m²…)"
            to="/settings/unit-types" />
        </>}

      </div>
    </div>
  )
}
