import { useState, useEffect, useRef } from 'react'
import { supabase, BUCKET, pubUrl } from '../lib/supabase'
import { useToast } from '../components/Toast'
import BackButton from '../components/BackButton'

const APPLIANCE_TYPES = [
  'Oven','Microwave','Combi Steam Oven','Warming Drawer',
  'Cooktop','Induction Cooktop','Gas Cooktop',
  'Rangehood','Dishwasher','Fridge','Freezer',
  'Sink','Tap','Waste Disposal',
  'Washing Machine','Dryer','Other'
]

const DIM_FIELDS = [
  { key:'width',         label:'Width',          unit:'mm', group:'unit' },
  { key:'height',        label:'Height',         unit:'mm', group:'unit' },
  { key:'depth',         label:'Depth',          unit:'mm', group:'unit' },
  { key:'cutout_width',  label:'Cutout width',   unit:'mm', group:'cutout' },
  { key:'cutout_height', label:'Cutout height',  unit:'mm', group:'cutout' },
  { key:'cutout_depth',  label:'Cutout depth',   unit:'mm', group:'cutout' },
]

async function compressImage(file, maxPx=800, quality=0.82) {
  return new Promise((resolve,reject) => {
    const img = new Image()
    const url = URL.createObjectURL(file)
    img.onload = () => {
      URL.revokeObjectURL(url)
      let { width, height } = img
      if (width>maxPx||height>maxPx) {
        if (width>height){height=Math.round(height*(maxPx/width));width=maxPx}
        else{width=Math.round(width*(maxPx/height));height=maxPx}
      }
      const cv=document.createElement('canvas'); cv.width=width; cv.height=height
      cv.getContext('2d').drawImage(img,0,0,width,height)
      cv.toBlob(resolve,'image/jpeg',quality)
    }
    img.onerror=reject; img.src=url
  })
}

// ── File icon ─────────────────────────────────────────────────────
function fileIcon(name='') {
  const ext = name.split('.').pop().toLowerCase()
  if (['pdf'].includes(ext)) return '📄'
  if (['dwg','dxf'].includes(ext)) return '📐'
  if (['jpg','jpeg','png','webp'].includes(ext)) return '🖼'
  return '📎'
}

// ── Dimension tile ────────────────────────────────────────────────
function DimTile({ label, value, color, bg }) {
  const has = value !== null && value !== undefined && value !== ''
  return (
    <div style={{ borderRadius:10, border:`1.5px solid ${has?color+'55':'#E8ECF0'}`, background:has?bg:'#FAFAFA', padding:'10px 12px' }}>
      <div style={{ fontSize:10, fontWeight:700, color:has?color:'#9CA3AF', textTransform:'uppercase', letterSpacing:'.05em', marginBottom:6 }}>{label}</div>
      <div style={{ fontSize:22, fontWeight:800, color:has?'#2A3042':'#C4C9D4', lineHeight:1 }}>
        {has ? value : '—'}
        {has && <span style={{ fontSize:12, fontWeight:700, color, marginLeft:4 }}>mm</span>}
      </div>
    </div>
  )
}

