import { useState, useEffect, useRef } from 'react'
import { supabase, pubUrl } from '../lib/supabase'
import { useToast } from '../components/Toast'
import { ROLES } from '../context/AppContext'
import BackButton from '../components/BackButton'

const ROLE_COLORS = {
  'Admin':              { bg:'#EEF2FF', color:'#3730A3' },
  'Project Manager':    { bg:'#F0FDF4', color:'#166534' },
  'Setout':             { bg:'#FEF3C7', color:'#854D0E' },
  'Designer':           { bg:'#FEF2F2', color:'#991B1B' },
  'Production Manager': { bg:'#F5F3FF', color:'#5B21B6' },
  'Production Team':    { bg:'#F3F4F6', color:'#6B7280' },
}
const AVATAR_COLORS = ['#185FA5','#085041','#854F0B','#534AB7','#A32D2D','#0F6E56','#3C3489','#1D6E8A']
const initials = m => ((m.full_name||m.email||'?').split(' ').map(w=>w[0]).slice(0,2).join('')||'?').toUpperCase()

// ── Module definitions ─────────────────────────────────────────────
const MODULES = [
  { section:'Jobs', items:[
    { key:'jobs',          label:'Jobs',            desc:'View and manage all jobs',            icon:'💼' },
    { key:'schedule',      label:'Schedule',        desc:'Calendar and Gantt view',             icon:'📅' },
    { key:'order_sheet',   label:'Order Sheet',     desc:'Materials ordering',                  icon:'📋' },
    { key:'processes',     label:'Job Processes',   desc:'Production process tracking',         icon:'⚙️' },
  ]},
  { section:'Tools', items:[
    { key:'spec_builder',  label:'Spec Builder',    desc:'Designer spec compilation tool',      icon:'📐' },
    { key:'notes',         label:'Notes',           desc:'Job and general notes',               icon:'📝' },
    { key:'formula_writer',label:'Formula Writer',  desc:'Custom formula tool',                 icon:'🔢' },
    { key:'reports',       label:'Reports',         desc:'Time tracking and feedback reports',  icon:'📊' },
  ]},
  { section:'Library', items:[
    { key:'materials',     label:'Materials',       desc:'Materials library',                   icon:'🎨' },
    { key:'appliances',    label:'Appliances',      desc:'Appliances library',                  icon:'🔌' },
  ]},
  { section:'Settings', items:[
    { key:'settings',      label:'Settings',        desc:'App settings and configuration',      icon:'⚙️' },
    { key:'team',          label:'Team management', desc:'Manage users and access',             icon:'👥' },
    { key:'customers',     label:'Customers',       desc:'Customer database',                   icon:'🏢' },
  ]},
]

