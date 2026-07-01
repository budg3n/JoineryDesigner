import React, { useState, useEffect, useRef } from 'react'
import ReactDOM from 'react-dom'
import { useDragColumns } from '../hooks/useDragColumns'
import { cachedQuery } from '../hooks/useCache'
import { supabase, BUCKET, pubUrl } from '../lib/supabase'
import ImageLibrary from '../components/ImageLibrary'
import { loadUnitTypes } from './UnitSettings'
import { useToast } from '../components/Toast'
import BackButton from '../components/BackButton'
import { useLocation } from 'react-router-dom'

// ── safe JSON parse ──────────────────────────────────────────────
function safeJSON(val) {
  if (!val) return {}
  if (typeof val === 'object') return val
  try { return JSON.parse(val) } catch { return {} }
}
// Parse options stored as JSON array OR legacy comma-separated string
function parseOptions(val) {
  if (!val) return []
  try {
    const parsed = JSON.parse(val)
    if (Array.isArray(parsed)) return parsed.map(o => String(o).trim()).filter(Boolean)
  } catch {}
  return val.split(',').map(o => o.trim()).filter(Boolean)
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

// ── Add Material Modal — popout "product profile" creation ─────────
function AddMaterialModal({ targetCat, cols, allCats, material, onClose, onCreated, onUpdated, onDeleted }) {
  const toast = useToast()
  const isEditing = !!material
  const NON_NATIVE = ['brand','sku','colour','grade','edge_profile','dimensions','weight','unit','qty','lead_time','min_order','po_number']

  // Parse existing custom_fields when editing
  const initialCf = (() => {
    if (!material) return {}
    try { return material.custom_fields ? (typeof material.custom_fields === 'object' ? material.custom_fields : JSON.parse(material.custom_fields)) : {} } catch { return {} }
  })()

  const [form, setForm]   = useState(() => material ? {
    name: material.name || '', supplier: material.supplier || '', panel_type: material.panel_type || '',
    thickness: material.thickness || '', colour_code: material.colour_code || '', finish: material.finish || '',
    price: material.price || '', notes: material.notes || '',
  } : { name:'' })
  const [cf, setCf]       = useState(() => { const { price_breaks, ...rest } = initialCf; return rest })
  const [priceBreaks, setPriceBreaks] = useState(() => Array.isArray(initialCf.price_breaks) ? initialCf.price_breaks : [])
  const [imgPreview, setImgPreview] = useState(() => material?.storage_path ? pubUrl(material.storage_path) : null)
  const [imgLibPath, setImgLibPath] = useState(() => material?.storage_path || null)
  const [showLib, setShowLib] = useState(false)
  const [saving, setSaving] = useState(false)
  const [modalTab, setModalTab] = useState('details') // 'details' | 'suppliers'

  // ── Kit mode ──────────────────────────────────────────────────────
  const [isKit, setIsKit] = useState(() => !!material?.is_kit)
  const [kitItems, setKitItems] = useState([]) // [{ material_id, material, qty }]
  const [kitItemsLoading, setKitItemsLoading] = useState(false)
  const [kitSearch, setKitSearch] = useState('')
  const [kitResults, setKitResults] = useState([])
  const [kitSearching, setKitSearching] = useState(false)
  const kitSearchTimer = useRef()

  // Load existing kit components when editing a material that's already a kit
  useEffect(() => {
    if (!material?.is_kit || !material?.kit_id) return
    setKitItemsLoading(true)
    supabase.from('material_kit_items').select('*, materials(*)').eq('kit_id', material.kit_id).order('sort_order')
      .then(({ data }) => {
        setKitItems((data || []).filter(it => it.materials).map(it => ({ material_id: it.material_id, material: it.materials, qty: it.qty || 1 })))
        setKitItemsLoading(false)
      })
  }, [material?.kit_id])

  function doKitSearch(val) {
    setKitSearch(val)
    clearTimeout(kitSearchTimer.current)
    if (!val.trim()) { setKitResults([]); return }
    setKitSearching(true)
    kitSearchTimer.current = setTimeout(async () => {
      const { data } = await supabase.from('materials').select('*')
        .ilike('name', `%${val}%`)
        .or('is_kit.is.null,is_kit.eq.false') // don't allow nesting kits inside kits
        .order('name').limit(20)
      setKitResults((data || []).filter(m => m.id !== material?.id))
      setKitSearching(false)
    }, 250)
  }

  function addKitComponent(mat) {
    if (kitItems.some(it => it.material_id === mat.id)) { toast('Already in this kit', 'error'); return }
    setKitItems(p => [...p, { material_id: mat.id, material: mat, qty: 1 }])
    setKitSearch(''); setKitResults([])
  }
  function updateKitQty(materialId, qty) {
    setKitItems(p => p.map(it => it.material_id === materialId ? { ...it, qty } : it))
  }
  function removeKitComponent(materialId) {
    setKitItems(p => p.filter(it => it.material_id !== materialId))
  }
  const kitTotalPrice = kitItems.reduce((sum, it) => sum + (parseFloat(it.material?.price) || 0) * (parseFloat(it.qty) || 1), 0)

  // ── Suppliers & per-supplier pricing ───────────────────────────────
  const [allSuppliers, setAllSuppliers] = useState([])
  const [supplierSearch, setSupplierSearch] = useState(material?.supplier || '')
  const [supplierDropOpen, setSupplierDropOpen] = useState(false)
  const [quickCreateSupplier, setQuickCreateSupplier] = useState('')
  const [matSuppliers, setMatSuppliers] = useState([])
  const [suppliersLoading, setSuppliersLoading] = useState(false)
  const [addingSupplierId, setAddingSupplierId] = useState('')
  const [creatingSupplier, setCreatingSupplier] = useState(false)
  const [newSupplierName, setNewSupplierName] = useState('')
  const [savingNewSupplier, setSavingNewSupplier] = useState(false)
  const saveTimer = useRef(null) // debounce price break saves
  const matSuppliersRef = useRef(matSuppliers)
  useEffect(() => { matSuppliersRef.current = matSuppliers }, [matSuppliers])

  // Load suppliers on mount so the supplier field in Details tab works immediately
  useEffect(() => {
    supabase.from('suppliers').select('id,name').order('name').then(({ data }) => setAllSuppliers(data || []))
  }, [])

  useEffect(() => {
    if (modalTab !== 'suppliers') return
    if (!material?.id) {
      // New material not yet saved — show empty supplier list, no DB fetch needed
      setSuppliersLoading(false)
      return
    }
    if (matSuppliers.length > 0) return // already loaded
    setSuppliersLoading(true)

    // Read price_breaks from custom_fields on the material object
    function readPriceBreaks(mat) {
      try {
        const cf = mat?.custom_fields
          ? (typeof mat.custom_fields === 'object' ? mat.custom_fields : JSON.parse(mat.custom_fields))
          : {}
        return Array.isArray(cf?.price_breaks) ? cf.price_breaks : []
      } catch { return [] }
    }

    supabase.from('material_suppliers')
      .select('id,supplier_id,price,sku,lead_time,is_preferred,suppliers(id,name)')
      .eq('material_id', material.id)
      .order('is_preferred', { ascending: false })
      .then(({ data, error }) => {
        if (error) { console.error('material_suppliers load:', error); setSuppliersLoading(false); return }
        const breaks = readPriceBreaks(material)
        const hydrated = (data || []).map(ms => ({
          ...ms,
          price_breaks: ms.is_preferred ? breaks : [],
        }))
        setMatSuppliers(hydrated)
        setSuppliersLoading(false)
      })
      .catch(err => { console.error('material_suppliers catch:', err); setSuppliersLoading(false) })
  }, [material?.id, modalTab])

  async function addSupplierLink(supplierId) {
    if (!supplierId) return
    if (matSuppliers.some(ms => ms.supplier_id === supplierId)) { toast('Already linked to this supplier', 'error'); return }
    const isFirst = matSuppliers.length === 0
    if (!material?.id) {
      // Not saved yet — queue locally, will be written once the material exists
      const supplier = allSuppliers.find(s => s.id === supplierId)
      setMatSuppliers(p => [...p, { id: `_local_${Date.now()}`, supplier_id: supplierId, supplier, price: '', sku: '', lead_time: '', is_preferred: isFirst, _unsaved: true }])
      setAddingSupplierId('')
      return
    }
    const { data, error } = await supabase.from('material_suppliers')
      .insert({ material_id: material.id, supplier_id: supplierId, is_preferred: isFirst })
      .select('*, suppliers(*)').single()
    if (error) { toast(error.message, 'error'); return }
    setMatSuppliers(p => [...p, { ...data, price_breaks: [] }])
    setAddingSupplierId('')
    window.dispatchEvent(new CustomEvent('materials-library-updated'))
  }

  // Quick-create a new supplier right from this modal, then immediately link it to this product
  async function createSupplierAndLink() {
    if (!newSupplierName.trim()) { toast('Enter a supplier name', 'error'); return }
    setSavingNewSupplier(true)
    const { data: newSupplier, error } = await supabase.from('suppliers')
      .insert({ name: newSupplierName.trim() }).select().single()
    if (error) { toast(error.message, 'error'); setSavingNewSupplier(false); return }
    setAllSuppliers(p => [...p, newSupplier].sort((a,b) => (a.name||'').localeCompare(b.name||'')))
    setNewSupplierName('')
    setCreatingSupplier(false)
    setSavingNewSupplier(false)
    toast(`"${newSupplier.name}" added ✓`)
    await addSupplierLink(newSupplier.id)
  }

  // Simple update — just merges into local state, no DB call
  function updateSupplierLinkLocal(id, patch) {
    setMatSuppliers(p => p.map(ms => ms.id === id ? { ...ms, ...patch } : ms))
  }

  // Explicit save for a supplier link — called by the Save button
  async function saveSupplierLink(ms) {
    if (!material?.id) { toast('Save the product first', 'error'); return }
    setSupplierSaving(ms.id)

    // 1. Save standard columns to material_suppliers (price, sku, lead_time)
    if (!String(ms.id).startsWith('_local_')) {
      const { error } = await supabase.from('material_suppliers')
        .update({ price: ms.price || null, sku: ms.sku || '', lead_time: ms.lead_time || '' })
        .eq('id', ms.id)
      if (error) { toast(error.message, 'error'); setSupplierSaving(null); return }
    }

    // 2. Save price_breaks to materials.custom_fields and price to materials.price
    const { data: current, error: fetchErr } = await supabase.from('materials')
      .select('custom_fields').eq('id', material.id).single()
    if (fetchErr) { toast(fetchErr.message, 'error'); setSupplierSaving(null); return }

    let curCf = {}
    try { curCf = current?.custom_fields
      ? (typeof current.custom_fields === 'object' ? current.custom_fields : JSON.parse(current.custom_fields))
      : {} } catch {}

    const breaks = Array.isArray(ms.price_breaks)
      ? ms.price_breaks.filter(b => b.qty !== '' || b.price !== '') // keep anything touched
      : []
    curCf.price_breaks = breaks

    const matPatch = { custom_fields: JSON.stringify(curCf) }
    if (ms.price && ms.price !== '') matPatch.price = ms.price

    const { error: matErr } = await supabase.from('materials').update(matPatch).eq('id', material.id)
    if (matErr) { toast(matErr.message, 'error'); setSupplierSaving(null); return }

    // Update local form price
    if (ms.price && ms.price !== '') setForm(p => ({ ...p, price: ms.price }))

    setSupplierSaving(null)
    toast('Supplier info saved ✓')
    window.dispatchEvent(new CustomEvent('materials-library-updated'))
  }

  const [supplierSaving, setSupplierSaving] = useState(null)

  async function setPreferredSupplier(id) {
    const updated = matSuppliers.map(ms => ({ ...ms, is_preferred: ms.id === id }))
    setMatSuppliers(updated)
    for (const ms of updated) {
      if (!String(ms.id).startsWith('_local_')) {
        await supabase.from('material_suppliers').update({ is_preferred: ms.id === id }).eq('id', ms.id)
      }
    }
    const preferred = updated.find(ms => ms.id === id)
    if (preferred) await saveSupplierLink(preferred)
  }

  async function removeSupplierLink(ms) {
    if (!confirm(`Remove ${ms.suppliers?.name || ms.supplier?.name || 'this supplier'} from this product?`)) return
    setMatSuppliers(p => p.filter(x => x.id !== ms.id))
    if (!String(ms.id).startsWith('_local_')) {
      await supabase.from('material_suppliers').delete().eq('id', ms.id)
    }
    // If we removed the preferred one, promote the next supplier automatically
    if (ms.is_preferred) {
      const remaining = matSuppliers.filter(x => x.id !== ms.id)
      if (remaining.length > 0) setPreferredSupplier(remaining[0].id)
    }
    window.dispatchEvent(new CustomEvent('materials-library-updated'))
  }

  const catId = material?.category_id || targetCat?.id
  const cat = allCats?.find(c => c.id === catId)
  const parentCat = cat?.parent_id ? allCats?.find(c => c.id === cat.parent_id) : null
  const catPath = [parentCat?.name, cat?.name].filter(Boolean).join(' > ')

  // Fields to render — everything except image/category/name (shown separately) and price (shown with breaks)
  const fieldCols = (cols || []).filter(c => c.type !== 'image' && c.key !== 'category_name' && c.key !== 'name' && c.key !== 'price')

  function setVal(col, val) {
    if (col.fieldId) {
      setCf(p => ({ ...p, [col.fieldId]: val }))
    } else if (NON_NATIVE.includes(col.key)) {
      setCf(p => ({ ...p, [col.key]: val }))
    } else {
      setForm(p => ({ ...p, [col.key]: val }))
    }
  }
  function getVal(col) {
    if (col.fieldId) return cf[col.fieldId] || ''
    if (NON_NATIVE.includes(col.key)) return cf[col.key] || ''
    return form[col.key] || ''
  }

  function handleLibrarySelect(img) {
    setImgLibPath(img.path)
    setImgPreview(pubUrl(img.path))
    setShowLib(false)
  }

  async function save() {
    if (!form.name?.trim()) { toast('Name is required', 'error'); return }
    if (isKit && kitItems.length === 0) { toast('A kit needs at least one component', 'error'); return }
    setSaving(true)

    const finalCf = { ...cf }
    if (priceBreaks.length) finalCf.price_breaks = priceBreaks.filter(b => b.qty !== '' && b.price !== '')

    const payload = {
      name: form.name.trim(),
      custom_fields: JSON.stringify(finalCf),
      is_kit: isKit,
    }
    if (!isEditing) payload.category_id = targetCat.id
    // Native columns — always write them. Numeric fields get null instead of empty string.
    ;['supplier','panel_type','colour_code','finish','notes'].forEach(k => {
      payload[k] = form[k] ?? ''
    })
    // thickness may be numeric in DB — send null if empty
    payload.thickness = form.thickness !== '' && form.thickness != null ? form.thickness : null
    // Kit price is derived from its components, not manually entered
    payload.price = isKit ? (kitTotalPrice || null) : (form.price !== '' && form.price != null ? parseFloat(form.price) || null : null)

    let data, error
    if (isEditing) {
      ({ data, error } = await supabase.from('materials').update(payload).eq('id', material.id).select().single())
    } else {
      ({ data, error } = await supabase.from('materials').insert(payload).select().single())
    }
    if (error) { toast(error.message, 'error'); setSaving(false); return }

    // Image: use library path if selected, otherwise keep existing
    if (imgLibPath && data) {
      await supabase.from('materials').update({ storage_path: imgLibPath }).eq('id', data.id)
      data.storage_path = imgLibPath
    } else if (isEditing && material.storage_path && !imgLibPath) {
      data.storage_path = material.storage_path
    }

    // Sync kit definition (material_kits + material_kit_items) if this product is a kit
    if (isKit) {
      let kitId = material?.kit_id
      if (kitId) {
        await supabase.from('material_kits').update({ name: form.name.trim(), notes: form.notes || '' }).eq('id', kitId)
        await supabase.from('material_kit_items').delete().eq('kit_id', kitId)
      } else {
        const { data: kitData, error: kitErr } = await supabase.from('material_kits')
          .insert({ name: form.name.trim(), notes: form.notes || '', linked_material_id: data.id }).select().single()
        if (kitErr) { toast(`Material saved, but kit setup failed: ${kitErr.message}`, 'error'); setSaving(false); return }
        kitId = kitData.id
        await supabase.from('materials').update({ kit_id: kitId }).eq('id', data.id)
        data.kit_id = kitId
      }
      const itemRows = kitItems.map((it, i) => ({ kit_id: kitId, material_id: it.material_id, qty: it.qty || 1, sort_order: i }))
      const { error: itemsErr } = await supabase.from('material_kit_items').insert(itemRows)
      if (itemsErr) { toast(`Kit components couldn't be saved: ${itemsErr.message}`, 'error'); setSaving(false); return }
      data.is_kit = true
      data.kit_id = kitId
    } else if (isEditing && material?.is_kit && material?.kit_id) {
      // Was a kit, now toggled off — clean up the kit definition
      await supabase.from('material_kit_items').delete().eq('kit_id', material.kit_id)
      await supabase.from('material_kits').delete().eq('id', material.kit_id)
      data.is_kit = false
      data.kit_id = null
    }

    // Write any supplier links that were queued locally before the material existed yet
    const unsavedLinks = matSuppliersRef.current.filter(ms => ms._unsaved)
    if (unsavedLinks.length > 0 && data?.id) {
      for (const link of unsavedLinks) {
        await supabase.from('material_suppliers').insert({
          material_id: data.id, supplier_id: link.supplier_id,
          price: link.price || null, sku: link.sku || null, lead_time: link.lead_time || null,
          is_preferred: link.is_preferred,
        })
      }
      // Save price and price_breaks from the preferred supplier to the material record
      const preferred = unsavedLinks.find(l => l.is_preferred)
      if (preferred && data?.id) {
        const matUpdate = {}
        if (preferred.price) matUpdate.price = preferred.price
        const breaks = Array.isArray(preferred.price_breaks) ? preferred.price_breaks.filter(b => b.qty !== '' || b.price !== '') : []
        if (breaks.length > 0 || preferred.price) {
          const { data: cur } = await supabase.from('materials').select('custom_fields').eq('id', data.id).single()
          let cf = {}
          try { cf = cur?.custom_fields ? (typeof cur.custom_fields === 'object' ? cur.custom_fields : JSON.parse(cur.custom_fields)) : {} } catch {}
          cf.price_breaks = breaks
          matUpdate.custom_fields = JSON.stringify(cf)
        }
        if (Object.keys(matUpdate).length) {
          await supabase.from('materials').update(matUpdate).eq('id', data.id)
        }
      }
    }

    setSaving(false)
    toast(isEditing ? 'Material updated ✓' : 'Material created ✓')
    window.dispatchEvent(new CustomEvent('materials-library-updated'))
    if (isEditing) onUpdated(data)
    else onCreated(data)
  }

  function inputFor(col) {
    const val = getVal(col)
    const common = { style:{ width:'100%', padding:'9px 12px', border:'1px solid #DDE3EC', borderRadius:9, fontSize:13, outline:'none', boxSizing:'border-box', background:'#fff' } }

    // Supplier field — searchable dropdown with quick-create
    if (col.key === 'supplier' || col.settingKey === 'supplier') {
      const filtered = allSuppliers.filter(s =>
        !supplierSearch || s.name.toLowerCase().includes(supplierSearch.toLowerCase())
      )
      const exactMatch = allSuppliers.some(s => s.name.toLowerCase() === supplierSearch.toLowerCase())
      return (
        <div style={{ position:'relative' }}>
          <input
            value={supplierSearch}
            onChange={e => { setSupplierSearch(e.target.value); setVal(col, e.target.value); setSupplierDropOpen(true) }}
            onFocus={() => setSupplierDropOpen(true)}
            onBlur={() => setTimeout(() => setSupplierDropOpen(false), 150)}
            placeholder="Search or create supplier…"
            {...common}
          />
          {supplierDropOpen && (
            <div style={{ position:'absolute', top:'100%', left:0, right:0, marginTop:3, background:'#fff', border:'1px solid #E8ECF0', borderRadius:10, boxShadow:'0 8px 24px rgba(0,0,0,0.12)', zIndex:100, maxHeight:200, overflowY:'auto' }}>
              {filtered.map(s => (
                <div key={s.id}
                  onMouseDown={() => { setVal(col, s.name); setSupplierSearch(s.name); setSupplierDropOpen(false) }}
                  style={{ padding:'9px 12px', cursor:'pointer', fontSize:13, color:'#2A3042', borderBottom:'1px solid #F9FAFB' }}
                  onMouseEnter={e => e.currentTarget.style.background='#F0F4FF'}
                  onMouseLeave={e => e.currentTarget.style.background='transparent'}>
                  {s.name}
                </div>
              ))}
              {supplierSearch.trim() && !exactMatch && (
                <div
                  onMouseDown={async () => {
                    const name = supplierSearch.trim()
                    const { data, error } = await supabase.from('suppliers').insert({ name }).select('id,name').single()
                    if (error) return
                    setAllSuppliers(p => [...p, data].sort((a,b) => a.name.localeCompare(b.name)))
                    setVal(col, data.name)
                    setSupplierSearch(data.name)
                    setSupplierDropOpen(false)
                  }}
                  style={{ padding:'9px 12px', cursor:'pointer', fontSize:13, color:'#1D9E75', fontWeight:600, borderTop: filtered.length ? '1px solid #E8ECF0' : 'none' }}
                  onMouseEnter={e => e.currentTarget.style.background='#F0FDF4'}
                  onMouseLeave={e => e.currentTarget.style.background='transparent'}>
                  + Create "{supplierSearch.trim()}"
                </div>
              )}
              {filtered.length === 0 && !supplierSearch.trim() && (
                <div style={{ padding:'10px 12px', fontSize:12, color:'#9CA3AF', textAlign:'center' }}>
                  No suppliers yet — type a name to create one
                </div>
              )}
            </div>
          )}
        </div>
      )
    }

    if (col.type === 'select' && col.options?.length) {
      return (
        <select value={val} onChange={e=>setVal(col, e.target.value)} {...common}>
          <option value="">—</option>
          {col.options.map(o => <option key={o} value={o}>{o}</option>)}
        </select>
      )
    }
    if (col.type === 'unit_select') {
      return <UnitSelectCell val={val} w={'100%'} onChange={v=>setVal(col, v)} />
    }
    return (
      <input type={col.type==='mm'||col.type==='number' ? 'number' : 'text'} value={val}
        onChange={e=>setVal(col, e.target.value)}
        placeholder={col.placeholder || col.label}
        {...common} />
    )
  }

  return (
    <div style={{ position:'fixed', inset:0, zIndex:9999, background:'rgba(0,0,0,0.5)', display:'flex', alignItems:'center', justifyContent:'center', padding:16 }}
      onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={{ background:'#fff', borderRadius:16, width:'100%', maxWidth:560, maxHeight:'90vh', display:'flex', flexDirection:'column', boxShadow:'0 20px 60px rgba(0,0,0,0.25)', overflow:'hidden' }}>

        {/* Header */}
        <div style={{ padding:'16px 20px', borderBottom:'1px solid #F3F4F6', display:'flex', justifyContent:'space-between', alignItems:'flex-start', flexShrink:0 }}>
          <div style={{ minWidth:0 }}>
            {catPath && <div style={{ fontSize:10, fontWeight:700, color:'#9CA3AF', textTransform:'uppercase', letterSpacing:'.06em', marginBottom:3 }}>{catPath}</div>}
            <div style={{ fontSize:17, fontWeight:800, color:'#2A3042', display:'flex', alignItems:'center', gap:6 }}>
              {isKit && <span>🧰</span>}
              {isEditing ? form.name || 'Edit material' : isKit ? 'New kit' : 'New material'}
            </div>
          </div>
          <button onClick={onClose} style={{ background:'none', border:'none', cursor:'pointer', color:'#9CA3AF', fontSize:24, lineHeight:1, flexShrink:0 }}>×</button>
        </div>

        {/* Tabs */}
        <div style={{ display:'flex', gap:2, padding:'8px 16px 0', borderBottom:'1px solid #F3F4F6', flexShrink:0 }}>
          {[
            ['details','Details'],
            ['info','Product Info'],
            ['suppliers',`Suppliers${matSuppliers.length?` (${matSuppliers.length})`:''}`]
          ].map(([key,label]) => (
            <button key={key} onClick={() => setModalTab(key)}
              style={{ padding:'8px 14px', fontSize:13, fontWeight:600, border:'none', background:'none', cursor:'pointer',
                color: modalTab===key ? '#5B8AF0' : '#9CA3AF',
                borderBottom: modalTab===key ? '2px solid #5B8AF0' : '2px solid transparent' }}>
              {label}
            </button>
          ))}
        </div>

        {modalTab === 'info' ? (
          <div style={{ flex:1, overflowY:'auto', padding:20, display:'flex', flexDirection:'column', gap:16 }}>
            <div style={{ fontSize:12, color:'#9CA3AF', background:'#F8FAFF', border:'1px solid #E0E7FF', borderRadius:10, padding:'10px 14px' }}>
              Add a description and notes for this product. These are saved with the product and visible anywhere it appears.
            </div>

            {/* Description */}
            <div>
              <label style={{ fontSize:12, fontWeight:700, color:'#374151', display:'block', marginBottom:6 }}>Description</label>
              <textarea
                value={cf.description || ''}
                onChange={e => setCf(p => ({ ...p, description: e.target.value }))}
                placeholder="Describe this product — what it is, what it's used for, key features…"
                rows={5}
                style={{ width:'100%', padding:'10px 12px', border:'1px solid #DDE3EC', borderRadius:10, fontSize:13, outline:'none', resize:'vertical', lineHeight:1.6, fontFamily:'inherit', boxSizing:'border-box', color:'#2A3042' }}
              />
            </div>

            {/* Notes */}
            <div>
              <label style={{ fontSize:12, fontWeight:700, color:'#374151', display:'block', marginBottom:6 }}>Notes</label>
              <textarea
                value={form.notes || ''}
                onChange={e => setForm(p => ({ ...p, notes: e.target.value }))}
                placeholder="Internal notes — installation tips, ordering info, things to watch out for…"
                rows={4}
                style={{ width:'100%', padding:'10px 12px', border:'1px solid #DDE3EC', borderRadius:10, fontSize:13, outline:'none', resize:'vertical', lineHeight:1.6, fontFamily:'inherit', boxSizing:'border-box', color:'#2A3042' }}
              />
            </div>

            {/* Preview of current content */}
            {(cf.description || form.notes) && (
              <div style={{ background:'#F9FAFB', border:'1px solid #E8ECF0', borderRadius:10, padding:14 }}>
                <div style={{ fontSize:10, fontWeight:700, color:'#9CA3AF', textTransform:'uppercase', letterSpacing:'.05em', marginBottom:8 }}>Preview</div>
                {cf.description && (
                  <div style={{ marginBottom: form.notes ? 10 : 0 }}>
                    <div style={{ fontSize:11, fontWeight:700, color:'#6B7280', marginBottom:3 }}>Description</div>
                    <div style={{ fontSize:13, color:'#374151', lineHeight:1.6, whiteSpace:'pre-wrap' }}>{cf.description}</div>
                  </div>
                )}
                {form.notes && (
                  <div>
                    <div style={{ fontSize:11, fontWeight:700, color:'#6B7280', marginBottom:3 }}>Notes</div>
                    <div style={{ fontSize:13, color:'#374151', lineHeight:1.6, whiteSpace:'pre-wrap', fontStyle:'italic' }}>{form.notes}</div>
                  </div>
                )}
              </div>
            )}
          </div>
        ) : modalTab === 'suppliers' ? (
          <div style={{ flex:1, overflowY:'auto', padding:20 }}>
            <div style={{ marginBottom:14 }}>
              <label style={{ fontSize:11, fontWeight:700, color:'#6B7280', display:'block', marginBottom:4 }}>Add a supplier</label>

              {creatingSupplier ? (
                <div style={{ display:'flex', gap:8 }}>
                  <input autoFocus value={newSupplierName} onChange={e => setNewSupplierName(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') createSupplierAndLink(); if (e.key === 'Escape') { setCreatingSupplier(false); setNewSupplierName('') } }}
                    placeholder="New supplier name…"
                    style={{ flex:1, padding:'9px 12px', border:'1px solid #5B8AF0', borderRadius:9, fontSize:13, outline:'none', boxSizing:'border-box' }} />
                  <button onClick={createSupplierAndLink} disabled={savingNewSupplier || !newSupplierName.trim()}
                    style={{ padding:'9px 16px', borderRadius:9, border:'none', background: newSupplierName.trim() ? '#1D9E75' : '#E8ECF0', color: newSupplierName.trim() ? '#fff' : '#9CA3AF', fontSize:13, fontWeight:700, cursor: newSupplierName.trim() ? 'pointer' : 'default', whiteSpace:'nowrap' }}>
                    {savingNewSupplier ? 'Saving…' : '+ Create'}
                  </button>
                  <button onClick={() => { setCreatingSupplier(false); setNewSupplierName('') }}
                    style={{ padding:'9px 12px', borderRadius:9, border:'1px solid #E8ECF0', background:'#fff', color:'#6B7280', fontSize:13, cursor:'pointer' }}>
                    Cancel
                  </button>
                </div>
              ) : (
                <div style={{ display:'flex', gap:8 }}>
                  <select value={addingSupplierId}
                    onChange={e => {
                      if (e.target.value === '__new__') { setCreatingSupplier(true); setAddingSupplierId('') }
                      else setAddingSupplierId(e.target.value)
                    }}
                    style={{ flex:1, padding:'9px 12px', border:'1px solid #DDE3EC', borderRadius:9, fontSize:13, outline:'none', background:'#fff', boxSizing:'border-box' }}>
                    <option value="">Select a supplier…</option>
                    {allSuppliers.filter(s => !matSuppliers.some(ms => ms.supplier_id === s.id)).map(s => (
                      <option key={s.id} value={s.id}>{s.name}</option>
                    ))}
                    <option value="__new__">+ New supplier…</option>
                  </select>
                  <button onClick={() => addSupplierLink(addingSupplierId)} disabled={!addingSupplierId}
                    style={{ padding:'9px 16px', borderRadius:9, border:'none', background: addingSupplierId ? '#5B8AF0' : '#E8ECF0', color: addingSupplierId ? '#fff' : '#9CA3AF', fontSize:13, fontWeight:700, cursor: addingSupplierId ? 'pointer' : 'default' }}>
                    + Add
                  </button>
                </div>
              )}

              {allSuppliers.length === 0 && !creatingSupplier && (
                <div style={{ fontSize:11, color:'#9CA3AF', marginTop:6 }}>
                  No suppliers yet — choose <strong>+ New supplier…</strong> above to create one.
                </div>
              )}
            </div>

            {suppliersLoading ? (
              <div className="spinner" style={{ margin:'20px auto' }} />
            ) : matSuppliers.length === 0 ? (
              <div style={{ textAlign:'center', padding:'24px 0', color:'#9CA3AF', fontSize:13, background:'#F9FAFB', borderRadius:10 }}>
                {!material?.id && (
                  <div style={{ marginBottom:8, fontSize:12, color:'#5B8AF0', fontWeight:600 }}>
                    💡 You can add supplier info now — it will be saved when you click "Save changes"
                  </div>
                )}
                No suppliers linked to this product yet
              </div>
            ) : (
              <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
                {matSuppliers.map(ms => {
                  const sup = ms.suppliers || ms.supplier
                  return (
                    <div key={ms.id} style={{ background: ms.is_preferred ? '#F0FDF4' : '#fff', border:`1px solid ${ms.is_preferred ? '#86EFAC' : '#E8ECF0'}`, borderRadius:12, padding:12 }}>
                      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:10 }}>
                        <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                          <div style={{ fontSize:13, fontWeight:700, color:'#2A3042' }}>{sup?.name || 'Unknown supplier'}</div>
                          {ms.is_preferred && (
                            <span style={{ fontSize:10, fontWeight:700, padding:'2px 8px', borderRadius:8, background:'#1D9E75', color:'#fff' }}>★ Preferred</span>
                          )}
                        </div>
                        <div style={{ display:'flex', gap:6 }}>
                          {!ms.is_preferred && (
                            <button onClick={() => setPreferredSupplier(ms.id)}
                              style={{ fontSize:11, fontWeight:600, padding:'4px 10px', borderRadius:7, border:'1px solid #C4D4F8', background:'#F0F4FF', color:'#3730A3', cursor:'pointer' }}>
                              Set preferred
                            </button>
                          )}
                          <button onClick={() => removeSupplierLink(ms)}
                            style={{ background:'none', border:'none', cursor:'pointer', color:'#D1D5DB', fontSize:16 }}
                            onMouseEnter={e=>e.currentTarget.style.color='#E24B4A'} onMouseLeave={e=>e.currentTarget.style.color='#D1D5DB'}>×</button>
                        </div>
                      </div>
                      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:8 }}>
                        <div>
                          <label style={{ fontSize:10, fontWeight:600, color:'#9CA3AF', display:'block', marginBottom:3 }}>Price</label>
                          <div style={{ position:'relative' }}>
                            <span style={{ position:'absolute', left:8, top:'50%', transform:'translateY(-50%)', fontSize:12, color:'#9CA3AF' }}>$</span>
                            <input type="number" step="0.01" value={ms.price || ''}
                              onChange={e => updateSupplierLinkLocal(ms.id, { price: e.target.value })}
                              onBlur={e => { if (material?.id && !String(ms.id).startsWith('_local_')) saveSupplierLink({...ms, price: e.target.value}) }}
                              placeholder="0.00"
                              style={{ width:'100%', padding:'6px 8px 6px 18px', border:'1px solid #DDE3EC', borderRadius:7, fontSize:12, outline:'none', boxSizing:'border-box' }} />
                          </div>
                        </div>
                        <div>
                          <label style={{ fontSize:10, fontWeight:600, color:'#9CA3AF', display:'block', marginBottom:3 }}>Supplier SKU</label>
                          <input value={ms.sku || ''} onChange={e => updateSupplierLinkLocal(ms.id, { sku: e.target.value })}
                            onBlur={e => { if (material?.id && !String(ms.id).startsWith('_local_')) saveSupplierLink({...ms, sku: e.target.value}) }}
                            placeholder="SKU"
                            style={{ width:'100%', padding:'6px 8px', border:'1px solid #DDE3EC', borderRadius:7, fontSize:12, outline:'none', boxSizing:'border-box' }} />
                        </div>
                        <div>
                          <label style={{ fontSize:10, fontWeight:600, color:'#9CA3AF', display:'block', marginBottom:3 }}>Lead time</label>
                          <input value={ms.lead_time || ''} onChange={e => updateSupplierLinkLocal(ms.id, { lead_time: e.target.value })}
                            onBlur={e => { if (material?.id && !String(ms.id).startsWith('_local_')) saveSupplierLink({...ms, lead_time: e.target.value}) }}
                            placeholder="e.g. 5 days"
                            style={{ width:'100%', padding:'6px 8px', border:'1px solid #DDE3EC', borderRadius:7, fontSize:12, outline:'none', boxSizing:'border-box' }} />
                        </div>
                      </div>

                      {/* Qty price breaks for this supplier */}
                      <div style={{ marginTop:10, paddingTop:10, borderTop:'1px solid rgba(0,0,0,0.06)' }}>
                        <div style={{ fontSize:10, fontWeight:700, color:'#9CA3AF', textTransform:'uppercase', letterSpacing:'.05em', marginBottom:6 }}>
                          Qty price breaks
                        </div>
                        {(ms.price_breaks || []).map((b, bi) => (
                          <div key={bi} style={{ display:'flex', gap:6, marginBottom:5, alignItems:'center' }}>
                            <span style={{ fontSize:11, color:'#9CA3AF', flexShrink:0 }}>≥</span>
                            <input type="number" placeholder="Qty" value={b.qty}
                              onChange={e => {
                                const updated = (ms.price_breaks || []).map((x,j) => j===bi ? {...x,qty:e.target.value} : x)
                                updateSupplierLinkLocal(ms.id, { price_breaks: updated })
                              }}
                              onBlur={() => { if (material?.id && !String(ms.id).startsWith('_local_')) { const cur = matSuppliers.find(x=>x.id===ms.id); if(cur) saveSupplierLink(cur) } }}
                              style={{ width:64, padding:'5px 8px', border:'1px solid #DDE3EC', borderRadius:7, fontSize:11, outline:'none' }} />
                            <span style={{ fontSize:11, color:'#9CA3AF', flexShrink:0 }}>units → $</span>
                            <input type="number" step="0.01" placeholder="0.00" value={b.price}
                              onChange={e => {
                                const updated = (ms.price_breaks || []).map((x,j) => j===bi ? {...x,price:e.target.value} : x)
                                updateSupplierLinkLocal(ms.id, { price_breaks: updated })
                              }}
                              onBlur={() => { if (material?.id && !String(ms.id).startsWith('_local_')) { const cur = matSuppliers.find(x=>x.id===ms.id); if(cur) saveSupplierLink(cur) } }}
                              style={{ flex:1, padding:'5px 8px', border:'1px solid #DDE3EC', borderRadius:7, fontSize:11, outline:'none' }} />
                            <button onClick={() => {
                                const updated = (ms.price_breaks || []).filter((_,j) => j!==bi)
                                updateSupplierLinkLocal(ms.id, { price_breaks: updated })
                                if (material?.id && !String(ms.id).startsWith('_local_')) { const cur = matSuppliers.find(x=>x.id===ms.id); if(cur) saveSupplierLink({...cur, price_breaks: updated}) }
                              }}
                              style={{ background:'none', border:'none', cursor:'pointer', color:'#D1D5DB', fontSize:14, flexShrink:0 }}>×</button>
                          </div>
                        ))}
                        <button onClick={() => updateSupplierLinkLocal(ms.id, { price_breaks: [...(ms.price_breaks||[]), {qty:'',price:''}] })}
                          style={{ fontSize:11, color:'#5B8AF0', background:'none', border:'none', cursor:'pointer', padding:0, fontWeight:600 }}>
                          + Add qty break
                        </button>
                      </div>
                      {!material?.id && (
                        <div style={{ marginTop:8, fontSize:11, color:'#5B8AF0', fontStyle:'italic' }}>
                          Pricing will be saved when you click "+ Create material"
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            )}

            <div style={{ fontSize:11, color:'#9CA3AF', marginTop:14, lineHeight:1.5 }}>
              The price shown on order sheets and material pickers uses the <strong>preferred</strong> supplier's price and qty breaks.
            </div>
          </div>
        ) : (
        <div style={{ flex:1, overflowY:'auto', padding:20 }}>
          {/* Image + Name row */}
          <div style={{ display:'flex', gap:14, marginBottom:18 }}>
            <div style={{ display:'flex', flexDirection:'column', gap:5, alignItems:'center', flexShrink:0 }}>
              <div onClick={() => setShowLib(true)}
                style={{ width:84, height:84, borderRadius:12, overflow:'hidden', border:'1.5px dashed #C4D4F8', background:'#F8FAFF', display:'flex', alignItems:'center', justifyContent:'center', cursor:'pointer', position:'relative' }}
                title="Click to pick from image library">
                {imgPreview
                  ? <img src={imgPreview} alt="" style={{ width:'100%', height:'100%', objectFit:'cover' }} />
                  : <span style={{ fontSize:22, color:'#C4D4F8' }}>📷</span>
                }
              </div>
              {imgPreview && (
                <button type="button" onClick={() => { setImgPreview(null); setImgFile(null); setImgLibPath(null) }}
                  style={{ fontSize:10, color:'#9CA3AF', background:'none', border:'none', cursor:'pointer', padding:0 }}>
                  Remove
                </button>
              )}
            </div>
            <div style={{ flex:1 }}>
              <label style={{ fontSize:11, fontWeight:700, color:'#6B7280', display:'block', marginBottom:4 }}>Name *</label>
              <input autoFocus value={form.name||''} onChange={e=>setForm(p=>({...p,name:e.target.value}))}
                placeholder="e.g. Laminex 18mm Borders Oak Organic"
                style={{ width:'100%', padding:'9px 12px', border:'1px solid #DDE3EC', borderRadius:9, fontSize:14, fontWeight:600, outline:'none', boxSizing:'border-box', marginBottom:8 }} />
              <div style={{ fontSize:11, color:'#9CA3AF' }}>Tap the photo to pick from the image library</div>
            </div>
          </div>
          {showLib && <ImageLibrary onSelect={handleLibrarySelect} onClose={() => setShowLib(false)} />}

          {/* Kit toggle */}
          <div onClick={() => setIsKit(v => !v)}
            style={{ display:'flex', alignItems:'center', gap:10, padding:'10px 14px', borderRadius:10,
              background: isKit ? '#FFF7ED' : '#F9FAFB', border:`1px solid ${isKit ? '#FDBA74' : '#E8ECF0'}`,
              marginBottom:18, cursor:'pointer' }}>
            <div style={{ width:36, height:20, borderRadius:10, background: isKit ? '#F97316' : '#D1D5DB', position:'relative', flexShrink:0, transition:'background .15s' }}>
              <div style={{ position:'absolute', top:2, left: isKit ? 18 : 2, width:16, height:16, borderRadius:'50%', background:'#fff', transition:'left .15s', boxShadow:'0 1px 3px rgba(0,0,0,0.2)' }} />
            </div>
            <div style={{ flex:1 }}>
              <div style={{ fontSize:13, fontWeight:700, color: isKit ? '#C2410C' : '#2A3042' }}>🧰 This is a kit</div>
              <div style={{ fontSize:11, color:'#9CA3AF' }}>Bundle multiple products from the library into this one item</div>
            </div>
          </div>

          {isKit && (
            <div style={{ background:'#FFFBF5', border:'1px solid #FDE9D0', borderRadius:12, padding:14, marginBottom:18 }}>
              {/* Search to add components */}
              <div style={{ marginBottom:10, position:'relative' }}>
                <label style={{ fontSize:11, fontWeight:700, color:'#C2410C', display:'block', marginBottom:4 }}>Add components</label>
                <input value={kitSearch} onChange={e=>doKitSearch(e.target.value)}
                  placeholder="Search materials library…"
                  style={{ width:'100%', padding:'9px 12px', border:'1px solid #FDBA74', borderRadius:9, fontSize:13, outline:'none', boxSizing:'border-box', background:'#fff' }} />
                {kitSearch.trim() && (
                  <div style={{ position:'absolute', top:'100%', left:0, right:0, marginTop:4, background:'#fff', border:'1px solid #E8ECF0', borderRadius:10, boxShadow:'0 8px 24px rgba(0,0,0,0.12)', zIndex:50, maxHeight:220, overflowY:'auto' }}>
                    {kitSearching ? (
                      <div style={{ padding:'12px', fontSize:12, color:'#9CA3AF', textAlign:'center' }}>Searching…</div>
                    ) : kitResults.length === 0 ? (
                      <div style={{ padding:'12px', fontSize:12, color:'#9CA3AF', textAlign:'center' }}>No materials found</div>
                    ) : kitResults.map(m => (
                      <div key={m.id} onClick={() => addKitComponent(m)}
                        style={{ padding:'9px 12px', cursor:'pointer', borderBottom:'1px solid #F9FAFB', display:'flex', alignItems:'center', gap:8 }}
                        onMouseEnter={e=>e.currentTarget.style.background='#FFF7ED'}
                        onMouseLeave={e=>e.currentTarget.style.background='transparent'}>
                        {m.storage_path
                          ? <img src={pubUrl(m.storage_path)} style={{ width:28,height:28,borderRadius:6,objectFit:'cover',flexShrink:0 }} alt="" />
                          : <div style={{ width:28,height:28,borderRadius:6,background:m.color||'#E8ECF0',flexShrink:0 }} />
                        }
                        <div style={{ flex:1, minWidth:0 }}>
                          <div style={{ fontSize:12, fontWeight:600, color:'#2A3042' }}>{m.name}</div>
                          <div style={{ fontSize:10, color:'#9CA3AF' }}>{m.price ? `$${m.price}` : ''}</div>
                        </div>
                        <span style={{ fontSize:16, color:'#F97316' }}>+</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Component list */}
              <div style={{ fontSize:11, fontWeight:700, color:'#C2410C', textTransform:'uppercase', letterSpacing:'.05em', marginBottom:8 }}>
                Components ({kitItems.length})
              </div>
              {kitItemsLoading ? (
                <div className="spinner" style={{ margin:'12px auto' }} />
              ) : kitItems.length === 0 ? (
                <div style={{ textAlign:'center', padding:'16px 0', color:'#C2A47A', fontSize:12, background:'#fff', borderRadius:9 }}>
                  Search above to add products to this kit
                </div>
              ) : (
                <div style={{ display:'flex', flexDirection:'column', gap:6, marginBottom:10 }}>
                  {kitItems.map(it => (
                    <div key={it.material_id} style={{ display:'flex', alignItems:'center', gap:10, padding:'8px 10px', background:'#fff', borderRadius:9, border:'1px solid #FDE9D0' }}>
                      {it.material?.storage_path
                        ? <img src={pubUrl(it.material.storage_path)} style={{ width:32,height:32,borderRadius:7,objectFit:'cover',flexShrink:0 }} alt="" />
                        : <div style={{ width:32,height:32,borderRadius:7,background:it.material?.color||'#E8ECF0',flexShrink:0 }} />
                      }
                      <div style={{ flex:1, minWidth:0 }}>
                        <div style={{ fontSize:12, fontWeight:600, color:'#2A3042', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{it.material?.name}</div>
                        <div style={{ fontSize:10, color:'#9CA3AF' }}>{it.material?.price ? `$${parseFloat(it.material.price).toFixed(2)} each` : 'No price set'}</div>
                      </div>
                      <input type="number" min="0.01" step="0.01" value={it.qty}
                        onChange={e=>updateKitQty(it.material_id, e.target.value)}
                        style={{ width:60, padding:'5px 8px', border:'1px solid #DDE3EC', borderRadius:7, fontSize:12, outline:'none', textAlign:'center' }} />
                      <button onClick={()=>removeKitComponent(it.material_id)}
                        style={{ background:'none', border:'none', cursor:'pointer', color:'#D1D5DB', fontSize:16, flexShrink:0 }}
                        onMouseEnter={e=>e.currentTarget.style.color='#E24B4A'} onMouseLeave={e=>e.currentTarget.style.color='#D1D5DB'}>×</button>
                    </div>
                  ))}
                </div>
              )}

              {kitTotalPrice > 0 && (
                <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'10px 14px', background:'#F0FDF4', border:'1px solid #86EFAC', borderRadius:10 }}>
                  <span style={{ fontSize:12, fontWeight:700, color:'#166534' }}>Total kit price (from components)</span>
                  <span style={{ fontSize:15, fontWeight:800, color:'#166534' }}>${kitTotalPrice.toFixed(2)}</span>
                </div>
              )}
            </div>
          )}

          {/* Standard + custom fields grid */}
          {fieldCols.length > 0 && (
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'12px 14px', marginBottom:18 }}>
              {fieldCols.map(col => (
                <div key={col.key + (col.fieldId||'')}>
                  <label style={{ fontSize:11, fontWeight:700, color:'#6B7280', display:'block', marginBottom:4 }}>{col.label}</label>
                  {inputFor(col)}
                </div>
              ))}
            </div>
          )}

          {/* Pricing — link to Suppliers tab rather than a confusing inline box */}
          {!isKit && (
            <button
              onClick={() => setModalTab('suppliers')}
              style={{ display:'flex', alignItems:'center', justifyContent:'space-between', width:'100%', padding:'12px 14px', background:'#F8FAFF', border:'1px solid #E0E7FF', borderRadius:12, cursor:'pointer', textAlign:'left' }}
              onMouseEnter={e => e.currentTarget.style.background='#EEF2FF'}
              onMouseLeave={e => e.currentTarget.style.background='#F8FAFF'}>
              <div>
                <div style={{ fontSize:12, fontWeight:700, color:'#3730A3' }}>
                  {form.price ? `$${parseFloat(form.price).toFixed(2)}` : 'No price set'}
                </div>
                <div style={{ fontSize:11, color:'#9CA3AF', marginTop:2 }}>
                  {isEditing ? 'Tap to manage supplier pricing & qty breaks' : 'Tap to add supplier pricing now'}
                </div>
              </div>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#5B8AF0" strokeWidth="2" style={{ flexShrink:0 }}>
                <polyline points="9 18 15 12 9 6"/>
              </svg>
            </button>
          )}
        </div>
        )}

        {/* Footer */}
        <div style={{ padding:'12px 20px', borderTop:'1px solid #F3F4F6', display:'flex', gap:8, flexShrink:0 }}>
          {isEditing && onDeleted && (
            <button onClick={async () => {
                if (!confirm(`Delete "${material.name}"? This cannot be undone.`)) return
                if (material.is_kit && material.kit_id) {
                  await supabase.from('material_kit_items').delete().eq('kit_id', material.kit_id)
                  await supabase.from('material_kits').delete().eq('id', material.kit_id)
                }
                await supabase.from('materials').delete().eq('id', material.id)
                toast('Material deleted')
                onDeleted(material.id)
              }}
              style={{ padding:'10px 14px', borderRadius:10, border:'1px solid #FCA5A5', background:'#FEF2F2', color:'#E24B4A', fontSize:13, fontWeight:600, cursor:'pointer' }}>
              Delete
            </button>
          )}
          <button onClick={onClose}
            style={{ padding:'10px 18px', borderRadius:10, border:'1px solid #E8ECF0', background:'#fff', color:'#6B7280', fontSize:13, fontWeight:600, cursor:'pointer' }}>
            Cancel
          </button>
          <button onClick={save} disabled={saving || !form.name?.trim() || (isKit && kitItems.length===0)}
            style={{ flex:1, padding:'10px', borderRadius:10, border:'none', fontSize:13, fontWeight:700,
              cursor: (form.name?.trim() && (!isKit || kitItems.length>0)) ? 'pointer' : 'default',
              background: (form.name?.trim() && (!isKit || kitItems.length>0)) ? '#1D9E75' : '#E8ECF0',
              color: (form.name?.trim() && (!isKit || kitItems.length>0)) ? '#fff' : '#9CA3AF' }}>
            {saving ? 'Saving…' : isEditing ? 'Save changes' : isKit ? '+ Create kit' : '+ Create material'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Standard field definitions (kept in sync with MaterialSettings.jsx) ──
const FIELD_TYPES = [
  { value:'text', label:'Text' }, { value:'number', label:'Number' },
  { value:'select', label:'Dropdown' }, { value:'toggle', label:'Toggle' },
]
const ALL_STANDARD_FIELDS = [
  { key:'supplier',     label:'Supplier',           field_type:'text',   group:'Identity' },
  { key:'brand',        label:'Brand',              field_type:'text',   group:'Identity' },
  { key:'sku',          label:'SKU / Product code', field_type:'text',   group:'Identity' },
  { key:'panel_type',   label:'Panel type',         field_type:'text',   group:'Specification' },
  { key:'thickness',    label:'Thickness (mm)',      field_type:'number', group:'Specification' },
  { key:'colour_code',  label:'Colour code',         field_type:'text',   group:'Specification' },
  { key:'colour',       label:'Colour name',         field_type:'text',   group:'Specification' },
  { key:'finish',       label:'Finish',              field_type:'text',   group:'Specification' },
  { key:'grade',        label:'Grade',               field_type:'text',   group:'Specification' },
  { key:'edge_profile', label:'Edge profile',        field_type:'text',   group:'Specification' },
  { key:'grain',        label:'Grain direction',     field_type:'select', group:'Specification', options:['Grained','No grain','Any'] },
  { key:'dimensions',   label:'Sheet dimensions',    field_type:'text',   group:'Specification' },
  { key:'weight',       label:'Weight (kg)',          field_type:'number', group:'Specification' },
  { key:'price',        label:'Unit price ($)',       field_type:'number', group:'Ordering' },
  { key:'unit',         label:'Order unit',          field_type:'select', group:'Ordering', options:['sheets','m','m²','m³','lm','kg','pcs','boxes','rolls','litres'] },
  { key:'qty',          label:'Default qty',         field_type:'number', group:'Ordering' },
  { key:'lead_time',    label:'Lead time (days)',     field_type:'number', group:'Ordering' },
  { key:'min_order',    label:'Minimum order qty',   field_type:'number', group:'Ordering' },
  { key:'po_number',    label:'PO number',           field_type:'text',   group:'Ordering' },
  { key:'notes',        label:'Notes',               field_type:'text',   group:'Other' },
]
const DEFAULT_VISIBLE_FIELDS = ['supplier','panel_type','thickness','colour_code','finish','price','notes']

// ── Comprehensive Fields modal — standard field visibility + custom fields ──
// This is the same control surface as Settings > Materials > category > Fields,
// surfaced directly in the Materials list so changes don't require leaving the page.
function MaterialFieldsModal({ catId, catName, onClose, onChanged }) {
  const toast = useToast()
  const [visible, setVisible]   = useState(null)
  const [loading, setLoading]   = useState(true)
  const [adding, setAdding]     = useState(false)
  const [customFields, setCustomFields] = useState([])
  const [nf, setNf]             = useState({ label:'', field_type:'text', required:false, options:'' })
  const [saving, setSaving]     = useState(false)
  const [savedKey, setSavedKey] = useState(null)
  const settingsKey = `mat_cat_fields_${catId}`

  useEffect(() => {
    Promise.all([
      supabase.from('app_settings').select('value').eq('key', settingsKey).maybeSingle(),
      supabase.from('category_fields').select('*').eq('category_id', catId).order('sort_order'),
    ]).then(([{ data: cfg }, { data: cf }]) => {
      if (cfg?.value) setVisible(new Set(JSON.parse(cfg.value)))
      else setVisible(new Set(DEFAULT_VISIBLE_FIELDS))
      setCustomFields(cf || [])
      setLoading(false)
    })
  }, [catId])

  async function saveVisible(newSet, key) {
    setSaving(true)
    setSavedKey(key)
    await supabase.from('app_settings').upsert(
      { key: settingsKey, value: JSON.stringify([...newSet]) },
      { onConflict: 'key' }
    )
    setSaving(false)
    setTimeout(() => setSavedKey(null), 1500)
    onChanged?.({ visible: newSet, customFields })
  }

  function toggle(key) {
    const next = new Set(visible)
    if (next.has(key)) next.delete(key)
    else next.add(key)
    setVisible(next)
    saveVisible(next, key)
  }

  async function addCustom() {
    if (!nf.label.trim()) return
    const opts = nf.field_type==='select'
      ? nf.options.split(',').map(s=>s.trim()).filter(Boolean)
      : null
    const payload = { category_id: catId, label: nf.label.trim(), field_type: nf.field_type, sort_order: customFields.length }
    if (opts) payload.options = JSON.stringify(opts)
    const { data, error } = await supabase.from('category_fields').insert(payload).select().single()
    if (error) { toast(error.message, 'error'); return }
    const updated = [...customFields, data]
    setCustomFields(updated)
    setNf({ label:'', field_type:'text', required:false, options:'' })
    setAdding(false)
    toast('Field added ✓')
    onChanged?.({ visible, customFields: updated })
  }

  async function delCustom(id) {
    if (!confirm('Delete this field?')) return
    await supabase.from('category_fields').delete().eq('id', id)
    const updated = customFields.filter(f=>f.id!==id)
    setCustomFields(updated)
    onChanged?.({ visible, customFields: updated })
  }

  async function toggleReq(f) {
    const { error } = await supabase.from('category_fields').update({ required: !f.required }).eq('id', f.id)
    if (!error) {
      const updated = customFields.map(x => x.id===f.id ? {...x, required:!f.required} : x)
      setCustomFields(updated)
      onChanged?.({ visible, customFields: updated })
    }
  }

  return (
    <div style={{ position:'fixed', inset:0, zIndex:600, background:'rgba(0,0,0,0.45)', display:'flex', alignItems:'center', justifyContent:'center', padding:16 }}
      onClick={e=>e.target===e.currentTarget&&onClose()}>
      <div style={{ background:'#fff', borderRadius:14, width:'100%', maxWidth:540, maxHeight:'88vh', display:'flex', flexDirection:'column', boxShadow:'0 20px 60px rgba(0,0,0,0.2)' }}>
        <div style={{ padding:'16px 20px', borderBottom:'1px solid #F3F4F6', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
          <div>
            <div style={{ fontSize:15, fontWeight:700, color:'#2A3042' }}>Manage fields</div>
            <div style={{ fontSize:12, color:'#9CA3AF', marginTop:2 }}>{catName}</div>
          </div>
          <div style={{ display:'flex', alignItems:'center', gap:10 }}>
            {saving && <span style={{ fontSize:11, color:'#9CA3AF' }}>Saving…</span>}
            {!saving && savedKey && <span style={{ fontSize:11, color:'#1D9E75', fontWeight:600 }}>✓ Saved</span>}
            <button onClick={onClose} style={{ background:'none', border:'none', cursor:'pointer', color:'#9CA3AF', fontSize:22, lineHeight:1 }}>×</button>
          </div>
        </div>

        <div style={{ flex:1, overflowY:'auto', padding:'14px 20px' }}>
          {loading || !visible ? <div className="spinner" style={{ margin:'20px auto' }} /> : <>

            {/* Standard fields — toggle visibility, applied from the category template */}
            <div style={{ marginBottom:20 }}>
              <div style={{ fontSize:11, fontWeight:700, color:'#9CA3AF', textTransform:'uppercase', letterSpacing:'.06em', marginBottom:10 }}>
                Standard fields
              </div>
              <div style={{ fontSize:12, color:'#9CA3AF', marginBottom:12 }}>
                Toggle which fields appear for materials in this category — applies instantly, no need to leave this page
              </div>
              {['Identity','Specification','Ordering','Other'].map(group => {
                const gFields = ALL_STANDARD_FIELDS.filter(f => f.group === group)
                return (
                  <div key={group} style={{ marginBottom:14 }}>
                    <div style={{ fontSize:10, fontWeight:700, color:'#C4C9D4', textTransform:'uppercase', letterSpacing:'.05em', marginBottom:6, paddingLeft:2 }}>{group}</div>
                    {gFields.map(sf => {
                      const on = visible.has(sf.key)
                      return (
                        <div key={sf.key} onClick={()=>toggle(sf.key)}
                          style={{ display:'flex', alignItems:'center', gap:10, padding:'9px 12px',
                            background: on ? '#F0F4FF' : '#F9FAFB',
                            borderRadius:9, border:`1px solid ${on?'#C4D4F8':'#E8ECF0'}`, marginBottom:5, cursor:'pointer' }}>
                          <div style={{ width:36, height:20, borderRadius:10, background:on?'#5B8AF0':'#D1D5DB',
                            position:'relative', flexShrink:0, transition:'background .15s' }}>
                            <div style={{ position:'absolute', top:2, left:on?18:2, width:16, height:16,
                              borderRadius:'50%', background:'#fff', transition:'left .15s', boxShadow:'0 1px 3px rgba(0,0,0,0.2)' }}/>
                          </div>
                          <div style={{ flex:1, minWidth:0 }}>
                            <div style={{ fontSize:13, fontWeight:600, color: on?'#2A3042':'#9CA3AF' }}>{sf.label}</div>
                            <div style={{ fontSize:10, color:'#C4C9D4' }}>
                              {FIELD_TYPES.find(t=>t.value===sf.field_type)?.label}
                              {sf.options && ` · ${sf.options.slice(0,3).join(', ')}${sf.options.length>3?'…':''}`}
                            </div>
                          </div>
                          {on && <span style={{ fontSize:10, color: savedKey===sf.key ? '#1D9E75' : '#5B8AF0', fontWeight:700, transition:'color .3s', minWidth:40, textAlign:'right' }}>
                            {savedKey===sf.key ? '✓ Saved' : 'Visible'}
                          </span>}
                        </div>
                      )
                    })}
                  </div>
                )
              })}
            </div>

            {/* Custom fields */}
            <div>
              <div style={{ fontSize:11, fontWeight:700, color:'#9CA3AF', textTransform:'uppercase', letterSpacing:'.06em', marginBottom:10 }}>
                Custom fields
              </div>
              {customFields.length===0&&!adding && (
                <div style={{ textAlign:'center', padding:'16px 0', color:'#9CA3AF', fontSize:13, background:'#F9FAFB', borderRadius:9, marginBottom:8 }}>
                  No custom fields yet
                </div>
              )}
              {customFields.map(f => (
                <div key={f.id} style={{ display:'flex', alignItems:'center', gap:10, padding:'9px 12px', background:'#F9FAFB', borderRadius:9, border:'1px solid #E8ECF0', marginBottom:8 }}>
                  <div style={{ flex:1 }}>
                    <div style={{ fontSize:13, fontWeight:600, color:'#2A3042' }}>{f.label}</div>
                    <div style={{ fontSize:11, color:'#9CA3AF', marginTop:1 }}>
                      {FIELD_TYPES.find(t=>t.value===f.field_type)?.label}{f.required?' · Required':''}
                      {f.options && ` · ${(() => { try { const o = JSON.parse(f.options); return Array.isArray(o) ? o.join(', ') : String(f.options) } catch { return String(f.options) } })()}`}
                    </div>
                  </div>
                  <button onClick={()=>toggleReq(f)} style={{ fontSize:11, padding:'2px 8px', borderRadius:6, border:`1px solid ${f.required?'#86EFAC':'#E8ECF0'}`, background:f.required?'#F0FDF4':'#F9FAFB', color:f.required?'#166534':'#9CA3AF', cursor:'pointer' }}>
                    {f.required?'✓ Required':'Optional'}
                  </button>
                  <button onClick={()=>delCustom(f.id)} style={{ background:'none', border:'none', cursor:'pointer', color:'#D1D5DB', fontSize:16 }}
                    onMouseEnter={e=>e.currentTarget.style.color='#E24B4A'} onMouseLeave={e=>e.currentTarget.style.color='#D1D5DB'}>×</button>
                </div>
              ))}
              {adding && (
                <div style={{ background:'#F0F4FF', borderRadius:10, border:'1px solid #C4D4F8', padding:14 }}>
                  <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10, marginBottom:10 }}>
                    <div>
                      <label style={{ fontSize:11, fontWeight:600, color:'#6B7280', display:'block', marginBottom:4 }}>Label *</label>
                      <input autoFocus value={nf.label} onChange={e=>setNf(p=>({...p,label:e.target.value}))}
                        placeholder="e.g. Batch number" style={{ width:'100%', padding:'7px 10px', border:'1px solid #DDE3EC', borderRadius:7, fontSize:13, outline:'none', boxSizing:'border-box' }} />
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
                      <Btn onClick={addCustom} variant="primary" disabled={!nf.label.trim()}>Add field</Btn>
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

// ── FIELD MANAGER MODAL (legacy — custom fields only, kept for compatibility) ──
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
                {parseOptions(f.options).map(o => (
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
function UnitSelectCell({ val, w, onChange }) {
  const [unitOpts, setUnitOpts] = React.useState(['sheets','pcs','m','m²','m³','lm','kg','boxes','rolls','litres','sets','L','pairs'])
  React.useEffect(() => { loadUnitTypes().then(setUnitOpts) }, [])
  React.useEffect(() => {
    const handler = e => setUnitOpts(e.detail)
    window.addEventListener('unit-types-updated', handler)
    return () => window.removeEventListener('unit-types-updated', handler)
  }, [])
  return (
    <div style={{ width:w, minWidth:w, maxWidth:w, height:36, display:'flex', alignItems:'center', borderRight:'1px solid #E8ECF0', flexShrink:0, boxSizing:'border-box', padding:'0 6px' }}>
      <select value={val||''} onChange={e=>onChange(e.target.value)}
        style={{ width:'100%', border:'none', outline:'none', background:'transparent', fontSize:12, cursor:'pointer', color: val ? '#374151' : '#9CA3AF' }}>
        <option value="">— unit —</option>
        {unitOpts.map(u => <option key={u} value={u}>{u}</option>)}
      </select>
    </div>
  )
}

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
        style={{ width:'100%', border:'none', outline:'none', background:'transparent', fontSize:12, cursor:'pointer', color: val ? '#374151' : '#9CA3AF' }}>
        <option value="">—</option>
        {options.map(o=><option key={o} value={o}>{o}</option>)}
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
        : <span title={val||''} style={{ overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', width:'100%' }}>{val||placeholder}</span>
      }
    </div>
  )
}

// ── Category Tree Picker ──────────────────────────────────────────
function CategoryTreePicker({ allCats, currentCatId, title, onSelect, onClose }) {
  const [expanded, setExpanded] = React.useState(new Set())
  const [hovered, setHovered]   = React.useState(null)

  // Build tree from flat list
  function getChildren(parentId) {
    return allCats.filter(c => c.parent_id === parentId)
  }

  function CatNode({ cat, depth }) {
    const children = getChildren(cat.id)
    const isExpanded = expanded.has(cat.id)
    const isCurrent = cat.id === currentCatId

    return (
      <div>
        <div
          onMouseEnter={() => setHovered(cat.id)}
          onMouseLeave={() => setHovered(null)}
          style={{
            display:'flex', alignItems:'center', gap:6,
            padding:`7px 14px 7px ${14 + depth * 20}px`,
            cursor: isCurrent ? 'default' : 'pointer',
            background: hovered===cat.id && !isCurrent ? '#F5F7FF' : 'transparent',
            borderRadius:8, margin:'1px 6px',
            opacity: isCurrent ? 0.4 : 1,
          }}>
          {/* Expand toggle */}
          <span
            onClick={e => { e.stopPropagation(); setExpanded(prev => { const n=new Set(prev); n.has(cat.id)?n.delete(cat.id):n.add(cat.id); return n }) }}
            style={{ width:16, flexShrink:0, color:'#9CA3AF', fontSize:11, cursor: children.length ? 'pointer' : 'default', userSelect:'none' }}>
            {children.length > 0 ? (isExpanded ? '▾' : '▸') : ''}
          </span>
          {/* Folder icon */}
          <span style={{ fontSize:14 }}>{children.length > 0 ? '📁' : '📄'}</span>
          {/* Name */}
          <span style={{ fontSize:13, color: isCurrent ? '#9CA3AF' : '#2A3042', flex:1 }}
            onClick={() => !isCurrent && onSelect(cat.id)}>
            {cat.name}
          </span>
          {isCurrent && <span style={{ fontSize:10, color:'#9CA3AF', fontStyle:'italic' }}>current</span>}
          {!isCurrent && hovered===cat.id && (
            <button onClick={() => onSelect(cat.id)}
              style={{ padding:'3px 10px', borderRadius:6, border:'none', background:'#5B8AF0', color:'#fff', fontSize:11, fontWeight:600, cursor:'pointer', flexShrink:0 }}>
              Move here
            </button>
          )}
        </div>
        {isExpanded && children.map(child => <CatNode key={child.id} cat={child} depth={depth+1} />)}
      </div>
    )
  }

  const roots = allCats.filter(c => !c.parent_id)

  return (
    <div style={{ position:'fixed', inset:0, zIndex:1100, background:'rgba(0,0,0,0.4)', display:'flex', alignItems:'center', justifyContent:'center', padding:20 }}>
      <div style={{ background:'#fff', borderRadius:14, width:'100%', maxWidth:480, maxHeight:'70vh', display:'flex', flexDirection:'column', boxShadow:'0 20px 60px rgba(0,0,0,0.2)', overflow:'hidden' }}>
        <div style={{ padding:'14px 18px', borderBottom:'1px solid #E8ECF0', display:'flex', alignItems:'center', justifyContent:'space-between', flexShrink:0 }}>
          <div>
            <div style={{ fontSize:15, fontWeight:700, color:'#2A3042' }}>{title}</div>
            <div style={{ fontSize:12, color:'#9CA3AF', marginTop:2 }}>Click a category to move selected items there</div>
          </div>
          <button onClick={onClose} style={{ background:'none', border:'none', cursor:'pointer', fontSize:20, color:'#9CA3AF', lineHeight:1 }}>×</button>
        </div>
        <div style={{ overflowY:'auto', padding:'8px 0', flex:1 }}>
          {roots.map(cat => <CatNode key={cat.id} cat={cat} depth={0} />)}
        </div>
      </div>
    </div>
  )
}

// ── Image Library ─────────────────────────────────────────────────
// ImageLibrary is now imported from ../components/ImageLibrary


function ImageCell({ storagePath, matId, onUpdated, w=60 }) {
  const toast = useToast()
  const [showLib, setShowLib] = React.useState(false)
  const url = storagePath ? pubUrl(storagePath) : null

  async function handleSelect(img) {
    // Save the library image path to this material
    await supabase.from('materials').update({ storage_path: img.path }).eq('id', matId)
    onUpdated(img.path)
    setShowLib(false)
    toast('Image set ✓')
  }

  return (
    <>
      <div style={{ width:w, minWidth:w, maxWidth:w, height:36, display:'flex', alignItems:'center', justifyContent:'center', borderRight:'1px solid #E8ECF0', flexShrink:0, cursor:'pointer', position:'relative' }}
        onClick={() => setShowLib(true)} title="Click to pick from image library">
        {url
          ? <img src={url} style={{ width:28, height:28, borderRadius:5, objectFit:'cover', border:'1px solid #E8ECF0' }} alt="" />
          : <div style={{ width:28, height:28, borderRadius:5, background:'#F3F4F6', border:'1px dashed #DDE3EC', display:'flex', alignItems:'center', justifyContent:'center', fontSize:14, color:'#C4C9D4' }}>+</div>
        }
      </div>
      {showLib && <ImageLibrary onSelect={handleSelect} onClose={() => setShowLib(false)} />}
    </>
  )
}

function MaterialListView({ topCat, subCat, fields, allCats, onBack, onCatUpdated }) {
  const toast = useToast()
  const targetCat = subCat || topCat
  const [materials, setMaterials] = React.useState([])
  const [loading, setLoading]     = React.useState(true)
  const [catFields, setCatFields] = React.useState([])

  // Always load catFields fresh from DB when targetCat changes
  React.useEffect(() => {
    if (!targetCat?.id) return
    supabase.from('category_fields').select('*')
      .eq('category_id', targetCat.id).order('sort_order')
      .then(({ data }) => setCatFields(data || []))
  }, [targetCat?.id])
  const [search, setSearch]       = React.useState('')
  const [saving, setSaving]       = React.useState(false)
  const [lastSaved, setLastSaved] = React.useState(null)
  const [showFieldMgr, setShowFieldMgr] = React.useState(false)
  const [showPricebooksHere, setShowPricebooksHere] = React.useState(false)
  const [pricebookSupplierId, setPricebookSupplierId] = React.useState(null) // which supplier's pricebook to show when clicked
  const [relevantSuppliers, setRelevantSuppliers] = React.useState([]) // [{id, name}] — suppliers with pricebooks relevant to this view
  const [showSupplierPicker, setShowSupplierPicker] = React.useState(false)

  // A pricebook is "relevant" here if either:
  //  (a) it's the preferred supplier of one or more materials actually in this category, or
  //  (b) the category name itself matches a supplier name (e.g. a "Laminex" subcategory)
  // Only suppliers that actually have pricebook files uploaded are shown.
  React.useEffect(() => {
    let cancelled = false
    async function checkRelevance() {
      const catNames = [targetCat?.name, topCat?.name, subCat?.name].filter(Boolean).map(n => n.toLowerCase().trim())
      const matIds = materials.map(m => m.id)

      const [{ data: allSuppliers }, { data: pricebookRows }] = await Promise.all([
        supabase.from('suppliers').select('id,name'),
        supabase.from('supplier_pricebooks').select('supplier_id'),
      ])
      const suppliersWithBooks = new Set((pricebookRows || []).map(r => r.supplier_id))
      if (suppliersWithBooks.size === 0) { if (!cancelled) setRelevantSuppliers([]); return }

      const relevantIds = new Set()

      // (a) preferred suppliers of materials actually shown
      if (matIds.length > 0) {
        const { data: prefRows } = await supabase.from('material_suppliers')
          .select('supplier_id').in('material_id', matIds).eq('is_preferred', true)
        ;(prefRows || []).forEach(r => { if (suppliersWithBooks.has(r.supplier_id)) relevantIds.add(r.supplier_id) })
      }

      // (b) category name matches a supplier name
      ;(allSuppliers || []).forEach(s => {
        if (catNames.includes((s.name||'').toLowerCase().trim()) && suppliersWithBooks.has(s.id)) {
          relevantIds.add(s.id)
        }
      })

      if (cancelled) return
      const list = (allSuppliers || []).filter(s => relevantIds.has(s.id))
      setRelevantSuppliers(list)
    }
    checkRelevance()
    return () => { cancelled = true }
  }, [targetCat?.id, topCat?.id, subCat?.id, materials])
  const [showAddModal, setShowAddModal] = React.useState(false)
  const saveTimer = React.useRef()

  // All possible native + standard columns
  const ALL_COLS = [
    { key:'img',          label:'Image',          w:60,  type:'image' },
    { key:'name',         label:'Name',           w:220, type:'text',   required:true,  always:true },
    { key:'category_name',label:'Category',       w:150, type:'category', settingKey:'category_name' },
    { key:'supplier',     label:'Supplier',        w:160, type:'text',   settingKey:'supplier' },
    { key:'brand',        label:'Brand',           w:140, type:'text',   settingKey:'brand' },
    { key:'sku',          label:'SKU',             w:140, type:'text',   settingKey:'sku' },
    { key:'panel_type',   label:'Panel type',      w:140, type:'text',   settingKey:'panel_type' },
    { key:'thickness',    label:'Thickness',       w:110, type:'mm',     settingKey:'thickness' },
    { key:'colour_code',  label:'Colour',          w:140, type:'text',   settingKey:'colour_code' },
    { key:'finish',       label:'Finish',          w:140, type:'text',   settingKey:'finish' },
    { key:'grade',        label:'Grade',           w:120, type:'text',   settingKey:'grade' },
    { key:'edge_profile', label:'Edge profile',    w:140, type:'text',   settingKey:'edge_profile' },
    { key:'dimensions',   label:'Dimensions',      w:160, type:'text',   settingKey:'dimensions', placeholder:'e.g. 2400×1220' },
    { key:'weight',       label:'Weight (kg)',      w:110, type:'text',   settingKey:'weight' },
    { key:'price',        label:'Price',           w:110, type:'price',  settingKey:'price', placeholder:'0.00' },
    { key:'unit', label:'Unit', w:110, type:'unit_select', settingKey:'unit' },
    { key:'qty',          label:'Default qty',     w:100, type:'text',   settingKey:'qty' },
    { key:'lead_time',    label:'Lead time',       w:110, type:'text',   settingKey:'lead_time' },
    { key:'min_order',    label:'Min order',       w:110, type:'text',   settingKey:'min_order' },
    { key:'po_number',    label:'PO number',       w:140, type:'text',   settingKey:'po_number' },
    { key:'notes',        label:'Notes',           w:200, type:'text',   settingKey:'notes' },
  ]

  const [catVisibility, setCatVisibility] = React.useState(null)
  const [primaryField, setPrimaryField] = React.useState('name')
  // nameFields: ordered set of col keys whose values are joined to build the material name
  const [nameFields, setNameFields] = React.useState(new Set())

  useEffect(() => {
    Promise.all([
      supabase.from('app_settings').select('value').eq('key', `mat_cat_fields_${targetCat.id}`).maybeSingle(),
      supabase.from('app_settings').select('value').eq('key', `mat_primary_field_${targetCat.id}`).maybeSingle(),
      supabase.from('app_settings').select('value').eq('key', `mat_name_fields_${targetCat.id}`).maybeSingle(),
    ]).then(([{ data: cfg }, { data: pf }, { data: nf }]) => {
      if (cfg?.value) setCatVisibility(new Set(JSON.parse(cfg.value)))
      else setCatVisibility(new Set(['supplier','panel_type','thickness','colour_code','finish','price','notes']))
      if (pf?.value) setPrimaryField(pf.value)
      else setPrimaryField('name')
      if (nf?.value) setNameFields(new Set(JSON.parse(nf.value)))
      else setNameFields(new Set())
    })
  }, [targetCat.id])

  // Save nameFields to app_settings
  async function saveNameFields(newSet) {
    const settingsKey = `mat_name_fields_${targetCat.id}`
    const value = JSON.stringify([...newSet])
    const { error } = await supabase.from('app_settings')
      .upsert({ key: settingsKey, value, updated_at: new Date().toISOString() }, { onConflict: 'key' })
    if (error) {
      supabase.from('app_settings').insert({ key: settingsKey, value })
        .then(({ error: ie }) => { if (ie) supabase.from('app_settings').update({ value }).eq('key', settingsKey) })
    }
  }

  // Toggle a column's participation in the auto-name
  function toggleNameField(colKey, currentCols) {
    setNameFields(prev => {
      const next = new Set(prev)
      if (next.has(colKey)) next.delete(colKey)
      else next.add(colKey)
      saveNameFields(next)
      // Rebuild names for all materials with updated set
      rebuildAllNames(next, currentCols)
      return next
    })
  }

  // Get ordered ancestor categories for targetCat (closest first: parent, grandparent, etc.)
  // Returns array of { id, name, key } where key = 'cat_path_<id>'
  function getCatAncestors() {
    const ancestors = []
    let cur = allCats.find(c => c.id === targetCat.id)
    while (cur) {
      ancestors.unshift({ id: cur.id, name: cur.name, key: `cat_path_${cur.id}` })
      cur = cur.parent_id ? allCats.find(c => c.id === cur.parent_id) : null
    }
    return ancestors
  }

  // Build name for one material given current nameFields set and column order
  function buildName(m, nfSet, currentCols) {
    const cf = safeJSON(m.custom_fields)
    const NON_NATIVE_SET = new Set(['brand','sku','colour','grade','edge_profile','dimensions','weight','unit','qty','lead_time','min_order','po_number'])
    const parts = []
    // 1. Category path ancestors in order (top → bottom), only if starred
    const ancestors = getCatAncestors()
    ancestors.forEach(a => {
      if (nfSet.has(a.key)) parts.push(a.name)
    })
    // 2. Then each visible col in order (skip img, category_name, name)
    currentCols.forEach(col => {
      if (col.type === 'image' || col.key === 'category_name' || col.key === 'name') return
      if (!nfSet.has(col.key)) return
      let val = col.fieldId ? (cf[col.fieldId] || '') : NON_NATIVE_SET.has(col.key) ? (cf[col.key] || '') : (m[col.key] || '')
      if (!val) return
      // Append mm for mm-type fields
      if (col.type === 'mm' && val && !String(val).toLowerCase().includes('mm')) val = val + 'mm'
      parts.push(String(val).trim())
    })
    return parts.filter(Boolean).join(' ')
  }

  // Rebuild name for all materials (called when nameFields or col order changes)
  function rebuildAllNames(nfSet, currentCols) {
    if (!nfSet || nfSet.size === 0) return
    setMaterials(prev => prev.map(m => {
      const newName = buildName(m, nfSet, currentCols)
      if (!newName || newName === m.name) return m
      // Debounce-save the name update
      setTimeout(() => {
        supabase.from('materials').update({ name: newName }).eq('id', m.id).then(({ error }) => {
          if (error) console.warn('Auto-name save error:', error.message)
        })
      }, 0)
      return { ...m, name: newName }
    }))
  }

  // Column definitions — filtered by category visibility settings
  const coreCols = React.useMemo(() => {
    if (!catVisibility) return ALL_COLS.filter(c => c.always || c.type === 'image' || c.key === 'name')
    const visible = ALL_COLS.filter(c =>
      c.type === 'image' ||
      c.key === 'name' ||           // always show name column
      (c.key === 'category_name' && (allCats||[]).filter(c2 => c2.parent_id === targetCat.id).length > 0) ||
      (c.settingKey && c.settingKey !== 'category_name' && catVisibility.has(c.settingKey))
    )
    // Sort: image first, then name, then rest
    return [
      ...visible.filter(c => c.type === 'image'),
      ...visible.filter(c => c.key === 'name'),
      ...visible.filter(c => c.key !== 'name' && c.type !== 'image'),
    ]
  }, [catVisibility, allCats, targetCat.id])

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
        options: parseOptions(f.options),
        fieldId: f.id,
      }))
  }, [catFields])

  const [cols, setCols]           = React.useState([...coreCols, ...customCols])
  const [selectedIds, setSelectedIds] = React.useState(new Set())
  const [detailMaterial, setDetailMaterial] = React.useState(null)
  const [preferredSuppliers, setPreferredSuppliers] = React.useState({}) // material_id -> supplier name
  React.useEffect(() => { setCols([...coreCols, ...customCols]) }, [coreCols, customCols])
  const { getHeaderProps } = useDragColumns(cols, setCols)

  // Load the preferred supplier name for every material currently in view
  React.useEffect(() => {
    const ids = materials.map(m => m.id)
    if (ids.length === 0) { setPreferredSuppliers({}); return }
    supabase.from('material_suppliers').select('material_id, suppliers(name)').in('material_id', ids).eq('is_preferred', true)
      .then(({ data }) => {
        const map = {}
        ;(data || []).forEach(row => { if (row.suppliers?.name) map[row.material_id] = row.suppliers.name })
        setPreferredSuppliers(map)
      })
  }, [materials])

  // Refresh the preferred-supplier map when a supplier link changes elsewhere (e.g. the detail modal)
  React.useEffect(() => {
    function handler() {
      const ids = materials.map(m => m.id)
      if (ids.length === 0) return
      supabase.from('material_suppliers').select('material_id, suppliers(name)').in('material_id', ids).eq('is_preferred', true)
        .then(({ data }) => {
          const map = {}
          ;(data || []).forEach(row => { if (row.suppliers?.name) map[row.material_id] = row.suppliers.name })
          setPreferredSuppliers(map)
        })
    }
    window.addEventListener('materials-library-updated', handler)
    return () => window.removeEventListener('materials-library-updated', handler)
  }, [materials])

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
    q.then(({ data, error }) => {
      console.log('Materials result:', data?.length, 'error:', error?.message)
      setMaterials(data || [])
      setLoading(false)
    })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [targetCat.id, (allCats||[]).length])

  const [sortCol, setSortCol] = React.useState(null)  // col.key or null
  const [sortDir, setSortDir] = React.useState('asc')  // 'asc' | 'desc'
  const [showMovePicker, setShowMovePicker] = React.useState(false)

  function getMatVal(m, col) {
    if (!col) return ''
    const cf = safeJSON(m.custom_fields)
    const NON_NATIVE = new Set(['brand','sku','colour','grade','edge_profile','dimensions','weight','unit','qty','lead_time','min_order','po_number'])
    if (col.fieldId) return cf[col.fieldId] || ''
    if (NON_NATIVE.has(col.key)) return cf[col.key] || ''
    return m[col.key] ?? ''
  }

  const filtered = React.useMemo(() => {
    let result = materials.filter(m => {
      if (!search) return true
      const q = search.toLowerCase()
      const nativeMatch = [m.name, m.supplier, m.panel_type, m.thickness,
        m.colour_code, m.finish, m.notes, m.price]
        .some(v => v && String(v).toLowerCase().includes(q))
      if (nativeMatch) return true
      const cf = safeJSON(m.custom_fields)
      return Object.values(cf).some(v => v && String(v).toLowerCase().includes(q))
    })
    if (sortCol) {
      const col = cols.find(c => c.key === sortCol)
      result = [...result].sort((a, b) => {
        let av = getMatVal(a, col)
        let bv = getMatVal(b, col)
        // Numeric sort for mm / price / number-like values
        const an = parseFloat(String(av).replace(/[^0-9.-]/g,''))
        const bn = parseFloat(String(bv).replace(/[^0-9.-]/g,''))
        let cmp = (!isNaN(an) && !isNaN(bn))
          ? an - bn
          : String(av).toLowerCase().localeCompare(String(bv).toLowerCase())
        return sortDir === 'asc' ? cmp : -cmp
      })
    }
    return result
  }, [materials, search, sortCol, sortDir, cols])

  function triggerSave(updated) {
    clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(() => doSave(updated), 1500)
  }

  async function doSave(mats) {
    setSaving(true)
    // Only confirmed real columns on the materials table
    const DB_FIELDS = new Set(['id','name','supplier','panel_type','thickness',
      'colour_code','finish','price','notes','storage_path',
      'category_id','custom_fields'])
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
        let next
        if (patch._customFieldId) {
          const cf = safeJSON(m.custom_fields)
          next = { ...m, custom_fields: JSON.stringify({ ...cf, [patch._customFieldId]: patch._value }) }
        } else {
          next = { ...m, ...patch }
        }
        // Auto-rebuild name if nameFields is active
        if (nameFields.size > 0) {
          const newName = buildName(next, nameFields, cols)
          if (newName) next = { ...next, name: newName }
        }
        return next
      })
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
    const NATIVE = new Set(['name','supplier','panel_type','thickness','colour_code','finish','price','notes','storage_path','category_id','custom_fields'])
    let dbPatch = {}
    if (patch._customFieldId) {
      // Save the full custom_fields JSON (includes all custom field values for this material)
      dbPatch.custom_fields = mat.custom_fields || '{}'
    } else {
      Object.keys(patch).forEach(k => { if (NATIVE.has(k)) dbPatch[k] = patch[k] })
    }
    // Always include name if it was auto-rebuilt
    if (patch._customFieldId || (nameFields.size > 0 && mat.name)) {
      dbPatch.name = mat.name
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

  function addRow() {
    setShowAddModal(true)
  }

  function handleMaterialCreated(newMaterial) {
    setMaterials(prev => [...prev, newMaterial])
    setShowAddModal(false)
  }

  async function deleteRow(id) {
    if (!confirm('Delete this material?')) return
    await supabase.from('materials').delete().eq('id', id)
    setMaterials(prev => prev.filter(m => m.id !== id))
    toast('Deleted')
  }

  async function duplicateRow(m) {
    const { id, created_at, updated_at, ...rest } = m
    // Build name for the duplicate
    const dupName = nameFields.size > 0
      ? buildName(m, nameFields, cols)
      : (m.name ? `${m.name} (copy)` : 'Copy')
    const { data, error } = await supabase.from('materials')
      .insert({ ...rest, name: dupName, category_id: m.category_id || targetCat.id })
      .select().single()
    if (error) { toast(error.message, 'error'); return }
    setMaterials(prev => {
      const idx = prev.findIndex(x => x.id === m.id)
      const next = [...prev]
      next.splice(idx + 1, 0, data)
      return next
    })
    toast('Row duplicated ✓')
  }

  async function moveToCategory(catId) {
    const ids = [...selectedIds]
    const { error } = await supabase.from('materials').update({ category_id: catId }).in('id', ids)
    if (error) { toast(error.message, 'error'); return }
    setMaterials(prev => prev.filter(m => !selectedIds.has(m.id)))
    setSelectedIds(new Set())
    setShowMovePicker(false)
    const cat = allCats.find(c => c.id === catId)
    toast(`Moved ${ids.length} item${ids.length>1?'s':''} to "${cat?.name || 'category'}" ✓`)
  }

  const totalW = cols.reduce((a,c)=>a+c.w, 0) + 36 + 60 // + drag + actions

  return (
    <div>
      {showFieldMgr && (
        <MaterialFieldsModal catId={targetCat.id} catName={targetCat.name}
          onClose={() => setShowFieldMgr(false)}
          onChanged={({ visible, customFields }) => {
            setCatVisibility(new Set(visible))
            setCatFields(customFields)
          }} />
      )}

      {showAddModal && (
        <AddMaterialModal
          targetCat={targetCat}
          cols={cols}
          allCats={allCats}
          onClose={() => setShowAddModal(false)}
          onCreated={handleMaterialCreated}
        />
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
          {relevantSuppliers.length === 1 && (
            <Btn onClick={() => { setPricebookSupplierId(relevantSuppliers[0].id); setShowPricebooksHere(true) }}
              style={{ fontSize:12, background:'#FFF7ED', color:'#C2410C', border:'1px solid #FDBA74' }}>
              📚 View {relevantSuppliers[0].name} pricebook
            </Btn>
          )}
          {relevantSuppliers.length > 1 && (
            <div style={{ position:'relative' }}>
              <Btn onClick={() => setShowSupplierPicker(p => !p)} style={{ fontSize:12, background:'#FFF7ED', color:'#C2410C', border:'1px solid #FDBA74' }}>
                📚 View pricebook ▾
              </Btn>
              {showSupplierPicker && (
                <div style={{ position:'absolute', top:'calc(100% + 4px)', right:0, background:'#fff', borderRadius:10, boxShadow:'0 8px 24px rgba(0,0,0,0.15)', border:'1px solid #E8ECF0', zIndex:50, minWidth:180, overflow:'hidden' }}>
                  {relevantSuppliers.map(s => (
                    <button key={s.id} onClick={() => { setPricebookSupplierId(s.id); setShowPricebooksHere(true); setShowSupplierPicker(false) }}
                      style={{ width:'100%', padding:'9px 14px', border:'none', background:'none', cursor:'pointer', textAlign:'left', fontSize:13, color:'#2A3042', borderBottom:'1px solid #F3F4F6' }}
                      onMouseEnter={e=>e.currentTarget.style.background='#FFF7ED'}
                      onMouseLeave={e=>e.currentTarget.style.background='none'}>
                      {s.name}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
          <Btn onClick={() => setShowFieldMgr(true)} style={{ fontSize:12 }}>⚙ Fields</Btn>
          <Btn onClick={addRow} variant="green">+ Add material</Btn>
        </div>
      </div>

      {showPricebooksHere && (
        <PricebooksModal
          onClose={() => { setShowPricebooksHere(false); setPricebookSupplierId(null) }}
          supplierFilter={relevantSuppliers.find(s => s.id === pricebookSupplierId)?.name || null}
        />
      )}

      {/* search */}
      <div style={{ position:'relative', marginBottom:12, maxWidth:300 }}>
        <span style={{ position:'absolute', left:10, top:'50%', transform:'translateY(-50%)', color:'#9CA3AF', fontSize:14, pointerEvents:'none' }}>⌕</span>
        <input value={search} onChange={e=>setSearch(e.target.value)} placeholder={`Search ${targetCat.name}…`}
          style={{ width:'100%', padding:'8px 10px 8px 32px', border:'1px solid #DDE3EC', borderRadius:9, fontSize:13, outline:'none', boxSizing:'border-box' }} />
      </div>
      {sortCol && (
        <div style={{ display:'flex', alignItems:'center', gap:6, marginTop:8 }}>
          <span style={{ fontSize:11, color:'#6B7280' }}>Sorted by</span>
          <span style={{ fontSize:11, fontWeight:700, color:'#5B8AF0', background:'#EEF2FF', padding:'2px 8px', borderRadius:20, display:'flex', alignItems:'center', gap:4 }}>
            {cols.find(c=>c.key===sortCol)?.label || sortCol} {sortDir==='asc'?'↑':'↓'}
            <button onClick={()=>setSortCol(null)} style={{ background:'none', border:'none', cursor:'pointer', color:'#9CA3AF', fontSize:13, padding:'0 0 0 2px', lineHeight:1 }}>×</button>
          </span>
        </div>
      )}

      {loading ? (
        <div style={{ display:'flex', justifyContent:'center', padding:'40px 0' }}><div className="spinner" /></div>
      ) : (
        <div style={{ overflowX:'auto', borderRadius:12, border:'1px solid #E8ECF0', boxShadow:'0 1px 3px rgba(0,0,0,0.04)' }}>
          <div style={{ minWidth: totalW }}>

            {/* Bulk action bar */}
            {selectedIds.size > 0 && (
              <div style={{ padding:'8px 14px', background:'#EEF2FF', borderBottom:'1px solid #C7D2FE', display:'flex', alignItems:'center', gap:10, flexShrink:0 }}>
                <span style={{ fontSize:13, fontWeight:600, color:'#3730A3' }}>{selectedIds.size} selected</span>
                <button onClick={() => setShowMovePicker(true)}
                  style={{ padding:'5px 14px', borderRadius:8, border:'none', background:'#5B8AF0', color:'#fff', fontSize:12, fontWeight:600, cursor:'pointer', display:'flex', alignItems:'center', gap:5 }}>
                  ↗ Move to category
                </button>
                <button onClick={() => setSelectedIds(new Set())}
                  style={{ padding:'5px 10px', borderRadius:8, border:'1px solid #C7D2FE', background:'#fff', color:'#6B7280', fontSize:12, cursor:'pointer' }}>
                  Clear
                </button>
              </div>
            )}

            {/* header */}
            <div style={{ display:'flex', background:'#F9FAFB', borderBottom:'2px solid #E8ECF0', position:'sticky', top:0, zIndex:10 }}>
              {/* Select all checkbox */}
              <div style={{ width:36, flexShrink:0, borderRight:'1px solid #E8ECF0', display:'flex', alignItems:'center', justifyContent:'center' }}>
                <input type="checkbox"
                  checked={filtered.length > 0 && filtered.every(m => selectedIds.has(m.id))}
                  onChange={e => setSelectedIds(e.target.checked ? new Set(filtered.map(m=>m.id)) : new Set())}
                  style={{ cursor:'pointer', accentColor:'#5B8AF0' }} />
              </div>
              {cols.map((col,ci) => (
                <div key={col.key}
                  {...(col.key !== 'img' ? getHeaderProps(ci, col.label, {
                    width:col.w, minWidth:col.w, padding:'9px 8px',
                    fontSize:10, fontWeight:700,
                    color: nameFields.has(col.key) ? '#B45309' : '#9CA3AF',
                    background: nameFields.has(col.key) ? '#FFFBEB' : 'transparent',
                    textTransform:'uppercase', letterSpacing:'.06em',
                    borderRight:'1px solid #E8ECF0', flexShrink:0,
                    boxSizing:'border-box', display:'flex', alignItems:'center', gap:4,
                    position:'relative',
                  }) : {
                    style:{ width:col.w, minWidth:col.w, padding:'9px 8px',
                      fontSize:10, fontWeight:700, color:'#9CA3AF',
                      textTransform:'uppercase', letterSpacing:'.06em',
                      borderRight:'1px solid #E8ECF0', flexShrink:0,
                      boxSizing:'border-box', display:'flex', alignItems:'center', position:'relative' }
                  })}
                  className="mat-col-header">

                  {/* Star toggle — shown for all non-image cols; name col shows lock icon */}
                  {col.key !== 'img' && (
                    col.key === 'name'
                      ? <span style={{ fontSize:11, color:'#C4C9D4', flexShrink:0 }} title="Name is auto-built from ★ columns">🔒</span>
                      : <button
                          onClick={e => { e.stopPropagation(); toggleNameField(col.key, cols) }}
                          title={nameFields.has(col.key) ? 'Remove from auto-name' : 'Include in auto-name'}
                          style={{
                            background:'none', border:'none', cursor:'pointer', padding:0, flexShrink:0,
                            fontSize:12, lineHeight:1,
                            color: nameFields.has(col.key) ? '#F59E0B' : '#D1D5DB',
                            transition:'color .15s',
                          }}
                          className="star-toggle-btn">
                          {nameFields.has(col.key) ? '★' : '☆'}
                        </button>
                  )}

                  {/* Label — click to sort */}
                  {col.key !== 'img' ? (
                    <span
                      onClick={e => {
                        e.stopPropagation()
                        if (sortCol === col.key) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
                        else { setSortCol(col.key); setSortDir('asc') }
                      }}
                      title={`Sort by ${col.label}`}
                      style={{ cursor:'pointer', userSelect:'none', flex:1, display:'flex', alignItems:'center', gap:3 }}>
                      {col.label}
                      {sortCol === col.key
                        ? <span style={{ fontSize:10, color: nameFields.has(col.key) ? '#B45309' : '#5B8AF0' }}>
                            {sortDir === 'asc' ? ' ↑' : ' ↓'}
                          </span>
                        : null}
                    </span>
                  ) : null}

                  {/* Drag dots — only show when NOT starred (starred shows star already) */}
                  {col.key !== 'img' && col.key !== 'name' && !nameFields.has(col.key) && (
                    <svg style={{ marginLeft:'auto', flexShrink:0 }} width="8" height="10" viewBox="0 0 8 10" fill="#D1D5DB">
                      <circle cx="2" cy="2" r="1.2"/><circle cx="6" cy="2" r="1.2"/>
                      <circle cx="2" cy="5" r="1.2"/><circle cx="6" cy="5" r="1.2"/>
                      <circle cx="2" cy="8" r="1.2"/><circle cx="6" cy="8" r="1.2"/>
                    </svg>
                  )}

                  {/* Resize handle — drag to widen/narrow, double-click to auto-fit */}
                  <div
                    onMouseDown={e => {
                      e.stopPropagation()
                      e.preventDefault()
                      const startX = e.clientX
                      const startW = col.w
                      function onMove(ev) {
                        const newW = Math.max(60, startW + (ev.clientX - startX))
                        setCols(prev => prev.map(c => c.key === col.key ? { ...c, w: newW } : c))
                      }
                      function onUp() {
                        document.removeEventListener('mousemove', onMove)
                        document.removeEventListener('mouseup', onUp)
                      }
                      document.addEventListener('mousemove', onMove)
                      document.addEventListener('mouseup', onUp)
                    }}
                    onDoubleClick={e => {
                      e.stopPropagation()
                      setCols(prev => prev.map(c => c.key === col.key ? { ...c, w: Math.max(120, col.label.length * 10 + 50) } : c))
                    }}
                    title="Drag to resize, double-click to auto-fit"
                    style={{ position:'absolute', right:0, top:0, bottom:0, width:6, cursor:'col-resize', zIndex:5, background:'transparent' }}
                    onMouseEnter={e => e.currentTarget.style.background = 'rgba(91,138,240,0.3)'}
                    onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                  />
                </div>
              ))}
              <div style={{ width:40, flexShrink:0 }} />
            </div>
            <style>{`
              .mat-col-header:hover .star-toggle-btn { color: #F59E0B !important; }
              .name-preview-tooltip { display:none; }
              .mat-col-header:hover .name-preview-tooltip { display:block; }
              tr:hover .row-checkbox, div:hover > .row-checkbox { opacity: 1 !important; }
              tr:hover .row-view-btn, div:hover > .row-view-btn { opacity: 1 !important; }
            `}</style>

            {/* Category path toggle — let user star ancestor category names into the auto-name */}
            {(() => {
              const ancestors = getCatAncestors()
              if (ancestors.length === 0) return null
              return (
                <div style={{ padding:'7px 12px', borderBottom:'1px solid #E8ECF0', background:'#F9FAFB', display:'flex', alignItems:'center', gap:6, flexWrap:'wrap' }}>
                  <span style={{ fontSize:10, fontWeight:700, color:'#9CA3AF', textTransform:'uppercase', letterSpacing:'.05em', flexShrink:0, marginRight:4 }}>Include in name:</span>
                  {ancestors.map((a, i) => {
                    const starred = nameFields.has(a.key)
                    return (
                      <button key={a.key}
                        onClick={() => toggleNameField(a.key, cols)}
                        style={{
                          display:'flex', alignItems:'center', gap:4,
                          padding:'3px 10px', borderRadius:20, cursor:'pointer', fontSize:12,
                          border: starred ? '1.5px solid #F59E0B' : '1.5px solid #E8ECF0',
                          background: starred ? '#FFFBEB' : '#fff',
                          color: starred ? '#B45309' : '#6B7280',
                          fontWeight: starred ? 700 : 400,
                          transition:'all .12s',
                        }}>
                        <span style={{ fontSize:11 }}>{starred ? '★' : '☆'}</span>
                        {a.name}
                        {i < ancestors.length - 1 && <span style={{ fontSize:10, color:'#C4C9D4', marginLeft:2 }}>›</span>}
                      </button>
                    )
                  })}
                  <span style={{ fontSize:10, color:'#C4C9D4', marginLeft:4 }}>category path</span>
                </div>
              )
            })()}

            {/* Name preview bar — shown when nameFields is active */}
            {nameFields.size > 0 && (
              <div style={{ padding:'6px 12px', background:'#FFFBEB', borderBottom:'1px solid #FDE68A', display:'flex', alignItems:'center', gap:8 }}>
                <span style={{ fontSize:10, fontWeight:700, color:'#B45309', textTransform:'uppercase', letterSpacing:'.05em', flexShrink:0 }}>★ Name preview</span>
                <span style={{ fontSize:12, color:'#374151', fontStyle: materials.length===0 ? 'italic' : 'normal' }}>
                  {materials.length > 0
                    ? buildName(materials[0], nameFields, cols) || <span style={{ color:'#9CA3AF' }}>Fill in ★ columns to see preview</span>
                    : <span style={{ color:'#9CA3AF' }}>Add a material to see preview</span>
                  }
                </span>
                <span style={{ fontSize:10, color:'#9CA3AF', marginLeft:'auto', flexShrink:0 }}>based on first row</span>
              </div>
            )}

            {/* rows */}
            {filtered.length === 0 ? (
              <div style={{ padding:'40px 0', textAlign:'center', color:'#9CA3AF', fontSize:13 }}>
                {materials.length===0 ? 'No materials yet — click + Add material' : 'No results'}
              </div>
            ) : filtered.map((m, idx) => {
              const cf = safeJSON(m.custom_fields)
              const NON_NATIVE = ['brand','sku','colour','grade','edge_profile','dimensions','weight','unit','qty','lead_time','min_order','po_number']
              return (
                <div key={m.id}
                  style={{ display:'flex', alignItems:'center', background: idx%2===0?'#fff':'#FAFAFA', borderBottom:'1px solid #F3F4F6', position:'relative' }}>

                  <div style={{ width:36, height:36, display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0, borderRight:'1px solid #E8ECF0', gap:4 }}>
                    <input type="checkbox"
                      checked={selectedIds.has(m.id)}
                      onChange={e => setSelectedIds(prev => {
                        const next = new Set(prev)
                        e.target.checked ? next.add(m.id) : next.delete(m.id)
                        return next
                      })}
                      onClick={e=>e.stopPropagation()}
                      style={{ cursor:'pointer', accentColor:'#5B8AF0', opacity: selectedIds.has(m.id) ? 1 : 0, transition:'opacity .12s' }}
                      className="row-checkbox"
                    />
                    {!selectedIds.has(m.id) && <span style={{ color:'#D1D5DB', fontSize:12, cursor:'grab', position:'absolute' }}>⠿</span>}
                  </div>
                  {/* View detail button */}
                  <button onClick={() => setDetailMaterial(m)}
                    title="View details"
                    className="row-view-btn"
                    style={{ width:30, height:36, display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0, borderRight:'1px solid #E8ECF0', background:'none', border:'none', borderRightWidth:1, borderRightStyle:'solid', borderRightColor:'#E8ECF0', cursor:'pointer', color:'#C4C9D4', opacity:0, transition:'opacity .12s' }}
                    onMouseEnter={e=>e.currentTarget.style.color='#5B8AF0'}
                    onMouseLeave={e=>e.currentTarget.style.color='#C4C9D4'}>
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
                  </button>
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
                    // Name col is read-only when auto-name is active
                    if (col.key === 'name' && nameFields.size > 0) {
                      const builtName = buildName(m, nameFields, cols)
                      // Find starred cols that have no value yet
                      const missingStarred = cols.filter(c => {
                        if (c.type === 'image' || c.key === 'name' || !nameFields.has(c.key)) return false
                        const v = c.fieldId ? (safeJSON(m.custom_fields)[c.fieldId]||'') : (m[c.key]||'')
                        return !v
                      })
                      return (
                        <div key="name" style={{ width:col.w, minWidth:col.w, height:36, display:'flex', alignItems:'center', borderRight:'1px solid #E8ECF0', flexShrink:0, boxSizing:'border-box', padding:'0 8px', gap:5, overflow:'hidden' }}>
                          <span style={{ fontSize:12, color: builtName ? '#374151' : '#9CA3AF', fontWeight: builtName ? 500 : 400, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', flex:1 }}
                            title={missingStarred.length ? `Missing: ${missingStarred.map(c=>c.label).join(', ')}` : builtName}>
                            {builtName || <span style={{ color:'#C4C9D4', fontStyle:'italic' }}>Select ★ fields…</span>}
                          </span>
                          <span style={{ fontSize:9, fontWeight:700, color:'#D97706', background:'#FEF3C7', borderRadius:4, padding:'1px 4px', flexShrink:0 }}>AUTO</span>
                        </div>
                      )
                    }
                    // Unit col — use UnitSelectCell dropdown
                    if (col.type === 'unit_select') {
                      return (
                        <UnitSelectCell key="unit" val={val} w={col.w}
                          onChange={v => isNonNative
                            ? updateMat(m.id, { custom_fields: JSON.stringify({ ...cf, [col.key]: v }) })
                            : updateMat(m.id, { [col.key]: v })
                          } />
                      )
                    }
                    // Price col — plain price input (qty breaks now managed per-supplier in the Suppliers tab)
                    if (col.key === 'price') {
                      return (
                        <div key="price" style={{ width:col.w, minWidth:col.w, height:36, display:'flex', alignItems:'center', borderRight:'1px solid #E8ECF0', flexShrink:0, boxSizing:'border-box' }}>
                          <MCell value={val} w={col.w} type="price" placeholder="0.00"
                            onChange={v => updateMat(m.id, { price: v })} />
                        </div>
                      )
                    }
                    // Supplier col — shows the preferred supplier from material_suppliers,
                    // falling back to the plain supplier text field on the material itself
                    if (col.key === 'supplier') {
                      const preferred = preferredSuppliers[m.id] || m.supplier
                      return (
                        <div key="supplier" onClick={() => setDetailMaterial(m)}
                          title="Click to manage suppliers for this product"
                          style={{ width:col.w, minWidth:col.w, height:36, display:'flex', alignItems:'center', borderRight:'1px solid #E8ECF0', flexShrink:0, boxSizing:'border-box', padding:'0 10px', cursor:'pointer', gap:5, overflow:'hidden' }}
                          onMouseEnter={e=>e.currentTarget.style.background='#F9FAFB'}
                          onMouseLeave={e=>e.currentTarget.style.background='transparent'}>
                          {preferred ? (
                            <>
                              {preferredSuppliers[m.id] && <span style={{ fontSize:10, color:'#1D9E75', flexShrink:0 }}>★</span>}
                              <span style={{ fontSize:12, color:'#374151', fontWeight:500, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{preferred}</span>
                            </>
                          ) : (
                            <span style={{ fontSize:12, color:'#C4C9D4' }}>+ Add supplier</span>
                          )}
                        </div>
                      )
                    }
                    if (col.key === 'name' && m.is_kit) {
                      return (
                        <div key="name" style={{ width:col.w, minWidth:col.w, height:36, display:'flex', alignItems:'center', borderRight:'1px solid #E8ECF0', flexShrink:0, boxSizing:'border-box', padding:'0 8px', gap:5, overflow:'hidden' }}>
                          <span title="Kit — bundle of products" style={{ fontSize:13, flexShrink:0 }}>🧰</span>
                          <span style={{ fontSize:12, color:'#374151', fontWeight:600, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', flex:1 }} title={val}>
                            {val}
                          </span>
                        </div>
                      )
                    }
                    return (
                      <MCell key={col.key} value={val} w={col.w}
                        type={col.type} placeholder={col.placeholder||col.label}
                        onChange={v => isNonNative
                          ? updateMat(m.id, { custom_fields: JSON.stringify({ ...cf, [col.key]: v }) })
                          : updateMat(m.id, { [col.key]: v })
                        } />
                    )
                  })}
                  <div style={{ width:60, display:'flex', alignItems:'center', justifyContent:'center', gap:2, height:36, flexShrink:0 }}
                    onMouseEnter={e=>{ e.currentTarget.querySelectorAll('.row-action-btn').forEach(b=>b.style.opacity='1') }}
                    onMouseLeave={e=>{ e.currentTarget.querySelectorAll('.row-action-btn').forEach(b=>b.style.opacity='0') }}>
                    <button className="row-action-btn" onClick={()=>duplicateRow(m)}
                      title="Duplicate row"
                      style={{ background:'none', border:'none', cursor:'pointer', color:'#9CA3AF', fontSize:14, lineHeight:1, padding:'3px 4px', borderRadius:4, opacity:0, transition:'opacity .12s, color .12s' }}
                      onMouseEnter={e=>e.currentTarget.style.color='#5B8AF0'}
                      onMouseLeave={e=>e.currentTarget.style.color='#9CA3AF'}>⧉</button>
                    <button className="row-action-btn" onClick={()=>deleteRow(m.id)}
                      title="Delete row"
                      style={{ background:'none', border:'none', cursor:'pointer', color:'#9CA3AF', fontSize:16, lineHeight:1, padding:'2px 4px', borderRadius:4, opacity:0, transition:'opacity .12s, color .12s' }}
                      onMouseEnter={e=>e.currentTarget.style.color='#E24B4A'}
                      onMouseLeave={e=>e.currentTarget.style.color='#9CA3AF'}>×</button>
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

      {/* Move to category picker */}
      {showMovePicker && (
        <CategoryTreePicker
          allCats={allCats}
          currentCatId={targetCat.id}
          title={`Move ${selectedIds.size} item${selectedIds.size>1?'s':''} to…`}
          onSelect={moveToCategory}
          onClose={() => setShowMovePicker(false)} />
      )}

      {/* Material detail / edit popout — same modal used for creating */}
      {detailMaterial && (
        <AddMaterialModal
          material={detailMaterial}
          targetCat={targetCat}
          cols={cols}
          allCats={allCats}
          onClose={() => setDetailMaterial(null)}
          onUpdated={updated => {
            setMaterials(prev => prev.map(m => m.id === updated.id ? { ...m, ...updated } : m))
            setDetailMaterial(null)
          }}
          onDeleted={id => {
            setMaterials(prev => prev.filter(m => m.id !== id))
            setDetailMaterial(null)
          }}
        />
      )}
    </div>
  )
}



// ── Main export ───────────────────────────────────────────────────
// ── View Pricebooks modal — browse every supplier's uploaded pricebooks ──
function fileIconForPricebook(type) {
  if (type?.includes('pdf')) return '📄'
  if (type?.startsWith('image/')) return '🖼'
  if (type?.includes('sheet') || type?.includes('excel') || type?.includes('csv')) return '📊'
  if (type?.includes('word') || type?.includes('document')) return '📝'
  return '📎'
}
function formatSizeForPricebook(bytes) {
  if (!bytes) return ''
  if (bytes < 1024) return bytes + ' B'
  if (bytes < 1048576) return (bytes/1024).toFixed(1) + ' KB'
  return (bytes/1048576).toFixed(1) + ' MB'
}

function PricebookFileViewer({ file, onClose }) {
  const url = pubUrl(file.storage_path)
  const isPdf = file.type?.includes('pdf')
  const isImage = file.type?.startsWith('image/')
  const isViewable = isPdf || isImage

  return (
    <div style={{ position:'fixed', inset:0, zIndex:10000, background:'rgba(0,0,0,0.6)', display:'flex', alignItems:'center', justifyContent:'center', padding:20 }}
      onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={{ background:'#fff', borderRadius:14, width:'100%', maxWidth: isViewable ? 900 : 420, height: isViewable ? '88vh' : 'auto', display:'flex', flexDirection:'column', boxShadow:'0 20px 60px rgba(0,0,0,0.3)', overflow:'hidden' }}>
        <div style={{ padding:'12px 18px', borderBottom:'1px solid #F3F4F6', display:'flex', alignItems:'center', justifyContent:'space-between', flexShrink:0 }}>
          <div style={{ display:'flex', alignItems:'center', gap:8, minWidth:0 }}>
            <span style={{ fontSize:18, flexShrink:0 }}>{fileIconForPricebook(file.type)}</span>
            <div style={{ fontSize:14, fontWeight:700, color:'#2A3042', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{file.name}</div>
          </div>
          <div style={{ display:'flex', alignItems:'center', gap:8, flexShrink:0 }}>
            <a href={url} target="_blank" rel="noopener noreferrer"
              style={{ fontSize:12, fontWeight:600, color:'#5B8AF0', textDecoration:'none', padding:'6px 12px', borderRadius:8, border:'1px solid #C4D4F8', background:'#F0F4FF' }}>
              Open in new tab
            </a>
            <button onClick={onClose} style={{ background:'none', border:'none', cursor:'pointer', color:'#9CA3AF', fontSize:22, lineHeight:1 }}>×</button>
          </div>
        </div>
        <div style={{ flex:1, overflow:'auto', background:'#F3F4F6', display:'flex', alignItems:'center', justifyContent:'center' }}>
          {isPdf ? (
            <iframe src={url} title={file.name} style={{ width:'100%', height:'100%', border:'none' }} />
          ) : isImage ? (
            <img src={url} alt={file.name} style={{ maxWidth:'100%', maxHeight:'100%', objectFit:'contain' }} />
          ) : (
            <div style={{ textAlign:'center', padding:'40px 30px' }}>
              <div style={{ fontSize:40, marginBottom:12 }}>{fileIconForPricebook(file.type)}</div>
              <div style={{ fontSize:14, fontWeight:600, color:'#2A3042', marginBottom:6 }}>{file.name}</div>
              <div style={{ fontSize:12, color:'#9CA3AF', marginBottom:16 }}>This file type can't be previewed in-app — open it in a new tab instead.</div>
              <a href={url} target="_blank" rel="noopener noreferrer"
                style={{ display:'inline-block', fontSize:13, fontWeight:700, color:'#fff', background:'#5B8AF0', padding:'9px 18px', borderRadius:9, textDecoration:'none' }}>
                Open in new tab
              </a>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function PricebooksModal({ onClose, supplierFilter }) {
  const [loading, setLoading] = useState(true)
  const [bySupplier, setBySupplier] = useState([]) // [{ supplier, files: [...] }]
  const [search, setSearch] = useState('')
  const [viewerFile, setViewerFile] = useState(null)

  useEffect(() => {
    let supplierQuery = supabase.from('suppliers').select('id,name').order('name')
    if (supplierFilter) supplierQuery = supplierQuery.ilike('name', supplierFilter)
    Promise.all([
      supplierQuery,
      supabase.from('supplier_pricebooks').select('*').order('created_at', { ascending: false }),
    ]).then(([{ data: suppliers }, { data: files }]) => {
      const grouped = (suppliers || []).map(s => ({
        supplier: s,
        files: (files || []).filter(f => f.supplier_id === s.id),
      })).filter(g => g.files.length > 0)
      setBySupplier(grouped)
      setLoading(false)
    })
  }, [supplierFilter])

  const filtered = bySupplier
    .map(g => ({
      ...g,
      files: search.trim()
        ? g.files.filter(f => f.name.toLowerCase().includes(search.toLowerCase()) || g.supplier.name.toLowerCase().includes(search.toLowerCase()))
        : g.files,
    }))
    .filter(g => g.files.length > 0)

  const totalFiles = bySupplier.reduce((sum, g) => sum + g.files.length, 0)

  return (
    <div style={{ position:'fixed', inset:0, zIndex:9999, background:'rgba(0,0,0,0.5)', display:'flex', alignItems:'center', justifyContent:'center', padding:16 }}
      onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={{ background:'#fff', borderRadius:16, width:'100%', maxWidth:560, maxHeight:'85vh', display:'flex', flexDirection:'column', boxShadow:'0 20px 60px rgba(0,0,0,0.25)', overflow:'hidden' }}>
        <div style={{ padding:'16px 20px', borderBottom:'1px solid #F3F4F6', display:'flex', justifyContent:'space-between', alignItems:'flex-start', flexShrink:0 }}>
          <div>
            <div style={{ fontSize:17, fontWeight:800, color:'#2A3042' }}>📚 {supplierFilter ? `${supplierFilter} Pricebook` : 'Pricebooks'}</div>
            <div style={{ fontSize:11, color:'#9CA3AF', marginTop:2 }}>{totalFiles} file{totalFiles!==1?'s':''}{!supplierFilter ? ` across ${bySupplier.length} supplier${bySupplier.length!==1?'s':''}` : ''}</div>
          </div>
          <button onClick={onClose} style={{ background:'none', border:'none', cursor:'pointer', color:'#9CA3AF', fontSize:24, lineHeight:1, flexShrink:0 }}>×</button>
        </div>

        <div style={{ padding:'12px 20px', borderBottom:'1px solid #F3F4F6', flexShrink:0 }}>
          <input value={search} onChange={e => setSearch(e.target.value)} autoFocus
            placeholder="Search by supplier or file name…"
            style={{ width:'100%', padding:'8px 12px', border:'1px solid #DDE3EC', borderRadius:9, fontSize:13, outline:'none', boxSizing:'border-box' }} />
        </div>

        <div style={{ flex:1, overflowY:'auto', padding:'14px 20px' }}>
          {loading ? (
            <div className="spinner" style={{ margin:'30px auto' }} />
          ) : filtered.length === 0 ? (
            <div style={{ textAlign:'center', padding:'30px 0', color:'#9CA3AF', fontSize:13 }}>
              {bySupplier.length === 0
                ? <>No pricebooks uploaded yet — add them from a supplier's <strong>Pricebook</strong> tab in Suppliers.</>
                : 'No files match your search'}
            </div>
          ) : filtered.map(g => (
            <div key={g.supplier.id} style={{ marginBottom:16 }}>
              <div style={{ fontSize:11, fontWeight:700, color:'#9CA3AF', textTransform:'uppercase', letterSpacing:'.05em', marginBottom:6 }}>
                {g.supplier.name}
              </div>
              <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
                {g.files.map(f => (
                  <div key={f.id} onClick={() => setViewerFile(f)}
                    style={{ display:'flex', alignItems:'center', gap:10, padding:'9px 12px', background:'#F9FAFB', borderRadius:9, border:'1px solid #E8ECF0', cursor:'pointer' }}
                    onMouseEnter={e=>e.currentTarget.style.background='#F0F4FF'}
                    onMouseLeave={e=>e.currentTarget.style.background='#F9FAFB'}>
                    <span style={{ fontSize:18, flexShrink:0 }}>{fileIconForPricebook(f.type)}</span>
                    <div style={{ flex:1, minWidth:0 }}>
                      <div style={{ fontSize:13, fontWeight:600, color:'#2A3042', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{f.name}</div>
                      <div style={{ fontSize:11, color:'#9CA3AF' }}>
                        {formatSizeForPricebook(f.size)}{f.created_at ? ` · ${new Date(f.created_at).toLocaleDateString('en-NZ',{day:'numeric',month:'short',year:'numeric'})}` : ''}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>

      {viewerFile && <PricebookFileViewer file={viewerFile} onClose={() => setViewerFile(null)} />}
    </div>
  )
}

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
  // BUT if we arrived with a state.stack (e.g. from MaterialSettings), use that
  useEffect(() => {
    if (location.state?.stack?.length) {
      setStack(location.state.stack)
    } else {
      setStack([])
    }
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
                      if (m.is_kit) { setGlobalSearch(''); setGlobalResults([]); setShowKits(true); return }
                      const cat = allCats.find(c => c.id === m.category_id)
                      if (cat) {
                        const parent = allCats.find(c => c.id === cat.parent_id)
                        if (parent) setStack([parent.id, cat.id])
                        else setStack([cat.id])
                        setGlobalSearch(''); setGlobalResults([])
                      }
                    }}
                    style={{ display:'flex', alignItems:'center', gap:12, padding:'10px 14px', borderBottom: i < globalResults.length-1 ? '1px solid #F3F4F6' : 'none', cursor: (m.category_id || m.is_kit) ? 'pointer' : 'default' }}
                    onMouseEnter={e => { if (m.category_id || m.is_kit) e.currentTarget.style.background='#F9FAFB' }}
                    onMouseLeave={e => e.currentTarget.style.background='transparent'}>
                    <div style={{ width:36, height:36, borderRadius:8, background:m.color||'#E8ECF0', flexShrink:0, overflow:'hidden' }}>
                      {m.storage_path && <img src={`https://awwfqwxbqquknigvsoox.supabase.co/storage/v1/object/public/job-files/${m.storage_path}`} style={{ width:'100%', height:'100%', objectFit:'cover' }} alt="" />}
                    </div>
                    <div style={{ flex:1, minWidth:0 }}>
                      <div style={{ fontSize:13, fontWeight:600, color:'#2A3042', display:'flex', alignItems:'center', gap:5 }}>
                        {m.is_kit && <span title="Kit">🧰</span>}
                        {m.name}
                      </div>
                      <div style={{ fontSize:11, color:'#9CA3AF' }}>
                        {[m.supplier, m.panel_type, m.thickness ? m.thickness+'mm' : null].filter(Boolean).join(' · ')}
                        {m.category_id && <span style={{ marginLeft:6, color:'#C4D4F8' }}>· {allCats.find(c=>c.id===m.category_id)?.name}</span>}
                        {m.is_kit && !m.category_id && <span style={{ marginLeft:6, color:'#F97316' }}>· Kit</span>}
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
