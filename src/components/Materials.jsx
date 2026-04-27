import React, { useState, useEffect, useRef } from 'react'
import { supabase, BUCKET, pubUrl } from '../lib/supabase'
import { useToast } from '../components/Toast'
import BackButton from '../components/BackButton'

// ── safe JSON parse ──────────────────────────────────────────────
function safeJSON(val) {
  if (!val) return {}
  if (typeof val === 'object') return val
  try { return JSON.parse(val) } catch { return {} }
}

// ── image compression ─────────────────────────────────────────────
async function compressImage(file, maxPx = 800, quality = 0.82) {
  return new Promise((resolve, reject) => {
    const img = new Image()
    const url = URL.createObjectURL(file)
    img.onload = () => {
      URL.revokeObjectURL(url)
      let { width, height } = img
      if (width > maxPx || height > maxPx) {
        if (width > height) { height = Math.round(height * (maxPx / width)); width = maxPx }
        else { width = Math.round(width * (maxPx / height)); height = maxPx }
      }
      const cv = document.createElement('canvas')
      cv.width = width; cv.height = height
      cv.getContext('2d').drawImage(img, 0, 0, width, height)
      cv.toBlob(resolve, 'image/jpeg', quality)
    }
    img.onerror = reject
    img.src = url
  })
}

// ── ImageUpload helper ────────────────────────────────────────────
function ImageUpload({ current, onFile, label = 'Add image' }) {
  const ref = useRef()
  return (
    <div onClick={() => ref.current.click()}
      style={{ width:'100%', height:100, borderRadius:12, border:'2px dashed #E8ECF0', overflow:'hidden', cursor:'pointer', background:'#FAFAFA', display:'flex', alignItems:'center', justifyContent:'center', position:'relative', marginBottom:12 }}
      onMouseEnter={e => e.currentTarget.style.borderColor='#9CA3AF'}
      onMouseLeave={e => e.currentTarget.style.borderColor='#E8ECF0'}>
      {current
        ? <img src={current} style={{ width:'100%', height:'100%', objectFit:'cover', display:'block' }} alt="" />
        : <div style={{ textAlign:'center', color:'#9CA3AF', pointerEvents:'none' }}>
            <div style={{ fontSize:24, marginBottom:4 }}>📷</div>
            <div style={{ fontSize:12 }}>{label}</div>
          </div>
      }
      <input ref={ref} type="file" accept="image/*" style={{ display:'none' }}
        onChange={e => { const f = e.target.files[0]; if (f) onFile(f) }} />
    </div>
  )
}

// ── Btn helpers ───────────────────────────────────────────────────
const Btn = ({ onClick, children, variant = 'default', disabled, style: s }) => {
  const styles = {
    default: { background:'#fff', border:'1px solid #E8ECF0', color:'#374151' },
    primary: { background:'#5B8AF0', border:'1px solid #5B8AF0', color:'#fff' },
    green:   { background:'#ECFDF5', border:'1px solid #6EE7B7', color:'#065F46' },
    red:     { background:'#FEF2F2', border:'1px solid #FCA5A5', color:'#991B1B' },
    ghost:   { background:'transparent', border:'1px dashed #C4D4F8', color:'#5B8AF0' },
  }
  return (
    <button onClick={onClick} disabled={disabled}
      style={{ fontSize:13, fontWeight:600, padding:'7px 14px', borderRadius:9, cursor: disabled?'not-allowed':'pointer', opacity: disabled?0.5:1, transition:'all .12s', ...styles[variant], ...s }}
      onMouseEnter={e => { if (!disabled) e.currentTarget.style.opacity='0.85' }}
      onMouseLeave={e => { if (!disabled) e.currentTarget.style.opacity='1' }}>
      {children}
    </button>
  )
}

