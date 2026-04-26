import { useState, useEffect, useRef } from 'react'
import { supabase, BUCKET, pubUrl } from '../lib/supabase'
import { useToast } from '../components/Toast'
import BackButton from '../components/BackButton'

const PANEL_TYPES = ['MDF','Particle Board','Plywood','Solid Timber','HMR MDF','Melamine','Laminate','Other']
const FINISHES    = ['Matte','Gloss','Satin','Textured','Raw','Other']

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

function MaterialForm({ material, onSave, onCancel }) {
  const toast  = useToast()
  const fileRef = useRef()
  const [f, setF] = useState({
    name: material?.name || '', supplier: material?.supplier || '',
    panel_type: material?.panel_type || 'MDF', thickness: material?.thickness || '',
    colour_code: material?.colour_code || '', finish: material?.finish || 'Matte',
    notes: material?.notes || '',
  })
  const [preview, setPreview] = useState(material?.storage_path ? pubUrl(material.storage_path) : null)
  const [file, setFile]       = useState(null)
  const [saving, setSaving]   = useState(false)
  const set = k => e => setF(p => ({ ...p, [k]: e.target.value }))

  function handleFile(e) {
    const f2 = e.target.files[0]; if (!f2) return
    setFile(f2)
    setPreview(URL.createObjectURL(f2))
  }

  async function save() {
    if (!f.name) { toast('Please enter a name', 'error'); return }
    setSaving(true)
    let storage_path = material?.storage_path || null
    if (file) {
      try {
        const compressed = await compressImage(file)
        const path = `materials/${Date.now()}_swatch.jpg`
        const { error: upErr } = await supabase.storage.from(BUCKET).upload(path, compressed, { contentType: 'image/jpeg', upsert: true })
        if (!upErr) {
          if (storage_path && storage_path !== path) await supabase.storage.from(BUCKET).remove([storage_path])
          storage_path = path
        } else toast('Image upload failed: ' + upErr.message, 'error')
      } catch (e) { toast('Image error', 'error') }
    }
    const row = { ...f, thickness: f.thickness || null, storage_path }
    const { data, error } = material?.id
      ? await supabase.from('materials').update(row).eq('id', material.id).select().single()
      : await supabase.from('materials').insert(row).select().single()
    setSaving(false)
    if (error) { toast(error.message, 'error'); return }
    toast('Material saved ✓')
    onSave(data)
  }

  return (
    <div className="card p-5 mb-4">
      <h2 className="text-sm font-semibold text-gray-700 dark:text-zinc-300 mb-4">{material?.id ? 'Edit material' : 'Add material'}</h2>
      {/* swatch upload */}
      <div onClick={() => fileRef.current.click()}
        className="relative w-full h-28 rounded-xl border-2 border-dashed border-gray-200 dark:border-zinc-600 flex items-center justify-center cursor-pointer overflow-hidden mb-4 hover:border-gray-300 transition-colors">
        {preview
          ? <img src={preview} alt="" className="w-full h-full object-cover" />
          : <div className="flex flex-col items-center gap-1 text-gray-400"><span className="text-3xl">🎨</span><span className="text-xs">Tap to add colour sample</span></div>
        }
        <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleFile} />
      </div>
      <div className="grid grid-cols-2 gap-3 mb-4">
        <div className="col-span-2"><label className="label">Material name / colour *</label><input className="input" placeholder="e.g. Laminex Natural Oak" value={f.name} onChange={set('name')} /></div>
        <div><label className="label">Supplier</label><input className="input" placeholder="e.g. Laminex" value={f.supplier} onChange={set('supplier')} /></div>
        <div><label className="label">Panel type</label>
          <select className="input" value={f.panel_type} onChange={set('panel_type')}>
            {PANEL_TYPES.map(t => <option key={t}>{t}</option>)}
          </select>
        </div>
        <div><label className="label">Thickness (mm)</label><input className="input" type="number" placeholder="18" value={f.thickness} onChange={set('thickness')} /></div>
        <div><label className="label">Colour code</label><input className="input" placeholder="8255K" value={f.colour_code} onChange={set('colour_code')} /></div>
        <div><label className="label">Finish</label>
          <select className="input" value={f.finish} onChange={set('finish')}>
            {FINISHES.map(x => <option key={x}>{x}</option>)}
          </select>
        </div>
        <div className="col-span-2"><label className="label">Notes</label><input className="input" placeholder="Any additional notes…" value={f.notes} onChange={set('notes')} /></div>
      </div>
      <div className="flex gap-2">
        <button onClick={save} disabled={saving} className="btn-green disabled:opacity-50">{saving ? 'Saving…' : 'Save material'}</button>
        <button onClick={onCancel} className="btn">Cancel</button>
      </div>
    </div>
  )
}

