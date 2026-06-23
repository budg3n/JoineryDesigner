import { useState, useEffect, useRef, useMemo } from 'react'
import ReactDOM from 'react-dom'
import { useDragColumns } from '../hooks/useDragColumns'
import { buildDescription } from './CopyFormat'
import { useParams, useNavigate, useLocation } from 'react-router-dom'
import { supabase, pubUrl } from '../lib/supabase'
import { useApp } from '../context/AppContext'
import { useToast } from '../components/Toast'
import { enrichMaterialNames } from '../lib/materialName'
import { loadUnitTypes } from './UnitSettings'

function safeParse(v) {
  if (!v) return {}
  if (typeof v === 'object') return v
  try { return JSON.parse(v) } catch { return {} }
}

const STATUS_OPTIONS   = ['To order', 'Ordered', 'Received']
// Unit options loaded dynamically from app_settings (fallback to defaults)
const DEFAULT_UNIT_OPTIONS = ['sheets', 'pcs', 'm', 'm²', 'sets', 'rolls', 'boxes', 'kg', 'L']
let UNIT_OPTIONS = DEFAULT_UNIT_OPTIONS
loadUnitTypes().then(units => { UNIT_OPTIONS = units }).catch(() => {})
const CATEGORY_OPTIONS = ['Board', 'Hardware', 'Appliance', 'Accessory', 'Other']
const GROUP_OPTIONS    = ['Category', 'Supplier', 'Room']

const STATUS_STYLES = {
  'To order': { bg:'#FEF9C3', color:'#854D0E', border:'#FDE68A' },
  'Ordered':  { bg:'#DBEAFE', color:'#1E40AF', border:'#BFDBFE' },
  'Received': { bg:'#DCFCE7', color:'#166534', border:'#86EFAC' },
}