// ── FIELD MANAGER MODAL ───────────────────────────────────────────
function FieldManager({ catId, catName, fields, onClose, onChanged }) {
  const toast = useToast()
  const [items, setItems] = useState(fields)
  const [adding, setAdding] = useState(false)
  const [newField, setNewField] = useState({ label:'', field_type:'text', required: false })
  const [editId, setEditId] = useState(null)
  const [editLabel, setEditLabel] = useState('')

  const FIELD_TYPES = [
    { value:'text',   label:'Text' },
    { value:'number', label:'Number' },
    { value:'select', label:'Dropdown' },
    { value:'color',  label:'Colour picker' },
  ]

  async function addField() {
    if (!newField.label.trim()) return
    const { data, error } = await supabase.from('category_fields')
      .insert({ category_id: catId, label: newField.label.trim(), field_type: newField.field_type, required: newField.required, sort_order: items.length })
      .select().single()
    if (error) { toast(error.message, 'error'); return }
    const updated = [...items, data]
    setItems(updated); setAdding(false)
    setNewField({ label:'', field_type:'text', required:false })
    onChanged(updated); toast('Field added ✓')
  }

  async function saveEdit(id) {
    if (!editLabel.trim()) return
    await supabase.from('category_fields').update({ label: editLabel.trim() }).eq('id', id)
    const updated = items.map(f => f.id === id ? { ...f, label: editLabel.trim() } : f)
    setItems(updated); setEditId(null); onChanged(updated); toast('Renamed ✓')
  }

  async function deleteField(id) {
    if (!confirm('Delete this field? Existing values will be lost.')) return
    await supabase.from('category_fields').delete().eq('id', id)
    const updated = items.filter(f => f.id !== id)
    setItems(updated); onChanged(updated); toast('Field deleted')
  }

  async function moveField(id, dir) {
    const idx = items.findIndex(f => f.id === id)
    const newIdx = idx + dir
    if (newIdx < 0 || newIdx >= items.length) return
    const updated = [...items]
    ;[updated[idx], updated[newIdx]] = [updated[newIdx], updated[idx]]
    setItems(updated)
    await Promise.all(updated.map((f, i) => supabase.from('category_fields').update({ sort_order: i }).eq('id', f.id)))
    onChanged(updated)
  }

  return (
    <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.5)', zIndex:600, display:'flex', alignItems:'center', justifyContent:'center', padding:24 }}
      onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={{ background:'#fff', borderRadius:16, width:'100%', maxWidth:480, boxShadow:'0 20px 60px rgba(0,0,0,0.2)', overflow:'hidden' }}>
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'16px 20px', borderBottom:'1px solid #F3F4F6' }}>
          <div>
            <h2 style={{ fontSize:15, fontWeight:700, color:'#2A3042', margin:0 }}>Fields — {catName}</h2>
            <p style={{ fontSize:12, color:'#9CA3AF', margin:'2px 0 0' }}>Manage what information is captured per material</p>
          </div>
          <button onClick={onClose} style={{ background:'none', border:'none', fontSize:22, color:'#9CA3AF', cursor:'pointer', lineHeight:1 }}>×</button>
        </div>
        <div style={{ padding:20, maxHeight:'60vh', overflowY:'auto' }}>
          {items.length === 0 && !adding && (
            <div style={{ textAlign:'center', padding:'24px 0', color:'#9CA3AF', fontSize:13 }}>No fields yet — add one below</div>
          )}
          {items.map((f, idx) => (
            <div key={f.id} style={{ display:'flex', alignItems:'center', gap:8, padding:'9px 12px', borderRadius:10, border:'1px solid #E8ECF0', marginBottom:8, background:'#FAFAFA' }}>
              <div style={{ display:'flex', flexDirection:'column', gap:2, marginRight:2 }}>
                <button onClick={() => moveField(f.id, -1)} disabled={idx===0} style={{ background:'none', border:'none', cursor:idx===0?'default':'pointer', color:'#C4C9D4', fontSize:10, lineHeight:1, padding:0 }}>▲</button>
                <button onClick={() => moveField(f.id, 1)} disabled={idx===items.length-1} style={{ background:'none', border:'none', cursor:idx===items.length-1?'default':'pointer', color:'#C4C9D4', fontSize:10, lineHeight:1, padding:0 }}>▼</button>
              </div>
              {editId === f.id ? (
                <input autoFocus value={editLabel} onChange={e => setEditLabel(e.target.value)}
                  onKeyDown={e => { if (e.key==='Enter') saveEdit(f.id); if (e.key==='Escape') setEditId(null) }}
                  style={{ flex:1, border:'1px solid #5B8AF0', borderRadius:7, padding:'4px 8px', fontSize:13, outline:'none' }} />
              ) : (
                <div style={{ flex:1 }}>
                  <span style={{ fontSize:13, fontWeight:600, color:'#2A3042' }}>{f.label}</span>
                  <span style={{ fontSize:11, color:'#9CA3AF', marginLeft:8 }}>{FIELD_TYPES.find(t=>t.value===f.field_type)?.label || f.field_type}</span>
                  {f.required && <span style={{ fontSize:10, marginLeft:6, color:'#E24B4A', fontWeight:700 }}>required</span>}
                </div>
              )}
              <button onClick={() => { setEditId(f.id); setEditLabel(f.label) }} style={{ background:'none', border:'none', cursor:'pointer', fontSize:12, color:'#5B8AF0', padding:'2px 6px', borderRadius:6 }}>Edit</button>
              <button onClick={() => deleteField(f.id)} style={{ background:'none', border:'none', cursor:'pointer', fontSize:12, color:'#E24B4A', padding:'2px 6px', borderRadius:6 }}>Delete</button>
            </div>
          ))}

          {adding ? (
            <div style={{ padding:14, background:'#F9FAFB', borderRadius:12, border:'1px solid #E8ECF0', marginTop:8 }}>
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10, marginBottom:10 }}>
                <div style={{ gridColumn:'span 2' }}>
                  <label style={{ fontSize:12, fontWeight:600, color:'#6B7280', display:'block', marginBottom:4 }}>Field label *</label>
                  <input autoFocus value={newField.label} onChange={e => setNewField(p=>({...p,label:e.target.value}))}
                    onKeyDown={e => e.key==='Enter' && addField()}
                    placeholder="e.g. Colour Code" style={{ width:'100%', padding:'7px 10px', border:'1px solid #DDE3EC', borderRadius:8, fontSize:13, outline:'none' }} />
                </div>
                <div>
                  <label style={{ fontSize:12, fontWeight:600, color:'#6B7280', display:'block', marginBottom:4 }}>Type</label>
                  <select value={newField.field_type} onChange={e => setNewField(p=>({...p,field_type:e.target.value}))}
                    style={{ width:'100%', padding:'7px 10px', border:'1px solid #DDE3EC', borderRadius:8, fontSize:13, outline:'none' }}>
                    {FIELD_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                  </select>
                </div>
                <div style={{ display:'flex', alignItems:'center', gap:8, paddingTop:22 }}>
                  <input type="checkbox" id="req-field" checked={newField.required} onChange={e => setNewField(p=>({...p,required:e.target.checked}))} />
                  <label htmlFor="req-field" style={{ fontSize:13, color:'#374151', cursor:'pointer' }}>Required</label>
                </div>
              </div>
              <div style={{ display:'flex', gap:8 }}>
                <Btn onClick={addField} variant="primary">Add field</Btn>
                <Btn onClick={() => setAdding(false)}>Cancel</Btn>
              </div>
            </div>
          ) : (
            <Btn onClick={() => setAdding(true)} variant="ghost" style={{ width:'100%', marginTop:8 }}>+ Add field</Btn>
          )}
        </div>
      </div>
    </div>
  )
}