// ── Member detail view ─────────────────────────────────────────────
function MemberDetail({ member, avatarColor, onBack, onUpdated }) {
  const [tab, setTab]     = useState('details')
  const [m, setM]         = useState(member)
  const [saving, setSaving] = useState(false)
  const [files, setFiles] = useState([])
  const [filesLoading, setFilesLoading] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [access, setAccess] = useState({})
  const [accessLoading, setAccessLoading] = useState(true)
  const fileInputRef = useRef()
  const toast = useToast()

  useEffect(() => {
    // Load files
    supabase.from('profile_files').select('*').eq('profile_id', member.id).order('created_at', { ascending:false })
      .then(({ data }) => { setFiles(data||[]); setFilesLoading(false) })
    // Load module access
    supabase.from('profile_module_access').select('*').eq('profile_id', member.id)
      .then(({ data }) => {
        const acc = {}
        ;(data||[]).forEach(r => { acc[r.module_key] = r.enabled })
        setAccess(acc); setAccessLoading(false)
      })
  }, [member.id])

  async function saveDetails() {
    setSaving(true)
    const { error } = await supabase.from('profiles').update({
      full_name: m.full_name, role: m.role,
      phone: m.phone, position: m.position, department: m.department, notes: m.notes,
    }).eq('id', m.id)
    if (error) { toast(error.message, 'error') } else { toast('Saved ✓'); onUpdated(m) }
    setSaving(false)
  }

  async function uploadFile(e) {
    const file = e.target.files?.[0]; if (!file) return
    setUploading(true)
    const path = `profiles/${member.id}/${Date.now()}-${file.name}`
    const { error: upErr } = await supabase.storage.from('job-files').upload(path, file)
    if (upErr) { toast(upErr.message, 'error'); setUploading(false); return }
    const { data, error } = await supabase.from('profile_files').insert({
      profile_id: member.id, name: file.name, size: file.size,
      mime_type: file.type, storage_path: path,
    }).select().single()
    if (!error) { setFiles(p=>[data,...p]); toast('Uploaded ✓') }
    setUploading(false)
    e.target.value = ''
  }

  async function deleteFile(f) {
    if (!confirm(`Delete "${f.name}"?`)) return
    await supabase.storage.from('job-files').remove([f.storage_path])
    await supabase.from('profile_files').delete().eq('id', f.id)
    setFiles(p=>p.filter(x=>x.id!==f.id))
    toast('Deleted')
  }

  async function toggleModule(key, enabled) {
    setAccess(p=>({...p,[key]:enabled}))
    await supabase.from('profile_module_access').upsert(
      { profile_id: member.id, module_key: key, enabled },
      { onConflict: 'profile_id,module_key' }
    )
  }

  function fmtSize(bytes) {
    if (!bytes) return ''
    if (bytes < 1024) return bytes+'B'
    if (bytes < 1024*1024) return (bytes/1024).toFixed(0)+'KB'
    return (bytes/1024/1024).toFixed(1)+'MB'
  }

  function fmtDate(d) {
    if (!d) return ''
    return new Date(d).toLocaleDateString('en-NZ',{day:'numeric',month:'short',year:'numeric'})
  }

  const rc = ROLE_COLORS[m.role] || ROLE_COLORS['Production Team']

  return (
    <div style={{ maxWidth:720, margin:'0 auto' }}>
      {/* Back */}
      <button onClick={onBack} style={{ background:'none', border:'none', cursor:'pointer', color:'#6B7280', display:'flex', alignItems:'center', gap:4, fontSize:13, fontWeight:600, padding:0, marginBottom:20 }}
        onMouseEnter={e=>e.currentTarget.style.color='#2A3042'} onMouseLeave={e=>e.currentTarget.style.color='#6B7280'}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="15 18 9 12 15 6"/></svg>
        Team
      </button>

      {/* Profile header */}
      <div style={{ background:'#fff', borderRadius:14, border:'1px solid #E8ECF0', padding:'20px 24px', marginBottom:16, display:'flex', alignItems:'center', gap:16 }}>
        <div style={{ width:56, height:56, borderRadius:'50%', background:avatarColor, display:'flex', alignItems:'center', justifyContent:'center', fontSize:18, fontWeight:700, color:'#fff', flexShrink:0 }}>
          {initials(m)}
        </div>
        <div style={{ flex:1, minWidth:0 }}>
          <div style={{ fontSize:18, fontWeight:800, color:'#2A3042' }}>{m.full_name || m.email}</div>
          <div style={{ fontSize:13, color:'#9CA3AF', marginTop:2 }}>{m.email}</div>
          <div style={{ marginTop:6 }}>
            <span style={{ fontSize:12, fontWeight:700, padding:'3px 10px', borderRadius:20, background:rc.bg, color:rc.color }}>{m.role || 'Production Team'}</span>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display:'flex', gap:2, background:'#F3F4F6', borderRadius:10, padding:3, marginBottom:18 }}>
        {[{key:'details',label:'Details'},{key:'files',label:'Files'},{key:'access',label:'Access'}].map(t=>(
          <button key={t.key} onClick={()=>setTab(t.key)}
            style={{ flex:1, padding:'8px 12px', borderRadius:8, border:'none', cursor:'pointer', fontSize:13, fontWeight:tab===t.key?700:500,
              background:tab===t.key?'#fff':'transparent', color:tab===t.key?'#2A3042':'#6B7280',
              boxShadow:tab===t.key?'0 1px 3px rgba(0,0,0,0.1)':'none' }}>
            {t.label}
          </button>
        ))}
      </div>

      {/* DETAILS TAB */}
      {tab === 'details' && (
        <div style={{ background:'#fff', borderRadius:14, border:'1px solid #E8ECF0', padding:24 }}>
          <div style={{ fontSize:11, fontWeight:700, color:'#9CA3AF', textTransform:'uppercase', letterSpacing:'.06em', marginBottom:16 }}>Employee information</div>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:14, marginBottom:16 }}>
            {[
              { label:'Full name', key:'full_name', placeholder:'Jake Smith' },
              { label:'Position / Title', key:'position', placeholder:'Site manager' },
              { label:'Department', key:'department', placeholder:'Production' },
              { label:'Phone', key:'phone', placeholder:'+64 21 123 4567' },
            ].map(f=>(
              <div key={f.key}>
                <label style={{ fontSize:11, fontWeight:600, color:'#6B7280', display:'block', marginBottom:5 }}>{f.label}</label>
                <input value={m[f.key]||''} onChange={e=>setM(p=>({...p,[f.key]:e.target.value}))} placeholder={f.placeholder}
                  style={{ width:'100%', padding:'8px 12px', border:'1px solid #DDE3EC', borderRadius:9, fontSize:13, outline:'none', boxSizing:'border-box' }} />
              </div>
            ))}
            <div>
              <label style={{ fontSize:11, fontWeight:600, color:'#6B7280', display:'block', marginBottom:5 }}>Role</label>
              <select value={m.role||'Production Team'} onChange={e=>setM(p=>({...p,role:e.target.value}))}
                style={{ width:'100%', padding:'8px 12px', border:'1px solid #DDE3EC', borderRadius:9, fontSize:13, outline:'none', background:'#fff', boxSizing:'border-box' }}>
                {ROLES.map(r=><option key={r}>{r}</option>)}
              </select>
            </div>
          </div>
          <div style={{ marginBottom:16 }}>
            <label style={{ fontSize:11, fontWeight:600, color:'#6B7280', display:'block', marginBottom:5 }}>Notes</label>
            <textarea value={m.notes||''} onChange={e=>setM(p=>({...p,notes:e.target.value}))} placeholder="Any additional notes…"
              style={{ width:'100%', minHeight:80, padding:'8px 12px', border:'1px solid #DDE3EC', borderRadius:9, fontSize:13, outline:'none', resize:'vertical', fontFamily:'inherit', lineHeight:1.6, boxSizing:'border-box' }} />
          </div>
          <div style={{ display:'flex', justifyContent:'flex-end' }}>
            <button onClick={saveDetails} disabled={saving}
              style={{ fontSize:13, fontWeight:700, padding:'9px 20px', borderRadius:9, border:'none', background:'#5B8AF0', color:'#fff', cursor:'pointer', opacity:saving?0.6:1, boxShadow:'0 2px 8px rgba(91,138,240,0.3)' }}>
              {saving ? 'Saving…' : 'Save changes'}
            </button>
          </div>
        </div>
      )}

      {/* FILES TAB */}
      {tab === 'files' && (
        <div style={{ background:'#fff', borderRadius:14, border:'1px solid #E8ECF0', overflow:'hidden' }}>
          <div style={{ padding:'16px 20px', borderBottom:'1px solid #F3F4F6', display:'flex', alignItems:'center', justifyContent:'space-between' }}>
            <div style={{ fontSize:13, color:'#9CA3AF' }}>{files.length} document{files.length!==1?'s':''}</div>
            <button onClick={()=>fileInputRef.current?.click()} disabled={uploading}
              style={{ fontSize:12, fontWeight:700, padding:'6px 14px', borderRadius:8, border:'none', background:'#5B8AF0', color:'#fff', cursor:'pointer', display:'flex', alignItems:'center', gap:5, opacity:uploading?0.6:1 }}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
              {uploading ? 'Uploading…' : 'Upload file'}
            </button>
            <input ref={fileInputRef} type="file" style={{ display:'none' }} onChange={uploadFile} />
          </div>
          {filesLoading ? (
            <div style={{ padding:'40px 0', display:'flex', justifyContent:'center' }}><div className="spinner" /></div>
          ) : files.length === 0 ? (
            <div style={{ padding:'48px 20px', textAlign:'center', color:'#9CA3AF' }}>
              <div style={{ fontSize:28, marginBottom:8 }}>📁</div>
              <div style={{ fontSize:14, fontWeight:600, color:'#374151', marginBottom:4 }}>No files yet</div>
              <div style={{ fontSize:13 }}>Upload contracts, certifications, ID documents…</div>
            </div>
          ) : files.map(f => {
            const isImg = f.mime_type?.startsWith('image/')
            const isPdf = f.mime_type === 'application/pdf'
            return (
              <div key={f.id} style={{ display:'flex', alignItems:'center', gap:12, padding:'12px 20px', borderBottom:'1px solid #F9FAFB' }}>
                <div style={{ width:38, height:38, borderRadius:9, background:'#F3F4F6', display:'flex', alignItems:'center', justifyContent:'center', fontSize:20, flexShrink:0 }}>
                  {isImg ? '🖼' : isPdf ? '📄' : '📎'}
                </div>
                <div style={{ flex:1, minWidth:0 }}>
                  <div style={{ fontSize:13, fontWeight:600, color:'#2A3042', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{f.name}</div>
                  <div style={{ fontSize:11, color:'#9CA3AF', marginTop:1 }}>{fmtSize(f.size)} · {fmtDate(f.created_at)}</div>
                </div>
                <a href={supabase.storage.from('job-files').getPublicUrl(f.storage_path).data.publicUrl}
                  target="_blank" rel="noreferrer"
                  style={{ fontSize:12, fontWeight:600, padding:'5px 10px', borderRadius:7, border:'1px solid #E8ECF0', background:'#F9FAFB', color:'#374151', textDecoration:'none', display:'flex', alignItems:'center', gap:4 }}
                  onMouseEnter={e=>e.currentTarget.style.background='#EEF2FF'} onMouseLeave={e=>e.currentTarget.style.background='#F9FAFB'}>
                  View
                </a>
                <button onClick={()=>deleteFile(f)} style={{ background:'none', border:'none', cursor:'pointer', color:'#D1D5DB', fontSize:16 }}
                  onMouseEnter={e=>e.currentTarget.style.color='#E24B4A'} onMouseLeave={e=>e.currentTarget.style.color='#D1D5DB'}>×</button>
              </div>
            )
          })}
        </div>
      )}

      {/* ACCESS TAB */}
      {tab === 'access' && (
        <div>
          <div style={{ background:'#EEF2FF', borderRadius:10, border:'1px solid #C4D4F8', padding:'10px 14px', marginBottom:16, fontSize:12, color:'#3730A3', display:'flex', gap:8 }}>
            <span>ℹ️</span>
            <span>Module access toggles allow fine-grained control <strong>within</strong> the user's role. Disabling a module hides it from their navigation. Role permissions still apply.</span>
          </div>
          {accessLoading ? (
            <div style={{ display:'flex', justifyContent:'center', padding:'40px 0' }}><div className="spinner" /></div>
          ) : (
            <div style={{ display:'flex', flexDirection:'column', gap:12 }}>
              {MODULES.map(section => (
                <div key={section.section} style={{ background:'#fff', borderRadius:14, border:'1px solid #E8ECF0', overflow:'hidden' }}>
                  <div style={{ padding:'10px 18px', background:'#F9FAFB', borderBottom:'1px solid #F3F4F6' }}>
                    <span style={{ fontSize:11, fontWeight:700, color:'#9CA3AF', textTransform:'uppercase', letterSpacing:'.06em' }}>{section.section}</span>
                  </div>
                  {section.items.map((mod, i) => {
                    const enabled = access[mod.key] !== false  // default ON
                    return (
                      <div key={mod.key} style={{ display:'flex', alignItems:'center', gap:14, padding:'13px 18px', borderBottom:i<section.items.length-1?'1px solid #F9FAFB':'none' }}>
                        <div style={{ width:36, height:36, borderRadius:9, background:enabled?'#EEF2FF':'#F3F4F6', display:'flex', alignItems:'center', justifyContent:'center', fontSize:18, flexShrink:0, transition:'background .2s' }}>
                          {mod.icon}
                        </div>
                        <div style={{ flex:1, minWidth:0 }}>
                          <div style={{ fontSize:13, fontWeight:600, color:enabled?'#2A3042':'#9CA3AF', transition:'color .2s' }}>{mod.label}</div>
                          <div style={{ fontSize:11, color:'#9CA3AF', marginTop:1 }}>{mod.desc}</div>
                        </div>
                        {/* Toggle switch */}
                        <button onClick={()=>toggleModule(mod.key, !enabled)}
                          style={{ position:'relative', width:44, height:24, borderRadius:12, border:'none', cursor:'pointer', padding:0, flexShrink:0,
                            background:enabled?'#5B8AF0':'#D1D5DB', transition:'background .2s' }}>
                          <div style={{ position:'absolute', top:3, left:enabled?22:3, width:18, height:18, borderRadius:'50%', background:'#fff', boxShadow:'0 1px 3px rgba(0,0,0,0.2)', transition:'left .2s' }} />
                        </button>
                      </div>
                    )
                  })}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ── Main Team screen ───────────────────────────────────────────────
export default function Team() {
  const toast = useToast()
  const [members, setMembers]     = useState([])
  const [loading, setLoading]     = useState(true)
  const [activeMember, setActiveMember] = useState(null)
  const [showInvite, setShowInvite] = useState(false)
  const [inv, setInv]   = useState({ name:'', email:'', role:'Production Team', pw:'' })
  const [invErr, setInvErr]     = useState('')
  const [invSaving, setInvSaving] = useState(false)
  const setI = k => e => setInv(p=>({...p,[k]:e.target.value}))

  useEffect(() => {
    supabase.from('profiles').select('*').order('full_name').then(({ data }) => {
      setMembers(data||[]); setLoading(false)
    })
  }, [])

  async function removeMember(m) {
    if (!confirm(`Remove ${m.full_name||m.email}?`)) return
    await supabase.from('profiles').delete().eq('id', m.id)
    setMembers(prev=>prev.filter(x=>x.id!==m.id))
    toast('Member removed')
  }

  async function inviteUser() {
    setInvErr('')
    if (!inv.name||!inv.email||!inv.pw) { setInvErr('Please fill in all fields.'); return }
    if (inv.pw.length < 6) { setInvErr('Password must be at least 6 characters.'); return }
    setInvSaving(true)
    const { data, error } = await supabase.auth.signUp({
      email: inv.email, password: inv.pw,
      options: { data: { full_name: inv.name, role: inv.role } }
    })
    if (error) { setInvErr(error.message); setInvSaving(false); return }
    if (data.user) {
      await supabase.from('profiles').upsert({ id:data.user.id, email:inv.email, full_name:inv.name, role:inv.role })
      setMembers(prev=>[...prev,{ id:data.user.id, email:inv.email, full_name:inv.name, role:inv.role }])
    }
    setInvSaving(false); setShowInvite(false)
    setInv({ name:'', email:'', role:'Production Team', pw:'' })
    toast('User created ✓')
  }

  // Show member detail
  if (activeMember) {
    const idx = members.findIndex(m=>m.id===activeMember.id)
    return (
      <MemberDetail
        member={activeMember}
        avatarColor={AVATAR_COLORS[idx % AVATAR_COLORS.length]}
        onBack={()=>setActiveMember(null)}
        onUpdated={updated => { setMembers(prev=>prev.map(m=>m.id===updated.id?updated:m)); setActiveMember(updated) }}
      />
    )
  }

  return (
    <div>
      <BackButton to="/settings" label="Settings" />
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:20 }}>
        <h1 style={{ fontSize:20, fontWeight:800, color:'#2A3042', margin:0 }}>Team</h1>
        <button onClick={()=>setShowInvite(v=>!v)}
          style={{ fontSize:13, fontWeight:700, padding:'8px 16px', borderRadius:9, border:'none', background:'#5B8AF0', color:'#fff', cursor:'pointer' }}>
          {showInvite ? 'Cancel' : '+ Add member'}
        </button>
      </div>

      {/* Invite form */}
      {showInvite && (
        <div style={{ background:'#fff', borderRadius:12, border:'1px solid #E8ECF0', padding:20, marginBottom:16 }}>
          <div style={{ fontSize:14, fontWeight:700, color:'#2A3042', marginBottom:12 }}>Add new team member</div>
          {invErr && <div style={{ fontSize:12, color:'#991B1B', background:'#FEF2F2', border:'1px solid #FCA5A5', borderRadius:8, padding:'8px 12px', marginBottom:10 }}>{invErr}</div>}
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12, marginBottom:12 }}>
            {[['Full name','name','text','Jake Smith',2],['Email','email','email','jake@company.com',2],['Role','role','select','',1],['Temp password','pw','password','Min 6 chars',1]].map(([l,k,t,ph,span])=>(
              <div key={k} style={{ gridColumn:`span ${span}` }}>
                <label style={{ fontSize:11, fontWeight:600, color:'#6B7280', display:'block', marginBottom:4 }}>{l}</label>
                {t==='select'
                  ? <select value={inv.role} onChange={setI('role')} style={{ width:'100%', padding:'8px 12px', border:'1px solid #DDE3EC', borderRadius:9, fontSize:13, outline:'none', background:'#fff', boxSizing:'border-box' }}>
                      {ROLES.map(r=><option key={r}>{r}</option>)}
                    </select>
                  : <input type={t} placeholder={ph} value={inv[k]} onChange={setI(k)}
                      style={{ width:'100%', padding:'8px 12px', border:'1px solid #DDE3EC', borderRadius:9, fontSize:13, outline:'none', boxSizing:'border-box' }} />
                }
              </div>
            ))}
          </div>
          <button onClick={inviteUser} disabled={invSaving}
            style={{ fontSize:13, fontWeight:700, padding:'9px 18px', borderRadius:9, border:'none', background:'#5B8AF0', color:'#fff', cursor:'pointer', opacity:invSaving?0.6:1 }}>
            {invSaving ? 'Creating…' : 'Create account'}
          </button>
        </div>
      )}

      {/* Member list */}
      {loading ? (
        <div style={{ display:'flex', justifyContent:'center', padding:'48px 0' }}><div className="spinner" /></div>
      ) : (
        <div style={{ background:'#fff', borderRadius:12, border:'1px solid #E8ECF0', overflow:'hidden' }}>
          {members.length === 0 ? (
            <div style={{ padding:'48px 20px', textAlign:'center', fontSize:13, color:'#9CA3AF' }}>No team members yet</div>
          ) : members.map((m, i) => {
            const rc = ROLE_COLORS[m.role] || ROLE_COLORS['Production Team']
            return (
              <div key={m.id} onClick={()=>setActiveMember(m)}
                style={{ display:'flex', alignItems:'center', gap:12, padding:'14px 20px', borderBottom:'1px solid #F3F4F6', cursor:'pointer', transition:'background .1s' }}
                onMouseEnter={e=>e.currentTarget.style.background='#F9FAFB'} onMouseLeave={e=>e.currentTarget.style.background='#fff'}>
                <div style={{ width:40, height:40, borderRadius:'50%', background:AVATAR_COLORS[i%AVATAR_COLORS.length], display:'flex', alignItems:'center', justifyContent:'center', fontSize:13, fontWeight:700, color:'#fff', flexShrink:0 }}>
                  {initials(m)}
                </div>
                <div style={{ flex:1, minWidth:0 }}>
                  <div style={{ fontSize:14, fontWeight:700, color:'#2A3042' }}>{m.full_name || '—'}</div>
                  <div style={{ fontSize:12, color:'#9CA3AF', marginTop:1, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{m.email}</div>
                </div>
                <span style={{ fontSize:11, fontWeight:700, padding:'3px 10px', borderRadius:20, background:rc.bg, color:rc.color, flexShrink:0 }}>
                  {m.role || 'Production Team'}
                </span>
                <button onClick={e=>{e.stopPropagation();removeMember(m)}} style={{ background:'none', border:'none', cursor:'pointer', color:'#D1D5DB', fontSize:18, flexShrink:0, padding:'2px 4px' }}
                  onMouseEnter={e=>e.currentTarget.style.color='#E24B4A'} onMouseLeave={e=>e.currentTarget.style.color='#D1D5DB'}>×</button>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#C4C9D4" strokeWidth="2"><polyline points="9 18 15 12 9 6"/></svg>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