const DEFAULT_COLS = [
  { key:'item',       label:'Name',        w:190, type:'item' },
  { key:'room_name',  label:'Room',        w:110, type:'room' },
  { key:'supplier',   label:'Supplier',    w:130, type:'text' },
  { key:'brand',      label:'Brand',       w:110, type:'text' },
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

// ── Load category fields for dynamic columns ─────────────────────
function useCategoryFields(catId) {
  const [extraCols, setExtraCols] = useState([])
  useEffect(() => {
    if (!catId) { setExtraCols([]); return }
    supabase.from('category_fields').select('*').eq('category_id', catId).order('sort_order')
      .then(({ data }) => {
        setExtraCols((data||[]).map(f => ({
          key: '_cf_' + f.id,
          label: f.label,
          w: f.field_type==='number'||f.field_type==='price' ? 80 : f.field_type==='toggle' ? 70 : 110,
          type: f.field_type==='price' ? 'price' : f.field_type==='number' ? 'number' : f.field_type==='toggle' ? 'toggle' : f.field_type==='select' ? 'select' : 'text',
          options: f.field_type==='select' && f.options ? JSON.parse(f.options) : undefined,
          fieldId: f.id,
          fieldLabel: f.label,
          isCustom: true,
        })))
      })
  }, [catId])
  return extraCols
}

function UnorderedNotification({ mats, onAdd, onAddAll }) {
  const [open, setOpen] = useState(false)
  return (
    <div style={{ marginBottom:12 }}>
      <style>{`@keyframes unordered-pulse{0%,100%{box-shadow:0 0 0 0 rgba(226,75,74,0.4)}50%{box-shadow:0 0 0 5px rgba(226,75,74,0)}}`}</style>
      <button onClick={() => setOpen(o => !o)}
        style={{ display:'flex', alignItems:'center', gap:8, padding:'7px 14px', borderRadius:10,
          border:'1.5px solid #FCA5A5', background:'#FEF2F2', cursor:'pointer', width:'100%', textAlign:'left' }}>
        <span style={{ width:8, height:8, borderRadius:'50%', background:'#E24B4A', flexShrink:0, display:'inline-block',
          animation:'unordered-pulse 1.8s ease-in-out infinite' }} />
        <span style={{ fontSize:13, fontWeight:700, color:'#B91C1C', flex:1 }}>
          {mats.length} material{mats.length>1?'s':''} on this job not yet on the order sheet
        </span>
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#B91C1C" strokeWidth="2.5"
          style={{ transform: open ? 'rotate(180deg)' : 'none', transition:'transform .15s', flexShrink:0 }}>
          <polyline points="6 9 12 15 18 9"/>
        </svg>
      </button>
      {open && (
        <div style={{ marginTop:4, borderRadius:10, border:'1.5px solid #FCA5A5', background:'#fff',
          padding:'12px 14px', boxShadow:'0 4px 16px rgba(226,75,74,0.1)' }}>
          <div style={{ display:'flex', flexWrap:'wrap', gap:6, marginBottom: mats.length > 1 ? 10 : 0 }}>
            {mats.map(mat => (
              <div key={mat.id} style={{ display:'flex', alignItems:'center', gap:6, background:'#FEF2F2',
                border:'1px solid #FCA5A5', borderRadius:8, padding:'5px 10px', fontSize:12 }}>
                <span style={{ color:'#374151', fontWeight:500 }}>{mat.name || 'Unnamed material'}</span>
                <button onClick={() => onAdd(mat)}
                  style={{ background:'#E24B4A', border:'none', borderRadius:5, color:'#fff',
                    fontSize:10, fontWeight:700, padding:'2px 7px', cursor:'pointer', flexShrink:0 }}>
                  + Add
                </button>
              </div>
            ))}
          </div>
          {mats.length > 1 && (
            <button onClick={() => onAddAll(mats)}
              style={{ background:'#E24B4A', border:'none', borderRadius:8, color:'#fff',
                fontSize:12, fontWeight:700, padding:'5px 14px', cursor:'pointer' }}>
              + Add all {mats.length}
            </button>
          )}
        </div>
      )}
    </div>
  )
}

// ── PO Number Modal ───────────────────────────────────────────────
function POModal({ jobNumber, existingPO, onConfirm, onCancel }) {
  const prefix = 'MWF'
  const suffix = jobNumber ? `/${jobNumber}` : ''
  const suggested = existingPO || `${prefix}${suffix}`
  const [po, setPo] = useState(suggested)
  const inputRef = useRef()

  useEffect(() => {
    // Select the middle part for easy editing
    setTimeout(() => {
      if (inputRef.current) {
        inputRef.current.focus()
        // Position cursor after prefix
        const pos = prefix.length
        inputRef.current.setSelectionRange(pos, po.length - suffix.length)
      }
    }, 50)
  }, [])

  const isValid = po.trim().startsWith(prefix) && po.trim().length > prefix.length

  return (
    <div style={{ position:'fixed', inset:0, zIndex:9999, background:'rgba(0,0,0,0.45)', display:'flex', alignItems:'center', justifyContent:'center', padding:20 }}
      onClick={e => e.target===e.currentTarget && onCancel()}>
      <div style={{ background:'#fff', borderRadius:16, padding:28, width:'100%', maxWidth:400, boxShadow:'0 20px 60px rgba(0,0,0,0.2)' }}>
        <div style={{ fontSize:16, fontWeight:800, color:'#2A3042', marginBottom:6 }}>Purchase Order Number</div>
        <div style={{ fontSize:13, color:'#6B7280', marginBottom:20 }}>
          A PO number is required to mark items as ordered.
        </div>

        <label style={{ fontSize:11, fontWeight:700, color:'#6B7280', display:'block', marginBottom:6 }}>PO Number</label>
        <input ref={inputRef} value={po} onChange={e => setPo(e.target.value)}
          onKeyDown={e => { if (e.key==='Enter' && isValid) onConfirm(po.trim()) }}
          placeholder={`${prefix}XXXXX${suffix}`}
          style={{ width:'100%', padding:'10px 12px', border:`1.5px solid ${isValid?'#DDE3EC':'#FCA5A5'}`, borderRadius:10, fontSize:15, fontWeight:600, outline:'none', boxSizing:'border-box', fontFamily:'monospace', letterSpacing:'.04em' }} />

        {!isValid && po.length > 0 && (
          <div style={{ fontSize:11, color:'#E24B4A', marginTop:4 }}>Must start with "{prefix}"</div>
        )}
        <div style={{ fontSize:11, color:'#9CA3AF', marginTop:4 }}>
          Format: <span style={{ fontFamily:'monospace', color:'#5B8AF0' }}>{prefix}<span style={{ color:'#374151' }}>12345</span>{suffix}</span>
        </div>

        <div style={{ display:'flex', gap:8, marginTop:20 }}>
          <button onClick={onCancel}
            style={{ flex:1, padding:'10px', borderRadius:10, border:'1px solid #E8ECF0', background:'#fff', color:'#6B7280', fontSize:13, fontWeight:600, cursor:'pointer' }}>
            Cancel
          </button>
          <button onClick={() => onConfirm(po.trim())} disabled={!isValid}
            style={{ flex:2, padding:'10px', borderRadius:10, border:'none', fontSize:13, fontWeight:700, cursor: isValid?'pointer':'default',
              background: isValid ? '#1D9E75' : '#E8ECF0', color: isValid ? '#fff' : '#9CA3AF' }}>
            Mark as Ordered
          </button>
        </div>
      </div>
    </div>
  )
}

function makeRow(overrides={}) {
  return {
    id:          Date.now().toString(36)+Math.random().toString(36).slice(2),
    item:'', supplier:'', brand:'', panel_type:'', thickness:'', colour:'', finish:'',
    dimensions:'', qty:'', unit:'sheets', sku:'', price:'', po_number:'', notes:'',
    category:'Board', status:'To order', needed:'', material_id:null, room_id:null, appliance_id:null,
    price_breaks: [],
    ...overrides,
  }
}

// ── Price breaks helpers ──────────────────────────────────────────
function getEffectivePrice(row) {
  const breaks = Array.isArray(row.price_breaks) ? row.price_breaks : []
  const qty = parseFloat(row.qty) || 0
  if (!breaks.length) return parseFloat(row.price) || 0
  // Sort breaks descending by qty, find first threshold met
  const sorted = [...breaks].sort((a,b) => b.qty - a.qty)
  for (const b of sorted) {
    if (qty >= parseFloat(b.qty)) return parseFloat(b.price) || 0
  }
  return parseFloat(row.price) || 0
}

function PriceBreaksPopover({ row, onUpdate, onClose, style={} }) {
  const [breaks, setBreaks] = useState(() => {
    const b = Array.isArray(row.price_breaks) ? row.price_breaks : []
    return b.length ? b : [{ qty: '', price: '' }]
  })
  const ref = useRef()

  useEffect(() => {
    function handleClick(e) { if (ref.current && !ref.current.contains(e.target)) onClose() }
    setTimeout(() => document.addEventListener('mousedown', handleClick), 0)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  function updateBreak(i, field, val) {
    const next = breaks.map((b,j) => j===i ? {...b,[field]:val} : b)
    setBreaks(next)
  }
  function addBreak() { setBreaks(p => [...p, { qty:'', price:'' }]) }
  function removeBreak(i) { setBreaks(p => p.filter((_,j)=>j!==i)) }
  function save() {
    const valid = breaks.filter(b => b.qty !== '' && b.price !== '')
    onUpdate({ price_breaks: valid })
    onClose()
  }

  return (
    <div ref={ref} style={{
      position:'fixed', zIndex:9999, background:'#fff', borderRadius:12,
      boxShadow:'0 8px 32px rgba(0,0,0,0.18)', border:'1px solid #E8ECF0',
      padding:16, minWidth:280,
      top: style.top || 200, left: style.left || 200,
    }}>
      <div style={{ fontSize:12, fontWeight:700, color:'#2A3042', marginBottom:10, display:'flex', justifyContent:'space-between', alignItems:'center' }}>
        Qty price breaks
        <button onClick={onClose} style={{ background:'none', border:'none', cursor:'pointer', color:'#9CA3AF', fontSize:16 }}>×</button>
      </div>
      <div style={{ fontSize:11, color:'#9CA3AF', marginBottom:10 }}>
        Set lower prices when ordering larger quantities. The best matching price applies automatically.
      </div>
      {/* Base price row */}
      <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:8, padding:'6px 8px', background:'#F9FAFB', borderRadius:7 }}>
        <span style={{ fontSize:11, color:'#6B7280', width:70, flexShrink:0 }}>Base price</span>
        <span style={{ fontSize:12, fontWeight:600, color:'#2A3042' }}>
          {row.price ? `$${parseFloat(row.price).toFixed(2)}` : '—'}
        </span>
        <span style={{ fontSize:10, color:'#9CA3AF', marginLeft:'auto' }}>any qty</span>
      </div>
      {/* Break rows */}
      {breaks.map((b, i) => (
        <div key={i} style={{ display:'flex', alignItems:'center', gap:6, marginBottom:6 }}>
          <span style={{ fontSize:11, color:'#6B7280', flexShrink:0, width:24 }}>{i+1}.</span>
          <div style={{ display:'flex', alignItems:'center', gap:4, flex:1 }}>
            <span style={{ fontSize:11, color:'#9CA3AF', flexShrink:0 }}>≥</span>
            <input type="number" min="1" value={b.qty} onChange={e=>updateBreak(i,'qty',e.target.value)}
              placeholder="Qty"
              style={{ width:60, padding:'5px 7px', border:'1px solid #DDE3EC', borderRadius:7, fontSize:12, outline:'none' }} />
            <span style={{ fontSize:11, color:'#9CA3AF', flexShrink:0 }}>units →</span>
            <div style={{ position:'relative', flex:1 }}>
              <span style={{ position:'absolute', left:7, top:'50%', transform:'translateY(-50%)', fontSize:12, color:'#6B7280' }}>$</span>
              <input type="number" min="0" step="0.01" value={b.price} onChange={e=>updateBreak(i,'price',e.target.value)}
                placeholder="0.00"
                style={{ width:'100%', padding:'5px 7px 5px 18px', border:'1px solid #DDE3EC', borderRadius:7, fontSize:12, outline:'none', boxSizing:'border-box' }} />
            </div>
          </div>
          <button onClick={()=>removeBreak(i)} style={{ background:'none', border:'none', cursor:'pointer', color:'#D1D5DB', fontSize:14, padding:'2px' }}
            onMouseEnter={e=>e.currentTarget.style.color='#E24B4A'}
            onMouseLeave={e=>e.currentTarget.style.color='#D1D5DB'}>×</button>
        </div>
      ))}
      <button onClick={addBreak}
        style={{ fontSize:11, color:'#5B8AF0', background:'none', border:'1px dashed #C7D2FE', borderRadius:7, padding:'4px 10px', cursor:'pointer', width:'100%', marginTop:4 }}>
        + Add break
      </button>
      <div style={{ display:'flex', gap:8, marginTop:12 }}>
        <button onClick={save}
          style={{ flex:1, padding:'7px', borderRadius:8, border:'none', background:'#5B8AF0', color:'#fff', fontSize:12, fontWeight:600, cursor:'pointer' }}>
          Save breaks
        </button>
        <button onClick={onClose}
          style={{ padding:'7px 12px', borderRadius:8, border:'1px solid #E8ECF0', background:'#fff', color:'#6B7280', fontSize:12, cursor:'pointer' }}>
          Cancel
        </button>
      </div>
    </div>
  )
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

  if (col.type === 'toggle') {
    const v = value === true || value === 'true' || value === '1'
    return editing ? (
      <div style={{ ...base, display:'flex', alignItems:'center', justifyContent:'center' }}>
        <input type="checkbox" checked={v} onChange={e => { onChange(e.target.checked ? 'yes' : ''); setEditing(false) }} autoFocus />
      </div>
    ) : (
      <div style={{ ...base, display:'flex', alignItems:'center', justifyContent:'center' }} onClick={() => { onChange(v ? '' : 'yes') }}>
        <span style={{ fontSize:16 }}>{v ? '✓' : '—'}</span>
      </div>
    )
  }

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
function ItemCell({ value, onCommit, materials, width, onFocus }) {
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
      brand:       safeParse(m.custom_fields).brand || '',
      panel_type:  m.panel_type||'',
      thickness:   m.thickness ? String(m.thickness) : '',
      colour:      m.colour_code||m.color||'',
      finish:      m.finish||'',
      dimensions:  m.dimensions||'',
      sku:         m.sku||'',
      price:       m.price ? String(m.price) : '',
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
      onClick={()=>{setEditing(true);openDrop();if(onFocus)onFocus()}}>
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
// ── Copy description button ──────────────────────────────────────
function CopyBtn({ row, format }) {
  const [copied, setCopied] = useState(false)
  function doCopy() {
    const text = buildDescription(format.tokens, format.separator, row)
    if (!text) return
    if (navigator.clipboard) {
      navigator.clipboard.writeText(text).then(()=>{ setCopied(true); setTimeout(()=>setCopied(false),2000) })
    } else {
      const ta = document.createElement('textarea')
      ta.value = text; document.body.appendChild(ta); ta.select()
      document.execCommand('copy'); document.body.removeChild(ta)
      setCopied(true); setTimeout(()=>setCopied(false),2000)
    }
  }
  return (
    <button onClick={doCopy} title={`Copy: ${buildDescription(format.tokens, format.separator, row)}`}
      style={{ background:'none', border:'none', cursor:'pointer', color:copied?'#1D9E75':'#C4C9D4', fontSize:14, lineHeight:1, padding:'2px 4px', borderRadius:4, transition:'color .15s', flexShrink:0 }}
      onMouseEnter={e=>{ if(!copied) e.currentTarget.style.color='#5B8AF0' }}
      onMouseLeave={e=>{ if(!copied) e.currentTarget.style.color=copied?'#1D9E75':'#C4C9D4' }}>
      {copied ? '✓' : '⎘'}
    </button>
  )
}

function OrderRow({ row, materials, onUpdate, onUpdateStatus, onDelete, showAddLib, cols, copyFormat, rooms, onEnsureMaterials }) {
  const isInLib = !!row.material_id || materials.some(m=>m.name.toLowerCase()===row.item.toLowerCase())
  const [showBreaks, setShowBreaks] = useState(false)
  const priceRef = useRef()
  const effPrice = getEffectivePrice(row)
  const hasBreaks = Array.isArray(row.price_breaks) && row.price_breaks.length > 0
  const qty = parseFloat(row.qty)
  const total = !isNaN(qty) && effPrice > 0 && qty > 0 ? (qty * effPrice).toFixed(2) : null

  return (
    <div style={{ display:'flex', alignItems:'center', background:'#fff', borderBottom:'1px solid #F3F4F6' }}
      onMouseEnter={e=>e.currentTarget.style.background='#F8FAFF'}
      onMouseLeave={e=>e.currentTarget.style.background='#fff'}>
      {/* drag */}
      <div title={row.kit_name ? `From kit: ${row.kit_name}` : ''}
        style={{ width:28, height:36, display:'flex', alignItems:'center', justifyContent:'center', color: row.kit_name ? '#F97316' : '#D1D5DB', fontSize: row.kit_name ? 13 : 12, cursor:'grab', flexShrink:0, borderRight:'1px solid #E8ECF0' }}>
        {row.kit_name ? '🧰' : '⠿'}
      </div>

      {cols.map(col=>{
        if (col.type === 'item') return (
          <ItemCell key={col.key} value={row.item} width={col.w} materials={materials}
                onFocus={onEnsureMaterials}
            onCommit={p=>onUpdate(row.id,p)} />
        )
        if (col.type === 'room') return (
          <div key={col.key} style={{ width:col.w, minWidth:col.w, maxWidth:col.w, height:36, padding:'0 8px', display:'flex', alignItems:'center', borderRight:'1px solid #E8ECF0', flexShrink:0, boxSizing:'border-box' }}>
            <select
              value={row.room_id||''}
              onChange={e => onUpdate(row.id, { room_id: e.target.value || null })}
              style={{ width:'100%', border:'none', outline:'none', background:'transparent', fontSize:12, cursor:'pointer', color: row.room_id ? '#374151' : '#C4C9D4' }}>
              <option value=''>No room</option>
              {rooms.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
            </select>
          </div>
        )
        if (col.key === 'price') return (
          <div key="price" ref={priceRef}
            style={{ width:col.w, minWidth:col.w, maxWidth:col.w, height:36, display:'flex', alignItems:'center', borderRight:'1px solid #E8ECF0', flexShrink:0, boxSizing:'border-box', position:'relative' }}>
            {/* Price input — shrunk to leave room for button */}
            <div style={{ flex:1, overflow:'hidden' }}>
              <Cell col={{...col, w:col.w-26}} value={row.price||''}
                onChange={v=>onUpdate(row.id,{price:v})} />
            </div>
            {/* Qty breaks toggle button */}
            <button
              onClick={e=>{ e.stopPropagation(); setShowBreaks(p=>!p) }}
              title={hasBreaks ? `${row.price_breaks.length} price break${row.price_breaks.length>1?'s':''} active — click to edit` : 'Add qty price breaks'}
              style={{
                width:22, height:22, flexShrink:0, marginRight:2,
                background: hasBreaks ? '#EEF2FF' : '#F3F4F6',
                border: hasBreaks ? '1px solid #C7D2FE' : '1px solid #E8ECF0',
                borderRadius:6, cursor:'pointer', padding:0,
                fontSize:10, fontWeight:700,
                color: hasBreaks ? '#5B8AF0' : '#9CA3AF',
                display:'flex', alignItems:'center', justifyContent:'center',
                transition:'all .12s',
              }}
              onMouseEnter={e=>{ e.currentTarget.style.background='#EEF2FF'; e.currentTarget.style.color='#5B8AF0'; e.currentTarget.style.borderColor='#C7D2FE' }}
              onMouseLeave={e=>{ if(!hasBreaks){ e.currentTarget.style.background='#F3F4F6'; e.currentTarget.style.color='#9CA3AF'; e.currentTarget.style.borderColor='#E8ECF0' } }}>
              ✦
            </button>
            {/* Effective price indicator when break is active */}
            {hasBreaks && effPrice !== (parseFloat(row.price)||0) && (
              <div style={{ position:'absolute', bottom:-12, right:28, fontSize:9, color:'#5B8AF0', fontWeight:600, whiteSpace:'nowrap', pointerEvents:'none' }}>
                eff: ${effPrice.toFixed(2)}
              </div>
            )}
            {/* Popover */}
            {showBreaks && (() => {
              const rect = priceRef.current?.getBoundingClientRect()
              return ReactDOM.createPortal(
                <PriceBreaksPopover row={row}
                  onUpdate={patch => onUpdate(row.id, patch)}
                  onClose={() => setShowBreaks(false)}
                  style={{ top: rect ? rect.bottom+4 : 200, left: rect ? Math.max(10, rect.left-160) : 200 }}
                />,
                document.body
              )
            })()}
          </div>
        )
        if (col.key === 'status') return (
          <Cell key="status" col={col}
            value={row.status||'To order'}
            onChange={v => onUpdateStatus ? onUpdateStatus(row.id, v) : onUpdate(row.id, { status: v })} />
        )
        return (
          <Cell key={col.key} col={col}
            value={col.key.startsWith('_cf_')
              ? (()=>{
                  try {
                    const cf = safeParse(row.custom_fields)
                    const byId = cf[col.fieldId] || cf[col.key.replace('_cf_','')]
                    const byLabel = cf[col.fieldLabel] || cf[(col.fieldLabel||'').toLowerCase().replace(/\s+/g,'_')]
                    return byId || byLabel || ''
                  } catch { return '' }
                })()
              : (row[col.key]||'')}
            onChange={v=>onUpdate(row.id,{[col.key]:v})} />
        )
      })}

      {/* total */}
      <div style={{ width:80, minWidth:80, height:36, padding:'0 8px', display:'flex', alignItems:'center', justifyContent:'flex-end', borderRight:'1px solid #E8ECF0', flexShrink:0, fontSize:12, fontWeight:600, color: total?'#2A3042':'#C4C9D4' }}>
        {total ? `$${total}` : '—'}
      </div>

      {/* actions */}
      <div style={{ width:66, display:'flex', alignItems:'center', justifyContent:'center', height:36, gap:3, flexShrink:0 }}>
        {row.item && copyFormat?.tokens?.length > 0 && (
          <CopyBtn row={row} format={copyFormat} />
        )}
        {row.item && !isInLib && (
          <button onClick={()=>showAddLib(row)} title="Add to materials library"
            style={{ background:'none', border:'none', cursor:'pointer', color:'#C4C9D4', fontSize:15, lineHeight:1, padding:'2px 3px', borderRadius:4 }}
            onMouseEnter={e=>e.currentTarget.style.color='#5B8AF0'}
            onMouseLeave={e=>e.currentTarget.style.color='#C4C9D4'}>＋</button>
        )}
        <button onClick={()=> row.is_kit_component
            ? (confirm(`Remove the whole "${row.kit_name}" kit and all its components?`) && onDelete(row.kit_parent_id))
            : onDelete(row.id)
          }
          title={row.is_kit_component ? `Remove whole kit: ${row.kit_name}` : 'Remove'}
          style={{ background:'none', border:'none', cursor:'pointer', color:'#D1D5DB', fontSize:16, lineHeight:1, padding:'2px 3px', borderRadius:4 }}
          onMouseEnter={e=>e.currentTarget.style.color='#E24B4A'}
          onMouseLeave={e=>e.currentTarget.style.color='#D1D5DB'}>×</button>
      </div>
    </div>
  )
}

// ── Group section ─────────────────────────────────────────────────
function GroupSection({ title, rows, materials, onUpdate, onDelete, onAddRow, showAddLib, onMarkOrdered, cols, copyFormat, rooms, onEnsureMaterials }) {
  const [collapsed, setCollapsed] = useState(false)
  const [groupCols, setGroupCols] = useState(null)  // null = use default cols
  const toOrder = rows.filter(r=>r.status==='To order').length
  const subtotal = rows.reduce((a,r)=>{ const q=parseFloat(r.qty),p=parseFloat(r.price); return a+(!isNaN(q)&&!isNaN(p)?q*p:0) },0)

  // Load category-specific columns for this group
  useEffect(() => {
    // Get the category_id from rows in this group
    const catId = rows.find(r=>r.category_id)?.category_id
    if (!catId) {
      // No category — only show columns that have actual data in this group
      const ALL_STD = [
        { key:'item',       label:'Name',        w:190, type:'item' },
        { key:'room_name',  label:'Room',        w:100, type:'room' },
        { key:'supplier',   label:'Supplier',    w:120, type:'text',   settingKey:'supplier' },
        { key:'panel_type', label:'Panel type',  w:100, type:'text',   settingKey:'panel_type' },
        { key:'thickness',  label:'Thickness',   w:80,  type:'text',   settingKey:'thickness', placeholder:'mm' },
        { key:'colour',     label:'Colour',      w:100, type:'text',   settingKey:'colour_code' },
        { key:'finish',     label:'Finish',      w:100, type:'text',   settingKey:'finish' },
        { key:'qty',        label:'Qty',         w:60,  type:'number' },
        { key:'unit',       label:'Unit',        w:80,  type:'select', settingKey:'unit', options:UNIT_OPTIONS },
        { key:'price',      label:'Unit price',  w:90,  type:'price',  settingKey:'price' },
        { key:'status',     label:'Status',      w:110, type:'status' },
        { key:'notes',      label:'Notes',       w:140, type:'text',   settingKey:'notes' },
      ]
      // Only include optional columns that have at least one non-empty value
      const hasData = k => rows.some(r => r[k] && String(r[k]).trim())
      setGroupCols(ALL_STD.filter(c => !c.settingKey || c.type === 'item' || c.type === 'status' || c.type === 'number' || hasData(c.key)))
      return
    }

    Promise.all([
      supabase.from('app_settings').select('value').eq('key', `mat_cat_fields_${catId}`).maybeSingle(),
      supabase.from('category_fields').select('*').eq('category_id', catId).order('sort_order'),
    ]).then(([{data:cfg},{data:cf}]) => {
      const visibleKeys = cfg?.value ? new Set(JSON.parse(cfg.value)) : new Set(['supplier','panel_type','thickness','colour_code','finish','price','notes'])

      // Build columns from visible standard fields
      const ALL_STD = [
        { key:'item',       label:'Name',        w:190, type:'item' },
        { key:'room_name',  label:'Room',        w:100, type:'room' },
        { key:'supplier',   label:'Supplier',    w:120, type:'text',   settingKey:'supplier' },
        { key:'brand',      label:'Brand',       w:100, type:'text',   settingKey:'brand' },
        { key:'panel_type', label:'Panel type',  w:100, type:'text',   settingKey:'panel_type' },
        { key:'thickness',  label:'Thickness',   w:80,  type:'text',   settingKey:'thickness', placeholder:'mm' },
        { key:'colour',     label:'Colour',      w:100, type:'text',   settingKey:'colour_code' },
        { key:'finish',     label:'Finish',      w:100, type:'text',   settingKey:'finish' },
        { key:'dimensions', label:'Dimensions',  w:120, type:'text',   settingKey:'dimensions' },
        { key:'qty',        label:'Qty',         w:60,  type:'number' },
        { key:'unit',       label:'Unit',        w:80,  type:'select', settingKey:'unit', options:UNIT_OPTIONS },
        { key:'sku',        label:'SKU',         w:90,  type:'text',   settingKey:'sku' },
        { key:'price',      label:'Unit price',  w:90,  type:'price',  settingKey:'price' },
        { key:'po_number',  label:'PO Number',   w:120, type:'text' },
        { key:'status',     label:'Status',      w:110, type:'status' },
        { key:'needed',     label:'Date needed', w:110, type:'date' },
        { key:'notes',      label:'Notes',       w:140, type:'text',   settingKey:'notes' },
      ]
      const stdCols = ALL_STD.filter(c => !c.settingKey || visibleKeys.has(c.settingKey))

      // Add custom category fields
      const customCols = (cf||[]).map(f => ({
        key: '_cf_' + f.id,
        label: f.label,
        w: f.field_type==='number'||f.field_type==='price' ? 80 : 110,
        type: f.field_type==='price' ? 'price' : f.field_type==='number' ? 'number' : f.field_type==='select' ? 'select' : 'text',
        options: f.field_type==='select' && f.options ? JSON.parse(f.options) : undefined,
        fieldId: f.id, fieldLabel: f.label, isCustom: true,
      }))

      setGroupCols([...stdCols, ...customCols])
    })
  }, [rows])

  const activeCols = groupCols || cols
  const totalW = 28 + activeCols.reduce((a,c)=>a+c.w,0) + 80 + 50

  return (
    <div style={{ marginBottom:8 }}>
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
        <div style={{ overflowX:'auto' }}>
          <div style={{ minWidth:totalW }}>
            {/* Per-group column headers */}
            <div style={{ display:'flex', background:'#EEF2FF', borderBottom:'1px solid #C4D4F8', position:'sticky', top:0, zIndex:5 }}>
              <div style={{ width:28, flexShrink:0, borderRight:'1px solid #C4D4F8' }} />
              {activeCols.map(col=>(
                <div key={col.key} style={{ width:col.w, minWidth:col.w, padding:'6px 8px',
                  fontSize:9, fontWeight:700, color:'#5B8AF0', textTransform:'uppercase', letterSpacing:'.06em',
                  borderRight:'1px solid #C4D4F8', flexShrink:0, boxSizing:'border-box',
                  textAlign:col.type==='number'||col.type==='price'?'right':'left' }}>
                  {col.label}
                </div>
              ))}
              <div style={{ width:80, minWidth:80, padding:'6px 8px', fontSize:9, fontWeight:700, color:'#5B8AF0', textTransform:'uppercase', borderRight:'1px solid #C4D4F8', flexShrink:0, textAlign:'right' }}>Total</div>
              <div style={{ width:50, flexShrink:0 }} />
            </div>
            {rows.map(row=>(
              <OrderRow key={row.id} row={row} materials={materials}
                onUpdate={onUpdate} onDelete={onDelete} showAddLib={showAddLib} cols={activeCols} copyFormat={copyFormat} rooms={rooms} onEnsureMaterials={onEnsureMaterials} />
            ))}
            <div onClick={()=>onAddRow(title)} style={{ padding:'7px 16px', fontSize:12, color:'#9CA3AF', cursor:'pointer', borderBottom:'1px solid #F3F4F6', display:'flex', alignItems:'center', gap:6, background:'#FAFAFA' }}
              onMouseEnter={e=>e.currentTarget.style.background='#F3F4F6'}
              onMouseLeave={e=>e.currentTarget.style.background='#FAFAFA'}>
              <span style={{ fontSize:14 }}>+</span> Add {title} item
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Main ──────────────────────────────────────────────────────────
export default function OrderSheet() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { profile } = useApp()
  const location = useLocation()
  const toast = useToast()
  const roomFilter = new URLSearchParams(location.search).get('room') || null
  const [job,       setJob]       = useState(null)
  const [rows,      setRows]      = useState([])
  const [materials, setMaterials] = useState([])
  const [unorderedMats, setUnorderedMats] = useState([])
  const [poModal, setPoModal]   = useState(null) // { ids, existingPO } // materials on job not yet on order sheet
  const materialsLoadedRef = useRef(false)
  const [saving,    setSaving]    = useState(false)
  const [saved,     setSaved]     = useState(null)
  const [rooms,     setRooms]     = useState([])
  const [addLib,    setAddLib]    = useState(null)
  const [groupBy,   setGroupBy]   = useState('Category')
  const [filter,    setFilter]    = useState('All')
  const [cols,      setCols]      = useState(DEFAULT_COLS)
  const [copyFormat, setCopyFormat] = useState({ tokens:[], separator:' ' })
  const [selectedCatId, setSelectedCatId] = useState(null)
  const [allCats,   setAllCats]   = useState([])
  const extraCols = useCategoryFields(selectedCatId)
  const { getHeaderProps } = useDragColumns(cols, setCols)
  const [showColMenu, setShowColMenu] = useState(false)
  const saveTimer = useRef()

  // Set groupBy to Room when opened from a room context
  useEffect(()=>{ if(roomFilter) setGroupBy('Room') },[roomFilter])

  useEffect(()=>{
    Promise.all([
      supabase.from('jobs').select('id,name,client,job_number').eq('id',id).single(),
      Promise.resolve({ data: [] }), // materials loaded lazily on first item search
      supabase.from('order_items').select('*,materials(id,category_id)').eq('job_id',id).order('created_at'),
      supabase.from('rooms').select('id,name,type').eq('job_id',id).order('sort_order'),
      supabase.from('material_categories').select('id,name,parent_id').order('name'),
      supabase.from('job_materials').select('*,materials(*)').eq('job_id',id),
      Promise.resolve({ data: [] }), // appliances not included on order sheet
      Promise.resolve({ data: [] }), // room_materials loaded after rooms
    ]).then(async ([{data:j},{data:m},{data:o},{data:r},{data:cats},{data:jm},{data:ja}])=>{
      setJob(j)
      setMaterials(m||[])
      setRooms(r||[])
      setAllCats(cats||[])

      // Load room_materials using actual room IDs
      const roomIds = (r||[]).map(x=>x.id)
      const { data: rm } = roomIds.length
        ? await supabase.from('room_materials').select('*,materials(*),rooms(id,name)').in('room_id', roomIds)
        : { data: [] }

      // Convert existing order_items — keep as-is (don't auto-populate from job/room mats any more)
      const existingMatIds = new Set((o||[]).map(row=>row.material_id).filter(Boolean))

      // Enrich material names using auto-name settings
      const allMatEntries = [...(jm||[]), ...(rm||[])].map(e => e.materials).filter(Boolean)
      const uniqueMats = [...new Map(allMatEntries.map(m => [m.id, m])).values()]
      const enriched = await enrichMaterialNames(uniqueMats)
      const enrichedById = Object.fromEntries(enriched.map(m => [m.id, m]))

      // Find ALL materials on the job (job_materials + room_materials, deduped)
      const allJobMatIds = new Set()
      ;(jm||[]).filter(e=>e.materials).forEach(e => allJobMatIds.add(e.material_id))
      ;(rm||[]).filter(e=>e.materials).forEach(e => allJobMatIds.add(e.material_id))

      // Unordered = on job but NOT on order sheet yet
      const unordered = [...allJobMatIds]
        .filter(mid => !existingMatIds.has(mid))
        .map(mid => {
          const entry = (jm||[]).find(e=>e.material_id===mid) || (rm||[]).find(e=>e.material_id===mid)
          const mat = enrichedById[mid] || entry?.materials
          return mat ? { ...mat, name: enrichedById[mid]?.name || mat.name } : null
        }).filter(Boolean)
      setUnorderedMats(unordered)

      // Enrich existing order_items with category_id and correct name from library
      const enrichedOrders = (o||[]).map(row => {
        const mat = enrichedById[row.material_id]
        let priceBreaks = []
        try {
          if (row.price_breaks) {
            priceBreaks = typeof row.price_breaks === 'string' ? JSON.parse(row.price_breaks) : (row.price_breaks || [])
          }
        } catch {}
        return {
          ...row,
          price_breaks: priceBreaks,
          category_id: row.materials?.category_id || row.category_id || null,
          item: (mat?.name && mat.name !== 'New material') ? mat.name : (row.item || ''),
        }
      })

      // Expand kit rows into their live components for display.
      // The original kit row stays in the DB as the source of truth for status/PO;
      // we replace it in the rendered list with N component rows tagged kit_parent_id
      // so price/qty always reflects the current library, and status changes on any
      // component apply back to the whole kit via kit_parent_id.
      const kitRowIds = enrichedOrders.filter(r => r.kit_id).map(r => r.id)
      let kitComponentsByKitId = {}
      if (kitRowIds.length > 0) {
        const uniqueKitIds = [...new Set(enrichedOrders.filter(r=>r.kit_id).map(r=>r.kit_id))]
        const { data: kitItemsData } = await supabase
          .from('material_kit_items').select('*, materials(*)')
          .in('kit_id', uniqueKitIds).order('sort_order')
        ;(kitItemsData || []).forEach(it => {
          if (!kitComponentsByKitId[it.kit_id]) kitComponentsByKitId[it.kit_id] = []
          kitComponentsByKitId[it.kit_id].push(it)
        })
      }

      const expandedRows = []
      enrichedOrders.forEach(row => {
        if (!row.kit_id || !kitComponentsByKitId[row.kit_id]?.length) {
          expandedRows.push(row)
          return
        }
        // Keep the real kit row (status/PO live here, this is what gets saved to DB)
        // but mark it so it's not rendered as a normal line — only its components show.
        expandedRows.push({ ...row, is_kit_parent: true })

        const kitQty = parseFloat(row.qty) || 1
        const components = kitComponentsByKitId[row.kit_id]
        components.forEach((it, ci) => {
          const m = it.materials
          if (!m) return
          const componentQty = (parseFloat(it.qty) || 1) * kitQty
          expandedRows.push({
            ...row,
            id: `${row.id}__kit_${ci}`,
            kit_parent_id: row.id,
            kit_parent_status: row.status,
            item: m.name || '',
            supplier: m.supplier || '',
            panel_type: m.panel_type || '',
            thickness: m.thickness ? String(m.thickness) : '',
            colour: m.colour_code || '',
            finish: m.finish || '',
            price: m.price ? String(m.price) : '',
            material_id: m.id,
            qty: String(componentQty),
            price_breaks: [],
            // Component rows are read-only re: status — they mirror the parent kit row
            is_kit_component: true,
          })
        })
      })

      setRows(expandedRows)
      // Reconcile the order task immediately on load
      // (catches cases where status was changed elsewhere and task wasn't synced)
      setTimeout(() => syncOrderTask(enrichedOrders), 500)
      // Load copy format config
      supabase.from('app_settings').select('value').eq('key','copy_format').maybeSingle()
        .then(({data})=>{ if(data?.value){ const cfg=typeof data.value==='string'?JSON.parse(data.value):data.value; setCopyFormat(cfg) }})
    })
  },[id])

  const taskTimer = useRef()
  const ORDER_TASK_PREFIX = '🛒 Order materials'

  // Reconcile order task whenever the page loads with existing data
  const reconciledRef = useRef(false)
  useEffect(() => {
    if (!job?.id || rows.length === 0 || reconciledRef.current) return
    reconciledRef.current = true
    syncOrderTask(rows)
  }, [job?.id, rows.length])

  function triggerSave(r) {
    clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(()=>doSave(r), 1500)
    // Task sync is handled immediately in updateRow when status changes — no debounce needed
  }

  async function syncOrderTask(currentRows) {
    if (!job?.id) return
    // Run both queries in parallel
    const [{ data: allItems }, { data: jobData }] = await Promise.all([
      supabase.from('order_items').select('id,item,status').eq('job_id', job.id),
      supabase.from('jobs').select('tasks').eq('id', job.id).single(),
    ])
    if (!jobData) return

    const toOrderItems = (allItems||[]).filter(r => r.item?.trim() && r.status === 'To order')
    const allDone = toOrderItems.length === 0

    const tasks = typeof jobData.tasks === 'string'
      ? JSON.parse(jobData.tasks || '[]')
      : (jobData.tasks || [])

    const existingIdx = tasks.findIndex(t => t.title?.startsWith(ORDER_TASK_PREFIX))

    if (allDone) {
      if (existingIdx >= 0 && !tasks[existingIdx].done) {
        tasks[existingIdx] = { ...tasks[existingIdx], done: true, completedAt: new Date().toISOString() }
        await supabase.from('jobs').update({ tasks: JSON.stringify(tasks) }).eq('id', job.id)
        window.dispatchEvent(new CustomEvent('tasks-updated', { detail: { jobId: job.id } }))
      }
    } else {
      const itemNames = toOrderItems.slice(0, 3).map(r => r.item).join(', ')
      const extra = toOrderItems.length > 3 ? ` +${toOrderItems.length - 3} more` : ''
      const title = `${ORDER_TASK_PREFIX}: ${itemNames}${extra}`
      if (existingIdx >= 0) {
        if (tasks[existingIdx].title === title && !tasks[existingIdx].done) return // no change needed
        tasks[existingIdx] = { ...tasks[existingIdx], title, done: false, completedAt: null }
      } else {
        tasks.push({
          id: Date.now().toString(36) + Math.random().toString(36).slice(2),
          title, done: false,
          assignedTo: profile?.id || null,
          assignedName: profile?.full_name || profile?.email || null,
          createdAt: new Date().toISOString(),
          source: 'order_sheet',
        })
      }
      await supabase.from('jobs').update({ tasks: JSON.stringify(tasks) }).eq('id', job.id)
      window.dispatchEvent(new CustomEvent('tasks-updated', { detail: { jobId: job.id } }))
    }
  }

  async function doSave(rowsToSave) {
    setSaving(true)
    const toSave = rowsToSave
      .filter(r => r.item && r.item.trim())
      .filter(r => !r.is_kit_component) // component rows are derived for display — never write them as real order_items
      .map(r => {
        const { _fromRoom, price_breaks, kit_parent_id, kit_parent_status, is_kit_component, is_kit_parent, ...row } = r
        const hasPriceBreaks = Array.isArray(price_breaks) && price_breaks.length > 0
        return {
          ...row,
          job_id: id,
          updated_at: new Date().toISOString(),
          // Only include price_breaks if non-empty (column may not exist yet — add via SQL migration)
          ...(hasPriceBreaks ? { price_breaks: JSON.stringify(price_breaks) } : {}),
        }
      })
    if (toSave.length > 0) {
      const { error } = await supabase.from('order_items').upsert(toSave, { onConflict:'id' })
      if (error) { toast(error.message, 'error'); setSaving(false); return }
      window.dispatchEvent(new CustomEvent('order-items-updated'))
    }
    setSaved(new Date())
    setSaving(false)
  }

  function updateRow(rowId, patch) {
    setRows(prev=>{
      const targetRow = prev.find(r => r.id === rowId)
      // If this is a kit component row, redirect the edit to the parent kit row instead —
      // components are a live readout of the library and shouldn't be edited individually
      const effectiveId = targetRow?.is_kit_component ? targetRow.kit_parent_id : rowId

      const updated = prev.map(r => {
        const rMatches = r.id === rowId || (effectiveId && r.kit_parent_id === effectiveId) || r.id === effectiveId
        if (!rMatches) return r
        // Custom field columns have _cf_ prefix — store in custom_fields JSON
        const cfPatch = {}, regularPatch = {}
        Object.entries(patch).forEach(([k,v]) => {
          if (k.startsWith('_cf_')) cfPatch[k.replace('_cf_','')] = v
          else regularPatch[k] = v
        })
        const base = { ...r, ...regularPatch }
        if (Object.keys(cfPatch).length > 0) {
          const existing = safeParse(r.custom_fields)
          base.custom_fields = JSON.stringify({ ...existing, ...cfPatch })
        }
        return base
      })
      triggerSave(updated)
      // Sync task immediately when status changes — no debounce
      if ('status' in patch) syncOrderTask(updated)
      return updated
    })
  }

  function updateRowStatus(rowId, newStatus) {
    // Intercept "Ordered" to require PO number
    if (newStatus === 'Ordered') {
      const row = rows.find(r => r.id === rowId)
      setPoModal({ ids: [rowId], existingPO: row?.po_number || null })
    } else {
      updateRow(rowId, { status: newStatus })
    }
  }

  function addRow(groupTitle) {
    const defaults = groupBy==='Category'
      ? { panel_type: groupTitle!=='Other'?groupTitle:'', category: 'Board' }
      : { supplier: groupTitle==='No supplier'?'':groupTitle }
    setRows(prev=>{
      const nr = makeRow({...defaults, room_id: roomFilter||null})
      const updated = [...prev, nr]
      triggerSave(updated)
      return updated
    })
  }

  async function deleteRow(rowId) {
    const { error } = await supabase.from('order_items').delete().eq('id', rowId)
    if (error) { toast(error.message, 'error'); return }
    // Also remove any kit component rows whose parent was just deleted
    setRows(prev => prev.filter(r => r.id !== rowId && r.kit_parent_id !== rowId))
    toast('Row deleted')
  }

  function markOrdered(ids) {
    const existingPO = rows.find(r => ids.includes(r.id) && r.po_number)?.po_number
    setPoModal({ ids, existingPO: existingPO || null })
  }

  function confirmMarkOrdered(ids, poNumber) {
    setPoModal(null)
    setRows(prev => {
      const updated = prev.map(r => ids.includes(r.id) && r.status==='To order'
        ? {...r, status:'Ordered', po_number: poNumber} : r)
      doSave(updated)
      syncOrderTask(updated)
      return updated
    })
    toast(`${ids.length} item${ids.length>1?'s':''} marked as ordered ✓`)
  }

  // Group rows — kit parent rows are excluded from display (their components render instead);
  // they still live in `rows` so doSave can persist status/PO changes back to them.
  const displayableRows = rows.filter(r => !r.is_kit_parent)
  const filteredByRoom = roomFilter ? displayableRows.filter(r=>r.room_id===roomFilter) : displayableRows
  const filtered = filter==='All' ? filteredByRoom : filteredByRoom.filter(r=>r.status===filter)
  // Enrich rows with room_name for display
  const rowsWithRoom = useMemo(()=>
    filtered.map(r => ({
      ...r,
      room_name: r.room_id ? (rooms.find(rm=>rm.id===r.room_id)?.name || 'Unknown room') : ''
    }))
  , [filtered, rooms])

  const groups = useMemo(()=>{
    const map = {}
    rowsWithRoom.forEach(r=>{
      let key
      if (groupBy==='Category') {
        key = r.panel_type || r.category || 'Other'
      } else if (groupBy==='Supplier') {
        key = r.supplier || 'No supplier'
      } else {
        // Room grouping
        key = r.room_name || 'No room'
      }
      if (!map[key]) map[key]=[]
      map[key].push(r)
    })
    if (groupBy==='Category') {
      const preferred = ['MDF','Particle Board','Plywood','Hardwood','Board','Hardware','Appliance','Accessory','Other']
      return Object.keys(map).sort((a,b)=>{
        const ai=preferred.indexOf(a),bi=preferred.indexOf(b)
        if(ai>=0&&bi>=0) return ai-bi; if(ai>=0) return -1; if(bi>=0) return 1
        return a.localeCompare(b)
      }).map(k=>([k,map[k]]))
    }
    if (groupBy==='Room') {
      // Rooms in their sort order, no room last
      const roomOrder = rooms.map(r=>r.name)
      return Object.keys(map).sort((a,b)=>{
        if(a==='No room') return 1; if(b==='No room') return -1
        return roomOrder.indexOf(a)-roomOrder.indexOf(b)
      }).map(k=>([k,map[k]]))
    }
    return Object.entries(map).sort(([a],[b])=>a.localeCompare(b))
  },[rowsWithRoom, groupBy, rooms])

  const toOrderTotal = displayableRows.filter(r=>r.status==='To order').length
  const grandTotal = displayableRows.reduce((a,r)=>{ const q=parseFloat(r.qty),p=parseFloat(r.price); return a+(!isNaN(q)&&!isNaN(p)?q*p:0) },0)
  const totalW = 28 + cols.reduce((a,c)=>a+c.w,0) + 80 + 50

  async function ensureMaterialsLoaded() {
    if (materialsLoadedRef.current) return
    materialsLoadedRef.current = true
    const { data } = await supabase.from('materials').select('id,name,supplier,panel_type,thickness,colour_code,finish,price,color,storage_path,category_id,custom_fields').order('name')
    setMaterials(data||[])
  }

  function printOrder() {
    const date = new Date().toLocaleDateString('en-NZ', { day:'numeric', month:'long', year:'numeric' })
    const filteredRows = displayableRows.filter(r => filter === 'All' || r.status === filter)

    // Always group by Room for print — clearest for a physical order sheet
    const roomOrder = rooms.map(r => r.name)
    const groupMap = {}
    filteredRows.forEach(r => {
      const roomName = r.room_id ? (rooms.find(rm=>rm.id===r.room_id)?.name || 'General') : 'General'
      if (!groupMap[roomName]) groupMap[roomName] = []
      groupMap[roomName].push({...r, room_name: roomName})
    })
    const groupEntries = Object.entries(groupMap).sort(([a],[b]) => {
      if (a==='General') return 1; if (b==='General') return -1
      return roomOrder.indexOf(a) - roomOrder.indexOf(b)
    })

    const groupHTML = groupEntries.map(([groupTitle, groupRows]) => {
      const friendlyTitle = groupTitle === 'No room' ? 'General / No room assigned' : groupTitle

      // Split rows into sub-groups: boards (have panel_type/thickness) and hardware/other
      const boardRows    = groupRows.filter(r => r.panel_type || r.thickness || r.colour)
      const hardwareRows = groupRows.filter(r => !r.panel_type && !r.thickness && !r.colour)

      const subtotal = groupRows.reduce((a,r)=>{ const q=parseFloat(r.qty),p=parseFloat(r.price); return a+(!isNaN(q)&&!isNaN(p)?q*p:0) },0)

      function buildTable(rows) {
        if (!rows.length) return ''
        const hasPrice     = rows.some(r => parseFloat(r.price) > 0)
        const hasThickness = rows.some(r => r.thickness)
        const hasSupplier  = rows.some(r => r.supplier)
        const hasColour    = rows.some(r => r.colour)
        const hasFinish    = rows.some(r => r.finish)
        const hasPanelType = rows.some(r => r.panel_type)
        const hasSku       = rows.some(r => r.sku)
        const hasRoom      = groupBy !== 'Room' && rows.some(r => r.room_name)
        const hasQty       = rows.some(r => r.qty)
        const hasNotes     = rows.some(r => r.notes)
        const hasPO        = rows.some(r => r.po_number && r.status === 'Ordered')

        // Custom fields present in this set of rows
        const customFieldKeys = new Set()
        rows.forEach(r => {
          const cf = r.custom_fields || {}
          Object.entries(cf).forEach(([k, v]) => { if (v) customFieldKeys.add(k) })
        })
        const customCols = [...customFieldKeys].map(k => ({
          key: `_cf_${k}`, label: k.replace(/_/g,' ').replace(/\b\w/g,c=>c.toUpperCase()), cfKey: k
        }))

        const cols = [
          { key:'item',      label:'Item', always:true },
          hasRoom      && { key:'room_name',  label:'Room' },
          hasSupplier  && { key:'supplier',   label:'Supplier' },
          hasPanelType && { key:'panel_type', label:'Panel type' },
          hasThickness && { key:'thickness',  label:'Thickness', suffix:'mm' },
          hasColour    && { key:'colour',     label:'Colour' },
          hasFinish    && { key:'finish',     label:'Finish' },
          hasSku       && { key:'sku',        label:'SKU' },
          ...customCols,
          hasQty       && { key:'qty',        label:'Qty', num:true },
          { key:'unit', label:'Unit' },
          hasPrice     && { key:'price',      label:'Unit price', price:true },
          hasPrice && hasQty && { key:'_total', label:'Total', price:true },
          { key:'status',    label:'Status' },
          hasPO        && { key:'po_number', label:'PO Number', mono:true },
          hasNotes     && { key:'notes',      label:'Notes' },
        ].filter(Boolean)

        const headerRow = cols.map(c => {
          const align = (c.price || c.num || c.key==='_total') ? ' style="text-align:right"' : ''
          const w = c.key==='item'?'w:25%':c.key==='notes'?'w:15%':c.price||c.key==='_total'?'w:8%':c.num?'w:5%':c.key==='unit'?'w:5%':c.key==='status'?'w:7%':''
          return `<th${align}>${c.label}</th>`
        }).join('')
        const dataRows = rows.map(r => {
          const cf = r.custom_fields || {}
          const qty = parseFloat(r.qty), price = parseFloat(r.price)
          const total = !isNaN(qty)&&!isNaN(price) ? (qty*price).toFixed(2) : ''
          const statusStyle = r.status==='Ordered'?'color:#1E40AF;font-weight:600':r.status==='Received'?'color:#166534;font-weight:600':'color:#854D0E;font-weight:600'
          const cells = cols.map(c => {
            if (c.cfKey)          return `<td>${cf[c.cfKey]||''}</td>`
            if (c.key==='_total') return `<td style="text-align:right">${total?`$${total}`:''}</td>`
            if (c.key==='status') return `<td style="${statusStyle}">${r[c.key]||''}</td>`
            if (c.mono)           return `<td style="font-family:monospace;font-size:9px">${r[c.key]||''}</td>`
            if (c.price)          return `<td style="text-align:right">${r[c.key]?`$${parseFloat(r[c.key]).toFixed(2)}`:''}</td>`
            if (c.num)            return `<td style="text-align:right">${r[c.key]||''}</td>`
            if (c.suffix)         return `<td>${r[c.key]?r[c.key]+c.suffix:''}</td>`
            return `<td>${r[c.key]||''}</td>`
          }).join('')
          return `<tr>${cells}</tr>`
        }).join('')

        const colgroup = `<colgroup>${cols.map(c => {
          const w = c.key==='item' ? '22%'
            : c.key==='notes'     ? '14%'
            : c.key==='supplier'  ? '11%'
            : c.key==='room_name' ? '10%'
            : (c.price || c.key==='_total') ? '8%'
            : c.num               ? '5%'
            : c.key==='unit'      ? '5%'
            : c.key==='status'    ? '8%'
            : c.key==='po_number' ? '12%'
            : '9%'
          return `<col style="width:${w}">`
        }).join('')}</colgroup>`

        return `<table style="table-layout:fixed">${colgroup}<thead><tr>${headerRow}</tr></thead><tbody>${dataRows}</tbody></table>`
      }

      const boardsHTML    = boardRows.length    ? `${boardRows.length !== groupRows.length ? '<div style="font-size:10px;font-weight:600;color:#666;margin:6px 0 4px;text-transform:uppercase;letter-spacing:.04em">Boards &amp; Panels</div>' : ''}${buildTable(boardRows)}` : ''
      const hardwareHTML  = hardwareRows.length ? `${hardwareRows.length !== groupRows.length ? '<div style="font-size:10px;font-weight:600;color:#666;margin:10px 0 4px;text-transform:uppercase;letter-spacing:.04em">Hardware &amp; Other</div>' : ''}${buildTable(hardwareRows)}` : ''

      return `
        <div class="group">
          <div class="group-title">${friendlyTitle} <span class="group-count">${groupRows.length} item${groupRows.length!==1?'s':''}</span>${subtotal>0?`<span class="group-subtotal">$${subtotal.toFixed(2)}</span>`:''}</div>
          ${boardsHTML}${hardwareHTML}
        </div>`
    }).join('')

    const grandTotal = filteredRows.reduce((a,r)=>{ const q=parseFloat(r.qty),p=parseFloat(r.price); return a+(!isNaN(q)&&!isNaN(p)?q*p:0) },0)
    const toOrder = filteredRows.filter(r=>r.status==='To order').length

    const html = `<!DOCTYPE html><html><head><meta charset="utf-8">
<title>Order Sheet — ${job?.name||''} — ${date}</title>
<style>

/* ── Page & base ── */
*{box-sizing:border-box;margin:0;padding:0}
@page{size:A4 landscape;margin:12mm}
body{font-family:-apple-system,BlinkMacSystemFont,'Helvetica Neue',Arial,sans-serif;
  font-size:10px;color:#111;background:#fff;padding:12mm;}
@media print{body{padding:0}}

/* ── Header ── */
.header{display:flex;justify-content:space-between;align-items:flex-start;
  border-bottom:2px solid #2A3042;padding-bottom:12px;margin-bottom:20px}
.title{font-size:22px;font-weight:800;color:#2A3042}
.sub{font-size:12px;color:#555;margin-top:3px}
.meta{text-align:right;font-size:10px;color:#555;line-height:1.8}
.stats{display:flex;gap:20px;margin-top:8px}
.stat-num{font-size:14px;font-weight:800;color:#2A3042;margin-right:4px}
.stat-lbl{font-size:10px;color:#666}

/* ── Typography ── */
h2{font-size:14px;font-weight:700;margin:16px 0 8px}

/* ── Group ── */
.group{margin-bottom:24px}
.group-title{font-size:13px;font-weight:700;color:#2A3042;margin-bottom:8px;
  display:flex;align-items:center;gap:10px}
.group-count{font-size:10px;font-weight:500;color:#666}
.group-subtotal{margin-left:auto;font-size:12px;font-weight:700;color:#2A3042}

/* ── Tables ── */
table{width:100%;border-collapse:collapse;font-size:9.5px;margin-bottom:4px;table-layout:fixed}
th{background:#2A3042;color:#fff;padding:6px 8px;text-align:left;
  font-size:8.5px;font-weight:700;text-transform:uppercase;letter-spacing:.04em;white-space:nowrap;overflow:hidden}
td{padding:6px 8px;border-bottom:1px solid #eee;vertical-align:top;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
tr:nth-child(even) td{background:#fafafa}

/* ── Grand total ── */
.grand-total{text-align:right;font-size:13px;font-weight:800;
  padding:10px 0;border-top:2px solid #2A3042;margin-top:8px}

/* ── Footer ── */
.footer{margin-top:16px;padding-top:8px;border-top:1px solid #ddd;
  display:flex;justify-content:space-between;font-size:9px;color:#888}

/* ── Misc ── */
.badge{display:inline-block;padding:2px 8px;border-radius:10px;font-size:9px;font-weight:700}
.page-break{page-break-before:always}
</style></head><body>
<div class="header">
  <div>
    <div class="title">${job?.name||'Order Sheet'}</div>
    <div class="sub">Order Sheet${filter!=='All'?` — ${filter}`:''}</div>
    <div class="stats">
      <div><span class="stat-num">${rows.length}</span><span class="stat-lbl">items</span></div>
      ${toOrder>0?`<div><span class="stat-num" style="color:#854D0E">${toOrder}</span><span class="stat-lbl">to order</span></div>`:''}
      ${grandTotal>0?`<div><span class="stat-num">$${grandTotal.toFixed(2)}</span><span class="stat-lbl">total</span></div>`:''}
    </div>
  </div>
  <div class="meta">
    <div style="font-size:14px;font-weight:700">${date}</div>
    <div style="margin-top:4px">Grouped by ${groupBy}</div>
  </div>
</div>
${groupHTML}
${grandTotal>0?`<div class="grand-total">Grand total: $${grandTotal.toFixed(2)}</div>`:''}
<div class="footer"><span>${job?.name||''} — Order Sheet</span><span>${date}</span></div>
</body></html>`

    const blob = new Blob([html], { type:'text/html;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const win = window.open(url, '_blank')
    if (!win) {
      const a = document.createElement('a')
      a.href = url; a.download = `${(job?.name||'order-sheet').replace(/\s+/g,'-')}-order.html`; a.click()
    } else {
      setTimeout(() => URL.revokeObjectURL(url), 30000)
    }
  }



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
            <button onClick={printOrder}
              style={{ fontSize:12, fontWeight:700, padding:'7px 14px', borderRadius:9, border:'1px solid #C4D4F8', background:'#EEF2FF', color:'#3730A3', cursor:'pointer', display:'flex', alignItems:'center', gap:5 }}>
              🖨 Print / PDF
            </button>
          </div>
          {/* category field columns selector */}
          {allCats.filter(c=>!c.parent_id).length > 0 && (
            <div style={{ display:'flex', alignItems:'center', gap:6 }}>
              <span style={{ fontSize:11, fontWeight:600, color:'#9CA3AF' }}>Category fields:</span>
              <select value={selectedCatId||''} onChange={e=>setSelectedCatId(e.target.value||null)}
                style={{ fontSize:12, padding:'5px 8px', borderRadius:7, border:'1px solid #E8ECF0', background:'#fff', outline:'none', color:'#374151' }}>
                <option value="">None</option>
                {allCats.map(cat=>(
                  <option key={cat.id} value={cat.id}>{'  '.repeat(cat.parent_id?1:0)}{cat.parent_id?'└ ':''}{cat.name}</option>
                ))}
              </select>
              {selectedCatId && extraCols.length > 0 && (
                <span style={{ fontSize:11, color:'#5B8AF0', fontWeight:600 }}>+{extraCols.length} column{extraCols.length!==1?'s':''}</span>
              )}
            </div>
          )}
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

      {/* room filter banner */}
      {roomFilter && rooms.length > 0 && (()=>{
        const rm = rooms.find(r=>r.id===roomFilter)
        return rm ? (
          <div style={{ display:'flex', alignItems:'center', gap:10, padding:'8px 14px', background:'#EEF2FF', borderRadius:10, border:'1px solid #C4D4F8', marginBottom:10 }}>
            <span style={{ fontSize:14 }}>🏠</span>
            <span style={{ fontSize:13, fontWeight:600, color:'#3730A3', flex:1 }}>Showing orders for <strong>{rm.name}</strong></span>
            <button onClick={()=>navigate(`/job/${id}/orders`)} style={{ fontSize:11, color:'#6B7280', background:'none', border:'none', cursor:'pointer' }}>View all</button>
          </div>
        ) : null
      })()}

      {/* Unordered materials notification — compact collapsible */}
      {unorderedMats.length > 0 && (
        <UnorderedNotification
          mats={unorderedMats}
          onAdd={mat => {
            const row = makeRow({
              item: mat.name || '',
              supplier: mat.supplier || '',
              panel_type: mat.panel_type || '',
              thickness: mat.thickness ? String(mat.thickness) : '',
              colour: mat.colour_code || '',
              finish: mat.finish || '',
              price: mat.price ? String(mat.price) : '',
              notes: mat.notes || '',
              category: mat.panel_type ? 'Board' : 'Hardware',
              material_id: mat.id,
              category_id: mat.category_id || null,
              custom_fields: safeParse(mat.custom_fields),
            })
            setRows(prev => [...prev, row])
            setUnorderedMats(prev => prev.filter(m => m.id !== mat.id))
          }}
          onAddAll={mats => {
            const newRows = mats.map(mat => makeRow({
              item: mat.name || '',
              supplier: mat.supplier || '',
              panel_type: mat.panel_type || '',
              thickness: mat.thickness ? String(mat.thickness) : '',
              colour: mat.colour_code || '',
              finish: mat.finish || '',
              price: mat.price ? String(mat.price) : '',
              notes: mat.notes || '',
              category: mat.panel_type ? 'Board' : 'Hardware',
              material_id: mat.id,
              category_id: mat.category_id || null,
              custom_fields: safeParse(mat.custom_fields),
            }))
            setRows(prev => [...prev, ...newRows])
            setUnorderedMats([])
          }}
        />
      )}

      {/* status filter */}
      <div style={{ display:'flex', gap:6, marginBottom:12, flexWrap:'wrap' }}>
        {['All',...STATUS_OPTIONS].map(f=>{
          const count = f==='All'?displayableRows.length:displayableRows.filter(r=>r.status===f).length
          const s = f!=='All'?STATUS_STYLES[f]:null
          return (
            <button key={f} onClick={()=>setFilter(f)}
              style={{ fontSize:12, fontWeight:600, padding:'5px 12px', borderRadius:20, border:`1px solid ${filter===f?(s?.border||'#5B8AF0'):'#E8ECF0'}`, background:filter===f?(s?.bg||'#EEF2FF'):'#fff', color:filter===f?(s?.color||'#3730A3'):'#6B7280', cursor:'pointer' }}>
              {f} <span style={{ opacity:.7, fontSize:11 }}>({count})</span>
            </button>
          )
        })}
      </div>

      {/* table — groups each have their own column headers */}
      <div style={{ borderRadius:12, border:'1px solid #E8ECF0', boxShadow:'0 1px 3px rgba(0,0,0,0.04)', overflow:'hidden' }}>
          {groups.map(([groupTitle, groupRows])=>(
            <GroupSection key={groupTitle} title={groupTitle} rows={groupRows}
              materials={materials} onUpdate={updateRow} onUpdateStatus={updateRowStatus} onDelete={deleteRow}
              onAddRow={addRow} showAddLib={setAddLib} onMarkOrdered={markOrdered}
              cols={cols} copyFormat={copyFormat} rooms={rooms} onEnsureMaterials={ensureMaterialsLoaded} />
          ))}
          {groups.length===0 && (
            <div style={{ padding:'40px 0', textAlign:'center', color:'#9CA3AF', fontSize:13 }}>No items yet — click + Add row to start</div>
          )}
      </div>

      {/* grand total row */}
      {grandTotal > 0 && (
        <div style={{ display:'flex', justifyContent:'flex-end', padding:'10px 16px', fontSize:13, fontWeight:700, color:'#2A3042' }}>
          Grand total: <span style={{ marginLeft:8, color:'#5B8AF0' }}>${grandTotal.toFixed(2)}</span>
        </div>
      )}

      {/* PO Number modal */}
      {poModal && (
        <POModal
          jobNumber={job?.job_number || ''}
          existingPO={poModal.existingPO}
          onConfirm={po => confirmMarkOrdered(poModal.ids, po)}
          onCancel={() => setPoModal(null)}
        />
      )}
    </div>
  )
}
