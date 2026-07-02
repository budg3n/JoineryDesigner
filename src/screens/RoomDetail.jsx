// RoomDetail — floating panel showing a single room's details
import React, { useState, useEffect, useRef } from 'react'
import ReactDOM from 'react-dom'
import { useNavigate } from 'react-router-dom'
import { supabase, pubUrl, BUCKET } from '../lib/supabase'
import { enrichMaterialNames } from '../lib/materialName'
import { loadUnitTypes } from './UnitSettings'
import { useApp } from '../context/AppContext'
import { useToast } from '../components/Toast'
import NotionNotes from '../components/NotionNotes'
import OnSite from './OnSite'

const ROOM_TYPES = ['Kitchen', 'Laundry', 'Butler\'s Pantry', 'Ensuite', 'Bathroom', 'Bedroom', 'Living', 'Office', 'Garage', 'Other']

const KITCHEN_SPEC_FIELDS = [
  { key:'base_height',         label:'Base cabinet height', unit:'mm', group:'Base' },
  { key:'base_depth',          label:'Base cabinet depth',  unit:'mm', group:'Base' },
  { key:'upper_height',        label:'Upper cabinet height',unit:'mm', group:'Upper' },
  { key:'upper_depth',         label:'Upper cabinet depth', unit:'mm', group:'Upper' },
  { key:'tall_height',         label:'Tall cabinet height', unit:'mm', group:'Tall' },
  { key:'tall_depth',          label:'Tall cabinet depth',  unit:'mm', group:'Tall' },
  { key:'bench_thickness',     label:'Benchtop thickness',  unit:'mm', group:'Benchtop' },
  { key:'bench_overhang_front',label:'Overhang front',      unit:'mm', group:'Benchtop' },
  { key:'bench_overhang_side', label:'Overhang sides',      unit:'mm', group:'Benchtop' },
  { key:'toe_kick_height',     label:'Toe kick height',     unit:'mm', group:'Base' },
]

function SpecRow({ label, value, unit='mm', onChange }) {
  const [v, setV] = useState(value||'')
  const [editing, setEditing] = useState(false)
  const ref = useRef()
  useEffect(()=>setV(value||''),[value])
  useEffect(()=>{ if(editing && ref.current) ref.current.focus() },[editing])
  return (
    <div onClick={()=>setEditing(true)} style={{ display:'flex', alignItems:'center', padding:'10px 16px', cursor:'text', borderBottom:'1px solid #F3F4F6', background:editing?'#FAFBFF':'#fff', transition:'background .1s' }}
      onMouseEnter={e=>{if(!editing)e.currentTarget.style.background='#F9FAFB'}}
      onMouseLeave={e=>{if(!editing)e.currentTarget.style.background='#fff'}}>
      <span style={{ flex:1, fontSize:13, color:'#374151' }}>{label}</span>
      {editing ? (
        <input ref={ref} type="number" value={v}
          onChange={e=>setV(e.target.value)}
          onBlur={()=>{ setEditing(false); onChange(v) }}
          onKeyDown={e=>{ if(e.key==='Enter'){ setEditing(false); onChange(v) } if(e.key==='Escape'){ setEditing(false); setV(value||'') }}}
          style={{ border:'none', borderBottom:'2px solid #5B8AF0', outline:'none', background:'transparent', fontSize:13, fontWeight:600, color:'#2A3042', width:80, textAlign:'right', fontFamily:'inherit', padding:'0 4px' }} />
      ) : (
        <span style={{ fontSize:13, fontWeight:600, color:v?'#1D1D1D':'#C4C9D4', minWidth:60, textAlign:'right' }}>
          {v ? `${v}${unit}` : '—'}
        </span>
      )}
    </div>
  )
}

const TASK_PRIORITIES = ['High', 'Medium', 'Low']
const TASK_PRIORITY_STYLE = {
  High:   { bg:'#FEF2F2', color:'#E24B4A', border:'#FCA5A5', dot:'#E24B4A' },
  Medium: { bg:'#FFF7ED', color:'#C2410C', border:'#FED7AA', dot:'#F97316' },
  Low:    { bg:'#F0FDF4', color:'#166534', border:'#86EFAC', dot:'#1D9E75' },
}

function TaskRow({ task, onToggle, onDelete, onUpdate }) {
  const [editing, setEditing] = React.useState(false)
  const [localTitle, setLocalTitle] = React.useState(task.title || '')
  const isOver = !task.done && task.date && new Date(task.date) < new Date()
  const priority = task.priority || 'Medium'
  const ps = TASK_PRIORITY_STYLE[priority] || TASK_PRIORITY_STYLE.Medium

  React.useEffect(() => { setLocalTitle(task.title || '') }, [task.title])

  function saveTitle(val) {
    const v = val.trim()
    if (v && v !== task.title) onUpdate('title', v)
    setEditing(false)
  }

  return (
    <div style={{ display:'flex', alignItems:'flex-start', gap:10, padding:'8px 12px', background: ps.bg, borderRadius:9, border:`1px solid ${isOver?'#FCA5A5':ps.border}`, marginBottom:6 }}>
      <div onClick={onToggle} style={{ width:18, height:18, borderRadius:5, border:`2px solid ${task.done?'#1D9E75':isOver?'#E24B4A':ps.dot}`, background:task.done?'#1D9E75':'#fff', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0, marginTop:2, cursor:'pointer', transition:'all .12s' }}>
        {task.done && <span style={{ color:'#fff', fontSize:11, fontWeight:700 }}>✓</span>}
      </div>
      <div style={{ flex:1, minWidth:0 }}>
        {/* Priority + title row */}
        <div style={{ display:'flex', alignItems:'center', gap:6, marginBottom:3 }}>
          <select value={priority} onChange={e => onUpdate('priority', e.target.value)}
            onClick={e => e.stopPropagation()}
            style={{ fontSize:9, fontWeight:700, padding:'1px 5px', borderRadius:5, border:`1px solid ${ps.border}`, background:'#fff', color:ps.color, cursor:'pointer', outline:'none', flexShrink:0 }}>
            {TASK_PRIORITIES.map(p => <option key={p} value={p}>{p}</option>)}
          </select>
        </div>
        {editing && !task.done ? (
          <input autoFocus value={localTitle} onChange={e => setLocalTitle(e.target.value)}
            onBlur={e => saveTitle(e.target.value)}
            onKeyDown={e => { if(e.key==='Enter') saveTitle(e.target.value); if(e.key==='Escape'){setLocalTitle(task.title||'');setEditing(false)} }}
            style={{ width:'100%', fontSize:13, fontWeight:500, color:'#2A3042', border:'none', borderBottom:'1.5px solid #5B8AF0', outline:'none', background:'transparent', padding:'0 0 2px', fontFamily:'inherit', boxSizing:'border-box' }} />
        ) : (
          <div onClick={() => !task.done && setEditing(true)} title={task.done?'':'Click to edit'}
            style={{ fontSize:13, fontWeight:500, color:task.done?'#9CA3AF':'#2A3042', textDecoration:task.done?'line-through':'none', cursor:task.done?'default':'text', minHeight:18 }}>
            {task.title}
          </div>
        )}
        <div style={{ display:'flex', gap:5, marginTop:4, flexWrap:'wrap', alignItems:'center' }}>
          <div style={{ position:'relative', display:'flex', alignItems:'center' }}>
            <svg style={{ position:'absolute', left:5, pointerEvents:'none', color:'#9CA3AF' }} width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
            <input type="date" defaultValue={task.date||''} onChange={e=>onUpdate('date',e.target.value)}
              style={{ fontSize:11, padding:'3px 5px 3px 20px', border:'1px solid #E8ECF0', borderRadius:6, outline:'none', background:'#fff', WebkitAppearance:'none', appearance:'none', color:task.date?(isOver?'#E24B4A':'#6B7280'):'#C4C9D4' }} />
          </div>
          <div style={{ position:'relative', display:'flex', alignItems:'center' }}>
            <svg style={{ position:'absolute', left:5, pointerEvents:'none', color:'#9CA3AF' }} width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
            <input type="time" defaultValue={task.time||''} onChange={e=>onUpdate('time',e.target.value)}
              style={{ fontSize:11, padding:'3px 5px 3px 20px', border:'1px solid #E8ECF0', borderRadius:6, outline:'none', width:95, background:'#fff', WebkitAppearance:'none', appearance:'none' }} />
          </div>
          {task.done && task.completed_by && <span style={{ fontSize:10, color:'#9CA3AF' }}>✓ {task.completed_by}</span>}
        </div>
      </div>
      <button onClick={onDelete} style={{ background:'none', border:'none', cursor:'pointer', color:'#D1D5DB', fontSize:16, lineHeight:1, flexShrink:0 }}
        onMouseEnter={e=>e.currentTarget.style.color='#E24B4A'} onMouseLeave={e=>e.currentTarget.style.color='#D1D5DB'}>×</button>
    </div>
  )
}


// ── Room Orders Tab ───────────────────────────────────────────────
const UNITS = ['sheets','pcs','m','m²','sets','rolls','boxes','kg','L']
const STATUS_COLOR = {
  'To order': {bg:'#FEF9C3',color:'#854D0E'},
  'Ordered':  {bg:'#DBEAFE',color:'#1E40AF'},
  'Received': {bg:'#DCFCE7',color:'#166534'},
}
const EMPTY_FORM = {
  item:'', supplier:'', panel_type:'', thickness:'', colour:'',
  finish:'', dimensions:'', qty:'', unit:'sheets', sku:'',
  price:'', notes:'', material_id:null,
}

// Compute effective price based on qty and price_breaks
// Small inline copy button — shows a ✓ tick for 1.5s after copying
// Lightweight material detail modal — shared between room materials and orders
function MaterialDetailModal({ material: m, onClose }) {
  const [tab, setTab] = React.useState('details')
  const [suppliers, setSuppliers] = React.useState([])
  const [loadingSuppliers, setLoadingSuppliers] = React.useState(false)
  React.useEffect(() => {
    if (tab !== 'suppliers' || !m?.id || suppliers.length) return
    setLoadingSuppliers(true)
    supabase.from('material_suppliers').select('id,price,sku,lead_time,is_preferred,suppliers(name)').eq('material_id', m.id).order('is_preferred', {ascending:false})
      .then(({ data }) => { setSuppliers(data||[]); setLoadingSuppliers(false) })
  }, [tab, m?.id])
  if (!m) return null
  let cf = {}
  try { cf = m.custom_fields ? (typeof m.custom_fields==='object' ? m.custom_fields : JSON.parse(m.custom_fields)) : {} } catch {}
  const sku = cf.sku || m.sku || null
  const description = cf.description || null
  const specs = [
    {label:'Supplier', value:m.supplier}, {label:'Panel type', value:m.panel_type},
    {label:'Thickness', value:m.thickness?m.thickness+'mm':null}, {label:'Colour', value:m.colour_code},
    {label:'Finish', value:m.finish}, {label:'SKU', value:sku},
    {label:'Price', value:m.price?`$${parseFloat(m.price).toFixed(2)}`:null},
  ].filter(s=>s.value)
  return ReactDOM.createPortal(
    <div style={{position:'fixed',inset:0,zIndex:99999,background:'rgba(0,0,0,0.5)',display:'flex',alignItems:'center',justifyContent:'center',padding:20}}
      onClick={e=>e.target===e.currentTarget&&onClose()}>
      <div style={{background:'#fff',borderRadius:16,width:'100%',maxWidth:540,maxHeight:'85vh',display:'flex',flexDirection:'column',boxShadow:'0 24px 64px rgba(0,0,0,0.25)',overflow:'hidden'}}>
        <div style={{padding:'16px 20px',borderBottom:'1px solid #F3F4F6',display:'flex',gap:12,alignItems:'flex-start',flexShrink:0}}>
          {m.storage_path && <img src={pubUrl(m.storage_path)} alt="" style={{width:56,height:56,borderRadius:10,objectFit:'contain',background:'#F9FAFB',border:'1px solid #E8ECF0',flexShrink:0}}/>}
          <div style={{flex:1,minWidth:0}}>
            <div style={{fontSize:16,fontWeight:700,color:'#2A3042'}}>{m.name}</div>
            {m.supplier&&<div style={{fontSize:12,color:'#6B7280',marginTop:2}}>{m.supplier}</div>}
          </div>
          <button onClick={onClose} style={{background:'none',border:'none',cursor:'pointer',color:'#9CA3AF',fontSize:22,lineHeight:1,flexShrink:0}}>×</button>
        </div>
        <div style={{display:'flex',gap:2,padding:'8px 20px 0',borderBottom:'1px solid #F3F4F6',flexShrink:0}}>
          {[['details','Details'],['info','Product Info'],['suppliers','Suppliers']].map(([key,label])=>(
            <button key={key} onClick={()=>setTab(key)}
              style={{padding:'7px 14px',fontSize:13,fontWeight:600,border:'none',background:'none',cursor:'pointer',
                color:tab===key?'#5B8AF0':'#9CA3AF', borderBottom:tab===key?'2px solid #5B8AF0':'2px solid transparent'}}>{label}</button>
          ))}
        </div>
        <div style={{flex:1,overflowY:'auto',padding:20}}>
          {tab==='details' && (
            <div>
              {specs.length>0?(
                <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12}}>
                  {specs.map(s=>(
                    <div key={s.label} style={{background:'#F9FAFB',borderRadius:10,padding:'10px 14px',border:'1px solid #E8ECF0'}}>
                      <div style={{fontSize:10,fontWeight:700,color:'#9CA3AF',textTransform:'uppercase',letterSpacing:'.05em',marginBottom:3}}>{s.label}</div>
                      <div style={{fontSize:13,fontWeight:600,color:'#2A3042'}}>{s.value}</div>
                    </div>
                  ))}
                </div>
              ):<div style={{textAlign:'center',color:'#9CA3AF',padding:'24px 0',fontSize:13}}>No details recorded</div>}
              {m.notes&&<div style={{marginTop:14,padding:'12px 14px',background:'#FFFBEB',border:'1px solid #FDE68A',borderRadius:10}}>
                <div style={{fontSize:10,fontWeight:700,color:'#92400E',textTransform:'uppercase',letterSpacing:'.05em',marginBottom:4}}>Notes</div>
                <div style={{fontSize:13,color:'#78350F',lineHeight:1.6}}>{m.notes}</div>
              </div>}
            </div>
          )}
          {tab==='info'&&(
            <div style={{display:'flex',flexDirection:'column',gap:16}}>
              {description?<div>
                <div style={{fontSize:11,fontWeight:700,color:'#6B7280',textTransform:'uppercase',letterSpacing:'.05em',marginBottom:6}}>Description</div>
                <div style={{fontSize:13,color:'#374151',lineHeight:1.7,whiteSpace:'pre-wrap'}}>{description}</div>
              </div>:<div style={{textAlign:'center',color:'#9CA3AF',padding:'24px 0',fontSize:13}}>No description added</div>}
              {m.notes&&<div>
                <div style={{fontSize:11,fontWeight:700,color:'#6B7280',textTransform:'uppercase',letterSpacing:'.05em',marginBottom:6}}>Notes</div>
                <div style={{fontSize:13,color:'#374151',lineHeight:1.7,fontStyle:'italic',whiteSpace:'pre-wrap'}}>{m.notes}</div>
              </div>}
            </div>
          )}
          {tab==='suppliers'&&(
            loadingSuppliers?<div style={{textAlign:'center',padding:'24px 0'}}><div className="spinner"/></div>
            :suppliers.length===0?<div style={{textAlign:'center',color:'#9CA3AF',padding:'24px 0',fontSize:13}}>No suppliers linked</div>
            :suppliers.map(s=>{
              const breaks=Array.isArray(cf.price_breaks)?cf.price_breaks:[]
              return(
                <div key={s.id} style={{background:'#F9FAFB',borderRadius:12,border:'1px solid #E8ECF0',padding:14,marginBottom:10}}>
                  <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:8}}>
                    {s.is_preferred&&<span style={{fontSize:10,color:'#1D9E75'}}>★</span>}
                    <div style={{fontSize:13,fontWeight:700,color:'#2A3042'}}>{s.suppliers?.name}</div>
                    {s.is_preferred&&<span style={{fontSize:10,background:'#F0FDF4',color:'#16A34A',border:'1px solid #BBF7D0',borderRadius:5,padding:'1px 6px',fontWeight:700}}>Preferred</span>}
                  </div>
                  <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:8}}>
                    {s.price&&<div style={{fontSize:12}}><span style={{color:'#9CA3AF'}}>Price: </span><strong>${parseFloat(s.price).toFixed(2)}</strong></div>}
                    {s.sku&&<div style={{fontSize:12}}><span style={{color:'#9CA3AF'}}>SKU: </span><strong>{s.sku}</strong></div>}
                    {s.lead_time&&<div style={{fontSize:12}}><span style={{color:'#9CA3AF'}}>Lead: </span><strong>{s.lead_time}</strong></div>}
                  </div>
                  {breaks.length>0&&s.is_preferred&&(
                    <div style={{marginTop:8,paddingTop:8,borderTop:'1px solid #E8ECF0'}}>
                      <div style={{fontSize:10,fontWeight:700,color:'#9CA3AF',textTransform:'uppercase',marginBottom:4}}>Qty breaks</div>
                      {breaks.map((b,i)=><div key={i} style={{fontSize:12,color:'#374151'}}>≥{b.qty} units → ${parseFloat(b.price||0).toFixed(2)}</div>)}
                    </div>
                  )}
                </div>
              )
            })
          )}
        </div>
      </div>
    </div>,
    document.body
  )
}

function CopyBtn({ text, label }) {
  const [copied, setCopied] = React.useState(false)
  if (!text) return null
  function handleCopy(e) {
    e.stopPropagation()
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    })
  }
  return (
    <button onClick={handleCopy} title={`Copy ${label}`}
      style={{ background: copied ? '#F0FDF4' : '#F3F4F6', border: `1px solid ${copied ? '#86EFAC' : '#E8ECF0'}`, borderRadius:5, padding:'1px 6px', fontSize:10, fontWeight:700, color: copied ? '#16A34A' : '#9CA3AF', cursor:'pointer', flexShrink:0, lineHeight:'16px', transition:'all .15s' }}>
      {copied ? '✓ Copied' : `Copy ${label}`}
    </button>
  )
}

// Hover tooltip for material cards
function MatTooltip({ m, anchorRect }) {
  if (!m || !anchorRect) return null
  let cf = {}
  try { cf = m.custom_fields ? (typeof m.custom_fields === 'object' ? m.custom_fields : JSON.parse(m.custom_fields)) : {} } catch {}
  const sku = cf.sku || m.sku || null
  const description = cf.description || null
  const notes = m.notes || null
  const specs = [m.supplier, m.panel_type, m.thickness ? m.thickness+'mm' : null, m.colour_code, m.finish].filter(Boolean).join(' · ')
  const top = anchorRect.bottom + 8
  const left = Math.min(anchorRect.left, window.innerWidth - 280)
  return ReactDOM.createPortal(
    <div style={{ position:'fixed', top, left, width:260, zIndex:999999, background:'#1E2130', color:'#fff', borderRadius:12, padding:14, boxShadow:'0 8px 32px rgba(0,0,0,0.35)', pointerEvents:'none', fontSize:12, lineHeight:1.5 }}>
      <div style={{ fontWeight:700, fontSize:13, marginBottom:4 }}>{m.name}</div>
      {specs && <div style={{ color:'rgba(255,255,255,0.6)', marginBottom:4 }}>{specs}</div>}
      {sku && <div style={{ color:'#5B8AF0', marginBottom:4, fontWeight:600 }}>SKU: {sku}</div>}
      {description && <div style={{ color:'rgba(255,255,255,0.85)', borderTop:'1px solid rgba(255,255,255,0.1)', paddingTop:6, marginTop:6 }}>{description}</div>}
      {notes && <div style={{ color:'rgba(255,255,255,0.55)', fontStyle:'italic', marginTop:4 }}>{notes}</div>}
      {!description && !notes && !sku && <div style={{ color:'rgba(255,255,255,0.35)', fontStyle:'italic' }}>No additional info</div>}
    </div>,
    document.body
  )
}

function getEffectivePrice(basePrice, priceBreaks, qty) {
  const price = parseFloat(basePrice) || 0
  const q = parseFloat(qty) || 0
  if (!priceBreaks?.length || !q) return price
  const sorted = [...priceBreaks].sort((a,b) => parseFloat(b.qty) - parseFloat(a.qty))
  for (const b of sorted) {
    if (q >= parseFloat(b.qty)) return parseFloat(b.price) || price
  }
  return price
}

