import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useToast } from '../components/Toast'
import BackButton from '../components/BackButton'

const DEFAULT_STATUSES = [
  { label:'Pending',                color:'#9CA3AF' },
  { label:'In progress',            color:'#5B8AF0' },
  { label:'Submitted for approval', color:'#F97316' },
  { label:'Review',                 color:'#EF9F27' },
  { label:'On hold',                color:'#E24B4A' },
  { label:'Nested',                 color:'#8B5CF6' },
  { label:'Complete',               color:'#1D9E75' },
]

const SETTINGS_KEY = 'room_statuses'

const PRESET_COLORS = ['#9CA3AF','#5B8AF0','#1D9E75','#F97316','#EF9F27','#E24B4A','#8B5CF6','#EC4899','#2A3042','#06B6D4']

function uid() {
  return Math.random().toString(36).slice(2) + Date.now().toString(36)
}

export default function RoomStatuses() {
  const navigate = useNavigate()
  const toast = useToast()
  const [statuses, setStatuses]   = useState([])
  const [loading, setLoading]     = useState(true)
  const [adding, setAdding]       = useState(false)
  const [newLabel, setNewLabel]   = useState('')
  const [newColor, setNewColor]   = useState('#5B8AF0')
  const dragIdx = useRef(null)

  useEffect(() => {
    supabase.from('app_settings').select('value').eq('key', SETTINGS_KEY).maybeSingle()
      .then(({ data }) => {
        if (data?.value) {
          try {
            const v = typeof data.value === 'string' ? JSON.parse(data.value) : data.value
            if (Array.isArray(v) && v.length) { setStatuses(v); setLoading(false); return }
          } catch {}
        }
        setStatuses(DEFAULT_STATUSES)
        setLoading(false)
      })
  }, [])

  async function save(updated) {
    const value = JSON.stringify(updated)
    const { error } = await supabase.from('app_settings')
      .upsert({ key: SETTINGS_KEY, value, updated_at: new Date().toISOString() }, { onConflict: 'key' })
    if (error) await supabase.from('app_settings').insert({ key: SETTINGS_KEY, value })
    setStatuses(updated)
    window.dispatchEvent(new CustomEvent('room-statuses-updated', { detail: updated }))
  }

  function addStatus() {
    if (!newLabel.trim()) { toast('Enter a label', 'error'); return }
    if (statuses.find(s => s.label.toLowerCase() === newLabel.trim().toLowerCase())) {
      toast('Status already exists', 'error'); return
    }
    const updated = [...statuses, { id: uid(), label: newLabel.trim(), color: newColor, isDefault: false }]
    save(updated)
    setNewLabel(''); setNewColor('#5B8AF0'); setAdding(false)
    toast(`"${newLabel.trim()}" added ✓`)
  }

  function updateStatus(idx, patch) {
    save(statuses.map((s, i) => i === idx ? { ...s, ...patch } : s))
  }

  function removeStatus(idx) {
    if (statuses[idx].isDefault) { toast('Default statuses cannot be removed', 'error'); return }
    if (!confirm(`Remove "${statuses[idx].label}"?`)) return
    save(statuses.filter((_, i) => i !== idx))
  }

  function onDragStart(i) { dragIdx.current = i }
  function onDragOver(e, i) {
    e.preventDefault()
    if (dragIdx.current === null || dragIdx.current === i) return
    const next = [...statuses]
    const [moved] = next.splice(dragIdx.current, 1)
    next.splice(i, 0, moved)
    dragIdx.current = i
    setStatuses(next)
  }
  function onDrop() { save(statuses); dragIdx.current = null }

  function resetDefaults() {
    if (!confirm('Reset to default room statuses?')) return
    save(DEFAULT_STATUSES)
    toast('Reset to defaults ✓')
  }

  return (
    <div style={{ maxWidth:560, margin:'0 auto' }}>
      <div style={{ display:'flex', alignItems:'center', gap:12, marginBottom:20 }}>
        <BackButton onClick={() => navigate('/settings')} />
        <div>
          <h1 style={{ fontSize:18, fontWeight:800, color:'#2A3042', margin:0 }}>Room Statuses</h1>
          <p style={{ fontSize:12, color:'#9CA3AF', margin:'2px 0 0' }}>
            Track progress of individual rooms within a job. Drag to reorder.
          </p>
        </div>
        <button onClick={() => setAdding(a => !a)}
          style={{ marginLeft:'auto', padding:'7px 14px', borderRadius:9, border:'none', background: adding?'#F3F4F6':'#5B8AF0', color:adding?'#6B7280':'#fff', fontSize:12, fontWeight:700, cursor:'pointer' }}>
          {adding ? 'Cancel' : '+ Add status'}
        </button>
      </div>

      {/* Add new status */}
      {adding && (
        <div style={{ background:'#fff', borderRadius:14, border:'1px solid #E8ECF0', padding:16, marginBottom:16 }}>
          <div style={{ fontSize:12, fontWeight:700, color:'#6B7280', marginBottom:10 }}>New status</div>
          <div style={{ display:'flex', gap:8, alignItems:'center', marginBottom:10 }}>
            <input value={newLabel} onChange={e => setNewLabel(e.target.value)}
              onKeyDown={e => e.key==='Enter' && addStatus()}
              placeholder="Status label…"
              style={{ flex:1, padding:'8px 12px', border:'1px solid #DDE3EC', borderRadius:9, fontSize:13, outline:'none' }} />
          </div>
          <div style={{ display:'flex', gap:6, flexWrap:'wrap', marginBottom:12 }}>
            {PRESET_COLORS.map(c => (
              <button key={c} onClick={() => setNewColor(c)}
                style={{ width:26, height:26, borderRadius:'50%', background:c, border: newColor===c ? '3px solid #2A3042' : '2px solid transparent', cursor:'pointer' }} />
            ))}
          </div>
          <div style={{ display:'flex', gap:8 }}>
            <div style={{ padding:'6px 14px', borderRadius:8, background: newColor, color:'#fff', fontSize:12, fontWeight:700, flex:1, textAlign:'center' }}>
              {newLabel || 'Preview'}
            </div>
            <button onClick={addStatus}
              style={{ padding:'6px 18px', borderRadius:8, border:'none', background:'#5B8AF0', color:'#fff', fontSize:13, fontWeight:700, cursor:'pointer' }}>
              Add
            </button>
          </div>
        </div>
      )}

      {/* Status list */}
      <div style={{ background:'#fff', borderRadius:14, border:'1px solid #E8ECF0', overflow:'hidden', marginBottom:16 }}>
        <div style={{ padding:'12px 16px', borderBottom:'1px solid #F3F4F6', display:'flex', alignItems:'center', justifyContent:'space-between' }}>
          <span style={{ fontSize:11, fontWeight:700, color:'#9CA3AF', textTransform:'uppercase', letterSpacing:'.06em' }}>
            {statuses.length} status{statuses.length !== 1 ? 'es' : ''}
          </span>
          <button onClick={resetDefaults}
            style={{ fontSize:11, color:'#9CA3AF', background:'none', border:'1px solid #E8ECF0', borderRadius:7, padding:'3px 10px', cursor:'pointer' }}>
            Reset defaults
          </button>
        </div>

        {loading ? (
          <div style={{ padding:'20px 16px', color:'#9CA3AF', fontSize:13 }}>Loading…</div>
        ) : statuses.map((s, i) => (
          <div key={s.label+i}
            draggable onDragStart={() => onDragStart(i)} onDragOver={e => onDragOver(e,i)} onDrop={onDrop}
            style={{ display:'flex', alignItems:'center', gap:10, padding:'10px 16px', borderBottom:'1px solid #F3F4F6', cursor:'grab' }}
            onMouseEnter={e=>e.currentTarget.style.background='#FAFAFA'}
            onMouseLeave={e=>e.currentTarget.style.background='transparent'}>
            <span style={{ color:'#D1D5DB', fontSize:14, flexShrink:0 }}>⠿</span>
            {/* Color dot + picker */}
            <div style={{ position:'relative', flexShrink:0 }}>
              <input type="color" value={s.color}
                onChange={e => updateStatus(i, { color: e.target.value })}
                style={{ width:24, height:24, borderRadius:'50%', border:'none', padding:0, cursor:'pointer', background:'none' }} />
            </div>
            {/* Label */}
            <div style={{ flex:1, display:'flex', alignItems:'center', gap:8 }}>
              <span style={{ padding:'3px 10px', borderRadius:7, background:`${s.color}20`, color:s.color, fontSize:12, fontWeight:700, border:`1px solid ${s.color}40` }}>
                {s.label}
              </span>
              {s.isDefault && <span style={{ fontSize:10, color:'#9CA3AF' }}>default</span>}
            </div>
            {/* Edit label inline */}
            <input defaultValue={s.label}
              onBlur={e => { if (e.target.value.trim() && e.target.value.trim()!==s.label) updateStatus(i,{label:e.target.value.trim()}) }}
              onKeyDown={e => { if(e.key==='Enter') e.target.blur() }}
              style={{ width:140, padding:'4px 8px', border:'1px solid #E8ECF0', borderRadius:7, fontSize:12, outline:'none', color:'#6B7280' }} />
            {/* Delete */}
            {!s.isDefault && (
              <button onClick={() => removeStatus(i)}
                style={{ background:'none', border:'none', cursor:'pointer', color:'#D1D5DB', fontSize:16, padding:0, flexShrink:0 }}
                onMouseEnter={e=>e.currentTarget.style.color='#E24B4A'}
                onMouseLeave={e=>e.currentTarget.style.color='#D1D5DB'}>×</button>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
