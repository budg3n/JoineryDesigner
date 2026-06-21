import { useState, useEffect, useRef } from 'react'
import { supabase, BUCKET, pubUrl } from '../lib/supabase'
import { useToast } from '../components/Toast'
import BackButton from '../components/BackButton'

const COLORS = ['#185FA5','#085041','#854F0B','#534AB7','#A32D2D','#0F6E56','#3C3489']
const initials = s => ((s.name||'?')[0] + (s.name?.split(' ')[1]?.[0] || '')).toUpperCase()

function fileIcon(type) {
  if (type?.includes('pdf')) return '📄'
  if (type?.startsWith('image/')) return '🖼'
  if (type?.includes('sheet') || type?.includes('excel') || type?.includes('csv')) return '📊'
  if (type?.includes('word') || type?.includes('document')) return '📝'
  return '📎'
}

function formatSize(bytes) {
  if (!bytes) return ''
  if (bytes < 1024) return bytes + ' B'
  if (bytes < 1048576) return (bytes/1024).toFixed(1) + ' KB'
  return (bytes/1048576).toFixed(1) + ' MB'
}

function SupplierForm({ supplier, onSave, onCancel }) {
  const toast = useToast()
  const [f, setF] = useState({
    name:     supplier?.name     || '',
    contact:  supplier?.contact  || '',
    phone:    supplier?.phone    || '',
    email:    supplier?.email    || '',
    website:  supplier?.website  || '',
    address:  supplier?.address  || '',
    city:     supplier?.city     || '',
    postcode: supplier?.postcode || '',
    account_number: supplier?.account_number || '',
    notes:    supplier?.notes    || '',
  })
  const set = k => e => setF(p => ({ ...p, [k]: e.target.value }))

  async function save() {
    if (!f.name.trim()) { toast('Enter a supplier name', 'error'); return }
    const { data, error } = supplier?.id
      ? await supabase.from('suppliers').update(f).eq('id', supplier.id).select().single()
      : await supabase.from('suppliers').insert(f).select().single()
    if (error) { toast(error.message, 'error'); return }
    toast('Supplier saved ✓')
    onSave(data)
  }

  return (
    <div style={{ background:"#fff", borderRadius:12, border:"1px solid #E8ECF0", boxShadow:"0 1px 3px rgba(0,0,0,0.04)", padding:20, marginBottom:14 }}>
      <h2 className="text-base font-semibold text-[#2A3042] mb-4">{supplier?.id ? 'Edit supplier' : 'Add supplier'}</h2>
      <div className="grid grid-cols-2 gap-3 mb-3">
        <div className="col-span-2"><label className="label">Supplier name *</label><input className="input" placeholder="e.g. Laminex, Archant, Prime Panels" value={f.name} onChange={set('name')} /></div>
        {[['contact','Contact person','Rob Smith'],['phone','Phone','03 555 0000'],['email','Email','orders@supplier.co.nz'],['website','Website','www.supplier.co.nz']].map(([k,l,p]) => (
          <div key={k}><label className="label">{l}</label><input className="input" placeholder={p} value={f[k]} onChange={set(k)} /></div>
        ))}
        <div className="col-span-2"><label className="label">Account number (optional)</label><input className="input" placeholder="ACC-00123" value={f.account_number} onChange={set('account_number')} /></div>
        <div className="col-span-2 border-t border-[#F3F4F6] pt-3 mt-1">
          <div className="text-xs font-semibold text-[#9CA3AF] uppercase tracking-wider mb-2">Address</div>
        </div>
        <div className="col-span-2"><label className="label">Street address</label><input className="input" placeholder="12 Example St, Suburb" value={f.address} onChange={set('address')} /></div>
        <div><label className="label">City</label><input className="input" placeholder="Christchurch" value={f.city} onChange={set('city')} /></div>
        <div><label className="label">Postcode</label><input className="input" placeholder="8011" value={f.postcode} onChange={set('postcode')} /></div>
        <div className="col-span-2"><label className="label">Notes</label><input className="input" placeholder="Lead times, account terms, etc." value={f.notes} onChange={set('notes')} /></div>
      </div>
      <div className="flex gap-2">
        <button onClick={save} className="btn-green">Save supplier</button>
        <button onClick={onCancel} className="btn">Cancel</button>
      </div>
    </div>
  )
}

