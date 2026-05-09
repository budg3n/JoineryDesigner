import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { useToast } from '../components/Toast'
import BackButton from '../components/BackButton'

// Master list of all possible spec fields
const ALL_FIELDS = [
  { key:'toe_kick_height',     label:'Toe kick height',    unit:'mm', group:'Base cabinets' },
  { key:'base_height',         label:'Base height',        unit:'mm', group:'Base cabinets' },
  { key:'base_depth',          label:'Base depth',         unit:'mm', group:'Base cabinets' },
  { key:'upper_height',        label:'Upper height',       unit:'mm', group:'Upper cabinets' },
  { key:'upper_depth',         label:'Upper depth',        unit:'mm', group:'Upper cabinets' },
  { key:'tall_height',         label:'Tall height',        unit:'mm', group:'Tall cabinets' },
  { key:'tall_depth',          label:'Tall depth',         unit:'mm', group:'Tall cabinets' },
  { key:'bench_thickness',     label:'Benchtop thickness', unit:'mm', group:'Benchtop' },
  { key:'bench_overhang_front',label:'Overhang front',     unit:'mm', group:'Benchtop' },
  { key:'bench_overhang_side', label:'Overhang sides',     unit:'mm', group:'Benchtop' },
  { key:'bench_material',      label:'Bench material',     unit:'',   group:'Benchtop', text:true },
  { key:'room_width',          label:'Room width',         unit:'mm', group:'Room dimensions' },
  { key:'room_height',         label:'Room height',        unit:'mm', group:'Room dimensions' },
  { key:'room_depth',          label:'Room depth',         unit:'mm', group:'Room dimensions' },
  { key:'wardrobe_height',     label:'Wardrobe height',    unit:'mm', group:'Wardrobe' },
  { key:'wardrobe_depth',      label:'Wardrobe depth',     unit:'mm', group:'Wardrobe' },
  { key:'wardrobe_width',      label:'Wardrobe width',     unit:'mm', group:'Wardrobe' },
  { key:'vanity_height',       label:'Vanity height',      unit:'mm', group:'Vanity' },
  { key:'vanity_depth',        label:'Vanity depth',       unit:'mm', group:'Vanity' },
]

const DEFAULT_TEMPLATES = [
  {
    id: 'kitchen', name:'Kitchen', icon:'🍳',
    fields: ['toe_kick_height','base_height','base_depth','upper_height','upper_depth','tall_height','tall_depth','bench_thickness','bench_overhang_front','bench_overhang_side','bench_material'],
  },
  {
    id: 'laundry', name:'Laundry', icon:'🧺',
    fields: ['toe_kick_height','base_height','base_depth','upper_height','upper_depth','bench_thickness','bench_material'],
  },
  {
    id: 'bedroom', name:'Bedroom', icon:'🛏',
    fields: ['room_width','room_height','room_depth','wardrobe_height','wardrobe_depth','wardrobe_width'],
  },
  {
    id: 'bathroom', name:'Bathroom', icon:'🚿',
    fields: ['vanity_height','vanity_depth','room_width','room_height'],
  },
  {
    id: 'office', name:'Office', icon:'💼',
    fields: ['room_width','room_height','room_depth'],
  },
]

function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2) }

const ICONS = ['🍳','🛏','🚿','🧺','💼','🚪','📦','🏠','🛋','🪴','🔧','✨']
const GROUPS = [...new Set(ALL_FIELDS.map(f=>f.group))]