function getPriceBreaks(material) {
  // enrichMaterialNames hoists price_breaks to top level — check there first
  if (Array.isArray(material.price_breaks) && material.price_breaks.length) {
    return material.price_breaks
  }
  try {
    const cf = material.custom_fields
      ? (typeof material.custom_fields === 'object' ? material.custom_fields : JSON.parse(material.custom_fields))
      : {}
    return Array.isArray(cf.price_breaks) ? cf.price_breaks : []
  } catch { return [] }
}

// ── PO Number Modal ───────────────────────────────────────────────
function POModal({ jobNumber, existingPO, onConfirm, onCancel }) {
  const prefix = 'MWF'
  const suffix = jobNumber ? `/${jobNumber}` : ''
  // Extract just the middle part from an existing PO like MWF12345/1234
  const existingMiddle = existingPO
    ? existingPO.replace(/^MWF/i, '').replace(/\/.*$/, '')
    : ''
  const [middle, setMiddle] = useState(existingMiddle)
  const inputRef = useRef()
  useEffect(() => { setTimeout(() => inputRef.current?.focus(), 50) }, [])
  const isValid = middle.trim().length > 0
  const fullPO = `${prefix}${middle.trim()}${suffix}`
  return (
    <div style={{ position:'fixed', inset:0, zIndex:9999, background:'rgba(0,0,0,0.45)', display:'flex', alignItems:'center', justifyContent:'center', padding:20 }}
      onClick={e => e.target===e.currentTarget && onCancel()}>
      <div style={{ background:'#fff', borderRadius:16, padding:24, width:'100%', maxWidth:380, boxShadow:'0 20px 60px rgba(0,0,0,0.2)' }}>
        <div style={{ fontSize:15, fontWeight:800, color:'#2A3042', marginBottom:4 }}>Purchase Order Number</div>
        <div style={{ fontSize:12, color:'#6B7280', marginBottom:16 }}>Enter the order number — the prefix and job number are added automatically.</div>
        {/* Composed input — prefix · editable middle · suffix */}
        <div style={{ display:'flex', alignItems:'center', border:`1.5px solid ${isValid?'#DDE3EC':'#FCA5A5'}`, borderRadius:10, overflow:'hidden', fontSize:15, fontWeight:600, fontFamily:'monospace', background:'#fff' }}>
          <span style={{ padding:'10px 8px 10px 12px', color:'#9CA3AF', background:'#F9FAFB', borderRight:'1px solid #E8ECF0', whiteSpace:'nowrap', flexShrink:0 }}>{prefix}</span>
          <input ref={inputRef} value={middle} onChange={e => setMiddle(e.target.value)}
            onKeyDown={e => { if (e.key==='Enter' && isValid) onConfirm(fullPO) }}
            placeholder="12345"
            style={{ flex:1, padding:'10px 8px', border:'none', outline:'none', fontSize:15, fontWeight:600, fontFamily:'monospace', minWidth:0 }} />
          {suffix && <span style={{ padding:'10px 12px 10px 8px', color:'#9CA3AF', background:'#F9FAFB', borderLeft:'1px solid #E8ECF0', whiteSpace:'nowrap', flexShrink:0 }}>{suffix}</span>}
        </div>
        <div style={{ fontSize:11, color:'#9CA3AF', marginTop:6 }}>
          Full PO: <span style={{ fontFamily:'monospace', color:'#5B8AF0', fontWeight:600 }}>{fullPO || `${prefix}…${suffix}`}</span>
        </div>
        <div style={{ display:'flex', gap:8, marginTop:16 }}>
          <button onClick={onCancel} style={{ flex:1, padding:'9px', borderRadius:9, border:'1px solid #E8ECF0', background:'#fff', color:'#6B7280', fontSize:13, fontWeight:600, cursor:'pointer' }}>Cancel</button>
          <button onClick={() => onConfirm(fullPO)} disabled={!isValid}
            style={{ flex:2, padding:'9px', borderRadius:9, border:'none', fontSize:13, fontWeight:700, cursor:isValid?'pointer':'default', background:isValid?'#1D9E75':'#E8ECF0', color:isValid?'#fff':'#9CA3AF' }}>
            Mark as Ordered
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Room RFI Tab ──────────────────────────────────────────────────
const RFI_PRIORITIES = ['Low','Normal','High','Urgent']
const RFI_STATUSES   = ['Open','In Review','Resolved','Closed']

const RFI_STATUS_STYLE = {
  'Open':      { bg:'#EEF2FF', color:'#3730A3', border:'#C7D2FE' },
  'In Review': { bg:'#FEF9C3', color:'#854D0E', border:'#FDE68A' },
  'Resolved':  { bg:'#DCFCE7', color:'#166534', border:'#86EFAC' },
  'Closed':    { bg:'#F3F4F6', color:'#6B7280', border:'#E5E7EB' },
}

const RFI_PRIORITY_STYLE = {
  'Low':    { color:'#9CA3AF' },
  'Normal': { color:'#5B8AF0' },
  'High':   { color:'#F97316' },
  'Urgent': { color:'#E24B4A' },
}

function RoomRFITab({ room, jobId, profile }) {
  const toast = useToast()
  const [rfis, setRfis]       = useState([])
  const [loading, setLoading] = useState(true)
  const [form, setForm]       = useState(null)
  const [detail, setDetail]   = useState(null)
  const [saving, setSaving]   = useState(false)

  useEffect(() => {
    if (!jobId) return
    supabase.from('job_rfis').select('*')
      .eq('job_id', jobId).eq('room_id', room.id)
      .order('created_at', { ascending: true })
      .then(({ data, error }) => {
        if (error) console.error('Room RFI load:', error.message)
        setRfis(data || [])
        setLoading(false)
      })
  }, [room.id, jobId])

  function openNew() {
    const next = rfis.length ? Math.max(...rfis.map(r => r.number || 0)) + 1 : 1
    setForm({ title:'', description:'', type:'external', status:'Open', priority:'Normal',
      assigned_to: null, due_date: '', number: next })
  }

  async function saveRFI() {
    if (!form?.title?.trim()) { toast('Title is required', 'error'); return }
    setSaving(true)
    const payload = {
      title: form.title, description: form.description||'',
      type: form.type || 'external', status: form.status || 'Open',
      priority: form.priority || 'Normal',
      assigned_to: form.assigned_to ? String(form.assigned_to).replace('contact_','') : null,
      due_date: form.due_date || null,
      updated_at: new Date().toISOString(),
      room_id: room.id,
      room_name: room.name,
    }
    if (form.number) payload.number = form.number
    if (form.id) {
      const { error } = await supabase.from('job_rfis').update(payload).eq('id', form.id)
      if (error) { toast(`Save failed: ${error.message}`, 'error'); setSaving(false); return }
      setRfis(p => p.map(r => r.id===form.id ? {...r,...payload} : r))
    } else {
      const insertData = { ...payload, job_id: jobId }
      if (profile?.id) insertData.created_by = profile.id
      const { data, error } = await supabase.from('job_rfis').insert(insertData).select().single()
      if (error) { toast(`Save failed: ${error.message}`, 'error'); setSaving(false); return }
      setRfis(p => [...p, data])
    }
    toast('RFI saved ✓'); setForm(null); setSaving(false)
  }

  async function changeStatus(status) {
    if (!detail) return
    await supabase.from('job_rfis').update({ status, updated_at: new Date().toISOString() }).eq('id', detail.id)
    setRfis(p => p.map(r => r.id===detail.id ? {...r,status} : r))
    setDetail(d => ({...d, status}))
  }

  async function respond(response) {
    if (!detail) return
    await supabase.from('job_rfis').update({ response, responded_at: new Date().toISOString() }).eq('id', detail.id)
    setRfis(p => p.map(r => r.id===detail.id ? {...r,response} : r))
    setDetail(d => ({...d,response}))
  }

  async function deleteRFI(id) {
    if (!confirm('Delete this RFI?')) return
    await supabase.from('job_rfis').delete().eq('id', id)
    setRfis(p => p.filter(r => r.id !== id))
    if (detail?.id === id) setDetail(null)
  }

  function daysUntil(d) {
    if (!d) return null
    const now = new Date(); now.setHours(0,0,0,0)
    const dt = new Date(d); dt.setHours(0,0,0,0)
    return Math.round((dt - now) / 86400000)
  }

  return (
    <div>
      {/* Header */}
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:12 }}>
        <div style={{ fontSize:13, fontWeight:700, color:'#2A3042' }}>
          RFIs for <span style={{ color:'#5B8AF0' }}>{room.name}</span>
        </div>
        <button onClick={openNew}
          style={{ padding:'6px 14px', borderRadius:8, border:'none', background:'#5B8AF0', color:'#fff', fontSize:12, fontWeight:700, cursor:'pointer' }}>
          + New RFI
        </button>
      </div>

      {/* List */}
      {loading ? (
        <div style={{ textAlign:'center', padding:'20px 0', color:'#9CA3AF', fontSize:13 }}>Loading…</div>
      ) : rfis.length === 0 ? (
        <div style={{ textAlign:'center', padding:'20px 0', color:'#9CA3AF', fontSize:13 }}>
          No RFIs for this room yet
        </div>
      ) : rfis.map(rfi => {
        const ss = RFI_STATUS_STYLE[rfi.status] || RFI_STATUS_STYLE.Open
        const ps = RFI_PRIORITY_STYLE[rfi.priority] || RFI_PRIORITY_STYLE.Normal
        const days = daysUntil(rfi.due_date)
        const isOverdue = days !== null && days < 0 && rfi.status !== 'Resolved' && rfi.status !== 'Closed'
        const hasReply = !!rfi.external_reply
        return (
          <div key={rfi.id}
            onClick={() => setDetail(rfi)}
            style={{ background: isOverdue?'#FFF5F5': hasReply?'#F0FDF4':'#fff', borderRadius:10,
              border:`1px solid ${isOverdue?'#FCA5A5':hasReply?'#86EFAC':'#E8ECF0'}`,
              padding:'10px 14px', marginBottom:8, cursor:'pointer' }}
            onMouseEnter={e=>e.currentTarget.style.background=isOverdue?'#FEE2E2':hasReply?'#DCFCE7':'#F8FAFF'}
            onMouseLeave={e=>e.currentTarget.style.background=isOverdue?'#FFF5F5':hasReply?'#F0FDF4':'#fff'}>
            <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', gap:8 }}>
              <div style={{ flex:1, minWidth:0 }}>
                <div style={{ display:'flex', alignItems:'center', gap:6, marginBottom:3, flexWrap:'wrap' }}>
                  <span style={{ fontSize:10, fontWeight:700, color:'#9CA3AF', fontFamily:'monospace' }}>
                    RFI-{String(rfi.number||0).padStart(3,'0')}
                  </span>
                  <span style={{ fontSize:11, fontWeight:700, padding:'1px 8px', borderRadius:8,
                    background:ss.bg, color:ss.color, border:`1px solid ${ss.border}` }}>
                    {rfi.status}
                  </span>
                  {hasReply && <span style={{ fontSize:10, fontWeight:700, padding:'1px 7px', borderRadius:8, background:'#DCFCE7', color:'#166534', border:'1px solid #86EFAC' }}>✓ reply</span>}
                  {isOverdue && <span style={{ fontSize:10, fontWeight:700, padding:'1px 7px', borderRadius:8, background:'#FEF2F2', color:'#E24B4A', border:'1px solid #FCA5A5' }}>
                    {Math.abs(days)}d overdue
                  </span>}
                </div>
                <div style={{ fontSize:13, fontWeight:600, color:'#2A3042' }}>{rfi.title}</div>
                {rfi.description && <div style={{ fontSize:11, color:'#9CA3AF', marginTop:2, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{rfi.description}</div>}
                {rfi.external_reply && (
                  <div style={{ marginTop:6, padding:'6px 10px', background:'#F0FDF4', borderRadius:8, border:'1px solid #86EFAC' }}>
                    <div style={{ fontSize:10, fontWeight:700, color:'#065F46', marginBottom:2 }}>✓ External reply{rfi.external_reply_name ? ` from ${rfi.external_reply_name}` : ''}</div>
                    <div style={{ fontSize:12, color:'#166534', lineHeight:1.5, whiteSpace:'pre-wrap' }}>{rfi.external_reply}</div>
                  </div>
                )}
                {rfi.response && (
                  <div style={{ marginTop:6, padding:'6px 10px', background:'#F8FAFF', borderRadius:8, border:'1px solid #C4D4F8' }}>
                    <div style={{ fontSize:10, fontWeight:700, color:'#3730A3', marginBottom:2 }}>Internal response</div>
                    <div style={{ fontSize:12, color:'#374151', lineHeight:1.5, whiteSpace:'pre-wrap' }}>{rfi.response}</div>
                  </div>
                )}
              </div>
              <div style={{ display:'flex', flexDirection:'column', alignItems:'flex-end', gap:4, flexShrink:0 }}>
                <span style={{ fontSize:10, fontWeight:700, color:ps.color }}>{rfi.priority}</span>
                {rfi.due_date && <span style={{ fontSize:10, color: isOverdue?'#E24B4A':'#9CA3AF' }}>
                  {new Date(rfi.due_date).toLocaleDateString('en-NZ',{day:'numeric',month:'short'})}
                </span>}
              </div>
            </div>
          </div>
        )
      })}

      {/* New/Edit form modal */}
      {form && (
        <div style={{ position:'fixed', inset:0, zIndex:600, background:'rgba(0,0,0,0.45)', display:'flex', alignItems:'center', justifyContent:'center', padding:16 }}
          onClick={e=>e.target===e.currentTarget&&setForm(null)}>
          <div style={{ background:'#fff', borderRadius:14, width:'100%', maxWidth:480, maxHeight:'88vh', display:'flex', flexDirection:'column', boxShadow:'0 20px 60px rgba(0,0,0,0.2)' }}>
            <div style={{ padding:'14px 18px', borderBottom:'1px solid #F3F4F6', display:'flex', justifyContent:'space-between', alignItems:'center', flexShrink:0 }}>
              <div>
                <div style={{ fontSize:16, fontWeight:800, color:'#2A3042' }}>New RFI — #{String(form.number||0).padStart(3,'0')}</div>
                <div style={{ fontSize:11, color:'#9CA3AF', marginTop:1 }}>Room: <strong>{room.name}</strong></div>
              </div>
              <button onClick={()=>setForm(null)} style={{ background:'none', border:'none', cursor:'pointer', color:'#9CA3AF', fontSize:22 }}>×</button>
            </div>
            <div style={{ flex:1, overflowY:'auto', padding:18 }}>
              <div style={{ marginBottom:12 }}>
                <label style={{ fontSize:11, fontWeight:700, color:'#6B7280', display:'block', marginBottom:4 }}>Title *</label>
                <input value={form.title} onChange={e=>setForm(f=>({...f,title:e.target.value}))} placeholder="Brief description…"
                  style={{ width:'100%', padding:'9px 12px', border:'1px solid #DDE3EC', borderRadius:9, fontSize:13, outline:'none', boxSizing:'border-box' }} />
              </div>
              <div style={{ marginBottom:12 }}>
                <label style={{ fontSize:11, fontWeight:700, color:'#6B7280', display:'block', marginBottom:4 }}>Description</label>
                <textarea value={form.description} onChange={e=>setForm(f=>({...f,description:e.target.value}))} rows={3} placeholder="Details…"
                  style={{ width:'100%', padding:'9px 12px', border:'1px solid #DDE3EC', borderRadius:9, fontSize:13, outline:'none', resize:'vertical', fontFamily:'inherit', boxSizing:'border-box' }} />
              </div>
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10, marginBottom:12 }}>
                <div>
                  <label style={{ fontSize:11, fontWeight:700, color:'#6B7280', display:'block', marginBottom:4 }}>Priority</label>
                  <select value={form.priority} onChange={e=>setForm(f=>({...f,priority:e.target.value}))}
                    style={{ width:'100%', padding:'8px 10px', border:'1px solid #DDE3EC', borderRadius:8, fontSize:13, outline:'none', background:'#fff', boxSizing:'border-box' }}>
                    {RFI_PRIORITIES.map(p=><option key={p}>{p}</option>)}
                  </select>
                </div>
                <div>
                  <label style={{ fontSize:11, fontWeight:700, color:'#6B7280', display:'block', marginBottom:4 }}>Due date</label>
                  <input type="date" value={form.due_date||''} onChange={e=>setForm(f=>({...f,due_date:e.target.value}))}
                    style={{ width:'100%', padding:'8px 10px', border:'1px solid #DDE3EC', borderRadius:8, fontSize:13, outline:'none', boxSizing:'border-box', background:'#fff' }} />
                </div>
              </div>
            </div>
            <div style={{ padding:'10px 18px', borderTop:'1px solid #F3F4F6', display:'flex', gap:8, justifyContent:'flex-end', flexShrink:0 }}>
              <button onClick={()=>setForm(null)} style={{ padding:'8px 14px', borderRadius:9, border:'1px solid #E8ECF0', background:'#fff', color:'#6B7280', fontSize:13, cursor:'pointer' }}>Cancel</button>
              <button onClick={saveRFI} disabled={saving}
                style={{ padding:'8px 18px', borderRadius:9, border:'none', background:'#5B8AF0', color:'#fff', fontSize:13, fontWeight:700, cursor:'pointer' }}>
                {saving ? 'Saving…' : 'Save RFI'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Detail modal */}
      {detail && (
        <div style={{ position:'fixed', inset:0, zIndex:600, background:'rgba(0,0,0,0.45)', display:'flex', alignItems:'center', justifyContent:'center', padding:16 }}
          onClick={e=>e.target===e.currentTarget&&setDetail(null)}>
          <div style={{ background:'#fff', borderRadius:14, width:'100%', maxWidth:500, maxHeight:'88vh', display:'flex', flexDirection:'column', boxShadow:'0 20px 60px rgba(0,0,0,0.2)' }}>
            <div style={{ padding:'14px 18px', borderBottom:'1px solid #F3F4F6', display:'flex', justifyContent:'space-between', alignItems:'flex-start', flexShrink:0 }}>
              <div>
                <div style={{ fontSize:10, fontWeight:700, color:'#9CA3AF', fontFamily:'monospace', marginBottom:2 }}>
                  RFI-{String(detail.number||0).padStart(3,'0')} · {room.name}
                </div>
                <div style={{ fontSize:15, fontWeight:800, color:'#2A3042' }}>{detail.title}</div>
              </div>
              <button onClick={()=>setDetail(null)} style={{ background:'none', border:'none', cursor:'pointer', color:'#9CA3AF', fontSize:22, lineHeight:1 }}>×</button>
            </div>
            <div style={{ flex:1, overflowY:'auto', padding:18 }}>
              {/* Status buttons */}
              <div style={{ display:'flex', gap:6, flexWrap:'wrap', marginBottom:14 }}>
                {RFI_STATUSES.map(s => {
                  const st = RFI_STATUS_STYLE[s]
                  return (
                    <button key={s} onClick={()=>changeStatus(s)}
                      style={{ padding:'4px 12px', borderRadius:20, fontSize:11, fontWeight:s===detail.status?700:500, cursor:'pointer',
                        border:`1px solid ${s===detail.status?st.border:'#E8ECF0'}`,
                        background:s===detail.status?st.bg:'#fff', color:s===detail.status?st.color:'#9CA3AF' }}>
                      {s}
                    </button>
                  )
                })}
              </div>
              {detail.description && (
                <div style={{ marginBottom:12 }}>
                  <div style={{ fontSize:11, fontWeight:700, color:'#9CA3AF', textTransform:'uppercase', letterSpacing:'.05em', marginBottom:4 }}>Description</div>
                  <div style={{ fontSize:13, color:'#374151', lineHeight:1.6 }}>{detail.description}</div>
                </div>
              )}
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8, marginBottom:14, fontSize:12 }}>
                {detail.due_date && <div><span style={{ color:'#9CA3AF' }}>Due: </span><strong>{new Date(detail.due_date).toLocaleDateString('en-NZ',{day:'numeric',month:'long',year:'numeric'})}</strong></div>}
                <div><span style={{ color:'#9CA3AF' }}>Priority: </span><strong>{detail.priority}</strong></div>
              </div>
              {/* External reply */}
              {detail.external_reply && (
                <div style={{ background:'#F0FDF4', border:'1px solid #86EFAC', borderRadius:10, padding:12, marginBottom:12 }}>
                  <div style={{ fontSize:11, fontWeight:700, color:'#065F46', marginBottom:4 }}>
                    ✓ External reply {detail.external_reply_name ? `from ${detail.external_reply_name}` : ''}
                  </div>
                  <div style={{ fontSize:13, color:'#166534', lineHeight:1.5 }}>{detail.external_reply}</div>
                </div>
              )}
              {/* Internal response */}
              <div>
                <div style={{ fontSize:11, fontWeight:700, color:'#9CA3AF', textTransform:'uppercase', letterSpacing:'.05em', marginBottom:6 }}>Internal response</div>
                <RFIResponseInput detail={detail} onSave={respond} />
              </div>
            </div>
            <div style={{ padding:'10px 18px', borderTop:'1px solid #F3F4F6', display:'flex', gap:8, justifyContent:'space-between', flexShrink:0 }}>
              <button onClick={()=>deleteRFI(detail.id)}
                style={{ padding:'7px 14px', borderRadius:8, border:'1px solid #FCA5A5', background:'#FEF2F2', color:'#E24B4A', fontSize:12, fontWeight:600, cursor:'pointer' }}>
                Delete
              </button>
              <div style={{ display:'flex', gap:8 }}>
                <button onClick={()=>{setForm({...detail,id:detail.id});setDetail(null)}}
                  style={{ padding:'7px 14px', borderRadius:8, border:'1px solid #E8ECF0', background:'#fff', color:'#6B7280', fontSize:12, fontWeight:600, cursor:'pointer' }}>
                  Edit
                </button>
                <button onClick={()=>setDetail(null)}
                  style={{ padding:'7px 14px', borderRadius:8, border:'none', background:'#5B8AF0', color:'#fff', fontSize:12, fontWeight:700, cursor:'pointer' }}>
                  Done
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Room Variations Tab ──────────────────────────────────────────────
// Variations are changes to the original order scope — each one records
// what changed, its cost impact, and whether it's been approved.
const VO_STATUSES = ['Pending', 'Approved', 'Rejected']
const VO_STATUS_STYLE = {
  'Pending':  { bg:'#FFF7ED', color:'#C2410C', border:'#FDBA74' },
  'Approved': { bg:'#F0FDF4', color:'#166534', border:'#86EFAC' },
  'Rejected': { bg:'#FEF2F2', color:'#DC2626', border:'#FCA5A5' },
}

function RoomVariationsTab({ room, jobId, onVariationsChange }) {
  const [variations, setVariations] = React.useState([])
  const [loading, setLoading] = React.useState(true)
  const [form, setForm] = React.useState(null)
  const [saving, setSaving] = React.useState(false)

  React.useEffect(() => {
    if (!room?.id) return
    supabase.from('room_variations').select('*').eq('room_id', room.id).order('created_at', { ascending: false })
      .then(({ data }) => { setVariations(data || []); setLoading(false) })
  }, [room?.id])

  function openNew() {
    setForm({ title: '', description: '', cost_impact: '', status: 'Pending' })
  }

  async function save() {
    if (!form.title.trim()) return
    setSaving(true)
    const payload = {
      room_id: room.id,
      job_id: jobId,
      title: form.title.trim(),
      description: form.description || '',
      cost_impact: form.cost_impact ? parseFloat(form.cost_impact) : null,
      status: form.status || 'Pending',
      updated_at: new Date().toISOString(),
    }
    if (form.id) {
      const { data, error } = await supabase.from('room_variations').update(payload).eq('id', form.id).select().single()
      if (!error) {
        const updated = variations.map(v => v.id === form.id ? data : v)
        setVariations(updated)
        onVariationsChange?.(updated)
      }
    } else {
      const { data, error } = await supabase.from('room_variations').insert(payload).select().single()
      if (!error) {
        const updated = [data, ...variations]
        setVariations(updated)
        onVariationsChange?.(updated)
      }
    }
    setSaving(false)
    setForm(null)
  }

  async function del(id) {
    if (!confirm('Delete this variation?')) return
    await supabase.from('room_variations').delete().eq('id', id)
    const updated = variations.filter(v => v.id !== id)
    setVariations(updated)
    onVariationsChange?.(updated)
  }

  async function setStatus(id, status) {
    await supabase.from('room_variations').update({ status, updated_at: new Date().toISOString() }).eq('id', id)
    const updated = variations.map(v => v.id === id ? { ...v, status } : v)
    setVariations(updated)
    onVariationsChange?.(updated)
  }

  const totalCost = variations.filter(v => v.status === 'Approved' && v.cost_impact).reduce((s, v) => s + Number(v.cost_impact), 0)

  return (
    <div style={{ padding: '0 0 16px' }}>
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:12 }}>
        <div>
          <div style={{ fontSize:13, fontWeight:700, color:'#2A3042' }}>
            Variations
            {variations.length > 0 && <span style={{ fontSize:11, color:'#9CA3AF', fontWeight:500 }}> ({variations.length})</span>}
          </div>
          {totalCost !== 0 && (
            <div style={{ fontSize:11, color:'#1D9E75', fontWeight:600, marginTop:2 }}>
              Approved cost impact: ${totalCost.toLocaleString('en-NZ', { minimumFractionDigits:2, maximumFractionDigits:2 })}
            </div>
          )}
        </div>
        <button onClick={openNew}
          style={{ fontSize:12, fontWeight:700, padding:'6px 14px', borderRadius:8, border:'none', background:'#E24B4A', color:'#fff', cursor:'pointer' }}>
          + Add VO
        </button>
      </div>

      {loading ? (
        <div style={{ textAlign:'center', padding:'24px 0' }}><div className="spinner" /></div>
      ) : variations.length === 0 ? (
        <div style={{ textAlign:'center', padding:'32px 0', color:'#9CA3AF' }}>
          <div style={{ fontSize:24, marginBottom:8 }}>📋</div>
          <div style={{ fontSize:13, fontWeight:600, color:'#374151' }}>No variations yet</div>
          <div style={{ fontSize:12, marginTop:4 }}>Record any changes to the original scope</div>
        </div>
      ) : (
        <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
          {variations.map(vo => {
            const ss = VO_STATUS_STYLE[vo.status] || VO_STATUS_STYLE.Pending
            return (
              <div key={vo.id} style={{ background:'#fff', borderRadius:10, border:`1px solid #E8ECF0`, padding:'12px 14px' }}>
                <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', gap:8 }}>
                  <div style={{ flex:1, minWidth:0 }}>
                    <div style={{ display:'flex', alignItems:'center', gap:6, marginBottom:4, flexWrap:'wrap' }}>
                      <span style={{ fontSize:10, fontWeight:800, padding:'2px 8px', borderRadius:6, background:'#E24B4A', color:'#fff', letterSpacing:'.03em' }}>VO</span>
                      <span style={{ fontSize:11, fontWeight:700, padding:'2px 8px', borderRadius:20, background:ss.bg, color:ss.color, border:`1px solid ${ss.border}` }}>{vo.status}</span>
                      {vo.cost_impact != null && (
                        <span style={{ fontSize:11, fontWeight:600, color: vo.cost_impact >= 0 ? '#1D9E75' : '#E24B4A' }}>
                          {vo.cost_impact >= 0 ? '+' : ''}${Number(vo.cost_impact).toLocaleString('en-NZ', { minimumFractionDigits:2 })}
                        </span>
                      )}
                    </div>
                    <div style={{ fontSize:13, fontWeight:700, color:'#2A3042' }}>{vo.title}</div>
                    {vo.description && <div style={{ fontSize:12, color:'#6B7280', marginTop:3, lineHeight:1.5 }}>{vo.description}</div>}
                    {/* Quick status change */}
                    <div style={{ display:'flex', gap:4, marginTop:8 }}>
                      {VO_STATUSES.map(s => (
                        <button key={s} onClick={() => setStatus(vo.id, s)}
                          style={{ fontSize:10, fontWeight:600, padding:'2px 8px', borderRadius:20, cursor:'pointer',
                            border:`1px solid ${s===vo.status ? VO_STATUS_STYLE[s].border : '#E8ECF0'}`,
                            background: s===vo.status ? VO_STATUS_STYLE[s].bg : '#fff',
                            color: s===vo.status ? VO_STATUS_STYLE[s].color : '#9CA3AF' }}>
                          {s}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div style={{ display:'flex', gap:5, flexShrink:0 }}>
                    <button onClick={() => setForm({ ...vo, cost_impact: vo.cost_impact ?? '' })}
                      style={{ padding:'3px 10px', borderRadius:7, border:'1px solid #E8ECF0', background:'#fff', color:'#6B7280', fontSize:12, cursor:'pointer' }}>Edit</button>
                    <button onClick={() => del(vo.id)}
                      style={{ padding:'3px 8px', borderRadius:7, border:'1px solid #FCA5A5', background:'#FEF2F2', color:'#DC2626', fontSize:12, cursor:'pointer' }}>✕</button>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Add/Edit modal */}
      {form && (
        <div style={{ position:'fixed', inset:0, zIndex:700, background:'rgba(0,0,0,0.45)', display:'flex', alignItems:'center', justifyContent:'center', padding:16 }}
          onClick={e => e.target===e.currentTarget && setForm(null)}>
          <div style={{ background:'#fff', borderRadius:14, width:'100%', maxWidth:480, maxHeight:'90vh', display:'flex', flexDirection:'column', boxShadow:'0 20px 60px rgba(0,0,0,0.2)' }}>
            <div style={{ padding:'14px 18px', borderBottom:'1px solid #F3F4F6', display:'flex', justifyContent:'space-between', alignItems:'center', flexShrink:0 }}>
              <div style={{ fontSize:15, fontWeight:700, color:'#2A3042' }}>{form.id ? 'Edit Variation' : 'New Variation'}</div>
              <button onClick={() => setForm(null)} style={{ background:'none', border:'none', cursor:'pointer', color:'#9CA3AF', fontSize:22 }}>×</button>
            </div>
            <div style={{ flex:1, overflowY:'auto', padding:18, display:'flex', flexDirection:'column', gap:12 }}>
              <div>
                <label style={{ fontSize:11, fontWeight:700, color:'#6B7280', display:'block', marginBottom:4 }}>Title *</label>
                <input autoFocus value={form.title} onChange={e => setForm(f => ({...f, title:e.target.value}))}
                  placeholder="Brief description of the change…"
                  style={{ width:'100%', padding:'9px 12px', border:'1px solid #DDE3EC', borderRadius:9, fontSize:13, outline:'none', boxSizing:'border-box' }} />
              </div>
              <div>
                <label style={{ fontSize:11, fontWeight:700, color:'#6B7280', display:'block', marginBottom:4 }}>Description</label>
                <textarea value={form.description} onChange={e => setForm(f => ({...f, description:e.target.value}))} rows={3}
                  placeholder="Detail what changed from the original scope…"
                  style={{ width:'100%', padding:'9px 12px', border:'1px solid #DDE3EC', borderRadius:9, fontSize:13, outline:'none', resize:'vertical', fontFamily:'inherit', boxSizing:'border-box' }} />
              </div>
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 }}>
                <div>
                  <label style={{ fontSize:11, fontWeight:700, color:'#6B7280', display:'block', marginBottom:4 }}>Cost impact ($)</label>
                  <input type="number" value={form.cost_impact} onChange={e => setForm(f => ({...f, cost_impact:e.target.value}))}
                    placeholder="0.00 (use - for reductions)"
                    style={{ width:'100%', padding:'9px 12px', border:'1px solid #DDE3EC', borderRadius:9, fontSize:13, outline:'none', boxSizing:'border-box' }} />
                </div>
                <div>
                  <label style={{ fontSize:11, fontWeight:700, color:'#6B7280', display:'block', marginBottom:4 }}>Status</label>
                  <select value={form.status} onChange={e => setForm(f => ({...f, status:e.target.value}))}
                    style={{ width:'100%', padding:'9px 12px', border:'1px solid #DDE3EC', borderRadius:9, fontSize:13, outline:'none', background:'#fff', boxSizing:'border-box', cursor:'pointer' }}>
                    {VO_STATUSES.map(s => <option key={s}>{s}</option>)}
                  </select>
                </div>
              </div>
            </div>
            <div style={{ padding:'10px 18px', borderTop:'1px solid #F3F4F6', display:'flex', gap:8, justifyContent:'flex-end', flexShrink:0 }}>
              <button onClick={() => setForm(null)}
                style={{ padding:'8px 16px', borderRadius:9, border:'1px solid #E8ECF0', background:'#fff', color:'#6B7280', fontSize:13, cursor:'pointer' }}>Cancel</button>
              <button onClick={save} disabled={saving || !form.title.trim()}
                style={{ padding:'8px 20px', borderRadius:9, border:'none', background: form.title.trim() ? '#E24B4A' : '#E8ECF0', color: form.title.trim() ? '#fff' : '#9CA3AF', fontSize:13, fontWeight:700, cursor: form.title.trim() ? 'pointer' : 'default' }}>
                {saving ? 'Saving…' : 'Save variation'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function RFIResponseInput({ detail, onSave }) {
  const [val, setVal] = useState(detail.response || '')
  const [saving, setSaving] = useState(false)
  useEffect(() => setVal(detail.response || ''), [detail.id])
  async function save() {
    if (!val.trim()) return
    setSaving(true)
    await onSave(val.trim())
    setSaving(false)
  }
  return (
    <div>
      <textarea value={val} onChange={e=>setVal(e.target.value)} rows={3}
        placeholder="Add internal notes or response…"
        style={{ width:'100%', padding:'10px 12px', border:'1px solid #DDE3EC', borderRadius:9, fontSize:13, outline:'none', resize:'vertical', fontFamily:'inherit', boxSizing:'border-box' }} />
      <button onClick={save} disabled={saving||!val.trim()}
        style={{ marginTop:6, padding:'7px 18px', borderRadius:8, border:'none', fontSize:12, fontWeight:700, cursor:val.trim()?'pointer':'default',
          background:val.trim()?'#1D9E75':'#E8ECF0', color:val.trim()?'#fff':'#9CA3AF' }}>
        {saving?'Saving…':'Save response'}
      </button>
    </div>
  )
}

// ── Room Materials Tab ────────────────────────────────────────────
// Walk up parent_id chain to find the root (top-level) category.
function getRootCat(categoryId, allCats) {
  if (!categoryId || !allCats?.length) return null
  let cat = allCats.find(c => c.id === categoryId)
  if (!cat) return null
  while (cat.parent_id) {
    const parent = allCats.find(c => c.id === cat.parent_id)
    if (!parent) break
    cat = parent
  }
  return cat
}

// Get the category label shown as "Root > Sub" (second level below root, or just root if flat).
// e.g. Hardware > Fit Hardware > Anzio → "Hardware > Fit Hardware"
// e.g. Boards > MDF → "Boards > MDF"
// e.g. Hardware (single level) → "Hardware"
function getCategoryLabel(categoryId, allCats) {
  if (!categoryId || !allCats?.length) return 'Other'
  const cat = allCats.find(c => c.id === categoryId)
  if (!cat) return 'Other'

  // Build ancestor chain from leaf → root
  const chain = []
  let cur = cat
  while (cur) {
    chain.unshift(cur)
    cur = cur.parent_id ? allCats.find(c => c.id === cur.parent_id) : null
  }
  // chain[0] = root, chain[1] = second level, chain[chain.length-1] = leaf
  const root = chain[0]?.name || 'Other'
  const sub  = chain[1]?.name
  return sub ? `${root} › ${sub}` : root
}

// Group an array of jobMat rows by two-level category label.
// Returns groups sorted: root first alphabetically, then sub alphabetically within root, 'Other' last.
function groupByCategory(jobMatRows, allCats) {
  const groups = {}
  for (const jm of jobMatRows) {
    const m = jm.materials || jm
    const label = getCategoryLabel(m.category_id, allCats)
    if (!groups[label]) groups[label] = []
    groups[label].push(jm)
  }

  // Sort: Other last, otherwise by root then sub
  return Object.entries(groups)
    .sort(([a], [b]) => {
      if (a === 'Other') return 1
      if (b === 'Other') return -1
      return a.localeCompare(b)
    })
    .map(([groupName, items]) => ({ groupName, items }))
}

// Keep old name as alias for any callers that still use it
function groupByRootCategory(rows, allCats) { return groupByCategory(rows, allCats) }

function printRoomMaterials(groups, roomName) {
  const title = roomName ? `${roomName} — Materials` : 'Room Materials'
  const rows = groups.map(({ groupName, items }) => `
    <tr class="group-header"><td colspan="6">${groupName} (${items.length})</td></tr>
    ${items.map(rm => {
      const m = rm.materials || rm; if (!m) return ''
      let sku = null
      try { const cf = m.custom_fields ? (typeof m.custom_fields==='object'?m.custom_fields:JSON.parse(m.custom_fields)) : {}; sku = cf.sku||null } catch {}
      const sub = m.is_kit ? 'Kit' : [m.supplier, m.panel_type, m.thickness?m.thickness+'mm':null, m.finish].filter(Boolean).join(' · ')
      const imgUrl = m.storage_path ? pubUrl(m.storage_path) : null
      return `<tr>
        <td class="img-cell">${imgUrl ? `<img src="${imgUrl}" alt="" style="width:48px;height:48px;object-fit:contain;border-radius:6px;border:1px solid #E8ECF0;background:#fff;display:block;" crossorigin="anonymous"/>` : '<div style="width:48px;height:48px;border-radius:6px;background:#F3F4F6;border:1px solid #E8ECF0;"></div>'}</td>
        <td class="name">${m.is_kit?'🧰 ':''}${m.name||''}</td>
        <td>${sub}</td>
        <td>${sku ? `SKU: ${sku}` : ''}</td>
        <td>${m.colour_code||''}</td>
        <td class="price">${m.price ? `$${parseFloat(m.price).toFixed(2)}` : ''}</td>
      </tr>`
    }).join('')}
  `).join('')
  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${title}</title>
  <style>
    * { margin:0; padding:0; box-sizing:border-box; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; font-size:12px; color:#1a1a2e; padding:24px 32px; }
    h1 { font-size:20px; font-weight:700; margin-bottom:4px; color:#2A3042; }
    .meta { font-size:12px; color:#6B7280; margin-bottom:20px; }
    table { width:100%; border-collapse:collapse; }
    th { font-size:10px; font-weight:700; text-transform:uppercase; letter-spacing:.05em; color:#6B7280; border-bottom:2px solid #E8ECF0; padding:6px 8px; text-align:left; }
    td { padding:8px 8px; border-bottom:1px solid #F3F4F6; vertical-align:middle; }
    td.img-cell { width:64px; padding:4px 8px; }
    td.name { font-weight:600; color:#2A3042; width:28%; }
    td.price { text-align:right; font-weight:600; color:#1D9E75; }
    tr.group-header td { background:#F8FAFF; font-size:10px; font-weight:800; text-transform:uppercase; letter-spacing:.06em; color:#5B8AF0; padding:8px 8px 4px; border-bottom:1px solid #E0E7FF; }
    @media print { body { padding:12px 16px; } }
  </style></head>
  <body>
    <h1>${title}</h1>
    <div class="meta">Printed ${new Date().toLocaleDateString('en-NZ',{day:'numeric',month:'long',year:'numeric'})} · ${groups.reduce((s,g)=>s+g.items.length,0)} materials</div>
    <table>
      <thead><tr><th></th><th>Name</th><th>Details</th><th>SKU</th><th>Colour</th><th style="text-align:right">Price</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
  </body></html>`
  const w = window.open('', '_blank', 'width=900,height=700')
  w.document.write(html)
  w.document.close()
  w.focus()
  setTimeout(() => w.print(), 400)
}

function RoomMaterialsTab({ roomMats, filteredMats, jobMats, onAdd, onRemove, allCats, onViewMaterial, jobId, roomId }) {
  const [showPicker, setShowPicker] = React.useState(false)
  const [search, setSearch]         = React.useState('')
  const [pickerSelected, setPickerSelected] = React.useState(new Set())
  const [pickerCat, setPickerCat]   = React.useState('All')
  const [adding, setAdding]         = React.useState(false)
  const [hoveredMat, setHoveredMat] = React.useState(null)
  const [tooltipRect, setTooltipRect] = React.useState(null)
  const [orderMap, setOrderMap] = React.useState({})

  React.useEffect(() => {
    if (!jobId || !roomId) return
    supabase.from('order_items')
      .select('material_id, qty, unit, status')
      .eq('job_id', jobId).eq('room_id', roomId)
      .then(({ data }) => {
        const map = {}
        ;(data||[]).forEach(o => {
          if (!o.material_id) return
          if (!map[o.material_id]) map[o.material_id] = { qty: 0, allOrdered: true }
          map[o.material_id].qty += parseFloat(o.qty || 0)
          if (o.status !== 'Ordered') map[o.material_id].allOrdered = false
        })
        setOrderMap(map)
      })
  }, [jobId, roomId])

  // IDs already assigned to this room
  const roomMatIds = new Set(roomMats.map(rm => rm.material_id || rm.materials?.id).filter(Boolean))

  function openPicker() {
    setSearch(''); setPickerCat('All'); setPickerSelected(new Set()); setShowPicker(true)
  }

  async function confirmAdd() {
    setAdding(true)
    const ids = [...pickerSelected]
    for (const jmId of ids) {
      const jm = jobMats.find(j => j.id === jmId)
      if (jm) await onAdd(jm)
    }
    setAdding(false)
    setPickerSelected(new Set())
    setShowPicker(false)
    setSearch('')
    setHoveredMat(null)
    setTooltipRect(null)
  }

  // Build root cats from jobMats — precompute label for each jm once
  const jmLabels = new Map(jobMats.map(jm => [jm.id, getCategoryLabel(jm.materials?.category_id, allCats)]))

  const rootCats = ['All', ...Array.from(new Set(
    [...jmLabels.values()].map(label => label.split(' › ')[0])
  )).filter(Boolean).sort()]

  // Filter jobMats by category + search
  const catFiltered = pickerCat === 'All'
    ? jobMats
    : jobMats.filter(jm => (jmLabels.get(jm.id) || '').startsWith(pickerCat))
  const q = search.trim().toLowerCase()
  const words = q ? q.split(/\s+/) : []
  const searchFiltered = words.length
    ? catFiltered.filter(jm => {
        const m = jm.materials; if (!m) return false
        const hay = [m.name, m.supplier, m.panel_type, m.colour_code, m.finish,
          m.sku, (() => { try { const cf = m.custom_fields ? (typeof m.custom_fields === 'object' ? m.custom_fields : JSON.parse(m.custom_fields)) : {}; return cf.sku || null } catch { return null } })()
        ].filter(Boolean).map(v=>String(v).toLowerCase()).join(' ')
        return words.every(w => hay.includes(w))
      })
    : catFiltered

  const groups = groupByCategory(searchFiltered, allCats)

  return (
    <div>
      {/* Header */}
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:4, gap:8, flexWrap:'wrap' }}>
        <div style={{ fontSize:13, fontWeight:700, color:'#2A3042' }}>
          {roomMats.length > 0 ? `${roomMats.length} material${roomMats.length!==1?'s':''} in this room` : 'No materials assigned yet'}
        </div>
        <div style={{ display:'flex', gap:6 }}>
          {roomMats.length > 0 && (
            <button onClick={() => {
              const groups = groupByCategory(roomMats, allCats)
              printRoomMaterials(groups)
            }}
              style={{ padding:'5px 10px', borderRadius:8, border:'1px solid #E8ECF0', background:'#fff', color:'#6B7280', fontSize:11, fontWeight:600, cursor:'pointer', display:'flex', alignItems:'center', gap:4 }}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 01-2-2v-5a2 2 0 012-2h16a2 2 0 012 2v5a2 2 0 01-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg>
              Print
            </button>
          )}
          <button onClick={openPicker} disabled={jobMats.length === 0}
            style={{ padding:'6px 14px', borderRadius:8, border:'none', background: jobMats.length===0?'#E8ECF0':'#5B8AF0', color: jobMats.length===0?'#9CA3AF':'#fff', fontSize:12, fontWeight:700, cursor: jobMats.length===0?'default':'pointer', display:'flex', alignItems:'center', gap:5 }}>
            <span style={{ fontSize:14 }}>+</span> Add material
          </button>
        </div>
      </div>
      <div style={{ fontSize:10, color:'#9CA3AF', marginBottom:8 }}>
        {jobMats.length} on job · {filteredMats.length} available to add · {jobMats.filter(jm=>jm.materials?.is_kit).length} kits on job
      </div>

      {/* Full modal picker */}
      {showPicker && ReactDOM.createPortal(
        <div style={{ position:'fixed', inset:0, zIndex:99999, background:'rgba(0,0,0,0.45)', display:'flex', alignItems:'center', justifyContent:'center', padding:16 }}
          onClick={e => { if(e.target===e.currentTarget){ setShowPicker(false); setPickerSelected(new Set()); setHoveredMat(null); setTooltipRect(null) } }}>
          <div style={{ background:'#fff', borderRadius:16, width:'100%', maxWidth:860, height:'85vh', display:'flex', flexDirection:'column', boxShadow:'0 24px 64px rgba(0,0,0,0.2)', overflow:'hidden' }}>

            {/* Header */}
            <div style={{ padding:'14px 18px', borderBottom:'1px solid #E8ECF0', display:'flex', alignItems:'center', gap:10, flexShrink:0 }}>
              <div style={{ flex:1 }}>
                <div style={{ fontSize:15, fontWeight:700, color:'#2A3042' }}>Add materials to room</div>
                <div style={{ fontSize:12, color:'#9CA3AF', marginTop:2 }}>
                  {jobMats.length} on job · {pickerSelected.size > 0 ? `${pickerSelected.size} selected` : 'Click to select'}
                </div>
              </div>
              <input autoFocus value={search} onChange={e=>setSearch(e.target.value)}
                placeholder="Search…"
                style={{ padding:'7px 12px', border:'1px solid #DDE3EC', borderRadius:9, fontSize:13, outline:'none', width:200 }} />
              <button onClick={confirmAdd} disabled={pickerSelected.size===0 || adding}
                style={{ padding:'8px 18px', borderRadius:9, border:'none', background: pickerSelected.size>0?'#1D9E75':'#E8ECF0', color: pickerSelected.size>0?'#fff':'#9CA3AF', fontSize:13, fontWeight:700, cursor: pickerSelected.size>0?'pointer':'default', whiteSpace:'nowrap', flexShrink:0 }}>
                {adding ? 'Adding…' : pickerSelected.size>0 ? `Add ${pickerSelected.size}` : 'Select materials'}
              </button>
              <button onClick={() => { setShowPicker(false); setPickerSelected(new Set()); setHoveredMat(null); setTooltipRect(null) }}
                style={{ padding:'7px 10px', borderRadius:8, border:'1px solid #E8ECF0', background:'#fff', color:'#6B7280', fontSize:18, cursor:'pointer', lineHeight:1, flexShrink:0 }}>×</button>
            </div>

            <div style={{ display:'flex', flex:1, overflow:'hidden' }}>
              {/* Category sidebar */}
              <div style={{ width:160, borderRight:'1px solid #E8ECF0', overflowY:'auto', flexShrink:0, padding:'6px 0' }}>
                {rootCats.map(cat => {
                  const count = cat==='All' ? jobMats.length
                    : jobMats.filter(jm => (jmLabels.get(jm.id)||'').startsWith(cat)).length
                  return (
                    <button key={cat} onClick={() => setPickerCat(cat)}
                      style={{ width:'100%', textAlign:'left', padding:'8px 14px', border:'none', cursor:'pointer', fontSize:12, fontWeight: pickerCat===cat?700:400,
                        background: pickerCat===cat?'#EEF2FF':'transparent', color: pickerCat===cat?'#3730A3':'#374151',
                        borderRight: pickerCat===cat?'3px solid #5B8AF0':'3px solid transparent', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                      <span style={{ overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{cat}</span>
                      <span style={{ fontSize:10, color:'#9CA3AF', flexShrink:0, marginLeft:4 }}>{count}</span>
                    </button>
                  )
                })}
              </div>

              {/* Material grid */}
              <div style={{ flex:1, overflowY:'auto', padding:14 }}>
                {groups.length === 0 ? (
                  <div style={{ textAlign:'center', color:'#9CA3AF', padding:'40px 0', fontSize:13 }}>
                    {q ? 'No materials match your search' : 'No materials in this category'}
                  </div>
                ) : groups.map(({ groupName, items }) => (
                  <div key={groupName} style={{ marginBottom:18 }}>
                    <div style={{ fontSize:11, fontWeight:800, color:'#6B7280', textTransform:'uppercase', letterSpacing:'.06em', marginBottom:8, paddingBottom:4, borderBottom:'1px solid #E8ECF0' }}>
                      {groupName} <span style={{ fontWeight:500 }}>({items.length})</span>
                    </div>
                    <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(150px, 1fr))', gap:8 }}>
                      {items.map(jm => {
                        const m = jm.materials; if (!m) return null
                        const alreadyInRoom = roomMatIds.has(m.id)
                        const selected = pickerSelected.has(jm.id)
                        return (
                          <div key={jm.id}
                            onClick={() => {
                              if (alreadyInRoom) return
                              setPickerSelected(prev => {
                                const next = new Set(prev)
                                next.has(jm.id) ? next.delete(jm.id) : next.add(jm.id)
                                return next
                              })
                            }}
                            onMouseEnter={e => { setHoveredMat(m); setTooltipRect(e.currentTarget.getBoundingClientRect()) }}
                            onMouseLeave={() => { setHoveredMat(null); setTooltipRect(null) }}
                            style={{ borderRadius:10, border: selected?'2px solid #1D9E75': alreadyInRoom?'2px solid #E8ECF0':'2px solid #E8ECF0',
                              background: alreadyInRoom?'#F9FAFB': selected?'#F0FDF4':'#fff',
                              cursor: alreadyInRoom?'default':'pointer', overflow:'hidden', opacity: alreadyInRoom?0.5:1,
                              boxShadow: selected?'0 0 0 3px rgba(29,158,117,0.15)':'none', transition:'all .1s' }}>
                            <div style={{ height:80, background:'#F3F4F6', display:'flex', alignItems:'center', justifyContent:'center', position:'relative', overflow:'hidden' }}>
                              {m.storage_path
                                ? <img src={pubUrl(m.storage_path)} alt="" style={{ width:'100%', height:'100%', objectFit:'contain', background:'#fff' }} />
                                : <div style={{ width:'100%', height:'100%', background:m.color||'#E8ECF0', display:'flex', alignItems:'center', justifyContent:'center' }}>
                                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#C4C9D4" strokeWidth="1.5"><rect x="3" y="3" width="18" height="18" rx="3"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>
                                  </div>
                              }
                              {(selected || alreadyInRoom) && (
                                <div style={{ position:'absolute', top:5, right:5, width:20, height:20, borderRadius:'50%',
                                  background: alreadyInRoom?'#9CA3AF':'#1D9E75', display:'flex', alignItems:'center', justifyContent:'center' }}>
                                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3"><polyline points="20 6 9 17 4 12"/></svg>
                                </div>
                              )}
                            </div>
                            <div style={{ padding:'7px 8px' }}>
                              <div style={{ fontSize:11, fontWeight:600, color: alreadyInRoom?'#9CA3AF':'#2A3042', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', display:'flex', alignItems:'center', gap:3 }}>
                                {m.is_kit && <span style={{ fontSize:10, flexShrink:0 }}>🧰</span>}
                                {m.name}
                              </div>
                              <div style={{ fontSize:10, color:'#9CA3AF', marginTop:2, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                                {alreadyInRoom ? 'In this room' : m.is_kit ? 'Kit' : [m.supplier, m.panel_type, m.thickness?m.thickness+'mm':null].filter(Boolean).join(' · ') || '—'}
                              </div>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Footer */}
            {pickerSelected.size > 0 && (
              <div style={{ padding:'10px 18px', borderTop:'1px solid #E8ECF0', display:'flex', alignItems:'center', justifyContent:'space-between', background:'#F8FAFF', flexShrink:0 }}>
                <button onClick={() => setPickerSelected(new Set())}
                  style={{ fontSize:12, color:'#9CA3AF', background:'none', border:'none', cursor:'pointer' }}>Clear selection</button>
                <button onClick={confirmAdd} disabled={adding}
                  style={{ padding:'9px 22px', borderRadius:9, border:'none', background:'#1D9E75', color:'#fff', fontSize:13, fontWeight:700, cursor:'pointer' }}>
                  {adding ? 'Adding…' : `Add ${pickerSelected.size} material${pickerSelected.size!==1?'s':''} to room →`}
                </button>
              </div>
            )}
            <MatTooltip m={hoveredMat} anchorRect={tooltipRect} />
          </div>
        </div>,
        document.body
      )}

      {/* Assigned materials list */}
      {roomMats.length === 0 && filteredMats.length === 0 && (
        <div style={{ textAlign:'center', padding:'24px 0', color:'#9CA3AF', fontSize:13 }}>
          No materials assigned to this job yet — add materials from the job card first.
        </div>
      )}
      {roomMats.length === 0 && filteredMats.length > 0 && (
        <div style={{ textAlign:'center', padding:'20px 0', color:'#9CA3AF', fontSize:13 }}>
          Tap <strong>+ Add material</strong> to assign materials to this room.
        </div>
      )}
      {/* Assigned materials list — grouped by root category */}
      {roomMats.length > 0 && (
        <div style={{ display:'flex', flexDirection:'column', gap:16 }}>
          {groupByRootCategory(roomMats, allCats).map(({ groupName, items }) => (
            <div key={groupName}>
              <div style={{ fontSize:11, fontWeight:800, color:'#9CA3AF', textTransform:'uppercase', letterSpacing:'.06em', marginBottom:6, paddingBottom:4, borderBottom:'1px solid #E8ECF0' }}>
                {groupName} <span style={{ fontWeight:500 }}>({items.length})</span>
              </div>
              <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
                  {items.map(rm => {
                  const m = rm.materials; if (!m) return null
                  const sku = (() => { try { const cf = m.custom_fields ? (typeof m.custom_fields==='object'?m.custom_fields:JSON.parse(m.custom_fields)) : {}; return cf.sku||null } catch { return null } })()
                  const order = orderMap[m.id]
                  return (
                    <div key={rm.id}
                      onClick={e => { e.stopPropagation(); onViewMaterial?.(m) }}
                      title="Click to view product info"
                      style={{ display:'flex', alignItems:'center', gap:10, padding:'10px 14px', background:'#fff', borderRadius:10, border:'1px solid #E8ECF0', cursor:'pointer' }}
                      onMouseEnter={e => { e.currentTarget.style.background='#F8FAFF'; e.currentTarget.style.borderColor='#C4D4F8' }}
                      onMouseLeave={e => { e.currentTarget.style.background='#fff'; e.currentTarget.style.borderColor='#E8ECF0' }}>
                      {m.storage_path
                        ? <img src={pubUrl(m.storage_path)} style={{ width:40,height:40,borderRadius:9,objectFit:'cover',flexShrink:0,border:'1px solid #E8ECF0' }} alt="" />
                        : <div style={{ width:40,height:40,borderRadius:9,background:m.color||'#E8ECF0',flexShrink:0,border:'1px solid rgba(0,0,0,0.06)' }} />
                      }
                      <div style={{ flex:1, minWidth:0 }}>
                        <div style={{ fontSize:13, fontWeight:700, color:'#2A3042', display:'flex', alignItems:'center', gap:5 }}>
                          {m.is_kit && <span title="Kit">🧰</span>}
                          {m.name}
                        </div>
                        <div style={{ fontSize:11, color:'#9CA3AF', marginTop:2 }}>
                          {m.is_kit ? 'Kit' : [m.supplier, m.panel_type, m.thickness?m.thickness+'mm':null, m.colour_code, m.finish].filter(Boolean).join(' · ')}
                          {sku && <span style={{ marginLeft:4, color:'#B0B8C4' }}>· SKU: {sku}</span>}
                        </div>
                      </div>
                      {order && (
                        <div title={order.allOrdered ? 'Ordered' : 'Added to order — not yet ordered'}
                          style={{ display:'flex', alignItems:'center', gap:3, padding:'3px 8px', borderRadius:20, flexShrink:0,
                            background: order.allOrdered ? '#F0FDF4' : '#FFF7ED',
                            border: `1px solid ${order.allOrdered ? '#BBF7D0' : '#FED7AA'}` }}>
                          <svg width="11" height="11" viewBox="0 0 24 24" fill="none"
                            stroke={order.allOrdered ? '#16A34A' : '#EA580C'} strokeWidth="3">
                            <polyline points="20 6 9 17 4 12"/>
                          </svg>
                          {order.qty > 0 && (
                            <span style={{ fontSize:11, fontWeight:700, color: order.allOrdered ? '#16A34A' : '#EA580C' }}>
                              {Number.isInteger(order.qty) ? order.qty : order.qty.toFixed(1)}
                            </span>
                          )}
                        </div>
                      )}
                      <button onClick={e => { e.stopPropagation(); onRemove(rm.id) }}
                        style={{ background:'none', border:'none', cursor:'pointer', color:'#D1D5DB', fontSize:18, lineHeight:1, flexShrink:0 }}
                        onMouseEnter={e=>e.currentTarget.style.color='#E24B4A'}
                        onMouseLeave={e=>e.currentTarget.style.color='#D1D5DB'}>×</button>
                    </div>
                  )
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Scrollable Tab Bar ────────────────────────────────────────────
function ScrollableTabs({ tabs, activeTab, onSelect, dark = false }) {
  const scrollRef = React.useRef()
  const [canLeft, setCanLeft]   = React.useState(false)
  const [canRight, setCanRight] = React.useState(false)

  function updateArrows() {
    const el = scrollRef.current
    if (!el) return
    setCanLeft(el.scrollLeft > 4)
    setCanRight(el.scrollLeft < el.scrollWidth - el.clientWidth - 4)
  }

  React.useEffect(() => {
    updateArrows()
    const el = scrollRef.current
    if (!el) return
    el.addEventListener('scroll', updateArrows, { passive: true })
    const ro = new ResizeObserver(updateArrows)
    ro.observe(el)
    return () => { el.removeEventListener('scroll', updateArrows); ro.disconnect() }
  }, [tabs])

  function scroll(dir) {
    scrollRef.current?.scrollBy({ left: dir * 120, behavior:'smooth' })
  }

  const arrowStyle = (show) => ({
    flexShrink: 0, width:24, height:28, display:'flex', alignItems:'center', justifyContent:'center',
    background: dark ? 'rgba(255,255,255,0.15)' : '#fff',
    border: dark ? '1px solid rgba(255,255,255,0.2)' : '1px solid #E8ECF0',
    borderRadius:6, cursor:'pointer', fontSize:12,
    color: dark ? '#fff' : '#6B7280',
    opacity: show ? 1 : 0, pointerEvents: show ? 'auto' : 'none',
    transition:'opacity .15s',
  })

  return (
    <div style={{ display:'flex', alignItems:'center', gap:3, width:'100%', minWidth:0 }}>
      <button style={arrowStyle(canLeft)} onClick={() => scroll(-1)}>‹</button>
      <div ref={scrollRef} style={{
        display:'flex', gap:2, flex:1, overflowX:'auto', scrollbarWidth:'none', msOverflowStyle:'none',
        WebkitOverflowScrolling:'touch', minWidth:0,
        ...(dark ? {} : { background:'#EEEFF2', borderRadius:9, padding:3 }),
      }}
        onScroll={updateArrows}>
        <style>{`#rdtabs::-webkit-scrollbar{display:none}`}</style>
        {tabs.map(t => (
          <button key={t.key} onClick={() => onSelect(t.key)}
            style={{
              fontSize:12, fontWeight:activeTab===t.key ? 700 : 500,
              padding: dark ? '6px 14px' : '5px 12px',
              borderRadius: dark ? 8 : 7,
              border:'none', whiteSpace:'nowrap', cursor:'pointer', flexShrink:0,
              background: dark
                ? (activeTab===t.key ? 'rgba(255,255,255,0.2)' : 'transparent')
                : (activeTab===t.key ? '#fff' : 'transparent'),
              color: dark
                ? (activeTab===t.key ? '#fff' : 'rgba(255,255,255,0.7)')
                : (activeTab===t.key ? '#2A3042' : '#6B7280'),
              boxShadow: (!dark && activeTab===t.key) ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
            }}>
            {t.label}
          </button>
        ))}
      </div>
      <button style={arrowStyle(canRight)} onClick={() => scroll(1)}>›</button>
    </div>
  )
}
function RoomFilesTab({ room, jobId }) {
  const toast = useToast()
  const [files, setFiles]       = useState([])
  const [loading, setLoading]   = useState(true)
  const [uploading, setUploading] = useState(false)
  const inputRef = useRef()

  useEffect(() => {
    supabase.from('room_files').select('*').eq('room_id', room.id).order('created_at', { ascending: false })
      .then(({ data, error }) => {
        if (error) console.error('Room files load error:', error.message)
        setFiles(data || [])
        setLoading(false)
      })
  }, [room.id])

  async function handleUpload(e) {
    const selected = Array.from(e.target.files || [])
    if (!selected.length) return
    setUploading(true)
    for (const file of selected) {
      const path = `rooms/${room.id}/${Date.now()}_${file.name.replace(/\s+/g,'_')}`
      const { error: upErr } = await supabase.storage.from(BUCKET).upload(path, file, { contentType: file.type })
      if (upErr) { toast(upErr.message, 'error'); continue }
      const { data } = await supabase.from('room_files')
        .insert({ room_id: room.id, job_id: jobId, name: file.name, type: file.type, size: file.size, storage_path: path })
        .select().single()
      if (data) setFiles(p => [data, ...p])
    }
    setUploading(false)
    e.target.value = ''
    toast('Uploaded ✓')
  }

  async function deleteFile(f) {
    if (!confirm(`Delete "${f.name}"?`)) return
    if (f.storage_path) await supabase.storage.from(BUCKET).remove([f.storage_path])
    await supabase.from('room_files').delete().eq('id', f.id)
    setFiles(p => p.filter(x => x.id !== f.id))
    toast('Deleted')
  }

  function formatSize(bytes) {
    if (!bytes) return ''
    if (bytes < 1024) return bytes + ' B'
    if (bytes < 1048576) return (bytes/1024).toFixed(1) + ' KB'
    return (bytes/1048576).toFixed(1) + ' MB'
  }

  function fileIcon(type) {
    if (type?.startsWith('image/')) return '🖼'
    if (type?.includes('pdf')) return '📄'
    if (type?.includes('word') || type?.includes('document')) return '📝'
    if (type?.includes('sheet') || type?.includes('excel') || type?.includes('csv')) return '📊'
    if (type?.includes('zip') || type?.includes('compressed')) return '🗜'
    return '📎'
  }

  return (
    <div>
      {/* Upload button */}
      <div style={{ display:'flex', justifyContent:'flex-end', marginBottom:12 }}>
        <input ref={inputRef} type="file" multiple onChange={handleUpload} style={{ display:'none' }} />
        <button onClick={() => inputRef.current?.click()} disabled={uploading}
          style={{ padding:'8px 16px', borderRadius:9, border:'none', background:'#5B8AF0', color:'#fff', fontSize:13, fontWeight:600, cursor:'pointer', display:'flex', alignItems:'center', gap:6 }}>
          {uploading ? '⏳ Uploading…' : '+ Upload file'}
        </button>
      </div>

      {/* Drop zone hint */}
      <div
        onDragOver={e => { e.preventDefault(); e.currentTarget.style.background='#EEF2FF'; e.currentTarget.style.borderColor='#5B8AF0' }}
        onDragLeave={e => { e.currentTarget.style.background='#F9FAFB'; e.currentTarget.style.borderColor='#E8ECF0' }}
        onDrop={async e => {
          e.preventDefault()
          e.currentTarget.style.background='#F9FAFB'; e.currentTarget.style.borderColor='#E8ECF0'
          const droppedFiles = Array.from(e.dataTransfer.files)
          if (!droppedFiles.length) return
          setUploading(true)
          for (const file of droppedFiles) {
            const path = `rooms/${room.id}/${Date.now()}_${file.name.replace(/\s+/g,'_')}`
            const { error: upErr } = await supabase.storage.from(BUCKET).upload(path, file, { contentType: file.type })
            if (upErr) { toast(upErr.message, 'error'); continue }
            const { data } = await supabase.from('room_files')
              .insert({ room_id: room.id, job_id: jobId, name: file.name, type: file.type, size: file.size, storage_path: path })
              .select().single()
            if (data) setFiles(p => [data, ...p])
          }
          setUploading(false)
          toast('Uploaded ✓')
        }}
        style={{ border:'2px dashed #E8ECF0', borderRadius:12, padding:'16px', background:'#F9FAFB', marginBottom:12, textAlign:'center', fontSize:12, color:'#9CA3AF', transition:'all .15s' }}>
        Drop files here or use the Upload button above
      </div>

      {/* File list */}
      {loading ? (
        <div style={{ color:'#9CA3AF', fontSize:13, textAlign:'center', padding:'20px 0' }}>Loading…</div>
      ) : files.length === 0 ? (
        <div style={{ color:'#9CA3AF', fontSize:13, textAlign:'center', padding:'20px 0' }}>No files uploaded yet</div>
      ) : (
        <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
          {files.map(f => (
            <div key={f.id} style={{ display:'flex', alignItems:'center', gap:10, padding:'10px 12px', background:'#fff', borderRadius:10, border:'1px solid #E8ECF0' }}>
              <span style={{ fontSize:20, flexShrink:0 }}>{fileIcon(f.type)}</span>
              <div style={{ flex:1, minWidth:0 }}>
                <a href={pubUrl(f.storage_path)} target="_blank" rel="noopener noreferrer"
                  style={{ fontSize:13, fontWeight:600, color:'#2A3042', textDecoration:'none', display:'block', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}
                  onMouseEnter={e=>e.target.style.color='#5B8AF0'}
                  onMouseLeave={e=>e.target.style.color='#2A3042'}>
                  {f.name}
                </a>
                <div style={{ fontSize:11, color:'#9CA3AF', marginTop:1 }}>
                  {formatSize(f.size)}{f.created_at ? ` · ${new Date(f.created_at).toLocaleDateString('en-NZ', { day:'numeric', month:'short', year:'numeric' })}` : ''}
                </div>
              </div>
              <button onClick={() => deleteFile(f)}
                style={{ background:'none', border:'none', cursor:'pointer', color:'#D1D5DB', fontSize:16, padding:'2px 4px', flexShrink:0, borderRadius:4 }}
                onMouseEnter={e=>e.currentTarget.style.color='#E24B4A'}
                onMouseLeave={e=>e.currentTarget.style.color='#D1D5DB'}>×</button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function RoomOrdersTab({ room, jobId, jobMats, roomMats, onOpenFull, allCats = [], onViewMaterial }) {
  const toast = useToast()
  const [orders,  setOrders]  = useState([])
  const [loading, setLoading] = useState(true)
  const [allMats, setAllMats] = useState([])
  const [poModal, setPoModal] = useState(null) // { orderId, existingPO }
  const [jobNumber, setJobNumber] = useState('')

  // Load job number for PO prefix
  useEffect(() => {
    if (!jobId) return
    supabase.from('jobs').select('job_number').eq('id', jobId).single()
      .then(({ data }) => { if (data?.job_number) setJobNumber(String(data.job_number)) })
  }, [jobId])

  // Materials available to order = only those assigned to THIS room (not the whole library)
  useEffect(() => {
    const roomMaterials = (roomMats || []).map(rm => rm.materials).filter(Boolean)
    setAllMats(roomMaterials)
  }, [roomMats])
  const [search,  setSearch]  = useState('')
  const [showDrop,setShowDrop]= useState(false)
  const [showOrderPicker, setShowOrderPicker] = useState(false)
  const [orderPickerCat, setOrderPickerCat] = useState('All')
  const [hoveredMat, setHoveredMat] = useState(null)
  const [tooltipRect, setTooltipRect] = useState(null)
  const [selected, setSelected] = useState(null)   // picked material
  const [catFields, setCatFields] = useState([])   // visible fields for this category
  const [catVisibility, setCatVisibility] = useState(null) // Set of visible keys
  const [qty,    setQty]    = useState('')
  const [unit,   setUnit]   = useState('pcs')
  const [notes,  setNotes]  = useState('')
  const searchRef = useRef()
  const searchWrapRef = useRef()

  const [unitOptions, setUnitOptions] = useState(['sheets','pcs','m','m²','m³','lm','kg','boxes','rolls','litres','sets','L','pairs'])
  useEffect(() => {
    loadUnitTypes().then(setUnitOptions)
    const handler = e => setUnitOptions(e.detail)
    window.addEventListener('unit-types-updated', handler)
    return () => window.removeEventListener('unit-types-updated', handler)
  }, [])

  const ALL_STANDARD_FIELDS = [
    { key:'supplier',     label:'Supplier' },
    { key:'brand',        label:'Brand' },
    { key:'sku',          label:'SKU / Product code' },
    { key:'panel_type',   label:'Panel type' },
    { key:'thickness',    label:'Thickness', suffix:'mm' },
    { key:'colour_code',  label:'Colour code' },
    { key:'colour',       label:'Colour name' },
    { key:'finish',       label:'Finish' },
    { key:'grade',        label:'Grade' },
    { key:'edge_profile', label:'Edge profile' },
    { key:'dimensions',   label:'Sheet dimensions' },
    { key:'price',        label:'Unit price', prefix:'$' },
  ]

  useEffect(()=>{
    function loadOrders() {
      supabase.from('order_items').select('*').eq('job_id',jobId).eq('room_id',room.id).order('created_at')
        .then(({data})=>{
          const parsed = (data||[]).map(o => {
            let pb = []
            try { pb = o.price_breaks ? (typeof o.price_breaks === 'string' ? JSON.parse(o.price_breaks) : o.price_breaks) : [] } catch {}
            return { ...o, price_breaks: pb }
          })
          setOrders(parsed); setLoading(false)
        })
    }
    loadOrders()
    // Re-fetch if order items change anywhere else (e.g. the full order sheet)
    window.addEventListener('order-items-updated', loadOrders)
    return () => window.removeEventListener('order-items-updated', loadOrders)
  },[room.id,jobId])

  const matches = search.trim().length > 0
    ? allMats.filter(m => {
        const cf = m.custom_fields
          ? (typeof m.custom_fields === 'object' ? m.custom_fields : (() => { try { return JSON.parse(m.custom_fields) } catch { return {} } })())
          : {}
        // Collect every string value from this material into one big searchable string
        const haystack = [
          m.name, m.supplier, m.panel_type, m.colour_code, m.finish,
          m.thickness ? String(m.thickness) : null,
          m.thickness ? String(m.thickness)+'mm' : null,
          m.notes, m.price ? String(m.price) : null,
          ...Object.values(cf).map(v => v ? String(v) : null),
        ].filter(Boolean).join(' ').toLowerCase()
        // Every word in the query must appear somewhere in the haystack
        const words = search.trim().toLowerCase().split(/\s+/)
        return words.every(w => haystack.includes(w))
      }).slice(0, 20)
    : allMats.slice(0, 20) // show all room materials when search is empty

  async function pickMaterial(m) {
    // Re-fetch the full material to ensure custom_fields.price_breaks are current
    const { data: fresh } = await supabase.from('materials').select('*').eq('id', m.id).single()
    const mat = fresh || m
    setSelected(mat)
    setSearch(mat.name || m.name || '')
    setShowDrop(false)
    setQty('')
    // Unit from custom_fields first, then native unit, then smart default
    const cf = mat.custom_fields
      ? (typeof mat.custom_fields === 'object' ? mat.custom_fields : (() => { try { return JSON.parse(mat.custom_fields) } catch { return {} } })())
      : {}
    const matUnit = cf.unit || mat.unit || (mat.panel_type ? 'sheets' : 'pcs')
    setUnit(matUnit)
    // Load category visibility settings
    if (mat.category_id) {
      const [{ data: cfg }, { data: catF }] = await Promise.all([
        supabase.from('app_settings').select('value').eq('key',`mat_cat_fields_${mat.category_id}`).maybeSingle(),
        supabase.from('category_fields').select('*').eq('category_id', mat.category_id).order('sort_order'),
      ])
      if (cfg?.value) setCatVisibility(new Set(JSON.parse(cfg.value)))
      else setCatVisibility(new Set(['supplier','panel_type','thickness','colour_code','finish','price','notes']))
      setCatFields(catF||[])
    } else {
      setCatVisibility(null)
      setCatFields([])
    }
  }

  function clearSelection() {
    setSelected(null); setSearch(''); setQty(''); setUnit('pcs'); setNotes('')
    setCatFields([]); setCatVisibility(null)
    setTimeout(()=>searchRef.current?.focus(), 50)
  }

  function getCF(m) {
    if (!m?.custom_fields) return {}
    if (typeof m.custom_fields === 'object') return m.custom_fields
    try { return JSON.parse(m.custom_fields) } catch { return {} }
  }

  function getVal(m, key) {
    const cf = getCF(m)
    // Try native column first, then custom_fields
    const native = m[key]
    if (native !== undefined && native !== null && native !== '') return native
    return cf[key] || ''
  }



  // Step-through "Add all" queue — walks the user through setting qty for each material one by one
  const [addQueue, setAddQueue] = useState(null) // { items:[...], index:0 }

  function startAddAllQueue() {
    const alreadyOrderedIds = new Set(orders.map(o => o.material_id).filter(Boolean))
    const toAdd = allMats.filter(m => !alreadyOrderedIds.has(m.id))
    if (!toAdd.length) { toast('All room materials are already on the order sheet', 'error'); return }
    setShowDrop(false)
    setSearch('')
    setAddQueue({ items: toAdd, index: 0 })
  }

  async function saveQueueItem(material, qtyVal, unitVal) {
    const cf = getCF(material)
    const priceBreaks = getPriceBreaks(material)
    const basePrice = material.price ? String(material.price) : ''
    const effPrice = priceBreaks.length && qtyVal
      ? getEffectivePrice(basePrice, priceBreaks, qtyVal)
      : (parseFloat(basePrice) || 0)
    const row = {
      id: Date.now().toString(36)+Math.random().toString(36).slice(2),
      job_id: jobId, room_id: room.id, status:'To order',
      item: material.name||'', supplier: material.supplier||'', panel_type: material.panel_type||'',
      thickness: material.thickness ? String(material.thickness) : '',
      colour: material.colour_code||cf.colour||'', finish: material.finish||'',
      sku: material.sku||cf.sku||'',
      price: effPrice ? String(effPrice) : basePrice,
      category: material.panel_type ? 'Board' : 'Hardware',
      material_id: material.id || null,
      qty: qtyVal||'', unit: unitVal||'pcs', notes:'',
      updated_at: new Date().toISOString(),
      ...(priceBreaks.length ? { price_breaks: JSON.stringify(priceBreaks) } : {}),
      ...(material.is_kit && material.kit_id ? { kit_id: material.kit_id, kit_name: material.name } : {}),
    }
    const { data, error } = await supabase.from('order_items').insert(row).select().single()
    if (error) { toast(error.message, 'error'); return false }
    setOrders(p => [...p, { ...data, price_breaks: priceBreaks }])
    return true
  }

  async function addItem() {
    if (!selected) { toast('Select or enter a material first','error'); return }
    const cf = getCF(selected)
    const priceBreaks = getPriceBreaks(selected)
    const basePrice = selected.price ? String(selected.price) : ''
    const effPrice = priceBreaks.length && qty
      ? getEffectivePrice(basePrice, priceBreaks, qty)
      : (parseFloat(basePrice) || 0)
    const row = {
      id: Date.now().toString(36)+Math.random().toString(36).slice(2),
      job_id: jobId, room_id: room.id, status:'To order',
      item:       selected.name||'',
      supplier:   selected.supplier||'',
      panel_type: selected.panel_type||'',
      thickness:  selected.thickness ? String(selected.thickness) : '',
      colour:     selected.colour_code||cf.colour||'',
      finish:     selected.finish||'',
      sku:        selected.sku||cf.sku||'',
      price:      effPrice ? String(effPrice) : basePrice,
      category:   selected.panel_type ? 'Board' : 'Hardware',
      material_id: selected.id || null,
      qty: qty||'', unit, notes,
      updated_at: new Date().toISOString(),
      // Store breaks so price updates if qty changes later
      ...(priceBreaks.length ? { price_breaks: JSON.stringify(priceBreaks) } : {}),
      // If this "material" is actually a kit, tag the row so the order sheet expands it
      ...(selected.is_kit && selected.kit_id ? { kit_id: selected.kit_id, kit_name: selected.name } : {}),
    }
    const {data,error} = await supabase.from('order_items').insert(row).select().single()
    if (error) { toast(error.message,'error'); return }
    // Parse price_breaks back for local state
    setOrders(p=>[...p, { ...data, price_breaks: priceBreaks }])
    clearSelection()
    toast('Added to order sheet ✓')
  }

  async function removeItem(id) {
    const item = orders.find(o => o.id === id)
    const name = item?.item || 'this item'
    if (!confirm(`Remove "${name}" from the order sheet?`)) return
    await supabase.from('order_items').delete().eq('id',id)
    const updatedOrders = orders.filter(o=>o.id!==id)
    setOrders(updatedOrders)
    // Sync task in case removing was the last "To order" item
    const stillToOrder = updatedOrders.filter(o => o.status === 'To order')
    if (stillToOrder.length === 0 && item) {
      const { data: jobData } = await supabase.from('jobs').select('tasks').eq('id', jobId).single()
      if (jobData) {
        const tasks = typeof jobData.tasks === 'string' ? JSON.parse(jobData.tasks||'[]') : (jobData.tasks||[])
        const ORDER_TASK_PREFIX = '🛒 Order materials'
        const existingIdx = tasks.findIndex(t => t.title?.startsWith(ORDER_TASK_PREFIX))
        if (existingIdx >= 0 && !tasks[existingIdx].done) {
          const { data: allItems } = await supabase.from('order_items').select('status').eq('job_id', jobId)
          const anyToOrder = (allItems||[]).some(i => i.status === 'To order')
          if (!anyToOrder) {
            tasks[existingIdx] = { ...tasks[existingIdx], done: true, completedAt: new Date().toISOString() }
            await supabase.from('jobs').update({ tasks: JSON.stringify(tasks) }).eq('id', jobId)
            window.dispatchEvent(new CustomEvent('tasks-updated', { detail: { jobId } }))
          }
        }
      }
    }
  }

  function toggleStatus(o) {
    const next = o.status==='To order'?'Ordered':o.status==='Ordered'?'Received':'To order'
    if (next === 'Ordered') {
      // Require PO number before marking as ordered
      setPoModal({ orderId: o.id, existingPO: o.po_number || null })
    } else {
      applyStatusChange(o.id, next, null)
    }
  }

  async function applyStatusChange(orderId, next, poNumber) {
    const patch = { status: next }
    if (poNumber) patch.po_number = poNumber
    await supabase.from('order_items').update(patch).eq('id', orderId)
    const updatedOrders = orders.map(x => x.id===orderId ? {...x, ...patch} : x)
    setOrders(updatedOrders)
    // Sync the order task in the job
    const stillToOrder = updatedOrders.filter(x => x.status === 'To order')
    const { data: jobData } = await supabase.from('jobs').select('tasks').eq('id', jobId).single()
    if (!jobData) return
    const tasks = typeof jobData.tasks === 'string' ? JSON.parse(jobData.tasks||'[]') : (jobData.tasks||[])
    const ORDER_TASK_PREFIX = '🛒 Order materials'
    const existingIdx = tasks.findIndex(t => t.title?.startsWith(ORDER_TASK_PREFIX))
    if (existingIdx >= 0) {
      if (stillToOrder.length === 0) {
        const { data: allItems } = await supabase.from('order_items').select('status').eq('job_id', jobId)
        const anyToOrder = (allItems||[]).some(i => i.status === 'To order')
        if (!anyToOrder && !tasks[existingIdx].done) {
          tasks[existingIdx] = { ...tasks[existingIdx], done: true, completedAt: new Date().toISOString() }
          await supabase.from('jobs').update({ tasks: JSON.stringify(tasks) }).eq('id', jobId)
          window.dispatchEvent(new CustomEvent('tasks-updated', { detail: { jobId } }))
        }
      } else if (tasks[existingIdx].done) {
        tasks[existingIdx] = { ...tasks[existingIdx], done: false, completedAt: null }
        await supabase.from('jobs').update({ tasks: JSON.stringify(tasks) }).eq('id', jobId)
        window.dispatchEvent(new CustomEvent('tasks-updated', { detail: { jobId } }))
      }
    }
  }

  // Which standard fields to show for selected material
  const visibleStdFields = selected ? ALL_STANDARD_FIELDS.filter(f => {
    const val = getVal(selected, f.key)
    if (catVisibility) return catVisibility.has(f.key) && val !== ''
    // No config — only show fields that actually have a value
    return val !== '' && val !== null && val !== undefined
  }) : []

  const toOrder = orders.filter(o=>o.status==='To order').length
  const [syncing, setSyncing] = useState(false)
  const syncedCount = React.useRef(0)

  async function resyncFromLibrary() {
    const syncable = orders.filter(o => o.material_id)
    if (syncable.length === 0) { toast('No linked materials to resync', 'error'); return }
    if (!confirm(`Resync ${syncable.length} item${syncable.length!==1?'s':''} from the library?\n\nThis will update: name, supplier, price, price breaks, SKU, panel type, thickness, colour and finish.\n\nQty, unit, notes and status will not change.`)) return
    setSyncing(true)
    syncedCount.current = 0
    try {
      // Fetch all linked materials in one query
      const matIds = [...new Set(syncable.map(o => o.material_id))]
      const { data: freshMats, error } = await supabase.from('materials').select('*').in('id', matIds)
      if (error) { toast(error.message, 'error'); setSyncing(false); return }
      const matMap = {}
      ;(freshMats||[]).forEach(m => { matMap[m.id] = m })

      const updatedOrders = [...orders]
      for (const o of syncable) {
        const mat = matMap[o.material_id]
        if (!mat) continue
        const cf = mat.custom_fields
          ? (typeof mat.custom_fields === 'object' ? mat.custom_fields : (() => { try { return JSON.parse(mat.custom_fields) } catch { return {} } })())
          : {}
        const priceBreaks = getPriceBreaks(mat)
        const basePrice = mat.price ? String(mat.price) : ''
        const effPrice = priceBreaks.length && o.qty
          ? getEffectivePrice(basePrice, priceBreaks, parseFloat(o.qty))
          : (parseFloat(basePrice) || 0)

        const patch = {
          item:        mat.name || o.item,
          supplier:    mat.supplier || cf.supplier || '',
          panel_type:  mat.panel_type || '',
          thickness:   mat.thickness ? String(mat.thickness) : '',
          colour:      mat.colour_code || cf.colour || '',
          finish:      mat.finish || '',
          sku:         mat.sku || cf.sku || '',
          price:       effPrice ? String(effPrice) : basePrice,
          price_breaks: priceBreaks.length ? JSON.stringify(priceBreaks) : null,
          updated_at:  new Date().toISOString(),
        }
        const { error: upErr } = await supabase.from('order_items').update(patch).eq('id', o.id)
        if (!upErr) {
          const idx = updatedOrders.findIndex(x => x.id === o.id)
          if (idx !== -1) updatedOrders[idx] = { ...updatedOrders[idx], ...patch, price_breaks: priceBreaks }
          syncedCount.current++
        }
      }
      setOrders(updatedOrders)
      toast(`Resynced ${syncedCount.current} item${syncedCount.current!==1?'s':''} ✓`)
    } finally {
      setSyncing(false)
    }
  }

  return (
    <div>
      {/* header */}
      <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:12,flexWrap:'wrap',gap:8}}>
        <div style={{display:'flex',alignItems:'center',gap:8}}>
          <span style={{fontSize:13,fontWeight:700,color:'#2A3042'}}>Items to order</span>
          {toOrder>0&&<span style={{fontSize:11,fontWeight:700,padding:'2px 8px',borderRadius:10,background:'#FEF9C3',color:'#854D0E'}}>{toOrder} to order</span>}
        </div>
        <div style={{display:'flex',alignItems:'center',gap:6}}>
          {orders.some(o=>o.material_id) && (
            <button onClick={resyncFromLibrary} disabled={syncing}
              title="Update order items with the latest pricing, name and specs from the materials library"
              style={{fontSize:11,fontWeight:600,padding:'5px 12px',borderRadius:8,border:'1px solid #E8ECF0',background:'#fff',color:syncing?'#9CA3AF':'#6B7280',cursor:syncing?'default':'pointer',display:'flex',alignItems:'center',gap:5}}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
                style={{animation:syncing?'spin 1s linear infinite':undefined}}>
                <polyline points="23 4 23 10 17 10"/>
                <polyline points="1 20 1 14 7 14"/>
                <path d="M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15"/>
              </svg>
              {syncing ? 'Syncing…' : 'Resync from library'}
            </button>
          )}
          <button onClick={onOpenFull}
            style={{fontSize:11,fontWeight:600,padding:'5px 12px',borderRadius:8,border:'1px solid #C4D4F8',background:'#EEF2FF',color:'#3730A3',cursor:'pointer',display:'flex',alignItems:'center',gap:5}}>
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
            Full order sheet
          </button>
        </div>
      </div>

      {/* search + add */}
      <div style={{background:'#F8FAFF',borderRadius:12,border:'1px solid #C4D4F8',padding:14,marginBottom:12}}>
        {/* Material picker — opens full modal */}
        <div style={{marginBottom: selected ? 12 : 0}}>
          {!selected ? (
            <div style={{display:'flex',gap:8}}>
              <button onClick={() => setShowOrderPicker(true)}
                style={{flex:1,padding:'10px 14px',borderRadius:9,border:'1px solid #5B8AF0',background:'#EEF2FF',color:'#3730A3',fontSize:13,fontWeight:700,cursor:'pointer',display:'flex',alignItems:'center',gap:8,justifyContent:'center'}}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
                Browse &amp; select material
              </button>
              <button onClick={() => { setSelected({id:null,name:'',custom_fields:{}}); setCatFields([]); setCatVisibility(null) }}
                style={{padding:'10px 14px',borderRadius:9,border:'1px solid #DDE3EC',background:'#fff',color:'#6B7280',fontSize:12,fontWeight:600,cursor:'pointer',whiteSpace:'nowrap'}}>
                + Custom item
              </button>
            </div>
          ) : (
            <div style={{display:'flex',alignItems:'center',gap:8,padding:'8px 12px',background:'#fff',borderRadius:9,border:'1px solid #E8ECF0'}}>
              <div style={{flex:1,minWidth:0}}>
                <div style={{fontSize:13,fontWeight:700,color:'#2A3042',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{selected.name || 'Custom item'}</div>
                {selected.id && <div style={{fontSize:11,color:'#9CA3AF'}}>from library</div>}
              </div>
              <button onClick={clearSelection} style={{background:'none',border:'none',cursor:'pointer',color:'#9CA3AF',fontSize:18,lineHeight:1,flexShrink:0}}>×</button>
            </div>
          )}
        </div>

        {/* Order picker modal */}
        {showOrderPicker && ReactDOM.createPortal(
          <div style={{position:'fixed',inset:0,zIndex:99999,background:'rgba(0,0,0,0.45)',display:'flex',alignItems:'center',justifyContent:'center',padding:16}}
            onClick={e=>{if(e.target===e.currentTarget){setShowOrderPicker(false);setHoveredMat(null);setTooltipRect(null)}}}>
            <div style={{background:'#fff',borderRadius:16,width:'100%',maxWidth:860,height:'85vh',display:'flex',flexDirection:'column',boxShadow:'0 24px 64px rgba(0,0,0,0.2)',overflow:'hidden'}}>
              {/* Header */}
              <div style={{padding:'14px 18px',borderBottom:'1px solid #E8ECF0',display:'flex',alignItems:'center',gap:10,flexShrink:0}}>
                <div style={{flex:1}}>
                  <div style={{fontSize:15,fontWeight:700,color:'#2A3042'}}>Select material to order</div>
                  <div style={{fontSize:12,color:'#9CA3AF',marginTop:2}}>Showing materials assigned to this room · {allMats.length} available</div>
                </div>
                <input autoFocus value={search} onChange={e=>setSearch(e.target.value)}
                  placeholder="Search…"
                  style={{padding:'7px 12px',border:'1px solid #DDE3EC',borderRadius:9,fontSize:13,outline:'none',width:200}} />
                <button onClick={()=>{setShowOrderPicker(false);setSearch('');setHoveredMat(null);setTooltipRect(null)}}
                  style={{padding:'7px 10px',borderRadius:8,border:'1px solid #E8ECF0',background:'#fff',color:'#6B7280',fontSize:18,cursor:'pointer',lineHeight:1,flexShrink:0}}>×</button>
              </div>

              <div style={{display:'flex',flex:1,overflow:'hidden'}}>
                {/* Category sidebar */}
                {(() => {
                  const jmLbls = new Map(allMats.map(m=>[m.id,getCategoryLabel(m.category_id,allCats)]))
                  const roots=['All',...Array.from(new Set([...jmLbls.values()].map(l=>l.split(' › ')[0]).filter(Boolean))).sort()]
                  const q=search.trim().toLowerCase()
                  const words=q?q.split(/\s+/):[]
                  const catF=orderPickerCat==='All'?allMats:allMats.filter(m=>(jmLbls.get(m.id)||'').startsWith(orderPickerCat))
                  const filtered=words.length?catF.filter(m=>{
                    const cf=m.custom_fields?(typeof m.custom_fields==='object'?m.custom_fields:(() => { try { return JSON.parse(m.custom_fields) } catch { return {} } })()):{}
                    const hay=[m.name,m.supplier,m.panel_type,m.colour_code,m.finish,cf.sku].filter(Boolean).map(v=>String(v).toLowerCase()).join(' ')
                    return words.every(w=>hay.includes(w))
                  }):catF
                  const groups=groupByCategory(filtered.map(m=>({materials:m})),allCats)
                  return (<>
                    <div style={{width:160,borderRight:'1px solid #E8ECF0',overflowY:'auto',flexShrink:0,padding:'6px 0'}}>
                      {roots.map(cat=>{
                        const count=cat==='All'?allMats.length:allMats.filter(m=>(jmLbls.get(m.id)||'').startsWith(cat)).length
                        return(
                          <button key={cat} onClick={()=>setOrderPickerCat(cat)}
                            style={{width:'100%',textAlign:'left',padding:'8px 14px',border:'none',cursor:'pointer',fontSize:12,fontWeight:orderPickerCat===cat?700:400,
                              background:orderPickerCat===cat?'#EEF2FF':'transparent',color:orderPickerCat===cat?'#3730A3':'#374151',
                              borderRight:orderPickerCat===cat?'3px solid #5B8AF0':'3px solid transparent',display:'flex',justifyContent:'space-between',alignItems:'center'}}>
                            <span style={{overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{cat}</span>
                            <span style={{fontSize:10,color:'#9CA3AF',flexShrink:0,marginLeft:4}}>{count}</span>
                          </button>
                        )
                      })}
                    </div>
                    {/* Grid */}
                    <div style={{flex:1,overflowY:'auto',padding:14}}>
                      {groups.length===0?(
                        <div style={{textAlign:'center',color:'#9CA3AF',padding:'40px 0',fontSize:13}}>{q?'No materials match':'No materials in this category'}</div>
                      ):groups.map(({groupName,items})=>(
                        <div key={groupName} style={{marginBottom:18}}>
                          <div style={{fontSize:11,fontWeight:800,color:'#6B7280',textTransform:'uppercase',letterSpacing:'.06em',marginBottom:8,paddingBottom:4,borderBottom:'1px solid #E8ECF0'}}>
                            {groupName} <span style={{fontWeight:500}}>({items.length})</span>
                          </div>
                          <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(150px,1fr))',gap:8}}>
                            {items.map(({materials:m})=>{
                              if(!m)return null
                              const cf2=m.custom_fields?(typeof m.custom_fields==='object'?m.custom_fields:(() => { try { return JSON.parse(m.custom_fields) } catch { return {} } })()):{}
                              const sku=cf2.sku||m.sku||null
                              return(
                                <div key={m.id}
                                  onClick={()=>{pickMaterial(m);setShowOrderPicker(false);setSearch('');setHoveredMat(null);setTooltipRect(null)}}
                                  onMouseEnter={e=>{setHoveredMat(m);setTooltipRect(e.currentTarget.getBoundingClientRect());e.currentTarget.style.border='2px solid #5B8AF0';e.currentTarget.style.boxShadow='0 0 0 3px rgba(91,138,240,0.15)'}}
                                  onMouseLeave={e=>{setHoveredMat(null);setTooltipRect(null);e.currentTarget.style.border='2px solid #E8ECF0';e.currentTarget.style.boxShadow='none'}}
                                  style={{borderRadius:10,border:'2px solid #E8ECF0',background:'#fff',cursor:'pointer',overflow:'hidden',transition:'all .1s'}}>
                                  <div style={{height:80,background:'#F3F4F6',display:'flex',alignItems:'center',justifyContent:'center',overflow:'hidden'}}>
                                    {m.storage_path
                                      ?<img src={pubUrl(m.storage_path)} alt="" style={{width:'100%',height:'100%',objectFit:'contain',background:'#fff'}}/>
                                      :<div style={{width:'100%',height:'100%',background:m.color||'#E8ECF0',display:'flex',alignItems:'center',justifyContent:'center'}}>
                                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#C4C9D4" strokeWidth="1.5"><rect x="3" y="3" width="18" height="18" rx="3"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>
                                      </div>
                                    }
                                  </div>
                                  <div style={{padding:'7px 8px'}}>
                                    <div style={{fontSize:11,fontWeight:600,color:'#2A3042',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{m.name}</div>
                                    <div style={{fontSize:10,color:'#9CA3AF',marginTop:1,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>
                                      {[m.supplier,m.panel_type,m.thickness?m.thickness+'mm':null].filter(Boolean).join(' · ')||'—'}
                                    </div>
                                    {sku&&<div style={{fontSize:10,color:'#B0B8C4',marginTop:1}}>SKU: {sku}</div>}
                                  </div>
                                </div>
                              )
                            })}
                          </div>
                        </div>
                      ))}
                    </div>
                  </>)
                })()}
              </div>
            </div>
          </div>,
          document.body
        )}
        <MatTooltip m={hoveredMat} anchorRect={tooltipRect} />

        {/* Selected material details — read only, category-aware */}
        {selected && (
          <div>
            {/* Material card */}
            <div style={{background:'#fff',borderRadius:10,border:'1px solid #E8ECF0',padding:12,marginBottom:10}}>
              <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:8}}>
                <div style={{fontSize:14,fontWeight:700,color:'#2A3042'}}>{selected.name}</div>
                <span style={{fontSize:10,color:'#9CA3AF',fontStyle:'italic'}}>from library — read only</span>
              </div>
              {visibleStdFields.length > 0 ? (
                <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(120px,1fr))',gap:8}}>
                  {visibleStdFields.map(f => {
                    const val = getVal(selected, f.key)
                    return (
                      <div key={f.key} style={{background:'#F9FAFB',borderRadius:7,padding:'6px 10px',border:'1px solid #F3F4F6'}}>
                        <div style={{fontSize:9,fontWeight:700,color:'#C4C9D4',textTransform:'uppercase',letterSpacing:'.05em',marginBottom:2}}>{f.label}</div>
                        <div style={{fontSize:12,fontWeight:600,color:'#9CA3AF'}}>
                          {f.prefix||''}{val}{f.suffix && val ? f.suffix : ''}
                        </div>
                      </div>
                    )
                  })}
                  {/* Custom fields */}
                  {catFields.map(cf => {
                    const cfData = getCF(selected)
                    const val = cfData[cf.label] || cfData[cf.id] || ''
                    if (!val) return null
                    return (
                      <div key={cf.id} style={{background:'#F9FAFB',borderRadius:7,padding:'6px 10px',border:'1px solid #F3F4F6'}}>
                        <div style={{fontSize:9,fontWeight:700,color:'#C4C9D4',textTransform:'uppercase',letterSpacing:'.05em',marginBottom:2}}>{cf.label}</div>
                        <div style={{fontSize:12,fontWeight:600,color:'#9CA3AF'}}>{val}</div>
                      </div>
                    )
                  })}
                </div>
              ) : (
                <div style={{fontSize:12,color:'#9CA3AF',fontStyle:'italic'}}>No additional details recorded for this material</div>
              )}
              <div style={{fontSize:11,color:'#9CA3AF',marginTop:8,display:'flex',alignItems:'center',gap:4}}>
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
                Edit details in the Materials library
              </div>
            </div>

            {/* Qty + unit — unit comes from material, read-only */}
            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8,marginBottom:8}}>
              <div>
                <label style={{fontSize:11,fontWeight:600,color:'#6B7280',display:'block',marginBottom:4}}>Qty</label>
                <input type="number" min="0" value={qty} onChange={e=>setQty(e.target.value)}
                  placeholder="0"
                  style={{width:'100%',padding:'8px 10px',border:'1px solid #DDE3EC',borderRadius:8,fontSize:13,outline:'none',boxSizing:'border-box'}}/>
              </div>
              <div>
                <label style={{fontSize:11,fontWeight:600,color:'#6B7280',display:'block',marginBottom:4}}>Unit</label>
                <div style={{padding:'8px 10px',border:'1px solid #F3F4F6',borderRadius:8,fontSize:13,background:'#F9FAFB',color: unit ? '#374151' : '#9CA3AF',display:'flex',alignItems:'center',justifyContent:'space-between'}}>
                  <span>{unit || <span style={{fontStyle:'italic',color:'#C4C9D4'}}>not set</span>}</span>
                  <span style={{fontSize:10,color:'#C4C9D4',fontStyle:'italic'}}>from library</span>
                </div>
              </div>
            </div>
            <div style={{marginBottom:10}}>
              <label style={{fontSize:11,fontWeight:600,color:'#6B7280',display:'block',marginBottom:4}}>Notes (optional)</label>
              <input value={notes} onChange={e=>setNotes(e.target.value)} placeholder="Any specific notes for this order…"
                style={{width:'100%',padding:'8px 10px',border:'1px solid #DDE3EC',borderRadius:8,fontSize:13,outline:'none',boxSizing:'border-box'}}/>
            </div>

            {/* Price preview — shows effective price if breaks apply */}
            {selected.price && (() => {
              const pb = getPriceBreaks(selected)
              const basePrice = parseFloat(selected.price) || 0
              const eff = getEffectivePrice(selected.price, pb, qty)
              const isBreak = pb.length > 0 && eff !== basePrice
              const qtyNum = parseFloat(qty) || 0
              return (
                <div style={{marginBottom:10, padding:'8px 12px', borderRadius:8,
                  background: isBreak ? '#EEF2FF' : '#F9FAFB',
                  border: isBreak ? '1px solid #C7D2FE' : '1px solid #F3F4F6',
                  display:'flex', alignItems:'center', justifyContent:'space-between'}}>
                  <div>
                    <span style={{fontSize:11,fontWeight:600,color: isBreak ? '#3730A3' : '#6B7280'}}>
                      {isBreak ? `✦ Break price (≥${pb.filter(brk=>qtyNum>=parseFloat(brk.qty)).sort((x,y)=>parseFloat(y.qty)-parseFloat(x.qty))[0]?.qty} units)` : 'Unit price'}
                    </span>
                    {isBreak && <span style={{fontSize:10,color:'#9CA3AF',marginLeft:6}}>base ${basePrice.toFixed(2)}</span>}
                  </div>
                  <span style={{fontSize:14,fontWeight:800,color: isBreak ? '#5B8AF0' : '#374151'}}>
                    ${eff.toFixed(2)}
                    {qtyNum > 0 && <span style={{fontSize:11,fontWeight:500,color:'#9CA3AF',marginLeft:6}}>× {qtyNum} = ${(eff*qtyNum).toFixed(2)}</span>}
                  </span>
                </div>
              )
            })()}

            <button onClick={addItem}
              style={{width:'100%',padding:'10px',borderRadius:9,border:'none',background:'#2A3042',color:'#fff',fontSize:13,fontWeight:700,cursor:'pointer'}}>
              + Add to order sheet
            </button>
          </div>
        )}
      </div>

      {/* existing items — grouped by category with image previews */}
      {loading ? <div style={{textAlign:'center',padding:'20px 0',color:'#9CA3AF',fontSize:12}}>Loading…</div>
      : orders.length > 0 && (() => {
          // Build a lookup from material_id → full material (for image + category_id)
          const matById = {}
          ;(roomMats||[]).forEach(rm => { if (rm.materials) matById[rm.materials.id] = rm.materials })

          // Wrap orders as { materials: { category_id, storage_path } } shape for groupByCategory
          const wrapped = orders.map(o => ({
            ...o,
            materials: matById[o.material_id] || { category_id: null, storage_path: null },
          }))

          const grouped = groupByCategory(wrapped, allCats)

          return (
            <div style={{display:'flex',flexDirection:'column',gap:16,marginBottom:12}}>
              {grouped.map(({ groupName, items }) => (
                <div key={groupName}>
                  <div style={{fontSize:11,fontWeight:800,color:'#6B7280',textTransform:'uppercase',letterSpacing:'.06em',marginBottom:6,paddingBottom:4,borderBottom:'1px solid #E8ECF0'}}>
                    {groupName} <span style={{fontWeight:500}}>({items.length})</span>
                  </div>
                  <div style={{display:'flex',flexDirection:'column',gap:6}}>
                    {items.map(o => {
                      const mat = matById[o.material_id]
                      const sc = STATUS_COLOR[o.status]||STATUS_COLOR['To order']
                      const spec = [o.panel_type, o.thickness?o.thickness+'mm':null, o.colour, o.finish].filter(Boolean).join(' · ')
                      const qty = parseFloat(o.qty)
                      const priceBreaks = o.price_breaks || []
                      const effPrice = getEffectivePrice(o.price, priceBreaks, qty)
                      const price = effPrice
                      const total = !isNaN(qty)&&price>0&&qty>0 ? (qty*price).toFixed(2) : null
                      const hasBreakActive = priceBreaks.length > 0 && effPrice !== (parseFloat(o.price)||0)
                      return (
                        <div key={o.id} style={{background:'#fff',borderRadius:10,border:'1px solid #E8ECF0',overflow:'hidden'}}>
                          {/* top row */}
                          <div style={{display:'flex',alignItems:'flex-start',gap:10,padding:'10px 12px 6px'}}>
                            {/* Image thumbnail — clickable to view product info */}
                            <div onClick={e => { if (!mat) return; e.stopPropagation(); onViewMaterial?.(mat) }}
                              title={mat ? 'Click to view product info' : ''}
                              style={{ cursor: mat ? 'pointer' : 'default', flexShrink:0 }}>
                              {mat?.storage_path
                                ? <img src={pubUrl(mat.storage_path)} alt="" style={{width:40,height:40,borderRadius:8,objectFit:'cover',border:'1px solid #E8ECF0',display:'block'}} />
                                : <div style={{width:40,height:40,borderRadius:8,background:'#F3F4F6',border:'1px solid #E8ECF0',display:'flex',alignItems:'center',justifyContent:'center'}}>
                                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#D1D5DB" strokeWidth="1.5"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>
                                  </div>
                              }
                            </div>
                            <div style={{flex:1,minWidth:0}}>
                              <div style={{display:'flex',alignItems:'center',gap:6,flexWrap:'wrap'}}>
                                <div style={{fontSize:13,fontWeight:700,color:'#2A3042'}}>{o.item}</div>
                                {o.kit_name && (
                                  <span style={{fontSize:9,fontWeight:700,padding:'1px 7px',borderRadius:6,background:'#FFF7ED',color:'#C2410C',border:'1px solid #FED7AA',whiteSpace:'nowrap'}}>
                                    🧰 {o.kit_name}
                                  </span>
                                )}
                                <CopyBtn text={o.item} label="desc" />
                              </div>
                              {spec&&<div style={{fontSize:11,color:'#6B7280',marginTop:2}}>{spec}</div>}
                              {o.supplier&&<div style={{fontSize:11,color:'#9CA3AF',marginTop:1}}>{o.supplier}</div>}
                            </div>
                            <button onClick={()=>toggleStatus(o)}
                              style={{fontSize:10,fontWeight:700,padding:'3px 9px',borderRadius:8,border:`1px solid ${sc.bg}`,background:sc.bg,color:sc.color,cursor:'pointer',whiteSpace:'nowrap',flexShrink:0}}>
                              {o.status}
                            </button>
                            {o.po_number && (
                              <span style={{fontSize:10,fontWeight:700,color:'#374151',background:'#F3F4F6',border:'1px solid #E8ECF0',borderRadius:6,padding:'2px 7px',fontFamily:'monospace',flexShrink:0}}>
                                {o.po_number}
                              </span>
                            )}
                            <button onClick={()=>removeItem(o.id)}
                              style={{background:'none',border:'none',cursor:'pointer',color:'#D1D5DB',fontSize:16,lineHeight:1,flexShrink:0,padding:'0 2px'}}
                              onMouseEnter={e=>e.currentTarget.style.color='#E24B4A'}
                              onMouseLeave={e=>e.currentTarget.style.color='#D1D5DB'}>×</button>
                          </div>
                          {/* stats row */}
                          <div style={{display:'flex',gap:0,borderTop:'1px solid #F3F4F6'}}>
                            {o.qty&&<div style={{flex:1,padding:'6px 12px',borderRight:'1px solid #F3F4F6'}}>
                              <div style={{fontSize:9,fontWeight:700,color:'#C4C9D4',textTransform:'uppercase',letterSpacing:'.05em'}}>Qty</div>
                              <div style={{fontSize:12,fontWeight:700,color:'#374151'}}>{o.qty} {o.unit}</div>
                            </div>}
                            {o.price&&<div style={{flex:1,padding:'6px 12px',borderRight:total?'1px solid #F3F4F6':'none'}}>
                              <div style={{fontSize:9,fontWeight:700,color:'#C4C9D4',textTransform:'uppercase',letterSpacing:'.05em'}}>Unit price</div>
                              <div style={{fontSize:12,fontWeight:700,color:'#374151',display:'flex',alignItems:'center',gap:4}}>
                                ${price.toFixed(2)}
                                {hasBreakActive && <span style={{fontSize:9,color:'#5B8AF0',background:'#EEF2FF',borderRadius:4,padding:'1px 5px',fontWeight:700}}>break</span>}
                              </div>
                              {hasBreakActive && <div style={{fontSize:9,color:'#9CA3AF',marginTop:1}}>base ${parseFloat(o.price).toFixed(2)}</div>}
                            </div>}
                            {total&&<div style={{flex:1,padding:'6px 12px'}}>
                              <div style={{fontSize:9,fontWeight:700,color:'#C4C9D4',textTransform:'uppercase',letterSpacing:'.05em'}}>Total</div>
                              <div style={{fontSize:12,fontWeight:700,color:'#1D9E75'}}>${total}</div>
                            </div>}
                            {o.dimensions&&<div style={{flex:1,padding:'6px 12px',borderLeft:'1px solid #F3F4F6'}}>
                              <div style={{fontSize:9,fontWeight:700,color:'#C4C9D4',textTransform:'uppercase',letterSpacing:'.05em'}}>Size</div>
                              <div style={{fontSize:12,fontWeight:700,color:'#374151'}}>{o.dimensions}</div>
                            </div>}
                            {o.sku&&<div style={{flex:1,padding:'6px 12px',borderLeft:'1px solid #F3F4F6'}}>
                              <div style={{fontSize:9,fontWeight:700,color:'#C4C9D4',textTransform:'uppercase',letterSpacing:'.05em',marginBottom:2}}>SKU</div>
                              <div style={{fontSize:12,fontWeight:600,color:'#374151',display:'flex',alignItems:'center',gap:5}}>
                                {o.sku}
                                <CopyBtn text={o.sku} label="SKU" />
                              </div>
                            </div>}
                          </div>
                          {o.notes&&<div style={{padding:'4px 12px 8px',fontSize:11,color:'#9CA3AF',fontStyle:'italic'}}>{o.notes}</div>}
                        </div>
                      )
                    })}
                  </div>
                </div>
              ))}
            </div>
          )
        })()
      }

      {!loading && orders.length===0 && !selected && (
        <div style={{textAlign:'center',padding:'20px 0',color:'#9CA3AF',fontSize:13}}>
          Search for a material above to add it to the order sheet
        </div>
      )}

      {/* PO Number modal */}
      {poModal && (
        <POModal
          jobNumber={jobNumber}
          existingPO={poModal.existingPO}
          onConfirm={po => { applyStatusChange(poModal.orderId, 'Ordered', po); setPoModal(null) }}
          onCancel={() => setPoModal(null)}
        />
      )}

      {/* Step-through Add All queue */}
      {addQueue && (
        <AddAllQueueModal
          queue={addQueue}
          unitOptions={unitOptions}
          onSaveItem={saveQueueItem}
          onAdvance={() => {
            setAddQueue(q => {
              if (!q) return null
              const nextIndex = q.index + 1
              if (nextIndex >= q.items.length) {
                toast(`${q.items.length} material${q.items.length!==1?'s':''} added ✓`)
                return null
              }
              return { ...q, index: nextIndex }
            })
          }}
          onSkip={() => {
            setAddQueue(q => {
              if (!q) return null
              const nextIndex = q.index + 1
              if (nextIndex >= q.items.length) return null
              return { ...q, index: nextIndex }
            })
          }}
          onClose={() => setAddQueue(null)}
        />
      )}
    </div>
  )
}

// ── Step-through "Add all" modal ────────────────────────────────────
function AddAllQueueModal({ queue, unitOptions, onSaveItem, onAdvance, onSkip, onClose }) {
  const material = queue.items[queue.index]
  const [qty, setQty] = useState('')
  const [unit, setUnit] = useState('pcs')
  const [saving, setSaving] = useState(false)
  const inputRef = useRef()

  useEffect(() => {
    setQty('')
    setUnit('pcs')
    setTimeout(() => inputRef.current?.focus(), 50)
  }, [queue.index])

  async function handleSave() {
    setSaving(true)
    const ok = await onSaveItem(material, qty, unit)
    setSaving(false)
    if (ok) onAdvance()
  }

  if (!material) return null

  return (
    <div style={{ position:'fixed', inset:0, zIndex:9999, background:'rgba(0,0,0,0.5)', display:'flex', alignItems:'center', justifyContent:'center', padding:16 }}>
      <div style={{ background:'#fff', borderRadius:16, width:'100%', maxWidth:380, boxShadow:'0 20px 60px rgba(0,0,0,0.25)', overflow:'hidden' }}>
        <div style={{ padding:'14px 18px', borderBottom:'1px solid #F3F4F6', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
          <div style={{ fontSize:12, fontWeight:700, color:'#5B8AF0' }}>
            Adding {queue.index + 1} of {queue.items.length}
          </div>
          <button onClick={onClose} style={{ background:'none', border:'none', cursor:'pointer', color:'#9CA3AF', fontSize:20, lineHeight:1 }}>×</button>
        </div>

        {/* Progress bar */}
        <div style={{ height:3, background:'#F3F4F6' }}>
          <div style={{ height:'100%', width:`${((queue.index)/queue.items.length)*100}%`, background:'#5B8AF0', transition:'width .2s' }} />
        </div>

        <div style={{ padding:20 }}>
          {/* Material preview */}
          <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:18 }}>
            {material.storage_path
              ? <img src={pubUrl(material.storage_path)} style={{ width:44,height:44,borderRadius:9,objectFit:'cover',flexShrink:0,border:'1px solid #E8ECF0' }} alt="" />
              : <div style={{ width:44,height:44,borderRadius:9,background:material.color||'#E8ECF0',flexShrink:0 }} />
            }
            <div style={{ minWidth:0 }}>
              <div style={{ fontSize:14, fontWeight:700, color:'#2A3042', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{material.name}</div>
              <div style={{ fontSize:11, color:'#9CA3AF', marginTop:1 }}>
                {[material.supplier, material.panel_type, material.thickness?material.thickness+'mm':null, material.finish].filter(Boolean).join(' · ')}
              </div>
            </div>
          </div>

          {/* Qty + unit */}
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10, marginBottom:18 }}>
            <div>
              <label style={{ fontSize:11, fontWeight:700, color:'#6B7280', display:'block', marginBottom:4 }}>Quantity</label>
              <input ref={inputRef} type="number" min="0" value={qty}
                onChange={e=>setQty(e.target.value)}
                onKeyDown={e=>{ if(e.key==='Enter') handleSave() }}
                placeholder="0"
                style={{ width:'100%', padding:'9px 12px', border:'1px solid #DDE3EC', borderRadius:9, fontSize:14, fontWeight:600, outline:'none', boxSizing:'border-box' }} />
            </div>
            <div>
              <label style={{ fontSize:11, fontWeight:700, color:'#6B7280', display:'block', marginBottom:4 }}>Unit</label>
              <select value={unit} onChange={e=>setUnit(e.target.value)}
                style={{ width:'100%', padding:'9px 10px', border:'1px solid #DDE3EC', borderRadius:9, fontSize:14, outline:'none', background:'#fff', boxSizing:'border-box' }}>
                {unitOptions.map(u=><option key={u} value={u}>{u}</option>)}
              </select>
            </div>
          </div>

          <div style={{ display:'flex', gap:8 }}>
            <button onClick={onSkip}
              style={{ padding:'10px 14px', borderRadius:10, border:'1px solid #E8ECF0', background:'#fff', color:'#6B7280', fontSize:13, fontWeight:600, cursor:'pointer' }}>
              Skip
            </button>
            <button onClick={handleSave} disabled={saving}
              style={{ flex:1, padding:'10px', borderRadius:10, border:'none', background:'#5B8AF0', color:'#fff', fontSize:13, fontWeight:700, cursor:'pointer' }}>
              {saving ? 'Saving…' : queue.index + 1 === queue.items.length ? 'Save & finish' : 'Save & next →'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

export default function RoomDetail({ room: initialRoom, jobId, jobMats, allAppliances, allCats = [], onClose, onSave, onSyncJobTasks, inline=false }) {
  const toast = useToast()
  const { profile } = useApp()
  const navigate = useNavigate()
  const [room, setRoom]       = useState(initialRoom)
  const [roomMats, setRoomMats] = useState([])
  const [viewMaterial, setViewMaterial] = useState(null)
  const [roomApps, setRoomApps] = useState([])
  const [dirty, setDirty]     = useState(false)
  const [saving, setSaving]   = useState(false)
  const [tab, setTab]         = useState('overview')
  const [newTask, setNewTask] = useState({ title:'', date:'', time:'', priority:'Medium' })
  const [addingTask, setAddingTask] = useState(false)
  const [appSearch, setAppSearch] = useState('')
  const [matSearch, setMatSearch] = useState('')
  const saveTimer = useRef()

  const specs = room.kitchen_specs
    ? (typeof room.kitchen_specs === 'string' ? JSON.parse(room.kitchen_specs) : room.kitchen_specs)
    : {}

  useEffect(() => {
    Promise.all([
      supabase.from('room_materials').select('*,materials(*)').eq('room_id', room.id),
      supabase.from('room_appliances').select('*,appliances(*)').eq('room_id', room.id),
    ]).then(async ([{data:rm},{data:ra}]) => {
      // Enrich material names using auto-name settings
      const enriched = await Promise.all((rm||[]).map(async row => {
        if (!row.materials) return row
        const named = await enrichMaterialNames([row.materials])
        return { ...row, materials: named[0] }
      }))
      setRoomMats(enriched)
      setRoomApps(ra||[])
    })
  }, [room.id])

  function markDirty() { setDirty(true) }

  function setSpec(key, val) {
    const updated = { ...specs, [key]: val }
    setRoom(r => ({ ...r, kitchen_specs: JSON.stringify(updated) }))
    markDirty()
    clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(() => saveRoom({ ...room, kitchen_specs: JSON.stringify(updated) }), 800)
  }

  function setField(key, val) {
    setRoom(r => ({ ...r, [key]: val }))
    markDirty()
    clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(() => saveRoom({ ...room, [key]: val }), 1000)
  }

  // Notes gets its own local state to prevent cursor jumping on auto-save
  const [localNotes, setLocalNotes] = useState(room.notes || '')
  const notesTimer = useRef()
  // Sync if room.notes changes externally (e.g. initial load)
  useEffect(() => { setLocalNotes(room.notes || '') }, [room.id])

  async function saveRoom(data = room) {
    setSaving(true)
    const { error } = await supabase.from('rooms')
      .update({ name: data.name, type: data.type, notes: data.notes, kitchen_specs: data.kitchen_specs, tasks: data.tasks, sort_order: data.sort_order })
      .eq('id', data.id)
    if (error) toast(error.message, 'error')
    else { setDirty(false); onSave(data) }
    setSaving(false)
  }

  // Tasks
  const tasks = room.tasks ? (typeof room.tasks==='string'?JSON.parse(room.tasks):room.tasks) : []
  function saveTasks(updated) {
    const r = { ...room, tasks: JSON.stringify(updated) }
    setRoom(r)
    supabase.from('rooms').update({ tasks: JSON.stringify(updated) }).eq('id', room.id)
    if (onSave) onSave(r)
    if (onSyncJobTasks) onSyncJobTasks(room.id, room.name, updated)
    window.dispatchEvent(new CustomEvent('tasks-updated', { detail: { roomId: room.id } }))
  }
  function toggleTask(tid) {
    saveTasks(tasks.map(t => t.id===tid ? {
      ...t, done:!t.done,
      completed_by: !t.done ? (profile?.full_name||profile?.email||'Unknown') : null,
      completed_at: !t.done ? new Date().toISOString() : null,
    } : t))
  }
  function addTask() {
    if (!newTask.title.trim()) return
    saveTasks([...tasks, { id:Date.now().toString(), ...newTask, done:false }])
    setNewTask({ title:'', date:'', time:'' }); setAddingTask(false)
  }
  function deleteTask(tid) { saveTasks(tasks.filter(t=>t.id!==tid)) }

  // Materials
  async function addMat(mat) {
    const { data, error } = await supabase.from('room_materials').insert({ room_id:room.id, material_id:mat.id }).select('*,materials(*)').single()
    if (error) { toast(error.message,'error'); return }
    setRoomMats(p=>[...p,data])
    toast(`${mat.name} added ✓`)
  }
  async function removeMat(id) {
    await supabase.from('room_materials').delete().eq('id',id)
    setRoomMats(p=>p.filter(m=>m.id!==id))
  }

  // Appliances
  async function addApp(app) {
    const { data, error } = await supabase.from('room_appliances').insert({ room_id:room.id, appliance_id:app.id }).select('*,appliances(*)').single()
    if (error) { toast(error.message,'error'); return }
    setRoomApps(p=>[...p,data]); setAppSearch('')
    toast(`${app.brand} ${app.model} added ✓`)
  }
  async function removeApp(id) {
    await supabase.from('room_appliances').delete().eq('id',id)
    setRoomApps(p=>p.filter(a=>a.id!==id))
  }

  const specGroups = KITCHEN_SPEC_FIELDS.reduce((acc,f)=>{ (acc[f.group]=acc[f.group]||[]).push(f); return acc },{})

  const [variationCount, setVariationCount] = React.useState(0)

  // Load variation count for badge display
  React.useEffect(() => {
    if (!room?.id) return
    supabase.from('room_variations').select('id', { count:'exact', head:true }).eq('room_id', room.id)
      .then(({ count }) => setVariationCount(count || 0))
  }, [room?.id])

  const TABS = [
    { key:'overview',   label:'Overview' },
    { key:'specs',      label:'Specs' },
    { key:'tasks',      label:`Tasks${tasks.filter(t=>!t.done).length>0?` (${tasks.filter(t=>!t.done).length})`:''}` },
    { key:'materials',  label:`Materials${roomMats.length>0?` (${roomMats.length})`:''}` },
    { key:'appliances', label:`Appliances${roomApps.length>0?` (${roomApps.length})`:''}` },
    { key:'files',      label:'📁 Files' },
    { key:'orders',     label:'📋 Orders' },
    { key:'variations', label: variationCount > 0 ? `🔴 VO (${variationCount})` : '📝 Variations' },
    { key:'rfi',        label:'🗒 RFI' },
    { key:'onsite',     label:'📸 On-Site' },
  ]

  const filteredApps = allAppliances.filter(a =>
    !appSearch || `${a.brand} ${a.model} ${a.type}`.toLowerCase().includes(appSearch.toLowerCase())
  ).slice(0,8)
  const alreadyAddedAppIds = roomApps.map(ra=>ra.appliance_id)
  // All job materials not yet added to this room
  const filteredMats = jobMats.filter(jm => {
    if (!jm.materials) return false
    return !roomMats.some(rm => rm.material_id === jm.material_id)
  }).filter(jm => !roomMats.some(rm=>rm.material_id===jm.material_id))

  const innerStyle = inline
    ? { background:'#fff', display:'flex', flexDirection:'column', borderRadius:0 }
    : { position:'relative', width:'min(640px,100vw)', height:'100%', background:'#F0F2F5', boxShadow:'-8px 0 40px rgba(0,0,0,0.18)', display:'flex', flexDirection:'column', pointerEvents:'all', zIndex:1, overflow:'hidden' }

  return (
    <div style={ inline ? {} : { position:'fixed', inset:0, zIndex:400, display:'flex', justifyContent:'flex-end', pointerEvents:'none' }}>
      {!inline && <div style={{ position:'absolute', inset:0, background:'rgba(0,0,0,0.35)', pointerEvents:'all' }} onClick={onClose} />}
      <div style={innerStyle}>

        {/* header — clean light style for inline, dark for panel */}
        {inline ? (
          <div style={{ padding:'12px 16px', background:'#F9FAFB', borderBottom:'1px solid #E8ECF0', flexShrink:0 }}>
            <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:10 }}>
              <div style={{ flex:1, minWidth:0 }}>
                <input value={room.name} onChange={e=>setField('name',e.target.value)}
                  style={{ background:'none', border:'none', outline:'none', fontSize:15, fontWeight:700, color:'#2A3042', width:'100%', fontFamily:'inherit', padding:0 }} />
              </div>
              <div style={{ display:'flex', gap:8, alignItems:'center' }}>
                <select value={room.type||'Kitchen'} onChange={e=>setField('type',e.target.value)}
                  style={{ fontSize:11, fontWeight:600, padding:'4px 10px', borderRadius:8, border:'1px solid #E8ECF0', background:'#fff', color:'#6B7280', cursor:'pointer', outline:'none' }}>
                  {ROOM_TYPES.map(t=><option key={t} value={t}>{t}</option>)}
                </select>
                {(dirty||saving) && (
                  <button onClick={()=>saveRoom()} disabled={saving}
                    style={{ fontSize:12, fontWeight:700, padding:'5px 12px', borderRadius:8, border:'none', background:'#5B8AF0', color:'#fff', cursor:'pointer' }}>
                    {saving?'Saving…':'Save'}
                  </button>
                )}
              </div>
            </div>
            {/* tabs inline style */}
            <ScrollableTabs tabs={TABS} activeTab={tab} onSelect={setTab} />
          </div>
        ) : (
          <>
          <div style={{ background:'#2A3042', padding:'14px 20px', flexShrink:0 }}>
            <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:8 }}>
              <span style={{ fontSize:20 }}>🏠</span>
              <div style={{ flex:1, minWidth:0 }}>
                <input value={room.name} onChange={e=>setField('name',e.target.value)}
                  style={{ background:'none', border:'none', outline:'none', fontSize:17, fontWeight:800, color:'#fff', width:'100%', fontFamily:'inherit' }} />
              </div>
              <div style={{ display:'flex', gap:8, alignItems:'center' }}>
                {(dirty||saving) && (
                  <button onClick={()=>saveRoom()} disabled={saving}
                    style={{ fontSize:12, fontWeight:700, padding:'5px 12px', borderRadius:8, border:'none', background:'#5B8AF0', color:'#fff', cursor:'pointer' }}>
                    {saving?'Saving…':'Save'}
                  </button>
                )}
                <button onClick={onClose} style={{ background:'rgba(255,255,255,0.15)', border:'none', cursor:'pointer', color:'#fff', width:28, height:28, borderRadius:7, fontSize:18, display:'flex', alignItems:'center', justifyContent:'center' }}>×</button>
              </div>
            </div>
            <select value={room.type||'Kitchen'} onChange={e=>setField('type',e.target.value)}
              style={{ fontSize:11, fontWeight:600, padding:'4px 10px', borderRadius:8, border:'1px solid rgba(255,255,255,0.2)', background:'rgba(255,255,255,0.12)', color:'rgba(255,255,255,0.85)', cursor:'pointer', outline:'none' }}>
              {ROOM_TYPES.map(t=><option key={t} value={t}>{t}</option>)}
            </select>
          </div>
          <div style={{ display:'flex', alignItems:'center', gap:4, padding:'8px 12px', background:'#fff', borderBottom:'1px solid #E8ECF0', flexShrink:0 }}>
            <ScrollableTabs tabs={TABS} activeTab={tab} onSelect={setTab} dark={false} />
          </div>
          </>
        )}

        {/* content */}
        <div style={{ flex:1, overflowY: inline ? 'visible' : 'auto', padding:'16px' }}>

          {/* ── OVERVIEW ── */}
          {tab==='overview' && (
            <div>
              <div style={{ background:'#fff', borderRadius:12, border:'1px solid #E8ECF0', padding:16, marginBottom:12 }}>
                <div style={{ fontSize:11, fontWeight:700, color:'#9CA3AF', textTransform:'uppercase', letterSpacing:'.05em', marginBottom:8 }}>Notes</div>
                <textarea value={localNotes}
                  onChange={e => {
                    const val = e.target.value
                    setLocalNotes(val)
                    // Update room state and debounce save — but don't let save overwrite local state
                    setRoom(r => ({ ...r, notes: val }))
                    markDirty()
                    clearTimeout(notesTimer.current)
                    notesTimer.current = setTimeout(() => {
                      saveRoom({ ...room, notes: val })
                    }, 1500)
                  }}
                  onBlur={e => {
                    // Save immediately on blur
                    clearTimeout(notesTimer.current)
                    const val = e.target.value
                    setRoom(r => ({ ...r, notes: val }))
                    saveRoom({ ...room, notes: val })
                  }}
                  placeholder="Room notes, observations, specs…"
                  style={{ width:'100%', border:'none', outline:'none', fontSize:13, color:'#374151', resize:'vertical', minHeight:80, fontFamily:'inherit', background:'transparent', lineHeight:1.6, boxSizing:'border-box' }} />
              </div>
              {/* summary cards */}
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 }}>
                <div onClick={()=>setTab('tasks')} style={{ background:'#fff', borderRadius:12, border:'1px solid #E8ECF0', padding:'14px 16px', cursor:'pointer' }}
                  onMouseEnter={e=>e.currentTarget.style.borderColor='#C4D4F8'} onMouseLeave={e=>e.currentTarget.style.borderColor='#E8ECF0'}>
                  <div style={{ fontSize:11, fontWeight:700, color:'#9CA3AF', textTransform:'uppercase', letterSpacing:'.05em', marginBottom:4 }}>Tasks</div>
                  <div style={{ fontSize:22, fontWeight:800, color:'#2A3042' }}>{tasks.filter(t=>!t.done).length}<span style={{ fontSize:13, fontWeight:500, color:'#9CA3AF' }}>/{tasks.length}</span></div>
                  <div style={{ fontSize:11, color:'#9CA3AF' }}>outstanding</div>
                </div>
                <div onClick={()=>setTab('materials')} style={{ background:'#fff', borderRadius:12, border:'1px solid #E8ECF0', padding:'14px 16px', cursor:'pointer' }}
                  onMouseEnter={e=>e.currentTarget.style.borderColor='#C4D4F8'} onMouseLeave={e=>e.currentTarget.style.borderColor='#E8ECF0'}>
                  <div style={{ fontSize:11, fontWeight:700, color:'#9CA3AF', textTransform:'uppercase', letterSpacing:'.05em', marginBottom:4 }}>Materials</div>
                  <div style={{ fontSize:22, fontWeight:800, color:'#2A3042' }}>{roomMats.length}</div>
                  <div style={{ fontSize:11, color:'#9CA3AF' }}>assigned</div>
                </div>
                <div onClick={()=>setTab('appliances')} style={{ background:'#fff', borderRadius:12, border:'1px solid #E8ECF0', padding:'14px 16px', cursor:'pointer' }}
                  onMouseEnter={e=>e.currentTarget.style.borderColor='#C4D4F8'} onMouseLeave={e=>e.currentTarget.style.borderColor='#E8ECF0'}>
                  <div style={{ fontSize:11, fontWeight:700, color:'#9CA3AF', textTransform:'uppercase', letterSpacing:'.05em', marginBottom:4 }}>Appliances</div>
                  <div style={{ fontSize:22, fontWeight:800, color:'#2A3042' }}>{roomApps.length}</div>
                  <div style={{ fontSize:11, color:'#9CA3AF' }}>in this room</div>
                </div>
                <div onClick={()=>setTab('specs')} style={{ background:'#fff', borderRadius:12, border:'1px solid #E8ECF0', padding:'14px 16px', cursor:'pointer' }}
                  onMouseEnter={e=>e.currentTarget.style.borderColor='#C4D4F8'} onMouseLeave={e=>e.currentTarget.style.borderColor='#E8ECF0'}>
                  <div style={{ fontSize:11, fontWeight:700, color:'#9CA3AF', textTransform:'uppercase', letterSpacing:'.05em', marginBottom:4 }}>Specs</div>
                  <div style={{ fontSize:22, fontWeight:800, color:'#2A3042' }}>{Object.keys(specs).filter(k=>specs[k]).length}</div>
                  <div style={{ fontSize:11, color:'#9CA3AF' }}>dimensions set</div>
                </div>
                <div onClick={()=>setTab('variations')} style={{ background: variationCount>0?'#FEF2F2':'#fff', borderRadius:12, border:`1px solid ${variationCount>0?'#FCA5A5':'#E8ECF0'}`, padding:'14px 16px', cursor:'pointer' }}
                  onMouseEnter={e=>e.currentTarget.style.borderColor='#FCA5A5'} onMouseLeave={e=>e.currentTarget.style.borderColor=variationCount>0?'#FCA5A5':'#E8ECF0'}>
                  <div style={{ display:'flex', alignItems:'center', gap:6, marginBottom:4 }}>
                    <div style={{ fontSize:11, fontWeight:700, color:'#9CA3AF', textTransform:'uppercase', letterSpacing:'.05em' }}>Variations</div>
                    {variationCount > 0 && <span style={{ fontSize:10, fontWeight:800, padding:'1px 6px', borderRadius:5, background:'#E24B4A', color:'#fff' }}>VO</span>}
                  </div>
                  <div style={{ fontSize:22, fontWeight:800, color: variationCount>0?'#E24B4A':'#2A3042' }}>{variationCount}</div>
                  <div style={{ fontSize:11, color:'#9CA3AF' }}>recorded</div>
                </div>
              </div>
            </div>
          )}

          {/* ── SPECS ── */}
          {tab==='specs' && (
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:16 }}>
              {Object.entries(specGroups).map(([group, fields])=>(
                <div key={group} style={{ background:'#fff', borderRadius:0, overflow:'hidden' }}>
                  <div style={{ padding:'10px 16px 8px', background:'#fff' }}>
                    <span style={{ fontSize:11, fontWeight:700, color:'#1D1D1D', textTransform:'uppercase', letterSpacing:'.08em' }}>{group}</span>
                  </div>
                  <div style={{ border:'1px solid #E8E8E8', borderRadius:4, overflow:'hidden' }}>
                    {fields.map((f, i)=>(
                      <div key={f.key} style={{ background: i%2===0 ? '#F5F5F5' : '#fff' }}>
                        <SpecRow label={f.label} value={specs[f.key]||''} unit={f.unit||'mm'} onChange={v=>setSpec(f.key,v)} />
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* ── TASKS ── */}
          {tab==='tasks' && (
            <div>
              <div style={{ marginBottom:12 }}>
                {tasks.length===0
                  ? <div style={{ textAlign:'center', padding:'24px 0', color:'#9CA3AF', fontSize:13 }}>No tasks yet</div>
                  : tasks.map(t=><TaskRow key={t.id} task={t} onToggle={()=>toggleTask(t.id)} onDelete={()=>deleteTask(t.id)} onUpdate={(field,val)=>saveTasks(tasks.map(x=>x.id===t.id?{...x,[field]:val}:x))} />)
                }
              </div>
              {addingTask ? (
                <div style={{ background:'#fff', borderRadius:10, border:'1px solid #E8ECF0', padding:12 }}>
                  <input autoFocus value={newTask.title} onChange={e=>setNewTask(p=>({...p,title:e.target.value}))}
                    onKeyDown={e=>e.key==='Enter'&&addTask()}
                    placeholder="Task title…"
                    style={{ width:'100%', border:'none', borderBottom:'1px solid #E8ECF0', outline:'none', fontSize:13, marginBottom:10, fontFamily:'inherit', paddingBottom:8, boxSizing:'border-box' }} />
                  {/* Priority */}
                  <div style={{ marginBottom:10 }}>
                    <div style={{ fontSize:10, fontWeight:600, color:'#9CA3AF', textTransform:'uppercase', letterSpacing:'.05em', marginBottom:4 }}>Priority</div>
                    <div style={{ display:'flex', gap:6 }}>
                      {['High','Medium','Low'].map(p => {
                        const ps = {High:{bg:'#FEF2F2',color:'#E24B4A',border:'#FCA5A5'},Medium:{bg:'#FFF7ED',color:'#C2410C',border:'#FED7AA'},Low:{bg:'#F0FDF4',color:'#166534',border:'#86EFAC'}}[p]
                        const active = (newTask.priority||'Medium') === p
                        return (
                          <button key={p} onClick={()=>setNewTask(x=>({...x,priority:p}))}
                            style={{ padding:'4px 12px', borderRadius:7, border:`1px solid ${active?ps.border:'#E8ECF0'}`, background:active?ps.bg:'#fff', color:active?ps.color:'#9CA3AF', fontSize:11, fontWeight:700, cursor:'pointer' }}>
                            {p}
                          </button>
                        )
                      })}
                    </div>
                  </div>
                  <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8, marginBottom:10 }}>
                    <div>
                      <div style={{ fontSize:10, fontWeight:600, color:'#9CA3AF', textTransform:'uppercase', letterSpacing:'.05em', marginBottom:4 }}>Due date</div>
                      <div style={{ position:'relative', display:'flex', alignItems:'center' }}>
                        <svg style={{ position:'absolute', left:8, pointerEvents:'none', color:'#9CA3AF' }} width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
                        <input type="date" value={newTask.date||''} onChange={e=>setNewTask(p=>({...p,date:e.target.value}))}
                          style={{ width:'100%', fontSize:13, border:'1px solid #E8ECF0', borderRadius:7, padding:'7px 8px 7px 28px', outline:'none', boxSizing:'border-box', background:'#fff', WebkitAppearance:'none', appearance:'none' }} />
                      </div>
                    </div>
                    <div>
                      <div style={{ fontSize:10, fontWeight:600, color:'#9CA3AF', textTransform:'uppercase', letterSpacing:'.05em', marginBottom:4 }}>Time</div>
                      <div style={{ position:'relative', display:'flex', alignItems:'center' }}>
                        <svg style={{ position:'absolute', left:8, pointerEvents:'none', color:'#9CA3AF' }} width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
                        <input type="time" value={newTask.time||''} onChange={e=>setNewTask(p=>({...p,time:e.target.value}))}
                          style={{ width:'100%', fontSize:13, border:'1px solid #E8ECF0', borderRadius:7, padding:'7px 8px 7px 28px', outline:'none', boxSizing:'border-box', background:'#fff', WebkitAppearance:'none', appearance:'none' }} />
                      </div>
                    </div>
                  </div>
                  <div style={{ display:'flex', gap:8 }}>
                    <button onClick={addTask} style={{ flex:1, fontSize:13, fontWeight:700, padding:'8px', borderRadius:8, border:'none', background:'#5B8AF0', color:'#fff', cursor:'pointer' }}>Add task</button>
                    <button onClick={()=>{ setAddingTask(false); setNewTask({title:'',date:'',time:'',priority:'Medium'}) }} style={{ fontSize:13, padding:'8px 14px', borderRadius:8, border:'1px solid #E8ECF0', background:'#fff', cursor:'pointer', color:'#6B7280' }}>Cancel</button>
                  </div>
                </div>
              ) : (
                <button onClick={()=>setAddingTask(true)} style={{ fontSize:13, fontWeight:600, padding:'8px 16px', borderRadius:9, border:'1px dashed #C4D4F8', background:'#F0F4FF', color:'#5B8AF0', cursor:'pointer', width:'100%' }}>
                  + Add task
                </button>
              )}
            </div>
          )}

          {/* ── MATERIALS ── */}
          {tab==='materials' && (
            <RoomMaterialsTab
              roomMats={roomMats} filteredMats={filteredMats} jobMats={jobMats}
              onAdd={jm=>addMat(jm.materials)} onRemove={removeMat}
              allCats={allCats} onViewMaterial={setViewMaterial}
              jobId={jobId} roomId={room.id}
            />
          )}

          {/* ── APPLIANCES ── */}
          {tab==='appliances' && (
            <div>
              <div style={{ marginBottom:10 }}>
                <input value={appSearch} onChange={e=>setAppSearch(e.target.value)}
                  placeholder="Search appliances to add…"
                  style={{ width:'100%', padding:'8px 12px', border:'1px solid #DDE3EC', borderRadius:9, fontSize:13, outline:'none', boxSizing:'border-box' }} />
                {appSearch && filteredApps.filter(a=>!alreadyAddedAppIds.includes(a.id)).length>0 && (
                  <div style={{ background:'#fff', border:'1px solid #E8ECF0', borderRadius:10, boxShadow:'0 8px 24px rgba(0,0,0,0.1)', marginTop:4, overflow:'hidden' }}>
                    {filteredApps.filter(a=>!alreadyAddedAppIds.includes(a.id)).map(a=>(
                      <div key={a.id} onClick={()=>addApp(a)}
                        style={{ display:'flex', alignItems:'center', gap:10, padding:'8px 12px', cursor:'pointer', fontSize:13 }}
                        onMouseEnter={e=>e.currentTarget.style.background='#F9FAFB'}
                        onMouseLeave={e=>e.currentTarget.style.background='transparent'}>
                        {a.image_path
                          ? <img src={pubUrl(a.image_path)} style={{ width:28,height:28,borderRadius:6,objectFit:'contain',background:'#F9FAFB' }} alt="" />
                          : <div style={{ width:28,height:28,borderRadius:6,background:'#F3F4F6',display:'flex',alignItems:'center',justifyContent:'center',fontSize:14 }}>🔌</div>
                        }
                        <div>
                          <div style={{ fontWeight:600,color:'#2A3042' }}>{a.brand} {a.model}</div>
                          <div style={{ fontSize:11,color:'#9CA3AF' }}>{a.type}{a.width?` · ${a.width}×${a.height}×${a.depth}mm`:''}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
              {roomApps.length===0
                ? <div style={{ textAlign:'center', padding:'24px 0', color:'#9CA3AF', fontSize:13 }}>No appliances — search above to add</div>
                : roomApps.map(ra=>{
                    const a=ra.appliances; if(!a) return null
                    const dims = [
                      a.width  ? { label:'Width',          val:`${a.width}mm` }  : null,
                      a.height ? { label:'Height',         val:`${a.height}mm` } : null,
                      a.depth  ? { label:'Depth',          val:`${a.depth}mm` }  : null,
                      a.cutout_width  ? { label:'Cutout width',  val:`${a.cutout_width}mm` }  : null,
                      a.cutout_height ? { label:'Cutout height', val:`${a.cutout_height}mm` } : null,
                      a.cutout_depth  ? { label:'Cutout depth',  val:`${a.cutout_depth}mm` }  : null,
                    ].filter(Boolean)
                    return (
                      <div key={ra.id} style={{ marginBottom:14 }}>
                        {/* header */}
                        <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:8 }}>
                          {a.image_path
                            ? <img src={pubUrl(a.image_path)} style={{ width:36,height:36,borderRadius:6,objectFit:'contain',background:'#F9FAFB',flexShrink:0,border:'1px solid #E8ECF0' }} alt="" />
                            : <div style={{ width:36,height:36,borderRadius:6,background:'#F3F4F6',display:'flex',alignItems:'center',justifyContent:'center',fontSize:18,flexShrink:0 }}>🔌</div>
                          }
                          <div style={{ flex:1 }}>
                            <div style={{ fontSize:13,fontWeight:700,color:'#1D1D1D' }}>{a.brand} {a.model}</div>
                            <div style={{ fontSize:11,color:'#9CA3AF' }}>{a.type}</div>
                          </div>
                          <button onClick={()=>removeApp(ra.id)} style={{ background:'none',border:'none',cursor:'pointer',color:'#D1D5DB',fontSize:18,lineHeight:1 }}
                            onMouseEnter={e=>e.currentTarget.style.color='#E24B4A'} onMouseLeave={e=>e.currentTarget.style.color='#D1D5DB'}>×</button>
                        </div>
                        {/* spec table */}
                        {dims.length > 0 && (
                          <div style={{ border:'1px solid #E8E8E8', borderRadius:4, overflow:'hidden' }}>
                            {dims.map((d,i)=>(
                              <div key={d.label} style={{ display:'flex', alignItems:'center', padding:'9px 16px', background:i%2===0?'#F5F5F5':'#fff', borderBottom:i<dims.length-1?'1px solid #EFEFEF':'none' }}>
                                <span style={{ flex:1, fontSize:13, color:'#374151' }}>{d.label}</span>
                                <span style={{ fontSize:13, fontWeight:600, color:'#1D1D1D' }}>{d.val}</span>
                              </div>
                            ))}
                          </div>
                        )}
                        {a.notes && <div style={{ fontSize:11, color:'#9CA3AF', marginTop:6, fontStyle:'italic', padding:'0 4px' }}>{a.notes}</div>}
                      </div>
                    )
                  })
              }
            </div>
          )}
        {/* ── ORDERS ── */}
          {tab==='orders' && (
            <RoomOrdersTab room={room} jobId={jobId} jobMats={jobMats} roomMats={roomMats}
              allCats={allCats} onViewMaterial={setViewMaterial}
              onOpenFull={()=>{ onClose(); setTimeout(()=>navigate(`/job/${jobId}/orders?room=${room.id}`),150) }} />
          )}

        {/* ── VARIATIONS ── */}
          {tab==='variations' && (
            <RoomVariationsTab room={room} jobId={jobId}
              onVariationsChange={updated => setVariationCount(updated.length)} />
          )}

        {/* ── RFI ── */}
          {tab==='rfi' && (
            <RoomRFITab room={room} jobId={jobId} profile={profile} />
          )}

        {/* ── FILES ── */}
          {tab==='files' && (
            <RoomFilesTab room={room} jobId={jobId} />
          )}

          {tab==='onsite' && (
            <OnSite jobId={jobId} roomId={room.id} />
          )}

        </div>
      </div>
      {viewMaterial && (
        <MaterialDetailModal material={viewMaterial} onClose={() => setViewMaterial(null)} />
      )}
    </div>
  )
}
