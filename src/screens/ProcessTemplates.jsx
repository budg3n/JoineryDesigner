import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { useToast } from '../components/Toast'
import BackButton from '../components/BackButton'

const COLORS = ['#5B8AF0','#1D9E75','#EF9F27','#7F77DD','#E24B4A','#D4537E','#0EA5E9','#374151']

export default function ProcessTemplates() {
  const toast = useToast()
  const [templates, setTemplates] = useState([])
  const [loading, setLoading]     = useState(true)
  const [editId, setEditId]       = useState(null)
  const [adding, setAdding]       = useState(false)
  const [form, setForm]           = useState({ name:'', description:'', default_hours:'', color:'#5B8AF0' })
  const set = (k,v) => setForm(p=>({...p,[k]:v}))

  useEffect(() => {
    supabase.from('process_templates').select('*').order('sort_order')
      .then(({data}) => { setTemplates(data||[]); setLoading(false) })
  }, [])

  async function save() {
    if (!form.name.trim()) { toast('Enter a name','error'); return }
    const row = { name:form.name, description:form.description, default_hours:parseFloat(form.default_hours)||0, color:form.color }
    if (editId) {
      const {data} = await supabase.from('process_templates').update(row).eq('id',editId).select().single()
      setTemplates(p=>p.map(t=>t.id===editId?data:t))
      toast('Updated ✓'); setEditId(null)
    } else {
      const {data} = await supabase.from('process_templates').insert({...row, sort_order:templates.length}).select().single()
      setTemplates(p=>[...p,data])
      toast('Added ✓'); setAdding(false)
    }
    setForm({name:'',description:'',default_hours:'',color:'#5B8AF0'})
  }

  async function del(id) {
    if (!confirm('Delete this process template?')) return
    await supabase.from('process_templates').delete().eq('id',id)
    setTemplates(p=>p.filter(t=>t.id!==id))
  }

  async function moveUp(idx) {
    if (idx===0) return
    const updated = [...templates]
    ;[updated[idx-1],updated[idx]] = [updated[idx],updated[idx-1]]
    setTemplates(updated)
    await Promise.all(updated.map((t,i)=>supabase.from('process_templates').update({sort_order:i}).eq('id',t.id)))
  }

  const inp = {border:'1px solid #DDE3EC',borderRadius:8,padding:'7px 10px',fontSize:13,outline:'none',width:'100%',boxSizing:'border-box'}

  const FormRow = () => (
    <div style={{background:'#F9FAFB',borderRadius:12,border:'1px solid #E8ECF0',padding:16,marginBottom:10}}>
      <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10,marginBottom:10}}>
        <div>
          <label style={{fontSize:11,fontWeight:700,color:'#6B7280',display:'block',marginBottom:4,textTransform:'uppercase'}}>Process name *</label>
          <input autoFocus value={form.name} onChange={e=>set('name',e.target.value)} onKeyDown={e=>e.key==='Enter'&&save()} placeholder="e.g. Setout, CNC, Assembly…" style={inp} />
        </div>
        <div>
          <label style={{fontSize:11,fontWeight:700,color:'#6B7280',display:'block',marginBottom:4,textTransform:'uppercase'}}>Default hours</label>
          <input type="number" min="0" step="0.5" value={form.default_hours} onChange={e=>set('default_hours',e.target.value)} placeholder="0" style={inp} />
        </div>
        <div style={{gridColumn:'span 2'}}>
          <label style={{fontSize:11,fontWeight:700,color:'#6B7280',display:'block',marginBottom:4,textTransform:'uppercase'}}>Description</label>
          <input value={form.description} onChange={e=>set('description',e.target.value)} placeholder="What happens in this stage…" style={inp} />
        </div>
        <div style={{gridColumn:'span 2'}}>
          <label style={{fontSize:11,fontWeight:700,color:'#6B7280',display:'block',marginBottom:6,textTransform:'uppercase'}}>Colour</label>
          <div style={{display:'flex',gap:6}}>
            {COLORS.map(c=>(
              <div key={c} onClick={()=>set('color',c)} style={{width:24,height:24,borderRadius:'50%',background:c,cursor:'pointer',border:`3px solid ${form.color===c?'#2A3042':'transparent'}`,transition:'all .1s'}} />
            ))}
          </div>
        </div>
      </div>
      <div style={{display:'flex',gap:8}}>
        <button onClick={save} style={{fontSize:13,fontWeight:700,padding:'7px 18px',borderRadius:9,border:'none',background:'#5B8AF0',color:'#fff',cursor:'pointer'}}>{editId?'Save':'Add process'}</button>
        <button onClick={()=>{setAdding(false);setEditId(null);setForm({name:'',description:'',default_hours:'',color:'#5B8AF0'})}}
          style={{fontSize:13,padding:'7px 14px',borderRadius:9,border:'1px solid #E8ECF0',background:'#fff',color:'#374151',cursor:'pointer'}}>Cancel</button>
      </div>
    </div>
  )

  return (
    <div>
      <BackButton to="/settings" label="Settings" />
      <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:16}}>
        <div>
          <h1 style={{fontSize:20,fontWeight:800,color:'#2A3042',margin:'0 0 2px'}}>Job processes</h1>
          <p style={{fontSize:13,color:'#9CA3AF',margin:0}}>Define production stages — these become available on every job</p>
        </div>
        {!adding&&!editId&&(
          <button onClick={()=>setAdding(true)} style={{fontSize:13,fontWeight:700,padding:'8px 18px',borderRadius:9,border:'none',background:'#5B8AF0',color:'#fff',cursor:'pointer'}}>+ Add process</button>
        )}
      </div>

      {adding&&!editId&&<FormRow/>}

      {loading ? <div style={{display:'flex',justifyContent:'center',padding:'40px 0'}}><div className="spinner"/></div>
      : templates.length===0&&!adding ? (
        <div style={{textAlign:'center',padding:'40px 0',color:'#9CA3AF',fontSize:14}}>
          No processes yet — add your first production stage<br/>
          <span style={{fontSize:12,marginTop:6,display:'block'}}>Suggested: Setout → CNC → Door & Drawer → Assembly → Finishing → Installation</span>
        </div>
      ) : (
        <div style={{display:'flex',flexDirection:'column',gap:8}}>
          {templates.map((t,idx)=>(
            <div key={t.id}>
              {editId===t.id ? <FormRow/> : (
                <div style={{display:'flex',alignItems:'center',gap:12,padding:'12px 16px',background:'#fff',borderRadius:12,border:'1px solid #E8ECF0'}}>
                  <div style={{width:4,height:36,borderRadius:2,background:t.color||'#9CA3AF',flexShrink:0}} />
                  <div style={{width:28,height:28,borderRadius:'50%',background:t.color+'22',border:`1.5px solid ${t.color}`,display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0,fontWeight:800,fontSize:11,color:t.color}}>{idx+1}</div>
                  <div style={{flex:1}}>
                    <div style={{fontSize:14,fontWeight:700,color:'#2A3042'}}>{t.name}</div>
                    <div style={{fontSize:11,color:'#9CA3AF'}}>
                      {t.default_hours>0?`${t.default_hours}h default`:'No default time'}
                      {t.description&&` · ${t.description}`}
                    </div>
                  </div>
                  <button onClick={()=>moveUp(idx)} disabled={idx===0} style={{background:'none',border:'none',cursor:idx===0?'not-allowed':'pointer',color:idx===0?'#E8ECF0':'#9CA3AF',fontSize:16,lineHeight:1,padding:'2px 6px'}}>↑</button>
                  <button onClick={()=>{setEditId(t.id);setAdding(false);setForm({name:t.name,description:t.description||'',default_hours:t.default_hours||'',color:t.color||'#5B8AF0'})}}
                    style={{fontSize:12,fontWeight:600,padding:'5px 12px',borderRadius:8,border:'1px solid #E8ECF0',background:'#fff',cursor:'pointer',color:'#374151'}}>Edit</button>
                  <button onClick={()=>del(t.id)} style={{fontSize:12,fontWeight:600,padding:'5px 10px',borderRadius:8,border:'1px solid #FCA5A5',background:'#FEF2F2',cursor:'pointer',color:'#991B1B'}}>×</button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
