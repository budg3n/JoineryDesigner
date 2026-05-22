import React, { useState, useEffect, useRef } from 'react'
import { useDragColumns } from '../hooks/useDragColumns'
import { cachedQuery } from '../hooks/useCache'
import { supabase, BUCKET, pubUrl } from '../lib/supabase'
import { useToast } from '../components/Toast'
import BackButton from '../components/BackButton'
import { useLocation } from 'react-router-dom'

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
  const [newField, setNewField] = useState({ label:'', field_type:'text', required:false, options:'' })
  const [editId, setEditId] = useState(null)
  const [editField, setEditField] = useState(null) // { label, field_type, required, options }

  const FIELD_TYPES = [
    { value:'text',     label:'Text',           icon:'Aa',  desc:'Free text entry' },
    { value:'number',   label:'Number',         icon:'#',   desc:'Numeric value' },
    { value:'select',   label:'Dropdown',       icon:'▾',   desc:'Pick from a list' },
    { value:'checkbox', label:'Tick box',       icon:'☑',   desc:'Yes / No toggle' },
    { value:'color',    label:'Colour picker',  icon:'◉',   desc:'Hex colour value' },
  ]

  async function addField() {
    if (!newField.label.trim()) return
    const { data, error } = await supabase.from('category_fields')
      .insert({ category_id: catId, label: newField.label.trim(), field_type: newField.field_type, required: newField.required, sort_order: items.length, options: newField.options || null })
      .select().single()
    if (error) { toast(error.message, 'error'); return }
    const updated = [...items, data]
    setItems(updated); setAdding(false)
    setNewField({ label:'', field_type:'text', required:false, options:'' })
    onChanged(updated); toast('Field added ✓')
  }

  async function saveEdit(id) {
    if (!editField?.label?.trim()) return
    const patch = { label: editField.label.trim(), field_type: editField.field_type, required: editField.required, options: editField.options || null }
    await supabase.from('category_fields').update(patch).eq('id', id)
    const updated = items.map(f => f.id === id ? { ...f, ...patch } : f)
    setItems(updated); setEditId(null); setEditField(null); onChanged(updated); toast('Field updated ✓')
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
            <div key={f.id} style={{ marginBottom:8 }}>
              {editId === f.id && editField ? (
                /* ── inline edit panel ── */
                <div style={{ background:'#F0F4FF', borderRadius:12, border:'2px solid #5B8AF0', overflow:'hidden' }}>
                  {/* label */}
                  <div style={{ padding:'12px 14px', borderBottom:'1px solid #E0E8FF' }}>
                    <label style={{ fontSize:11, fontWeight:700, color:'#5B8AF0', display:'block', marginBottom:5, textTransform:'uppercase', letterSpacing:'.05em' }}>Label</label>
                    <input autoFocus value={editField.label} onChange={e => setEditField(p=>({...p,label:e.target.value}))}
                      onKeyDown={e => e.key==='Escape' && setEditId(null)}
                      style={{ width:'100%', padding:'7px 10px', border:'1px solid #C4D4F8', borderRadius:8, fontSize:13, outline:'none', background:'#fff' }} />
                  </div>
                  {/* type picker */}
                  <div style={{ padding:'12px 14px', borderBottom:'1px solid #E0E8FF' }}>
                    <label style={{ fontSize:11, fontWeight:700, color:'#5B8AF0', display:'block', marginBottom:7, textTransform:'uppercase', letterSpacing:'.05em' }}>Type</label>
                    <div style={{ display:'grid', gridTemplateColumns:'repeat(5,1fr)', gap:5 }}>
                      {FIELD_TYPES.map(t => (
                        <button key={t.value} onClick={() => setEditField(p=>({...p,field_type:t.value}))}
                          style={{ padding:'7px 3px', borderRadius:9, border:`2px solid ${editField.field_type===t.value?'#5B8AF0':'#C4D4F8'}`, background:editField.field_type===t.value?'#5B8AF0':'#fff', cursor:'pointer', textAlign:'center', transition:'all .1s' }}>
                          <div style={{ fontSize:14, marginBottom:2 }}>{t.icon}</div>
                          <div style={{ fontSize:9, fontWeight:700, color:editField.field_type===t.value?'#fff':'#6B7280', lineHeight:1.2 }}>{t.label}</div>
                        </button>
                      ))}
                    </div>
                  </div>
                  {/* dropdown options */}
                  {editField.field_type === 'select' && (
                    <div style={{ padding:'12px 14px', borderBottom:'1px solid #E0E8FF' }}>
                      <label style={{ fontSize:11, fontWeight:700, color:'#5B8AF0', display:'block', marginBottom:5, textTransform:'uppercase', letterSpacing:'.05em' }}>
                        Options <span style={{ fontWeight:400, color:'#9CA3AF', textTransform:'none' }}>(comma separated)</span>
                      </label>
                      <input value={editField.options} onChange={e => setEditField(p=>({...p,options:e.target.value}))}
                        placeholder="e.g. Matte, Gloss, Satin"
                        style={{ width:'100%', padding:'7px 10px', border:'1px solid #C4D4F8', borderRadius:8, fontSize:13, outline:'none', background:'#fff' }} />
                    </div>
                  )}
                  {/* footer */}
                  <div style={{ padding:'10px 14px', display:'flex', alignItems:'center', justifyContent:'space-between' }}>
                    <label onClick={() => setEditField(p=>({...p,required:!p.required}))}
                      style={{ display:'flex', alignItems:'center', gap:7, cursor:'pointer', fontSize:13, color:'#374151', userSelect:'none' }}>
                      <div style={{ width:18, height:18, borderRadius:5, border:`2px solid ${editField.required?'#5B8AF0':'#C4D4F8'}`, background:editField.required?'#5B8AF0':'#fff', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0, transition:'all .12s' }}>
                        {editField.required && <span style={{ color:'#fff', fontSize:11, fontWeight:700, lineHeight:1 }}>✓</span>}
                      </div>
                      <span style={{ fontSize:12, color:'#5B8AF0', fontWeight:500 }}>Required</span>
                    </label>
                    <div style={{ display:'flex', gap:7 }}>
                      <button onClick={() => { setEditId(null); setEditField(null) }}
                        style={{ fontSize:12, fontWeight:600, padding:'6px 12px', borderRadius:8, border:'1px solid #C4D4F8', background:'#fff', color:'#6B7280', cursor:'pointer' }}>Cancel</button>
                      <button onClick={() => saveEdit(f.id)}
                        style={{ fontSize:12, fontWeight:700, padding:'6px 14px', borderRadius:8, border:'none', background:'#5B8AF0', color:'#fff', cursor:'pointer' }}>Save</button>
                    </div>
                  </div>
                </div>
              ) : (
                /* ── collapsed row ── */
                <div style={{ display:'flex', alignItems:'center', gap:8, padding:'9px 12px', borderRadius:10, border:'1px solid #E8ECF0', background:'#FAFAFA' }}>
                  <div style={{ display:'flex', flexDirection:'column', gap:2, marginRight:2 }}>
                    <button onClick={() => moveField(f.id, -1)} disabled={idx===0} style={{ background:'none', border:'none', cursor:idx===0?'default':'pointer', color: idx===0?'#E8ECF0':'#C4C9D4', fontSize:10, lineHeight:1, padding:0 }}>▲</button>
                    <button onClick={() => moveField(f.id, 1)} disabled={idx===items.length-1} style={{ background:'none', border:'none', cursor:idx===items.length-1?'default':'pointer', color:idx===items.length-1?'#E8ECF0':'#C4C9D4', fontSize:10, lineHeight:1, padding:0 }}>▼</button>
                  </div>
                  <div style={{ flex:1, minWidth:0 }}>
                    <div style={{ display:'flex', alignItems:'center', gap:7 }}>
                      <span style={{ fontSize:13, fontWeight:600, color:'#2A3042' }}>{f.label}</span>
                      {f.required && <span style={{ fontSize:10, color:'#E24B4A', fontWeight:700, background:'#FEF2F2', padding:'1px 5px', borderRadius:4 }}>required</span>}
                    </div>
                    <div style={{ display:'flex', alignItems:'center', gap:5, marginTop:2 }}>
                      <span style={{ fontSize:11, fontWeight:700, color:'#6B7280', background:'#F3F4F6', padding:'1px 6px', borderRadius:5 }}>
                        {FIELD_TYPES.find(t=>t.value===f.field_type)?.icon} {FIELD_TYPES.find(t=>t.value===f.field_type)?.label || f.field_type}
                      </span>
                      {f.options && <span style={{ fontSize:11, color:'#9CA3AF', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', maxWidth:140 }}>{f.options}</span>}
                    </div>
                  </div>
                  <button onClick={() => { setEditId(f.id); setEditField({ label:f.label, field_type:f.field_type||'text', required:f.required||false, options:f.options||'' }) }}
                    style={{ background:'none', border:'none', cursor:'pointer', fontSize:12, color:'#5B8AF0', padding:'2px 8px', borderRadius:6, flexShrink:0, fontWeight:600 }}>Edit</button>
                  <button onClick={() => deleteField(f.id)}
                    style={{ background:'none', border:'none', cursor:'pointer', fontSize:12, color:'#E24B4A', padding:'2px 6px', borderRadius:6, flexShrink:0, fontWeight:600 }}>×</button>
                </div>
              )}
            </div>
          ))}

          {adding ? (
            <div style={{ background:'#F9FAFB', borderRadius:12, border:'1px solid #E8ECF0', marginTop:8, overflow:'hidden' }}>
              <div style={{ padding:'14px 16px', borderBottom:'1px solid #F0F0F0' }}>
                <label style={{ fontSize:12, fontWeight:600, color:'#6B7280', display:'block', marginBottom:6 }}>Field label *</label>
                <input autoFocus value={newField.label} onChange={e => setNewField(p=>({...p,label:e.target.value}))}
                  onKeyDown={e => e.key==='Enter' && addField()}
                  placeholder="e.g. Colour Code, Brand, Series…"
                  style={{ width:'100%', padding:'8px 11px', border:'1px solid #DDE3EC', borderRadius:9, fontSize:13, outline:'none', background:'#fff' }} />
              </div>

              {/* type picker — visual cards */}
              <div style={{ padding:'12px 16px', borderBottom:'1px solid #F0F0F0' }}>
                <label style={{ fontSize:12, fontWeight:600, color:'#6B7280', display:'block', marginBottom:8 }}>Field type</label>
                <div style={{ display:'grid', gridTemplateColumns:'repeat(5,1fr)', gap:6 }}>
                  {FIELD_TYPES.map(t => (
                    <button key={t.value} onClick={() => setNewField(p=>({...p,field_type:t.value}))}
                      style={{ padding:'8px 4px', borderRadius:10, border:`2px solid ${newField.field_type===t.value?'#5B8AF0':'#E8ECF0'}`, background: newField.field_type===t.value?'#EEF2FF':'#fff', cursor:'pointer', textAlign:'center', transition:'all .1s' }}>
                      <div style={{ fontSize:16, marginBottom:3 }}>{t.icon}</div>
                      <div style={{ fontSize:10, fontWeight:700, color: newField.field_type===t.value?'#3730A3':'#6B7280', lineHeight:1.2 }}>{t.label}</div>
                    </button>
                  ))}
                </div>
                <div style={{ fontSize:11, color:'#9CA3AF', marginTop:6 }}>
                  {FIELD_TYPES.find(t=>t.value===newField.field_type)?.desc}
                </div>
              </div>

              {/* dropdown options — only show when select type */}
              {newField.field_type === 'select' && (
                <div style={{ padding:'12px 16px', borderBottom:'1px solid #F0F0F0' }}>
                  <label style={{ fontSize:12, fontWeight:600, color:'#6B7280', display:'block', marginBottom:4 }}>Options <span style={{ fontWeight:400, color:'#9CA3AF' }}>(comma separated)</span></label>
                  <input value={newField.options} onChange={e => setNewField(p=>({...p,options:e.target.value}))}
                    placeholder="e.g. Matte, Gloss, Satin, Textured"
                    style={{ width:'100%', padding:'8px 11px', border:'1px solid #DDE3EC', borderRadius:9, fontSize:13, outline:'none', background:'#fff' }} />
                </div>
              )}

              <div style={{ padding:'12px 16px', display:'flex', alignItems:'center', justifyContent:'space-between' }}>
                <label style={{ display:'flex', alignItems:'center', gap:8, cursor:'pointer', fontSize:13, color:'#374151', userSelect:'none' }}>
                  <div onClick={() => setNewField(p=>({...p,required:!p.required}))}
                    style={{ width:18, height:18, borderRadius:5, border:`2px solid ${newField.required?'#5B8AF0':'#DDE3EC'}`, background:newField.required?'#5B8AF0':'#fff', display:'flex', alignItems:'center', justifyContent:'center', cursor:'pointer', transition:'all .12s', flexShrink:0 }}>
                    {newField.required && <span style={{ color:'#fff', fontSize:11, lineHeight:1, fontWeight:700 }}>✓</span>}
                  </div>
                  Required field
                </label>
                <div style={{ display:'flex', gap:8 }}>
                  <Btn onClick={() => { setAdding(false); setNewField({label:'',field_type:'text',required:false,options:''}) }}>Cancel</Btn>
                  <Btn onClick={addField} variant="primary">Add field</Btn>
                </div>
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
function MaterialForm({ material, category, topCategory, fields, allCats, onSave, onCancel }) {
  const toast = useToast()

  // Work out subcategory options — siblings of current category under topCategory
  // topCategory is the top-level cat (e.g. Panel), category is the subcat (e.g. Laminex)
  const effectiveTop = topCategory || category
  const subCatOptions = effectiveTop
    ? allCats.filter(c => c.parent_id === effectiveTop.id)
    : []

  // Initial category_id — prefer the subcat if we're inside one
  const initCatId = material?.category_id || category?.id || ''

  const [name, setName] = useState(material?.name || '')
  const [catId, setCatId] = useState(initCatId)
  const [grained, setGrained] = useState(material?.custom_fields ? (safeJSON(material.custom_fields)['grained'] ?? false) : false)
  const [preview, setPreview] = useState(material?.storage_path ? pubUrl(material.storage_path) : null)
  const [file, setFile] = useState(null)
  const [customVals, setCustomVals] = useState(safeJSON(material?.custom_fields))
  const [saving, setSaving] = useState(false)
  const setCV = (k, v) => setCustomVals(p => ({ ...p, [k]: v }))

  // When catId changes, reload fields for that category
  const [activeFields, setActiveFields] = useState(fields || [])
  async function save() {
    if (!name.trim()) { toast('Please enter a name', 'error'); return }
    const missing = activeFields.filter(f => f.required && !customVals[f.id])
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
    // use selected catId, fall back to passed category
    const finalCatId = catId || category?.id || null
    const selCat = allCats.find(c => c.id === finalCatId)
    const supplier = selCat?.parent_id ? selCat.name : (material?.supplier || '')
    // merge grained into customVals before saving
    const mergedCustom = { ...customVals, grained }
    const row = {
      name: name.trim(), supplier, storage_path,
      category_id: finalCatId,
      custom_fields: mergedCustom,
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

  // Resolve display name for header
  const selCat = allCats.find(c => c.id === catId)
  const headerCat = selCat || category

  return (
    <div style={{ background:'#fff', borderRadius:12, border:'1px solid #E8ECF0', padding:20, marginBottom:14 }}>
      <h2 style={{ fontSize:14, fontWeight:700, color:'#2A3042', marginBottom:16 }}>
        {material?.id ? 'Edit' : 'Add'} material {headerCat ? `— ${headerCat.name}` : ''}
      </h2>

      {/* subcategory picker — shown when there are subcats available */}
      {subCatOptions.length > 0 && (
        <div style={{ marginBottom:14 }}>
          <label style={{ fontSize:12, fontWeight:600, color:'#6B7280', display:'block', marginBottom:6 }}>
            {effectiveTop?.name} subcategory
          </label>
          <div style={{ display:'flex', flexWrap:'wrap', gap:6 }}>
            {subCatOptions.map(s => (
              <button key={s.id} onClick={() => setCatId(s.id)}
                style={{ fontSize:12, fontWeight:600, padding:'6px 14px', borderRadius:20,
                  border:`2px solid ${catId===s.id ? '#5B8AF0' : '#E8ECF0'}`,
                  background: catId===s.id ? '#EEF2FF' : '#fff',
                  color: catId===s.id ? '#3730A3' : '#6B7280',
                  cursor:'pointer', transition:'all .1s',
                  display:'flex', alignItems:'center', gap:6,
                }}>
                {s.image_path && (
                  <img src={pubUrl(s.image_path)} style={{ width:16, height:16, borderRadius:4, objectFit:'cover' }} alt="" />
                )}
                {s.name}
              </button>
            ))}
            {/* option to not assign to a subcat */}
            <button onClick={() => setCatId(effectiveTop?.id || '')}
              style={{ fontSize:12, fontWeight:600, padding:'6px 14px', borderRadius:20,
                border:`2px solid ${catId===effectiveTop?.id ? '#5B8AF0' : '#E8ECF0'}`,
                background: catId===effectiveTop?.id ? '#EEF2FF' : '#fff',
                color: catId===effectiveTop?.id ? '#3730A3' : '#6B7280',
                cursor:'pointer', transition:'all .1s',
              }}>
              Other {effectiveTop?.name}
            </button>
          </div>
        </div>
      )}
      <ImageUpload current={preview} onFile={f => { setFile(f); setPreview(URL.createObjectURL(f)) }} label="Tap to add colour/image" />
      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12, marginBottom:12 }}>
        <div style={{ gridColumn:'span 2' }}>
          <label style={{ fontSize:12, fontWeight:600, color:'#6B7280', display:'block', marginBottom:4 }}>Material name *</label>
          <input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Laminex Natural Oak"
            style={{ width:'100%', padding:'8px 10px', border:'1px solid #DDE3EC', borderRadius:8, fontSize:13, outline:'none' }} />
        </div>
        <div>
          <label style={{ fontSize:12, fontWeight:600, color:'#6B7280', display:'block', marginBottom:4 }}>Supplier</label>
          <div style={{ padding:'8px 10px', border:'1px solid #E8ECF0', borderRadius:8, fontSize:13, color: selCat?.parent_id ? '#2A3042' : '#9CA3AF', background:'#F9FAFB' }}>
            {selCat?.parent_id ? selCat.name : (material?.supplier || '—')}
          </div>
          <div style={{ fontSize:11, color:'#9CA3AF', marginTop:3 }}>Set by subcategory selection above</div>
        </div>
        {/* grained toggle */}
        <div>
          <label style={{ fontSize:12, fontWeight:600, color:'#6B7280', display:'block', marginBottom:6 }}>Grain</label>
          <div style={{ display:'flex', gap:6 }}>
            {[{v:true,l:'Grained',icon:'🌿'},{v:false,l:'No grain',icon:'◻'}].map(opt => (
              <button key={String(opt.v)} onClick={() => setGrained(opt.v)}
                style={{ flex:1, padding:'8px 10px', borderRadius:9, border:`2px solid ${grained===opt.v?'#5B8AF0':'#E8ECF0'}`, background:grained===opt.v?'#EEF2FF':'#fff', color:grained===opt.v?'#3730A3':'#6B7280', cursor:'pointer', fontSize:12, fontWeight:700, transition:'all .1s', display:'flex', alignItems:'center', justifyContent:'center', gap:5 }}>
                <span>{opt.icon}</span> {opt.l}
              </button>
            ))}
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
                  placeholder="#cccccc"
                  style={{ flex:1, padding:'8px 10px', border:'1px solid #DDE3EC', borderRadius:8, fontSize:13, outline:'none', fontFamily:'monospace' }} />
              </div>
            ) : f.field_type === 'checkbox' ? (
              <div onClick={() => setCV(f.id, !customVals[f.id])}
                style={{ display:'flex', alignItems:'center', gap:10, padding:'9px 12px', border:`2px solid ${customVals[f.id]?'#5B8AF0':'#DDE3EC'}`, borderRadius:9, cursor:'pointer', background:customVals[f.id]?'#EEF2FF':'#fff', transition:'all .12s', userSelect:'none' }}>
                <div style={{ width:20, height:20, borderRadius:6, border:`2px solid ${customVals[f.id]?'#5B8AF0':'#C4C9D4'}`, background:customVals[f.id]?'#5B8AF0':'#fff', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0, transition:'all .12s' }}>
                  {customVals[f.id] && <span style={{ color:'#fff', fontSize:12, fontWeight:700, lineHeight:1 }}>✓</span>}
                </div>
                <span style={{ fontSize:13, fontWeight:500, color:customVals[f.id]?'#3730A3':'#6B7280' }}>
                  {customVals[f.id] ? 'Yes' : 'No'}
                </span>
              </div>
            ) : f.field_type === 'select' && f.options ? (
              <select value={customVals[f.id]||''} onChange={e => setCV(f.id, e.target.value)}
                style={{ width:'100%', padding:'8px 10px', border:'1px solid #DDE3EC', borderRadius:8, fontSize:13, outline:'none', background:'#fff', cursor:'pointer' }}>
                <option value="">— Select —</option>
                {f.options.split(',').map(o => o.trim()).filter(Boolean).map(o => (
                  <option key={o} value={o}>{o}</option>
                ))}
              </select>
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

// ── SUBCATEGORY TILE VIEW ────────────────────────────────────────
// Shows subcategory tiles for a top-level category (e.g. Panel → Laminex, Polytec…)
function SubCatView({ cat, allCats, fields, onDrillIn, onBack, onCatUpdated }) {
  const toast = useToast()
  const [subCats, setSubCats] = useState(allCats.filter(c => c.parent_id === cat.id))
  const [matCounts, setMatCounts] = useState({})
  const [topMats, setTopMats] = useState([]) // mats directly under cat (no subcat)
  const [loading, setLoading] = useState(true)
  const [showCatForm, setShowCatForm] = useState(false)
  const [editSub, setEditSub] = useState(null)

  useEffect(() => {
    const subs = allCats.filter(c => c.parent_id === cat.id)
    setSubCats(subs)
    Promise.all([
      supabase.from('materials').select('id,category_id').eq('category_id', cat.id),
      ...subs.map(s => supabase.from('materials').select('id').eq('category_id', s.id))
    ]).then(([topRes, ...subResults]) => {
      setTopMats(topRes.data || [])
      const counts = {}
      subs.forEach((s, i) => { counts[s.id] = subResults[i].data?.length || 0 })
      setMatCounts(counts)
      setLoading(false)
    })
  }, [cat.id, allCats.length])

  async function deleteSubCat(sub) {
    if (matCounts[sub.id] > 0) { toast(`Move ${matCounts[sub.id]} material(s) first`, 'error'); return }
    if (!confirm(`Delete "${sub.name}"?`)) return
    if (sub.image_path) await supabase.storage.from(BUCKET).remove([sub.image_path])
    await supabase.from('material_categories').delete().eq('id', sub.id)
    onCatUpdated(allCats.filter(c => c.id !== sub.id))
    setSubCats(p => p.filter(s => s.id !== sub.id))
    toast('Deleted')
  }

  const totalMats = topMats.length + Object.values(matCounts).reduce((a,b)=>a+b,0)

  return (
    <div>
      {(showCatForm || editSub) && (
        <CategoryForm
          category={editSub || null}
          parentId={editSub ? null : cat.id}
          parentName={editSub ? null : cat.name}
          allCats={allCats}
          onClose={() => { setShowCatForm(false); setEditSub(null) }}
          onSave={saved => {
            const updated = editSub
              ? allCats.map(c => c.id===saved.id ? saved : c)
              : [...allCats, saved]
            onCatUpdated(updated)
            setSubCats(allCats.filter(c => c.parent_id === cat.id).map(c => c.id===saved.id ? saved : c).concat(editSub ? [] : [saved]))
            setShowCatForm(false); setEditSub(null)
          }} />
      )}

      {/* breadcrumb + actions */}
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:20, flexWrap:'wrap', gap:10 }}>
        <div style={{ display:'flex', alignItems:'center', gap:8 }}>
          <button onClick={onBack} style={{ background:'none', border:'none', cursor:'pointer', fontSize:13, color:'#6B7280', display:'flex', alignItems:'center', gap:5, padding:0, fontWeight:500 }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/></svg>
            Materials
          </button>
          <span style={{ color:'#C4C9D4', fontSize:14 }}>›</span>
          <span style={{ fontSize:15, fontWeight:700, color:'#2A3042' }}>{cat.name}</span>
          <span style={{ fontSize:12, color:'#9CA3AF', background:'#F3F4F6', padding:'2px 8px', borderRadius:10 }}>{totalMats} items</span>
        </div>
        <div style={{ display:'flex', gap:8 }}>
          <Btn onClick={() => setShowCatForm(true)} style={{ fontSize:12 }}>+ Subcategory</Btn>
          <Btn onClick={() => onDrillIn(cat, null, fields)} variant="green">+ Add material</Btn>
        </div>
      </div>

      {loading ? (
        <div style={{ display:'flex', justifyContent:'center', padding:'40px 0' }}><div className="spinner" /></div>
      ) : (
        <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(200px, 1fr))', gap:14 }}>
          {/* subcategory tiles */}
          {subCats.map(sub => (
            <div key={sub.id} style={{ background:'#fff', borderRadius:16, border:'1px solid #E8ECF0', overflow:'hidden', boxShadow:'0 2px 8px rgba(0,0,0,0.06)', cursor:'pointer', transition:'all .15s', position:'relative' }}
              onClick={() => onDrillIn(cat, sub, fields)}
              onMouseEnter={e => { e.currentTarget.style.boxShadow='0 8px 24px rgba(0,0,0,0.12)'; e.currentTarget.style.transform='translateY(-2px)' }}
              onMouseLeave={e => { e.currentTarget.style.boxShadow='0 2px 8px rgba(0,0,0,0.06)'; e.currentTarget.style.transform='none' }}>
              <div style={{ width:'100%', height:120, overflow:'hidden', background: sub.image_path ? 'transparent' : 'linear-gradient(135deg, #F3F4F6 0%, #E8ECF0 100%)' }}>
                {sub.image_path
                  ? <img src={pubUrl(sub.image_path)} style={{ width:'100%', height:'100%', objectFit:'cover', display:'block' }} loading="lazy" alt="" />
                  : <div style={{ width:'100%', height:'100%', display:'flex', alignItems:'center', justifyContent:'center', fontSize:32 }}>📦</div>
                }
                {/* edit/delete overlay */}
                <div style={{ position:'absolute', top:8, right:8, display:'flex', gap:4 }} onClick={e => e.stopPropagation()}>
                  <button onClick={() => setEditSub(sub)}
                    style={{ width:26, height:26, borderRadius:7, background:'rgba(255,255,255,0.9)', border:'none', cursor:'pointer', fontSize:12, boxShadow:'0 1px 4px rgba(0,0,0,0.15)' }}>✎</button>
                  <button onClick={() => deleteSubCat(sub)}
                    style={{ width:26, height:26, borderRadius:7, background:'rgba(255,255,255,0.9)', border:'none', cursor:'pointer', fontSize:12, color:'#E24B4A', boxShadow:'0 1px 4px rgba(0,0,0,0.15)' }}>×</button>
                </div>
              </div>
              <div style={{ padding:'12px 14px' }}>
                <div style={{ fontSize:14, fontWeight:700, color:'#2A3042', marginBottom:2 }}>{sub.name}</div>
                <div style={{ fontSize:12, color:'#9CA3AF' }}>{matCounts[sub.id]||0} material{matCounts[sub.id]!==1?'s':''}</div>
              </div>
            </div>
          ))}
          {/* "all materials" tile if there are top-level mats */}
          {topMats.length > 0 && (
            <div style={{ background:'#fff', borderRadius:16, border:'1px solid #E8ECF0', overflow:'hidden', boxShadow:'0 2px 8px rgba(0,0,0,0.06)', cursor:'pointer', transition:'all .15s' }}
              onClick={() => onDrillIn(cat, null, fields)}
              onMouseEnter={e => { e.currentTarget.style.boxShadow='0 8px 24px rgba(0,0,0,0.12)'; e.currentTarget.style.transform='translateY(-2px)' }}
              onMouseLeave={e => { e.currentTarget.style.boxShadow='0 2px 8px rgba(0,0,0,0.06)'; e.currentTarget.style.transform='none' }}>
              <div style={{ width:'100%', height:120, background:'linear-gradient(135deg, #EEF2FF 0%, #E0E7FF 100%)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:32 }}>📋</div>
              <div style={{ padding:'12px 14px' }}>
                <div style={{ fontSize:14, fontWeight:700, color:'#2A3042', marginBottom:2 }}>Other {cat.name}</div>
                <div style={{ fontSize:12, color:'#9CA3AF' }}>{topMats.length} material{topMats.length!==1?'s':''}</div>
              </div>
            </div>
          )}
          {/* add subcategory tile */}
          <div onClick={() => setShowCatForm(true)}
            style={{ border:'2px dashed #E8ECF0', borderRadius:16, display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', gap:8, cursor:'pointer', minHeight:190, transition:'all .15s' }}
            onMouseEnter={e => { e.currentTarget.style.borderColor='#5B8AF0'; e.currentTarget.style.background='#F9FAFB' }}
            onMouseLeave={e => { e.currentTarget.style.borderColor='#E8ECF0'; e.currentTarget.style.background='transparent' }}>
            <div style={{ fontSize:28, opacity:0.4 }}>+</div>
            <span style={{ fontSize:13, color:'#9CA3AF', fontWeight:600 }}>Add subcategory</span>
          </div>
        </div>
      )}
    </div>
  )
}

// ── MATERIAL LIST VIEW ────────────────────────────────────────────
// Shows materials within a subcategory with field-based filters
// ── Spreadsheet cell ─────────────────────────────────────────────
function MCell({ value='', onChange, type='text', options=[], placeholder='', w=120, readOnly=false }) {
  const [editing, setEditing] = React.useState(false)
  const [val, setVal] = React.useState(value)
  const ref = React.useRef()
  React.useEffect(()=>{ setVal(value) }, [value])
  React.useEffect(()=>{ if(editing && ref.current) ref.current.focus() }, [editing])
  const commit = v => { setEditing(false); if(v!==value && !readOnly) onChange(v) }

  const base = { width:w, minWidth:w, maxWidth:w, height:36, padding:'0 8px',
    display:'flex', alignItems:'center', borderRight:'1px solid #E8ECF0',
    fontSize:12, flexShrink:0, boxSizing:'border-box', overflow:'hidden' }

  if (type==='select') return (
    <div style={base}>
      <select value={val} onChange={e=>{ setVal(e.target.value); commit(e.target.value) }}
        disabled={readOnly}
        style={{ width:'100%', border:'none', outline:'none', background:'transparent', fontSize:12, cursor:'pointer', color:'#374151' }}>
        {options.map(o=><option key={o}>{o}</option>)}
      </select>
    </div>
  )

  if (type==='colour') return (
    <div style={{...base, gap:6, cursor:'text'}} onClick={()=>!readOnly&&setEditing(true)}>
      {val && <div style={{ width:18, height:18, borderRadius:4, background:val, flexShrink:0, border:'1px solid rgba(0,0,0,0.1)' }} />}
      {editing
        ? <input ref={ref} value={val} onChange={e=>setVal(e.target.value)}
            onBlur={e=>commit(e.target.value)} onKeyDown={e=>{if(e.key==='Enter')commit(val)}}
            style={{ flex:1, border:'none', outline:'none', background:'transparent', fontSize:12 }} />
        : <span style={{ color:val?'#374151':'#C4C9D4', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', flex:1 }}>{val||placeholder}</span>
      }
    </div>
  )

  if (type==='checkbox') return (
    <div style={{...base, justifyContent:'center', cursor:'pointer'}} onClick={()=>!readOnly&&onChange(!value)}>
      <div style={{ width:18, height:18, borderRadius:5, border:`2px solid ${value?'#5B8AF0':'#C4C9D4'}`, background:value?'#5B8AF0':'#fff', display:'flex', alignItems:'center', justifyContent:'center', transition:'all .12s' }}>
        {value && <span style={{ color:'#fff', fontSize:11, fontWeight:700, lineHeight:1 }}>✓</span>}
      </div>
    </div>
  )

  if (type==='number') return (
    <div style={{...base, cursor:readOnly?'default':'text'}} onClick={()=>!readOnly&&setEditing(true)}>
      {editing
        ? <input ref={ref} type="number" value={val}
            onChange={e=>setVal(e.target.value)}
            onBlur={e=>commit(e.target.value)}
            onKeyDown={e=>{if(e.key==='Enter'||e.key==='Tab')commit(val)}}
            style={{ flex:1, border:'none', outline:'none', background:'transparent', fontSize:12 }} />
        : <span style={{ color:val?'#374151':'#C4C9D4' }}>{val||placeholder}</span>
      }
    </div>
  )

  if (type==='mm') return (
    <div style={{...base, cursor:readOnly?'default':'text'}} onClick={()=>!readOnly&&setEditing(true)}>
      {editing
        ? <div style={{ display:'flex', alignItems:'center', width:'100%', gap:2 }}>
            <input ref={ref} type="number" step="0.1" min="0" value={val}
              onChange={e=>setVal(e.target.value)}
              onBlur={e=>commit(e.target.value)}
              onKeyDown={e=>{if(e.key==='Enter'||e.key==='Tab')commit(val)}}
              style={{ flex:1, border:'none', outline:'none', background:'transparent', fontSize:12 }} />
            <span style={{ color:'#9CA3AF', fontSize:11, flexShrink:0 }}>mm</span>
          </div>
        : <span style={{ color:val?'#374151':'#C4C9D4' }}>
            {val ? `${val}mm` : <span style={{ color:'#C4C9D4' }}>— mm</span>}
          </span>
      }
    </div>
  )

  if (type==='price') return (
    <div style={{...base, cursor:readOnly?'default':'text'}} onClick={()=>!readOnly&&setEditing(true)}>
      {editing
        ? <div style={{ display:'flex', alignItems:'center', width:'100%' }}>
            <span style={{ color:'#9CA3AF', fontSize:12, marginRight:2 }}>$</span>
            <input ref={ref} type="number" step="0.01" min="0" value={val}
              onChange={e=>setVal(e.target.value)}
              onBlur={e=>{ const v=parseFloat(e.target.value||0).toFixed(2); setVal(v); commit(v) }}
              onKeyDown={e=>{if(e.key==='Enter'||e.key==='Tab'){const v=parseFloat(val||0).toFixed(2);setVal(v);commit(v)}}}
              style={{ flex:1, border:'none', outline:'none', background:'transparent', fontSize:12 }} />
          </div>
        : <span style={{ color:val&&val!=='0.00'?'#374151':'#C4C9D4', whiteSpace:'nowrap' }}>
            {val && val!=='0.00' ? `$${parseFloat(val).toFixed(2)}` : placeholder}
          </span>
      }
    </div>
  )

  return (
    <div style={{...base, cursor:readOnly?'default':'text', color:val?'#374151':'#C4C9D4'}} onClick={()=>!readOnly&&setEditing(true)}>
      {editing
        ? <input ref={ref} value={val} onChange={e=>setVal(e.target.value)}
            onBlur={e=>commit(e.target.value)} onKeyDown={e=>{if(e.key==='Enter'||e.key==='Tab')commit(val)}}
            placeholder={placeholder}
            style={{ width:'100%', border:'none', outline:'none', background:'transparent', fontSize:12 }} />
        : <span style={{ overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', width:'100%' }}>{val||placeholder}</span>
      }
    </div>
  )
}

// ── Image upload cell ─────────────────────────────────────────────
function ImageCell({ storagePath, matId, onUpdated, w=60 }) {
  const toast = useToast()
  const fileRef = React.useRef()
  const [uploading, setUploading] = React.useState(false)
  const url = storagePath ? pubUrl(storagePath) : null

  async function handleFile(e) {
    const file = e.target.files[0]; if (!file) return
    setUploading(true)
    const path = `materials/${matId}_${Date.now()}.jpg`
    const { error } = await supabase.storage.from(BUCKET).upload(path, file, { contentType: file.type, upsert:true })
    if (error) { toast(error.message,'error'); setUploading(false); return }
    await supabase.from('materials').update({ storage_path: path }).eq('id', matId)
    onUpdated(path)
    setUploading(false)
    toast('Image uploaded ✓')
  }

  return (
    <div style={{ width:w, minWidth:w, maxWidth:w, height:36, display:'flex', alignItems:'center', justifyContent:'center', borderRight:'1px solid #E8ECF0', flexShrink:0, cursor:'pointer', position:'relative' }}
      onClick={()=>fileRef.current?.click()} title="Click to upload image">
      <input ref={fileRef} type="file" accept="image/*" onChange={handleFile} style={{ display:'none' }} />
      {uploading
        ? <div style={{ width:24, height:24, borderRadius:4, background:'#F3F4F6', display:'flex', alignItems:'center', justifyContent:'center' }}><div className="spinner" style={{ width:12, height:12, borderWidth:2 }} /></div>
        : url
        ? <img src={url} style={{ width:28, height:28, borderRadius:5, objectFit:'cover', border:'1px solid #E8ECF0' }} alt="" />
        : <div style={{ width:28, height:28, borderRadius:5, background:'#F3F4F6', border:'1px dashed #DDE3EC', display:'flex', alignItems:'center', justifyContent:'center', fontSize:14, color:'#C4C9D4' }}>+</div>
      }
    </div>
  )
}

function MaterialListView({ topCat, subCat, fields, allCats, onBack, onCatUpdated }) {
  const toast = useToast()
  const targetCat = subCat || topCat
  const [materials, setMaterials] = React.useState([])
  const [loading, setLoading]     = React.useState(true)
  const [catFields, setCatFields] = React.useState(fields || [])
  const [search, setSearch]       = React.useState('')
  const [saving, setSaving]       = React.useState(false)
  const [lastSaved, setLastSaved] = React.useState(null)
  const [showFieldMgr, setShowFieldMgr] = React.useState(false)
  const saveTimer = React.useRef()

  // All possible native + standard columns
  const ALL_COLS = [
    { key:'img',          label:'Image',          w:60,  type:'image' },
    { key:'name',         label:'Name',           w:180, type:'text',   required:true,  always:false },
    { key:'category_name',label:'Category',       w:120, type:'category', settingKey:'category_name' },
    { key:'supplier',     label:'Supplier',        w:130, type:'text',   settingKey:'supplier' },
    { key:'brand',        label:'Brand',           w:110, type:'text',   settingKey:'brand' },
    { key:'sku',          label:'SKU',             w:110, type:'text',   settingKey:'sku' },
    { key:'panel_type',   label:'Panel type',      w:110, type:'text',   settingKey:'panel_type' },
    { key:'thickness',    label:'Thickness',       w:90,  type:'mm',     settingKey:'thickness' },
    { key:'colour_code',  label:'Colour',          w:110, type:'text',   settingKey:'colour_code' },
    { key:'finish',       label:'Finish',          w:110, type:'text',   settingKey:'finish' },
    { key:'grade',        label:'Grade',           w:100, type:'text',   settingKey:'grade' },
    { key:'edge_profile', label:'Edge profile',    w:110, type:'text',   settingKey:'edge_profile' },
    { key:'dimensions',   label:'Dimensions',      w:130, type:'text',   settingKey:'dimensions', placeholder:'e.g. 2400×1220' },
    { key:'weight',       label:'Weight (kg)',      w:90,  type:'text',   settingKey:'weight' },
    { key:'price',        label:'Price',           w:90,  type:'price',  settingKey:'price', placeholder:'0.00' },
    { key:'unit',         label:'Unit',            w:90,  type:'text',   settingKey:'unit' },
    { key:'qty',          label:'Default qty',     w:80,  type:'text',   settingKey:'qty' },
    { key:'lead_time',    label:'Lead time',       w:90,  type:'text',   settingKey:'lead_time' },
    { key:'min_order',    label:'Min order',       w:90,  type:'text',   settingKey:'min_order' },
    { key:'po_number',    label:'PO number',       w:110, type:'text',   settingKey:'po_number' },
    { key:'notes',        label:'Notes',           w:160, type:'text',   settingKey:'notes' },
  ]

  const [catVisibility, setCatVisibility] = React.useState(null)
  const [primaryField, setPrimaryField] = React.useState('name')
  useEffect(() => {
    Promise.all([
      supabase.from('app_settings').select('value').eq('key', `mat_cat_fields_${targetCat.id}`).maybeSingle(),
      supabase.from('app_settings').select('value').eq('key', `mat_primary_field_${targetCat.id}`).maybeSingle(),
    ]).then(([{ data: cfg }, { data: pf }]) => {
      if (cfg?.value) setCatVisibility(new Set(JSON.parse(cfg.value)))
      else setCatVisibility(new Set(['supplier','panel_type','thickness','colour_code','finish','price','notes']))
      if (pf?.value) setPrimaryField(pf.value)
      else setPrimaryField('name')
    })
  }, [targetCat.id])

  // Column definitions — filtered by category visibility settings
  const coreCols = React.useMemo(() => {
    if (!catVisibility) return ALL_COLS.filter(c => c.always || c.type === 'image')
    const visible = ALL_COLS.filter(c =>
      c.type === 'image' ||
      c.key === primaryField ||  // always show primary field
      (c.key === 'category_name' && (allCats||[]).filter(c2 => c2.parent_id === targetCat.id).length > 0) ||
      (c.settingKey && c.settingKey !== 'category_name' && catVisibility.has(c.settingKey))
    )
    // Sort: image first, then primary field, then rest
    return [
      ...visible.filter(c => c.type === 'image'),
      ...visible.filter(c => c.key === primaryField && c.type !== 'image'),
      ...visible.filter(c => c.key !== primaryField && c.type !== 'image'),
    ]
  }, [catVisibility, allCats, targetCat.id, primaryField])

  const customCols = React.useMemo(() => {
    const standardLabels = new Set(ALL_COLS.map(c => c.label.toLowerCase()))
    const standardKeys   = new Set(ALL_COLS.map(c => c.key.toLowerCase()))
    return catFields
      .filter(f => {
        const label = (f.label||'').toLowerCase()
        // Skip if this custom field duplicates a standard column by label or key
        return !standardLabels.has(label) && !standardKeys.has(label.replace(/\s+/g,'_'))
      })
      .map(f => ({
        key: `custom_${f.id}`, label: f.label, w: 110,
        type: f.field_type === 'checkbox' ? 'checkbox' :
              f.field_type === 'select'   ? 'select' : 'text',
        options: f.options ? f.options.split(',').map(o=>o.trim()) : [],
        fieldId: f.id,
      }))
  }, [catFields])

  const [cols, setCols]           = React.useState([...coreCols, ...customCols])
  const [hoveredMatId, setHoveredMatId] = React.useState(null)
  React.useEffect(() => { setCols([...coreCols, ...customCols]) }, [coreCols, customCols])
  const { getHeaderProps } = useDragColumns(cols, setCols)

  useEffect(() => {
    if (!targetCat?.id) return
    setLoading(true)
    setMaterials([])

    // Clear any stale cache
    try { Object.keys(sessionStorage).filter(k=>k.startsWith('mat_list_')).forEach(k=>sessionStorage.removeItem(k)) } catch {}

    function getDescendantIds(catId, cats) {
      const children = cats.filter(c => c.parent_id === catId)
      return [catId, ...children.flatMap(c => getDescendantIds(c.id, cats))]
    }
    const ids = getDescendantIds(targetCat.id, allCats || []).filter(Boolean)
    console.log('Loading materials, catId:', targetCat.id, 'ids:', ids)

    const q = ids.length === 1
      ? supabase.from('materials').select('*').eq('category_id', ids[0])
      : supabase.from('materials').select('*').in('category_id', ids)
    q.order('name').then(({ data, error }) => {
      console.log('Materials result:', data?.length, 'error:', error?.message)
      setMaterials(data || [])
      setLoading(false)
    })

    supabase.from('category_fields').select('*')
      .eq('category_id', targetCat.id).order('sort_order')
      .then(({ data }) => setCatFields(data || []))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [targetCat.id, (allCats||[]).length])

  const filtered = materials.filter(m => {
    if (!search) return true
    const q = search.toLowerCase()
    // Search native columns
    const nativeMatch = [m.name, m.supplier, m.panel_type, m.thickness,
      m.colour_code, m.finish, m.notes, m.sku, m.price]
      .some(v => v && String(v).toLowerCase().includes(q))
    if (nativeMatch) return true
    // Search all custom_fields values
    const cf = safeJSON(m.custom_fields)
    return Object.values(cf).some(v => v && String(v).toLowerCase().includes(q))
  })

  function triggerSave(updated) {
    clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(() => doSave(updated), 1500)
  }

  async function doSave(mats) {
    setSaving(true)
    // Only send columns that exist in the materials table
    const DB_FIELDS = new Set(['id','name','supplier','panel_type','thickness',
      'colour_code','finish','price','sku','notes','storage_path',
      'category_id','created_at','updated_at',
      'grained','weight','dimensions','unit','qty','lead_time','min_order','po_number'])
    const toUpsert = mats.map(m => {
      const row = { category_id: m.category_id || targetCat.id }
      Object.keys(m).forEach(k => {
        if (DB_FIELDS.has(k) && m[k] !== undefined) row[k] = m[k]
      })
      return row
    })
    const { error } = await supabase.from('materials').upsert(toUpsert, { onConflict:'id' })
    if (error) { console.error('Save error:', error.message); toast(error.message, 'error') }
    else setLastSaved(new Date())
    setSaving(false)
  }

  function updateMat(id, patch) {
    setMaterials(prev => {
      const updated = prev.map(m => {
        if (m.id !== id) return m
        if (patch._customFieldId) {
          const cf = safeJSON(m.custom_fields)
          return { ...m, custom_fields: JSON.stringify({ ...cf, [patch._customFieldId]: patch._value }) }
        }
        return { ...m, ...patch }
      })
      // Save just the changed row directly — much safer than upserting all
      const changed = updated.find(m => m.id === id)
      if (changed) triggerSaveSingle(changed, patch)
      return updated
    })
  }

  function triggerSaveSingle(mat, patch) {
    clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(() => doSaveSingle(mat, patch), 1500)
  }

  async function doSaveSingle(mat, patch) {
    setSaving(true)
    // Build minimal patch — only the changed field(s)
    const NATIVE = new Set(['name','supplier','panel_type','thickness','colour_code','finish','price','sku','notes','storage_path','category_id'])
    let dbPatch = {}
    if (patch._customFieldId) {
      // custom_fields column may not exist — skip silently
      console.warn('custom_fields column not available — skipping custom field save')
      setSaving(false); return
    } else {
      // Only include fields that are native DB columns
      Object.keys(patch).forEach(k => { if (NATIVE.has(k)) dbPatch[k] = patch[k] })
      // Non-native fields — skip (custom_fields column may not exist in DB)
      const nonNativeKeys = Object.keys(patch).filter(k => !NATIVE.has(k) && k !== '_customFieldId')
      if (nonNativeKeys.length) {
        console.warn('Skipping non-native fields:', nonNativeKeys)
      }
    }
    if (!Object.keys(dbPatch).length) { setSaving(false); return }
    // Convert thickness to number if present
    if (dbPatch.thickness !== undefined) dbPatch.thickness = parseFloat(dbPatch.thickness) || null
    const { error } = await supabase.from('materials').update(dbPatch).eq('id', mat.id)
    if (error) { console.error('Save error:', error.message, 'patch:', dbPatch); toast(error.message, 'error') }
    else {
      setLastSaved(new Date())
      // Invalidate session cache for this category
      try {
        Object.keys(sessionStorage).filter(k => k.startsWith('mat_list_')).forEach(k => sessionStorage.removeItem(k))
      } catch {}
    }
    setSaving(false)
  }

  async function addRow() {
    const tmp = { id: 'new_' + Date.now(), name:'', supplier:'', panel_type:'', thickness:'', colour_code:'', finish:'', notes:'', custom_fields:'{}', category_id: targetCat.id }
    // Insert immediately so we have a real id for image upload
    const { data, error } = await supabase.from('materials').insert({ name:'New material', category_id: targetCat.id }).select().single()
    if (error) { toast(error.message,'error'); return }
    setMaterials(prev => [...prev, data])
    toast('Row added — click cells to edit')
  }

  async function deleteRow(id) {
    if (!confirm('Delete this material?')) return
    await supabase.from('materials').delete().eq('id', id)
    setMaterials(prev => prev.filter(m => m.id !== id))
    toast('Deleted')
  }

  const totalW = cols.reduce((a,c)=>a+c.w, 0) + 36 + 40 // + drag + actions

  return (
    <div>
      {showFieldMgr && (
        <FieldManager catId={targetCat.id} catName={targetCat.name} fields={catFields}
          onClose={() => setShowFieldMgr(false)}
          onChanged={updated => setCatFields(updated)} />
      )}

      {/* breadcrumb + actions */}
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:16, flexWrap:'wrap', gap:10 }}>
        <div style={{ display:'flex', alignItems:'center', gap:8, flexWrap:'wrap' }}>
          <button onClick={() => onBack('top')} style={{ background:'none', border:'none', cursor:'pointer', fontSize:13, color:'#6B7280', display:'flex', alignItems:'center', gap:5, padding:0 }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/></svg>
            Materials
          </button>
          {subCat && <>
            <span style={{ color:'#C4C9D4' }}>›</span>
            <button onClick={() => onBack('sub')} style={{ background:'none', border:'none', cursor:'pointer', fontSize:13, color:'#6B7280', padding:0 }}>{topCat.name}</button>
          </>}
          <span style={{ color:'#C4C9D4' }}>›</span>
          <span style={{ fontSize:15, fontWeight:700, color:'#2A3042' }}>{targetCat.name}</span>
          <span style={{ fontSize:12, color:'#9CA3AF', background:'#F3F4F6', padding:'2px 8px', borderRadius:10 }}>{filtered.length}{filtered.length!==materials.length?`/${materials.length}`:''}</span>
        </div>
        <div style={{ display:'flex', gap:8, alignItems:'center', flexWrap:'wrap' }}>
          {saving ? <span style={{ fontSize:11, color:'#9CA3AF' }}>Saving…</span>
            : lastSaved ? <span style={{ fontSize:11, color:'#9CA3AF' }}>Saved {lastSaved.toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'})}</span>
            : null}
          <Btn onClick={()=>doSave(materials)} style={{ fontSize:12, background:'#ECFDF5', color:'#065F46', border:'1px solid #6EE7B7' }}>💾 Save</Btn>
          <Btn onClick={() => setShowFieldMgr(true)} style={{ fontSize:12 }}>⚙ Fields</Btn>
          <Btn onClick={addRow} variant="green">+ Add material</Btn>
        </div>
      </div>

      {/* search */}
      <div style={{ position:'relative', marginBottom:12, maxWidth:300 }}>
        <span style={{ position:'absolute', left:10, top:'50%', transform:'translateY(-50%)', color:'#9CA3AF', fontSize:14, pointerEvents:'none' }}>⌕</span>
        <input value={search} onChange={e=>setSearch(e.target.value)} placeholder={`Search ${targetCat.name}…`}
          style={{ width:'100%', padding:'8px 10px 8px 32px', border:'1px solid #DDE3EC', borderRadius:9, fontSize:13, outline:'none', boxSizing:'border-box' }} />
      </div>

      {loading ? (
        <div style={{ display:'flex', justifyContent:'center', padding:'40px 0' }}><div className="spinner" /></div>
      ) : (
        <div style={{ overflowX:'auto', borderRadius:12, border:'1px solid #E8ECF0', boxShadow:'0 1px 3px rgba(0,0,0,0.04)' }}>
          <div style={{ minWidth: totalW }}>

            {/* header */}
            <div style={{ display:'flex', background:'#F9FAFB', borderBottom:'2px solid #E8ECF0', position:'sticky', top:0, zIndex:10 }}>
              <div style={{ width:36, flexShrink:0, borderRight:'1px solid #E8ECF0' }} />
              {cols.map((col,ci) => (
                <div key={col.key}
                  {...(col.key !== 'img' ? getHeaderProps(ci, col.label, {
                    width:col.w, minWidth:col.w, padding:'9px 8px',
                    fontSize:10, fontWeight:700,
                    color: col.key===primaryField ? '#5B8AF0' : '#9CA3AF',
                    background: col.key===primaryField ? '#EEF2FF' : 'transparent',
                    textTransform:'uppercase', letterSpacing:'.06em',
                    borderRight:'1px solid #E8ECF0', flexShrink:0,
                    boxSizing:'border-box', display:'flex', alignItems:'center', gap:4,
                    position:'relative',
                  }) : {
                    style:{ width:col.w, minWidth:col.w, padding:'9px 8px',
                      fontSize:10, fontWeight:700, color:'#9CA3AF',
                      textTransform:'uppercase', letterSpacing:'.06em',
                      borderRight:'1px solid #E8ECF0', flexShrink:0,
                      boxSizing:'border-box', position:'relative' }
                  })}
                  className="mat-col-header">
                  {col.key===primaryField
                    ? <span style={{ fontSize:10, color:'#5B8AF0' }}>★</span>
                    : col.key!=='img' && <svg width="8" height="10" viewBox="0 0 8 10" fill="#C4C9D4"><circle cx="2" cy="2" r="1.2"/><circle cx="6" cy="2" r="1.2"/><circle cx="2" cy="5" r="1.2"/><circle cx="6" cy="5" r="1.2"/><circle cx="2" cy="8" r="1.2"/><circle cx="6" cy="8" r="1.2"/></svg>
                  }
                  {col.label}
                  {/* Set primary button — visible on hover, hidden for img column */}
                  {col.key !== 'img' && col.key !== primaryField && (
                    <button
                      onClick={e => {
                        e.stopPropagation()
                        const settingsKey = `mat_primary_field_${targetCat.id}`
                        setPrimaryField(col.key)
                        supabase.from('app_settings')
                          .upsert({ key: settingsKey, value: col.key, updated_at: new Date().toISOString() }, { onConflict: 'key' })
                          .then(({ error }) => {
                            if (error) {
                              console.error('Primary field save error:', error.message)
                              // Try insert then update as fallback
                              supabase.from('app_settings').insert({ key: settingsKey, value: col.key })
                                .then(({ error: ie }) => {
                                  if (ie) supabase.from('app_settings').update({ value: col.key }).eq('key', settingsKey)
                                })
                            } else {
                              console.log('Primary field saved:', col.key)
                            }
                          })
                      }}
                      title="Set as primary display field"
                      style={{ marginLeft:'auto', opacity:0, background:'none', border:'none',
                        cursor:'pointer', fontSize:11, color:'#9CA3AF', padding:'0 2px',
                        transition:'opacity .15s', flexShrink:0 }}
                      className="set-primary-btn">
                      ☆
                    </button>
                  )}
                </div>
              ))}
              <div style={{ width:40, flexShrink:0 }} />
            </div>
            <style>{`.mat-col-header:hover .set-primary-btn { opacity: 1 !important; color: #5B8AF0 !important; }`}</style>

            {/* rows */}
            {filtered.length === 0 ? (
              <div style={{ padding:'40px 0', textAlign:'center', color:'#9CA3AF', fontSize:13 }}>
                {materials.length===0 ? 'No materials yet — click + Add material' : 'No results'}
              </div>
            ) : filtered.map((m, idx) => {
              const cf = safeJSON(m.custom_fields)
              const NON_NATIVE = ['brand','sku','colour','grade','edge_profile','dimensions','weight','unit','qty','lead_time','min_order','po_number']
              const getVal = (key) => NON_NATIVE.includes(key) ? (cf[key]||'') : (m[key]||'')
              const primaryVal = getVal(primaryField)
              const primaryLabel = ALL_COLS.find(c=>c.key===primaryField)?.label || primaryField

              // Build secondary details — all visible fields except primary and image
              const secondaryFields = cols
                .filter(c => c.key !== primaryField && c.type !== 'image' && c.key !== 'category_name')
                .map(c => {
                  const v = c.fieldId ? (cf[c.fieldId]||'') : getVal(c.key)
                  return v ? { label: c.label, value: v } : null
                }).filter(Boolean).slice(0, 6)
              return (
                <div key={m.id}
                  style={{ display:'flex', alignItems:'center', background: idx%2===0?'#fff':'#FAFAFA', borderBottom:'1px solid #F3F4F6', position:'relative' }}
                  onMouseEnter={() => { setHoveredMatId(m.id) }}
                  onMouseLeave={() => { setHoveredMatId(null) }}>

                  {/* Hover info panel */}
                  {hoveredMatId === m.id && (primaryVal || secondaryFields.length > 0) && (
                    <div style={{
                      position:'fixed', zIndex:999, background:'#1E2535', borderRadius:10,
                      padding:'10px 14px', minWidth:180, maxWidth:260, pointerEvents:'none',
                      boxShadow:'0 8px 24px rgba(0,0,0,0.3)',
                      transform:'translateX(8px)',
                      right:16, top:'auto',
                    }}>
                      {primaryVal && (
                        <div style={{ marginBottom: secondaryFields.length ? 8 : 0 }}>
                          <span style={{ fontSize:9, fontWeight:700, color:'#9CA3AF', textTransform:'uppercase', letterSpacing:'.06em', display:'block', marginBottom:2 }}>{primaryLabel}</span>
                          <span style={{ fontSize:14, fontWeight:800, color:'#fff' }}>{primaryVal}</span>
                        </div>
                      )}
                      {secondaryFields.map(f => (
                        <div key={f.label} style={{ display:'flex', justifyContent:'space-between', gap:8, marginBottom:3 }}>
                          <span style={{ fontSize:10, color:'#9CA3AF', flexShrink:0 }}>{f.label}</span>
                          <span style={{ fontSize:11, color:'#E2E8F0', fontWeight:600, textAlign:'right', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', maxWidth:140 }}>{f.value}</span>
                        </div>
                      ))}
                    </div>
                  )}
                  <div style={{ width:36, height:36, display:'flex', alignItems:'center', justifyContent:'center', color:'#D1D5DB', fontSize:12, cursor:'grab', flexShrink:0, borderRight:'1px solid #E8ECF0' }}>⠿</div>
                  {cols.map(col => {
                    if (col.type === 'image') return (
                      <ImageCell key={col.key} storagePath={m.storage_path} matId={m.id} w={col.w}
                        onUpdated={path => setMaterials(prev=>prev.map(x=>x.id===m.id?{...x,storage_path:path}:x))} />
                    )
                    // Category — grouped dropdown showing parent > subcategory hierarchy
                    if (col.key === 'category_name') {
                      const topLevelCats = (allCats||[]).filter(c => !c.parent_id)
                      return (
                        <div key={col.key} style={{ width:col.w, minWidth:col.w, height:36, display:'flex', alignItems:'center', borderRight:'1px solid #E8ECF0', flexShrink:0, boxSizing:'border-box', padding:'0 8px' }}>
                          <select value={m.category_id||''} onChange={e => updateMat(m.id, { category_id: e.target.value })}
                            style={{ width:'100%', border:'none', outline:'none', background:'transparent', fontSize:12, cursor:'pointer', color:'#374151' }}>
                            <option value="">— No category —</option>
                            {topLevelCats.map(parent => {
                              const children = (allCats||[]).filter(c => c.parent_id === parent.id)
                              if (children.length === 0) return (
                                <option key={parent.id} value={parent.id}>{parent.name}</option>
                              )
                              return (
                                <optgroup key={parent.id} label={parent.name}>
                                  {children.map(child => (
                                    <option key={child.id} value={child.id}>{child.name}</option>
                                  ))}
                                </optgroup>
                              )
                            })}
                          </select>
                        </div>
                      )
                    }
                    if (col.fieldId) {
                      return (
                        <MCell key={col.key} value={cf[col.fieldId]??''} w={col.w}
                          type={col.type} options={col.options} placeholder={col.label}
                          onChange={v=>updateMat(m.id,{_customFieldId:col.fieldId,_value:v})} />
                      )
                    }
                    const isNonNative = NON_NATIVE.includes(col.key)
                    const val = isNonNative ? (cf[col.key]??'') : (m[col.key]??'')
                    return (
                      <MCell key={col.key} value={val} w={col.w}
                        type={col.type} placeholder={col.placeholder||col.label}
                        onChange={v => isNonNative
                          ? updateMat(m.id, { custom_fields: JSON.stringify({ ...cf, [col.key]: v }) })
                          : updateMat(m.id, { [col.key]: v })
                        } />
                    )
                  })}
                  <div style={{ width:40, display:'flex', alignItems:'center', justifyContent:'center', height:36, flexShrink:0 }}>
                    <button onClick={()=>deleteRow(m.id)}
                      style={{ background:'none', border:'none', cursor:'pointer', color:'#D1D5DB', fontSize:16, lineHeight:1, padding:'2px 4px', borderRadius:4 }}
                      onMouseEnter={e=>e.currentTarget.style.color='#E24B4A'}
                      onMouseLeave={e=>e.currentTarget.style.color='#D1D5DB'}>×</button>
                  </div>
                </div>
              )
            })}

            {/* add row */}
            <div onClick={addRow}
              style={{ padding:'8px 16px', fontSize:12, color:'#9CA3AF', cursor:'pointer', borderTop:'1px solid #F3F4F6', display:'flex', alignItems:'center', gap:6, background:'#FAFAFA' }}
              onMouseEnter={e=>e.currentTarget.style.background='#F3F4F6'}
              onMouseLeave={e=>e.currentTarget.style.background='#FAFAFA'}>
              <span style={{ fontSize:16 }}>+</span> Add material
            </div>
          </div>
        </div>
      )}
    </div>
  )
}



// ── Main export ───────────────────────────────────────────────────
export default function Materials() {
  const location = useLocation()
  const [stack, setStack]               = useState([])
  const [allCats, setAllCats]           = useState([])
  const [loading, setLoading]           = useState(true)
  const [showAllInCat, setShowAllInCat] = useState(false)
  const [viewMode, setViewMode]         = useState(() => localStorage.getItem('mat_view_mode') || 'tile')
  const [globalSearch, setGlobalSearch] = useState('')
  const [globalResults, setGlobalResults] = useState([])
  const [globalLoading, setGlobalLoading] = useState(false)
  const searchTimer = useRef()
  const toast = useToast()

  // Reset to top level whenever user navigates to /materials (sidebar click)
  useEffect(() => {
    setStack([])
    setShowAllInCat(false)
    setGlobalSearch('')
    setGlobalResults([])
  }, [location.key])

  useEffect(() => {
    supabase.from('material_categories').select('*').order('name')
      .then(({ data }) => { setAllCats(data || []); setLoading(false) })
  }, [])

  function pushCat(cat)  { setStack(s => [...s, cat.id]); setShowAllInCat(false) }
  function popStack()    { setStack(s => s.slice(0, -1)); setShowAllInCat(false) }
  function goToDepth(d)  { setStack(s => s.slice(0, d));  setShowAllInCat(false) }

  function handleGlobalSearch(val) {
    setGlobalSearch(val)
    clearTimeout(searchTimer.current)
    if (!val.trim()) { setGlobalResults([]); return }
    setGlobalLoading(true)
    searchTimer.current = setTimeout(async () => {
      const { data } = await supabase.from('materials').select('*').ilike('name', `%${val}%`).order('name').limit(50)
      setGlobalResults(data || [])
      setGlobalLoading(false)
    }, 300)
  }

  if (loading) return <div style={{ display:'flex', justifyContent:'center', padding:'60px 0' }}><div className="spinner" /></div>

  const currentCatId = stack[stack.length - 1] || null
  const currentCat   = allCats.find(c => c.id === currentCatId) || null
  const children     = allCats.filter(c => c.parent_id === currentCatId)

  if (currentCat && (children.length === 0 || showAllInCat)) {
    const topCat = allCats.find(c => c.id === stack[0]) || currentCat
    return (
      <MaterialListView
        topCat={topCat}
        subCat={currentCat.id !== topCat.id ? currentCat : null}
        fields={[]} allCats={allCats}
        onBack={() => { setShowAllInCat(false); if (children.length === 0) popStack() }}
        onCatUpdated={updated => setAllCats(prev => prev.map(c => c.id===updated.id ? updated : c))} />
    )
  }

  // Breadcrumb
  const breadcrumbCats = stack.map(id => allCats.find(c => c.id === id)).filter(Boolean)

  return (
    <div>
      {/* Global search */}
      <div style={{ position:'relative', marginBottom:16 }}>
        <svg style={{ position:'absolute', left:12, top:'50%', transform:'translateY(-50%)', pointerEvents:'none' }}
          width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#9CA3AF" strokeWidth="2">
          <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
        </svg>
        <input value={globalSearch} onChange={e => handleGlobalSearch(e.target.value)}
          placeholder="Search all materials…"
          style={{ width:'100%', padding:'10px 12px 10px 36px', border:'1px solid #DDE3EC', borderRadius:10, fontSize:13, outline:'none', boxSizing:'border-box', background:'#fff' }} />
        {globalSearch && (
          <button onClick={() => { setGlobalSearch(''); setGlobalResults([]) }}
            style={{ position:'absolute', right:10, top:'50%', transform:'translateY(-50%)', background:'none', border:'none', cursor:'pointer', color:'#9CA3AF', fontSize:18 }}>×</button>
        )}
      </div>

      {/* Global search results */}
      {globalSearch && (
        <div style={{ marginBottom:20 }}>
          {globalLoading ? (
            <div style={{ textAlign:'center', padding:'20px 0', color:'#9CA3AF' }}>Searching…</div>
          ) : globalResults.length === 0 ? (
            <div style={{ textAlign:'center', padding:'20px 0', color:'#9CA3AF' }}>No materials found for "{globalSearch}"</div>
          ) : (
            <div>
              <div style={{ fontSize:12, fontWeight:600, color:'#9CA3AF', marginBottom:8 }}>{globalResults.length} result{globalResults.length!==1?'s':''}</div>
              <div style={{ background:'#fff', borderRadius:12, border:'1px solid #E8ECF0', overflow:'hidden' }}>
                {globalResults.map((m, i) => (
                  <div key={m.id}
                    onClick={() => {
                      const cat = allCats.find(c => c.id === m.category_id)
                      if (cat) {
                        const parent = allCats.find(c => c.id === cat.parent_id)
                        if (parent) setStack([parent.id, cat.id])
                        else setStack([cat.id])
                        setGlobalSearch(''); setGlobalResults([])
                      }
                    }}
                    style={{ display:'flex', alignItems:'center', gap:12, padding:'10px 14px', borderBottom: i < globalResults.length-1 ? '1px solid #F3F4F6' : 'none', cursor: m.category_id ? 'pointer' : 'default' }}
                    onMouseEnter={e => { if (m.category_id) e.currentTarget.style.background='#F9FAFB' }}
                    onMouseLeave={e => e.currentTarget.style.background='transparent'}>
                    <div style={{ width:36, height:36, borderRadius:8, background:m.color||'#E8ECF0', flexShrink:0, overflow:'hidden' }}>
                      {m.storage_path && <img src={`https://awwfqwxbqquknigvsoox.supabase.co/storage/v1/object/public/job-files/${m.storage_path}`} style={{ width:'100%', height:'100%', objectFit:'cover' }} alt="" />}
                    </div>
                    <div style={{ flex:1, minWidth:0 }}>
                      <div style={{ fontSize:13, fontWeight:600, color:'#2A3042' }}>{m.name}</div>
                      <div style={{ fontSize:11, color:'#9CA3AF' }}>
                        {[m.supplier, m.panel_type, m.thickness ? m.thickness+'mm' : null].filter(Boolean).join(' · ')}
                        {m.category_id && <span style={{ marginLeft:6, color:'#C4D4F8' }}>· {allCats.find(c=>c.id===m.category_id)?.name}</span>}
                      </div>
                    </div>
                    {m.price && <span style={{ fontSize:12, fontWeight:600, color:'#374151' }}>${m.price}</span>}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {!globalSearch && <>
      {/* Breadcrumb */}
      <div style={{ display:'flex', alignItems:'center', gap:6, marginBottom:20, flexWrap:'wrap' }}>
        <button onClick={() => setStack([])} style={{ background:'none', border:'none', cursor:'pointer', fontSize:13, color: stack.length===0 ? '#2A3042' : '#6B7280', fontWeight: stack.length===0 ? 700 : 500, padding:0 }}>
          Materials
        </button>
        {breadcrumbCats.map((cat, i) => (
          <span key={cat.id} style={{ display:'flex', alignItems:'center', gap:6 }}>
            <span style={{ color:'#C4C9D4' }}>›</span>
            <button onClick={() => goToDepth(i+1)}
              style={{ background:'none', border:'none', cursor:'pointer', fontSize:13, color: i===breadcrumbCats.length-1 ? '#2A3042' : '#6B7280', fontWeight: i===breadcrumbCats.length-1 ? 700 : 500, padding:0 }}>
              {cat.name}
            </button>
          </span>
        ))}
      </div>

      {/* Header */}
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:20 }}>
        <h1 style={{ fontSize:20, fontWeight:800, color:'#2A3042', margin:0 }}>
          {currentCat ? currentCat.name : 'Materials'}
        </h1>
      </div>

      {/* Header */}
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:20 }}>
        <h1 style={{ fontSize:20, fontWeight:800, color:'#2A3042', margin:0 }}>
          {currentCat ? currentCat.name : 'Materials'}
        </h1>
        <div style={{ display:'flex', gap:2, background:'#F3F4F6', borderRadius:8, padding:3 }}>
          {[['tile','⊞'],['list','☰']].map(([mode, icon]) => (
            <button key={mode} onClick={() => { setViewMode(mode); localStorage.setItem('mat_view_mode', mode) }}
              title={mode === 'tile' ? 'Tile view' : 'List view'}
              style={{ width:32, height:28, border:'none', borderRadius:6, cursor:'pointer', fontSize:15,
                background: viewMode===mode ? '#fff' : 'transparent',
                color: viewMode===mode ? '#2A3042' : '#9CA3AF',
                boxShadow: viewMode===mode ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
                transition:'all .12s' }}>
              {icon}
            </button>
          ))}
        </div>
      </div>

      {/* Empty state */}
      {children.length === 0 && !currentCat && (
        <div style={{ textAlign:'center', padding:'60px 0', color:'#9CA3AF', fontSize:14 }}>
          No categories yet — add them in Settings
        </div>
      )}

      {/* Category grid — tile or list view */}
      {viewMode === 'tile' ? (
        <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(180px,1fr))', gap:14 }}>
          {children.map(cat => {
            const grandchildren = allCats.filter(c => c.parent_id === cat.id)
            return (
              <div key={cat.id} onClick={() => pushCat(cat)}
                style={{ background:'#fff', borderRadius:14, border:'1px solid #E8ECF0', overflow:'hidden', cursor:'pointer', boxShadow:'0 1px 3px rgba(0,0,0,0.04)', transition:'all .15s' }}
                onMouseEnter={e=>{e.currentTarget.style.boxShadow='0 6px 20px rgba(0,0,0,0.09)';e.currentTarget.style.transform='translateY(-2px)'}}
                onMouseLeave={e=>{e.currentTarget.style.boxShadow='0 1px 3px rgba(0,0,0,0.04)';e.currentTarget.style.transform='none'}}>
                <div style={{ width:'100%', height:110, overflow:'hidden', background: cat.image_path ? 'transparent' : 'linear-gradient(135deg,#F3F4F6,#E8ECF0)', display:'flex', alignItems:'center', justifyContent:'center' }}>
                  {cat.image_path
                    ? <img src={pubUrl(cat.image_path)} style={{ width:'100%', height:'100%', objectFit:'cover', display:'block' }} loading="lazy" alt="" />
                    : <span style={{ fontSize:32 }}>📦</span>
                  }
                </div>
                <div style={{ padding:'10px 14px 12px' }}>
                  <div style={{ fontSize:14, fontWeight:700, color:'#2A3042' }}>{cat.name}</div>
                  <div style={{ fontSize:11, color:'#9CA3AF', marginTop:2 }}>
                    {grandchildren.length > 0
                      ? `${grandchildren.length} subcategor${grandchildren.length===1?'y':'ies'}`
                      : 'Click to browse'}
                  </div>
                </div>
              </div>
            )
          })}
          {currentCat && children.length > 0 && (
            <div onClick={() => setShowAllInCat(true)}
              style={{ background:'#fff', borderRadius:14, border:'1px dashed #C4D4F8', overflow:'hidden', cursor:'pointer', transition:'all .15s' }}
              onMouseEnter={e=>{e.currentTarget.style.background='#F0F4FF';e.currentTarget.style.boxShadow='0 6px 20px rgba(0,0,0,0.09)'}}
              onMouseLeave={e=>{e.currentTarget.style.background='#fff';e.currentTarget.style.boxShadow='none'}}>
              <div style={{ height:110, background:'linear-gradient(135deg,#EEF2FF,#E0E7FF)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:32 }}>📋</div>
              <div style={{ padding:'10px 14px 12px' }}>
                <div style={{ fontSize:14, fontWeight:700, color:'#5B8AF0' }}>All {currentCat.name}</div>
                <div style={{ fontSize:11, color:'#9CA3AF', marginTop:2 }}>Browse all {children.length} subcategor{children.length===1?'y':'ies'} together</div>
              </div>
            </div>
          )}
        </div>
      ) : (
        <div style={{ background:'#fff', borderRadius:12, border:'1px solid #E8ECF0', overflow:'hidden' }}>
          {children.map((cat, i) => {
            const grandchildren = allCats.filter(c => c.parent_id === cat.id)
            return (
              <div key={cat.id} onClick={() => pushCat(cat)}
                style={{ display:'flex', alignItems:'center', gap:14, padding:'12px 16px',
                  borderBottom: i < children.length-1 ? '1px solid #F3F4F6' : 'none',
                  cursor:'pointer' }}
                onMouseEnter={e=>e.currentTarget.style.background='#F9FAFB'}
                onMouseLeave={e=>e.currentTarget.style.background='transparent'}>
                <div style={{ width:44, height:44, borderRadius:10, overflow:'hidden', flexShrink:0, background:'linear-gradient(135deg,#F3F4F6,#E8ECF0)', display:'flex', alignItems:'center', justifyContent:'center' }}>
                  {cat.image_path
                    ? <img src={pubUrl(cat.image_path)} style={{ width:'100%', height:'100%', objectFit:'cover' }} alt="" />
                    : <span style={{ fontSize:20 }}>📦</span>}
                </div>
                <div style={{ flex:1, minWidth:0 }}>
                  <div style={{ fontSize:14, fontWeight:700, color:'#2A3042' }}>{cat.name}</div>
                  <div style={{ fontSize:12, color:'#9CA3AF', marginTop:2 }}>
                    {grandchildren.length > 0
                      ? `${grandchildren.length} subcategor${grandchildren.length===1?'y':'ies'}`
                      : 'Click to browse'}
                  </div>
                </div>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#C4C9D4" strokeWidth="2"><polyline points="9 18 15 12 9 6"/></svg>
              </div>
            )
          })}
          {currentCat && children.length > 0 && (
            <div onClick={() => setShowAllInCat(true)}
              style={{ display:'flex', alignItems:'center', gap:14, padding:'12px 16px', cursor:'pointer', background:'#F8FAFF', borderTop:'1px solid #E8ECF0' }}
              onMouseEnter={e=>e.currentTarget.style.background='#EEF2FF'}
              onMouseLeave={e=>e.currentTarget.style.background='#F8FAFF'}>
              <div style={{ width:44, height:44, borderRadius:10, background:'linear-gradient(135deg,#EEF2FF,#E0E7FF)', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0, fontSize:20 }}>📋</div>
              <div style={{ flex:1 }}>
                <div style={{ fontSize:14, fontWeight:700, color:'#5B8AF0' }}>All {currentCat.name}</div>
                <div style={{ fontSize:12, color:'#9CA3AF', marginTop:2 }}>Browse all subcategories together</div>
              </div>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#C4D4F8" strokeWidth="2"><polyline points="9 18 15 12 9 6"/></svg>
            </div>
          )}
        </div>
      )}
      </>}
    </div>
  )
}
