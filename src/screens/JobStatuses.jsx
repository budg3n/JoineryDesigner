import { useState, useEffect, useRef } from 'react'
import { supabase } from '../lib/supabase'
import { useToast } from '../components/Toast'
import BackButton from '../components/BackButton'

const DEFAULT_STATUSES = [
  { label:'Pending',                color:'#9CA3AF', isDefault:true },
  { label:'In progress',            color:'#5B8AF0', isDefault:true },
  { label:'Submitted for approval', color:'#F97316', isDefault:true },
  { label:'Review',                 color:'#EF9F27', isDefault:true },
  { label:'On hold',                color:'#E24B4A', isDefault:true },
  { label:'Complete',               color:'#1D9E75', isDefault:true },
]

const PRESET_COLORS = [
  '#9CA3AF','#5B8AF0','#1D9E75','#EF9F27','#E24B4A',
  '#F97316','#8B5CF6','#EC4899','#06B6D4','#374151',
]

function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2) }

export default function JobStatuses() {
  const toast = useToast()
  const [statuses, setStatuses]   = useState([])
  const [loading, setLoading]     = useState(true)
  const [saving, setSaving]       = useState(false)
  const [adding, setAdding]       = useState(false)
  const [newLabel, setNewLabel]   = useState('')
  const [newColor, setNewColor]   = useState('#5B8AF0')
  const [editingId, setEditingId] = useState(null)
  const dragIdx = useRef(null)

  useEffect(() => {
    supabase.from('app_settings').select('value').eq('key','job_statuses').maybeSingle()
      .then(({ data }) => {
        if (data?.value) {
          const v = typeof data.value === 'string' ? JSON.parse(data.value) : data.value
          setStatuses(Array.isArray(v) ? v : DEFAULT_STATUSES)
        } else {
          setStatuses(DEFAULT_STATUSES)
        }
        setLoading(false)
      })
  }, [])

  async function save(updated) {
    setSaving(true)
    const { error } = await supabase.from('app_settings').upsert(
      { key:'job_statuses', value: JSON.stringify(updated) },
      { onConflict:'key' }
    )
    if (error) toast(error.message, 'error')
    else toast('Saved ✓')
    setSaving(false)
  }

  function addStatus() {
    if (!newLabel.trim()) return
    const updated = [...statuses, { id: uid(), label: newLabel.trim(), color: newColor, isDefault: false }]
    setStatuses(updated)
    save(updated)
    setNewLabel(''); setNewColor('#5B8AF0'); setAdding(false)
  }

  function updateStatus(idx, patch) {
    const updated = statuses.map((s,i) => i===idx ? { ...s, ...patch } : s)
    setStatuses(updated)
    return updated
  }

  function saveStatus(idx, patch) {
    const updated = updateStatus(idx, patch)
    save(updated)
    setEditingId(null)
  }

  function removeStatus(idx) {
    if (statuses[idx].isDefault) { toast('Default statuses cannot be removed', 'error'); return }
    if (!confirm(`Remove "${statuses[idx].label}"?`)) return
    const updated = statuses.filter((_,i) => i !== idx)
    setStatuses(updated)
    save(updated)
  }

  // Drag to reorder
  function onDragStart(i) { dragIdx.current = i }
  function onDragOver(e, i) {
    e.preventDefault()
    if (dragIdx.current === null || dragIdx.current === i) return
    const reordered = [...statuses]
    const [item] = reordered.splice(dragIdx.current, 1)
    reordered.splice(i, 0, item)
    dragIdx.current = i
    setStatuses(reordered)
  }
  function onDrop() { save(statuses); dragIdx.current = null }

  if (loading) return <div style={{ display:'flex', justifyContent:'center', padding:'60px 0' }}><div className="spinner" /></div>

  return (
    <div style={{ maxWidth:560, margin:'0 auto' }}>
      <BackButton to="/settings" label="Settings" />
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:20 }}>
        <div>
          <h1 style={{ fontSize:20, fontWeight:800, color:'#2A3042', margin:'0 0 4px' }}>Job Statuses</h1>
          <p style={{ fontSize:13, color:'#9CA3AF', margin:0 }}>Customise the statuses available on jobs. Drag to reorder.</p>
        </div>
        <button onClick={() => setAdding(v=>!v)}
          style={{ fontSize:13, fontWeight:700, padding:'8px 16px', borderRadius:9, border:'none', background:'#5B8AF0', color:'#fff', cursor:'pointer' }}>
          {adding ? 'Cancel' : '+ Add status'}
        </button>
      </div>

      {/* Add form */}
      {adding && (
        <div style={{ background:'#fff', borderRadius:12, border:'1px solid #E8ECF0', padding:16, marginBottom:12 }}>
          <div style={{ fontSize:12, fontWeight:700, color:'#6B7280', marginBottom:10 }}>New status</div>
          <div style={{ display:'flex', gap:10, alignItems:'center', marginBottom:12 }}>
            <input autoFocus value={newLabel} onChange={e=>setNewLabel(e.target.value)}
              onKeyDown={e=>e.key==='Enter'&&addStatus()}
              placeholder="e.g. Waiting on client"
              style={{ flex:1, padding:'8px 12px', border:'1px solid #DDE3EC', borderRadius:9, fontSize:13, outline:'none' }} />
          </div>
          <div style={{ marginBottom:12 }}>
            <div style={{ fontSize:11, fontWeight:600, color:'#6B7280', marginBottom:6 }}>Colour</div>
            <div style={{ display:'flex', gap:7, flexWrap:'wrap' }}>
              {PRESET_COLORS.map(c => (
                <button key={c} onClick={()=>setNewColor(c)}
                  style={{ width:28, height:28, borderRadius:'50%', background:c, border:`3px solid ${newColor===c?'#2A3042':'transparent'}`, cursor:'pointer', padding:0 }} />
              ))}
              <input type="color" value={newColor} onChange={e=>setNewColor(e.target.value)}
                style={{ width:28, height:28, borderRadius:'50%', border:'2px solid #E8ECF0', cursor:'pointer', padding:0 }} />
            </div>
          </div>
          {/* Preview */}
          <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:14, padding:'8px 12px', background:'#F9FAFB', borderRadius:8 }}>
            <span style={{ fontSize:12, color:'#9CA3AF' }}>Preview:</span>
            <span style={{ fontSize:12, fontWeight:700, padding:'3px 10px', borderRadius:20,
              background: newColor + '22', color: newColor, border:`1px solid ${newColor}44` }}>
              {newLabel || 'Status name'}
            </span>
          </div>
          <button onClick={addStatus} disabled={!newLabel.trim()}
            style={{ fontSize:13, fontWeight:700, padding:'8px 18px', borderRadius:9, border:'none',
              background: newLabel.trim() ? '#5B8AF0' : '#E8ECF0',
              color: newLabel.trim() ? '#fff' : '#9CA3AF', cursor: newLabel.trim() ? 'pointer' : 'not-allowed' }}>
            Add status
          </button>
        </div>
      )}

      {/* Status list */}
      <div style={{ background:'#fff', borderRadius:12, border:'1px solid #E8ECF0', overflow:'hidden' }}>
        {statuses.map((s, i) => (
          <div key={s.id||s.label} draggable onDragStart={()=>onDragStart(i)} onDragOver={e=>onDragOver(e,i)} onDrop={onDrop}
            style={{ display:'flex', alignItems:'center', gap:12, padding:'12px 16px', borderBottom:'1px solid #F3F4F6', background:'#fff', cursor:'grab' }}>
            {/* drag handle */}
            <svg width="12" height="16" viewBox="0 0 12 16" fill="#D1D5DB">
              <circle cx="4" cy="3" r="1.5"/><circle cx="4" cy="8" r="1.5"/><circle cx="4" cy="13" r="1.5"/>
              <circle cx="8" cy="3" r="1.5"/><circle cx="8" cy="8" r="1.5"/><circle cx="8" cy="13" r="1.5"/>
            </svg>

            {editingId === (s.id||s.label) ? (
              /* Edit mode */
              <div style={{ flex:1, display:'flex', gap:8, alignItems:'center', flexWrap:'wrap' }}>
                <input autoFocus defaultValue={s.label}
                  onKeyDown={e=>{ if(e.key==='Enter') saveStatus(i,{label:e.target.value}); if(e.key==='Escape') setEditingId(null) }}
                  style={{ flex:1, minWidth:120, padding:'5px 9px', border:'1px solid #C4D4F8', borderRadius:7, fontSize:13, outline:'none' }} />
                <div style={{ display:'flex', gap:5, flexWrap:'wrap' }}>
                  {PRESET_COLORS.map(c => (
                    <button key={c} onClick={()=>saveStatus(i,{color:c})}
                      style={{ width:22, height:22, borderRadius:'50%', background:c, border:`2px solid ${s.color===c?'#2A3042':'transparent'}`, cursor:'pointer', padding:0 }} />
                  ))}
                </div>
                <button onClick={()=>setEditingId(null)}
                  style={{ fontSize:11, padding:'4px 8px', borderRadius:6, border:'1px solid #E8ECF0', background:'#F9FAFB', cursor:'pointer', color:'#6B7280' }}>
                  Cancel
                </button>
              </div>
            ) : (
              /* View mode */
              <>
                <span style={{ fontSize:13, fontWeight:700, padding:'4px 12px', borderRadius:20,
                  background:(s.color||'#9CA3AF')+'22', color:s.color||'#9CA3AF', border:`1px solid ${(s.color||'#9CA3AF')}44`, flex:1 }}>
                  {s.label}
                </span>
                {s.isDefault && (
                  <span style={{ fontSize:10, color:'#9CA3AF', fontStyle:'italic', flexShrink:0 }}>default</span>
                )}
                <button onClick={()=>setEditingId(s.id||s.label)}
                  style={{ background:'none', border:'none', cursor:'pointer', color:'#9CA3AF', fontSize:12, padding:'4px 6px', borderRadius:6, flexShrink:0 }}
                  onMouseEnter={e=>e.currentTarget.style.color='#5B8AF0'} onMouseLeave={e=>e.currentTarget.style.color='#9CA3AF'}>
                  Edit
                </button>
                <button onClick={()=>removeStatus(i)}
                  style={{ background:'none', border:'none', cursor:'pointer', color:'#D1D5DB', fontSize:16, padding:'2px 4px', flexShrink:0 }}
                  onMouseEnter={e=>e.currentTarget.style.color=s.isDefault?'#D1D5DB':'#E24B4A'}
                  onMouseLeave={e=>e.currentTarget.style.color='#D1D5DB'}>×</button>
              </>
            )}
          </div>
        ))}
        {statuses.length === 0 && (
          <div style={{ padding:'40px 20px', textAlign:'center', color:'#9CA3AF', fontSize:13 }}>No statuses yet</div>
        )}
      </div>

      {saving && <div style={{ textAlign:'center', marginTop:12, fontSize:12, color:'#9CA3AF' }}>Saving…</div>}
    </div>
  )
}
