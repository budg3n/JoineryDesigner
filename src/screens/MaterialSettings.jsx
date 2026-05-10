import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useToast } from '../components/Toast'

function Btn({ onClick, children, variant='default', disabled, style }) {
  const base = { fontSize:13, fontWeight:600, padding:'7px 14px', borderRadius:8,
    cursor:disabled?'not-allowed':'pointer', opacity:disabled?0.6:1, border:'none',
    display:'flex', alignItems:'center', gap:5, ...style }
  const variants = {
    default: { background:'#F3F4F6', color:'#374151' },
    primary: { background:'#5B8AF0', color:'#fff', boxShadow:'0 2px 6px rgba(91,138,240,0.3)' },
    ghost:   { background:'none', color:'#6B7280', padding:'4px 8px' },
  }
  return <button onClick={onClick} disabled={disabled} style={{ ...base, ...variants[variant] }}>{children}</button>
}

// ── Category modal (create / edit) ────────────────────────────────
function CategoryModal({ cat, parentId, breadcrumb, onSave, onClose }) {
  const [name, setName]     = useState(cat?.name || '')
  const [saving, setSaving] = useState(false)
  const toast = useToast()

  async function save() {
    if (!name.trim()) return
    setSaving(true)
    const row = { name: name.trim(), parent_id: parentId ?? cat?.parent_id ?? null }
    const { data, error } = cat?.id
      ? await supabase.from('material_categories').update(row).eq('id', cat.id).select().single()
      : await supabase.from('material_categories').insert(row).select().single()
    if (error) { toast(error.message, 'error'); setSaving(false); return }
    toast((cat?.id ? 'Updated' : 'Created') + ' ✓')
    onSave(data)
  }

  return (
    <div style={{ position:'fixed', inset:0, zIndex:600, background:'rgba(0,0,0,0.45)', display:'flex', alignItems:'center', justifyContent:'center', padding:16 }}
      onClick={e => e.target===e.currentTarget && onClose()}>
      <div style={{ background:'#fff', borderRadius:14, width:'100%', maxWidth:420, padding:24, boxShadow:'0 20px 60px rgba(0,0,0,0.2)' }}>
        <div style={{ fontSize:15, fontWeight:700, color:'#2A3042', marginBottom:4 }}>
          {cat?.id ? 'Rename category' : 'Add category'}
        </div>
        {breadcrumb && <div style={{ fontSize:12, color:'#9CA3AF', marginBottom:14 }}>Under: {breadcrumb}</div>}
        <input autoFocus value={name} onChange={e=>setName(e.target.value)}
          onKeyDown={e=>e.key==='Enter'&&save()}
          placeholder="Category name…"
          style={{ width:'100%', padding:'10px 12px', border:'1px solid #DDE3EC', borderRadius:9, fontSize:14, outline:'none', boxSizing:'border-box', marginBottom:16 }} />
        <div style={{ display:'flex', gap:8, justifyContent:'flex-end' }}>
          <Btn onClick={onClose}>Cancel</Btn>
          <Btn onClick={save} variant="primary" disabled={saving||!name.trim()}>{saving?'Saving…':cat?.id?'Save':'Create'}</Btn>
        </div>
      </div>
    </div>
  )
}

// ── Fields modal ──────────────────────────────────────────────────
const FIELD_TYPES = [
  { value:'text', label:'Text' }, { value:'number', label:'Number' },
  { value:'select', label:'Dropdown' }, { value:'toggle', label:'Toggle' },
]

// Fields that are native columns on the materials table — always present, can't be removed
const NATIVE_FIELDS = [
  { key:'supplier',     label:'Supplier',         field_type:'text',   group:'Identity',       native:true },
  { key:'panel_type',   label:'Panel type',        field_type:'text',   group:'Specification',  native:true },
  { key:'thickness',    label:'Thickness (mm)',     field_type:'number', group:'Specification',  native:true },
  { key:'colour_code',  label:'Colour code',        field_type:'text',   group:'Specification',  native:true },
  { key:'finish',       label:'Finish',             field_type:'text',   group:'Specification',  native:true },
]