export default function RoomTypeSettings() {
  const toast = useToast()
  const [templates, setTemplates]   = useState([])
  const [loading, setLoading]       = useState(true)
  const [saving, setSaving]         = useState(false)
  const [editing, setEditing]       = useState(null)  // template being edited
  const [adding, setAdding]         = useState(false)
  const [newName, setNewName]       = useState('')
  const [newIcon, setNewIcon]       = useState('🏠')

  useEffect(() => {
    supabase.from('app_settings').select('value').eq('key','room_type_templates').maybeSingle()
      .then(({ data }) => {
        if (data?.value) {
          const v = typeof data.value==='string' ? JSON.parse(data.value) : data.value
          setTemplates(Array.isArray(v) ? v : DEFAULT_TEMPLATES)
        } else {
          setTemplates(DEFAULT_TEMPLATES)
        }
        setLoading(false)
      })
  }, [])

  async function save(updated) {
    setSaving(true)
    await supabase.from('app_settings').upsert(
      { key:'room_type_templates', value: JSON.stringify(updated) },
      { onConflict:'key' }
    )
    setSaving(false)
    toast('Saved ✓')
  }

  function addTemplate() {
    if (!newName.trim()) return
    const t = { id: uid(), name: newName.trim(), icon: newIcon, fields: [] }
    const updated = [...templates, t]
    setTemplates(updated)
    save(updated)
    setEditing(t.id)
    setAdding(false); setNewName(''); setNewIcon('🏠')
  }

  function removeTemplate(id) {
    const t = templates.find(t=>t.id===id)
    if (!confirm(`Remove room type "${t?.name}"?`)) return
    const updated = templates.filter(t=>t.id!==id)
    setTemplates(updated)
    save(updated)
    if (editing===id) setEditing(null)
  }

  function toggleField(templateId, fieldKey) {
    const updated = templates.map(t => {
      if (t.id !== templateId) return t
      const has = t.fields.includes(fieldKey)
      return { ...t, fields: has ? t.fields.filter(f=>f!==fieldKey) : [...t.fields, fieldKey] }
    })
    setTemplates(updated)
    save(updated)
  }

  function updateTemplateName(id, name) {
    const updated = templates.map(t => t.id===id ? { ...t, name } : t)
    setTemplates(updated)
    save(updated)
  }

  function updateTemplateIcon(id, icon) {
    const updated = templates.map(t => t.id===id ? { ...t, icon } : t)
    setTemplates(updated)
    save(updated)
  }

  if (loading) return <div style={{ display:'flex', justifyContent:'center', padding:'60px 0' }}><div className="spinner" /></div>

  const editingTemplate = templates.find(t=>t.id===editing)

  return (
    <div style={{ maxWidth:720, margin:'0 auto' }}>
      <BackButton to="/settings" label="Settings" />
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:20 }}>
        <div>
          <h1 style={{ fontSize:20, fontWeight:800, color:'#2A3042', margin:'0 0 4px' }}>Room Types</h1>
          <p style={{ fontSize:13, color:'#9CA3AF', margin:0 }}>Define room types and the spec fields that appear when building a room spec</p>
        </div>
        <button onClick={()=>setAdding(v=>!v)}
          style={{ fontSize:13, fontWeight:700, padding:'8px 16px', borderRadius:9, border:'none', background:'#5B8AF0', color:'#fff', cursor:'pointer' }}>
          {adding ? 'Cancel' : '+ Add room type'}
        </button>
      </div>

      {/* Add new type form */}
      {adding && (
        <div style={{ background:'#fff', borderRadius:12, border:'1px solid #E8ECF0', padding:18, marginBottom:14 }}>
          <div style={{ fontSize:12, fontWeight:700, color:'#6B7280', marginBottom:10 }}>New room type</div>
          <div style={{ display:'flex', gap:10, marginBottom:12, flexWrap:'wrap' }}>
            <input autoFocus value={newName} onChange={e=>setNewName(e.target.value)}
              onKeyDown={e=>e.key==='Enter'&&addTemplate()}
              placeholder="e.g. Butler's pantry"
              style={{ flex:1, minWidth:160, padding:'8px 12px', border:'1px solid #DDE3EC', borderRadius:9, fontSize:13, outline:'none' }} />
          </div>
          <div style={{ marginBottom:14 }}>
            <div style={{ fontSize:11, fontWeight:600, color:'#6B7280', marginBottom:6 }}>Icon</div>
            <div style={{ display:'flex', gap:6, flexWrap:'wrap' }}>
              {ICONS.map(ic=>(
                <button key={ic} onClick={()=>setNewIcon(ic)}
                  style={{ width:36, height:36, borderRadius:9, fontSize:20, border:`2px solid ${newIcon===ic?'#5B8AF0':'#E8ECF0'}`, background:newIcon===ic?'#EEF2FF':'#fff', cursor:'pointer' }}>
                  {ic}
                </button>
              ))}
            </div>
          </div>
          <button onClick={addTemplate} disabled={!newName.trim()}
            style={{ fontSize:13, fontWeight:700, padding:'8px 18px', borderRadius:9, border:'none',
              background:newName.trim()?'#5B8AF0':'#E8ECF0', color:newName.trim()?'#fff':'#9CA3AF', cursor:newName.trim()?'pointer':'not-allowed' }}>
            Add &amp; configure fields →
          </button>
        </div>
      )}

      <div style={{ display:'grid', gridTemplateColumns: editing ? '200px 1fr' : 'repeat(auto-fill,minmax(160px,1fr))', gap:12, alignItems:'start' }}>
        {/* Template tiles / list */}
        <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
          {templates.map(t => (
            <div key={t.id} onClick={()=>setEditing(editing===t.id?null:t.id)}
              style={{ display:'flex', alignItems:'center', gap:10, padding:'10px 14px',
                background:'#fff', borderRadius:11, border:`1.5px solid ${editing===t.id?'#5B8AF0':'#E8ECF0'}`,
                cursor:'pointer', boxShadow:editing===t.id?'0 4px 12px rgba(91,138,240,0.12)':'none' }}>
              <span style={{ fontSize:22, flexShrink:0 }}>{t.icon}</span>
              <div style={{ flex:1, minWidth:0 }}>
                <div style={{ fontSize:13, fontWeight:700, color:'#2A3042', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{t.name}</div>
                <div style={{ fontSize:11, color:'#9CA3AF', marginTop:1 }}>{t.fields.length} field{t.fields.length!==1?'s':''}</div>
              </div>
              <button onClick={e=>{e.stopPropagation();removeTemplate(t.id)}}
                style={{ background:'none', border:'none', cursor:'pointer', color:'#D1D5DB', fontSize:15, flexShrink:0, padding:'2px 4px' }}
                onMouseEnter={e=>e.currentTarget.style.color='#E24B4A'} onMouseLeave={e=>e.currentTarget.style.color='#D1D5DB'}>×</button>
            </div>
          ))}
          {templates.length===0 && (
            <div style={{ padding:'32px 0', textAlign:'center', color:'#9CA3AF', fontSize:13 }}>No room types yet</div>
          )}
        </div>

        {/* Field editor */}
        {editing && editingTemplate && (
          <div style={{ background:'#fff', borderRadius:12, border:'1px solid #E8ECF0', overflow:'hidden' }}>
            {/* Header */}
            <div style={{ padding:'12px 18px', borderBottom:'1px solid #F3F4F6', display:'flex', alignItems:'center', gap:10 }}>
              {/* Icon picker */}
              <div style={{ position:'relative' }}>
                <button style={{ fontSize:24, background:'none', border:'1px solid #E8ECF0', borderRadius:9, padding:'4px 8px', cursor:'pointer' }}
                  onClick={e=>{e.currentTarget.nextSibling.style.display=e.currentTarget.nextSibling.style.display==='none'?'flex':'none'}}>
                  {editingTemplate.icon}
                </button>
                <div style={{ display:'none', position:'absolute', top:'calc(100% + 4px)', left:0, background:'#fff', border:'1px solid #E8ECF0', borderRadius:10, padding:8, flexWrap:'wrap', gap:5, zIndex:20, width:200, boxShadow:'0 8px 24px rgba(0,0,0,0.1)' }}>
                  {ICONS.map(ic=>(
                    <button key={ic} onClick={()=>{ updateTemplateIcon(editing,ic) }}
                      style={{ width:32, height:32, borderRadius:7, fontSize:18, border:'1px solid #E8ECF0', background:'#fff', cursor:'pointer' }}>{ic}</button>
                  ))}
                </div>
              </div>
              <input value={editingTemplate.name} onChange={e=>updateTemplateName(editing,e.target.value)}
                style={{ flex:1, fontSize:15, fontWeight:700, color:'#2A3042', border:'none', outline:'none', background:'transparent', fontFamily:'inherit' }} />
              <button onClick={()=>setEditing(null)} style={{ background:'none', border:'none', cursor:'pointer', color:'#9CA3AF', fontSize:20 }}>×</button>
            </div>

            {/* Field groups */}
            <div style={{ padding:'12px 18px', display:'flex', flexDirection:'column', gap:12, maxHeight:480, overflowY:'auto' }}>
              <div style={{ fontSize:12, color:'#9CA3AF' }}>
                Toggle the spec fields that should appear for <strong style={{color:'#2A3042'}}>{editingTemplate.name}</strong> rooms.
                Unticked fields won't appear when this room type is selected.
              </div>
              {GROUPS.map(group => {
                const groupFields = ALL_FIELDS.filter(f=>f.group===group)
                return (
                  <div key={group}>
                    <div style={{ fontSize:10, fontWeight:700, color:'#9CA3AF', textTransform:'uppercase', letterSpacing:'.06em', marginBottom:6 }}>{group}</div>
                    <div style={{ display:'flex', flexDirection:'column', gap:5 }}>
                      {groupFields.map(f => {
                        const checked = editingTemplate.fields.includes(f.key)
                        return (
                          <label key={f.key} style={{ display:'flex', alignItems:'center', gap:10, padding:'7px 10px', borderRadius:8,
                            background: checked?'#F0F4FF':'#F9FAFB', border:`1px solid ${checked?'#C4D4F8':'#F3F4F6'}`,
                            cursor:'pointer', transition:'all .1s' }}>
                            <input type="checkbox" checked={checked} onChange={()=>toggleField(editing, f.key)}
                              style={{ width:15, height:15, cursor:'pointer', accentColor:'#5B8AF0' }} />
                            <span style={{ fontSize:12, fontWeight:checked?600:400, color:checked?'#2A3042':'#6B7280', flex:1 }}>{f.label}</span>
                            {f.unit && <span style={{ fontSize:11, color:'#9CA3AF' }}>{f.unit}</span>}
                          </label>
                        )
                      })}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}
      </div>
      {saving && <div style={{ textAlign:'center', marginTop:12, fontSize:12, color:'#9CA3AF' }}>Saving…</div>}
    </div>
  )
}

// Export for use in SpecBuilder
export { ALL_FIELDS, DEFAULT_TEMPLATES }
