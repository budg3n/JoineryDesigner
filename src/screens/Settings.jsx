import { useNavigate } from 'react-router-dom'

function Row({ icon, iconBg, iconColor, label, sub, to }) {
  const navigate = useNavigate()
  return (
    <div onClick={() => navigate(to)}
      style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'14px 18px', cursor:'pointer', borderBottom:'1px solid #F3F4F6', transition:'background .1s' }}
      onMouseEnter={e=>e.currentTarget.style.background='#FAFAFA'} onMouseLeave={e=>e.currentTarget.style.background='transparent'}>
      <div style={{ display:'flex', alignItems:'center', gap:14 }}>
        <div style={{ width:38, height:38, borderRadius:10, background:iconBg, display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={iconColor} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            {icon}
          </svg>
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

export default function Settings() {
  return (
    <div>
      <div style={{ background:'#fff', borderRadius:14, border:'1px solid #E8ECF0', overflow:'hidden' }}>
        <Row icon={<><rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8M12 17v4"/></>}       iconBg="#ECFDF5" iconColor="#1D9E75" label="Materials library" sub="Manage panels, colours and suppliers" to="/settings/materials" />
        <Row icon={<><circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7"/></>}              iconBg="#EEF2FF" iconColor="#5B8AF0" label="Customers"          sub="Manage customer database"             to="/settings/customers" />
        <Row icon={<><circle cx="9" cy="7" r="4"/><path d="M3 21v-2a4 4 0 014-4h4"/><path d="M16 11l2 2 4-4"/></>} iconBg="#FEF3C7" iconColor="#D97706" label="Team" sub="Manage who has access" to="/settings/team" />
        <Row icon={<><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/></>} iconBg="#F5F3FF" iconColor="#7F77DD" label="File types" sub="Document types and approval settings" to="/settings/file-types" />
        <Row icon={<><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z"/></>} iconBg="#ECFDF5" iconColor="#1D9E75" label="Job processes" sub="Define production stages for jobs" to="/settings/processes" />
      </div>
    </div>
  )
}
