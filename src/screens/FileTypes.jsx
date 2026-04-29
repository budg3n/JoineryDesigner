import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { useToast } from '../components/Toast'
import BackButton from '../components/BackButton'

const COLORS = ['#5B8AF0','#1D9E75','#EF9F27','#7F77DD','#E24B4A','#D4537E','#374151','#0EA5E9']

export default function FileTypes() {
  const toast = useToast()
  const [types, setTypes]   = useState([])
  const [loading, setLoading] = useState(true)
  const [adding, setAdding]   = useState(false)
  const [editId, setEditId]   = useState(null)
  const [form, setForm]       = useState({ name:'', requires_approval:false, color:'#5B8AF0' })

  useEffect(() => {
    supabase.from('file_types').select('*').order('created_at')
      .then(({ data }) => { setTypes(data||[]); setLoading(false) })
  }, [])

  async function save() {
    if (!form.name.trim()) { toast('Enter a name','error'); return }
    if (editId) {
      const { data } = await supabase.from('file_types').update(form).eq('id', editId).select().single()
      setTypes(p => p.map(t => t.id===editId ? data : t))
      toast('Updated ✓')
      setEditId(null)
    } else {
      const { data } = await supabase.from('file_types').insert(form).select().single()
      setTypes(p => [...p, data])
      toast('Added ✓')
      setAdding(false)
    }
    setForm({ name:'', requires_approval:false, color:'#5B8AF0' })
  }

  async function del(id) {
    if (!confirm('Delete this file type?')) return
    await supabase.from('file_types').delete().eq('id', id)
    setTypes(p => p.filter(t => t.id !== id))
    toast('Deleted')
  }

  const FormRow = () => (
    <div style={{ background:'#F9FAFB', borderRadius:12, border:'1px solid #E8ECF0', padding:16, marginBottom:10 }}>
      <div style={{ display:'grid', gridTemplateColumns:'1fr auto', gap:10, marginBottom:12 }}>
        <div>
          <label style={{ fontSize:12, fontWeight:600, color:'#6B7280', display:'block', marginBottom:4 }}>File type name *</label>
          <input autoFocus value={form.name} onChange={e => setForm(p=>({...p,name:e.target.value}))}
            onKeyDown={e => e.key==='Enter' && save()}
            placeholder="e.g. Designer Drawings, Working Drawings…"
            style={{ width:'100%', padding:'8px 10px', border:'1px solid #DDE3EC', borderRadius:9, fontSize:13, outline:'none' }} />
        </div>
        <div>
          <label style={{ fontSize:12, fontWeight:600, color:'#6B7280', display:'block', marginBottom:4 }}>Colour</label>
          <div style={{ display:'flex', gap:5, flexWrap:'wrap', marginTop:2 }}>
            {COLORS.map(c => (
              <div key={c} onClick={() => setForm(p=>({...p,color:c}))}
                style={{ width:22, height:22, borderRadius:'50%', background:c, cursor:'pointer', border:`3px solid ${form.color===c?'#2A3042':'transparent'}`, transition:'all .1s' }} />
            ))}
          </div>
        </div>
      </div>
      {/* requires approval toggle */}
      <div style={{ display:'flex', alignItems:'center', gap:10, padding:'10px 12px', background:'#fff', borderRadius:9, border:'1px solid #E8ECF0', marginBottom:12 }}>
        <div onClick={() => setForm(p=>({...p,requires_approval:!p.requires_approval}))}
          style={{ width:38, height:22, borderRadius:11, background:form.requires_approval?'#5B8AF0':'#E8ECF0', cursor:'pointer', position:'relative', transition:'background .2s', flexShrink:0 }}>
          <div style={{ position:'absolute', top:2, left: form.requires_approval ? 18 : 2, width:18, height:18, borderRadius:'50%', background:'#fff', boxShadow:'0 1px 3px rgba(0,0,0,0.15)', transition:'left .2s' }} />
        </div>
        <div>
          <div style={{ fontSize:13, fontWeight:600, color:'#2A3042' }}>Requires PM approval</div>
          <div style={{ fontSize:11, color:'#9CA3AF' }}>Files of this type will show a "Request approval" button on the job</div>
        </div>
      </div>
      <div style={{ display:'flex', gap:8 }}>
        <button onClick={save} style={{ fontSize:13, fontWeight:700, padding:'7px 18px', borderRadius:9, border:'none', background:'#5B8AF0', color:'#fff', cursor:'pointer' }}>
          {editId ? 'Save changes' : 'Add file type'}
        </button>
        <button onClick={() => { setAdding(false); setEditId(null); setForm({name:'',requires_approval:false,color:'#5B8AF0'}) }}
          style={{ fontSize:13, fontWeight:600, padding:'7px 14px', borderRadius:9, border:'1px solid #E8ECF0', background:'#fff', color:'#374151', cursor:'pointer' }}>
          Cancel
        </button>
      </div>
    </div>
  )

  return (
    <div>
      <BackButton to="/settings" label="Settings" />
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:16 }}>
        <div>
          <h1 style={{ fontSize:20, fontWeight:800, color:'#2A3042', margin:'0 0 2px' }}>File types</h1>
          <p style={{ fontSize:13, color:'#9CA3AF', margin:0 }}>Define document types for job attachments and set approval requirements</p>
        </div>
        {!adding && !editId && (
          <button onClick={() => { setAdding(true); setForm({name:'',requires_approval:false,color:'#5B8AF0'}) }}
            style={{ fontSize:13, fontWeight:700, padding:'8px 18px', borderRadius:9, border:'none', background:'#5B8AF0', color:'#fff', cursor:'pointer' }}>
            + Add type
          </button>
        )}
      </div>

      {(adding && !editId) && <FormRow />}

      {loading ? (
        <div style={{ display:'flex', justifyContent:'center', padding:'40px 0' }}><div className="spinner" /></div>
      ) : types.length === 0 && !adding ? (
        <div style={{ textAlign:'center', padding:'40px 0', color:'#9CA3AF', fontSize:14 }}>
          No file types yet — add one to get started
        </div>
      ) : (
        <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
          {types.map(t => (
            <div key={t.id}>
              {editId === t.id ? <FormRow /> : (
                <div style={{ display:'flex', alignItems:'center', gap:12, padding:'12px 16px', background:'#fff', borderRadius:12, border:'1px solid #E8ECF0' }}>
                  <div style={{ width:12, height:12, borderRadius:'50%', background:t.color||'#9CA3AF', flexShrink:0 }} />
                  <div style={{ flex:1 }}>
                    <div style={{ fontSize:14, fontWeight:600, color:'#2A3042' }}>{t.name}</div>
                    {t.requires_approval && (
                      <div style={{ fontSize:11, color:'#5B8AF0', marginTop:1 }}>✓ Requires PM approval</div>
                    )}
                  </div>
                  <button onClick={() => { setEditId(t.id); setAdding(false); setForm({ name:t.name, requires_approval:t.requires_approval||false, color:t.color||'#5B8AF0' }) }}
                    style={{ fontSize:12, fontWeight:600, padding:'5px 12px', borderRadius:8, border:'1px solid #E8ECF0', background:'#fff', cursor:'pointer', color:'#374151' }}>Edit</button>
                  <button onClick={() => del(t.id)}
                    style={{ fontSize:12, fontWeight:600, padding:'5px 10px', borderRadius:8, border:'1px solid #FCA5A5', background:'#FEF2F2', cursor:'pointer', color:'#991B1B' }}>×</button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