// Extra standard fields stored in category_fields — can be toggled per category
const TEMPLATE_FIELDS = [
  { key:'brand',        label:'Brand',              field_type:'text',   group:'Identity' },
  { key:'sku',          label:'SKU / Product code', field_type:'text',   group:'Identity' },
  { key:'colour',       label:'Colour name',        field_type:'text',   group:'Specification' },
  { key:'grade',        label:'Grade',              field_type:'text',   group:'Specification' },
  { key:'edge_profile', label:'Edge profile',       field_type:'text',   group:'Specification' },
  { key:'grain',        label:'Grain direction',    field_type:'select', group:'Specification', options:['Grained','No grain','Any'] },
  { key:'dimensions',   label:'Sheet dimensions',   field_type:'text',   group:'Specification' },
  { key:'weight',       label:'Weight (kg)',         field_type:'number', group:'Specification' },
  { key:'unit',         label:'Order unit',         field_type:'select', group:'Ordering', options:['sheets','m','m²','m³','lm','kg','pcs','boxes','rolls','litres'] },
  { key:'qty',          label:'Default qty',        field_type:'number', group:'Ordering' },
  { key:'price',        label:'Unit price ($)',      field_type:'number', group:'Ordering' },
  { key:'lead_time',    label:'Lead time (days)',    field_type:'number', group:'Ordering' },
  { key:'min_order',    label:'Minimum order qty',  field_type:'number', group:'Ordering' },
  { key:'po_number',    label:'PO number',          field_type:'text',   group:'Ordering' },
  { key:'notes',        label:'Notes',              field_type:'text',   group:'Other' },
]

