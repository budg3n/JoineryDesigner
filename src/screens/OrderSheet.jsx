import { useState, useEffect, useRef, useMemo } from 'react'
import ReactDOM from 'react-dom'
import { useParams, useNavigate } from 'react-router-dom'
import { supabase, pubUrl } from '../lib/supabase'
import { useApp } from '../context/AppContext'
import { useToast } from '../components/Toast'

const STATUS_OPTIONS   = ['To order', 'Ordered', 'Received']
const UNIT_OPTIONS     = ['sheets', 'pcs', 'm', 'm²', 'sets', 'rolls', 'boxes', 'kg', 'L']
const CATEGORY_OPTIONS = ['Board', 'Hardware', 'Appliance', 'Accessory', 'Other']
const GROUP_OPTIONS    = ['Category', 'Supplier']

const STATUS_STYLES = {
  'To order': { bg:'#FEF9C3', color:'#854D0E', border:'#FDE68A' },
  'Ordered':  { bg:'#DBEAFE', color:'#1E40AF', border:'#BFDBFE' },
  'Received': { bg:'#DCFCE7', color:'#166534', border:'#86EFAC' },
}

const DEFAULT_COLS = [
  { key:'item',       label:'Name',        w:190, type:'item' },
  { key:'supplier',   label:'Supplier',    w:130, type:'text' },
  { key:'panel_type', label:'Panel type',  w:100, type:'text' },
  { key:'thickness',  label:'Thickness',   w:85,  type:'text',   placeholder:'mm' },
  { key:'colour',     label:'Colour',      w:110, type:'text' },
  { key:'finish',     label:'Finish',      w:100, type:'text' },
  { key:'dimensions', label:'Dimensions',  w:130, type:'text',   placeholder:'e.g. 2400×1220' },
  { key:'qty',        label:'Qty',         w:60,  type:'number' },
  { key:'unit',       label:'Unit',        w:85,  type:'select', options: UNIT_OPTIONS },
  { key:'sku',        label:'SKU',         w:100, type:'text' },
  { key:'price',      label:'Unit price',  w:90,  type:'price' },
  { key:'po_number',  label:'PO Number',   w:110, type:'text' },
  { key:'status',     label:'Status',      w:115, type:'status' },
  { key:'needed',     label:'Date needed', w:120, type:'date' },
  { key:'notes',      label:'Notes',       w:150, type:'text' },
]

function makeRow(overrides={}) {
  return {
    id:          Date.now().toString(36)+Math.random().toString(36).slice(2),
    item:'', supplier:'', panel_type:'', thickness:'', colour:'', finish:'',
    dimensions:'', qty:'', unit:'sheets', sku:'', price:'', po_number:'', notes:'',
    category:'Board', status:'To order', needed:'', material_id:null,
    ...overrides,
  }
}