// ── CATEGORY FORM MODAL ───────────────────────────────────────────
function CategoryForm({ category, parentId, parentName, allCats, onSave, onClose }) {
  const toast = useToast()
  const [name, setName] = useState(category?.name || '')
  const [preview, setPreview] = useState(category?.image_path ? pubUrl(category.image_path) : null)
  const [file, setFile] = useState(null)
  const [saving, setSaving] = useState(false)

  async function save() {
    if (!name.trim()) { toast('Enter a name', 'error'); return }
    setSaving(true)
    let image_path = category?.image_path || null
    if (file) {
      try {
        const compressed = await compressImage(file, 600, 0.85)
        const path = `categories/${Date.now()}_cat.jpg`
        const { error: upErr } = await supabase.storage.from(BUCKET).upload(path, compressed, { contentType:'image/jpeg', upsert:true })
        if (!upErr) {
          if (image_path && image_path !== path) await supabase.storage.from(BUCKET).remove([image_path])
          image_path = path
        }
      } catch (e) { toast('Image error', 'error') }
    }
    const row = { name: name.trim(), parent_id: parentId || category?.parent_id || null, image_path }
    const { data, error } = category?.id
      ? await supabase.from('material_categories').update(row).eq('id', category.id).select().single()
      : await supabase.from('material_categories').insert(row).select().single()
    setSaving(false)
    if (error) { toast(error.message, 'error'); return }
    toast('Saved ✓'); onSave(data)
  }

  return (
    <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.5)', zIndex:600, display:'flex', alignItems:'center', justifyContent:'center', padding:24 }}
      onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={{ background:'#fff', borderRadius:16, width:'100%', maxWidth:400, boxShadow:'0 20px 60px rgba(0,0,0,0.2)', overflow:'hidden' }}>
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'16px 20px', borderBottom:'1px solid #F3F4F6' }}>
          <h2 style={{ fontSize:15, fontWeight:700, color:'#2A3042', margin:0 }}>
            {category?.id ? 'Edit category' : parentName ? `Add subcategory under ${parentName}` : 'Add category'}
          </h2>
          <button onClick={onClose} style={{ background:'none', border:'none', fontSize:22, color:'#9CA3AF', cursor:'pointer' }}>×</button>
        </div>
        <div style={{ padding:20 }}>
          <ImageUpload current={preview}
            onFile={f => { setFile(f); setPreview(URL.createObjectURL(f)) }}
            label="Tap to add category image" />
          <label style={{ fontSize:12, fontWeight:600, color:'#6B7280', display:'block', marginBottom:4 }}>Category name *</label>
          <input value={name} onChange={e => setName(e.target.value)} onKeyDown={e => e.key==='Enter' && save()}
            placeholder="e.g. Panel, Drawer Runners…"
            style={{ width:'100%', padding:'9px 12px', border:'1px solid #DDE3EC', borderRadius:9, fontSize:14, outline:'none', marginBottom:16 }} />
          <div style={{ display:'flex', gap:8 }}>
            <Btn onClick={save} variant="primary" disabled={saving}>{saving ? 'Saving…' : 'Save'}</Btn>
            <Btn onClick={onClose}>Cancel</Btn>
          </div>
        </div>
      </div>
    </div>
  )
}