export default function Materials() {
  const toast = useToast()
  const [materials, setMaterials] = useState([])
  const [loading, setLoading]     = useState(true)
  const [typeFilter, setTypeFilter] = useState('All')
  const [editing, setEditing]     = useState(null)

  useEffect(() => {
    supabase.from('materials').select('*').order('name').then(({ data }) => {
      setMaterials(data || [])
      setLoading(false)
    })
  }, [])

  const types = ['All', ...new Set(materials.map(m => m.panel_type).filter(Boolean))]
  const filtered = typeFilter === 'All' ? materials : materials.filter(m => m.panel_type === typeFilter)

  function onSaved(m) {
    setMaterials(prev => {
      const i = prev.findIndex(x => x.id === m.id)
      return i >= 0 ? prev.map((x, j) => j === i ? m : x) : [...prev, m].sort((a,b) => a.name.localeCompare(b.name))
    })
    setEditing(null)
  }

  async function deleteMaterial(m) {
    if (!confirm(`Delete "${m.name}"?`)) return
    if (m.storage_path) await supabase.storage.from(BUCKET).remove([m.storage_path])
    await supabase.from('materials').delete().eq('id', m.id)
    setMaterials(prev => prev.filter(x => x.id !== m.id))
    toast('Material deleted')
  }

  return (
    <div>
      <BackButton to="/settings" label="Settings" />
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-xl font-bold text-gray-900 dark:text-white">Materials</h1>
        <button onClick={() => setEditing('new')} className="btn-green">+ Add material</button>
      </div>

      {editing && (
        <MaterialForm
          material={editing === 'new' ? null : editing}
          onSave={onSaved}
          onCancel={() => setEditing(null)}
        />
      )}

      {/* type filters */}
      <div className="flex gap-2 flex-wrap mb-4">
        {types.map(t => (
          <button key={t} onClick={() => setTypeFilter(t)}
            className={`text-xs px-3 py-1.5 rounded-full border cursor-pointer transition-colors ${typeFilter === t ? 'bg-gray-900 text-white border-gray-900 dark:bg-white dark:text-gray-900' : 'bg-white dark:bg-zinc-800 border-gray-200 dark:border-zinc-700 text-gray-600 dark:text-zinc-300 hover:border-gray-300'}`}>
            {t}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex justify-center py-12"><div className="spinner" /></div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
          {filtered.map(m => (
            <div key={m.id} className="card overflow-hidden cursor-pointer hover:border-gray-300 dark:hover:border-zinc-600 transition-colors">
              {m.storage_path
                ? <img src={pubUrl(m.storage_path)} alt={m.name} className="w-full h-20 object-cover" loading="lazy" />
                : <div className="w-full h-20 bg-gray-100 dark:bg-zinc-700 flex items-center justify-center text-2xl">🎨</div>
              }
              <div className="p-3">
                <div className="text-sm font-semibold text-gray-900 dark:text-white mb-0.5 truncate">{m.name}</div>
                <div className="text-xs text-gray-400 mb-2">{m.supplier || '—'}</div>
                <div className="flex flex-wrap gap-1 mb-2">
                  {m.panel_type && <span className="text-[10px] px-1.5 py-0.5 rounded bg-gray-100 dark:bg-zinc-700 text-gray-500 dark:text-zinc-400">{m.panel_type}</span>}
                  {m.thickness  && <span className="text-[10px] px-1.5 py-0.5 rounded bg-gray-100 dark:bg-zinc-700 text-gray-500 dark:text-zinc-400">{m.thickness}mm</span>}
                  {m.finish     && <span className="text-[10px] px-1.5 py-0.5 rounded bg-gray-100 dark:bg-zinc-700 text-gray-500 dark:text-zinc-400">{m.finish}</span>}
                </div>
                <div className="flex gap-1">
                  <button onClick={() => setEditing(m)} className="btn btn-sm flex-1 text-xs py-1">Edit</button>
                  <button onClick={() => deleteMaterial(m)} className="btn btn-sm btn-red text-xs px-2 py-1">×</button>
                </div>
              </div>
            </div>
          ))}
          <button onClick={() => setEditing('new')}
            className="border-2 border-dashed border-gray-200 dark:border-zinc-700 rounded-xl flex items-center justify-center text-sm text-gray-400 hover:border-gray-300 cursor-pointer min-h-[160px] bg-transparent">
            + Add material
          </button>
        </div>
      )}
    </div>
  )
}