// ── Multi-page PDF viewer using PDF.js ───────────────────────────────
// Mobile Safari/Chrome render PDFs inside an <iframe> using the OS's native PDF
// plugin, which on iOS only shows page 1 and doesn't scroll through the rest.
// Rendering every page to its own <canvas> via PDF.js sidesteps that entirely —
// it's just images stacked in a scrollable div, so it behaves identically on
// mobile and desktop.
let _pdfjsLoadPromise = null
function loadPdfJs() {
  if (window.pdfjsLib) return Promise.resolve(window.pdfjsLib)
  if (_pdfjsLoadPromise) return _pdfjsLoadPromise
  _pdfjsLoadPromise = new Promise((resolve, reject) => {
    const script = document.createElement('script')
    script.src = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js'
    script.onload = () => {
      window.pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js'
      resolve(window.pdfjsLib)
    }
    script.onerror = () => reject(new Error('Failed to load PDF viewer'))
    document.head.appendChild(script)
  })
  return _pdfjsLoadPromise
}

function PdfMultiPageViewer({ url }) {
  const [status, setStatus] = useState('loading') // loading | ready | error
  const [numPages, setNumPages] = useState(0)
  const [pagesRendered, setPagesRendered] = useState(0)
  const [errorDetail, setErrorDetail] = useState('')
  const containerRef = useRef()
  const renderedRef = useRef(false)

  useEffect(() => {
    let cancelled = false
    renderedRef.current = false
    setStatus('loading')
    setPagesRendered(0)
    setErrorDetail('')

    async function run() {
      const pdfjsLib = await loadPdfJs()
      // Fetch the whole file ourselves first — avoids any range-request/streaming
      // quirks with Supabase storage that can cause later pages to silently fail
      // on some mobile browsers when pdf.js tries to stream directly from the URL.
      const res = await fetch(url)
      if (!res.ok) throw new Error(`Couldn't download PDF (${res.status})`)
      const arrayBuffer = await res.arrayBuffer()
      if (cancelled) return

      const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise
      if (cancelled || renderedRef.current) return
      renderedRef.current = true
      setNumPages(pdf.numPages)
      const container = containerRef.current
      if (!container) return
      container.innerHTML = ''

      for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
        if (cancelled) return
        try {
          const page = await pdf.getPage(pageNum)
          const containerWidth = container.clientWidth || 700
          const baseViewport = page.getViewport({ scale: 1 })
          const dpr = Math.min(window.devicePixelRatio || 1, 2) // cap DPR so huge pricebooks don't blow memory on mobile
          const scale = (containerWidth / baseViewport.width) * dpr
          const viewport = page.getViewport({ scale })

          const canvas = document.createElement('canvas')
          canvas.width = Math.ceil(viewport.width)
          canvas.height = Math.ceil(viewport.height)
          canvas.style.width = '100%'
          canvas.style.height = 'auto'
          canvas.style.display = 'block'
          canvas.style.marginBottom = '12px'
          canvas.style.boxShadow = '0 2px 8px rgba(0,0,0,0.15)'
          canvas.style.borderRadius = '4px'
          canvas.style.background = '#fff'
          container.appendChild(canvas)

          const ctx = canvas.getContext('2d')
          await page.render({ canvasContext: ctx, viewport }).promise
          if (!cancelled) setPagesRendered(pageNum)
        } catch (pageErr) {
          console.error(`PDF page ${pageNum} render error:`, pageErr)
          // Keep going — show whatever pages did render rather than aborting the whole document
        }
      }
      if (!cancelled) setStatus('ready')
    }

    run().catch(err => {
      console.error('PDF render error:', err)
      if (!cancelled) {
        setErrorDetail(err?.message || '')
        setStatus('error')
      }
    })

    return () => { cancelled = true }
  }, [url])

  if (status === 'error') {
    return (
      <div style={{ textAlign:'center', padding:'40px 30px' }}>
        <div style={{ fontSize:40, marginBottom:12 }}>📄</div>
        <div style={{ fontSize:13, color:'#9CA3AF', marginBottom:4 }}>Couldn't load this PDF for preview — try opening it in a new tab instead.</div>
        {errorDetail && <div style={{ fontSize:11, color:'#C4C9D4' }}>{errorDetail}</div>}
      </div>
    )
  }

  return (
    <div style={{ width:'100%', height:'100%', overflowY:'auto', padding:16, boxSizing:'border-box' }}>
      {status === 'loading' && (
        <div style={{ display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', padding:'60px 0', gap:10 }}>
          <div className="spinner" />
          <div style={{ fontSize:12, color:'#9CA3AF' }}>
            {numPages > 0 ? `Rendering page ${pagesRendered} of ${numPages}…` : 'Loading PDF…'}
          </div>
        </div>
      )}
      <div ref={containerRef} style={{ maxWidth:760, margin:'0 auto' }} />
      {status === 'ready' && numPages > 1 && (
        <div style={{ textAlign:'center', fontSize:11, color:'#9CA3AF', paddingTop:4, paddingBottom:8 }}>
          {numPages} pages
        </div>
      )}
    </div>
  )
}

// ── Popout viewer for a pricebook file ───────────────────────────────
function PricebookViewerModal({ file, onClose }) {
  const url = pubUrl(file.storage_path)
  const isPdf = file.type?.includes('pdf')
  const isImage = file.type?.startsWith('image/')
  const isViewable = isPdf || isImage

  return (
    <div style={{ position:'fixed', inset:0, zIndex:9999, background:'rgba(0,0,0,0.6)', display:'flex', alignItems:'center', justifyContent:'center', padding:20 }}
      onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={{ background:'#fff', borderRadius:14, width:'100%', maxWidth: isViewable ? 900 : 420, height: isViewable ? '88vh' : 'auto', display:'flex', flexDirection:'column', boxShadow:'0 20px 60px rgba(0,0,0,0.3)', overflow:'hidden' }}>
        <div style={{ padding:'12px 18px', borderBottom:'1px solid #F3F4F6', display:'flex', alignItems:'center', justifyContent:'space-between', flexShrink:0 }}>
          <div style={{ display:'flex', alignItems:'center', gap:8, minWidth:0 }}>
            <span style={{ fontSize:18, flexShrink:0 }}>{fileIcon(file.type)}</span>
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

        <div style={{ flex:1, overflow:'hidden', background:'#F3F4F6', display:'flex', alignItems: isPdf ? 'stretch' : 'center', justifyContent: isPdf ? 'stretch' : 'center' }}>
          {isPdf ? (
            <PdfMultiPageViewer url={url} />
          ) : isImage ? (
            <img src={url} alt={file.name} style={{ maxWidth:'100%', maxHeight:'100%', objectFit:'contain' }} />
          ) : (
            <div style={{ textAlign:'center', padding:'40px 30px' }}>
              <div style={{ fontSize:40, marginBottom:12 }}>{fileIcon(file.type)}</div>
              <div style={{ fontSize:14, fontWeight:600, color:'#2A3042', marginBottom:6 }}>{file.name}</div>
              <div style={{ fontSize:12, color:'#9CA3AF', marginBottom:16 }}>
                This file type can't be previewed in-app — open it in a new tab instead.
              </div>
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

// ── Pricebook tab — upload & manage supplier pricebook files ────────
function PricebookTab({ supplier }) {
  const toast = useToast()
  const [files, setFiles]       = useState([])
  const [loading, setLoading]   = useState(true)
  const [uploading, setUploading] = useState(false)
  const [viewerFile, setViewerFile] = useState(null)
  const inputRef = useRef()

  useEffect(() => { loadFiles() }, [supplier.id])

  async function loadFiles() {
    setLoading(true)
    const { data, error } = await supabase.from('supplier_pricebooks').select('*').eq('supplier_id', supplier.id).order('created_at', { ascending: false })
    if (error) console.error('Pricebook load error:', error.message)
    setFiles(data || [])
    setLoading(false)
  }

  async function uploadFiles(fileList) {
    const selected = Array.from(fileList || [])
    if (!selected.length) return
    setUploading(true)
    for (const file of selected) {
      const path = `pricebooks/${supplier.id}/${Date.now()}_${file.name.replace(/\s+/g,'_')}`
      const { error: upErr } = await supabase.storage.from(BUCKET).upload(path, file, { contentType: file.type })
      if (upErr) { toast(upErr.message, 'error'); continue }
      const { data, error } = await supabase.from('supplier_pricebooks')
        .insert({ supplier_id: supplier.id, name: file.name, type: file.type, size: file.size, storage_path: path })
        .select().single()
      if (error) { toast(error.message, 'error'); continue }
      setFiles(p => [data, ...p])
    }
    setUploading(false)
    if (inputRef.current) inputRef.current.value = ''
    toast('Pricebook uploaded ✓')
  }

  async function deleteFile(f) {
    if (!confirm(`Delete "${f.name}"?`)) return
    if (f.storage_path) await supabase.storage.from(BUCKET).remove([f.storage_path])
    await supabase.from('supplier_pricebooks').delete().eq('id', f.id)
    setFiles(p => p.filter(x => x.id !== f.id))
    toast('Deleted')
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <div>
          <div className="text-sm font-semibold text-[#2A3042]">Pricebook</div>
          <div className="text-xs text-[#9CA3AF] mt-0.5">Upload PDFs, spreadsheets or photos of {supplier.name}'s current pricebook</div>
        </div>
        <input ref={inputRef} type="file" multiple onChange={e => uploadFiles(e.target.files)} style={{ display:'none' }} />
        <button onClick={() => inputRef.current?.click()} disabled={uploading} className="btn-blue btn-sm">
          {uploading ? 'Uploading…' : '+ Upload file'}
        </button>
      </div>

      <div
        onDragOver={e => { e.preventDefault(); e.currentTarget.style.background='#EEF2FF'; e.currentTarget.style.borderColor='#5B8AF0' }}
        onDragLeave={e => { e.currentTarget.style.background='#F9FAFB'; e.currentTarget.style.borderColor='#E8ECF0' }}
        onDrop={e => {
          e.preventDefault()
          e.currentTarget.style.background='#F9FAFB'; e.currentTarget.style.borderColor='#E8ECF0'
          uploadFiles(e.dataTransfer.files)
        }}
        style={{ border:'2px dashed #E8ECF0', borderRadius:12, padding:'16px', background:'#F9FAFB', marginBottom:14, textAlign:'center', fontSize:12, color:'#9CA3AF', transition:'all .15s' }}>
        Drop pricebook files here or use the Upload button above
      </div>

      {loading ? (
        <div className="flex justify-center py-8"><div className="spinner" /></div>
      ) : files.length === 0 ? (
        <div className="text-center py-8 text-sm text-[#9CA3AF]">No pricebook files uploaded yet</div>
      ) : (
        <div className="flex flex-col gap-2">
          {files.map(f => (
            <div key={f.id} style={{ display:'flex', alignItems:'center', gap:10, padding:'10px 12px', background:'#fff', borderRadius:10, border:'1px solid #E8ECF0' }}>
              <span style={{ fontSize:20, flexShrink:0 }}>{fileIcon(f.type)}</span>
              <div onClick={() => setViewerFile(f)} style={{ flex:1, minWidth:0, cursor:'pointer' }}>
                <div
                  style={{ fontSize:13, fontWeight:600, color:'#2A3042', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}
                  onMouseEnter={e=>e.currentTarget.style.color='#5B8AF0'} onMouseLeave={e=>e.currentTarget.style.color='#2A3042'}>
                  {f.name}
                </div>
                <div style={{ fontSize:11, color:'#9CA3AF', marginTop:1 }}>
                  {formatSize(f.size)}{f.created_at ? ` · uploaded ${new Date(f.created_at).toLocaleDateString('en-NZ',{day:'numeric',month:'short',year:'numeric'})}` : ''}
                </div>
              </div>
              <button onClick={() => deleteFile(f)}
                style={{ background:'none', border:'none', cursor:'pointer', color:'#D1D5DB', fontSize:16, flexShrink:0 }}
                onMouseEnter={e=>e.currentTarget.style.color='#E24B4A'} onMouseLeave={e=>e.currentTarget.style.color='#D1D5DB'}>×</button>
            </div>
          ))}
        </div>
      )}

      {viewerFile && <PricebookViewerModal file={viewerFile} onClose={() => setViewerFile(null)} />}
    </div>
  )
}

// ── Supplier detail view — Details / Pricebook tabs ──────────────────
function SupplierDetail({ supplier, productCount, onBack, onUpdated, onDeleted }) {
  const toast = useToast()
  const [tab, setTab] = useState('details')
  const [editing, setEditing] = useState(false)

  async function deleteSupplier() {
    const msg = productCount > 0
      ? `Delete "${supplier.name}"? This will remove pricing for ${productCount} product${productCount!==1?'s':''} linked to this supplier.`
      : `Delete "${supplier.name}"? This cannot be undone.`
    if (!confirm(msg)) return
    await supabase.from('material_suppliers').delete().eq('supplier_id', supplier.id)
    await supabase.from('supplier_pricebooks').delete().eq('supplier_id', supplier.id)
    const { error } = await supabase.from('suppliers').delete().eq('id', supplier.id)
    if (error) { toast(error.message, 'error'); return }
    toast('Supplier deleted')
    onDeleted(supplier.id)
  }

  return (
    <div>
      <button onClick={onBack} className="flex items-center gap-1 text-sm text-[#6B7280] mb-3" style={{ background:'none', border:'none', cursor:'pointer', padding:0 }}>
        <span>←</span> Suppliers
      </button>

      <div className="flex items-center justify-between mb-1">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-full flex items-center justify-center text-sm font-bold text-white flex-shrink-0"
            style={{ background: COLORS[0] }}>{initials(supplier)}</div>
          <div>
            <h1 className="text-xl font-bold text-[#2A3042]">{supplier.name}</h1>
            <div className="text-xs text-[#9CA3AF]">{productCount} product{productCount!==1?'s':''} linked</div>
          </div>
        </div>
        <div className="flex gap-2">
          <button onClick={() => setEditing(true)} className="btn btn-sm">Edit</button>
          <button onClick={deleteSupplier} className="btn btn-sm btn-red">Delete</button>
        </div>
      </div>

      {editing && (
        <div style={{ marginTop:14 }}>
          <SupplierForm supplier={supplier}
            onSave={(s) => { onUpdated(s); setEditing(false) }}
            onCancel={() => setEditing(false)} />
        </div>
      )}

      {!editing && (
        <>
          <div style={{ display:'flex', gap:2, marginTop:16, marginBottom:18, borderBottom:'1px solid #E8ECF0' }}>
            {[['details','Details'],['pricebook','Pricebook']].map(([key,label]) => (
              <button key={key} onClick={() => setTab(key)}
                style={{ padding:'8px 16px', fontSize:13, fontWeight:600, border:'none', background:'none', cursor:'pointer',
                  color: tab===key ? '#5B8AF0' : '#9CA3AF',
                  borderBottom: tab===key ? '2px solid #5B8AF0' : '2px solid transparent' }}>
                {label}
              </button>
            ))}
          </div>

          {tab === 'details' ? (
            <div style={{ background:"#fff", borderRadius:12, border:"1px solid #E8ECF0", padding:20 }}>
              <div className="grid grid-cols-2 gap-4">
                {[['Contact', supplier.contact],['Phone', supplier.phone],['Email', supplier.email],['Website', supplier.website],
                  ['Account number', supplier.account_number],['Address', [supplier.address, supplier.city, supplier.postcode].filter(Boolean).join(', ')]]
                  .filter(([,v]) => v).map(([label, value]) => (
                  <div key={label}>
                    <div className="text-xs text-[#9CA3AF] mb-0.5">{label}</div>
                    <div className="text-sm font-medium text-[#2A3042]">{value}</div>
                  </div>
                ))}
              </div>
              {supplier.notes && (
                <div className="mt-4 pt-4 border-t border-[#F3F4F6]">
                  <div className="text-xs text-[#9CA3AF] mb-1">Notes</div>
                  <div className="text-sm text-[#374151]">{supplier.notes}</div>
                </div>
              )}
              {!supplier.contact && !supplier.phone && !supplier.email && !supplier.website && !supplier.account_number && !supplier.address && !supplier.notes && (
                <div className="text-sm text-[#9CA3AF] text-center py-6">No details added yet — click Edit to fill these in</div>
              )}
            </div>
          ) : (
            <div style={{ background:"#fff", borderRadius:12, border:"1px solid #E8ECF0", padding:20 }}>
              <PricebookTab supplier={supplier} />
            </div>
          )}
        </>
      )}
    </div>
  )
}

export default function Suppliers() {
  const toast = useToast()
  const [suppliers, setSuppliers] = useState([])
  const [productCounts, setProductCounts] = useState({})
  const [loading, setLoading]     = useState(true)
  const [search, setSearch]       = useState('')
  const [editing, setEditing]     = useState(null) // null | 'new' | supplier object (add/edit form, list view)
  const [active, setActive]       = useState(null) // supplier object — detail view

  useEffect(() => { load() }, [])

  function load() {
    Promise.all([
      supabase.from('suppliers').select('*').order('name'),
      supabase.from('material_suppliers').select('supplier_id'),
    ]).then(([{ data: s }, { data: ms }]) => {
      setSuppliers(s || [])
      const counts = {}
      ;(ms || []).forEach(m => { counts[m.supplier_id] = (counts[m.supplier_id] || 0) + 1 })
      setProductCounts(counts)
      setLoading(false)
    })
  }

  function onSaved(sup) {
    setSuppliers(prev => {
      const i = prev.findIndex(x => x.id === sup.id)
      return i >= 0 ? prev.map((x, j) => j === i ? sup : x) : [...prev, sup].sort((a,b) => (a.name||'').localeCompare(b.name||''))
    })
    setEditing(null)
    if (active?.id === sup.id) setActive(sup)
  }

  async function deleteSupplier(sup) {
    const count = productCounts[sup.id] || 0
    const msg = count > 0
      ? `Delete "${sup.name}"? This will remove pricing for ${count} product${count!==1?'s':''} linked to this supplier.`
      : `Delete "${sup.name}"? This cannot be undone.`
    if (!confirm(msg)) return
    await supabase.from('material_suppliers').delete().eq('supplier_id', sup.id)
    await supabase.from('supplier_pricebooks').delete().eq('supplier_id', sup.id)
    const { error } = await supabase.from('suppliers').delete().eq('id', sup.id)
    if (error) { toast(error.message, 'error'); return }
    setSuppliers(prev => prev.filter(x => x.id !== sup.id))
    toast('Supplier deleted')
  }

  const filtered = search
    ? suppliers.filter(s => (s.name+' '+(s.contact||'')+' '+(s.city||'')).toLowerCase().includes(search.toLowerCase()))
    : suppliers

  if (active) {
    return (
      <SupplierDetail
        supplier={active}
        productCount={productCounts[active.id] || 0}
        onBack={() => setActive(null)}
        onUpdated={(s) => { onSaved(s) }}
        onDeleted={(id) => { setSuppliers(prev => prev.filter(x => x.id !== id)); setActive(null) }}
      />
    )
  }

  return (
    <div>
      <BackButton to="/settings" label="Settings" />
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-xl font-bold text-[#2A3042]">Suppliers</h1>
        <button onClick={() => setEditing('new')} className="btn-green">+ Add supplier</button>
      </div>

      {editing && (
        <SupplierForm
          supplier={editing === 'new' ? null : editing}
          onSave={onSaved}
          onCancel={() => setEditing(null)}
        />
      )}

      <div className="relative mb-3">
        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[#9CA3AF] text-sm pointer-events-none">⌕</span>
        <input value={search} onChange={e => setSearch(e.target.value)}
          placeholder="Search suppliers…" className="input pl-9" />
      </div>

      {loading ? (
        <div className="flex justify-center py-12"><div className="spinner" /></div>
      ) : (
        <div style={{ background:"#fff", borderRadius:12, border:"1px solid #E8ECF0", boxShadow:"0 1px 3px rgba(0,0,0,0.04)", overflow:"hidden" }}>
          {filtered.length === 0 ? (
            <div className="p-8 text-center text-sm text-[#9CA3AF]">
              {search ? 'No suppliers match your search' : 'No suppliers yet — add one above'}
            </div>
          ) : filtered.map((s, i) => (
            <div key={s.id} onClick={() => setActive(s)}
              className="flex items-center gap-3 px-4 py-3.5 border-b border-[#F3F4F6] last:border-0 hover:bg-[#F9FAFB]" style={{ cursor:'pointer' }}>
              <div className="w-9 h-9 rounded-full flex items-center justify-center text-xs font-bold text-white flex-shrink-0"
                style={{ background: COLORS[i % COLORS.length] }}>{initials(s)}</div>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-semibold text-[#2A3042]">{s.name}</div>
                <div className="text-xs text-[#6B7280]">
                  {[s.contact, s.phone, s.email].filter(Boolean).join(' · ')}
                </div>
                {s.address && (
                  <div className="text-xs text-[#9CA3AF] truncate">{[s.address, s.city].filter(Boolean).join(', ')}</div>
                )}
              </div>
              <div className="text-xs text-[#9CA3AF] bg-[#F3F4F6] rounded-full px-2 py-0.5 whitespace-nowrap flex-shrink-0">
                {productCounts[s.id] || 0} product{(productCounts[s.id]||0) !== 1 ? 's' : ''}
              </div>
              <div className="flex gap-1 flex-shrink-0" onClick={e => e.stopPropagation()}>
                <button onClick={() => setEditing(s)} className="btn btn-sm text-xs px-2 py-1">Edit</button>
                <button onClick={() => deleteSupplier(s)} className="btn btn-sm btn-red text-xs px-2 py-1">×</button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