// ── MATERIAL FORM ─────────────────────────────────────────────────
function MaterialForm({ material, category, fields, allCats, onSave, onCancel }) {
  const toast = useToast()
  const [name, setName] = useState(material?.name || '')
  const [supplier, setSupplier] = useState(material?.supplier || '')
  const [color, setColor] = useState(material?.color || '#cccccc')
  const [preview, setPreview] = useState(material?.storage_path ? pubUrl(material.storage_path) : null)
  const [file, setFile] = useState(null)
  const [customVals, setCustomVals] = useState(safeJSON(material?.custom_fields))
  const [saving, setSaving] = useState(false)
  const setCV = (k, v) => setCustomVals(p => ({ ...p, [k]: v }))

  async function save() {
    if (!name.trim()) { toast('Please enter a name', 'error'); return }
    // Check required fields
    const missing = fields.filter(f => f.required && !customVals[f.id])
    if (missing.length) { toast(`Required: ${missing.map(f=>f.label).join(', ')}`, 'error'); return }
    setSaving(true)
    let storage_path = material?.storage_path || null
    if (file) {
      try {
        const compressed = await compressImage(file)
        const path = `materials/${Date.now()}_swatch.jpg`
        const { error: upErr } = await supabase.storage.from(BUCKET).upload(path, compressed, { contentType:'image/jpeg', upsert:true })
        if (!upErr) {
          if (storage_path && storage_path !== path) await supabase.storage.from(BUCKET).remove([storage_path])
          storage_path = path
        }
      } catch (e) { toast('Image error', 'error') }
    }
    const row = {
      name: name.trim(), supplier, color, storage_path,
      category_id: category?.id || material?.category_id || null,
      custom_fields: customVals, // stored as jsonb — no stringify needed
      // keep legacy fields populated for backward compat
      panel_type: customVals['panel_type'] || material?.panel_type || null,
      thickness: parseFloat(customVals['thickness']) || material?.thickness || null,
      colour_code: customVals['colour_code'] || material?.colour_code || null,
      finish: customVals['finish'] || material?.finish || null,
    }
    const { data, error } = material?.id
      ? await supabase.from('materials').update(row).eq('id', material.id).select().single()
      : await supabase.from('materials').insert(row).select().single()
    setSaving(false)
    if (error) { toast(error.message, 'error'); return }
    toast('Material saved ✓'); onSave(data)
  }

  return (
    <div style={{ background:'#fff', borderRadius:12, border:'1px solid #E8ECF0', padding:20, marginBottom:14 }}>
      <h2 style={{ fontSize:14, fontWeight:700, color:'#2A3042', marginBottom:16 }}>
        {material?.id ? 'Edit' : 'Add'} material {category ? `— ${category.name}` : ''}
      </h2>
      <ImageUpload current={preview} onFile={f => { setFile(f); setPreview(URL.createObjectURL(f)) }} label="Tap to add colour/image" />
      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12, marginBottom:12 }}>
        <div style={{ gridColumn:'span 2' }}>
          <label style={{ fontSize:12, fontWeight:600, color:'#6B7280', display:'block', marginBottom:4 }}>Material name *</label>
          <input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Laminex Natural Oak"
            style={{ width:'100%', padding:'8px 10px', border:'1px solid #DDE3EC', borderRadius:8, fontSize:13, outline:'none' }} />
        </div>
        <div>
          <label style={{ fontSize:12, fontWeight:600, color:'#6B7280', display:'block', marginBottom:4 }}>Supplier</label>
          <input value={supplier} onChange={e => setSupplier(e.target.value)} placeholder="e.g. Laminex"
            style={{ width:'100%', padding:'8px 10px', border:'1px solid #DDE3EC', borderRadius:8, fontSize:13, outline:'none' }} />
        </div>
        <div>
          <label style={{ fontSize:12, fontWeight:600, color:'#6B7280', display:'block', marginBottom:4 }}>Colour</label>
          <div style={{ display:'flex', gap:8, alignItems:'center' }}>
            <input type="color" value={color} onChange={e => setColor(e.target.value)}
              style={{ width:40, height:36, borderRadius:8, border:'1px solid #DDE3EC', cursor:'pointer', padding:2 }} />
            <input value={color} onChange={e => setColor(e.target.value)}
              style={{ flex:1, padding:'8px 10px', border:'1px solid #DDE3EC', borderRadius:8, fontSize:13, outline:'none', fontFamily:'monospace' }} />
          </div>
        </div>
        {/* Dynamic fields from category */}
        {fields.map(f => (
          <div key={f.id} style={{ gridColumn: f.field_type==='text' && f.label.length>15 ? 'span 2' : 'span 1' }}>
            <label style={{ fontSize:12, fontWeight:600, color:'#6B7280', display:'block', marginBottom:4 }}>
              {f.label}{f.required && <span style={{ color:'#E24B4A', marginLeft:3 }}>*</span>}
            </label>
            {f.field_type === 'color' ? (
              <div style={{ display:'flex', gap:8, alignItems:'center' }}>
                <input type="color" value={customVals[f.id]||'#cccccc'} onChange={e => setCV(f.id, e.target.value)}
                  style={{ width:40, height:36, borderRadius:8, border:'1px solid #DDE3EC', cursor:'pointer', padding:2 }} />
                <input value={customVals[f.id]||''} onChange={e => setCV(f.id, e.target.value)}
                  style={{ flex:1, padding:'8px 10px', border:'1px solid #DDE3EC', borderRadius:8, fontSize:13, outline:'none' }} />
              </div>
            ) : (
              <input
                type={f.field_type === 'number' ? 'number' : 'text'}
                value={customVals[f.id] || ''}
                onChange={e => setCV(f.id, e.target.value)}
                placeholder={f.field_type==='number' ? '0' : `Enter ${f.label.toLowerCase()}…`}
                style={{ width:'100%', padding:'8px 10px', border:'1px solid #DDE3EC', borderRadius:8, fontSize:13, outline:'none' }}
              />
            )}
          </div>
        ))}
      </div>
      <div style={{ display:'flex', gap:8 }}>
        <Btn onClick={save} variant="green" disabled={saving}>{saving ? 'Saving…' : 'Save material'}</Btn>
        <Btn onClick={onCancel}>Cancel</Btn>
      </div>
    </div>
  )
}