function FieldsModal({ catId, catName, onClose }) {
  const [fields, setFields]         = useState([])
  const [loading, setLoading]       = useState(true)
  const [adding, setAdding]         = useState(false)
  const [nf, setNf]                 = useState({ label:'', field_type:'text', required:false, options:'' })
  // which template fields are enabled for this category (stored in category_fields with is_template=true)
  const [templateEnabled, setTemplateEnabled] = useState({})
  const toast = useToast()

  useEffect(() => {
    supabase.from('category_fields').select('*').eq('category_id', catId).order('sort_order')
      .then(({ data }) => {
        const rows = data || []
        // Separate template rows from custom rows
        const tEnabled = {}
        TEMPLATE_FIELDS.forEach(tf => {
          const row = rows.find(r => r.template_key === tf.key)
          tEnabled[tf.key] = row ? { enabled: true, required: row.required, id: row.id } : { enabled: false, required: false, id: null }
        })
        setTemplateEnabled(tEnabled)
        setFields(rows.filter(r => !r.template_key))
        setLoading(false)
      })
  }, [catId])

  async function toggleTemplate(tf) {
    const current = templateEnabled[tf.key]
    if (current.enabled) {
      // Disable — delete the row
      if (!confirm(`Remove "${tf.label}" from this category?`)) return
      if (current.id) await supabase.from('category_fields').delete().eq('id', current.id)
      setTemplateEnabled(p => ({ ...p, [tf.key]: { enabled:false, required:false, id:null } }))
    } else {
      // Enable — insert the row
      const { data, error } = await supabase.from('category_fields').insert({
        category_id: catId, label: tf.label, field_type: tf.field_type,
        template_key: tf.key, required: false, sort_order: -1,
      }).select().single()
      if (error) { toast(error.message, 'error'); return }
      setTemplateEnabled(p => ({ ...p, [tf.key]: { enabled:true, required:false, id:data.id } }))
    }
  }

  async function toggleTemplateRequired(tf) {
    const current = templateEnabled[tf.key]
    if (!current.id) return
    await supabase.from('category_fields').update({ required: !current.required }).eq('id', current.id)
    setTemplateEnabled(p => ({ ...p, [tf.key]: { ...p[tf.key], required: !current.required } }))
  }

  async function add() {
    if (!nf.label.trim()) return
    const opts = nf.field_type==='select' ? nf.options.split(',').map(s=>s.trim()).filter(Boolean) : null
    const { data, error } = await supabase.from('category_fields')
      .insert({ category_id:catId, label:nf.label.trim(), field_type:nf.field_type, required:nf.required, sort_order:fields.length, options:opts?JSON.stringify(opts):null })
      .select().single()
    if (error) { toast(error.message,'error'); return }
    setFields(p=>[...p,data]); setNf({ label:'', field_type:'text', required:false, options:'' }); setAdding(false)
    toast('Field added ✓')
  }

  async function del(id) {
    if (!confirm('Delete this field?')) return
    await supabase.from('category_fields').delete().eq('id', id)
    setFields(p=>p.filter(f=>f.id!==id))
  }

  async function toggleReq(f) {
    await supabase.from('category_fields').update({ required:!f.required }).eq('id',f.id)
    setFields(p=>p.map(x=>x.id===f.id?{...x,required:!f.required}:x))
  }

  return (
    <div style={{ position:'fixed', inset:0, zIndex:600, background:'rgba(0,0,0,0.45)', display:'flex', alignItems:'center', justifyContent:'center', padding:16 }}
      onClick={e=>e.target===e.currentTarget&&onClose()}>
      <div style={{ background:'#fff', borderRadius:14, width:'100%', maxWidth:540, maxHeight:'85vh', display:'flex', flexDirection:'column', boxShadow:'0 20px 60px rgba(0,0,0,0.2)' }}>
        <div style={{ padding:'16px 20px', borderBottom:'1px solid #F3F4F6', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
          <div>
            <div style={{ fontSize:15, fontWeight:700, color:'#2A3042' }}>Manage fields</div>
            <div style={{ fontSize:12, color:'#9CA3AF', marginTop:2 }}>{catName}</div>
          </div>
          <button onClick={onClose} style={{ background:'none', border:'none', cursor:'pointer', color:'#9CA3AF', fontSize:22, lineHeight:1 }}>×</button>
        </div>

        <div style={{ flex:1, overflowY:'auto', padding:'14px 20px' }}>
          {loading ? <div className="spinner" style={{ margin:'20px auto' }} /> : <>

            {/* Native fields — always on, can't be removed */}
            <div style={{ marginBottom:18 }}>
              <div style={{ fontSize:11, fontWeight:700, color:'#9CA3AF', textTransform:'uppercase', letterSpacing:'.06em', marginBottom:8 }}>
                Core fields — always included
              </div>
              <div style={{ background:'#F9FAFB', borderRadius:10, border:'1px solid #E8ECF0', overflow:'hidden' }}>
                {NATIVE_FIELDS.map((nf, i) => (
                  <div key={nf.key} style={{ display:'flex', alignItems:'center', gap:10, padding:'9px 14px',
                    borderBottom: i < NATIVE_FIELDS.length-1 ? '1px solid #F3F4F6' : 'none' }}>
                    <div style={{ width:36, height:20, borderRadius:10, background:'#1D9E75', position:'relative', flexShrink:0 }}>
                      <div style={{ position:'absolute', top:2, right:2, width:16, height:16, borderRadius:'50%', background:'#fff', boxShadow:'0 1px 3px rgba(0,0,0,0.2)' }}/>
                    </div>
                    <div style={{ flex:1 }}>
                      <span style={{ fontSize:13, fontWeight:600, color:'#2A3042' }}>{nf.label}</span>
                      <span style={{ fontSize:11, color:'#9CA3AF', marginLeft:8 }}>Built-in</span>
                    </div>
                    <span style={{ fontSize:10, color:'#9CA3AF', fontStyle:'italic' }}>always on</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Optional extra standard fields — toggle per category */}
            <div style={{ marginBottom:18 }}>
              <div style={{ fontSize:11, fontWeight:700, color:'#9CA3AF', textTransform:'uppercase', letterSpacing:'.06em', marginBottom:10 }}>
                Optional fields — toggle on/off per category
              </div>
              {['Identity','Specification','Ordering','Other'].map(group => {
                const groupFields = TEMPLATE_FIELDS.filter(tf => tf.group === group)
                if (!groupFields.length) return null
                return (
                  <div key={group} style={{ marginBottom:14 }}>
                    <div style={{ fontSize:10, fontWeight:700, color:'#C4C9D4', textTransform:'uppercase', letterSpacing:'.05em', marginBottom:6, paddingLeft:2 }}>{group}</div>
                    {groupFields.map(tf => {
                      const state = templateEnabled[tf.key] || { enabled:false, required:false }
                      return (
                        <div key={tf.key} style={{ display:'flex', alignItems:'center', gap:10, padding:'8px 12px',
                          background: state.enabled ? '#F0F4FF' : '#F9FAFB',
                          borderRadius:9, border:`1px solid ${state.enabled?'#C4D4F8':'#E8ECF0'}`, marginBottom:5 }}>
                          <div onClick={()=>toggleTemplate(tf)}
                            style={{ width:36, height:20, borderRadius:10, background:state.enabled?'#5B8AF0':'#D1D5DB',
                              position:'relative', cursor:'pointer', flexShrink:0, transition:'background .15s' }}>
                            <div style={{ position:'absolute', top:2, left:state.enabled?18:2, width:16, height:16,
                              borderRadius:'50%', background:'#fff', transition:'left .15s', boxShadow:'0 1px 3px rgba(0,0,0,0.2)' }}/>
                          </div>
                          <div style={{ flex:1, minWidth:0 }}>
                            <div style={{ fontSize:13, fontWeight:600, color: state.enabled?'#2A3042':'#9CA3AF' }}>{tf.label}</div>
                            <div style={{ fontSize:10, color:'#C4C9D4' }}>
                              {FIELD_TYPES.find(t=>t.value===tf.field_type)?.label}
                              {tf.options && ` · ${tf.options.slice(0,3).join(', ')}${tf.options.length>3?'…':''}`}
                            </div>
                          </div>
                          {state.enabled && (
                            <button onClick={()=>toggleTemplateRequired(tf)}
                              style={{ fontSize:11, padding:'2px 8px', borderRadius:6, border:`1px solid ${state.required?'#86EFAC':'#E8ECF0'}`,
                                background:state.required?'#F0FDF4':'#F9FAFB', color:state.required?'#166534':'#9CA3AF', cursor:'pointer', flexShrink:0, whiteSpace:'nowrap' }}>
                              {state.required?'✓ Required':'Optional'}
                            </button>
                          )}
                        </div>
                      )
                    })}
                  </div>
                )
              })}
            </div>

            {/* Custom fields section */}
            <div>
              <div style={{ fontSize:11, fontWeight:700, color:'#9CA3AF', textTransform:'uppercase', letterSpacing:'.06em', marginBottom:10 }}>
                Custom fields
              </div>
              {fields.length===0&&!adding && (
                <div style={{ textAlign:'center', padding:'16px 0', color:'#9CA3AF', fontSize:13, background:'#F9FAFB', borderRadius:9, marginBottom:8 }}>
                  No custom fields yet — add one below
                </div>
              )}
              {fields.map(f => (
                <div key={f.id} style={{ display:'flex', alignItems:'center', gap:10, padding:'9px 12px', background:'#F9FAFB', borderRadius:9, border:'1px solid #E8ECF0', marginBottom:8 }}>
                  <div style={{ flex:1 }}>
                    <div style={{ fontSize:13, fontWeight:600, color:'#2A3042' }}>{f.label}</div>
                    <div style={{ fontSize:11, color:'#9CA3AF', marginTop:1 }}>
                      {FIELD_TYPES.find(t=>t.value===f.field_type)?.label}{f.required?' · Required':''}
                      {f.options && ` · ${JSON.parse(f.options).join(', ')}`}
                    </div>
                  </div>
                  <button onClick={()=>toggleReq(f)} style={{ fontSize:11, padding:'2px 8px', borderRadius:6, border:`1px solid ${f.required?'#86EFAC':'#E8ECF0'}`, background:f.required?'#F0FDF4':'#F9FAFB', color:f.required?'#166534':'#9CA3AF', cursor:'pointer' }}>
                    {f.required?'✓ Required':'Optional'}
                  </button>
                  <button onClick={()=>del(f.id)} style={{ background:'none', border:'none', cursor:'pointer', color:'#D1D5DB', fontSize:16 }}
                    onMouseEnter={e=>e.currentTarget.style.color='#E24B4A'} onMouseLeave={e=>e.currentTarget.style.color='#D1D5DB'}>×</button>
                </div>
              ))}
              {adding && (
                <div style={{ background:'#F0F4FF', borderRadius:10, border:'1px solid #C4D4F8', padding:14 }}>
                  <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10, marginBottom:10 }}>
                    <div>
                      <label style={{ fontSize:11, fontWeight:600, color:'#6B7280', display:'block', marginBottom:4 }}>Label *</label>
                      <input autoFocus value={nf.label} onChange={e=>setNf(p=>({...p,label:e.target.value}))}
                        placeholder="e.g. Brand" style={{ width:'100%', padding:'7px 10px', border:'1px solid #DDE3EC', borderRadius:7, fontSize:13, outline:'none', boxSizing:'border-box' }} />
                    </div>
                    <div>
                      <label style={{ fontSize:11, fontWeight:600, color:'#6B7280', display:'block', marginBottom:4 }}>Type</label>
                      <select value={nf.field_type} onChange={e=>setNf(p=>({...p,field_type:e.target.value}))}
                        style={{ width:'100%', padding:'7px 10px', border:'1px solid #DDE3EC', borderRadius:7, fontSize:13, outline:'none', background:'#fff', boxSizing:'border-box' }}>
                        {FIELD_TYPES.map(t=><option key={t.value} value={t.value}>{t.label}</option>)}
                      </select>
                    </div>
                  </div>
                  {nf.field_type==='select' && (
                    <div style={{ marginBottom:10 }}>
                      <label style={{ fontSize:11, fontWeight:600, color:'#6B7280', display:'block', marginBottom:4 }}>Options (comma separated)</label>
                      <input value={nf.options} onChange={e=>setNf(p=>({...p,options:e.target.value}))} placeholder="Option 1, Option 2"
                        style={{ width:'100%', padding:'7px 10px', border:'1px solid #DDE3EC', borderRadius:7, fontSize:13, outline:'none', boxSizing:'border-box' }} />
                    </div>
                  )}
                  <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between' }}>
                    <label style={{ fontSize:12, display:'flex', alignItems:'center', gap:6, color:'#6B7280', cursor:'pointer' }}>
                      <input type="checkbox" checked={nf.required} onChange={e=>setNf(p=>({...p,required:e.target.checked}))} /> Required
                    </label>
                    <div style={{ display:'flex', gap:8 }}>
                      <Btn onClick={()=>setAdding(false)}>Cancel</Btn>
                      <Btn onClick={add} variant="primary" disabled={!nf.label.trim()}>Add field</Btn>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </>}
        </div>

        <div style={{ padding:'12px 20px', borderTop:'1px solid #F3F4F6' }}>
          {!adding && <Btn onClick={()=>setAdding(true)} variant="primary">+ Add custom field</Btn>}
        </div>
      </div>
    </div>
  )
}

// ── Recursive category tree node ──────────────────────────────────
// Supports unlimited nesting via parent_id
function CatNode({ cat, allCats, depth, breadcrumb, onEdit, onDelete, onAddChild, onFields }) {
  const [open, setOpen] = useState(true)
  const children = allCats.filter(c => c.parent_id === cat.id)
  const indent = depth * 20

  return (
    <div style={{ marginBottom: depth===0 ? 8 : 0 }}>
      <div style={{
        display:'flex', alignItems:'center', gap:8,
        padding:`9px 12px 9px ${12 + indent}px`,
        background: depth===0 ? '#fff' : 'transparent',
        borderRadius: depth===0 ? 10 : 0,
        border: depth===0 ? '1px solid #E8ECF0' : 'none',
        borderBottom: depth>0 ? '1px solid #F3F4F6' : undefined,
      }}>
        {/* Expand toggle */}
        <button onClick={() => setOpen(o=>!o)}
          style={{ background:'none', border:'none', cursor:'pointer', padding:'2px', color:'#C4C9D4', flexShrink:0, width:16, display:'flex', alignItems:'center', justifyContent:'center' }}>
          {children.length > 0
            ? <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" style={{ transform:open?'rotate(90deg)':'none', transition:'transform .15s' }}><polyline points="9 18 15 12 9 6"/></svg>
            : <span style={{ display:'inline-block', width:6, height:6, borderRadius:'50%', background:'#E8ECF0' }} />
          }
        </button>

        {/* Icon */}
        <div style={{ width:28, height:28, borderRadius:7, background: depth===0?'#EEF2FF':depth===1?'#F0FDF4':'#FFF7ED', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={depth===0?'#5B8AF0':depth===1?'#1D9E75':'#F97316'} strokeWidth="2">
            <path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z"/>
          </svg>
        </div>

        <div style={{ flex:1, minWidth:0 }}>
          <div style={{ fontSize:13, fontWeight:600, color:'#2A3042' }}>{cat.name}</div>
          {children.length > 0 && <div style={{ fontSize:11, color:'#9CA3AF' }}>{children.length} subcategor{children.length===1?'y':'ies'}</div>}
        </div>

        {/* Depth indicator pill */}
        {depth > 0 && (
          <span style={{ fontSize:10, color:'#9CA3AF', background:'#F3F4F6', borderRadius:6, padding:'1px 6px', flexShrink:0 }}>
            {'└'.repeat(depth)} L{depth+1}
          </span>
        )}

        {/* Actions */}
        <div style={{ display:'flex', gap:2, flexShrink:0 }}>
          <button onClick={() => onFields(cat, breadcrumb)} title="Custom fields"
            style={{ fontSize:11, padding:'3px 8px', borderRadius:6, border:'1px solid #E8ECF0', background:'#F9FAFB', cursor:'pointer', color:'#9CA3AF' }}>
            Fields
          </button>
          <button onClick={() => onAddChild(cat, breadcrumb)} title="Add sub-category"
            style={{ width:26, height:26, borderRadius:6, border:'1px solid #E8ECF0', background:'#F9FAFB', cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', color:'#9CA3AF' }}
            onMouseEnter={e=>e.currentTarget.style.color='#5B8AF0'} onMouseLeave={e=>e.currentTarget.style.color='#9CA3AF'}>
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
          </button>
          <button onClick={() => onEdit(cat, breadcrumb)} title="Rename"
            style={{ width:26, height:26, borderRadius:6, border:'1px solid #E8ECF0', background:'#F9FAFB', cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', color:'#9CA3AF' }}
            onMouseEnter={e=>e.currentTarget.style.color='#374151'} onMouseLeave={e=>e.currentTarget.style.color='#9CA3AF'}>
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
          </button>
          <button onClick={() => onDelete(cat)} title="Delete"
            style={{ width:26, height:26, borderRadius:6, border:'1px solid #E8ECF0', background:'#F9FAFB', cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', color:'#D1D5DB' }}
            onMouseEnter={e=>e.currentTarget.style.color='#E24B4A'} onMouseLeave={e=>e.currentTarget.style.color='#D1D5DB'}>
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/></svg>
          </button>
        </div>
      </div>

      {/* Children — recursive */}
      {open && children.length > 0 && (
        <div style={{ marginLeft: 12 + indent + 16, borderLeft:'2px solid #F3F4F6', paddingLeft:8 }}>
          {children.map(child => (
            <CatNode key={child.id} cat={child} allCats={allCats} depth={depth+1}
              breadcrumb={`${breadcrumb} › ${child.name}`}
              onEdit={onEdit} onDelete={onDelete} onAddChild={onAddChild} onFields={onFields} />
          ))}
        </div>
      )}
    </div>
  )
}

// ── Count all descendants ─────────────────────────────────────────
function countDescendants(catId, allCats) {
  const children = allCats.filter(c => c.parent_id === catId)
  return children.reduce((sum, c) => sum + 1 + countDescendants(c.id, allCats), 0)
}

// ── Main screen ───────────────────────────────────────────────────
export default function MaterialSettings() {
  const navigate = useNavigate()
  const toast    = useToast()
  const [allCats, setAllCats] = useState([])
  const [loading, setLoading] = useState(true)
  const [modal, setModal]     = useState(null)

  useEffect(() => { load() }, [])

  async function load() {
    const { data } = await supabase.from('material_categories').select('*').order('name')
    setAllCats(data||[]); setLoading(false)
  }

  function onSaved(data) {
    setAllCats(prev => prev.some(c=>c.id===data.id) ? prev.map(c=>c.id===data.id?data:c) : [...prev, data])
    setModal(null)
  }

  async function onDelete(cat) {
    const desc = countDescendants(cat.id, allCats)
    const msg = desc > 0
      ? `Delete "${cat.name}" and all ${desc} subcategor${desc===1?'y':'ies'} inside it? This cannot be undone.`
      : `Delete "${cat.name}"?`
    if (!confirm(msg)) return
    // Recursively collect all descendant IDs
    function collectIds(id) {
      const kids = allCats.filter(c => c.parent_id === id)
      return [id, ...kids.flatMap(k => collectIds(k.id))]
    }
    const ids = collectIds(cat.id)
    await Promise.all(ids.map(id => supabase.from('material_categories').delete().eq('id', id)))
    setAllCats(prev => prev.filter(c => !ids.includes(c.id)))
    toast('Deleted')
  }

  const topCats = allCats.filter(c => !c.parent_id)
  const totalCats = allCats.length
  const maxDepth = allCats.reduce((max, cat) => {
    let depth = 0, id = cat.id, visited = new Set()
    while (true) {
      const parent = allCats.find(c => c.id === allCats.find(x=>x.id===id)?.parent_id)
      if (!parent || visited.has(parent.id)) break
      visited.add(parent.id); depth++; id = parent.id
    }
    return Math.max(max, depth)
  }, 0)

  if (loading) return <div style={{ display:'flex', justifyContent:'center', padding:'60px 0' }}><div className="spinner" /></div>

  return (
    <div style={{ maxWidth:760, margin:'0 auto', padding:'0 0 40px' }}>
      {/* Breadcrumb */}
      <div style={{ display:'flex', alignItems:'center', gap:6, marginBottom:20 }}>
        <button onClick={() => navigate('/settings')} style={{ background:'none', border:'none', cursor:'pointer', color:'#6B7280', fontSize:13, fontWeight:600, padding:0, display:'flex', alignItems:'center', gap:4 }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="15 18 9 12 15 6"/></svg>Settings
        </button>
        <span style={{ color:'#D1D5DB' }}>›</span>
        <span style={{ fontSize:13, color:'#9CA3AF' }}>Materials library</span>
      </div>

      {/* Header */}
      <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', marginBottom:24, gap:16 }}>
        <div>
          <h1 style={{ fontSize:20, fontWeight:800, color:'#2A3042', margin:'0 0 4px' }}>Materials library</h1>
          <div style={{ fontSize:13, color:'#9CA3AF', display:'flex', gap:12 }}>
            <span>{totalCats} categories total</span>
            {maxDepth > 0 && <span>· {maxDepth+1} levels deep</span>}
            <span>· Unlimited nesting supported</span>
          </div>
        </div>
        <div style={{ display:'flex', gap:8, flexShrink:0 }}>
          <Btn onClick={() => navigate('/settings/materials/library')}>View library</Btn>
          <Btn onClick={() => setModal({ type:'cat' })} variant="primary">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
            Add category
          </Btn>
        </div>
      </div>

      {/* Info banner */}
      <div style={{ background:'#EEF2FF', borderRadius:10, border:'1px solid #C4D4F8', padding:'10px 14px', marginBottom:20, fontSize:12, color:'#3730A3', display:'flex', gap:8, alignItems:'flex-start' }}>
        <span style={{ flexShrink:0, fontSize:15 }}>ℹ️</span>
        <div>
          <strong>Unlimited nesting</strong> — you can create subcategories within subcategories to any depth.
          Use the <strong>+</strong> button next to any category to add a child. The <strong>L1/L2/L3…</strong> pill shows nesting level.
        </div>
      </div>

      {/* Empty state */}
      {topCats.length === 0 && (
        <div style={{ background:'#fff', borderRadius:12, border:'1px solid #E8ECF0', padding:'48px 24px', textAlign:'center' }}>
          <div style={{ fontSize:36, marginBottom:12 }}>📦</div>
          <div style={{ fontSize:15, fontWeight:600, color:'#374151', marginBottom:6 }}>No categories yet</div>
          <div style={{ fontSize:13, color:'#9CA3AF', marginBottom:20 }}>Create categories to organise your materials library</div>
          <Btn onClick={() => setModal({ type:'cat' })} variant="primary" style={{ margin:'0 auto' }}>+ Add first category</Btn>
        </div>
      )}

      {/* Category tree */}
      <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
        {topCats.map(cat => (
          <CatNode key={cat.id} cat={cat} allCats={allCats} depth={0}
            breadcrumb={cat.name}
            onEdit={(c, bc) => setModal({ type:'edit', cat:c, breadcrumb:bc })}
            onDelete={onDelete}
            onAddChild={(c, bc) => setModal({ type:'add', parentId:c.id, breadcrumb:bc })}
            onFields={(c, bc) => setModal({ type:'fields', catId:c.id, catName:bc })}
          />
        ))}
      </div>

      {/* Modals */}
      {modal?.type === 'cat' && (
        <CategoryModal parentId={null} breadcrumb={null} onSave={onSaved} onClose={() => setModal(null)} />
      )}
      {modal?.type === 'add' && (
        <CategoryModal parentId={modal.parentId} breadcrumb={modal.breadcrumb} onSave={onSaved} onClose={() => setModal(null)} />
      )}
      {modal?.type === 'edit' && (
        <CategoryModal cat={modal.cat} parentId={null} breadcrumb={modal.breadcrumb} onSave={onSaved} onClose={() => setModal(null)} />
      )}
      {modal?.type === 'fields' && (
        <FieldsModal catId={modal.catId} catName={modal.catName} onClose={() => setModal(null)} />
      )}
    </div>
  )
}