// ── Inline cell ───────────────────────────────────────────────────
function Cell({ value='', onChange, col }) {
  const [editing, setEditing] = useState(false)
  const [val, setVal]         = useState(value)
  const ref = useRef()
  useEffect(() => { setVal(value) }, [value])
  useEffect(() => { if (editing && ref.current) ref.current.focus() }, [editing])
  const commit = v => { setEditing(false); if (v !== value) onChange(v) }

  const base = {
    width:col.w, minWidth:col.w, maxWidth:col.w, height:36, padding:'0 8px',
    display:'flex', alignItems:'center', borderRight:'1px solid #E8ECF0',
    fontSize:12, cursor:'text', overflow:'hidden', flexShrink:0, boxSizing:'border-box',
  }

  if (col.type === 'select') return (
    <div style={base}>
      <select value={val} onChange={e=>{setVal(e.target.value);commit(e.target.value)}}
        style={{ width:'100%', border:'none', outline:'none', background:'transparent', fontSize:12, cursor:'pointer', color:'#374151' }}>
        {col.options.map(o=><option key={o}>{o}</option>)}
      </select>
    </div>
  )

  if (col.type === 'status') {
    const s = STATUS_STYLES[val]||STATUS_STYLES['To order']
    return (
      <div style={base}>
        <select value={val} onChange={e=>{setVal(e.target.value);commit(e.target.value)}}
          style={{ width:'100%', border:`1px solid ${s.border}`, borderRadius:6, outline:'none', background:s.bg, fontSize:11, cursor:'pointer', color:s.color, fontWeight:700, padding:'3px 4px' }}>
          {STATUS_OPTIONS.map(o=><option key={o}>{o}</option>)}
        </select>
      </div>
    )
  }

  if (col.type === 'date') return (
    <div style={base}>
      <input type="date" value={val} onChange={e=>{setVal(e.target.value);commit(e.target.value)}}
        style={{ border:'none', outline:'none', background:'transparent', fontSize:11, color:val?'#5B8AF0':'#C4C9D4', cursor:'pointer', width:'100%' }} />
    </div>
  )

  if (col.type === 'number' || col.type === 'price') return (
    <div style={{...base, justifyContent:'flex-end'}} onClick={()=>setEditing(true)}>
      {editing
        ? <input ref={ref} type="number" value={val} min={0} step={col.type==='price'?'0.01':'1'}
            onChange={e=>setVal(e.target.value)} onBlur={e=>commit(e.target.value)}
            onKeyDown={e=>{if(e.key==='Enter'||e.key==='Tab')commit(val)}}
            style={{ width:'100%', border:'none', outline:'none', background:'transparent', fontSize:12, textAlign:'right' }} />
        : <span style={{ color:val?'#374151':'#D1D5DB' }}>
            {col.type==='price' && val ? `$${parseFloat(val).toFixed(2)}` : (val||<span style={{color:'#D1D5DB'}}>—</span>)}
          </span>
      }
    </div>
  )

  // default text
  return (
    <div style={{...base, color:val?'#374151':'#C4C9D4'}} onClick={()=>setEditing(true)}>
      {editing
        ? <input ref={ref} value={val} onChange={e=>setVal(e.target.value)}
            onBlur={e=>commit(e.target.value)} onKeyDown={e=>{if(e.key==='Enter'||e.key==='Tab')commit(val)}}
            placeholder={col.placeholder||''} style={{ width:'100%', border:'none', outline:'none', background:'transparent', fontSize:12 }} />
        : <span style={{ overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{val||col.placeholder||''}</span>
      }
    </div>
  )
}

// ── Item cell with material search ────────────────────────────────
function ItemCell({ value, onCommit, materials, width }) {
  const [editing, setEditing] = useState(false)
  const [search,  setSearch]  = useState(value)
  const [show,    setShow]    = useState(false)
  const [dropPos, setDropPos] = useState({ top:0, left:0, w:300 })
  const cellRef = useRef()
  const ref = useRef()
  useEffect(()=>{ setSearch(value) }, [value])
  useEffect(()=>{ if(editing && ref.current) ref.current.focus() }, [editing])

  const matches = useMemo(() => {
    if (!search.trim()) return []
    const q = search.toLowerCase()
    return materials.filter(m =>
      m.name.toLowerCase().includes(q) ||
      (m.supplier||'').toLowerCase().includes(q) ||
      (m.colour_code||'').toLowerCase().includes(q)
    ).slice(0,10)
  }, [search, materials])

  function openDrop() {
    if (!cellRef.current) return
    const rect = cellRef.current.getBoundingClientRect()
    const spaceBelow = window.innerHeight - rect.bottom
    const dropH = Math.min(matches.length * 46 + 60, 340)
    // Open upward if not enough space below
    const top = spaceBelow < dropH + 10
      ? rect.top - dropH - 4
      : rect.bottom + 2
    setDropPos({ top, left: rect.left, w: Math.max(rect.width, 300) })
    setShow(true)
  }

  function pick(m) {
    setShow(false); setEditing(false)
    onCommit({
      item:        m.name,
      supplier:    m.supplier||'',
      panel_type:  m.panel_type||'',
      thickness:   m.thickness ? String(m.thickness) : '',
      colour:      m.colour_code||m.color||'',
      finish:      m.finish||'',
      dimensions:  m.dimensions||'',
      sku:         m.sku||'',
      material_id: m.id,
      category:    m.panel_type ? 'Board' : 'Hardware',
    })
  }

  function commitText() {
    setShow(false); setEditing(false)
    if (search !== value) onCommit({ item: search })
  }

  return (
    <div ref={cellRef} style={{ width, minWidth:width, maxWidth:width, height:36, padding:'0 8px', display:'flex', alignItems:'center', borderRight:'1px solid #E8ECF0', position:'relative', flexShrink:0, boxSizing:'border-box', cursor:'text' }}
      onClick={()=>{setEditing(true);openDrop()}}>
      {editing
        ? <input ref={ref} value={search}
            onChange={e=>{setSearch(e.target.value);openDrop()}}
            onBlur={()=>setTimeout(commitText,160)}
            onKeyDown={e=>{if(e.key==='Enter')commitText();if(e.key==='Escape'){setEditing(false);setShow(false);setSearch(value)}}}
            placeholder="Search materials…"
            style={{ width:'100%', border:'none', outline:'none', background:'transparent', fontSize:12, fontWeight:600, color:'#111318' }} />
        : <span style={{ fontSize:12, fontWeight:600, color:value?'#111318':'#C4C9D4', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
            {value||'Item name…'}
          </span>
      }
      {show && (matches.length > 0 || search.length > 0) && ReactDOM.createPortal(
        <div style={{ position:'fixed', top:dropPos.top, left:dropPos.left, zIndex:9999, background:'#fff', border:'1px solid #E8ECF0', borderRadius:10, boxShadow:'0 8px 32px rgba(0,0,0,0.16)', minWidth:dropPos.w, maxHeight:340, overflow:'auto' }}>
          {matches.length > 0 && (
            <>
              <div style={{ padding:'5px 12px 4px', fontSize:10, fontWeight:700, color:'#9CA3AF', textTransform:'uppercase', letterSpacing:'.06em', borderBottom:'1px solid #F3F4F6', position:'sticky', top:0, background:'#fff' }}>Materials library</div>
              {matches.map(m => (
                <div key={m.id} onMouseDown={()=>pick(m)}
                  style={{ display:'flex', alignItems:'center', gap:9, padding:'7px 12px', cursor:'pointer', fontSize:12 }}
                  onMouseEnter={e=>e.currentTarget.style.background='#F9FAFB'}
                  onMouseLeave={e=>e.currentTarget.style.background='transparent'}>
                  {m.storage_path
                    ? <img src={pubUrl(m.storage_path)} style={{ width:24, height:24, borderRadius:5, objectFit:'cover', flexShrink:0 }} alt="" />
                    : <div style={{ width:24, height:24, borderRadius:5, background:m.color||'#E8ECF0', flexShrink:0, border:'1px solid rgba(0,0,0,0.06)' }} />
                  }
                  <div style={{ flex:1, minWidth:0 }}>
                    <div style={{ fontWeight:600, color:'#2A3042', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{m.name}</div>
                    <div style={{ fontSize:10, color:'#9CA3AF' }}>{[m.supplier, m.panel_type, m.thickness?m.thickness+'mm':null, m.colour_code].filter(Boolean).join(' · ')}</div>
                  </div>
                </div>
              ))}
            </>
          )}
          {search.length > 0 && (
            <div onMouseDown={commitText}
              style={{ padding:'8px 12px', borderTop: matches.length?'1px solid #F3F4F6':'none', fontSize:12, color:'#5B8AF0', fontWeight:600, cursor:'pointer', display:'flex', alignItems:'center', gap:6 }}
              onMouseEnter={e=>e.currentTarget.style.background='#F0F4FF'}
              onMouseLeave={e=>e.currentTarget.style.background='transparent'}>
              <span style={{ fontSize:16, lineHeight:1 }}>+</span> Use "{search}" as custom item
            </div>
          )}
        </div>,
        document.body
      )}
    </div>
  )
}

// ── Add to library modal ──────────────────────────────────────────
function AddToLibraryModal({ row, onSave, onClose }) {
  const toast = useToast()
  const [form, setForm] = useState({ name:row.item, supplier:row.supplier, colour_code:row.colour, panel_type:'', thickness:'', finish:'', notes:row.notes })
  const set = (k,v) => setForm(p=>({...p,[k]:v}))
  async function save() {
    if (!form.name.trim()) { toast('Enter a name','error'); return }
    const { data, error } = await supabase.from('materials').insert(form).select().single()
    if (error) { toast(error.message,'error'); return }
    toast('Added to library ✓')
    onSave(data)
  }
  const inp = { border:'1px solid #DDE3EC', borderRadius:8, padding:'7px 10px', fontSize:13, outline:'none', width:'100%', boxSizing:'border-box' }
  return (
    <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.45)', zIndex:500, display:'flex', alignItems:'center', justifyContent:'center', padding:16 }}
      onClick={e=>e.target===e.currentTarget&&onClose()}>
      <div style={{ background:'#fff', borderRadius:16, width:'100%', maxWidth:400, boxShadow:'0 20px 60px rgba(0,0,0,0.2)' }}>
        <div style={{ padding:'14px 18px', borderBottom:'1px solid #F3F4F6', display:'flex', alignItems:'center', justifyContent:'space-between' }}>
          <div style={{ fontSize:14, fontWeight:700, color:'#2A3042' }}>Add to materials library</div>
          <button onClick={onClose} style={{ background:'none', border:'none', cursor:'pointer', fontSize:20, color:'#9CA3AF', lineHeight:1 }}>×</button>
        </div>
        <div style={{ padding:'14px 18px', display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 }}>
          {[['Name *','name','span2'],['Supplier','supplier',''],['Colour/Code','colour_code',''],['Panel type','panel_type',''],['Thickness (mm)','thickness',''],['Finish','finish','']].map(([l,k,cls])=>(
            <div key={k} style={{ gridColumn: cls==='span2'?'span 2':'auto' }}>
              <label style={{ fontSize:10, fontWeight:700, color:'#6B7280', textTransform:'uppercase', display:'block', marginBottom:3 }}>{l}</label>
              <input value={form[k]||''} onChange={e=>set(k,e.target.value)} style={inp} />
            </div>
          ))}
        </div>
        <div style={{ padding:'0 18px 14px', display:'flex', gap:8 }}>
          <button onClick={save} style={{ flex:1, padding:'8px', borderRadius:8, border:'none', background:'#5B8AF0', color:'#fff', fontSize:13, fontWeight:700, cursor:'pointer' }}>Save to library</button>
          <button onClick={onClose} style={{ padding:'8px 14px', borderRadius:8, border:'1px solid #E8ECF0', background:'#fff', color:'#6B7280', fontSize:13, cursor:'pointer' }}>Cancel</button>
        </div>
      </div>
    </div>
  )
}

// ── Row component ─────────────────────────────────────────────────
function OrderRow({ row, materials, onUpdate, onDelete, showAddLib, cols }) {
  const isInLib = !!row.material_id || materials.some(m=>m.name.toLowerCase()===row.item.toLowerCase())
  const total = row.qty && row.price ? (parseFloat(row.qty)*parseFloat(row.price)).toFixed(2) : null

  return (
    <div style={{ display:'flex', alignItems:'center', background:'#fff', borderBottom:'1px solid #F3F4F6' }}
      onMouseEnter={e=>e.currentTarget.style.background='#F8FAFF'}
      onMouseLeave={e=>e.currentTarget.style.background='#fff'}>
      {/* drag */}
      <div style={{ width:28, height:36, display:'flex', alignItems:'center', justifyContent:'center', color:'#D1D5DB', fontSize:12, cursor:'grab', flexShrink:0, borderRight:'1px solid #E8ECF0' }}>⠿</div>

      {cols.map(col=>(
        col.type === 'item'
          ? <ItemCell key={col.key} value={row.item} width={col.w} materials={materials}
              onCommit={p=>onUpdate(row.id,p)} />
          : <Cell key={col.key} col={col} value={row[col.key]||''}
              onChange={v=>onUpdate(row.id,{[col.key]:v})} />
      ))}

      {/* total */}
      <div style={{ width:80, minWidth:80, height:36, padding:'0 8px', display:'flex', alignItems:'center', justifyContent:'flex-end', borderRight:'1px solid #E8ECF0', flexShrink:0, fontSize:12, fontWeight:600, color: total?'#2A3042':'#C4C9D4' }}>
        {total ? `$${total}` : '—'}
      </div>

      {/* actions */}
      <div style={{ width:50, display:'flex', alignItems:'center', justifyContent:'center', height:36, gap:2, flexShrink:0 }}>
        {row.item && !isInLib && (
          <button onClick={()=>showAddLib(row)} title="Add to materials library"
            style={{ background:'none', border:'none', cursor:'pointer', color:'#C4C9D4', fontSize:15, lineHeight:1, padding:'2px 3px', borderRadius:4 }}
            onMouseEnter={e=>e.currentTarget.style.color='#5B8AF0'}
            onMouseLeave={e=>e.currentTarget.style.color='#C4C9D4'}>＋</button>
        )}
        <button onClick={()=>onDelete(row.id)}
          style={{ background:'none', border:'none', cursor:'pointer', color:'#D1D5DB', fontSize:16, lineHeight:1, padding:'2px 3px', borderRadius:4 }}
          onMouseEnter={e=>e.currentTarget.style.color='#E24B4A'}
          onMouseLeave={e=>e.currentTarget.style.color='#D1D5DB'}>×</button>
      </div>
    </div>
  )
}

// ── Group section ─────────────────────────────────────────────────
function GroupSection({ title, rows, materials, onUpdate, onDelete, onAddRow, showAddLib, onMarkOrdered, cols }) {
  const [collapsed, setCollapsed] = useState(false)
  const toOrder = rows.filter(r=>r.status==='To order').length
  const subtotal = rows.reduce((a,r)=>a+(r.qty&&r.price?parseFloat(r.qty)*parseFloat(r.price):0),0)

  return (
    <div style={{ marginBottom:2 }}>
      {/* group header */}
      <div style={{ display:'flex', alignItems:'center', gap:10, padding:'8px 12px', background:'#F9FAFB', borderBottom:'1px solid #E8ECF0', cursor:'pointer', userSelect:'none' }}
        onClick={()=>setCollapsed(c=>!c)}>
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#9CA3AF" strokeWidth="2.5"
          style={{ transform: collapsed?'rotate(-90deg)':'rotate(0)', transition:'transform .15s' }}>
          <polyline points="6 9 12 15 18 9"/>
        </svg>
        <span style={{ fontSize:12, fontWeight:700, color:'#2A3042' }}>{title}</span>
        <span style={{ fontSize:11, color:'#9CA3AF' }}>{rows.length} item{rows.length!==1?'s':''}</span>
        {toOrder > 0 && (
          <span style={{ fontSize:10, fontWeight:700, padding:'1px 7px', borderRadius:10, background:'#FEF9C3', color:'#854D0E', border:'1px solid #FDE68A' }}>{toOrder} to order</span>
        )}
        {subtotal > 0 && (
          <span style={{ marginLeft:'auto', fontSize:12, fontWeight:700, color:'#374151' }}>${subtotal.toFixed(2)}</span>
        )}
        {toOrder > 0 && (
          <button onClick={e=>{e.stopPropagation();onMarkOrdered(rows.map(r=>r.id))}}
            style={{ fontSize:11, fontWeight:600, padding:'3px 10px', borderRadius:7, border:'1px solid #BFDBFE', background:'#DBEAFE', color:'#1E40AF', cursor:'pointer' }}>
            Mark ordered
          </button>
        )}
      </div>
      {!collapsed && (
        <>
          {rows.map(row=>(
            <OrderRow key={row.id} row={row} materials={materials}
              onUpdate={onUpdate} onDelete={onDelete} showAddLib={showAddLib} cols={cols} />
          ))}
          <div onClick={()=>onAddRow(title)} style={{ padding:'7px 16px', fontSize:12, color:'#9CA3AF', cursor:'pointer', borderBottom:'1px solid #F3F4F6', display:'flex', alignItems:'center', gap:6, background:'#FAFAFA' }}
            onMouseEnter={e=>e.currentTarget.style.background='#F3F4F6'}
            onMouseLeave={e=>e.currentTarget.style.background='#FAFAFA'}>
            <span style={{ fontSize:14 }}>+</span> Add {title} item
          </div>
        </>
      )}
    </div>
  )
}

// ── Main ──────────────────────────────────────────────────────────
export default function OrderSheet() {
  const { id } = useParams()
  const navigate = useNavigate()
  const toast = useToast()
  const [job,       setJob]       = useState(null)
  const [rows,      setRows]      = useState([])
  const [materials, setMaterials] = useState([])
  const [saving,    setSaving]    = useState(false)
  const [saved,     setSaved]     = useState(null)
  const [addLib,    setAddLib]    = useState(null)
  const [groupBy,   setGroupBy]   = useState('Category')
  const [filter,    setFilter]    = useState('All')
  const [cols,      setCols]      = useState(DEFAULT_COLS)
  const [showColMenu, setShowColMenu] = useState(false)
  const saveTimer = useRef()
  const dragColIdx = useRef(null)

  useEffect(()=>{
    Promise.all([
      supabase.from('jobs').select('id,name,client').eq('id',id).single(),
      supabase.from('materials').select('*').order('name'),
      supabase.from('order_items').select('*').eq('job_id',id).order('created_at'),
    ]).then(([{data:j},{data:m},{data:o}])=>{
      setJob(j)
      setMaterials(m||[])
      setRows(o||[])
    })
  },[id])

  function triggerSave(r) {
    clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(()=>doSave(r), 1500)
  }

  async function doSave(rowsToSave) {
    setSaving(true)
    const toSave = rowsToSave
      .filter(r => r.item && r.item.trim())
      .map(r => ({ ...r, job_id: id, updated_at: new Date().toISOString() }))
    if (toSave.length > 0) {
      const { error } = await supabase.from('order_items').upsert(toSave, { onConflict:'id' })
      if (error) { toast(error.message, 'error'); setSaving(false); return }
    }
    setSaved(new Date())
    setSaving(false)
  }

  function updateRow(rowId, patch) {
    setRows(prev=>{
      const updated = prev.map(r=>r.id===rowId?{...r,...patch}:r)
      triggerSave(updated)
      return updated
    })
  }

  function addRow(groupTitle) {
    const defaults = groupBy==='Category'
      ? { panel_type: groupTitle!=='Other'?groupTitle:'', category: 'Board' }
      : { supplier: groupTitle==='No supplier'?'':groupTitle }
    setRows(prev=>{
      const nr = makeRow(defaults)
      const updated = [...prev, nr]
      triggerSave(updated)
      return updated
    })
  }

  async function deleteRow(rowId) {
    const { error } = await supabase.from('order_items').delete().eq('id', rowId)
    if (error) { toast(error.message, 'error'); return }
    setRows(prev => prev.filter(r => r.id !== rowId))
    toast('Row deleted')
  }

  function markOrdered(ids) {
    setRows(prev=>{
      const updated = prev.map(r=>ids.includes(r.id)&&r.status==='To order'?{...r,status:'Ordered'}:r)
      doSave(updated)
      return updated
    })
    toast(`${ids.length} item${ids.length>1?'s':''} marked as ordered ✓`)
  }

  // Group rows
  const filtered = filter==='All' ? rows : rows.filter(r=>r.status===filter)
  const groups = useMemo(()=>{
    const map = {}
    filtered.forEach(r=>{
      let key
      if (groupBy==='Category') {
        // Group by panel_type if set, otherwise category
        key = r.panel_type || r.category || 'Other'
      } else {
        key = r.supplier || 'No supplier'
      }
      if (!map[key]) map[key]=[]
      map[key].push(r)
    })
    if (groupBy==='Category') {
      // Sort: Board-related first, then alphabetical
      const preferred = ['MDF','Particle Board','Plywood','Hardwood','Board','Hardware','Appliance','Accessory','Other']
      const keys = Object.keys(map)
      const sorted = [...keys].sort((a,b) => {
        const ai = preferred.indexOf(a), bi = preferred.indexOf(b)
        if (ai>=0 && bi>=0) return ai-bi
        if (ai>=0) return -1
        if (bi>=0) return 1
        return a.localeCompare(b)
      })
      return sorted.map(k=>([k,map[k]]))
    }
    return Object.entries(map).sort(([a],[b])=>a.localeCompare(b))
  },[filtered, groupBy])

  const toOrderTotal = rows.filter(r=>r.status==='To order').length
  const grandTotal   = rows.reduce((a,r)=>a+(r.qty&&r.price?parseFloat(r.qty)*parseFloat(r.price):0),0)
  const totalW = 28 + cols.reduce((a,c)=>a+c.w,0) + 80 + 50

  if (!job) return <div style={{ display:'flex', justifyContent:'center', padding:'60px 0' }}><div className="spinner"/></div>

  return (
    <div style={{ maxWidth:'100%' }}>
      {addLib && <AddToLibraryModal row={addLib} onClose={()=>setAddLib(null)}
        onSave={mat=>{setMaterials(p=>[...p,mat]);updateRow(addLib.id,{material_id:mat.id});setAddLib(null)}} />}

      {/* header */}
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:14, flexWrap:'wrap', gap:10 }}>
        <div>
          <button onClick={()=>navigate(`/job/${id}`)}
            style={{ background:'none', border:'none', cursor:'pointer', fontSize:12, color:'#6B7280', display:'flex', alignItems:'center', gap:4, padding:0, marginBottom:3 }}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/></svg>
            {job.name}
          </button>
          <h1 style={{ fontSize:20, fontWeight:800, color:'#2A3042', margin:0, display:'flex', alignItems:'center', gap:10 }}>
            To be ordered
            {toOrderTotal>0 && <span style={{ fontSize:12, fontWeight:700, padding:'3px 10px', borderRadius:20, background:'#FEF9C3', color:'#854D0E', border:'1px solid #FDE68A' }}>{toOrderTotal} to order</span>}
            {grandTotal>0 && <span style={{ fontSize:13, fontWeight:700, color:'#374151' }}>${grandTotal.toFixed(2)} total</span>}
          </h1>
        </div>
        <div style={{ display:'flex', gap:8, alignItems:'center', flexWrap:'wrap' }}>
          <div style={{ display:'flex', alignItems:'center', gap:6 }}>
            {saving
              ? <span style={{ fontSize:11, color:'#9CA3AF' }}>Saving…</span>
              : saved
              ? <span style={{ fontSize:11, color:'#9CA3AF' }}>Saved {saved.toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'})}</span>
              : null
            }
            <button onClick={()=>doSave(rows)} disabled={saving}
              style={{ fontSize:12, fontWeight:700, padding:'7px 14px', borderRadius:9, border:'1px solid #6EE7B7', background:'#ECFDF5', color:'#065F46', cursor:saving?'not-allowed':'pointer', opacity:saving?0.6:1 }}>
              💾 Save
            </button>
          </div>
          {/* group by */}
          <div style={{ display:'flex', gap:2, background:'#F0F2F5', borderRadius:9, padding:3 }}>
            {GROUP_OPTIONS.map(g=>(
              <button key={g} onClick={()=>setGroupBy(g)}
                style={{ fontSize:12, fontWeight:600, padding:'5px 12px', borderRadius:7, border:'none', background:groupBy===g?'#fff':'transparent', color:groupBy===g?'#2A3042':'#9CA3AF', cursor:'pointer', boxShadow:groupBy===g?'0 1px 3px rgba(0,0,0,0.1)':'none' }}>
                {g}
              </button>
            ))}
          </div>
          <button onClick={()=>addRow(groups[0]?.[0]||'Board')}
            style={{ fontSize:12, fontWeight:700, padding:'7px 14px', borderRadius:9, border:'none', background:'#5B8AF0', color:'#fff', cursor:'pointer' }}>
            + Add row
          </button>
        </div>
      </div>

      {/* status filter */}
      <div style={{ display:'flex', gap:6, marginBottom:12, flexWrap:'wrap' }}>
        {['All',...STATUS_OPTIONS].map(f=>{
          const count = f==='All'?rows.length:rows.filter(r=>r.status===f).length
          const s = f!=='All'?STATUS_STYLES[f]:null
          return (
            <button key={f} onClick={()=>setFilter(f)}
              style={{ fontSize:12, fontWeight:600, padding:'5px 12px', borderRadius:20, border:`1px solid ${filter===f?(s?.border||'#5B8AF0'):'#E8ECF0'}`, background:filter===f?(s?.bg||'#EEF2FF'):'#fff', color:filter===f?(s?.color||'#3730A3'):'#6B7280', cursor:'pointer' }}>
              {f} <span style={{ opacity:.7, fontSize:11 }}>({count})</span>
            </button>
          )
        })}
      </div>

      {/* table */}
      <div style={{ overflowX:'auto', borderRadius:12, border:'1px solid #E8ECF0', boxShadow:'0 1px 3px rgba(0,0,0,0.04)' }}>
        <div style={{ minWidth:totalW }}>
          {/* header — draggable columns */}
          <div style={{ display:'flex', background:'#F9FAFB', borderBottom:'2px solid #E8ECF0', position:'sticky', top:0, zIndex:10 }}>
            <div style={{ width:28, flexShrink:0, borderRight:'1px solid #E8ECF0' }} />
            {cols.map((c,ci)=>(
              <div key={c.key}
                draggable
                onDragStart={()=>{ dragColIdx.current=ci }}
                onDragOver={e=>e.preventDefault()}
                onDrop={()=>{
                  const from=dragColIdx.current; if(from===null||from===ci) return
                  setCols(prev=>{ const n=[...prev]; const [moved]=n.splice(from,1); n.splice(ci,0,moved); return n })
                  dragColIdx.current=null
                }}
                style={{ width:c.w, minWidth:c.w, padding:'9px 8px', fontSize:10, fontWeight:700, color:'#9CA3AF', textTransform:'uppercase', letterSpacing:'.06em', borderRight:'1px solid #E8ECF0', flexShrink:0, boxSizing:'border-box', textAlign: c.type==='number'||c.type==='price'?'right':'left', cursor:'grab', userSelect:'none', display:'flex', alignItems:'center', gap:4 }}>
                <svg width="8" height="10" viewBox="0 0 8 10" fill="#C4C9D4"><circle cx="2" cy="2" r="1.2"/><circle cx="6" cy="2" r="1.2"/><circle cx="2" cy="5" r="1.2"/><circle cx="6" cy="5" r="1.2"/><circle cx="2" cy="8" r="1.2"/><circle cx="6" cy="8" r="1.2"/></svg>
                {c.label}
              </div>
            ))}
            <div style={{ width:80, minWidth:80, padding:'9px 8px', fontSize:10, fontWeight:700, color:'#9CA3AF', textTransform:'uppercase', letterSpacing:'.06em', borderRight:'1px solid #E8ECF0', flexShrink:0, textAlign:'right' }}>Total</div>
            <div style={{ width:50, flexShrink:0 }} />
          </div>

          {/* groups */}
          {groups.map(([groupTitle, groupRows])=>(
            <GroupSection key={groupTitle} title={groupTitle} rows={groupRows}
              materials={materials} onUpdate={updateRow} onDelete={deleteRow}
              onAddRow={addRow} showAddLib={setAddLib} onMarkOrdered={markOrdered} cols={cols} />
          ))}

          {groups.length===0 && (
            <div style={{ padding:'40px 0', textAlign:'center', color:'#9CA3AF', fontSize:13 }}>No items yet — click + Add row to start</div>
          )}
        </div>
      </div>

      {/* grand total row */}
      {grandTotal > 0 && (
        <div style={{ display:'flex', justifyContent:'flex-end', padding:'10px 16px', fontSize:13, fontWeight:700, color:'#2A3042' }}>
          Grand total: <span style={{ marginLeft:8, color:'#5B8AF0' }}>${grandTotal.toFixed(2)}</span>
        </div>
      )}
    </div>
  )
}