// ── CATEGORY DETAIL VIEW ──────────────────────────────────────────
function CategoryDetail({ cat, allCats, onBack, onCatUpdated }) {
  const toast = useToast()
  const [materials, setMaterials] = useState([])
  const [fields, setFields] = useState([])
  const [subCats, setSubCats] = useState([])
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState(null)
  const [showFieldMgr, setShowFieldMgr] = useState(false)
  const [showAddSub, setShowAddSub] = useState(false)
  const [editCat, setEditCat] = useState(null)
  const [activeSubCat, setActiveSubCat] = useState(null)

  useEffect(() => {
    const subs = allCats.filter(c => c.parent_id === cat.id)
    setSubCats(subs)
    const firstSub = subs[0]
    setActiveSubCat(firstSub?.id || null)
    Promise.all([
      supabase.from('materials').select('*').eq('category_id', cat.id).order('name'),
      supabase.from('category_fields').select('*').eq('category_id', cat.id).order('sort_order'),
    ]).then(([{ data: mats }, { data: flds }]) => {
      setMaterials(mats || [])
      setFields(flds || [])
      setLoading(false)
    })
  }, [cat.id])

  const [subMatsMap, setSubMatsMap] = useState({})
  useEffect(() => {
    if (!subCats.length) return
    Promise.all(subCats.map(s => supabase.from('materials').select('*').eq('category_id', s.id).order('name')))
      .then(results => {
        const map = {}
        subCats.forEach((s, i) => { map[s.id] = results[i].data || [] })
        setSubMatsMap(map)
      })
  }, [subCats.length]) // re-run when subcats change

  const [activeFields, setActiveFields] = useState([])
  useEffect(() => {
    const targetId = activeSubCat || cat.id
    supabase.from('category_fields').select('*').eq('category_id', targetId).order('sort_order')
      .then(({ data }) => setActiveFields(data || []))
  }, [activeSubCat, cat.id])

  function onMatSaved(m) {
    const isForSub = activeSubCat && m.category_id === activeSubCat
    if (isForSub) {
      setSubMatsMap(p => ({ ...p, [activeSubCat]: [...(p[activeSubCat]||[]).filter(x=>x.id!==m.id), m].sort((a,b)=>a.name.localeCompare(b.name)) }))
    } else {
      setMaterials(prev => {
        const i = prev.findIndex(x => x.id === m.id)
        return i>=0 ? prev.map((x,j)=>j===i?m:x) : [...prev, m].sort((a,b)=>a.name.localeCompare(b.name))
      })
    }
    setEditing(null)
  }

  async function deleteMat(m) {
    if (!confirm(`Delete "${m.name}"?`)) return
    if (m.storage_path) await supabase.storage.from(BUCKET).remove([m.storage_path])
    await supabase.from('materials').delete().eq('id', m.id)
    if (activeSubCat) setSubMatsMap(p => ({ ...p, [activeSubCat]: (p[activeSubCat]||[]).filter(x=>x.id!==m.id) }))
    else setMaterials(prev => prev.filter(x => x.id !== m.id))
    toast('Deleted')
  }

  async function deleteSubCat(sub) {
    const mats = subMatsMap[sub.id] || []
    if (mats.length) { toast(`Move ${mats.length} material(s) first`, 'error'); return }
    if (!confirm(`Delete "${sub.name}"?`)) return
    if (sub.image_path) await supabase.storage.from(BUCKET).remove([sub.image_path])
    await supabase.from('material_categories').delete().eq('id', sub.id)
    const updated = allCats.filter(c => c.id !== sub.id)
    onCatUpdated(updated)
    setSubCats(p => p.filter(s => s.id !== sub.id))
    if (activeSubCat === sub.id) setActiveSubCat(null)
    toast('Subcategory deleted')
  }

  const displayCat   = activeSubCat ? (subCats.find(s=>s.id===activeSubCat)||cat) : cat
  const displayMats  = activeSubCat ? (subMatsMap[activeSubCat]||[]) : materials

  return (
    <div>
      {showFieldMgr && (
        <FieldManager catId={activeSubCat||cat.id} catName={displayCat.name} fields={activeFields}
          onClose={() => setShowFieldMgr(false)}
          onChanged={updated => { setActiveFields(updated); if (!activeSubCat) setFields(updated) }} />
      )}
      {(showAddSub || editCat) && (
        <CategoryForm
          category={editCat || null}
          parentId={editCat ? null : cat.id}
          parentName={editCat ? null : cat.name}
          allCats={allCats}
          onClose={() => { setShowAddSub(false); setEditCat(null) }}
          onSave={saved => {
            if (editCat) {
              const updated = allCats.map(c => c.id===saved.id ? saved : c)
              onCatUpdated(updated)
              setSubCats(p => p.map(s => s.id===saved.id ? saved : s))
            } else {
              const updated = [...allCats, saved]
              onCatUpdated(updated)
              setSubCats(p => [...p, saved])
            }
            setShowAddSub(false); setEditCat(null)
          }} />
      )}

      <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:20, flexWrap:'wrap' }}>
        <button onClick={onBack} style={{ background:'none', border:'none', cursor:'pointer', fontSize:13, color:'#6B7280', display:'flex', alignItems:'center', gap:6, padding:0 }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/></svg>
          Materials
        </button>
        <span style={{ color:'#C4C9D4' }}>›</span>
        <span style={{ fontSize:15, fontWeight:700, color:'#2A3042' }}>{cat.name}</span>
        <div style={{ marginLeft:'auto', display:'flex', gap:8 }}>
          <Btn onClick={() => setShowFieldMgr(true)} style={{ fontSize:12 }}>⚙ Fields</Btn>
          <Btn onClick={() => setShowAddSub(true)} style={{ fontSize:12 }}>+ Subcategory</Btn>
          <Btn onClick={() => setEditing('new')} variant="green">+ Add material</Btn>
        </div>
      </div>

      {/* subcategory tabs */}
      {subCats.length > 0 && (
        <div style={{ display:'flex', gap:6, flexWrap:'wrap', marginBottom:20 }}>
          <button onClick={() => setActiveSubCat(null)}
            style={{ fontSize:12, fontWeight:600, padding:'6px 14px', borderRadius:20, border:`1.5px solid ${!activeSubCat?'#5B8AF0':'#E8ECF0'}`, background:!activeSubCat?'#5B8AF0':'#fff', color:!activeSubCat?'#fff':'#6B7280', cursor:'pointer' }}>
            All {cat.name} ({materials.length})
          </button>
          {subCats.map(s => (
            <div key={s.id} style={{ display:'flex', alignItems:'center', gap:4 }}>
              <button onClick={() => setActiveSubCat(s.id)}
                style={{ fontSize:12, fontWeight:600, padding:'6px 14px', borderRadius:20, border:`1.5px solid ${activeSubCat===s.id?'#5B8AF0':'#E8ECF0'}`, background:activeSubCat===s.id?'#EEF2FF':'#fff', color:activeSubCat===s.id?'#3730A3':'#6B7280', cursor:'pointer' }}>
                {s.name} ({(subMatsMap[s.id]||[]).length})
              </button>
              <button onClick={() => setEditCat(s)} style={{ background:'none', border:'none', cursor:'pointer', fontSize:11, color:'#9CA3AF', padding:'2px 4px' }}>✎</button>
              <button onClick={() => deleteSubCat(s)} style={{ background:'none', border:'none', cursor:'pointer', fontSize:13, color:'#FCA5A5', padding:'2px 4px' }}>×</button>
            </div>
          ))}
        </div>
      )}

      {editing && (
        <MaterialForm
          material={editing==='new' ? null : editing}
          category={activeSubCat ? subCats.find(s=>s.id===activeSubCat) : cat}
          fields={activeFields}
          allCats={allCats}
          onSave={onMatSaved}
          onCancel={() => setEditing(null)} />
      )}

      {loading ? (
        <div style={{ display:'flex', justifyContent:'center', padding:'40px 0' }}><div className="spinner" /></div>
      ) : displayMats.length === 0 && !editing ? (
        <div style={{ textAlign:'center', padding:'40px 0', color:'#9CA3AF', fontSize:14 }}>
          No materials yet — click "+ Add material" to get started
        </div>
      ) : (
        <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(170px, 1fr))', gap:12 }}>
          {displayMats.map(m => {
            const customParsed = safeJSON(m.custom_fields)
            return (
              <div key={m.id} style={{ background:'#fff', borderRadius:12, border:'1px solid #E8ECF0', overflow:'hidden', boxShadow:'0 1px 3px rgba(0,0,0,0.04)' }}>
                {m.storage_path
                  ? <img src={pubUrl(m.storage_path)} style={{ width:'100%', height:80, objectFit:'cover', display:'block' }} loading="lazy" alt="" />
                  : <div style={{ width:'100%', height:80, background: m.color||'#F3F4F6', display:'flex', alignItems:'center', justifyContent:'center', fontSize:22 }}>
                      {m.color ? '' : '🎨'}
                    </div>
                }
                <div style={{ padding:12 }}>
                  <div style={{ fontSize:13, fontWeight:700, color:'#2A3042', marginBottom:2, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{m.name}</div>
                  <div style={{ fontSize:11, color:'#9CA3AF', marginBottom:8 }}>{m.supplier||'—'}</div>
                  {/* show first 2 custom field values */}
                  <div style={{ display:'flex', flexWrap:'wrap', gap:4, marginBottom:10 }}>
                    {activeFields.slice(0,3).map(f => customParsed[f.id] ? (
                      <span key={f.id} style={{ fontSize:10, padding:'2px 7px', borderRadius:8, background:'#F3F4F6', color:'#6B7280' }}>{customParsed[f.id]}</span>
                    ) : null)}
                  </div>
                  <div style={{ display:'flex', gap:6 }}>
                    <button onClick={() => setEditing(m)} style={{ flex:1, fontSize:12, padding:'5px 0', borderRadius:8, border:'1px solid #E8ECF0', background:'#fff', color:'#374151', cursor:'pointer', fontWeight:500 }}>Edit</button>
                    <button onClick={() => deleteMat(m)} style={{ fontSize:12, padding:'5px 10px', borderRadius:8, border:'1px solid #FCA5A5', background:'#FEF2F2', color:'#991B1B', cursor:'pointer', fontWeight:600 }}>×</button>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ── Error boundary ───────────────────────────────────────────────
class CatErrorBoundary extends React.Component {
  state = { error: null }
  static getDerivedStateFromError(e) { return { error: e } }
  render() {
    if (this.state.error) return (
      <div style={{ padding:40, textAlign:'center' }}>
        <div style={{ fontSize:24, marginBottom:12 }}>⚠️</div>
        <div style={{ fontSize:14, fontWeight:600, color:'#2A3042', marginBottom:8 }}>Something went wrong loading this category</div>
        <div style={{ fontSize:12, color:'#9CA3AF', marginBottom:20, fontFamily:'monospace' }}>{this.state.error.message}</div>
        <button onClick={() => this.setState({ error:null })} style={{ padding:'8px 20px', borderRadius:9, border:'1px solid #E8ECF0', background:'#fff', cursor:'pointer', fontSize:13, fontWeight:600 }}>Try again</button>
      </div>
    )
    return this.props.children
  }
}

// ── MAIN SCREEN ───────────────────────────────────────────────────
export default function Materials() {
  const toast = useToast()
  const [cats, setCats]             = useState([])
  const [loading, setLoading]       = useState(true)
  const [activeCat, setActiveCat]   = useState(null)
  const [showCatForm, setShowCatForm] = useState(false)
  const [editCat, setEditCat]       = useState(null)

  useEffect(() => {
    supabase.from('material_categories').select('*').order('name').then(({ data }) => {
      setCats(data || [])
      setLoading(false)
    })
  }, [])

  const topCats = cats.filter(c => !c.parent_id)

  async function deleteCat(cat) {
    const hasSubs = cats.some(c => c.parent_id === cat.id)
    if (hasSubs) { toast('Remove subcategories first', 'error'); return }
    const { count } = await supabase.from('materials').select('*',{count:'exact',head:true}).eq('category_id', cat.id)
    if (count > 0) { toast(`${count} material(s) use this — reassign first`, 'error'); return }
    if (!confirm(`Delete "${cat.name}"?`)) return
    if (cat.image_path) await supabase.storage.from(BUCKET).remove([cat.image_path])
    await supabase.from('material_categories').delete().eq('id', cat.id)
    setCats(p => p.filter(c => c.id !== cat.id))
    toast('Category deleted')
  }

  // Drill into category
  if (activeCat) {
    return (
      <CatErrorBoundary>
      <CategoryDetail
        cat={activeCat}
        allCats={cats}
        onBack={() => setActiveCat(null)}
        onCatUpdated={updated => setCats(updated)} />
      </CatErrorBoundary>
    )
  }

  return (
    <div>
      {(showCatForm || editCat) && (
        <CategoryForm
          category={editCat}
          allCats={cats}
          onClose={() => { setShowCatForm(false); setEditCat(null) }}
          onSave={saved => {
            setCats(prev => {
              const i = prev.findIndex(c => c.id === saved.id)
              return i>=0 ? prev.map((c,j)=>j===i?saved:c) : [...prev, saved]
            })
            setShowCatForm(false); setEditCat(null)
          }} />
      )}

      <BackButton to="/settings" label="Settings" />
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:20 }}>
        <h1 style={{ fontSize:20, fontWeight:800, color:'#2A3042', margin:0 }}>Materials</h1>
        <Btn onClick={() => setShowCatForm(true)} variant="green">+ Add category</Btn>
      </div>

      {loading ? (
        <div style={{ display:'flex', justifyContent:'center', padding:'60px 0' }}><div className="spinner" /></div>
      ) : topCats.length === 0 ? (
        <div style={{ textAlign:'center', padding:'60px 0', color:'#9CA3AF', fontSize:14 }}>
          No categories yet — add one to get started
        </div>
      ) : (
        <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(200px, 1fr))', gap:16 }}>
          {topCats.map(cat => {
            const subCount = cats.filter(c => c.parent_id === cat.id).length
            return (
              <div key={cat.id} style={{ background:'#fff', borderRadius:16, border:'1px solid #E8ECF0', overflow:'hidden', boxShadow:'0 2px 8px rgba(0,0,0,0.06)', cursor:'pointer', transition:'all .15s', position:'relative' }}
                onClick={() => setActiveCat(cat)}
                onMouseEnter={e => { e.currentTarget.style.boxShadow='0 8px 24px rgba(0,0,0,0.12)'; e.currentTarget.style.transform='translateY(-2px)' }}
                onMouseLeave={e => { e.currentTarget.style.boxShadow='0 2px 8px rgba(0,0,0,0.06)'; e.currentTarget.style.transform='none' }}>
                {/* image or placeholder */}
                <div style={{ width:'100%', height:130, overflow:'hidden', position:'relative', background: cat.image_path ? 'transparent' : 'linear-gradient(135deg, #EEF2FF 0%, #E8ECF0 100%)' }}>
                  {cat.image_path
                    ? <img src={pubUrl(cat.image_path)} style={{ width:'100%', height:'100%', objectFit:'cover', display:'block' }} loading="lazy" alt="" />
                    : <div style={{ width:'100%', height:'100%', display:'flex', alignItems:'center', justifyContent:'center', fontSize:36 }}>🪵</div>
                  }
                  {/* edit/delete overlay buttons */}
                  <div style={{ position:'absolute', top:8, right:8, display:'flex', gap:4 }}
                    onClick={e => e.stopPropagation()}>
                    <button onClick={() => setEditCat(cat)}
                      style={{ width:28, height:28, borderRadius:8, background:'rgba(255,255,255,0.9)', border:'none', cursor:'pointer', fontSize:13, display:'flex', alignItems:'center', justifyContent:'center', boxShadow:'0 1px 4px rgba(0,0,0,0.15)' }}>✎</button>
                    <button onClick={() => deleteCat(cat)}
                      style={{ width:28, height:28, borderRadius:8, background:'rgba(255,255,255,0.9)', border:'none', cursor:'pointer', fontSize:13, color:'#E24B4A', display:'flex', alignItems:'center', justifyContent:'center', boxShadow:'0 1px 4px rgba(0,0,0,0.15)' }}>×</button>
                  </div>
                </div>
                <div style={{ padding:'14px 16px' }}>
                  <div style={{ fontSize:15, fontWeight:700, color:'#2A3042', marginBottom:3 }}>{cat.name}</div>
                  <div style={{ fontSize:12, color:'#9CA3AF' }}>
                    {subCount > 0 ? `${subCount} subcategor${subCount===1?'y':'ies'}` : 'No subcategories'}
                  </div>
                </div>
              </div>
            )
          })}
          {/* add category tile */}
          <div onClick={() => setShowCatForm(true)}
            style={{ border:'2px dashed #E8ECF0', borderRadius:16, display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', gap:8, cursor:'pointer', minHeight:200, transition:'all .15s' }}
            onMouseEnter={e => { e.currentTarget.style.borderColor='#5B8AF0'; e.currentTarget.style.background='#F9FAFB' }}
            onMouseLeave={e => { e.currentTarget.style.borderColor='#E8ECF0'; e.currentTarget.style.background='transparent' }}>
            <div style={{ fontSize:28, opacity:0.4 }}>+</div>
            <span style={{ fontSize:13, color:'#9CA3AF', fontWeight:600 }}>Add category</span>
          </div>
        </div>
      )}
    </div>
  )
}