// ── Appliance Form ────────────────────────────────────────────────
function ApplianceForm({ appliance, onSave, onCancel }) {
  const toast = useToast()
  const fileRef = useRef()
  const attRef = useRef()

  const [f, setF] = useState({
    brand:         appliance?.brand         || '',
    model:         appliance?.model         || '',
    type:          appliance?.type          || 'Oven',
    width:         appliance?.width         || '',
    height:        appliance?.height        || '',
    depth:         appliance?.depth         || '',
    cutout_width:  appliance?.cutout_width  || '',
    cutout_height: appliance?.cutout_height || '',
    cutout_depth:  appliance?.cutout_depth  || '',
    notes:         appliance?.notes         || '',
  })
  const set = k => e => setF(p=>({...p,[k]:e.target.value}))

  const [preview, setPreview]   = useState(appliance?.image_path ? pubUrl(appliance.image_path) : null)
  const [imgFile, setImgFile]   = useState(null)
  const [files, setFiles]       = useState([])
  const [saving, setSaving]     = useState(false)
  const [uploading, setUploading] = useState(false)

  // load existing files
  useEffect(() => {
    if (!appliance?.id) return
    supabase.from('appliance_files').select('*').eq('appliance_id', appliance.id).order('created_at')
      .then(({ data }) => setFiles(data||[]))
  }, [appliance?.id])

  async function save() {
    if (!f.brand.trim()||!f.model.trim()) { toast('Brand and model required','error'); return }
    setSaving(true)

    let image_path = appliance?.image_path || null
    if (imgFile) {
      try {
        const compressed = await compressImage(imgFile)
        const path = `appliances/${Date.now()}_img.jpg`
        const { error:upErr } = await supabase.storage.from(BUCKET).upload(path, compressed, { contentType:'image/jpeg', upsert:true })
        if (!upErr) {
          if (image_path && image_path!==path) await supabase.storage.from(BUCKET).remove([image_path])
          image_path = path
        }
      } catch(e) { toast('Image error','error') }
    }

    const row = { ...f, image_path,
      width:        f.width        ? parseFloat(f.width)        : null,
      height:       f.height       ? parseFloat(f.height)       : null,
      depth:        f.depth        ? parseFloat(f.depth)        : null,
      cutout_width: f.cutout_width ? parseFloat(f.cutout_width) : null,
      cutout_height:f.cutout_height? parseFloat(f.cutout_height): null,
      cutout_depth: f.cutout_depth ? parseFloat(f.cutout_depth) : null,
    }

    const { data, error } = appliance?.id
      ? await supabase.from('appliances').update(row).eq('id', appliance.id).select().single()
      : await supabase.from('appliances').insert(row).select().single()

    setSaving(false)
    if (error) { toast(error.message,'error'); return }
    toast('Appliance saved ✓')
    onSave(data)
  }

  async function handleAttachments(fileList) {
    setUploading(true)
    const applianceId = appliance?.id
    if (!applianceId) { toast('Save the appliance first, then add files','error'); setUploading(false); return }
    for (const file of Array.from(fileList)) {
      const path = `appliances/${applianceId}/${Date.now()}_${file.name}`
      await supabase.storage.from(BUCKET).upload(path, file, { contentType: file.type })
      const { data } = await supabase.from('appliance_files').insert({ appliance_id: applianceId, name: file.name, type: file.type, size: file.size, storage_path: path }).select().single()
      if (data) setFiles(prev => [...prev, data])
    }
    setUploading(false)
    toast('Files uploaded ✓')
  }

  async function deleteFile(af) {
    if (!confirm(`Delete "${af.name}"?`)) return
    if (af.storage_path) await supabase.storage.from(BUCKET).remove([af.storage_path])
    await supabase.from('appliance_files').delete().eq('id', af.id)
    setFiles(prev => prev.filter(x => x.id !== af.id))
    toast('File deleted')
  }

  return (
    <div style={{ background:'#fff', borderRadius:14, border:'1px solid #E8ECF0', boxShadow:'0 1px 3px rgba(0,0,0,0.04)', padding:22, marginBottom:16 }}>
      <h2 style={{ fontSize:15, fontWeight:700, color:'#2A3042', marginBottom:18 }}>
        {appliance?.id ? 'Edit appliance' : 'Add appliance'}
      </h2>

      {/* image */}
      <div onClick={() => fileRef.current.click()}
        style={{ width:'100%', height:110, borderRadius:12, border:'2px dashed #E8ECF0', overflow:'hidden', cursor:'pointer', background:'#FAFAFA', display:'flex', alignItems:'center', justifyContent:'center', marginBottom:18, position:'relative' }}
        onMouseEnter={e=>e.currentTarget.style.borderColor='#9CA3AF'} onMouseLeave={e=>e.currentTarget.style.borderColor='#E8ECF0'}>
        {preview ? <img src={preview} style={{ width:'100%', height:'100%', objectFit:'cover', display:'block' }} alt="" />
          : <div style={{ textAlign:'center', color:'#9CA3AF' }}><div style={{ fontSize:28, marginBottom:4 }}>📷</div><div style={{ fontSize:12 }}>Add appliance photo</div></div>}
        <input ref={fileRef} type="file" accept="image/*" style={{ display:'none' }}
          onChange={e => { const f2=e.target.files[0]; if(f2){setImgFile(f2);setPreview(URL.createObjectURL(f2))} }} />
      </div>

      {/* core fields */}
      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12, marginBottom:14 }}>
        <div style={{ gridColumn:'span 2' }}>
          <label style={{ fontSize:12, fontWeight:600, color:'#6B7280', display:'block', marginBottom:4 }}>Appliance type</label>
          <select value={f.type} onChange={set('type')} style={{ width:'100%', padding:'8px 10px', border:'1px solid #DDE3EC', borderRadius:9, fontSize:13, outline:'none', background:'#fff', cursor:'pointer' }}>
            {APPLIANCE_TYPES.map(t => <option key={t}>{t}</option>)}
          </select>
        </div>
        {[['brand','Brand *','e.g. Bosch'],['model','Model *','e.g. HBG634BS1A']].map(([k,l,p]) => (
          <div key={k}>
            <label style={{ fontSize:12, fontWeight:600, color:'#6B7280', display:'block', marginBottom:4 }}>{l}</label>
            <input value={f[k]} onChange={set(k)} placeholder={p} style={{ width:'100%', padding:'8px 10px', border:'1px solid #DDE3EC', borderRadius:9, fontSize:13, outline:'none' }} />
          </div>
        ))}
      </div>

      {/* dimensions */}
      <div style={{ marginBottom:14 }}>
        <div style={{ fontSize:11, fontWeight:700, color:'#9CA3AF', textTransform:'uppercase', letterSpacing:'.06em', marginBottom:10 }}>Unit dimensions</div>
        <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:10, marginBottom:14 }}>
          {['width','height','depth'].map(k => (
            <div key={k}>
              <label style={{ fontSize:11, fontWeight:600, color:'#6B7280', display:'block', marginBottom:4, textTransform:'capitalize' }}>{k}</label>
              <div style={{ display:'flex', alignItems:'center', gap:4 }}>
                <input type="number" value={f[k]} onChange={set(k)} placeholder="0" min="0"
                  style={{ width:'100%', padding:'7px 8px', border:'1px solid #DDE3EC', borderRadius:8, fontSize:13, outline:'none' }} />
                <span style={{ fontSize:11, color:'#9CA3AF', flexShrink:0 }}>mm</span>
              </div>
            </div>
          ))}
        </div>
        <div style={{ fontSize:11, fontWeight:700, color:'#9CA3AF', textTransform:'uppercase', letterSpacing:'.06em', marginBottom:10 }}>Cutout dimensions</div>
        <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:10 }}>
          {['cutout_width','cutout_height','cutout_depth'].map(k => (
            <div key={k}>
              <label style={{ fontSize:11, fontWeight:600, color:'#6B7280', display:'block', marginBottom:4 }}>{k.replace('cutout_','').charAt(0).toUpperCase()+k.replace('cutout_','').slice(1)}</label>
              <div style={{ display:'flex', alignItems:'center', gap:4 }}>
                <input type="number" value={f[k]} onChange={set(k)} placeholder="0" min="0"
                  style={{ width:'100%', padding:'7px 8px', border:'1px solid #DDE3EC', borderRadius:8, fontSize:13, outline:'none' }} />
                <span style={{ fontSize:11, color:'#9CA3AF', flexShrink:0 }}>mm</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* notes */}
      <div style={{ marginBottom:18 }}>
        <label style={{ fontSize:12, fontWeight:600, color:'#6B7280', display:'block', marginBottom:4 }}>Notes</label>
        <textarea value={f.notes} onChange={set('notes')} placeholder="Installation notes, clearances, power requirements…"
          style={{ width:'100%', padding:'8px 10px', border:'1px solid #DDE3EC', borderRadius:9, fontSize:13, outline:'none', minHeight:60, resize:'vertical', lineHeight:1.5, fontFamily:'inherit' }} />
      </div>

      {/* file attachments */}
      <div style={{ marginBottom:18 }}>
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:10 }}>
          <div style={{ fontSize:12, fontWeight:700, color:'#2A3042' }}>Files</div>
          <div style={{ position:'relative' }}>
            <input ref={attRef} type="file" accept=".pdf,.dwg,.dxf,image/*" multiple style={{ display:'none' }}
              onChange={e => handleAttachments(e.target.files)} />
            <button onClick={() => attRef.current.click()}
              style={{ fontSize:12, fontWeight:600, padding:'5px 12px', borderRadius:8, border:'1px solid #DDE3EC', background:'#fff', cursor:'pointer', color:'#374151' }}>
              {uploading ? 'Uploading…' : '+ Attach file'}
            </button>
          </div>
        </div>
        {files.length === 0 ? (
          <div style={{ textAlign:'center', padding:'16px', border:'2px dashed #E8ECF0', borderRadius:10, color:'#9CA3AF', fontSize:12 }}>
            PDF, DWG, DXF or image files
          </div>
        ) : (
          <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
            {files.map(af => (
              <div key={af.id} style={{ display:'flex', alignItems:'center', gap:10, padding:'8px 12px', background:'#F9FAFB', borderRadius:9, border:'1px solid #E8ECF0' }}>
                <span style={{ fontSize:18 }}>{fileIcon(af.name)}</span>
                <div style={{ flex:1, minWidth:0 }}>
                  <div style={{ fontSize:13, fontWeight:500, color:'#2A3042', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{af.name}</div>
                  {af.size && <div style={{ fontSize:11, color:'#9CA3AF' }}>{(af.size/1024).toFixed(0)} KB</div>}
                </div>
                <button onClick={() => window.open(pubUrl(af.storage_path),'_blank')}
                  style={{ fontSize:11, padding:'3px 8px', borderRadius:6, border:'1px solid #E8ECF0', background:'#fff', cursor:'pointer', color:'#5B8AF0', fontWeight:600 }}>Open</button>
                <button onClick={() => deleteFile(af)}
                  style={{ fontSize:13, color:'#FCA5A5', background:'none', border:'none', cursor:'pointer', lineHeight:1, fontWeight:700 }}>×</button>
              </div>
            ))}
          </div>
        )}
      </div>

      <div style={{ display:'flex', gap:8 }}>
        <button onClick={save} disabled={saving}
          style={{ fontSize:13, fontWeight:700, padding:'8px 20px', borderRadius:9, border:'none', background:'#5B8AF0', color:'#fff', cursor:saving?'not-allowed':'pointer', opacity:saving?0.6:1 }}>
          {saving ? 'Saving…' : 'Save appliance'}
        </button>
        <button onClick={onCancel}
          style={{ fontSize:13, fontWeight:600, padding:'8px 16px', borderRadius:9, border:'1px solid #E8ECF0', background:'#fff', color:'#374151', cursor:'pointer' }}>
          Cancel
        </button>
      </div>
    </div>
  )
}

