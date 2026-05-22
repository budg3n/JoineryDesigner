import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { useToast } from '../components/Toast'
import { fmtDate, fmtDateTime } from '../lib/dates'

const inp = { width:'100%', padding:'8px 10px', border:'1px solid #DDE3EC', borderRadius:8, fontSize:13, outline:'none', boxSizing:'border-box', fontFamily:'inherit' }
const lbl = { fontSize:11, fontWeight:700, color:'#6B7280', display:'block', marginBottom:4 }

// ─────────────────────────────────────────────
// CONTACTS
// ─────────────────────────────────────────────
export function JobContactsTab({ jobId, profile }) {
  const toast = useToast()
  const [contacts, setContacts] = useState([])
  const [loading, setLoading]   = useState(true)
  const [form, setForm]         = useState(null)
  const [saving, setSaving]     = useState(false)

  useEffect(() => {
    if (!jobId) { setLoading(false); return }
    supabase.from('job_contacts').select('*').eq('job_id', jobId).order('created_at')
      .then(({ data, error }) => {
        if (error) console.warn('Contacts error:', error.message)
        setContacts(data || [])
        setLoading(false)
      })
  }, [jobId])

  const emptyForm = { name:'', role:'', company:'', email:'', phone:'', notes:'', type:'external' }

  async function save() {
    if (!form?.name?.trim()) { toast('Name is required', 'error'); return }
    setSaving(true)
    if (form.id) {
      const { error } = await supabase.from('job_contacts').update({
        name:form.name, role:form.role||'', company:form.company||'',
        email:form.email||'', phone:form.phone||'', notes:form.notes||'', type:form.type,
      }).eq('id', form.id)
      if (error) { toast(error.message, 'error'); setSaving(false); return }
      setContacts(p => p.map(c => c.id === form.id ? {...c, ...form} : c))
    } else {
      const { data, error } = await supabase.from('job_contacts').insert({
        job_id:jobId, name:form.name, role:form.role||'', company:form.company||'',
        email:form.email||'', phone:form.phone||'', notes:form.notes||'', type:form.type,
      }).select().single()
      if (error) { toast(error.message, 'error'); setSaving(false); return }
      setContacts(p => [...p, data])
    }
    toast('Contact saved ✓')
    setForm(null); setSaving(false)
  }

  async function del(id) {
    if (!confirm('Delete this contact?')) return
    await supabase.from('job_contacts').delete().eq('id', id)
    setContacts(p => p.filter(c => c.id !== id))
  }

  return (
    <div>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:16 }}>
        <h2 style={{ fontSize:16, fontWeight:800, color:'#2A3042', margin:0 }}>Contacts</h2>
        <button onClick={() => setForm({...emptyForm})}
          style={{ padding:'8px 16px', borderRadius:9, border:'none', background:'#5B8AF0', color:'#fff', fontSize:13, fontWeight:700, cursor:'pointer' }}>
          + Add contact
        </button>
      </div>

      {loading ? (
        <div style={{ textAlign:'center', padding:'40px 0' }}><div className="spinner" /></div>
      ) : contacts.length === 0 ? (
        <div style={{ textAlign:'center', padding:'48px 0', color:'#9CA3AF' }}>
          <div style={{ fontSize:32, marginBottom:8 }}>👥</div>
          <div style={{ fontSize:14, fontWeight:600, color:'#374151' }}>No contacts yet</div>
          <div style={{ fontSize:12, marginTop:4 }}>Add key people for this job</div>
        </div>
      ) : (
        <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
          {['internal','external'].map(type => {
            const list = contacts.filter(c => c.type === type)
            if (!list.length) return null
            return (
              <div key={type}>
                <div style={{ fontSize:11, fontWeight:700, color:'#9CA3AF', textTransform:'uppercase', letterSpacing:'.06em', marginBottom:8 }}>{type}</div>
                {list.map(c => (
                  <div key={c.id} style={{ background:'#fff', borderRadius:12, border:'1px solid #E8ECF0', padding:'12px 14px', display:'flex', alignItems:'flex-start', gap:12, marginBottom:8 }}>
                    <div style={{ width:38, height:38, borderRadius:'50%', background:'#EEF2FF', display:'flex', alignItems:'center', justifyContent:'center', fontSize:14, fontWeight:700, color:'#5B8AF0', flexShrink:0 }}>
                      {(c.name||'?')[0].toUpperCase()}
                    </div>
                    <div style={{ flex:1, minWidth:0 }}>
                      <div style={{ fontSize:14, fontWeight:700, color:'#2A3042' }}>{c.name}</div>
                      <div style={{ fontSize:12, color:'#9CA3AF' }}>{[c.role, c.company].filter(Boolean).join(' · ')}</div>
                      <div style={{ display:'flex', gap:14, marginTop:4, flexWrap:'wrap' }}>
                        {c.email && <a href={`mailto:${c.email}`} style={{ fontSize:12, color:'#5B8AF0', textDecoration:'none' }}>{c.email}</a>}
                        {c.phone && <a href={`tel:${c.phone}`} style={{ fontSize:12, color:'#5B8AF0', textDecoration:'none' }}>{c.phone}</a>}
                      </div>
                      {c.notes && <div style={{ fontSize:11, color:'#9CA3AF', marginTop:4, fontStyle:'italic' }}>{c.notes}</div>}
                    </div>
                    <div style={{ display:'flex', gap:6, flexShrink:0 }}>
                      <button onClick={() => setForm({...c})} style={{ padding:'3px 10px', borderRadius:7, border:'1px solid #E8ECF0', background:'#F9FAFB', color:'#6B7280', fontSize:12, cursor:'pointer' }}>Edit</button>
                      <button onClick={() => del(c.id)} style={{ padding:'3px 8px', borderRadius:7, border:'1px solid #FCA5A5', background:'#FEF2F2', color:'#DC2626', fontSize:12, cursor:'pointer' }}>✕</button>
                    </div>
                  </div>
                ))}
              </div>
            )
          })}
        </div>
      )}

      {form && (
        <div style={{ position:'fixed', inset:0, zIndex:600, background:'rgba(0,0,0,0.45)', display:'flex', alignItems:'center', justifyContent:'center', padding:16 }}
          onClick={e => e.target === e.currentTarget && setForm(null)}>
          <div style={{ background:'#fff', borderRadius:14, width:'100%', maxWidth:460, boxShadow:'0 20px 60px rgba(0,0,0,0.2)' }}>
            <div style={{ padding:'14px 18px', borderBottom:'1px solid #F3F4F6', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
              <div style={{ fontSize:15, fontWeight:700, color:'#2A3042' }}>{form.id ? 'Edit contact' : 'Add contact'}</div>
              <button onClick={() => setForm(null)} style={{ background:'none', border:'none', cursor:'pointer', color:'#9CA3AF', fontSize:22, lineHeight:1 }}>×</button>
            </div>
            <div style={{ padding:18, display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 }}>
              <div style={{ gridColumn:'span 2', display:'flex', gap:2, background:'#F3F4F6', borderRadius:8, padding:3 }}>
                {['internal','external'].map(t => (
                  <button key={t} onClick={() => setForm(f => ({...f, type:t}))}
                    style={{ flex:1, padding:'6px', borderRadius:6, border:'none', cursor:'pointer', fontSize:12, fontWeight:600, textTransform:'capitalize',
                      background:form.type===t?'#fff':'transparent', color:form.type===t?'#2A3042':'#9CA3AF',
                      boxShadow:form.type===t?'0 1px 3px rgba(0,0,0,0.1)':'none' }}>
                    {t}
                  </button>
                ))}
              </div>
              <div style={{ gridColumn:'span 2' }}>
                <label style={lbl}>Name *</label>
                <input autoFocus value={form.name||''} onChange={e => setForm(f => ({...f, name:e.target.value}))} placeholder="Full name" style={inp} />
              </div>
              <div><label style={lbl}>Role</label><input value={form.role||''} onChange={e => setForm(f => ({...f, role:e.target.value}))} placeholder="e.g. Architect" style={inp}/></div>
              <div><label style={lbl}>Company</label><input value={form.company||''} onChange={e => setForm(f => ({...f, company:e.target.value}))} placeholder="Company" style={inp}/></div>
              <div><label style={lbl}>Email</label><input type="email" value={form.email||''} onChange={e => setForm(f => ({...f, email:e.target.value}))} placeholder="email@example.com" style={inp}/></div>
              <div><label style={lbl}>Phone</label><input type="tel" value={form.phone||''} onChange={e => setForm(f => ({...f, phone:e.target.value}))} placeholder="+64 21 000 0000" style={inp}/></div>
              <div style={{ gridColumn:'span 2' }}>
                <label style={lbl}>Notes</label>
                <textarea value={form.notes||''} onChange={e => setForm(f => ({...f, notes:e.target.value}))} rows={2} style={{...inp, resize:'none'}} placeholder="Additional notes…"/>
              </div>
            </div>
            <div style={{ padding:'10px 18px', borderTop:'1px solid #F3F4F6', display:'flex', gap:8, justifyContent:'flex-end' }}>
              <button onClick={() => setForm(null)} style={{ padding:'8px 14px', borderRadius:9, border:'1px solid #E8ECF0', background:'#fff', color:'#6B7280', fontSize:13, cursor:'pointer' }}>Cancel</button>
              <button onClick={save} disabled={saving} style={{ padding:'8px 18px', borderRadius:9, border:'none', background:'#5B8AF0', color:'#fff', fontSize:13, fontWeight:700, cursor:'pointer' }}>
                {saving ? 'Saving…' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────
// RFI
// ─────────────────────────────────────────────
const STATUS_STYLE = {
  'Open':      { bg:'#FEF9C3', color:'#854D0E', border:'#FDE68A' },
  'In Review': { bg:'#DBEAFE', color:'#1E40AF', border:'#BFDBFE' },
  'Answered':  { bg:'#DCFCE7', color:'#065F46', border:'#86EFAC' },
  'Closed':    { bg:'#F3F4F6', color:'#6B7280', border:'#E5E7EB' },
}
const PRI_STYLE = {
  'Low':    '#9CA3AF',
  'Normal': '#6B7280',
  'High':   '#D97706',
  'Urgent': '#DC2626',
}

export function JobRFITab({ jobId, profile, profiles }) {
  const toast = useToast()
  const [rfis, setRfis]       = useState([])
  const [loading, setLoading] = useState(true)
  const [form, setForm]       = useState(null)
  const [detail, setDetail]   = useState(null)
  const [saving, setSaving]   = useState(false)

  useEffect(() => {
    if (!jobId) { setLoading(false); return }
    supabase.from('job_rfis').select('*').eq('job_id', jobId).order('number', { ascending:true })
      .then(({ data, error }) => {
        if (error) console.warn('RFI error:', error.message)
        setRfis(data || [])
        setLoading(false)
      })
  }, [jobId])

  function profileName(id) {
    const p = (profiles||[]).find(x => x.id === id)
    return p ? (p.full_name || p.email) : ''
  }

  function openNew() {
    const next = rfis.length ? Math.max(...rfis.map(r => r.number || 0)) + 1 : 1
    setForm({ title:'', description:'', type:'internal', status:'Open', priority:'Normal', assigned_to:'', due_date:'', number:next })
  }

  async function saveRFI() {
    if (!form?.title?.trim()) { toast('Title is required', 'error'); return }
    setSaving(true)
    const payload = {
      title:form.title, description:form.description||'', type:form.type,
      status:form.status, priority:form.priority,
      assigned_to:form.assigned_to||null, due_date:form.due_date||null,
      number:form.number, updated_at:new Date().toISOString(),
    }
    if (form.id) {
      const { error } = await supabase.from('job_rfis').update(payload).eq('id', form.id)
      if (error) { toast(error.message, 'error'); setSaving(false); return }
      setRfis(p => p.map(r => r.id === form.id ? {...r, ...payload} : r))
      if (detail?.id === form.id) setDetail(d => ({...d, ...payload}))
    } else {
      const { data, error } = await supabase.from('job_rfis')
        .insert({ ...payload, job_id:jobId, created_by:profile?.id||null })
        .select().single()
      if (error) { toast(error.message, 'error'); setSaving(false); return }
      setRfis(p => [...p, data])
    }
    toast('RFI saved ✓')
    setForm(null); setSaving(false)
  }

  async function respond(response) {
    if (!detail || !response.trim()) return
    const patch = { response, status:'Answered', responded_at:new Date().toISOString(), responded_by:profile?.id||null, updated_at:new Date().toISOString() }
    await supabase.from('job_rfis').update(patch).eq('id', detail.id)
    setRfis(p => p.map(r => r.id === detail.id ? {...r, ...patch} : r))
    setDetail(d => ({...d, ...patch}))
    toast('Response saved ✓')
  }

  async function changeStatus(status) {
    if (!detail) return
    await supabase.from('job_rfis').update({ status, updated_at:new Date().toISOString() }).eq('id', detail.id)
    setRfis(p => p.map(r => r.id === detail.id ? {...r, status} : r))
    setDetail(d => ({...d, status}))
  }

  async function del(id) {
    if (!confirm('Delete this RFI?')) return
    await supabase.from('job_rfis').delete().eq('id', id)
    setRfis(p => p.filter(r => r.id !== id))
    if (detail?.id === id) setDetail(null)
  }

  return (
    <div>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:16 }}>
        <div>
          <h2 style={{ fontSize:16, fontWeight:800, color:'#2A3042', margin:0 }}>RFI</h2>
          <div style={{ fontSize:12, color:'#9CA3AF', marginTop:2 }}>Requests for Information</div>
        </div>
        <button onClick={openNew}
          style={{ padding:'8px 16px', borderRadius:9, border:'none', background:'#5B8AF0', color:'#fff', fontSize:13, fontWeight:700, cursor:'pointer' }}>
          + New RFI
        </button>
      </div>

      {loading ? (
        <div style={{ textAlign:'center', padding:'40px 0' }}><div className="spinner"/></div>
      ) : rfis.length === 0 ? (
        <div style={{ textAlign:'center', padding:'48px 0', color:'#9CA3AF' }}>
          <div style={{ fontSize:32, marginBottom:8 }}>📋</div>
          <div style={{ fontSize:14, fontWeight:600, color:'#374151' }}>No RFIs yet</div>
          <div style={{ fontSize:12, marginTop:4 }}>Create a request for information</div>
        </div>
      ) : (
        <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
          {rfis.map(rfi => {
            const ss = STATUS_STYLE[rfi.status] || STATUS_STYLE.Open
            const priColor = PRI_STYLE[rfi.priority] || PRI_STYLE.Normal
            return (
              <div key={rfi.id} onClick={() => setDetail(rfi)}
                style={{ background: detail?.id===rfi.id ? '#F8FAFF' : '#fff', borderRadius:12,
                  border:`1px solid ${detail?.id===rfi.id?'#C4D4F8':'#E8ECF0'}`, padding:'12px 14px', cursor:'pointer' }}
                onMouseEnter={e => { if (detail?.id!==rfi.id) e.currentTarget.style.background='#F9FAFB' }}
                onMouseLeave={e => { if (detail?.id!==rfi.id) e.currentTarget.style.background='#fff' }}>
                <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', gap:8 }}>
                  <div style={{ flex:1, minWidth:0 }}>
                    <div style={{ display:'flex', alignItems:'center', gap:6, marginBottom:4, flexWrap:'wrap' }}>
                      <span style={{ fontSize:10, fontWeight:700, color:'#9CA3AF', fontFamily:'monospace' }}>
                        RFI-{String(rfi.number||0).padStart(3,'0')}
                      </span>
                      <span style={{ fontSize:11, fontWeight:700, padding:'1px 8px', borderRadius:20, background:ss.bg, color:ss.color, border:`1px solid ${ss.border}` }}>
                        {rfi.status}
                      </span>
                      <span style={{ fontSize:11, fontWeight:600, color:priColor }}>{rfi.priority}</span>
                      <span style={{ fontSize:10, padding:'1px 7px', borderRadius:10,
                        background:rfi.type==='internal'?'#EEF2FF':'#FFF7ED',
                        color:rfi.type==='internal'?'#3730A3':'#C2410C', fontWeight:600 }}>
                        {rfi.type}
                      </span>
                    </div>
                    <div style={{ fontSize:13, fontWeight:700, color:'#2A3042' }}>{rfi.title}</div>
                    {rfi.description && <div style={{ fontSize:12, color:'#6B7280', marginTop:2 }}>{rfi.description}</div>}
                    <div style={{ display:'flex', gap:10, marginTop:4, flexWrap:'wrap' }}>
                      {rfi.assigned_to && profileName(rfi.assigned_to) && (
                        <span style={{ fontSize:11, color:'#9CA3AF' }}>→ {profileName(rfi.assigned_to)}</span>
                      )}
                      {rfi.due_date && <span style={{ fontSize:11, color:'#9CA3AF' }}>Due {fmtDate(rfi.due_date)}</span>}
                    </div>
                    {rfi.response && (
                      <div style={{ marginTop:6, padding:'6px 10px', background:'#F0FDF4', borderRadius:8, border:'1px solid #86EFAC', fontSize:12, color:'#374151' }}>
                        <span style={{ fontWeight:700, color:'#166534', marginRight:6 }}>Response:</span>{rfi.response}
                      </div>
                    )}
                  </div>
                  <div style={{ display:'flex', gap:5, flexShrink:0 }}>
                    <button onClick={e => { e.stopPropagation(); setForm({...rfi}) }}
                      style={{ padding:'3px 10px', borderRadius:7, border:'1px solid #E8ECF0', background:'#F9FAFB', color:'#6B7280', fontSize:12, cursor:'pointer' }}>Edit</button>
                    <button onClick={e => { e.stopPropagation(); del(rfi.id) }}
                      style={{ padding:'3px 8px', borderRadius:7, border:'1px solid #FCA5A5', background:'#FEF2F2', color:'#DC2626', fontSize:12, cursor:'pointer' }}>✕</button>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Detail panel */}
      {detail && <RFIDetailPanel rfi={detail} profiles={profiles} onClose={() => setDetail(null)}
        onRespond={respond} onStatusChange={changeStatus} />}

      {/* Form modal */}
      {form && (
        <div style={{ position:'fixed', inset:0, zIndex:600, background:'rgba(0,0,0,0.45)', display:'flex', alignItems:'center', justifyContent:'center', padding:16 }}
          onClick={e => e.target===e.currentTarget && setForm(null)}>
          <div style={{ background:'#fff', borderRadius:14, width:'100%', maxWidth:500, maxHeight:'88vh', display:'flex', flexDirection:'column', boxShadow:'0 20px 60px rgba(0,0,0,0.2)' }}>
            <div style={{ padding:'14px 18px', borderBottom:'1px solid #F3F4F6', display:'flex', justifyContent:'space-between', alignItems:'center', flexShrink:0 }}>
              <div style={{ fontSize:15, fontWeight:700, color:'#2A3042' }}>
                {form.id ? 'Edit RFI' : `New RFI — #${String(form.number||1).padStart(3,'0')}`}
              </div>
              <button onClick={() => setForm(null)} style={{ background:'none', border:'none', cursor:'pointer', color:'#9CA3AF', fontSize:22 }}>×</button>
            </div>
            <div style={{ flex:1, overflowY:'auto', padding:18, display:'flex', flexDirection:'column', gap:10 }}>
              <div style={{ display:'flex', gap:2, background:'#F3F4F6', borderRadius:8, padding:3 }}>
                {['internal','external'].map(t => (
                  <button key={t} onClick={() => setForm(f => ({...f, type:t}))}
                    style={{ flex:1, padding:'6px', borderRadius:6, border:'none', cursor:'pointer', fontSize:12, fontWeight:600, textTransform:'capitalize',
                      background:form.type===t?'#fff':'transparent', color:form.type===t?'#2A3042':'#9CA3AF',
                      boxShadow:form.type===t?'0 1px 3px rgba(0,0,0,0.1)':'none' }}>
                    {t}
                  </button>
                ))}
              </div>
              <div>
                <label style={lbl}>Title *</label>
                <input autoFocus value={form.title||''} onChange={e => setForm(f => ({...f, title:e.target.value}))} placeholder="Brief description…" style={inp}/>
              </div>
              <div>
                <label style={lbl}>Description</label>
                <textarea value={form.description||''} onChange={e => setForm(f => ({...f, description:e.target.value}))} rows={3} style={{...inp, resize:'vertical'}} placeholder="Provide context and details…"/>
              </div>
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 }}>
                <div>
                  <label style={lbl}>Priority</label>
                  <select value={form.priority||'Normal'} onChange={e => setForm(f => ({...f, priority:e.target.value}))} style={{...inp, cursor:'pointer'}}>
                    {['Low','Normal','High','Urgent'].map(p => <option key={p}>{p}</option>)}
                  </select>
                </div>
                <div>
                  <label style={lbl}>Status</label>
                  <select value={form.status||'Open'} onChange={e => setForm(f => ({...f, status:e.target.value}))} style={{...inp, cursor:'pointer'}}>
                    {['Open','In Review','Answered','Closed'].map(s => <option key={s}>{s}</option>)}
                  </select>
                </div>
                <div>
                  <label style={lbl}>Assign to</label>
                  <select value={form.assigned_to||''} onChange={e => setForm(f => ({...f, assigned_to:e.target.value||null}))} style={{...inp, cursor:'pointer'}}>
                    <option value="">Unassigned</option>
                    {(profiles||[]).map(p => <option key={p.id} value={p.id}>{p.full_name||p.email}</option>)}
                  </select>
                </div>
                <div>
                  <label style={lbl}>Due date</label>
                  <input type="date" value={form.due_date||''} onChange={e => setForm(f => ({...f, due_date:e.target.value}))}
                    style={{...inp, color:'#374151', WebkitAppearance:'none'}}/>
                </div>
              </div>
            </div>
            <div style={{ padding:'10px 18px', borderTop:'1px solid #F3F4F6', display:'flex', gap:8, justifyContent:'flex-end', flexShrink:0 }}>
              <button onClick={() => setForm(null)} style={{ padding:'8px 14px', borderRadius:9, border:'1px solid #E8ECF0', background:'#fff', color:'#6B7280', fontSize:13, cursor:'pointer' }}>Cancel</button>
              <button onClick={saveRFI} disabled={saving} style={{ padding:'8px 18px', borderRadius:9, border:'none', background:'#5B8AF0', color:'#fff', fontSize:13, fontWeight:700, cursor:'pointer' }}>
                {saving ? 'Saving…' : 'Save RFI'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function RFIDetailPanel({ rfi, profiles, onClose, onRespond, onStatusChange }) {
  const [response, setResponse] = useState(rfi.response || '')
  const [saving, setSaving]     = useState(false)

  useEffect(() => { setResponse(rfi.response || '') }, [rfi.id])

  function profileName(id) {
    const p = (profiles||[]).find(x => x.id === id)
    return p ? (p.full_name || p.email) : ''
  }

  async function submit() {
    if (!response.trim()) return
    setSaving(true)
    await onRespond(response)
    setSaving(false)
  }

  const ss = STATUS_STYLE[rfi.status] || STATUS_STYLE.Open

  return (
    <div style={{ position:'fixed', inset:0, zIndex:600, background:'rgba(0,0,0,0.45)', display:'flex', alignItems:'center', justifyContent:'center', padding:16 }}
      onClick={e => e.target===e.currentTarget && onClose()}>
      <div style={{ background:'#fff', borderRadius:14, width:'100%', maxWidth:500, maxHeight:'88vh', display:'flex', flexDirection:'column', boxShadow:'0 20px 60px rgba(0,0,0,0.2)' }}>
        <div style={{ padding:'14px 18px', borderBottom:'1px solid #F3F4F6', display:'flex', justifyContent:'space-between', alignItems:'flex-start', flexShrink:0 }}>
          <div>
            <div style={{ fontSize:10, fontWeight:700, color:'#9CA3AF', fontFamily:'monospace', marginBottom:3 }}>
              RFI-{String(rfi.number||0).padStart(3,'0')}
            </div>
            <div style={{ fontSize:16, fontWeight:800, color:'#2A3042' }}>{rfi.title}</div>
          </div>
          <button onClick={onClose} style={{ background:'none', border:'none', cursor:'pointer', color:'#9CA3AF', fontSize:22, lineHeight:1, flexShrink:0 }}>×</button>
        </div>
        <div style={{ flex:1, overflowY:'auto', padding:18 }}>
          {/* Status buttons */}
          <div style={{ display:'flex', gap:6, flexWrap:'wrap', marginBottom:14 }}>
            {Object.keys(STATUS_STYLE).map(s => {
              const st = STATUS_STYLE[s]
              return (
                <button key={s} onClick={() => onStatusChange(s)}
                  style={{ padding:'4px 12px', borderRadius:20, fontSize:11, fontWeight:s===rfi.status?700:500, cursor:'pointer',
                    border:`1px solid ${s===rfi.status?st.border:'#E8ECF0'}`,
                    background:s===rfi.status?st.bg:'#fff',
                    color:s===rfi.status?st.color:'#9CA3AF' }}>
                  {s}
                </button>
              )
            })}
          </div>

          {rfi.description && (
            <div style={{ marginBottom:14 }}>
              <div style={{ fontSize:11, fontWeight:700, color:'#9CA3AF', textTransform:'uppercase', letterSpacing:'.05em', marginBottom:4 }}>Description</div>
              <div style={{ fontSize:13, color:'#374151', lineHeight:1.6 }}>{rfi.description}</div>
            </div>
          )}

          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8, marginBottom:14, fontSize:12 }}>
            {rfi.assigned_to && profileName(rfi.assigned_to) && (
              <div><span style={{ color:'#9CA3AF' }}>Assigned: </span><strong>{profileName(rfi.assigned_to)}</strong></div>
            )}
            {rfi.due_date && <div><span style={{ color:'#9CA3AF' }}>Due: </span><strong>{fmtDate(rfi.due_date)}</strong></div>}
            <div><span style={{ color:'#9CA3AF' }}>Type: </span><strong style={{ textTransform:'capitalize' }}>{rfi.type}</strong></div>
            <div><span style={{ color:'#9CA3AF' }}>Priority: </span><strong>{rfi.priority}</strong></div>
            <div><span style={{ color:'#9CA3AF' }}>Created: </span><strong>{fmtDateTime(rfi.created_at)}</strong></div>
          </div>

          <div>
            <div style={{ fontSize:11, fontWeight:700, color:'#9CA3AF', textTransform:'uppercase', letterSpacing:'.05em', marginBottom:6 }}>Response</div>
            <textarea value={response} onChange={e => setResponse(e.target.value)} rows={4}
              placeholder="Add a response…"
              style={{ width:'100%', padding:'10px 12px', border:'1px solid #DDE3EC', borderRadius:10, fontSize:13, outline:'none', resize:'vertical', fontFamily:'inherit', boxSizing:'border-box' }}/>
            <button onClick={submit} disabled={saving || !response.trim()}
              style={{ marginTop:8, padding:'9px 20px', borderRadius:9, border:'none', fontSize:13, fontWeight:700, cursor:response.trim()?'pointer':'default',
                background:response.trim()?'#1D9E75':'#E8ECF0', color:response.trim()?'#fff':'#9CA3AF' }}>
              {saving ? 'Saving…' : 'Save response'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