// ── Appliance Detail View ─────────────────────────────────────────
function ApplianceDetail({ appliance, allAppliances, onBack, onUpdated }) {
  const toast = useToast()
  const [editing, setEditing] = useState(false)
  const [files, setFiles]     = useState([])
  const [app, setApp]         = useState(appliance)

  useEffect(() => {
    supabase.from('appliance_files').select('*').eq('appliance_id', app.id).order('created_at')
      .then(({ data }) => setFiles(data||[]))
  }, [app.id])

  async function deleteApp() {
    if (!confirm(`Delete "${app.brand} ${app.model}"? This cannot be undone.`)) return
    // delete files
    const paths = files.map(f=>f.storage_path).filter(Boolean)
    if (paths.length) await supabase.storage.from(BUCKET).remove(paths)
    if (app.image_path) await supabase.storage.from(BUCKET).remove([app.image_path])
    await supabase.from('appliance_files').delete().eq('appliance_id', app.id)
    await supabase.from('appliances').delete().eq('id', app.id)
    toast('Appliance deleted')
    onBack()
    onUpdated(allAppliances.filter(a => a.id !== app.id))
  }

  if (editing) return (
    <ApplianceForm appliance={app} onCancel={() => setEditing(false)}
      onSave={saved => { setApp(saved); setEditing(false); onUpdated(allAppliances.map(a=>a.id===saved.id?saved:a)) }} />
  )

  return (
    <div>
      {/* breadcrumb */}
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:20, flexWrap:'wrap', gap:10 }}>
        <div style={{ display:'flex', alignItems:'center', gap:8 }}>
          <button onClick={onBack} style={{ background:'none', border:'none', cursor:'pointer', fontSize:13, color:'#6B7280', display:'flex', alignItems:'center', gap:5, padding:0, fontWeight:500 }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/></svg>
            Appliances
          </button>
          <span style={{ color:'#C4C9D4' }}>›</span>
          <span style={{ fontSize:15, fontWeight:700, color:'#2A3042' }}>{app.brand} {app.model}</span>
        </div>
        <div style={{ display:'flex', gap:8 }}>
          <button onClick={() => setEditing(true)}
            style={{ fontSize:13, fontWeight:600, padding:'7px 16px', borderRadius:9, border:'1px solid #DDE3EC', background:'#fff', cursor:'pointer', color:'#374151' }}>Edit</button>
          <button onClick={deleteApp}
            style={{ fontSize:13, fontWeight:600, padding:'7px 16px', borderRadius:9, border:'1px solid #FCA5A5', background:'#FEF2F2', cursor:'pointer', color:'#991B1B' }}>Delete</button>
        </div>
      </div>

      {/* hero */}
      <div style={{ background:'#fff', borderRadius:14, border:'1px solid #E8ECF0', overflow:'hidden', boxShadow:'0 1px 3px rgba(0,0,0,0.04)', marginBottom:14 }}>
        {app.image_path && (
          <img src={pubUrl(app.image_path)} style={{ width:'100%', height:200, objectFit:'contain', background:'#F9FAFB', display:'block' }} alt="" />
        )}
        <div style={{ padding:20 }}>
          <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', marginBottom:12, flexWrap:'wrap', gap:8 }}>
            <div>
              <div style={{ fontSize:22, fontWeight:800, color:'#2A3042', marginBottom:2 }}>{app.brand} {app.model}</div>
              <div style={{ fontSize:14, color:'#6B7280' }}>{app.type}</div>
            </div>
            <span style={{ fontSize:12, fontWeight:700, padding:'4px 12px', borderRadius:20, background:'#EEF2FF', color:'#3730A3' }}>{app.type}</span>
          </div>

          {/* unit dimensions */}
          <div style={{ marginBottom:16 }}>
            <div style={{ fontSize:11, fontWeight:700, color:'#9CA3AF', textTransform:'uppercase', letterSpacing:'.06em', marginBottom:10 }}>Unit dimensions</div>
            <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:8 }}>
              <DimTile label="Width"  value={app.width}  color="#5B8AF0" bg="#EEF2FF" />
              <DimTile label="Height" value={app.height} color="#5B8AF0" bg="#EEF2FF" />
              <DimTile label="Depth"  value={app.depth}  color="#5B8AF0" bg="#EEF2FF" />
            </div>
          </div>

          {/* cutout dimensions */}
          {(app.cutout_width||app.cutout_height||app.cutout_depth) && (
            <div style={{ marginBottom:16 }}>
              <div style={{ fontSize:11, fontWeight:700, color:'#9CA3AF', textTransform:'uppercase', letterSpacing:'.06em', marginBottom:10 }}>Cutout dimensions</div>
              <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:8 }}>
                <DimTile label="Cutout W" value={app.cutout_width}  color="#1D9E75" bg="#ECFDF5" />
                <DimTile label="Cutout H" value={app.cutout_height} color="#1D9E75" bg="#ECFDF5" />
                <DimTile label="Cutout D" value={app.cutout_depth}  color="#1D9E75" bg="#ECFDF5" />
              </div>
            </div>
          )}

          {/* notes */}
          {app.notes && (
            <div style={{ padding:'12px 14px', background:'#F9FAFB', borderRadius:10, border:'1px solid #E8ECF0' }}>
              <div style={{ fontSize:11, fontWeight:700, color:'#9CA3AF', textTransform:'uppercase', letterSpacing:'.05em', marginBottom:6 }}>Notes</div>
              <div style={{ fontSize:13, color:'#374151', lineHeight:1.6 }}>{app.notes}</div>
            </div>
          )}
        </div>
      </div>

      {/* files */}
      {files.length > 0 && (
        <div style={{ background:'#fff', borderRadius:14, border:'1px solid #E8ECF0', padding:18 }}>
          <div style={{ fontSize:12, fontWeight:700, color:'#2A3042', marginBottom:12 }}>Files & documents</div>
          <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
            {files.map(af => (
              <div key={af.id} onClick={() => window.open(pubUrl(af.storage_path),'_blank')}
                style={{ display:'flex', alignItems:'center', gap:12, padding:'10px 14px', background:'#F9FAFB', borderRadius:10, border:'1px solid #E8ECF0', cursor:'pointer', transition:'all .12s' }}
                onMouseEnter={e=>{e.currentTarget.style.background='#F3F4F6';e.currentTarget.style.borderColor='#C4C9D4'}}
                onMouseLeave={e=>{e.currentTarget.style.background='#F9FAFB';e.currentTarget.style.borderColor='#E8ECF0'}}>
                <span style={{ fontSize:24 }}>{fileIcon(af.name)}</span>
                <div style={{ flex:1, minWidth:0 }}>
                  <div style={{ fontSize:13, fontWeight:600, color:'#2A3042' }}>{af.name}</div>
                  {af.size && <div style={{ fontSize:11, color:'#9CA3AF' }}>{(af.size/1024).toFixed(0)} KB</div>}
                </div>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#9CA3AF" strokeWidth="2"><path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

// ── Main Screen ───────────────────────────────────────────────────
export default function Appliances() {
  const toast = useToast()
  const [appliances, setAppliances] = useState([])
  const [loading, setLoading]       = useState(true)
  const [search, setSearch]         = useState('')
  const [typeFilter, setTypeFilter] = useState('All')
  const [sortBy, setSortBy]         = useState('brand') // brand | model | type
  const [adding, setAdding]         = useState(false)
  const [active, setActive]         = useState(null)

  useEffect(() => {
    supabase.from('appliances').select('*').order('brand').then(({ data }) => {
      setAppliances(data||[])
      setLoading(false)
    })
  }, [])

  const types = ['All', ...new Set(appliances.map(a=>a.type).filter(Boolean).sort())]

  const filtered = appliances
    .filter(a => {
      if (typeFilter !== 'All' && a.type !== typeFilter) return false
      if (!search) return true
      const q = search.toLowerCase()
      return (a.brand||'').toLowerCase().includes(q) ||
             (a.model||'').toLowerCase().includes(q) ||
             (a.type||'').toLowerCase().includes(q) ||
             (a.notes||'').toLowerCase().includes(q)
    })
    .sort((a,b) => {
      if (sortBy==='brand') return (a.brand||'').localeCompare(b.brand||'') || (a.model||'').localeCompare(b.model||'')
      if (sortBy==='model') return (a.model||'').localeCompare(b.model||'')
      if (sortBy==='type')  return (a.type||'').localeCompare(b.type||'')
      return 0
    })

  if (active) return (
    <ApplianceDetail appliance={active} allAppliances={appliances}
      onBack={() => setActive(null)}
      onUpdated={updated => { setAppliances(updated); setActive(null) }} />
  )

  return (
    <div>
      <BackButton to="/settings" label="Settings" />

      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:16, flexWrap:'wrap', gap:10 }}>
        <h1 style={{ fontSize:20, fontWeight:800, color:'#2A3042', margin:0 }}>Appliance library</h1>
        <button onClick={() => setAdding(true)}
          style={{ fontSize:13, fontWeight:700, padding:'8px 18px', borderRadius:9, border:'none', background:'#5B8AF0', color:'#fff', cursor:'pointer' }}>
          + Add appliance
        </button>
      </div>

      {adding && (
        <ApplianceForm onCancel={() => setAdding(false)}
          onSave={saved => { setAppliances(p=>[saved,...p]); setAdding(false); setActive(saved) }} />
      )}

      {/* search + filters */}
      <div style={{ background:'#fff', borderRadius:12, border:'1px solid #E8ECF0', padding:14, marginBottom:16 }}>
        {/* search */}
        <div style={{ position:'relative', marginBottom:12 }}>
          <span style={{ position:'absolute', left:10, top:'50%', transform:'translateY(-50%)', color:'#9CA3AF', fontSize:14, pointerEvents:'none' }}>⌕</span>
          <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search brand, model, type…"
            style={{ width:'100%', padding:'8px 10px 8px 32px', border:'1px solid #DDE3EC', borderRadius:9, fontSize:13, outline:'none' }} />
          {search && <button onClick={()=>setSearch('')} style={{ position:'absolute', right:10, top:'50%', transform:'translateY(-50%)', background:'none', border:'none', cursor:'pointer', color:'#9CA3AF', fontSize:16 }}>×</button>}
        </div>

        <div style={{ display:'flex', alignItems:'center', gap:16, flexWrap:'wrap' }}>
          {/* type filters */}
          <div style={{ display:'flex', gap:5, flexWrap:'wrap', flex:1 }}>
            {types.map(t => (
              <button key={t} onClick={() => setTypeFilter(t)}
                style={{ fontSize:11, fontWeight:600, padding:'4px 11px', borderRadius:16, border:`1.5px solid ${typeFilter===t?'#5B8AF0':'#E8ECF0'}`, background:typeFilter===t?'#5B8AF0':'#fff', color:typeFilter===t?'#fff':'#6B7280', cursor:'pointer', transition:'all .1s' }}>
                {t} {t!=='All' && `(${appliances.filter(a=>a.type===t).length})`}
              </button>
            ))}
          </div>
          {/* sort */}
          <div style={{ display:'flex', alignItems:'center', gap:8, flexShrink:0 }}>
            <span style={{ fontSize:12, color:'#9CA3AF', fontWeight:500 }}>Sort:</span>
            {[['brand','Brand'],['model','Model'],['type','Type']].map(([k,l]) => (
              <button key={k} onClick={() => setSortBy(k)}
                style={{ fontSize:11, fontWeight:600, padding:'4px 10px', borderRadius:16, border:`1.5px solid ${sortBy===k?'#2A3042':'#E8ECF0'}`, background:sortBy===k?'#2A3042':'#fff', color:sortBy===k?'#fff':'#6B7280', cursor:'pointer', transition:'all .1s' }}>
                {l}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* results count */}
      {(search || typeFilter!=='All') && (
        <div style={{ fontSize:12, color:'#9CA3AF', marginBottom:12 }}>
          {filtered.length} of {appliances.length} appliances
          {(search || typeFilter!=='All') && <button onClick={()=>{setSearch('');setTypeFilter('All')}} style={{ marginLeft:8, fontSize:11, color:'#E24B4A', background:'none', border:'none', cursor:'pointer', fontWeight:600 }}>Clear ×</button>}
        </div>
      )}

      {loading ? (
        <div style={{ display:'flex', justifyContent:'center', padding:'60px 0' }}><div className="spinner" /></div>
      ) : filtered.length === 0 ? (
        <div style={{ textAlign:'center', padding:'60px 0', color:'#9CA3AF', fontSize:14 }}>
          {appliances.length === 0 ? 'No appliances yet — add one above' : 'No appliances match your search'}
        </div>
      ) : (
        <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(220px, 1fr))', gap:12 }}>
          {filtered.map(a => (
            <div key={a.id} onClick={() => setActive(a)}
              style={{ background:'#fff', borderRadius:12, border:'1px solid #E8ECF0', overflow:'hidden', cursor:'pointer', boxShadow:'0 1px 3px rgba(0,0,0,0.04)', transition:'all .15s' }}
              onMouseEnter={e=>{e.currentTarget.style.boxShadow='0 6px 20px rgba(0,0,0,0.09)';e.currentTarget.style.transform='translateY(-1px)'}}
              onMouseLeave={e=>{e.currentTarget.style.boxShadow='0 1px 3px rgba(0,0,0,0.04)';e.currentTarget.style.transform='none'}}>
              {/* image or type icon */}
              <div style={{ width:'100%', height:110, background:a.image_path?'transparent':'#F9FAFB', overflow:'hidden', display:'flex', alignItems:'center', justifyContent:'center' }}>
                {a.image_path
                  ? <img src={pubUrl(a.image_path)} style={{ width:'100%', height:'100%', objectFit:'contain', display:'block' }} loading="lazy" alt="" />
                  : <div style={{ fontSize:40 }}>
                      {a.type?.includes('Oven')?'🔲':a.type?.includes('Cooktop')?'🍳':a.type?.includes('Rangehood')?'💨':a.type?.includes('Dishwasher')?'🫧':a.type?.includes('Fridge')?'🧊':a.type?.includes('Sink')?'🚿':'🔌'}
                    </div>
                }
              </div>
              <div style={{ padding:'12px 14px' }}>
                <div style={{ fontSize:11, fontWeight:700, color:'#5B8AF0', textTransform:'uppercase', letterSpacing:'.05em', marginBottom:3 }}>{a.type}</div>
                <div style={{ fontSize:14, fontWeight:700, color:'#2A3042', marginBottom:1 }}>{a.brand}</div>
                <div style={{ fontSize:13, color:'#6B7280', marginBottom:10 }}>{a.model}</div>
                {/* dim summary */}
                {(a.width||a.height||a.depth) && (
                  <div style={{ display:'flex', gap:6, flexWrap:'wrap' }}>
                    {[['W',a.width],['H',a.height],['D',a.depth]].filter(([,v])=>v).map(([l,v])=>(
                      <span key={l} style={{ fontSize:11, fontWeight:600, padding:'2px 7px', borderRadius:7, background:'#EEF2FF', color:'#3730A3' }}>{l} {v}mm</span>
                    ))}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
