import React, { useState, useEffect, useCallback, useRef } from 'react'
import ReactDOM from 'react-dom'
import { fmtDate, fmtDateLong, fmtDateTime, fmtTime } from '../lib/dates'
import { usePersistentState } from '../hooks/usePersistentState'
const fmtNZTime = dt => { const s = String(dt).endsWith('Z')||String(dt).includes('+') ? dt : dt+'Z'; const d = new Date(s), o = d.getUTCMonth()>=4&&d.getUTCMonth()<=8?12:13, n = new Date(d.getTime()+o*3600000), H = n.getUTCHours(); return n.getUTCDate()+' '+['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][n.getUTCMonth()]+', '+(H%12||12)+':'+String(n.getUTCMinutes()).padStart(2,'0')+' '+(H<12?'am':'pm') }

// ── NZ time formatter — module level, pure arithmetic, no Intl ────

import { useParams, useNavigate, useLocation } from 'react-router-dom'
import { supabase, BUCKET, pubUrl } from '../lib/supabase'
import { useApp } from '../context/AppContext'
import { useJobStatuses } from '../hooks/useJobStatuses'
import { useRoomStatuses } from '../hooks/useRoomStatuses'
import { cachedQuery } from '../hooks/useCache'
import { ClockInButton, BudgetBar, TimeHistory, fmtHours } from './ClockIn'
import { NoteEditor } from './Notes'
import RoomDetail from './RoomDetail'
import { ActiveProcessBanner } from './JobProcesses'
import { useToast } from '../components/Toast'
import BackButton from '../components/BackButton'
import NotionNotes from '../components/NotionNotes'
import InlineSpecBuilder from './InlineSpecBuilder'
import OnSite from './OnSite'
import DropZone from '../components/DropZone'
import StatusBadge from '../components/StatusBadge'
import { enrichMaterialNames } from '../lib/materialName'

// ── Room icon picker ──────────────────────────────────────────────
const ROOM_ICONS = [
  { label:'Kitchen',    icons:['🍳','🥘','🍽','🫕','☕','🧑‍🍳'] },
  { label:'Bathroom',   icons:['🚿','🛁','🪥','🪞','🚽','🧼'] },
  { label:'Bedroom',    icons:['🛏','🌙','🪟','🛋','🧸','💤'] },
  { label:'Living',     icons:['🛋','📺','🎮','🎵','🕯','🪴'] },
  { label:'Laundry',    icons:['🫧','👕','🧺','🪣','💧','🧹'] },
  { label:'Office',     icons:['💼','🖥','📋','📚','✏️','🖊'] },
  { label:'Outdoor',    icons:['🌿','🏡','🌳','⛺','🌻','🪵'] },
  { label:'Other',      icons:['🏠','🚪','🔑','📦','🛠','⭐'] },
]

function RoomIconBtn({ emoji, onPick }) {
  const [show, setShow] = React.useState(false)
  const [hovered, setHovered] = React.useState(false)
  const btnRef = React.useRef()
  const popRef = React.useRef()
  const [pos, setPos] = React.useState({ top:0, left:0 })

  React.useEffect(() => {
    if (!show) return
    const rect = btnRef.current?.getBoundingClientRect()
    if (rect) {
      const popHeight = 420 // approximate picker height
      const spaceBelow = window.innerHeight - rect.bottom
      const spaceAbove = rect.top
      const top = spaceBelow >= popHeight || spaceBelow >= spaceAbove
        ? rect.bottom + 6
        : rect.top - popHeight - 6
      const left = Math.min(rect.left, window.innerWidth - 270)
      setPos({ top, left })
    }
    function handleClick(e) {
      if (popRef.current && !popRef.current.contains(e.target) && !btnRef.current?.contains(e.target)) setShow(false)
    }
    setTimeout(() => document.addEventListener('mousedown', handleClick), 0)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [show])

  return (
    <>
      <div ref={btnRef}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        onClick={e => { e.stopPropagation(); setShow(s => !s) }}
        title="Change room icon"
        style={{ width:32, height:32, borderRadius:8, background:'#F0F4FF', display:'flex', alignItems:'center', justifyContent:'center', fontSize:16, flexShrink:0, cursor:'pointer', position:'relative', transition:'background .12s', ...(hovered || show ? { background:'#E0E7FF' } : {}) }}>
        {emoji}
        {(hovered || show) && (
          <div style={{ position:'absolute', bottom:-2, right:-2, width:14, height:14, borderRadius:'50%', background:'#5B8AF0', display:'flex', alignItems:'center', justifyContent:'center', fontSize:8, color:'#fff', fontWeight:700, border:'2px solid #fff', pointerEvents:'none' }}>✏</div>
        )}
      </div>
      {show && ReactDOM.createPortal(
        <div ref={popRef} onClick={e => e.stopPropagation()}
          style={{ position:'fixed', zIndex:9999, top:pos.top, left:pos.left, background:'#fff', borderRadius:14, boxShadow:'0 8px 32px rgba(0,0,0,0.18)', border:'1px solid #E8ECF0', padding:14, width:260, maxHeight:'70vh', overflowY:'auto' }}>
          <div style={{ fontSize:11, fontWeight:700, color:'#9CA3AF', textTransform:'uppercase', letterSpacing:'.06em', marginBottom:10 }}>Choose icon</div>
          {ROOM_ICONS.map(group => (
            <div key={group.label} style={{ marginBottom:10 }}>
              <div style={{ fontSize:10, fontWeight:600, color:'#C4C9D4', marginBottom:5, textTransform:'uppercase', letterSpacing:'.05em' }}>{group.label}</div>
              <div style={{ display:'flex', gap:4, flexWrap:'wrap' }}>
                {group.icons.map(ic => (
                  <button key={ic} onClick={() => { onPick(ic); setShow(false) }}
                    style={{ width:34, height:34, borderRadius:8, border: ic===emoji ? '2px solid #5B8AF0' : '1px solid #E8ECF0', background: ic===emoji ? '#EEF2FF' : '#F9FAFB', fontSize:18, cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', transition:'all .1s' }}
                    onMouseEnter={e=>{ e.currentTarget.style.background='#EEF2FF'; e.currentTarget.style.borderColor='#5B8AF0' }}
                    onMouseLeave={e=>{ if(ic!==emoji){ e.currentTarget.style.background='#F9FAFB'; e.currentTarget.style.borderColor='#E8ECF0' } }}>
                    {ic}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>,
        document.body
      )}
    </>
  )
}

const TODAY = new Date(); TODAY.setHours(0,0,0,0)
// Job statuses loaded dynamically from settings — see useJobStatuses hook

// Module-level cache — persists across navigations within the session
// so re-opening a job doesn't re-fetch the materials library
let _materialsCache = null
let _materialsCacheTime = 0
const TYPES    = ['Kitchen','Joinery','Laundry','Wardrobe','Other']

function dFromNow(dateStr, timeStr) {
  if (!dateStr) return null
  return (new Date(dateStr + 'T' + (timeStr || '09:00')) - new Date()) / 86400000
}

function DueBadge({ t }) {
  if (t.done) return <span className="text-[10px] px-1.5 py-0.5 rounded bg-[#F3F4F6] text-[#9CA3AF]">Done</span>
  if (!t.date) return null
  const d = dFromNow(t.date, t.time)
  const lbl = new Date(t.date).toLocaleDateString('en-NZ', { day:'numeric', month:'short' }) + (t.time ? ' ' + t.time : '')
  if (d < 0)  return <span className="text-[10px] px-1.5 py-0.5 rounded bg-red-50 text-red-700 font-medium">⚠ Overdue · {lbl}</span>
  if (d < 2)  return <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-50 text-amber-700">Due soon · {lbl}</span>
  return <span className="text-[10px] px-1.5 py-0.5 rounded bg-teal-50 text-teal-700">Due {lbl}</span>
}


// ── KITCHEN SPECS ──
const KITCHEN_FIELDS = [
  { key:'toe_kick_height',   label:'Toe kick height',          unit:'mm', group:'base' },
  { key:'base_height',       label:'Base cabinet height',      unit:'mm', group:'base' },
  { key:'base_depth',        label:'Base cabinet depth',       unit:'mm', group:'base' },
  { key:'upper_height',      label:'Upper cabinet height',     unit:'mm', group:'upper' },
  { key:'upper_depth',       label:'Upper cabinet depth',      unit:'mm', group:'upper' },
  { key:'tall_height',       label:'Tall cabinet height',      unit:'mm', group:'tall' },
  { key:'tall_depth',        label:'Tall cabinet depth',       unit:'mm', group:'tall' },
  { key:'bench_thickness',   label:'Benchtop thickness',       unit:'mm', group:'benchtop' },
  { key:'bench_material',    label:'Benchtop material',        unit:'',   group:'benchtop', text: true },
  { key:'bench_overhang_side',  label:'Overhang sides',        unit:'mm', group:'benchtop' },
  { key:'bench_overhang_front', label:'Overhang front',        unit:'mm', group:'benchtop' },
]

const GROUP_LABELS = {
  base:     { label:'Base cabinets',  color:'#5B8AF0', bg:'#EEF2FF' },
  upper:    { label:'Upper cabinets', color:'#1D9E75', bg:'#ECFDF5' },
  tall:     { label:'Tall cabinets',  color:'#EF9F27', bg:'#FEF3C7' },
  benchtop: { label:'Benchtop',       color:'#7F77DD', bg:'#F5F3FF' },
  materials:{ label:'Board materials', color:'#374151', bg:'#F9FAFB' },
}

// Material selector keys — map to friendly labels and which cabinet group they colour
const MAT_SELECTORS = [
  { key:'mat_carcase',      label:'Carcase material',          hint:'Interior box material', group:'carcase' },
  { key:'mat_base_face',    label:'Base finished faces',       hint:'Visible base doors/panels', group:'base' },
  { key:'mat_upper_face',   label:'Upper finished faces',      hint:'Visible upper doors/panels', group:'upper' },
  { key:'mat_tall_face',    label:'Tall finished faces',       hint:'Visible tall doors/panels', group:'tall' },
]

// ── Cabinet Illustration ──────────────────────────────────────────
function CabinetIllustration({ specs, materials }) {
  const p = specs || {}
  const W = 340 // SVG viewport width

  const toeKick   = Math.min(Math.max(parseFloat(p.toe_kick_height)||150, 50), 300)
  const baseH     = Math.min(Math.max(parseFloat(p.base_height)||720, 100), 1200)
  const baseD     = Math.min(Math.max(parseFloat(p.base_depth)||600, 100), 900)
  const upperH    = Math.min(Math.max(parseFloat(p.upper_height)||700, 100), 1200)
  const upperD    = Math.min(Math.max(parseFloat(p.upper_depth)||300, 100), 600)
  const tallH     = Math.min(Math.max(parseFloat(p.tall_height)||2100, 200), 3000)
  const tallD     = Math.min(Math.max(parseFloat(p.tall_depth)||600, 100), 900)
  const benchT    = Math.min(Math.max(parseFloat(p.bench_thickness)||20, 10), 80)
  const overFront = Math.min(Math.max(parseFloat(p.bench_overhang_front)||20, 0), 100)
  const overSide  = Math.min(Math.max(parseFloat(p.bench_overhang_side)||5, 0), 50)
  const gapBetween = 150 // gap between upper and bench in mm

  // total height = toeKick + base + bench + gap + upper
  const totalH = tallH // tall cabinet is always tallest
  const scale  = (W * 0.45) / totalH // px per mm — fit tall cab in ~45% of width

  const floorY = 20 + totalH * scale // SVG floor line y

  // colours from selected materials
  const getColor = (key, fallback) => {
    const matId = p[key]
    if (!matId) return fallback
    const mat = materials?.find(m => m.id === matId)
    return mat?.color || (mat?.storage_path ? null : fallback)
  }
  const getImg = (key) => {
    const matId = p[key]
    if (!matId) return null
    const mat = materials?.find(m => m.id === matId)
    return mat?.storage_path ? pubUrl(mat.storage_path) : null
  }

  const carcaseColor   = getColor('mat_carcase', '#D4C5A9')
  const baseFaceColor  = getColor('mat_base_face', '#B8A898')
  const upperFaceColor = getColor('mat_upper_face', '#C8B8A8')
  const tallFaceColor  = getColor('mat_tall_face', '#BCA898')
  const benchColor     = '#E8E4DE'

  // positions in SVG px (from top)
  const toeY     = floorY - toeKick * scale
  const baseTopY = toeY - baseH * scale
  const benchTopY = baseTopY - benchT * scale
  const upperBotY = benchTopY - gapBetween * scale
  const upperTopY = upperBotY - upperH * scale

  const tallTopY  = floorY - tallH * scale

  // widths
  const baseW  = baseD * scale
  const upperW = upperD * scale
  const tallW  = tallD * scale
  const benchW = baseW + overFront * scale + overSide * scale

  // x positions — base starts at left edge offset
  const leftPad = 30
  const baseX   = leftPad
  const benchX  = baseX - overSide * scale
  const upperX  = baseX + (baseW - upperW) / 2 // centred over base
  const tallX   = baseX + baseW + 20

  const totalW  = tallX + tallW + 20
  const svgW    = Math.max(totalW + leftPad, 240)
  const svgH    = floorY + 24

  const faceW = 10 * scale // visible face depth

  // Pattern id for texture
  const uid = 'cab'

  return (
    <div style={{ marginBottom:20 }}>
      <div style={{ fontSize:11, fontWeight:700, color:'#9CA3AF', textTransform:'uppercase', letterSpacing:'.08em', marginBottom:10 }}>
        Cabinet preview
      </div>
      <div style={{ background:'#F9FAFB', borderRadius:14, border:'2px solid #E8ECF0', overflow:'hidden', padding:'12px 8px 4px' }}>
        <svg width="100%" viewBox={`0 0 ${svgW} ${svgH}`} xmlns="http://www.w3.org/2000/svg" style={{ display:'block' }}>
          <defs>
            {/* carcase fill */}
            <pattern id={`${uid}-carcase`} patternUnits="userSpaceOnUse" width="6" height="6">
              <rect width="6" height="6" fill={carcaseColor || '#D4C5A9'} />
              <line x1="0" y1="6" x2="6" y2="0" stroke="rgba(0,0,0,0.06)" strokeWidth="0.8" />
            </pattern>
          </defs>

          {/* ── BASE CABINET ── */}
          {/* carcase body */}
          <rect x={baseX} y={baseTopY} width={baseW} height={baseH * scale}
            fill={`url(#${uid}-carcase)`} stroke="#9B8E82" strokeWidth="1" rx="2" />
          {/* toe kick */}
          <rect x={baseX + faceW} y={toeY} width={baseW - faceW} height={toeKick * scale}
            fill="#2A2A2A" stroke="#1a1a1a" strokeWidth="0.5" />
          {/* face overlay */}
          <rect x={baseX} y={baseTopY} width={faceW} height={baseH * scale}
            fill={baseFaceColor || '#B8A898'} stroke="#8A7E72" strokeWidth="1" rx="1" opacity="0.9" />
          {/* door lines on face */}
          <line x1={baseX+2} y1={baseTopY + (baseH*scale)*0.33} x2={baseX+faceW-2} y2={baseTopY + (baseH*scale)*0.33} stroke="rgba(0,0,0,0.15)" strokeWidth="0.5" />
          <line x1={baseX+2} y1={baseTopY + (baseH*scale)*0.66} x2={baseX+faceW-2} y2={baseTopY + (baseH*scale)*0.66} stroke="rgba(0,0,0,0.15)" strokeWidth="0.5" />

          {/* ── BENCHTOP ── */}
          <rect x={benchX} y={benchTopY} width={benchW} height={benchT * scale}
            fill={benchColor} stroke="#C4B89A" strokeWidth="1" rx="1" />
          {/* bench edge highlight */}
          <rect x={benchX} y={benchTopY} width={benchW} height={Math.max(2, benchT*scale*0.15)}
            fill="rgba(255,255,255,0.5)" rx="1" />

          {/* ── UPPER CABINET ── */}
          <rect x={upperX} y={upperTopY} width={upperW} height={upperH * scale}
            fill={`url(#${uid}-carcase)`} stroke="#9B8E82" strokeWidth="1" rx="2" />
          {/* face */}
          <rect x={upperX} y={upperTopY} width={faceW * 0.8} height={upperH * scale}
            fill={upperFaceColor || '#C8B8A8'} stroke="#8A7E72" strokeWidth="1" rx="1" opacity="0.9" />
          {/* shelf line */}
          <line x1={upperX+2} y1={upperTopY + (upperH*scale)*0.5} x2={upperX+upperW-2} y2={upperTopY + (upperH*scale)*0.5} stroke="rgba(0,0,0,0.1)" strokeWidth="0.5" />

          {/* ── TALL CABINET ── */}
          <rect x={tallX} y={tallTopY} width={tallW} height={tallH * scale}
            fill={`url(#${uid}-carcase)`} stroke="#9B8E82" strokeWidth="1" rx="2" />
          {/* face */}
          <rect x={tallX} y={tallTopY} width={faceW} height={tallH * scale}
            fill={tallFaceColor || '#BCA898'} stroke="#8A7E72" strokeWidth="1" rx="1" opacity="0.9" />
          {/* shelf lines */}
          {[0.25,0.5,0.75].map((p,i) => (
            <line key={i} x1={tallX+2} y1={tallTopY + tallH*scale*p} x2={tallX+tallW-2} y2={tallTopY + tallH*scale*p} stroke="rgba(0,0,0,0.1)" strokeWidth="0.5" />
          ))}

          {/* ── FLOOR LINE ── */}
          <line x1={0} y1={floorY} x2={svgW} y2={floorY} stroke="#C4C9D4" strokeWidth="1" strokeDasharray="4,3" />

          {/* ── DIMENSION ANNOTATIONS ── */}
          {/* base height */}
          <line x1={baseX-8} y1={toeY} x2={baseX-8} y2={baseTopY} stroke="#5B8AF0" strokeWidth="0.8" />
          <line x1={baseX-11} y1={toeY} x2={baseX-5} y2={toeY} stroke="#5B8AF0" strokeWidth="0.8" />
          <line x1={baseX-11} y1={baseTopY} x2={baseX-5} y2={baseTopY} stroke="#5B8AF0" strokeWidth="0.8" />
          <text x={baseX-12} y={(toeY+baseTopY)/2} fontSize="7" fill="#5B8AF0" textAnchor="middle" transform={`rotate(-90,${baseX-12},${(toeY+baseTopY)/2})`} fontWeight="600">{p.base_height||'—'}mm</text>

          {/* upper height */}
          <line x1={upperX-8} y1={upperTopY} x2={upperX-8} y2={upperBotY} stroke="#1D9E75" strokeWidth="0.8" />
          <line x1={upperX-11} y1={upperTopY} x2={upperX-5} y2={upperTopY} stroke="#1D9E75" strokeWidth="0.8" />
          <line x1={upperX-11} y1={upperBotY} x2={upperX-5} y2={upperBotY} stroke="#1D9E75" strokeWidth="0.8" />
          <text x={upperX-12} y={(upperTopY+upperBotY)/2} fontSize="7" fill="#1D9E75" textAnchor="middle" transform={`rotate(-90,${upperX-12},${(upperTopY+upperBotY)/2})`} fontWeight="600">{p.upper_height||'—'}mm</text>

          {/* tall height */}
          <line x1={tallX+tallW+6} y1={tallTopY} x2={tallX+tallW+6} y2={floorY} stroke="#EF9F27" strokeWidth="0.8" />
          <line x1={tallX+tallW+3} y1={tallTopY} x2={tallX+tallW+9} y2={tallTopY} stroke="#EF9F27" strokeWidth="0.8" />
          <line x1={tallX+tallW+3} y1={floorY} x2={tallX+tallW+9} y2={floorY} stroke="#EF9F27" strokeWidth="0.8" />
          <text x={tallX+tallW+14} y={(tallTopY+floorY)/2} fontSize="7" fill="#EF9F27" textAnchor="middle" transform={`rotate(-90,${tallX+tallW+14},${(tallTopY+floorY)/2})`} fontWeight="600">{p.tall_height||'—'}mm</text>

          {/* toe kick label */}
          <text x={baseX + baseW/2} y={floorY - toeKick*scale/2 + 3} fontSize="7" fill="#9CA3AF" textAnchor="middle">{p.toe_kick_height||150}mm</text>
        </svg>

        {/* legend */}
        <div style={{ display:'flex', flexWrap:'wrap', gap:8, padding:'4px 8px 10px', justifyContent:'center' }}>
          {[
            { label:'Carcase', color:carcaseColor||'#D4C5A9' },
            { label:'Base faces', color:baseFaceColor||'#B8A898' },
            { label:'Upper faces', color:upperFaceColor||'#C8B8A8' },
            { label:'Tall faces', color:tallFaceColor||'#BCA898' },
            { label:'Benchtop', color:benchColor },
          ].map(item => (
            <div key={item.label} style={{ display:'flex', alignItems:'center', gap:5 }}>
              <div style={{ width:10, height:10, borderRadius:2, background:item.color, border:'1px solid rgba(0,0,0,0.1)', flexShrink:0 }} />
              <span style={{ fontSize:10, color:'#6B7280' }}>{item.label}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

// ── Material Selector ─────────────────────────────────────────────
function MaterialSelector({ panelMaterials, parsed = {}, onSet }) {
  // parsed and onSet come directly from KitchenSpecs

  return (
    <div style={{ marginBottom:20 }}>
      {/* group header */}
      <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:12 }}>
        <div style={{ width:4, height:16, borderRadius:2, background:'#374151', flexShrink:0 }} />
        <span style={{ fontSize:12, fontWeight:800, color:'#374151', textTransform:'uppercase', letterSpacing:'.07em' }}>Board materials</span>
      </div>
      <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
        {MAT_SELECTORS.map(sel => {
          const matId = parsed[sel.key] || ''
          const mat   = panelMaterials.find(m => m.id === matId)
          return (
            <div key={sel.key} style={{
              borderRadius:14, border:`2px solid ${matId ? '#37414166' : '#E8ECF0'}`,
              background: matId ? '#F9FAFB' : '#FAFAFA', padding:'12px 14px',
              transition:'all .15s',
            }}>
              <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:8 }}>
                <div>
                  <div style={{ fontSize:11, fontWeight:700, color: matId ? '#374151' : '#9CA3AF', textTransform:'uppercase', letterSpacing:'.06em' }}>{sel.label}</div>
                  <div style={{ fontSize:10, color:'#9CA3AF', marginTop:1 }}>{sel.hint}</div>
                </div>
                {mat?.storage_path && (
                  <div style={{ width:36, height:36, borderRadius:8, overflow:'hidden', border:'1px solid #E8ECF0', flexShrink:0 }}>
                    <img src={pubUrl(mat.storage_path)} style={{ width:'100%', height:'100%', objectFit:'cover' }} alt="" />
                  </div>
                )}
                {mat?.color && !mat?.storage_path && (
                  <div style={{ width:36, height:36, borderRadius:8, background:mat.color, border:'1px solid #E8ECF0', flexShrink:0 }} />
                )}
              </div>
              <select value={matId} onChange={e => onSet(sel.key, e.target.value)}
                style={{ width:'100%', fontSize:13, fontWeight:600, padding:'7px 10px', borderRadius:9, border:'1px solid #DDE3EC', background:'#fff', color:'#2A3042', cursor:'pointer', outline:'none' }}>
                <option value="">— Select material —</option>
                {panelMaterials.map(m => (
                  <option key={m.id} value={m.id}>{m.name}{m.supplier ? ` (${m.supplier})` : ''}{m.thickness ? ` ${m.thickness}mm` : ''}</option>
                ))}
              </select>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ── Kitchen Specs Panel ───────────────────────────────────────────
function KitchenSpecs({ specs, onChange, panelMaterials, specsRef }) {
  // Parse specs from prop for display — onChange accumulates in parent's specsRef
  const parsed = React.useMemo(() => {
    try { return specs ? (typeof specs === 'string' ? JSON.parse(specs) : specs) : {} }
    catch { return {} }
  }, [specs])

  // set reads from specsRef (always latest) then calls onChange
  const set = (key, val) => {
    const current = specsRef?.current || parsed
    const next = { ...current, [key]: val }
    if (specsRef) specsRef.current = next
    onChange(JSON.stringify(next))
  }

  const groups = ['base','upper','tall','benchtop']

  return (
    <div style={{ background:'#fff', borderRadius:16, border:'1px solid #E8ECF0', boxShadow:'0 1px 3px rgba(0,0,0,0.04)', padding:'24px 20px' }}>
      {/* header */}
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:20 }}>
        <span style={{ fontSize:11, fontWeight:800, color:'#9CA3AF', textTransform:'uppercase', letterSpacing:'.1em' }}>Kitchen specs</span>
        <span style={{ fontSize:11, fontWeight:700, padding:'4px 12px', borderRadius:20, background:'#5B8AF0', color:'#fff' }}>Kitchen</span>
      </div>

      {/* live illustration */}
      <CabinetIllustration specs={parsed} materials={panelMaterials} />

      {/* material selectors — pass the shared set function */}
      <MaterialSelector panelMaterials={panelMaterials} parsed={parsed} onSet={set} />

      {/* measurement groups */}
      <div style={{ display:'flex', flexDirection:'column', gap:24 }}>
        {groups.map(group => {
          const g = GROUP_LABELS[group]
          const fields = KITCHEN_FIELDS.filter(f => f.group === group)
          return (
            <div key={group}>
              <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:12 }}>
                <div style={{ width:4, height:16, borderRadius:2, background:g.color, flexShrink:0 }} />
                <span style={{ fontSize:12, fontWeight:800, color:g.color, textTransform:'uppercase', letterSpacing:'.07em' }}>{g.label}</span>
              </div>
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 }}>
                {fields.map(f => {
                  const val = parsed[f.key] || ''
                  const hasVal = val !== '' && val !== null && val !== undefined
                  return (
                    <label key={f.key} style={{
                      display:'block', borderRadius:14,
                      background: hasVal ? g.bg : '#FAFAFA',
                      border: `2px solid ${hasVal ? g.color+'66' : '#E8ECF0'}`,
                      padding:'16px 16px 14px', cursor:'text', transition:'all .15s',
                      gridColumn: f.text ? 'span 2' : 'span 1',
                    }}
                    onMouseEnter={e => { if (!hasVal) e.currentTarget.style.background='#F3F4F6' }}
                    onMouseLeave={e => { if (!hasVal) e.currentTarget.style.background='#FAFAFA' }}>
                      <div style={{ fontSize:11, fontWeight:700, color: hasVal ? g.color : '#9CA3AF', textTransform:'uppercase', letterSpacing:'.06em', marginBottom:10, lineHeight:1.3 }}>
                        {f.label}
                      </div>
                      <div style={{ display:'flex', alignItems:'baseline', gap:6 }}>
                        <input type={f.text ? 'text' : 'number'} value={val} onChange={e => set(f.key, e.target.value)}
                          placeholder="—" min={f.text ? undefined : 0}
                          style={{ border:'none', outline:'none', background:'transparent', padding:0, margin:0, fontSize: f.text ? 22 : 34, fontWeight:800, color: hasVal ? '#2A3042' : '#C4C9D4', width:'100%', fontFamily:'inherit', WebkitUserSelect:'text', userSelect:'text', lineHeight:1, MozAppearance:'textfield', WebkitAppearance:'none', appearance:'textfield' }} />
                        {f.unit && <span style={{ fontSize:15, fontWeight:700, flexShrink:0, color: hasVal ? g.color : '#C4C9D4' }}>{f.unit}</span>}
                      </div>
                    </label>
                  )
                })}
              </div>
            </div>
          )
        })}
      </div>

      <style>{`
        input[type=number]::-webkit-inner-spin-button,
        input[type=number]::-webkit-outer-spin-button { -webkit-appearance:none; margin:0; }
        input[type=number] { -moz-appearance:textfield; }
      `}</style>
    </div>
  )
}


const APPLIANCE_TYPES2 = ['Oven','Microwave','Combi Steam Oven','Warming Drawer','Cooktop','Induction Cooktop','Gas Cooktop','Rangehood','Dishwasher','Fridge','Freezer','Sink','Tap','Waste Disposal','Washing Machine','Dryer','Other']

function fileIcon2(name=''){const ext=name.split('.').pop().toLowerCase();if(ext==='pdf')return'📄';if(['dwg','dxf'].includes(ext))return'📐';return'📎'}

function QuickAddAppliance({ onSave, onCancel }) {
  const toast = useToast()
  const [f, setF] = useState({ brand:'', model:'', type:'Oven', width:'', height:'', depth:'', cutout_width:'', cutout_height:'', cutout_depth:'', notes:'' })
  const set = k => e => setF(p=>({...p,[k]:e.target.value}))
  const [saving, setSaving] = useState(false)
  const attRef = React.useRef()
  const [files, setFiles] = useState([])
  const [savedId, setSavedId] = useState(null)

  async function save() {
    if (!f.brand.trim()||!f.model.trim()){toast('Brand and model required','error');return}
    setSaving(true)
    const row={...f,width:f.width?parseFloat(f.width):null,height:f.height?parseFloat(f.height):null,depth:f.depth?parseFloat(f.depth):null,cutout_width:f.cutout_width?parseFloat(f.cutout_width):null,cutout_height:f.cutout_height?parseFloat(f.cutout_height):null,cutout_depth:f.cutout_depth?parseFloat(f.cutout_depth):null}
    const {data,error}=await supabase.from('appliances').insert(row).select().single()
    setSaving(false)
    if(error){toast(error.message,'error');return}
    setSavedId(data.id)
    toast('Appliance added to library ✓')
    onSave(data)
  }

  async function handleFiles(fileList) {
    if (!savedId) { toast('Save the appliance first','error'); return }
    for (const file of Array.from(fileList)) {
      const path = `appliances/${savedId}/${Date.now()}_${file.name}`
      await supabase.storage.from(BUCKET).upload(path, file, { contentType: file.type })
      await supabase.from('appliance_files').insert({ appliance_id: savedId, name: file.name, type: file.type, size: file.size, storage_path: path })
      setFiles(p=>[...p,{name:file.name,size:file.size}])
    }
    toast('Files attached ✓')
  }

  const inputStyle = { width:'100%', padding:'7px 9px', border:'1px solid #DDE3EC', borderRadius:8, fontSize:13, outline:'none' }
  return (
    <div style={{ background:'#F9FAFB', borderRadius:12, border:'2px solid #5B8AF0', padding:18, marginBottom:12 }}>
      <div style={{ fontSize:13, fontWeight:700, color:'#2A3042', marginBottom:14 }}>Add new appliance to library</div>
      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10, marginBottom:12 }}>
        <div style={{ gridColumn:'span 2' }}>
          <label style={{ fontSize:11, fontWeight:600, color:'#6B7280', display:'block', marginBottom:3 }}>Type</label>
          <select value={f.type} onChange={set('type')} style={{...inputStyle}}>
            {APPLIANCE_TYPES2.map(t=><option key={t}>{t}</option>)}
          </select>
        </div>
        {[['brand','Brand *'],['model','Model *']].map(([k,l])=>(
          <div key={k}>
            <label style={{ fontSize:11, fontWeight:600, color:'#6B7280', display:'block', marginBottom:3 }}>{l}</label>
            <input value={f[k]} onChange={set(k)} placeholder={k==='brand'?'e.g. Bosch':'e.g. HBG634BS1A'} style={inputStyle} />
          </div>
        ))}
      </div>
      <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:8, marginBottom:8 }}>
        <div style={{ gridColumn:'span 3', fontSize:11, fontWeight:700, color:'#9CA3AF', textTransform:'uppercase', letterSpacing:'.05em' }}>Unit dimensions</div>
        {['width','height','depth'].map(k=>(
          <div key={k}>
            <label style={{ fontSize:11, fontWeight:600, color:'#6B7280', display:'block', marginBottom:3, textTransform:'capitalize' }}>{k}</label>
            <div style={{ display:'flex', gap:3, alignItems:'center' }}>
              <input type="number" value={f[k]} onChange={set(k)} placeholder="0" min="0" style={{...inputStyle}} />
              <span style={{ fontSize:10, color:'#9CA3AF' }}>mm</span>
            </div>
          </div>
        ))}
        <div style={{ gridColumn:'span 3', fontSize:11, fontWeight:700, color:'#9CA3AF', textTransform:'uppercase', letterSpacing:'.05em', marginTop:4 }}>Cutout dimensions</div>
        {['cutout_width','cutout_height','cutout_depth'].map(k=>(
          <div key={k}>
            <label style={{ fontSize:11, fontWeight:600, color:'#6B7280', display:'block', marginBottom:3 }}>{k.replace('cutout_','').charAt(0).toUpperCase()+k.replace('cutout_','').slice(1)}</label>
            <div style={{ display:'flex', gap:3, alignItems:'center' }}>
              <input type="number" value={f[k]} onChange={set(k)} placeholder="0" min="0" style={{...inputStyle}} />
              <span style={{ fontSize:10, color:'#9CA3AF' }}>mm</span>
            </div>
          </div>
        ))}
      </div>
      <div style={{ marginBottom:12 }}>
        <label style={{ fontSize:11, fontWeight:600, color:'#6B7280', display:'block', marginBottom:3 }}>Notes</label>
        <textarea value={f.notes} onChange={set('notes')} placeholder="Installation notes, clearances…"
          style={{...inputStyle, minHeight:50, resize:'vertical', fontFamily:'inherit', lineHeight:1.5}} />
      </div>
      {/* file attachments — only after saved */}
      {savedId && (
        <div style={{ marginBottom:12 }}>
          <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:6 }}>
            <span style={{ fontSize:11, fontWeight:700, color:'#6B7280' }}>Files (PDF, DWG, DXF)</span>
            <div style={{ position:'relative' }}>
              <input ref={attRef} type="file" accept=".pdf,.dwg,.dxf,image/*" multiple style={{ display:'none' }} onChange={e=>handleFiles(e.target.files)} />
              <button onClick={()=>attRef.current.click()} style={{ fontSize:11, padding:'3px 10px', borderRadius:7, border:'1px solid #DDE3EC', background:'#fff', cursor:'pointer', fontWeight:600, color:'#374151' }}>+ Attach</button>
            </div>
          </div>
          {files.map((f2,i)=>(
            <div key={i} style={{ display:'flex', alignItems:'center', gap:8, padding:'5px 8px', background:'#fff', borderRadius:7, border:'1px solid #E8ECF0', marginBottom:4 }}>
              <span>{fileIcon2(f2.name)}</span>
              <span style={{ fontSize:12, color:'#374151', flex:1 }}>{f2.name}</span>
            </div>
          ))}
        </div>
      )}
      <div style={{ display:'flex', gap:8 }}>
        {!savedId
          ? <button onClick={save} disabled={saving} style={{ fontSize:12, fontWeight:700, padding:'7px 16px', borderRadius:8, border:'none', background:'#5B8AF0', color:'#fff', cursor:saving?'not-allowed':'pointer', opacity:saving?0.6:1 }}>{saving?'Saving…':'Save to library'}</button>
          : <button onClick={onCancel} style={{ fontSize:12, fontWeight:600, padding:'7px 16px', borderRadius:8, border:'none', background:'#1D9E75', color:'#fff', cursor:'pointer' }}>✓ Added — close</button>
        }
        <button onClick={onCancel} style={{ fontSize:12, fontWeight:600, padding:'7px 14px', borderRadius:8, border:'1px solid #E8ECF0', background:'#fff', color:'#374151', cursor:'pointer' }}>Cancel</button>
      </div>
    </div>
  )
}

function AppliancePicker({ allAppliances, onSelect, onClose }) {
  const [search, setSearch] = useState('')
  const [typeFilter, setTypeFilter] = useState('All')
  const types = ['All', ...new Set(allAppliances.map(a=>a.type).filter(Boolean).sort())]
  const filtered = allAppliances.filter(a => {
    if (typeFilter!=='All' && a.type!==typeFilter) return false
    if (!search) return true
    const q=search.toLowerCase()
    return (a.brand||'').toLowerCase().includes(q)||(a.model||'').toLowerCase().includes(q)||(a.type||'').toLowerCase().includes(q)
  })
  return (
    <div style={{ background:'#fff', borderRadius:12, border:'1px solid #E8ECF0', boxShadow:'0 4px 20px rgba(0,0,0,0.1)', padding:16, marginBottom:12 }}>
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:12 }}>
        <span style={{ fontSize:13, fontWeight:700, color:'#2A3042' }}>Select appliance</span>
        <button onClick={onClose} style={{ background:'none', border:'none', cursor:'pointer', fontSize:20, color:'#9CA3AF', lineHeight:1 }}>×</button>
      </div>
      <div style={{ position:'relative', marginBottom:10 }}>
        <span style={{ position:'absolute', left:9, top:'50%', transform:'translateY(-50%)', color:'#9CA3AF', fontSize:13, pointerEvents:'none' }}>⌕</span>
        <input autoFocus value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search brand, model…"
          style={{ width:'100%', padding:'7px 9px 7px 28px', border:'1px solid #DDE3EC', borderRadius:8, fontSize:13, outline:'none' }} />
      </div>
      <div style={{ display:'flex', gap:5, flexWrap:'wrap', marginBottom:10 }}>
        {types.map(t=>(
          <button key={t} onClick={()=>setTypeFilter(t)}
            style={{ fontSize:10, fontWeight:600, padding:'3px 9px', borderRadius:14, border:`1.5px solid ${typeFilter===t?'#5B8AF0':'#E8ECF0'}`, background:typeFilter===t?'#5B8AF0':'#fff', color:typeFilter===t?'#fff':'#6B7280', cursor:'pointer' }}>
            {t}
          </button>
        ))}
      </div>
      <div style={{ maxHeight:220, overflowY:'auto', display:'flex', flexDirection:'column', gap:5 }}>
        {filtered.length===0 && <div style={{ textAlign:'center', padding:'16px', color:'#9CA3AF', fontSize:13 }}>No appliances found</div>}
        {filtered.map(a=>(
          <div key={a.id} onClick={()=>onSelect(a)}
            style={{ display:'flex', alignItems:'center', gap:10, padding:'9px 11px', borderRadius:9, border:'1px solid #E8ECF0', cursor:'pointer', background:'#fff', transition:'all .1s' }}
            onMouseEnter={e=>{e.currentTarget.style.background='#F9FAFB';e.currentTarget.style.borderColor='#C4C9D4'}}
            onMouseLeave={e=>{e.currentTarget.style.background='#fff';e.currentTarget.style.borderColor='#E8ECF0'}}>
            {a.image_path
              ? <img src={pubUrl(a.image_path)} style={{ width:36, height:36, borderRadius:7, objectFit:'contain', background:'#F9FAFB', border:'1px solid #E8ECF0', flexShrink:0 }} alt="" />
              : <div style={{ width:36, height:36, borderRadius:7, background:'#F3F4F6', display:'flex', alignItems:'center', justifyContent:'center', fontSize:20, flexShrink:0 }}>🔌</div>
            }
            <div style={{ flex:1, minWidth:0 }}>
              <div style={{ fontSize:13, fontWeight:600, color:'#2A3042' }}>{a.brand} {a.model}</div>
              <div style={{ fontSize:11, color:'#9CA3AF' }}>{a.type}{a.width?` · ${a.width}×${a.height}×${a.depth}mm`:''}</div>
            </div>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#C4C9D4" strokeWidth="2"><polyline points="9 18 15 12 9 6"/></svg>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── PDF viewer overlay ───────────────────────────────────────────
function PdfViewer({ url, name, onClose }) {
  return (
    <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.85)', zIndex:999, display:'flex', flexDirection:'column' }}>
      {/* toolbar */}
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'10px 16px', background:'#1a1a2e', flexShrink:0 }}>
        <div style={{ display:'flex', alignItems:'center', gap:10 }}>
          <span style={{ fontSize:18 }}>📄</span>
          <span style={{ fontSize:13, fontWeight:600, color:'#fff', maxWidth:300, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{name}</span>
        </div>
        <div style={{ display:'flex', gap:8 }}>
          <a href={url} download target="_blank" rel="noreferrer"
            style={{ fontSize:12, fontWeight:700, padding:'6px 14px', borderRadius:8, border:'1px solid #5B8AF0', background:'#EEF2FF', color:'#3730A3', textDecoration:'none', display:'flex', alignItems:'center', gap:5 }}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
            Download
          </a>
          <button onClick={onClose}
            style={{ fontSize:12, fontWeight:700, padding:'6px 14px', borderRadius:8, border:'1px solid rgba(255,255,255,0.2)', background:'transparent', color:'#fff', cursor:'pointer' }}>
            Close ×
          </button>
        </div>
      </div>
      {/* pdf embed */}
      <div style={{ flex:1, overflow:'hidden' }}>
        <iframe src={`${url}#toolbar=1&navpanes=0`} style={{ width:'100%', height:'100%', border:'none', display:'block' }} title={name} />
      </div>
    </div>
  )
}

// ── DXF viewer overlay ────────────────────────────────────────────
function DxfViewer({ url, name, onClose }) {
  const canvasRef = React.useRef()
  const [status, setStatus] = React.useState('loading') // loading | ok | error | dwg
  const isDwg = name.toLowerCase().endsWith('.dwg')

  React.useEffect(() => {
    if (isDwg) { setStatus('dwg'); return }

    async function loadDxf() {
      try {
        setStatus('loading')
        // Fetch the DXF text
        const res = await fetch(url)
        const text = await res.text()

        // Dynamically load three-dxf via CDN
        if (!window.THREE) {
          await new Promise((resolve, reject) => {
            const s = document.createElement('script')
            s.src = 'https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js'
            s.onload = resolve; s.onerror = reject
            document.head.appendChild(s)
          })
        }
        if (!window.DxfParser) {
          await new Promise((resolve, reject) => {
            const s = document.createElement('script')
            s.src = 'https://cdn.jsdelivr.net/npm/dxf-parser@1.1.2/dist/dxf-parser.js'
            s.onload = resolve; s.onerror = reject
            document.head.appendChild(s)
          })
        }

        const parser = new window.DxfParser()
        const dxf = parser.parseSync(text)
        const canvas = canvasRef.current
        if (!canvas) return

        // Simple canvas-based DXF renderer
        const ctx = canvas.getContext('2d')
        const W = canvas.width = canvas.offsetWidth || 800
        const H = canvas.height = canvas.offsetHeight || 600
        ctx.fillStyle = '#0d1117'
        ctx.fillRect(0, 0, W, H)

        // Collect all line endpoints to auto-scale
        const lines = []
        ;(dxf.entities || []).forEach(e => {
          if (e.type === 'LINE') {
            lines.push({ x1:e.vertices[0].x, y1:e.vertices[0].y, x2:e.vertices[1].x, y2:e.vertices[1].y })
          } else if (e.type === 'LWPOLYLINE' || e.type === 'POLYLINE') {
            const verts = e.vertices || []
            for (let i = 0; i < verts.length - 1; i++) {
              lines.push({ x1:verts[i].x, y1:verts[i].y, x2:verts[i+1].x, y2:verts[i+1].y })
            }
            if (e.shape && verts.length > 1) {
              const last = verts[verts.length-1], first = verts[0]
              lines.push({ x1:last.x, y1:last.y, x2:first.x, y2:first.y })
            }
          }
        })

        if (lines.length === 0) { setStatus('error'); return }

        // Bounding box
        let minX=Infinity,minY=Infinity,maxX=-Infinity,maxY=-Infinity
        lines.forEach(l => {
          minX=Math.min(minX,l.x1,l.x2); maxX=Math.max(maxX,l.x1,l.x2)
          minY=Math.min(minY,l.y1,l.y2); maxY=Math.max(maxY,l.y1,l.y2)
        })
        const pad = 40
        const scaleX = (W - pad*2) / (maxX - minX || 1)
        const scaleY = (H - pad*2) / (maxY - minY || 1)
        const scale  = Math.min(scaleX, scaleY)
        const offX   = pad + ((W - pad*2) - (maxX-minX)*scale) / 2
        const offY   = pad + ((H - pad*2) - (maxY-minY)*scale) / 2

        const tx = x => offX + (x - minX) * scale
        const ty = y => H - (offY + (y - minY) * scale) // flip Y

        ctx.strokeStyle = '#5B8AF0'
        ctx.lineWidth = 1
        ctx.lineCap = 'round'
        lines.forEach(l => {
          ctx.beginPath()
          ctx.moveTo(tx(l.x1), ty(l.y1))
          ctx.lineTo(tx(l.x2), ty(l.y2))
          ctx.stroke()
        })

        // Dimension labels (TEXT entities)
        ctx.fillStyle = '#9CA3AF'
        ctx.font = '10px monospace'
        ;(dxf.entities || []).filter(e => e.type==='TEXT'||e.type==='MTEXT').forEach(e => {
          const x = tx(e.startPoint?.x || 0)
          const y = ty(e.startPoint?.y || 0)
          ctx.fillText(e.text || '', x, y)
        })

        setStatus('ok')
      } catch(err) {
        console.warn('DXF parse error:', err)
        setStatus('error')
      }
    }
    loadDxf()
  }, [url, isDwg])

  return (
    <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.85)', zIndex:999, display:'flex', flexDirection:'column' }}>
      {/* toolbar */}
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'10px 16px', background:'#0d1117', flexShrink:0 }}>
        <div style={{ display:'flex', alignItems:'center', gap:10 }}>
          <span style={{ fontSize:18 }}>📐</span>
          <span style={{ fontSize:13, fontWeight:600, color:'#fff', maxWidth:300, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{name}</span>
          {status === 'ok' && <span style={{ fontSize:11, padding:'2px 8px', borderRadius:10, background:'#1D9E7533', color:'#1D9E75', fontWeight:600 }}>DXF</span>}
          {status === 'dwg' && <span style={{ fontSize:11, padding:'2px 8px', borderRadius:10, background:'#EF9F2733', color:'#EF9F27', fontWeight:600 }}>DWG</span>}
        </div>
        <div style={{ display:'flex', gap:8 }}>
          <a href={url} download target="_blank" rel="noreferrer"
            style={{ fontSize:12, fontWeight:700, padding:'6px 14px', borderRadius:8, border:'1px solid #5B8AF0', background:'#EEF2FF', color:'#3730A3', textDecoration:'none', display:'flex', alignItems:'center', gap:5 }}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
            Download
          </a>
          <button onClick={onClose}
            style={{ fontSize:12, fontWeight:700, padding:'6px 14px', borderRadius:8, border:'1px solid rgba(255,255,255,0.2)', background:'transparent', color:'#fff', cursor:'pointer' }}>
            Close ×
          </button>
        </div>
      </div>
      {/* viewer area */}
      <div style={{ flex:1, position:'relative', overflow:'hidden' }}>
        {status === 'loading' && (
          <div style={{ position:'absolute', inset:0, display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', color:'#fff', gap:12 }}>
            <div className="spinner" style={{ borderTopColor:'#5B8AF0' }} />
            <span style={{ fontSize:13, color:'#9CA3AF' }}>Parsing DXF file…</span>
          </div>
        )}
        {status === 'dwg' && (
          <div style={{ position:'absolute', inset:0, display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', color:'#fff', gap:12, padding:32, textAlign:'center' }}>
            <span style={{ fontSize:48 }}>📐</span>
            <div style={{ fontSize:16, fontWeight:700 }}>DWG files can't be previewed in the browser</div>
            <div style={{ fontSize:13, color:'#9CA3AF', maxWidth:340, lineHeight:1.6 }}>
              DWG is a proprietary Autodesk format that requires AutoCAD or a dedicated viewer. Download the file to open it in your CAD software.
            </div>
            <a href={url} download target="_blank" rel="noreferrer"
              style={{ fontSize:13, fontWeight:700, padding:'10px 24px', borderRadius:10, border:'none', background:'#5B8AF0', color:'#fff', textDecoration:'none', display:'inline-flex', alignItems:'center', gap:7 }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
              Download DWG
            </a>
          </div>
        )}
        {status === 'error' && (
          <div style={{ position:'absolute', inset:0, display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', color:'#fff', gap:10, padding:32, textAlign:'center' }}>
            <span style={{ fontSize:40 }}>⚠️</span>
            <div style={{ fontSize:15, fontWeight:700 }}>Couldn't render this DXF file</div>
            <div style={{ fontSize:13, color:'#9CA3AF' }}>The file may use unsupported entities. Download to view in your CAD software.</div>
            <a href={url} download target="_blank" rel="noreferrer"
              style={{ fontSize:13, fontWeight:700, padding:'9px 22px', borderRadius:10, border:'none', background:'#5B8AF0', color:'#fff', textDecoration:'none' }}>
              Download
            </a>
          </div>
        )}
        <canvas ref={canvasRef} style={{ width:'100%', height:'100%', display: status==='ok' ? 'block' : 'none' }} />
      </div>
    </div>
  )
}

// ── File viewer state ─────────────────────────────────────────────
function ApplianceFiles({ applianceId }) {
  const [files, setFiles] = React.useState(null)
  const [viewing, setViewing] = React.useState(null) // { url, name, type }

  React.useEffect(() => {
    supabase.from('appliance_files').select('*').eq('appliance_id', applianceId).order('created_at')
      .then(({ data }) => setFiles(data || []))
  }, [applianceId])

  if (files === null) return <div style={{ fontSize:12, color:'#9CA3AF', padding:'4px 0' }}>Loading files…</div>
  if (files.length === 0) return null

  function fileExt(name='') { return (name.split('.').pop()||'').toLowerCase() }
  function fileIcon(name='') {
    const ext = fileExt(name)
    if (ext==='pdf') return '📄'
    if (['dwg','dxf'].includes(ext)) return '📐'
    if (['jpg','jpeg','png','webp'].includes(ext)) return '🖼'
    return '📎'
  }
  function canView(name='') {
    const ext = fileExt(name)
    return ['pdf','dxf','dwg'].includes(ext)
  }

  return (
    <>
      {/* overlays */}
      {viewing?.type === 'pdf' && <PdfViewer url={viewing.url} name={viewing.name} onClose={() => setViewing(null)} />}
      {(viewing?.type === 'dxf' || viewing?.type === 'dwg') && <DxfViewer url={viewing.url} name={viewing.name} onClose={() => setViewing(null)} />}

      <div style={{ marginTop:10 }}>
        <div style={{ fontSize:10, fontWeight:700, color:'#9CA3AF', textTransform:'uppercase', letterSpacing:'.06em', marginBottom:7 }}>Files</div>
        <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
          {files.map(f => {
            const ext  = fileExt(f.name)
            const url  = pubUrl(f.storage_path)
            const viewable = canView(f.name)
            return (
              <div key={f.id} style={{ display:'flex', alignItems:'center', gap:10, padding:'8px 12px', background:'#F9FAFB', borderRadius:9, border:'1px solid #E8ECF0' }}>
                <span style={{ fontSize:18, flexShrink:0 }}>{fileIcon(f.name)}</span>
                <div style={{ flex:1, minWidth:0 }}>
                  <div style={{ fontSize:12, fontWeight:600, color:'#2A3042', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{f.name}</div>
                  {f.size && <div style={{ fontSize:10, color:'#9CA3AF' }}>{(f.size/1024).toFixed(0)} KB · {ext.toUpperCase()}</div>}
                </div>
                <div style={{ display:'flex', gap:5, flexShrink:0 }}>
                  {viewable && (
                    <button onClick={() => setViewing({ url, name: f.name, type: ext })}
                      style={{ fontSize:11, fontWeight:700, padding:'5px 11px', borderRadius:8, border:'1px solid #1D9E75', background:'#ECFDF5', color:'#065F46', cursor:'pointer', display:'flex', alignItems:'center', gap:4 }}>
                      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                      View
                    </button>
                  )}
                  <a href={url} download target="_blank" rel="noreferrer"
                    style={{ fontSize:11, fontWeight:700, padding:'5px 11px', borderRadius:8, border:'1px solid #5B8AF0', background:'#EEF2FF', color:'#3730A3', textDecoration:'none', display:'flex', alignItems:'center', gap:4 }}>
                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                    Download
                  </a>
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </>
  )
}

function JobAppliancesSection({ jobId, jobAppliances, allAppliances, setJobAppliances, setAllAppliances }) {
  const toast = useToast()
  const [query, setQuery] = useState('')
  const [focused, setFocused] = useState(false)
  const [showQuickAdd, setShowQuickAdd] = useState(false)
  const [expandedId, setExpandedId] = useState(null)
  const inputRef = React.useRef()
  const dropRef = React.useRef()

  // already-added appliance ids so we don't show duplicates
  const addedIds = new Set(jobAppliances.map(ja => ja.appliance_id))

  // live filter
  const matches = query.trim().length < 1 ? [] : allAppliances.filter(a => {
    if (addedIds.has(a.id)) return false
    const q = query.toLowerCase()
    return (a.brand||'').toLowerCase().includes(q) ||
           (a.model||'').toLowerCase().includes(q) ||
           (a.type||'').toLowerCase().includes(q)
  })

  // close dropdown on outside click
  React.useEffect(() => {
    function handle(e) {
      if (dropRef.current && !dropRef.current.contains(e.target) && !inputRef.current.contains(e.target)) {
        setFocused(false)
      }
    }
    document.addEventListener('mousedown', handle)
    return () => document.removeEventListener('mousedown', handle)
  }, [])

  async function addAppliance(appliance) {
    const {data,error} = await supabase.from('job_appliances').insert({ job_id: jobId, appliance_id: appliance.id }).select('*,appliances(*)').single()
    if (error) { toast(error.message,'error'); return }
    setJobAppliances(p=>[...p,data])
    setQuery(''); setFocused(false)
    toast(`${appliance.brand} ${appliance.model} added ✓`)
  }

  async function removeAppliance(jaId) {
    if (!confirm('Remove this appliance from the job?')) return
    await supabase.from('job_appliances').delete().eq('id', jaId)
    setJobAppliances(p=>p.filter(x=>x.id!==jaId))
    toast('Removed')
  }

  function onQuickAdded(newApp) {
    setAllAppliances(p=>[...p, newApp])
    addAppliance(newApp)
    setShowQuickAdd(false)
    setQuery('')
  }

  const showDrop = focused && query.trim().length > 0
  const noMatches = showDrop && matches.length === 0

  return (
    <div style={{ background:'#fff', borderRadius:12, border:'1px solid #E8ECF0', boxShadow:'0 1px 3px rgba(0,0,0,0.04)', padding:18, marginBottom:14 }}>
      <div style={{ fontSize:11, fontWeight:700, color:'#9CA3AF', textTransform:'uppercase', letterSpacing:'.05em', marginBottom:12 }}>Appliances</div>

      {/* smart search input */}
      {!showQuickAdd && (
        <div style={{ position:'relative', marginBottom:14 }}>
          <div style={{ display:'flex', alignItems:'center', gap:8, padding:'8px 12px', border:`1.5px solid ${focused?'#5B8AF0':'#DDE3EC'}`, borderRadius:10, background:'#fff', transition:'border-color .15s' }}>
            <span style={{ fontSize:15, color:'#9CA3AF', flexShrink:0 }}>⌕</span>
            <input
              ref={inputRef}
              value={query}
              onChange={e => setQuery(e.target.value)}
              onFocus={() => setFocused(true)}
              onKeyDown={e => { if(e.key==='Escape'){setQuery('');setFocused(false)} }}
              placeholder="Search appliances or type to add new…"
              style={{ flex:1, border:'none', outline:'none', fontSize:13, background:'transparent', color:'#2A3042', WebkitUserSelect:'text', userSelect:'text' }}
            />
            {query && <button onClick={()=>{setQuery('');setFocused(false);inputRef.current.focus()}} style={{ background:'none', border:'none', cursor:'pointer', color:'#9CA3AF', fontSize:16, lineHeight:1, padding:0 }}>×</button>}
          </div>

          {/* dropdown */}
          {showDrop && (
            <div ref={dropRef} style={{ position:'absolute', top:'calc(100% + 4px)', left:0, right:0, background:'#fff', borderRadius:10, border:'1px solid #E8ECF0', boxShadow:'0 8px 24px rgba(0,0,0,0.1)', zIndex:50, overflow:'hidden', maxHeight:260, overflowY:'auto' }}>
              {matches.map(a => (
                <div key={a.id} onClick={() => addAppliance(a)}
                  style={{ display:'flex', alignItems:'center', gap:10, padding:'10px 14px', cursor:'pointer', borderBottom:'1px solid #F3F4F6', transition:'background .1s' }}
                  onMouseEnter={e=>e.currentTarget.style.background='#F9FAFB'}
                  onMouseLeave={e=>e.currentTarget.style.background='transparent'}>
                  {a.image_path
                    ? <img src={pubUrl(a.image_path)} style={{ width:34, height:34, borderRadius:7, objectFit:'contain', background:'#F9FAFB', border:'1px solid #E8ECF0', flexShrink:0 }} alt="" />
                    : <div style={{ width:34, height:34, borderRadius:7, background:'#F3F4F6', display:'flex', alignItems:'center', justifyContent:'center', fontSize:18, flexShrink:0 }}>🔌</div>
                  }
                  <div style={{ flex:1, minWidth:0 }}>
                    <div style={{ fontSize:13, fontWeight:600, color:'#2A3042' }}>{a.brand} {a.model}</div>
                    <div style={{ fontSize:11, color:'#9CA3AF' }}>{a.type}{a.width?` · ${a.width}×${a.height}×${a.depth}mm`:''}</div>
                  </div>
                  <span style={{ fontSize:11, color:'#5B8AF0', fontWeight:600, flexShrink:0 }}>Add</span>
                </div>
              ))}
              {/* no matches — prompt to add */}
              {noMatches && (
                <div style={{ padding:'14px 16px' }}>
                  <div style={{ fontSize:13, color:'#6B7280', marginBottom:10 }}>
                    No appliances found for <strong style={{ color:'#2A3042' }}>"{query}"</strong>
                  </div>
                  <button onClick={() => { setShowQuickAdd(true); setFocused(false) }}
                    style={{ width:'100%', padding:'9px', borderRadius:9, border:'1.5px dashed #5B8AF0', background:'#EEF2FF', color:'#3730A3', fontSize:13, fontWeight:700, cursor:'pointer' }}>
                    + Add "{query}" to appliance library
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {showQuickAdd && (
        <QuickAddAppliance onSave={onQuickAdded} onCancel={()=>setShowQuickAdd(false)} />
      )}

      {jobAppliances.length===0 && !showQuickAdd ? (
        <div style={{ textAlign:'center', padding:'12px 0', color:'#9CA3AF', fontSize:13 }}>No appliances added yet — search above</div>
      ) : (
        <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
          {jobAppliances.map(ja => {
            const a = ja.appliances
            if (!a) return null
            const expanded = expandedId===ja.id
            return (
              <div key={ja.id} style={{ borderRadius:10, border:'1px solid #E8ECF0', overflow:'hidden' }}>
                {/* collapsed row */}
                <div style={{ display:'flex', alignItems:'center', gap:10, padding:'10px 12px', cursor:'pointer', background:'#FAFAFA' }}
                  onClick={()=>setExpandedId(expanded?null:ja.id)}>
                  {a.image_path
                    ? <img src={pubUrl(a.image_path)} style={{ width:36, height:36, borderRadius:7, objectFit:'contain', background:'#fff', border:'1px solid #E8ECF0', flexShrink:0 }} alt="" />
                    : <div style={{ width:36, height:36, borderRadius:7, background:'#F3F4F6', display:'flex', alignItems:'center', justifyContent:'center', fontSize:20, flexShrink:0 }}>🔌</div>
                  }
                  <div style={{ flex:1, minWidth:0 }}>
                    <div style={{ fontSize:13, fontWeight:600, color:'#2A3042' }}>{a.brand} {a.model}</div>
                    <div style={{ fontSize:11, color:'#9CA3AF' }}>{a.type}{a.width?` · ${a.width}×${a.height}×${a.depth}mm`:''}</div>
                  </div>
                  <div style={{ display:'flex', gap:6, alignItems:'center' }}>
                    <button onClick={e=>{e.stopPropagation();removeAppliance(ja.id)}}
                      style={{ fontSize:12, color:'#FCA5A5', background:'none', border:'none', cursor:'pointer', fontWeight:700, padding:'2px 6px' }}>×</button>
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#9CA3AF" strokeWidth="2" style={{ transform:expanded?'rotate(180deg)':'none', transition:'transform .15s' }}><polyline points="6 9 12 15 18 9"/></svg>
                  </div>
                </div>
                {/* expanded dims */}
                {expanded && (
                  <div style={{ padding:'12px 14px', borderTop:'1px solid #E8ECF0', background:'#fff' }}>
                    <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:8, marginBottom:10 }}>
                      {[['Width',a.width,'#5B8AF0','#EEF2FF'],['Height',a.height,'#5B8AF0','#EEF2FF'],['Depth',a.depth,'#5B8AF0','#EEF2FF']].map(([l,v,c,bg])=>(
                        <div key={l} style={{ borderRadius:9, border:`1.5px solid ${v?c+'55':'#E8ECF0'}`, background:v?bg:'#FAFAFA', padding:'9px 11px' }}>
                          <div style={{ fontSize:10, fontWeight:700, color:v?c:'#9CA3AF', textTransform:'uppercase', letterSpacing:'.05em', marginBottom:4 }}>{l}</div>
                          <div style={{ fontSize:20, fontWeight:800, color:v?'#2A3042':'#C4C9D4', lineHeight:1 }}>{v||'—'}{v&&<span style={{ fontSize:11, color:c, marginLeft:3 }}>mm</span>}</div>
                        </div>
                      ))}
                    </div>
                    {(a.cutout_width||a.cutout_height||a.cutout_depth) && (
                      <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:8, marginBottom:10 }}>
                        {[['Cutout W',a.cutout_width,'#1D9E75','#ECFDF5'],['Cutout H',a.cutout_height,'#1D9E75','#ECFDF5'],['Cutout D',a.cutout_depth,'#1D9E75','#ECFDF5']].map(([l,v,c,bg])=>(
                          <div key={l} style={{ borderRadius:9, border:`1.5px solid ${v?c+'55':'#E8ECF0'}`, background:v?bg:'#FAFAFA', padding:'9px 11px' }}>
                            <div style={{ fontSize:10, fontWeight:700, color:v?c:'#9CA3AF', textTransform:'uppercase', letterSpacing:'.05em', marginBottom:4 }}>{l}</div>
                            <div style={{ fontSize:20, fontWeight:800, color:v?'#2A3042':'#C4C9D4', lineHeight:1 }}>{v||'—'}{v&&<span style={{ fontSize:11, color:c, marginLeft:3 }}>mm</span>}</div>
                          </div>
                        ))}
                      </div>
                    )}
                    {a.notes && <div style={{ fontSize:12, color:'#6B7280', padding:'8px 10px', background:'#F9FAFB', borderRadius:8, marginBottom:4 }}>{a.notes}</div>}
                    <ApplianceFiles applianceId={a.id} />
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}


// ── Right Panel — Rooms / Processes / History ────────────────────
const PROC_STATUS_STYLE = {
  'Not started': { bg:'#F3F4F6', color:'#6B7280', border:'#E8ECF0' },
  'In progress':  { bg:'#DBEAFE', color:'#1E40AF', border:'#BFDBFE' },
  'Complete':     { bg:'#DCFCE7', color:'#166534', border:'#86EFAC' },
  'On hold':      { bg:'#FEF9C3', color:'#854D0E', border:'#FDE68A' },
}

function ProcessesPanel({ jobId, processes, onProcessesChange, profile, toast, onHistoryRefresh, activeEntries={}, onActiveEntriesChange, canDeleteProcesses=false }) {
  const [templates, setTemplates]     = React.useState([])
  const [teamProfiles, setTeamProfiles] = React.useState([])
  const [showAdd, setShowAdd]         = React.useState(false)
  const [newProc, setNewProc]         = React.useState({ name:'', hours:'', due_date:'' })
  const saveTimer = React.useRef()

  // Use setter from parent if provided, otherwise local (fallback)
  const setActiveEntries = onActiveEntriesChange || React.useState({})[1]

  React.useEffect(() => {
    supabase.from('process_templates').select('*').order('sort_order').then(({data})=>setTemplates(data||[]))
    supabase.from('profiles').select('id,full_name,email').order('full_name').then(({data})=>setTeamProfiles(data||[]))
  },[jobId])

  async function update(id, patch) {
    // Update local state immediately
    onProcessesChange(p=>p.map(x=>x.id===id?{...x,...patch}:x))

    // assigned_to and due_date: save immediately with feedback
    if ('assigned_to' in patch || 'due_date' in patch) {
      const { error } = await supabase.from('job_processes').update(patch).eq('id', id)
      if (error) {
        toast(error.message, 'error')
        console.error('Process update error:', error)
        return
      }
      if ('assigned_to' in patch) {
        const name = patch.assigned_to
          ? (teamProfiles.find(p=>p.id===patch.assigned_to)?.full_name || 'user')
          : null
        if (name) {
          const procName = processes.find(p=>p.id===id)?.name || 'Process'
          toast(`${procName} assigned to ${name} ✓`)
        }
      }
      if ('due_date' in patch && patch.due_date) {
        toast('Due date saved ✓')
      }
      window.dispatchEvent(new CustomEvent('processes-updated'))
    } else {
      // Debounce for text/number fields
      clearTimeout(saveTimer.current)
      saveTimer.current = setTimeout(async () => {
        const { error } = await supabase.from('job_processes').update(patch).eq('id', id)
        if (error) console.error('Process update error:', error)
        else window.dispatchEvent(new CustomEvent('processes-updated'))
      }, 500)
    }
  }

  async function clockIn(proc) {
    // Clock out any active first
    for (const [pid,entry] of Object.entries(activeEntries)) {
      const _ci = String(entry.clocked_in_at).endsWith('Z') ? entry.clocked_in_at : entry.clocked_in_at+'Z'
      const mins=(Date.now()-new Date(_ci).getTime())/60000
      await supabase.from('time_entries').update({clocked_out_at:new Date().toISOString(),duration_minutes:Math.round(mins)}).eq('id',entry.id)
      const p=processes.find(x=>x.id===pid)
      if(p) update(p.id,{time_logged:parseFloat(((p.time_logged||0)+mins/60).toFixed(2))})
    }
    const {data,error}=await supabase.from('time_entries').insert({
      job_id:jobId,user_id:profile.id,process_id:proc.id,clocked_in_at:new Date().toISOString()
    }).select().single()
    if(error){toast(error.message,'error');return}
    setActiveEntries({[proc.id]:data})
    // Write process status immediately
    onProcessesChange(p=>p.map(x=>x.id===proc.id?{...x,status:'In progress',assigned_to:profile.id}:x))
    await supabase.from('job_processes').update({status:'In progress',assigned_to:profile.id}).eq('id',proc.id)
    // Promote the job itself to In progress on first clock-in
    await supabase.from('jobs').update({status:'In progress'}).eq('id',jobId).in('status',['Pending','Not started'])
    toast(`▶ ${proc.name} started`)
    if(onHistoryRefresh) setTimeout(onHistoryRefresh,500)
  }

  async function clockOut(proc, newStatus) {
    const entry=activeEntries[proc.id]; if(!entry) return
    const inAt = String(entry.clocked_in_at).endsWith('Z') ? entry.clocked_in_at : entry.clocked_in_at+'Z'
    const mins=(Date.now()-new Date(inAt).getTime())/60000
    await supabase.from('time_entries').update({clocked_out_at:new Date().toISOString(),duration_minutes:Math.round(mins)}).eq('id',entry.id)
    const newLogged=parseFloat(((proc.time_logged||0)+mins/60).toFixed(2))
    const patch = {time_logged:newLogged,...(newStatus?{status:newStatus,assigned_to:profile.id}:{})}
    // Write directly to DB immediately — don't debounce status changes
    onProcessesChange(p=>p.map(x=>x.id===proc.id?{...x,...patch}:x))
    await supabase.from('job_processes').update(patch).eq('id',proc.id)
    const {[proc.id]:_,...rest}=activeEntries; setActiveEntries(rest)
    toast(`${newStatus==='Complete'?'✓':newStatus==='On hold'?'⏸':'■'} ${proc.name} — ${(mins/60).toFixed(1)}h logged`)
    window.dispatchEvent(new CustomEvent('process-clock-change', { detail: { jobId } }))
    if(onHistoryRefresh) setTimeout(onHistoryRefresh,500)
  }

  async function deleteProcess(proc) {
    if (!confirm(`Remove "${proc.name}" from this job?`)) return
    await supabase.from('job_processes').delete().eq('id', proc.id)
    onProcessesChange(p => p.filter(x => x.id !== proc.id))
    toast(`${proc.name} removed`)
    window.dispatchEvent(new CustomEvent('processes-updated'))
  }

  async function addFromTemplate(t) {
    const {data,error}=await supabase.from('job_processes').insert({
      job_id:jobId,template_id:t.id,name:t.name,
      allocated_hours:t.default_hours||0,color:t.color||'#9CA3AF',
      status:'Not started',time_logged:0,sort_order:processes.length
    }).select().single()
    if(error){toast(error.message,'error');return}
    onProcessesChange(p=>[...p,data]); toast(`${t.name} added ✓`)
    window.dispatchEvent(new CustomEvent('processes-updated'))
  }

  async function addCustom() {
    if(!newProc.name.trim()) return
    const {data,error}=await supabase.from('job_processes').insert({
      job_id:jobId,name:newProc.name,allocated_hours:parseFloat(newProc.hours)||0,
      color:'#9CA3AF',status:'Not started',time_logged:0,sort_order:processes.length,
      due_date: newProc.due_date || null,
    }).select().single()
    if(error){toast(error.message,'error');return}
    onProcessesChange(p=>[...p,data]); setNewProc({name:'',hours:'',due_date:''}); setShowAdd(false)
    toast(`${data.name} added ✓`)
    window.dispatchEvent(new CustomEvent('processes-updated'))
  }

  const already = processes.map(p=>p.template_id)
  const availTemplates = templates.filter(t=>!already.includes(t.id))

  return (
    <div>
      {processes.length===0&&!showAdd ? (
        <div style={{textAlign:'center',padding:'24px 16px',color:'#9CA3AF'}}>
          <div style={{fontSize:24,marginBottom:8}}>⚙️</div>
          <div style={{fontSize:13,fontWeight:600,color:'#374151',marginBottom:4}}>No processes yet</div>
          <div style={{fontSize:12,marginBottom:12}}>Add production stages to track time per phase</div>
          <button onClick={()=>setShowAdd(true)} style={{fontSize:12,fontWeight:700,padding:'7px 18px',borderRadius:9,border:'none',background:'#5B8AF0',color:'#fff',cursor:'pointer'}}>+ Add process</button>
        </div>
      ) : (
        <div style={{display:'flex',flexDirection:'column',gap:6,padding:'8px 0'}}>
          {processes.map(proc=>{
            const isActive=!!activeEntries[proc.id]
            const ss=PROC_STATUS_STYLE[proc.status]||PROC_STATUS_STYLE['Not started']
            const allocated=proc.allocated_hours||0
            const rawLogged=proc.time_logged||0
            const logged=rawLogged>200?0:rawLogged // cap corrupt data
            const pct=allocated>0?Math.min((logged/allocated)*100,100):0
            const remaining=allocated>0?Math.max(0,allocated-logged):null
            const isDone = proc.status==='Complete'
            return (
              <div key={proc.id} style={{
                background: isActive?'#F0FDF4' : isDone?'#F9FAFB':'#F9FAFB',
                borderRadius:10,
                border:`1px solid ${isActive?'#86EFAC':isDone?'#E8ECF0':'#E8ECF0'}`,
                padding:'10px 12px',transition:'all .2s',
                opacity: isDone ? 0.55 : 1,
              }}>
                {/* name + status */}
                <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:6}}>
                  <div style={{width:10,height:10,borderRadius:'50%',
                    background: isDone ? '#C4C9D4' : (proc.color||'#9CA3AF'),
                    flexShrink:0,
                    boxShadow:isActive?`0 0 0 3px ${proc.color||'#9CA3AF'}33`:undefined}} />
                  <span style={{fontSize:13,fontWeight:isDone?500:700,color:isDone?'#9CA3AF':'#2A3042',flex:1,textDecoration:isDone?'line-through':'none'}}>{proc.name}</span>
                  <span style={{fontSize:10,fontWeight:700,padding:'2px 7px',borderRadius:8,background:ss.bg,color:ss.color,border:`1px solid ${ss.border}`}}>
                    {isActive?'● Active':proc.status}
                  </span>
                </div>
                {/* assignee + due date */}
                <div style={{display:'flex',alignItems:'center',gap:10,marginBottom:isDone?0:6,flexWrap:'wrap'}}>
                  <div style={{display:'flex',alignItems:'center',gap:5,flex:1,minWidth:120}}>
                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke={proc.assigned_to?'#5B8AF0':'#9CA3AF'} strokeWidth="2"><circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7"/></svg>
                    <select value={proc.assigned_to||''} onChange={e=>update(proc.id,{assigned_to:e.target.value||null})}
                      style={{fontSize:11,color:proc.assigned_to?'#2A3042':'#9CA3AF',border:'none',background:'transparent',outline:'none',cursor:'pointer',fontFamily:'inherit',maxWidth:140,fontWeight:proc.assigned_to?600:400}}>
                      <option value="">Unassigned</option>
                      {teamProfiles.map(p=><option key={p.id} value={p.id}>{p.full_name||p.email}</option>)}
                    </select>
                  </div>
                  <div style={{display:'flex',alignItems:'center',gap:5}}>
                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke={proc.due_date?'#EF9F27':'#9CA3AF'} strokeWidth="2"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
                    <input type="date" value={proc.due_date?.slice(0,10)||''} onChange={e=>update(proc.id,{due_date:e.target.value||null})}
                      title="Required by date"
                      style={{fontSize:11,border:'none',background:'transparent',outline:'none',cursor:'pointer',fontFamily:'inherit',color:proc.due_date?'#854D0E':'#9CA3AF',padding:0,width:proc.due_date?100:85}}/>
                    {!proc.due_date && <span style={{fontSize:10,color:'#9CA3AF'}}>Set date</span>}
                  </div>
                </div>
                {/* progress */}
                {!isDone && (allocated>0||logged>0) && (
                  <div style={{marginBottom:8}}>
                    <div style={{display:'flex',justifyContent:'space-between',fontSize:10,color:'#9CA3AF',marginBottom:3}}>
                      <span>{logged.toFixed(1)}h logged{allocated>0?` / ${allocated}h`:''}</span>
                      {remaining!==null&&<span style={{color:remaining<1?'#E24B4A':'#9CA3AF'}}>{remaining.toFixed(1)}h left</span>}
                    </div>
                    {allocated>0&&<div style={{height:3,background:'#E8ECF0',borderRadius:2,overflow:'hidden'}}>
                      <div style={{height:'100%',width:`${pct}%`,background:pct>90?'#E24B4A':pct>70?'#EF9F27':'#1D9E75',borderRadius:2,transition:'width .3s'}}/>
                    </div>}
                  </div>
                )}
                {/* action buttons */}
                <div style={{display:'flex',gap:6}}>
                  {isActive ? (<>
                    <button onClick={()=>clockOut(proc,'On hold')}
                      style={{flex:1,fontSize:11,fontWeight:700,padding:'5px 6px',borderRadius:7,border:'1px solid #FDE68A',background:'#FEF9C3',color:'#854D0E',cursor:'pointer'}}>⏸ Hold</button>
                    <button onClick={()=>clockOut(proc,'Complete')}
                      style={{flex:1,fontSize:11,fontWeight:700,padding:'5px 6px',borderRadius:7,border:'1px solid #86EFAC',background:'#DCFCE7',color:'#166534',cursor:'pointer'}}>✓ Done</button>
                    <button onClick={()=>clockOut(proc)}
                      style={{flex:1,fontSize:11,fontWeight:700,padding:'5px 6px',borderRadius:7,border:'none',background:'#374151',color:'#fff',cursor:'pointer'}}>■ Stop</button>
                  </>) : proc.status==='Complete' ? (
                    <div style={{fontSize:11,color:'#9CA3AF',textAlign:'center',flex:1,padding:'4px 0'}}>Completed ✓</div>
                  ) : (
                    <button onClick={()=>clockIn(proc)} style={{flex:1,fontSize:12,fontWeight:700,padding:'6px',borderRadius:7,border:'1px solid #C4D4F8',background:'#EEF2FF',color:'#3730A3',cursor:'pointer'}}>
                      {proc.status==='On hold'?'▶ Resume':'▶ Start'}
                    </button>
                  )}
                  {canDeleteProcesses && (
                    <button onClick={()=>deleteProcess(proc)} title="Remove process"
                      style={{fontSize:12,padding:'5px 8px',borderRadius:7,border:'1px solid #FCA5A5',background:'#FEF2F2',color:'#E24B4A',cursor:'pointer',flexShrink:0}}
                      onMouseEnter={e=>e.currentTarget.style.background='#FEE2E2'} onMouseLeave={e=>e.currentTarget.style.background='#FEF2F2'}>
                      ×
                    </button>
                  )}
                </div>
              </div>
            )
          })}
          <button onClick={()=>setShowAdd(s=>!s)}
            style={{fontSize:12,fontWeight:600,padding:'7px',borderRadius:9,border:'1px dashed #C4D4F8',background:'#F0F4FF',color:'#5B8AF0',cursor:'pointer',marginTop:2}}>
            {showAdd?'Cancel':'+ Add process'}
          </button>
        </div>
      )}

      {showAdd&&(
        <div style={{background:'#F9FAFB',borderRadius:10,border:'1px solid #E8ECF0',padding:12,marginTop:6}}>
          {availTemplates.length>0&&(
            <>
              <div style={{fontSize:10,fontWeight:700,color:'#9CA3AF',textTransform:'uppercase',letterSpacing:'.05em',marginBottom:7}}>From templates</div>
              {availTemplates.map(t=>(
                <div key={t.id} onClick={()=>{addFromTemplate(t);setShowAdd(false)}}
                  style={{display:'flex',alignItems:'center',gap:8,padding:'8px 10px',borderRadius:8,border:'1px solid #E8ECF0',background:'#fff',cursor:'pointer',marginBottom:5}}
                  onMouseEnter={e=>e.currentTarget.style.background='#F0F4FF'}
                  onMouseLeave={e=>e.currentTarget.style.background='#fff'}>
                  <div style={{width:9,height:9,borderRadius:'50%',background:t.color||'#9CA3AF',flexShrink:0}}/>
                  <span style={{fontSize:12,fontWeight:600,color:'#2A3042',flex:1}}>{t.name}</span>
                  {t.default_hours>0&&<span style={{fontSize:10,color:'#9CA3AF'}}>{t.default_hours}h</span>}
                </div>
              ))}
              <div style={{fontSize:10,fontWeight:700,color:'#9CA3AF',textTransform:'uppercase',letterSpacing:'.05em',margin:'8px 0 6px'}}>Custom</div>
            </>
          )}
          <div style={{display:'flex',gap:6,flexWrap:'wrap'}}>
            <input value={newProc.name} onChange={e=>setNewProc(p=>({...p,name:e.target.value}))}
              onKeyDown={e=>e.key==='Enter'&&addCustom()} placeholder="Process name" autoFocus
              style={{flex:1,minWidth:120,padding:'6px 9px',border:'1px solid #DDE3EC',borderRadius:7,fontSize:12,outline:'none'}}/>
            <input type="number" value={newProc.hours} onChange={e=>setNewProc(p=>({...p,hours:e.target.value}))}
              placeholder="hrs" style={{width:50,padding:'6px 8px',border:'1px solid #DDE3EC',borderRadius:7,fontSize:12,outline:'none',textAlign:'center'}}/>
            <input type="date" value={newProc.due_date} onChange={e=>setNewProc(p=>({...p,due_date:e.target.value}))}
              title="Required by date"
              style={{padding:'6px 8px',border:'1px solid #DDE3EC',borderRadius:7,fontSize:12,outline:'none',color:newProc.due_date?'#374151':'#9CA3AF'}}/>
            <button onClick={addCustom} style={{padding:'6px 12px',borderRadius:7,border:'none',background:'#5B8AF0',color:'#fff',fontSize:12,fontWeight:700,cursor:'pointer'}}>Add</button>
          </div>
          {!newProc.due_date && <div style={{fontSize:10,color:'#9CA3AF',marginTop:4}}>⚠ Set a "Required by" date so it shows in the calendar</div>}
        </div>
      )}
    </div>
  )
}

function HistoryPanel({ timeHistory }) {
  if (timeHistory.length===0) return (
    <div style={{textAlign:'center',padding:'32px 16px',color:'#9CA3AF',fontSize:13}}>No time entries yet</div>
  )


  function dur(entry) {
    // Ensure Z suffix so Safari parses as UTC not local time
    const toUTC = s => s ? (String(s).endsWith('Z')||String(s).includes('+') ? s : s+'Z') : null
    const inAt  = toUTC(entry.clocked_in_at)
    const outAt = toUTC(entry.clocked_out_at)
    // Active entries: always calculate live
    if (!outAt) {
      const mins=(Date.now()-new Date(inAt).getTime())/60000
      const h=Math.floor(mins/60), m=Math.round(mins%60)
      return h>0?`${h}h ${m}m`:`${m}m`
    }
    // Always calculate from timestamps — ignore stored duration_minutes (may be corrupt)
    const mins=(new Date(outAt)-new Date(inAt))/60000
    const h=Math.floor(mins/60), m=Math.round(mins%60)
    return h>0?`${h}h ${m}m`:`${m}m`
  }

  return (
    <div style={{padding:'4px 0'}}>
      {timeHistory.map(entry=>{
        const isActive=!entry.clocked_out_at
        const proc=entry.job_processes
        const user=entry.profiles
        return (
          <div key={entry.id} style={{padding:'9px 12px',borderBottom:'1px solid #F3F4F6',background:isActive?'#F0FDF4':'#fff'}}>
            <div style={{display:'flex',alignItems:'flex-start',gap:8}}>
              <div style={{width:9,height:9,borderRadius:'50%',background:proc?.color||'#9CA3AF',flexShrink:0,marginTop:3,
                boxShadow:isActive?`0 0 0 3px ${proc?.color||'#9CA3AF'}33`:undefined}}/>
              <div style={{flex:1,minWidth:0}}>
                <div style={{display:'flex',alignItems:'center',gap:6,flexWrap:'wrap'}}>
                  <span style={{fontSize:12,fontWeight:700,color:'#2A3042'}}>{proc?.name||'General'}</span>
                  {isActive&&<span style={{fontSize:10,fontWeight:700,padding:'1px 6px',borderRadius:6,background:'#DCFCE7',color:'#166534',border:'1px solid #86EFAC'}}>● Active</span>}
                </div>
                <div style={{fontSize:11,color:'#9CA3AF',marginTop:2}}>
                  {user?.full_name||user?.email||'Unknown'} · {fmtNZTime(entry.clocked_in_at)}
                </div>
              </div>
              <div style={{fontSize:12,fontWeight:700,color:isActive?'#1D9E75':'#374151',flexShrink:0,textAlign:'right'}}>
                {dur(entry)}
                {isActive&&<div style={{fontSize:9,color:'#1D9E75',fontWeight:400}}>ongoing</div>}
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}

function SectionHeader({ title, badge, badgeBg, badgeColor, action }) {
  return (
    <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',padding:'12px 16px 8px',borderBottom:'1px solid #F3F4F6'}}>
      <div style={{display:'flex',alignItems:'center',gap:7}}>
        <span style={{fontSize:12,fontWeight:800,color:'#2A3042',textTransform:'uppercase',letterSpacing:'.05em'}}>{title}</span>
        {badge!=null&&<span style={{fontSize:10,fontWeight:700,padding:'1px 6px',borderRadius:8,background:badgeBg,color:badgeColor}}>{badge}</span>}
      </div>
      {action}
    </div>
  )
}

function HistorySectionWithToggle({ timeHistory }) {
  // BUILD: v9-NZ-TIME-FIX
  const [show, setShow] = React.useState(false)
  const active = timeHistory.filter(e=>!e.clocked_out_at).length
  const total  = timeHistory.length

  return (
    <div style={{background:'#fff',borderRadius:16,border:'1px solid #E8ECF0',boxShadow:'0 1px 3px rgba(0,0,0,0.04)',overflow:'hidden'}}>
      <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',padding:'12px 16px',borderBottom:show?'1px solid #F3F4F6':'none'}}>
        <div style={{display:'flex',alignItems:'center',gap:7}}>
          <span style={{fontSize:12,fontWeight:800,color:'#2A3042',textTransform:'uppercase',letterSpacing:'.05em'}}>Time history</span>
          {active>0&&<span style={{fontSize:10,fontWeight:700,padding:'1px 6px',borderRadius:8,background:'#DCFCE7',color:'#166534'}}>{active} active</span>}
          {total>0&&<span style={{fontSize:10,color:'#9CA3AF'}}>{total} entries</span>}
        </div>
        <button onClick={()=>setShow(s=>!s)}
          style={{fontSize:11,fontWeight:600,padding:'4px 10px',borderRadius:8,border:'1px solid #E8ECF0',background:show?'#EEF2FF':'#F9FAFB',color:show?'#3730A3':'#6B7280',cursor:'pointer',display:'flex',alignItems:'center',gap:4}}>
          {show?'Hide':'Show'}
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"
            style={{transform:show?'rotate(180deg)':'rotate(0)',transition:'transform .15s'}}>
            <polyline points="6 9 12 15 18 9"/>
          </svg>
        </button>
      </div>
      {show && <HistoryPanel timeHistory={timeHistory} />}
    </div>
  )
}

function RightPanel({ jobId, toast, rooms, onAddRoom, onOpenRoom, onRoomsChange,
  processes, onProcessesChange, timeHistory, onHistoryChange, activeEntries, onActiveEntriesChange, feedback=[], profile }) {

  const openTasks  = rooms.reduce((a,r)=>{
    const t=r.tasks?(typeof r.tasks==='string'?JSON.parse(r.tasks):r.tasks):[]
    return a+t.filter(x=>!x.done).length
  },0)
  const activeProcs = processes.filter(p=>p.status==='In progress').length

  return (
    <div style={{display:'flex',flexDirection:'column',gap:12}}>
      {/* ── ROOMS ── */}
      <div style={{background:'#fff',borderRadius:16,border:'1px solid #E8ECF0',boxShadow:'0 1px 3px rgba(0,0,0,0.04)',overflow:'hidden'}}>
        <SectionHeader title="Rooms" badge={openTasks>0?`${openTasks} tasks`:null} badgeBg='#FEF9C3' badgeColor='#854D0E' />
        <RoomsPanel rooms={rooms} jobId={jobId} toast={toast}
          onAddRoom={onAddRoom} onOpenRoom={onOpenRoom} onRoomsChange={onRoomsChange} />
      </div>

      {/* ── PROCESSES ── */}
      <div style={{background:'#fff',borderRadius:16,border:'1px solid #E8ECF0',boxShadow:'0 1px 3px rgba(0,0,0,0.04)',overflow:'hidden'}}>
        <SectionHeader title="Processes"
          badge={activeProcs>0?`${activeProcs} active`:processes.length>0?`${processes.length}`:null}
          badgeBg={activeProcs>0?'#DCFCE7':'#F3F4F6'} badgeColor={activeProcs>0?'#166534':'#6B7280'} />
        <ProcessesPanel jobId={jobId} processes={processes}
          onProcessesChange={onProcessesChange} profile={profile} toast={toast}
          activeEntries={activeEntries} onActiveEntriesChange={onActiveEntriesChange}
          onHistoryRefresh={()=>supabase.from('time_entries')
            .select('*,profiles(id,full_name,email),job_processes(id,name,color)')
            .eq('job_id',jobId).order('clocked_in_at',{ascending:false}).limit(30)
            .then(({data})=>onHistoryChange(data||[]))} />
      </div>

      {/* ── HISTORY ── */}
      <HistorySectionWithToggle timeHistory={timeHistory} />

      {/* ── FEEDBACK ── */}
      {feedback.length > 0 && (
        <div style={{background:'#fff',borderRadius:16,border:'1px solid #E8ECF0',boxShadow:'0 1px 3px rgba(0,0,0,0.04)',overflow:'hidden'}}>
          <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',padding:'12px 16px 8px',borderBottom:'1px solid #F3F4F6'}}>
            <div style={{display:'flex',alignItems:'center',gap:7}}>
              <span style={{fontSize:12,fontWeight:800,color:'#2A3042',textTransform:'uppercase',letterSpacing:'.05em'}}>Feedback</span>
              {feedback.filter(f=>f.status==='Open').length > 0 && (
                <span style={{fontSize:10,fontWeight:700,padding:'1px 6px',borderRadius:8,background:'#FEF2F2',color:'#991B1B'}}>
                  {feedback.filter(f=>f.status==='Open').length} open
                </span>
              )}
            </div>
          </div>
          {feedback.map(fb=>{
            const SEV = {Minor:{bg:'#DCFCE7',color:'#166534'},Moderate:{bg:'#FEF9C3',color:'#854D0E'},Major:{bg:'#FEF2F2',color:'#991B1B'}}
            const s = SEV[fb.severity] || SEV.Minor
            return (
              <div key={fb.id} style={{padding:'10px 16px',borderBottom:'1px solid #F9FAFB'}}>
                <div style={{display:'flex',alignItems:'center',gap:6,marginBottom:4}}>
                  <span style={{fontSize:10,fontWeight:700,padding:'2px 7px',borderRadius:8,background:s.bg,color:s.color}}>{fb.severity}</span>
                  <span style={{fontSize:11,fontWeight:600,color:'#374151'}}>{fb.category}</span>
                  <span style={{fontSize:10,color:'#9CA3AF',marginLeft:'auto'}}>{fb.status}</span>
                </div>
                <div style={{fontSize:12,color:'#374151',lineHeight:1.5}}>{fb.message}</div>
                <div style={{fontSize:10,color:'#9CA3AF',marginTop:4}}>
                  {fb.profiles?.full_name || 'Unknown'}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ── Rooms Panel (right column) ───────────────────────────────────
const ROOM_TYPES_LIST = ['Kitchen','Laundry',"Butler's Pantry",'Ensuite','Bathroom','Bedroom','Living','Office','Garage','Other']

// ── Inline Rooms Panel — rooms expand in place ───────────────────
function InlineRoomsPanel({ rooms, jobId, toast, jobMats, allAppliances, onRoomsChange, onSyncJobTasks, autoOpenRoomId, rfis = [], roomStatuses = [] }) {
  const [adding, setAdding] = React.useState(false)
  const [newName, setNewName] = React.useState('')
  const [newType, setNewType] = React.useState('Kitchen')
  const [expandedId, setExpandedId] = React.useState(autoOpenRoomId || null)
  const [sortMode, setSortMode] = React.useState(() => { try { return localStorage.getItem('room_sort_mode') || 'alpha' } catch { return 'alpha' } })

  React.useEffect(() => { try { localStorage.setItem('room_sort_mode', sortMode) } catch {} }, [sortMode])

  // All computed from rooms prop directly — no memos, always fresh
  const priorityOrderedRooms = [...rooms].sort((a, b) => (a.priority || 999) - (b.priority || 999))
  const baseOrderIds = priorityOrderedRooms.map(r => r.id)

  // ── Reorder via up/down arrows, staged locally until Save is pressed ──
  // pendingOrder is null when there are no unsaved changes; otherwise it's the
  // working array of room ids in their new (not-yet-persisted) order.
  const [pendingOrder, setPendingOrder] = React.useState(null)
  const [savingOrder, setSavingOrder] = React.useState(false)

  const workingOrderIds = pendingOrder || baseOrderIds
  const hasUnsavedOrder = pendingOrder !== null

  // Hide Nested and Complete rooms by default
  const [showHidden, setShowHidden] = React.useState(() => { try { return localStorage.getItem("rooms_show_hidden") !== "false" } catch { return true } })
  const HIDDEN_STATUSES = ['Nested', 'Complete']
  function nudgeRoom(roomId, direction) {
    if (sortMode !== 'priority') setSortMode('priority')
    setPendingOrder(prev => {
      const current = prev || baseOrderIds
      const idx = current.indexOf(roomId)
      const targetIdx = idx + direction
      if (idx === -1 || targetIdx < 0 || targetIdx >= current.length) return prev
      const next = [...current]
      ;[next[idx], next[targetIdx]] = [next[targetIdx], next[idx]]
      return next
    })
  }

  async function saveRoomOrder() {
    if (!pendingOrder) return
    setSavingOrder(true)
    const updates = pendingOrder.map((id, i) => ({ id, priority: i + 1 }))
    onRoomsChange(p => p.map(r => {
      const u = updates.find(x => x.id === r.id)
      return u ? { ...r, priority: u.priority } : r
    }))
    await Promise.all(updates.map(u => supabase.from('rooms').update({ priority: u.priority }).eq('id', u.id)))
    setSavingOrder(false)
    setPendingOrder(null)
    toast('Room order saved ✓')
  }

  function cancelRoomOrder() {
    setPendingOrder(null)
  }

  // Set a room's priority directly from the number dropdown — shifts everything else
  // between the old and new position by one to keep numbers contiguous 1..N
  async function setRoomPriority(room, newPriority) {
    const ordered = priorityOrderedRooms
    const currentPriority = room.priority || (ordered.findIndex(r => r.id === room.id) + 1)
    if (newPriority === currentPriority) return

    const updates = []
    ordered.forEach((r, i) => {
      const p = r.priority || (i + 1)
      if (r.id === room.id) {
        updates.push({ id: r.id, priority: newPriority })
      } else if (newPriority < currentPriority && p >= newPriority && p < currentPriority) {
        updates.push({ id: r.id, priority: p + 1 })
      } else if (newPriority > currentPriority && p <= newPriority && p > currentPriority) {
        updates.push({ id: r.id, priority: p - 1 })
      }
    })

    await Promise.all(updates.map(u => supabase.from('rooms').update({ priority: u.priority }).eq('id', u.id)))
    onRoomsChange(p => p.map(r => {
      const u = updates.find(x => x.id === r.id)
      return u ? { ...r, priority: u.priority } : r
    }))
  }

  // Compute RFI status per room directly in render (no memo) — this guarantees it
  // always reflects the current rfis prop on every render, with no caching that
  // could cause stale values when rfis arrives after the initial render.
  const _today = new Date(); _today.setHours(0,0,0,0)
  const roomRfiStatus = {}
  rooms.forEach(room => {
    const roomRfis = rfis.filter(r => r.room_id === room.id)
    const openRfis = roomRfis.filter(r => r.status === 'Open' || r.status === 'In Review')
    const overdueRfis = openRfis.filter(r => r.due_date && new Date(r.due_date) < _today)
    roomRfiStatus[room.id] = {
      roomRfis, openRfis, overdueRfis,
      color: roomRfis.length === 0 ? null : overdueRfis.length > 0 ? '#E24B4A' : openRfis.length > 0 ? '#F97316' : '#1D9E75',
      title: roomRfis.length === 0 ? 'No RFIs' : overdueRfis.length > 0 ? `${overdueRfis.length} overdue RFI${overdueRfis.length!==1?'s':''}` : openRfis.length > 0 ? `${openRfis.length} open RFI${openRfis.length!==1?'s':''}` : `All ${roomRfis.length} RFIs resolved`,
    }
  })
  // Compute sortedRooms directly (no memo) so it always reflects current props
  let sortedRooms
  if (hasUnsavedOrder) {
    sortedRooms = workingOrderIds.map(id => rooms.find(r => r.id === id)).filter(Boolean)
  } else {
    sortedRooms = [...rooms]
    if (sortMode === 'priority') {
      sortedRooms.sort((a, b) => {
        const pa = a.priority || 999
        const pb = b.priority || 999
        if (pa !== pb) return pa - pb
        return (a.name || '').localeCompare(b.name || '')
      })
    } else {
      sortedRooms.sort((a, b) => (a.name || '').localeCompare(b.name || ''))
    }
  }

  // Re-open the requested room whenever autoOpenRoomId changes (e.g. clicked from Overview tab),
  // not just on first mount — autoOpenRoomId may have a "_<timestamp>" suffix appended so that
  // clicking the same room twice in a row still re-triggers this effect
  React.useEffect(() => {
    if (autoOpenRoomId) setExpandedId(autoOpenRoomId.split('_')[0])
  }, [autoOpenRoomId])

  async function addRoom() {
    const name = newType === 'Other' ? (newName.trim() || 'Other') : newType
    const { data, error } = await supabase.from('rooms').insert({
      job_id: jobId, name, type: newType, sort_order: rooms.length, tasks: '[]', priority: rooms.length + 1,
    }).select().single()
    if (error) { toast(error.message, 'error'); return }
    onRoomsChange(p => [...p, data])
    setNewName(''); setNewType('Kitchen'); setAdding(false)
    setExpandedId(data.id)
    toast(`${name} added ✓`)
  }

  async function deleteRoom(e, roomId) {
    e.stopPropagation()
    if (!confirm('Delete this room and all its data?')) return
    await supabase.from('rooms').delete().eq('id', roomId)
    onRoomsChange(prev => prev.filter(r => r.id !== roomId))
    if (expandedId === roomId) setExpandedId(null)
    toast('Room deleted')
  }

  return (
    <div>
      {/* header */}
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:12, gap:10, flexWrap:'wrap' }}>
        <div style={{ fontSize:13, fontWeight:700, color:'#2A3042' }}>
          Rooms {rooms.length > 0 && <span style={{ fontSize:11, fontWeight:600, color:'#9CA3AF' }}>({rooms.length})</span>}
        </div>
        <div style={{ display:'flex', alignItems:'center', gap:8 }}>
          {rooms.length > 1 && (
            <div style={{ display:'flex', background:'#F3F4F6', borderRadius:8, padding:2 }}>
              <button onClick={() => setSortMode('alpha')}
                style={{ fontSize:11, fontWeight:600, padding:'5px 10px', borderRadius:6, border:'none', cursor:'pointer',
                  background: sortMode==='alpha' ? '#fff' : 'transparent', color: sortMode==='alpha' ? '#2A3042' : '#9CA3AF',
                  boxShadow: sortMode==='alpha' ? '0 1px 2px rgba(0,0,0,0.08)' : 'none' }}>
                A–Z
              </button>
              <button onClick={() => setSortMode('priority')}
                style={{ fontSize:11, fontWeight:600, padding:'5px 10px', borderRadius:6, border:'none', cursor:'pointer',
                  background: sortMode==='priority' ? '#fff' : 'transparent', color: sortMode==='priority' ? '#2A3042' : '#9CA3AF',
                  boxShadow: sortMode==='priority' ? '0 1px 2px rgba(0,0,0,0.08)' : 'none' }}>
                Priority
              </button>
            </div>
          )}
          <button onClick={() => setAdding(a=>!a)}
            style={{ fontSize:12, fontWeight:700, padding:'6px 14px', borderRadius:8, border:'none', background:adding?'#F3F4F6':'#5B8AF0', color:adding?'#6B7280':'#fff', cursor:'pointer' }}>
            {adding ? 'Cancel' : '+ Add room'}
          </button>
        </div>
      </div>

      {/* Unsaved reorder banner */}
      {hasUnsavedOrder && (
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', gap:10, background:'#FFF7ED', border:'1px solid #FDBA74', borderRadius:10, padding:'10px 14px', marginBottom:12 }}>
          <div style={{ fontSize:12, fontWeight:600, color:'#C2410C' }}>
            Build order changed — not saved yet
          </div>
          <div style={{ display:'flex', gap:8 }}>
            <button onClick={cancelRoomOrder} disabled={savingOrder}
              style={{ fontSize:12, fontWeight:600, padding:'6px 14px', borderRadius:8, border:'1px solid #E8ECF0', background:'#fff', color:'#6B7280', cursor:'pointer' }}>
              Cancel
            </button>
            <button onClick={saveRoomOrder} disabled={savingOrder}
              style={{ fontSize:12, fontWeight:700, padding:'6px 16px', borderRadius:8, border:'none', background:'#1D9E75', color:'#fff', cursor:'pointer' }}>
              {savingOrder ? 'Saving…' : 'Save order'}
            </button>
          </div>
        </div>
      )}

      {/* add form */}
      {adding && (
        <div style={{ background:'#fff', borderRadius:12, border:'1px solid #C4D4F8', padding:14, marginBottom:12 }}>
          <select value={newType} onChange={e=>{ setNewType(e.target.value); setNewName('') }}
            style={{ width:'100%', padding:'7px 10px', border:'1px solid #DDE3EC', borderRadius:8, fontSize:13, outline:'none', marginBottom:8, background:'#fff' }}>
            {ROOM_TYPES_LIST.map(t=><option key={t}>{t}</option>)}
          </select>
          {newType === 'Other' && (
            <input autoFocus value={newName} onChange={e=>setNewName(e.target.value)}
              placeholder="Enter room name…" onKeyDown={e=>e.key==='Enter'&&addRoom()}
              style={{ width:'100%', padding:'7px 10px', border:'1px solid #DDE3EC', borderRadius:8, fontSize:13, outline:'none', marginBottom:8, boxSizing:'border-box' }} />
          )}
          <button onClick={addRoom}
            style={{ width:'100%', padding:'9px', borderRadius:8, border:'none', background:'#5B8AF0', color:'#fff', fontSize:13, fontWeight:700, cursor:'pointer' }}>
            Create room
          </button>
        </div>
      )}

      {/* empty state */}
      {rooms.length === 0 && !adding && (
        <div style={{ background:'#fff', borderRadius:16, border:'1px solid #E8ECF0', padding:'40px 16px', textAlign:'center' }}>
          <div style={{ fontSize:32, marginBottom:8 }}>🏠</div>
          <div style={{ fontSize:13, fontWeight:600, color:'#374151', marginBottom:4 }}>No rooms yet</div>
          <div style={{ fontSize:12, color:'#9CA3AF', marginBottom:14 }}>Add rooms to track specs, materials and tasks</div>
          <button onClick={()=>setAdding(true)}
            style={{ fontSize:12, fontWeight:700, padding:'8px 18px', borderRadius:9, border:'none', background:'#5B8AF0', color:'#fff', cursor:'pointer' }}>
            + Add first room
          </button>
        </div>
      )}

      {/* room list with inline expansion */}
      {sortedRooms.filter(r => HIDDEN_STATUSES.includes(r.status || '')).length > 0 && (
        <div style={{ display:'flex', alignItems:'center', justifyContent:'flex-end', marginBottom:6 }}>
          <button onClick={() => setShowHidden(s => { const next = !s; try { localStorage.setItem('rooms_show_hidden', String(next)) } catch {} return next })}
            style={{ fontSize:11, fontWeight:600, padding:'5px 12px', borderRadius:8, border:'1px solid #E8ECF0', background:'#fff', color:'#6B7280', cursor:'pointer', display:'flex', alignItems:'center', gap:5 }}>
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              {showHidden
                ? <><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></>
                : <><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/><path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/><line x1="1" y1="1" x2="23" y2="23"/></>}
            </svg>
            {showHidden
              ? `Hide completed (${sortedRooms.filter(r => HIDDEN_STATUSES.includes(r.status || '')).length})`
              : `Show completed (${sortedRooms.filter(r => HIDDEN_STATUSES.includes(r.status || '')).length})`}
          </button>
        </div>
      )}
      <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
        {(showHidden ? sortedRooms : sortedRooms.filter(r => !HIDDEN_STATUSES.includes(r.status || ''))).map(room => {
          const isOpen = expandedId === room.id
          const tasks = room.tasks ? (typeof room.tasks==='string'?JSON.parse(room.tasks):room.tasks) : []
          const open = tasks.filter(t=>!t.done).length
          const TODAY = new Date(); TODAY.setHours(0,0,0,0)
          const overdueTasks = tasks.filter(t => !t.done && t.date && new Date(t.date) < TODAY).length
          const allTasksDone = tasks.length > 0 && open === 0

          // Task icon: red if overdue, orange if open, green if all done, grey if no tasks
          const taskIconColor = tasks.length === 0 ? null : overdueTasks > 0 ? '#E24B4A' : open > 0 ? '#F97316' : '#1D9E75'
          const taskIconTitle = tasks.length === 0 ? 'No tasks' : overdueTasks > 0 ? `${overdueTasks} overdue task${overdueTasks!==1?'s':''}` : open > 0 ? `${open} task${open!==1?'s':''} open` : `All ${tasks.length} tasks done`

          // RFI status — from pre-computed lookup so it's always in sync with latest rfis prop
          const { roomRfis = [], openRfis = [], overdueRfis = [], color: rfiIconColor = null, title: rfiIconTitle = '' } = roomRfiStatus[room.id] || {}

          const defaultEmoji = room.type==='Kitchen'?'🍳':room.type==='Laundry'?'🫧':room.type==='Bathroom'||room.type==='Ensuite'?'🚿':room.type==='Bedroom'?'🛏':room.type==='Living'?'🛋':room.type==='Office'?'💼':'🏠'
          const emoji = room.icon || defaultEmoji
          const roomStatus = room.status || 'Pending'
          const statusObj = roomStatuses.find(s => s.label === roomStatus) || roomStatuses[0]
          const workingIdx = workingOrderIds.indexOf(room.id)
          const roomPriority = workingIdx + 1
          return (
            <div key={room.id}
              style={{
                borderRadius:12,
                border: '1px solid #E8ECF0',
                overflow:'hidden', background:'#fff',
              }}>
              {/* room header row */}
              <div onClick={() => setExpandedId(isOpen ? null : room.id)}
                style={{ display:'flex', alignItems:'center', gap:8, padding:'12px 14px', cursor:'pointer',
                  background: isOpen ? '#F8F9FF' : '#fff',
                  borderBottom: isOpen ? '1px solid #E8ECF0' : 'none' }}
                onMouseEnter={e=>{ if(!isOpen) e.currentTarget.style.background='#F9FAFB' }}
                onMouseLeave={e=>{ if(!isOpen) e.currentTarget.style.background=isOpen?'#F8F9FF':'#fff' }}>
                <RoomIconBtn emoji={emoji} onPick={async icon => {
                  const { error } = await supabase.from('rooms').update({ icon }).eq('id', room.id)
                  if (error) {
                    toast(error.message.includes('column') ? 'Run SQL: alter table rooms add column if not exists icon text;' : error.message, 'error')
                    return
                  }
                  onRoomsChange(p => p.map(r => r.id===room.id ? {...r, icon} : r))
                }} />
                <div style={{ flex:1, minWidth:0 }}>
                  <div style={{ fontSize:14, fontWeight:700, color:'#2A3042' }}>{room.name}</div>
                  {!isOpen && <div style={{ fontSize:11, color:'#9CA3AF' }}>{room.type}</div>}
                </div>

                {/* Right-side controls — fixed layout so every row aligns regardless of content.
                    Task badge · Priority arrows · Status dropdown */}
                <div style={{ display:'flex', alignItems:'center', gap:6, flexShrink:0 }}>

                  {/* Task status — fixed 40px wide so rows stay aligned when some have tasks and some don't */}
                  <div style={{ width:40, display:'flex', justifyContent:'center' }}>
                    {taskIconColor ? (
                      <span title={taskIconTitle}
                        style={{ display:'flex', alignItems:'center', gap:2, fontSize:10, fontWeight:700, padding:'3px 6px', borderRadius:6, background:`${taskIconColor}18`, color:taskIconColor, border:`1px solid ${taskIconColor}30`, whiteSpace:'nowrap' }}>
                        <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="9 11 12 14 22 4"/><path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11"/></svg>
                        {allTasksDone ? '✓' : open}
                      </span>
                    ) : null}
                  </div>

                  {/* RFI status — fixed 40px wide, only shows if this room has RFIs assigned */}
                  <div style={{ width:40, display:'flex', justifyContent:'center' }}>
                    {rfiIconColor ? (
                      <span title={rfiIconTitle}
                        style={{ display:'flex', alignItems:'center', gap:2, fontSize:10, fontWeight:700, padding:'3px 6px', borderRadius:6, background:`${rfiIconColor}18`, color:rfiIconColor, border:`1px solid ${rfiIconColor}30`, whiteSpace:'nowrap' }}>
                        <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
                        {openRfis.length === 0 ? '✓' : openRfis.length}
                      </span>
                    ) : null}
                  </div>

                  {/* Priority arrows + number — fixed width */}
                  <div onClick={e => e.stopPropagation()}
                    style={{ display:'flex', alignItems:'center', gap:2, flexShrink:0 }}>
                    <button onClick={() => nudgeRoom(room.id, -1)} disabled={workingIdx <= 0}
                      title="Move up in build order"
                      style={{ width:20, height:20, display:'flex', alignItems:'center', justifyContent:'center', background:'none', border:'none', cursor: workingIdx<=0 ? 'default' : 'pointer', color: workingIdx<=0 ? '#E8ECF0' : '#5B8AF0', padding:0 }}>
                      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><polyline points="18 15 12 9 6 15"/></svg>
                    </button>
                    <span title="Build priority order"
                      style={{ fontSize:11, fontWeight:700, padding:'3px 0', borderRadius:7, border: hasUnsavedOrder ? '1px solid #FDBA74' : '1px solid #C4D4F8', background: hasUnsavedOrder ? '#FFF7ED' : '#F0F4FF', color: hasUnsavedOrder ? '#C2410C' : '#3730A3', width:24, textAlign:'center', display:'inline-block' }}>
                      {roomPriority}
                    </span>
                    <button onClick={() => nudgeRoom(room.id, 1)} disabled={workingIdx >= workingOrderIds.length - 1}
                      title="Move down in build order"
                      style={{ width:20, height:20, display:'flex', alignItems:'center', justifyContent:'center', background:'none', border:'none', cursor: workingIdx>=workingOrderIds.length-1 ? 'default' : 'pointer', color: workingIdx>=workingOrderIds.length-1 ? '#E8ECF0' : '#5B8AF0', padding:0 }}>
                      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><polyline points="6 9 12 15 18 9"/></svg>
                    </button>
                  </div>

                  {/* Status dropdown — fixed width */}
                  <select
                    value={roomStatus}
                    onClick={e => e.stopPropagation()}
                    onChange={async e => {
                      e.stopPropagation()
                      const newStatus = e.target.value
                      if (newStatus === roomStatus) return
                      if (!confirm(`Change "${room.name}" status from "${roomStatus}" to "${newStatus}"?`)) {
                        e.target.value = roomStatus
                        return
                      }
                      const now = new Date().toISOString()
                      await supabase.from('rooms').update({ status: newStatus, status_changed_at: now, status_changed_from: roomStatus }).eq('id', room.id)
                      onRoomsChange(p => p.map(r => r.id===room.id ? {...r, status: newStatus, status_changed_at: now, status_changed_from: roomStatus} : r))
                    }}
                    style={{
                      padding:'3px 6px', borderRadius:7, border:`1px solid ${statusObj?.color||'#E8ECF0'}22`,
                      background: `${statusObj?.color||'#9CA3AF'}18`,
                      color: statusObj?.color||'#6B7280',
                      fontSize:11, fontWeight:700, cursor:'pointer', outline:'none',
                      width:120, flexShrink:0,
                    }}>
                    {roomStatuses.map(s => <option key={s.label} value={s.label}>{s.label}</option>)}
                  </select>

                  {/* Delete + chevron */}
                  <button onClick={e=>deleteRoom(e,room.id)}
                    style={{ background:'none', border:'none', cursor:'pointer', color:'#D1D5DB', fontSize:16, padding:'0 2px', flexShrink:0 }}
                    onMouseEnter={e=>{e.stopPropagation();e.currentTarget.style.color='#E24B4A'}}
                    onMouseLeave={e=>e.currentTarget.style.color='#D1D5DB'}>×</button>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#9CA3AF" strokeWidth="2"
                    style={{ transform: isOpen?'rotate(90deg)':'rotate(0)', transition:'transform .15s', flexShrink:0 }}>
                    <polyline points="9 18 15 12 9 6"/>
                  </svg>
                </div>
              </div>

              {/* inline room detail */}
              {isOpen && (
                <div style={{ borderTop:'1px solid #E8ECF0' }}>
                  {/* ── Task & RFI quick-summary panel at top of expanded room ── */}
                  {(tasks.length > 0 || roomRfis.length > 0) && (
                    <div style={{ display:'flex', gap:12, padding:'10px 14px', background:'#F8F9FF', borderBottom:'1px solid #E8ECF0', flexWrap:'wrap' }}>
                      {tasks.length > 0 && (
                        <div style={{ display:'flex', alignItems:'center', gap:6, flex:1, minWidth:160 }}>
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={taskIconColor||'#9CA3AF'} strokeWidth="2.5"><polyline points="9 11 12 14 22 4"/><path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11"/></svg>
                          <span style={{ fontSize:12, fontWeight:700, color:taskIconColor||'#9CA3AF' }}>
                            {allTasksDone ? `All ${tasks.length} tasks done` : overdueTasks > 0 ? `${overdueTasks} task${overdueTasks!==1?'s':''} overdue` : `${open} of ${tasks.length} task${tasks.length!==1?'s':''} open`}
                          </span>
                          {!allTasksDone && (
                            <div style={{ display:'flex', flexDirection:'column', gap:2, flex:1 }}>
                              {tasks.filter(t=>!t.done).slice(0,3).map((t,i) => (
                                <div key={i} style={{ fontSize:11, color: (t.date && new Date(t.date) < TODAY) ? '#E24B4A' : '#6B7280', display:'flex', alignItems:'center', gap:4 }}>
                                  <span style={{ width:4, height:4, borderRadius:'50%', background: (t.date && new Date(t.date) < TODAY) ? '#E24B4A' : '#9CA3AF', flexShrink:0 }} />
                                  <span style={{ overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{t.text}</span>
                                  {t.date && <span style={{ flexShrink:0, color: (new Date(t.date) < TODAY) ? '#E24B4A' : '#9CA3AF' }}>· {new Date(t.date).toLocaleDateString('en-NZ',{day:'numeric',month:'short'})}</span>}
                                </div>
                              ))}
                              {open > 3 && <div style={{ fontSize:10, color:'#9CA3AF' }}>+{open-3} more</div>}
                            </div>
                          )}
                        </div>
                      )}
                      {roomRfis.length > 0 && (
                        <div style={{ display:'flex', alignItems:'flex-start', gap:6, flex:1, minWidth:160 }}>
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={rfiIconColor||'#9CA3AF'} strokeWidth="2.5" style={{ marginTop:1, flexShrink:0 }}><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
                          <div>
                            <div style={{ fontSize:12, fontWeight:700, color:rfiIconColor||'#9CA3AF', marginBottom:2 }}>
                              {openRfis.length === 0 ? `All ${roomRfis.length} RFIs resolved` : overdueRfis.length > 0 ? `${overdueRfis.length} RFI${overdueRfis.length!==1?'s':''} overdue` : `${openRfis.length} open RFI${openRfis.length!==1?'s':''}`}
                            </div>
                            {openRfis.slice(0,2).map(r => (
                              <div key={r.id} style={{ fontSize:11, color: (r.due_date && new Date(r.due_date) < TODAY) ? '#E24B4A' : '#6B7280', display:'flex', alignItems:'center', gap:4 }}>
                                <span style={{ width:4, height:4, borderRadius:'50%', background: (r.due_date && new Date(r.due_date) < TODAY) ? '#E24B4A' : '#9CA3AF', flexShrink:0 }} />
                                <span style={{ overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{r.title}</span>
                                <span style={{ flexShrink:0, fontSize:10, color:'#9CA3AF', padding:'1px 5px', borderRadius:5, background:'#F3F4F6' }}>{r.status}</span>
                              </div>
                            ))}
                            {openRfis.length > 2 && <div style={{ fontSize:10, color:'#9CA3AF' }}>+{openRfis.length-2} more</div>}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                  <RoomDetail
                    room={room} jobId={jobId} jobMats={jobMats} allAppliances={allAppliances}
                    inline={true}
                    onClose={() => setExpandedId(null)}
                    onSave={saved => onRoomsChange(p=>p.map(r=>r.id===saved.id?saved:r))}
                    onSyncJobTasks={onSyncJobTasks}
                  />
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

function RoomsPanel({ rooms, jobId, toast, onAddRoom, onOpenRoom, onRoomsChange }) {
  const [adding, setAdding] = React.useState(false)
  const [newName, setNewName] = React.useState('')
  const [newType, setNewType] = React.useState('Kitchen')
  const inputRef = React.useRef()

  React.useEffect(() => { if (adding && inputRef.current) inputRef.current.focus() }, [adding])

  async function addRoom() {
    const name = newType === 'Other' ? (newName.trim() || 'Other') : newType
    const { data, error } = await supabase.from('rooms').insert({
      job_id: jobId, name, type: newType, sort_order: rooms.length, tasks: '[]', priority: rooms.length + 1,
    }).select().single()
    if (error) { toast(error.message, 'error'); return }
    onAddRoom(data)
    setNewName(''); setNewType('Kitchen'); setAdding(false)
    toast(`${name} added ✓`)
  }

  async function deleteRoom(e, roomId) {
    e.stopPropagation()
    if (!confirm('Delete this room and all its data?')) return
    await supabase.from('rooms').delete().eq('id', roomId)
    onRoomsChange(prev => prev.filter(r => r.id !== roomId))
    toast('Room deleted')
  }

  const totalTasks = rooms.reduce((a, r) => {
    const tasks = r.tasks ? (typeof r.tasks==='string'?JSON.parse(r.tasks):r.tasks) : []
    return a + tasks.filter(t=>!t.done).length
  }, 0)

  return (
    <div style={{ background:'#fff', borderRadius:16, border:'1px solid #E8ECF0', boxShadow:'0 1px 3px rgba(0,0,0,0.04)', overflow:'hidden' }}>
      {/* header */}
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'14px 16px', borderBottom:'1px solid #F3F4F6' }}>
        <div style={{ display:'flex', alignItems:'center', gap:8 }}>
          <span style={{ fontSize:16 }}>🏠</span>
          <span style={{ fontSize:13, fontWeight:800, color:'#2A3042' }}>Rooms</span>
          {rooms.length > 0 && <span style={{ fontSize:11, fontWeight:700, padding:'1px 7px', borderRadius:10, background:'#EEF2FF', color:'#5B8AF0' }}>{rooms.length}</span>}
          {totalTasks > 0 && <span style={{ fontSize:11, fontWeight:700, padding:'1px 7px', borderRadius:10, background:'#FEF9C3', color:'#854D0E' }}>{totalTasks} task{totalTasks!==1?'s':''}</span>}
        </div>
        <button onClick={() => setAdding(a=>!a)}
          style={{ fontSize:12, fontWeight:700, padding:'5px 12px', borderRadius:8, border:'none', background:adding?'#F3F4F6':'#5B8AF0', color:adding?'#6B7280':'#fff', cursor:'pointer', transition:'all .15s' }}>
          {adding ? 'Cancel' : '+ Add room'}
        </button>
      </div>

      {/* add form */}
      {adding && (
        <div style={{ padding:'12px 16px', borderBottom:'1px solid #F3F4F6', background:'#F9FAFB' }}>
          <select value={newType} onChange={e=>{ setNewType(e.target.value); setNewName('') }}
            style={{ width:'100%', padding:'7px 10px', border:'1px solid #DDE3EC', borderRadius:8, fontSize:13, outline:'none', marginBottom:8, background:'#fff' }}>
            {ROOM_TYPES_LIST.map(t=><option key={t}>{t}</option>)}
          </select>
          {newType === 'Other' && (
            <input ref={inputRef} value={newName} onChange={e=>setNewName(e.target.value)}
              placeholder="Enter room name…"
              onKeyDown={e=>e.key==='Enter'&&addRoom()}
              autoFocus
              style={{ width:'100%', padding:'7px 10px', border:'1px solid #DDE3EC', borderRadius:8, fontSize:13, outline:'none', marginBottom:8, boxSizing:'border-box' }} />
          )}
          <button onClick={addRoom}
            style={{ width:'100%', padding:'8px', borderRadius:8, border:'none', background:'#5B8AF0', color:'#fff', fontSize:13, fontWeight:700, cursor:'pointer' }}>
            Create room
          </button>
        </div>
      )}

      {/* rooms list */}
      {rooms.length === 0 && !adding ? (
        <div style={{ padding:'32px 16px', textAlign:'center' }}>
          <div style={{ fontSize:28, marginBottom:8 }}>🏠</div>
          <div style={{ fontSize:13, fontWeight:600, color:'#374151', marginBottom:4 }}>No rooms yet</div>
          <div style={{ fontSize:12, color:'#9CA3AF', lineHeight:1.5 }}>Add rooms to track specs, materials and tasks per area of the job</div>
          <button onClick={()=>setAdding(true)}
            style={{ marginTop:14, fontSize:12, fontWeight:700, padding:'8px 18px', borderRadius:9, border:'none', background:'#5B8AF0', color:'#fff', cursor:'pointer' }}>
            + Add first room
          </button>
        </div>
      ) : (
        <div>
          {rooms.map((room, idx) => {
            const tasks = room.tasks ? (typeof room.tasks==='string'?JSON.parse(room.tasks):room.tasks) : []
            const open   = tasks.filter(t=>!t.done).length
            const done   = tasks.filter(t=>t.done).length
            const specs  = room.kitchen_specs
              ? (typeof room.kitchen_specs==='string'?JSON.parse(room.kitchen_specs):room.kitchen_specs) : {}
            const specCount = Object.keys(specs).filter(k=>specs[k]).length
            const pct = tasks.length > 0 ? Math.round((done/tasks.length)*100) : 0

            return (
              <div key={room.id} onClick={() => onOpenRoom(room)}
                style={{ padding:'12px 16px', borderBottom: idx<rooms.length-1?'1px solid #F3F4F6':'none', cursor:'pointer', transition:'background .1s' }}
                onMouseEnter={e=>e.currentTarget.style.background='#F8FAFF'}
                onMouseLeave={e=>e.currentTarget.style.background='transparent'}>
                <div style={{ display:'flex', alignItems:'flex-start', gap:10 }}>
                  {/* room icon */}
                  <div style={{ width:36, height:36, borderRadius:9, background:'linear-gradient(135deg,#EEF2FF,#E0E7FF)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:18, flexShrink:0 }}>
                    {room.icon || (room.type==='Kitchen'?'🍳':room.type==='Laundry'?'🫧':room.type==='Bathroom'||room.type==='Ensuite'?'🚿':room.type==='Bedroom'?'🛏':room.type==='Living'?'🛋':room.type==='Office'?'💼':'🏠')}
                  </div>
                  <div style={{ flex:1, minWidth:0 }}>
                    <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', gap:4 }}>
                      <div style={{ fontSize:14, fontWeight:700, color:'#2A3042', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{room.name}</div>
                      <button onClick={e=>deleteRoom(e,room.id)}
                        style={{ background:'none', border:'none', cursor:'pointer', color:'#E8ECF0', fontSize:14, lineHeight:1, flexShrink:0, padding:'0 2px' }}
                        onMouseEnter={e=>{e.stopPropagation();e.currentTarget.style.color='#E24B4A'}}
                        onMouseLeave={e=>e.currentTarget.style.color='#E8ECF0'}>×</button>
                    </div>
                    <div style={{ fontSize:11, color:'#9CA3AF', marginTop:2 }}>{room.type}</div>
                    {/* stats row */}
                    <div style={{ display:'flex', gap:8, marginTop:6, flexWrap:'wrap' }}>
                      {tasks.length > 0 && (
                        <span style={{ fontSize:10, fontWeight:600, padding:'2px 7px', borderRadius:8, background: open>0?'#FEF9C3':'#ECFDF5', color: open>0?'#854D0E':'#065F46' }}>
                          {open > 0 ? `${open} task${open!==1?'s':''} open` : '✓ All done'}
                        </span>
                      )}
                      {specCount > 0 && (
                        <span style={{ fontSize:10, fontWeight:600, padding:'2px 7px', borderRadius:8, background:'#F0F4FF', color:'#3730A3' }}>
                          {specCount} spec{specCount!==1?'s':''}
                        </span>
                      )}
                    </div>
                    {/* task progress bar */}
                    {tasks.length > 0 && (
                      <div style={{ marginTop:7, height:3, background:'#F3F4F6', borderRadius:2, overflow:'hidden' }}>
                        <div style={{ height:'100%', width:`${pct}%`, background: pct===100?'#1D9E75':'#5B8AF0', borderRadius:2, transition:'width .3s' }}/>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )
          })}
          {/* add another */}
          {!adding && (
            <div onClick={()=>setAdding(true)}
              style={{ padding:'10px 16px', borderTop:'1px solid #F3F4F6', display:'flex', alignItems:'center', gap:6, cursor:'pointer', color:'#9CA3AF', fontSize:12, background:'#FAFAFA' }}
              onMouseEnter={e=>e.currentTarget.style.background='#F3F4F6'}
              onMouseLeave={e=>e.currentTarget.style.background='#FAFAFA'}>
              <span style={{ fontSize:16, lineHeight:1 }}>+</span> Add another room
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ── Startup Floating Panel ───────────────────────────────────────
// ── Renders startup note content inline ──────────────────────────
// ── Inline startup note — Notion-style, saves only when content exists ──
function InlineStartupNote({ jobId, job, startupNote, onNoteChange }) {
  const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2)
  const EMPTY_BLOCKS = [
    { id: uid(), type: 'heading2', content: 'Meeting notes' },
    { id: uid(), type: 'paragraph', content: '' },
  ]

  const [blocks, setBlocks] = React.useState(() => {
    if (!startupNote?.content) return EMPTY_BLOCKS
    try {
      const parsed = typeof startupNote.content === 'string'
        ? JSON.parse(startupNote.content)
        : startupNote.content
      return parsed?.blocks?.length ? parsed.blocks : EMPTY_BLOCKS
    } catch { return EMPTY_BLOCKS }
  })
  const [saving, setSaving] = React.useState(false)
  const [savedAt, setSavedAt] = React.useState(null)
  const saveTimer = React.useRef(null)
  const noteIdRef = React.useRef(startupNote?.id || null)

  // Update blocks when startupNote changes externally
  React.useEffect(() => {
    if (startupNote?.content && !noteIdRef.current) {
      noteIdRef.current = startupNote.id
    }
  }, [startupNote])

  function hasContent(blks) {
    return blks.some(b => b.content && b.content.trim() && b.type !== 'heading2')
  }

  async function saveBlocks(blks) {
    if (!hasContent(blks)) return // Don't save empty notes
    setSaving(true)
    const content = JSON.stringify({ blocks: blks })
    if (noteIdRef.current) {
      await supabase.from('notes').update({ content, updated_at: new Date().toISOString() }).eq('id', noteIdRef.current)
    } else {
      // Create the note for the first time
      const { data } = await supabase.from('notes').insert({
        job_id: jobId, title: `Startup — ${job?.name || jobId}`,
        content, is_startup: true, is_public: true,
        created_by: (await supabase.auth.getUser()).data.user?.id
      }).select().single()
      if (data) { noteIdRef.current = data.id; onNoteChange(data) }
    }
    setSaving(false)
    setSavedAt(new Date())
  }

  function updateBlock(id, patch) {
    const updated = blocks.map(b => b.id === id ? { ...b, ...patch } : b)
    setBlocks(updated)
    clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(() => saveBlocks(updated), 1200)
  }

  function addBlockAfter(id, type = 'paragraph') {
    const idx = blocks.findIndex(b => b.id === id)
    const newBlock = { id: uid(), type, content: '' }
    const updated = [...blocks.slice(0, idx + 1), newBlock, ...blocks.slice(idx + 1)]
    setBlocks(updated)
    setTimeout(() => document.getElementById('block_' + newBlock.id)?.focus(), 10)
  }

  function deleteBlock(id) {
    if (blocks.length <= 1) return
    const idx = blocks.findIndex(b => b.id === id)
    const updated = blocks.filter(b => b.id !== id)
    setBlocks(updated)
    clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(() => saveBlocks(updated), 1200)
    // Focus previous block
    const prev = blocks[Math.max(0, idx - 1)]
    setTimeout(() => document.getElementById('block_' + prev?.id)?.focus(), 10)
  }

  const blockStyle = (type) => {
    if (type === 'heading1') return { fontSize:22, fontWeight:800, color:'#2A3042', outline:'none', width:'100%', border:'none', background:'transparent', fontFamily:'inherit', padding:'2px 0', lineHeight:1.3 }
    if (type === 'heading2') return { fontSize:17, fontWeight:700, color:'#2A3042', outline:'none', width:'100%', border:'none', background:'transparent', fontFamily:'inherit', padding:'2px 0', lineHeight:1.4, marginTop:8 }
    if (type === 'heading3') return { fontSize:14, fontWeight:700, color:'#374151', outline:'none', width:'100%', border:'none', background:'transparent', fontFamily:'inherit', padding:'2px 0' }
    if (type === 'bullet')   return { fontSize:14, color:'#374151', outline:'none', width:'calc(100% - 20px)', border:'none', background:'transparent', fontFamily:'inherit', padding:'2px 0', lineHeight:1.6 }
    return { fontSize:14, color:'#374151', outline:'none', width:'100%', border:'none', background:'transparent', fontFamily:'inherit', padding:'2px 0', lineHeight:1.7 }
  }

  const placeholder = (type) => {
    if (type === 'heading1') return 'Heading 1'
    if (type === 'heading2') return 'Heading 2'
    if (type === 'heading3') return 'Heading 3'
    if (type === 'bullet') return 'List item'
    return "Type '/' for commands…"
  }

  return (
    <div style={{ background:'#fff', borderRadius:12, border:'1px solid #E8ECF0', boxShadow:'0 1px 3px rgba(0,0,0,0.04)', overflow:'hidden', minHeight:300 }}>
      {/* toolbar */}
      <div style={{ padding:'10px 16px', borderBottom:'1px solid #F3F4F6', display:'flex', alignItems:'center', justifyContent:'space-between' }}>
        <span style={{ fontSize:13, fontWeight:700, color:'#2A3042' }}>🚀 Startup Notes</span>
        <div style={{ display:'flex', alignItems:'center', gap:8 }}>
          {saving && <span style={{ fontSize:11, color:'#9CA3AF' }}>Saving…</span>}
          {savedAt && !saving && <span style={{ fontSize:11, color:'#1D9E75' }}>✓ Saved</span>}
          {!hasContent(blocks) && <span style={{ fontSize:11, color:'#C4C9D4' }}>Nothing saved yet</span>}
        </div>
      </div>

      {/* blocks */}
      <div style={{ padding:'16px 20px' }}>
        {blocks.map((b, i) => (
          <div key={b.id} style={{ display:'flex', alignItems:'flex-start', gap:6, marginBottom:2,
            position:'relative' }}
            onMouseEnter={e=>e.currentTarget.querySelector('.blk-handle')?.style && (e.currentTarget.querySelector('.blk-handle').style.opacity='1')}
            onMouseLeave={e=>e.currentTarget.querySelector('.blk-handle')?.style && (e.currentTarget.querySelector('.blk-handle').style.opacity='0')}>
            {b.type === 'bullet' && <span style={{ color:'#9CA3AF', marginTop:4, flexShrink:0, fontSize:16, lineHeight:1.7 }}>•</span>}
            {b.type === 'divider'
              ? <hr style={{ flex:1, border:'none', borderTop:'2px solid #E8ECF0', margin:'8px 0' }} />
              : (
                <textarea id={'block_'+b.id}
                  value={b.content||''}
                  placeholder={placeholder(b.type)}
                  rows={1}
                  onChange={e => {
                    e.target.style.height = 'auto'
                    e.target.style.height = e.target.scrollHeight + 'px'
                    updateBlock(b.id, { content: e.target.value })
                  }}
                  onFocus={e => { e.target.style.height = 'auto'; e.target.style.height = e.target.scrollHeight + 'px' }}
                  onKeyDown={e => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault()
                      addBlockAfter(b.id, b.type === 'bullet' ? 'bullet' : 'paragraph')
                    }
                    if (e.key === 'Backspace' && !b.content) {
                      e.preventDefault()
                      deleteBlock(b.id)
                    }
                    // Type selectors
                    if (e.key === ' ' && b.content === '#') { e.preventDefault(); updateBlock(b.id, { type:'heading1', content:'' }) }
                    if (e.key === ' ' && b.content === '##') { e.preventDefault(); updateBlock(b.id, { type:'heading2', content:'' }) }
                    if (e.key === ' ' && b.content === '###') { e.preventDefault(); updateBlock(b.id, { type:'heading3', content:'' }) }
                    if (e.key === ' ' && (b.content === '-' || b.content === '*')) { e.preventDefault(); updateBlock(b.id, { type:'bullet', content:'' }) }
                    if (e.key === 'Enter' && b.content === '---') { e.preventDefault(); updateBlock(b.id, { type:'divider', content:'' }); addBlockAfter(b.id) }
                  }}
                  style={{ ...blockStyle(b.type), resize:'none', overflow:'hidden', display:'block' }}
                />
              )
            }
          </div>
        ))}
        <div style={{ paddingTop:8 }}>
          <button onClick={() => addBlockAfter(blocks[blocks.length-1]?.id || '')}
            style={{ fontSize:12, color:'#C4C9D4', background:'none', border:'none', cursor:'pointer', padding:'4px 0' }}
            onMouseEnter={e=>e.currentTarget.style.color='#9CA3AF'} onMouseLeave={e=>e.currentTarget.style.color='#C4C9D4'}>
            + Add block
          </button>
        </div>
        <div style={{ marginTop:16, padding:'10px 12px', background:'#F9FAFB', borderRadius:8, fontSize:11, color:'#9CA3AF', lineHeight:1.6 }}>
          <strong style={{ color:'#6B7280' }}>Shortcuts:</strong> # + space = Heading · - + space = Bullet · --- + Enter = Divider · Enter = new block · Shift+Enter = line break
        </div>
      </div>
    </div>
  )
}

function StartupNoteViewer({ note }) {
  try {
    if (!note) return <div style={{ color:'#9CA3AF', fontSize:13, fontStyle:'italic' }}>No content yet</div>
    // Handle both string and object content
    let content = note.content
    if (typeof content === 'string') {
      try { content = JSON.parse(content) } catch { 
        // Plain text fallback
        return <div style={{ fontSize:13, color:'#374151', lineHeight:1.7, whiteSpace:'pre-wrap' }}>{content}</div>
      }
    }
    const blocks = content?.blocks || content?.ops || []
    if (!blocks.length) {
      // Maybe it's plain text in title
      return <div style={{ fontSize:13, color:'#374151', lineHeight:1.7 }}>{note.title || 'No content yet'}</div>
    }
    return (
      <div style={{ display:'flex', flexDirection:'column', gap:3 }}>
        {blocks.map((b, i) => {
          const text = b.content || b.text || b.insert || ''
          if (typeof text !== 'string' || !text.trim()) return null
          if (b.type === 'heading1') return <div key={i} style={{ fontSize:17, fontWeight:800, color:'#2A3042', marginTop:10, marginBottom:2 }}>{text}</div>
          if (b.type === 'heading2') return <div key={i} style={{ fontSize:14, fontWeight:700, color:'#2A3042', marginTop:8, marginBottom:2 }}>{text}</div>
          if (b.type === 'heading3') return <div key={i} style={{ fontSize:13, fontWeight:700, color:'#374151', marginTop:6 }}>{text}</div>
          if (b.type === 'bullet' || b.type === 'list_item') return (
            <div key={i} style={{ fontSize:13, color:'#374151', lineHeight:1.6, display:'flex', gap:8, paddingLeft:4 }}>
              <span style={{ color:'#9CA3AF', flexShrink:0, marginTop:1 }}>•</span><span>{text}</span>
            </div>
          )
          if (b.type === 'divider') return <hr key={i} style={{ border:'none', borderTop:'1px solid #E8ECF0', margin:'8px 0' }} />
          return <div key={i} style={{ fontSize:13, color:'#374151', lineHeight:1.7 }}>{text}</div>
        })}
      </div>
    )
  } catch(e) {
    return <div style={{ fontSize:13, color:'#9CA3AF', fontStyle:'italic' }}>Unable to render note content</div>
  }
}

function StartupPanel({ job, jobMats, jobApps, startupNote, allNotes, allJobs, onClose, onSaved }) {
  // Build a simple startup note with just a title and blank meeting notes
  // Materials/appliances are shown as a read-only summary above the editor
  const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2)

  // Freeze the note on first render — never update from props to avoid remounting NoteEditor
  const frozenNote = React.useRef(
    startupNote || {
      job_id: job.id,
      is_startup: true,
      is_public: true,
      title: `Startup — ${job.name}`,
      content: { blocks: [
        { id: uid(), type:'heading2', content:'Meeting notes' },
        { id: uid(), type:'paragraph', content:'' },
      ]},
    }
  )
  const note = frozenNote.current

  const panelMats = jobMats.filter(jm => jm.materials)
  const hasApps = jobApps.filter(ja => ja.appliances).length > 0

  return (
    <div style={{ position:'fixed', inset:0, zIndex:400, display:'flex', justifyContent:'flex-end', pointerEvents:'none' }}>
      <div style={{ position:'absolute', inset:0, background:'rgba(0,0,0,0.35)', pointerEvents:'all' }} onClick={onClose} />
      <div style={{ position:'relative', width:'min(680px,100vw)', height:'100%', background:'#F0F2F5', boxShadow:'-8px 0 40px rgba(0,0,0,0.18)', display:'flex', flexDirection:'column', pointerEvents:'all', zIndex:1, overflow:'hidden' }}>

        {/* orange header */}
        <div style={{ display:'flex', alignItems:'center', gap:10, padding:'12px 20px', background:'#F97316', flexShrink:0 }}>
          <span style={{ fontSize:18 }}>🚀</span>
          <div style={{ flex:1, fontSize:14, fontWeight:800, color:'#fff' }}>Startup — {job.name}</div>
          <button onClick={onClose} style={{ background:'rgba(255,255,255,0.2)', border:'none', cursor:'pointer', color:'#fff', width:28, height:28, borderRadius:7, fontSize:18, display:'flex', alignItems:'center', justifyContent:'center' }}>×</button>
        </div>

        <div style={{ flex:1, overflowY:'auto' }}>
          {/* ── Job summary (read-only) ── */}
          {panelMats.length > 0 && (
            <div style={{ padding:'16px 20px', borderBottom:'1px solid #E8ECF0', background:'#fff' }}>
              <div style={{ fontSize:11, fontWeight:700, color:'#9CA3AF', textTransform:'uppercase', letterSpacing:'.06em', marginBottom:10 }}>Materials</div>
              <div style={{ display:'flex', flexDirection:'column', gap:7 }}>
                {panelMats.map(jm => {
                  const m = jm.materials
                  const tags = [m.supplier, m.panel_type, m.thickness?m.thickness+'mm':null, m.colour_code, m.finish].filter(Boolean)
                  return (
                    <div key={jm.id} style={{ display:'flex', alignItems:'center', gap:10 }}>
                      {m.storage_path
                        ? <img src={pubUrl(m.storage_path)} style={{ width:32, height:32, borderRadius:6, objectFit:'cover', flexShrink:0 }} alt="" />
                        : <div style={{ width:32, height:32, borderRadius:6, background:m.color||'#E8ECF0', flexShrink:0, border:'1px solid #E8ECF0' }} />
                      }
                      <div>
                        <div style={{ fontSize:13, fontWeight:600, color:'#2A3042' }}>{m.name}</div>
                        {tags.length > 0 && <div style={{ fontSize:11, color:'#9CA3AF' }}>{tags.join(' · ')}</div>}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {hasApps && (
            <div style={{ padding:'16px 20px', borderBottom:'1px solid #E8ECF0', background:'#fff' }}>
              <div style={{ fontSize:11, fontWeight:700, color:'#9CA3AF', textTransform:'uppercase', letterSpacing:'.06em', marginBottom:10 }}>Appliances</div>
              <div style={{ display:'flex', flexDirection:'column', gap:7 }}>
                {jobApps.filter(ja=>ja.appliances).map(ja => {
                  const a = ja.appliances
                  return (
                    <div key={ja.id} style={{ display:'flex', alignItems:'center', gap:10 }}>
                      <div style={{ width:32, height:32, borderRadius:6, background:'#F3F4F6', display:'flex', alignItems:'center', justifyContent:'center', fontSize:16, flexShrink:0 }}>🔌</div>
                      <div>
                        <div style={{ fontSize:13, fontWeight:600, color:'#2A3042' }}>{a.brand} {a.model}</div>
                        <div style={{ fontSize:11, color:'#9CA3AF' }}>{a.type}{a.width?` · ${a.width}×${a.height}×${a.depth}mm`:''}</div>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {job.notes?.trim() && (
            <div style={{ padding:'16px 20px', borderBottom:'1px solid #E8ECF0', background:'#fff' }}>
              <div style={{ fontSize:11, fontWeight:700, color:'#9CA3AF', textTransform:'uppercase', letterSpacing:'.06em', marginBottom:6 }}>Job notes</div>
              <div style={{ fontSize:13, color:'#374151', lineHeight:1.6 }}>{job.notes}</div>
            </div>
          )}

          {/* ── Notion-style notes editor ── */}
          <NoteEditor
            key='startup-editor'
            note={note}
            allNotes={allNotes}
            jobs={allJobs}
            floating={true}
            onClose={onClose}
            onSave={onSaved}
            onBack={onClose}
          />
        </div>
      </div>
    </div>
  )
}


// ── Approval bar shown below each file attachment ────────────────
function ApprovalBar({ att, ft, approval, onRequest, onReview, profile }) {
  const [showReview, setShowReview] = useState(false)
  const [notes, setNotes] = useState('')

  if (!ft?.requires_approval) return null

  const isReviewer = profile?.role === 'Admin' || profile?.role === 'Project Manager'
  const canRequest = !approval
  const isPending  = approval?.status === 'pending'
  const isApproved = approval?.status === 'approved'
  const isDeclined = approval?.status === 'declined'

  return (
    <div style={{ marginTop:4 }}>
      {!approval && (
        <button onClick={onRequest}
          style={{ width:'100%', fontSize:11, fontWeight:700, padding:'5px 10px', borderRadius:8, border:'1px dashed #C4D4F8', background:'#F0F4FF', color:'#3730A3', cursor:'pointer', transition:'all .1s' }}
          onMouseEnter={e=>{e.currentTarget.style.background='#EEF2FF'}} onMouseLeave={e=>{e.currentTarget.style.background='#F0F4FF'}}>
          Request approval →
        </button>
      )}
      {isPending && (
        <div style={{ padding:'6px 10px', borderRadius:8, background:'#FEF9C3', border:'1px solid #FDE68A', display:'flex', alignItems:'center', justifyContent:'space-between', gap:8 }}>
          <div>
            <span style={{ fontSize:11, fontWeight:700, color:'#92400E' }}>⏳ Pending approval</span>
            <span style={{ fontSize:10, color:'#9CA3AF', marginLeft:6 }}>from {approval.reviewer?.full_name || approval.reviewer?.email || 'PM'}</span>
          </div>
          {isReviewer && !showReview && (
            <button onClick={() => setShowReview(true)}
              style={{ fontSize:11, fontWeight:700, padding:'3px 10px', borderRadius:7, border:'none', background:'#F59E0B', color:'#fff', cursor:'pointer' }}>
              Review
            </button>
          )}
        </div>
      )}
      {isPending && isReviewer && showReview && (
        <div style={{ padding:'10px 12px', borderRadius:10, background:'#fff', border:'1px solid #E8ECF0', marginTop:4 }}>
          <div style={{ fontSize:12, fontWeight:600, color:'#2A3042', marginBottom:8 }}>Review: {att.name}</div>
          <textarea value={notes} onChange={e=>setNotes(e.target.value)} placeholder="Optional notes for requester…"
            style={{ width:'100%', padding:'7px 10px', border:'1px solid #DDE3EC', borderRadius:8, fontSize:12, outline:'none', marginBottom:8, resize:'vertical', minHeight:50, fontFamily:'inherit' }} />
          <div style={{ display:'flex', gap:7 }}>
            <button onClick={() => { onReview(approval.id,'approved',notes); setShowReview(false) }}
              style={{ flex:1, fontSize:12, fontWeight:700, padding:'7px', borderRadius:8, border:'none', background:'#1D9E75', color:'#fff', cursor:'pointer' }}>✓ Approve</button>
            <button onClick={() => { onReview(approval.id,'declined',notes); setShowReview(false) }}
              style={{ flex:1, fontSize:12, fontWeight:700, padding:'7px', borderRadius:8, border:'none', background:'#E24B4A', color:'#fff', cursor:'pointer' }}>✕ Decline</button>
            <button onClick={() => setShowReview(false)}
              style={{ fontSize:12, padding:'7px 12px', borderRadius:8, border:'1px solid #E8ECF0', background:'#fff', color:'#6B7280', cursor:'pointer' }}>Cancel</button>
          </div>
        </div>
      )}
      {isApproved && (
        <div style={{ padding:'5px 10px', borderRadius:8, background:'#ECFDF5', border:'1px solid #6EE7B7', display:'flex', alignItems:'center', gap:6 }}>
          <span style={{ fontSize:11, fontWeight:700, color:'#065F46' }}>✓ Approved</span>
          <span style={{ fontSize:10, color:'#9CA3AF' }}>by {approval.reviewer?.full_name || 'PM'} · {new Date(approval.reviewed_at).toLocaleDateString('en-NZ',{day:'numeric',month:'short'})}</span>
          {approval.review_notes && <span style={{ fontSize:10, color:'#6B7280', fontStyle:'italic' }}>"{approval.review_notes}"</span>}
        </div>
      )}
      {isDeclined && (
        <div style={{ padding:'5px 10px', borderRadius:8, background:'#FEF2F2', border:'1px solid #FCA5A5', display:'flex', alignItems:'center', gap:6, flexWrap:'wrap' }}>
          <span style={{ fontSize:11, fontWeight:700, color:'#991B1B' }}>✕ Declined</span>
          <span style={{ fontSize:10, color:'#9CA3AF' }}>by {approval.reviewer?.full_name || 'PM'}</span>
          {approval.review_notes && <span style={{ fontSize:10, color:'#6B7280', fontStyle:'italic' }}>"{approval.review_notes}"</span>}
          <button onClick={onRequest} style={{ fontSize:10, fontWeight:600, marginLeft:'auto', padding:'2px 8px', borderRadius:6, border:'1px solid #FCA5A5', background:'#fff', color:'#991B1B', cursor:'pointer' }}>Re-request</button>
        </div>
      )}
    </div>
  )
}

// ── Inline rename component ───────────────────────────────────────
function InlineRename({ name, url, onSave }) {
  const [editing, setEditing] = React.useState(false)
  const [val, setVal]         = React.useState(name)
  const ref = React.useRef()
  React.useEffect(() => { setVal(name) }, [name])
  React.useEffect(() => { if (editing && ref.current) ref.current.focus() }, [editing])
  if (!editing) return (
    <div style={{ display:'flex', alignItems:'center', gap:6, flex:1, minWidth:0 }}>
      {url
        ? <a href={url} target="_blank" rel="noreferrer"
            style={{ fontSize:13, fontWeight:600, color:'#2A3042', textDecoration:'none', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', flex:1, minWidth:0 }}>
            {name}
          </a>
        : <span style={{ fontSize:13, fontWeight:600, color:'#2A3042', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', flex:1, minWidth:0 }}>{name}</span>
      }
      <button onClick={() => setEditing(true)}
        title="Rename" style={{ background:'none', border:'none', cursor:'pointer', color:'#C4C9D4', padding:'2px 4px', flexShrink:0, fontSize:13, lineHeight:1 }}
        onMouseEnter={e=>e.currentTarget.style.color='#5B8AF0'} onMouseLeave={e=>e.currentTarget.style.color='#C4C9D4'}>✏️</button>
    </div>
  )
  return (
    <div style={{ display:'flex', alignItems:'center', gap:4, flex:1, minWidth:0 }}>
      <input ref={ref} value={val} onChange={e=>setVal(e.target.value)}
        onKeyDown={e=>{ if(e.key==='Enter'){ onSave(val); setEditing(false) } if(e.key==='Escape'){ setVal(name); setEditing(false) }}}
        onBlur={()=>{ onSave(val); setEditing(false) }}
        style={{ flex:1, fontSize:13, fontWeight:600, padding:'4px 7px', border:'1px solid #5B8AF0', borderRadius:6, outline:'none', fontFamily:'inherit', minWidth:0 }} />
      <button onClick={()=>{ onSave(val); setEditing(false) }}
        style={{ background:'#5B8AF0', border:'none', borderRadius:5, color:'#fff', fontSize:11, fontWeight:700, padding:'3px 7px', cursor:'pointer', flexShrink:0 }}>✓</button>
    </div>
  )
}

// ── File rename/confirm modal ─────────────────────────────────────
function FileRenameModal({ pending, fileTypes, onConfirm, onCancel }) {
  const [names, setNames]   = React.useState(pending.names)
  const [typeId, setTypeId] = React.useState(pending.typeId || '')
  const previews = React.useMemo(() =>
    pending.files.map(f => f.type?.startsWith('image/') ? URL.createObjectURL(f) : null)
  , [pending.files])
  return (
    <div style={{ position:'fixed', inset:0, zIndex:900, background:'rgba(0,0,0,0.5)', display:'flex', alignItems:'flex-start', justifyContent:'center', padding:16, paddingTop:40 }}
      onClick={e=>e.target===e.currentTarget&&onCancel()}>
      <div style={{ background:'#fff', borderRadius:16, width:'100%', maxWidth:480, boxShadow:'0 24px 64px rgba(0,0,0,0.2)' }}>
        <div style={{ padding:'18px 20px 14px', borderBottom:'1px solid #F3F4F6' }}>
          <div style={{ fontSize:16, fontWeight:800, color:'#2A3042' }}>Confirm upload</div>
          <div style={{ fontSize:13, color:'#9CA3AF', marginTop:2 }}>Edit names before uploading</div>
        </div>
        <div style={{ padding:'14px 20px', maxHeight:'50vh', overflowY:'auto', display:'flex', flexDirection:'column', gap:10 }}>
          {fileTypes.length > 0 && (
            <div>
              <div style={{ fontSize:11, fontWeight:700, color:'#6B7280', textTransform:'uppercase', letterSpacing:'.05em', marginBottom:6 }}>File type</div>
              <select value={typeId} onChange={e=>setTypeId(e.target.value)}
                style={{ width:'100%', padding:'8px 10px', border:'1px solid #DDE3EC', borderRadius:8, fontSize:13, outline:'none', background:'#fff' }}>
                <option value="">No type</option>
                {fileTypes.map(ft => <option key={ft.id} value={ft.id}>{ft.name}</option>)}
              </select>
            </div>
          )}
          {pending.files.map((file, i) => {
            const dotIdx = names[i].lastIndexOf('.')
            const ext  = dotIdx > 0 ? names[i].slice(dotIdx) : ''
            const base = dotIdx > 0 ? names[i].slice(0, dotIdx) : names[i]
            return (
              <div key={i} style={{ display:'flex', alignItems:'center', gap:10, padding:'10px 12px', background:'#F9FAFB', borderRadius:10, border:'1px solid #E8ECF0' }}>
                {previews[i]
                  ? <img src={previews[i]} style={{ width:44, height:44, borderRadius:7, objectFit:'cover', flexShrink:0 }} alt="" />
                  : <div style={{ width:44, height:44, borderRadius:7, background:'#EEF2FF', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0, fontSize:11, fontWeight:800, color:'#5B8AF0' }}>
                      {ext.slice(1).toUpperCase()||'FILE'}
                    </div>
                }
                <div style={{ flex:1, minWidth:0 }}>
                  <div style={{ display:'flex', alignItems:'center', gap:4 }}>
                    <input value={base} onChange={e => setNames(ns => ns.map((n,j) => j===i ? e.target.value+ext : n))}
                      style={{ flex:1, fontSize:13, fontWeight:600, padding:'6px 8px', border:'1px solid #DDE3EC', borderRadius:7, outline:'none', fontFamily:'inherit', minWidth:0 }} />
                    <span style={{ fontSize:12, color:'#9CA3AF', flexShrink:0 }}>{ext}</span>
                  </div>
                  <div style={{ fontSize:11, color:'#9CA3AF', marginTop:3 }}>{(file.size/1024).toFixed(0)} KB</div>
                </div>
              </div>
            )
          })}
        </div>
        <div style={{ padding:'14px 20px', borderTop:'1px solid #F3F4F6', display:'flex', gap:8 }}>
          <button onClick={onCancel}
            style={{ flex:1, padding:'11px', borderRadius:10, border:'1px solid #E8ECF0', background:'#F9FAFB', color:'#6B7280', fontSize:14, fontWeight:600, cursor:'pointer' }}>
            Cancel
          </button>
          <button onClick={() => onConfirm(names, typeId)}
            style={{ flex:2, padding:'11px', borderRadius:10, border:'none', background:'#5B8AF0', color:'#fff', fontSize:14, fontWeight:700, cursor:'pointer' }}>
            Upload {pending.files.length} file{pending.files.length!==1?'s':''}
          </button>
        </div>
      </div>
    </div>
  )
}

const _inp = { width:'100%', padding:'8px 10px', border:'1px solid #DDE3EC', borderRadius:8, fontSize:13, outline:'none', boxSizing:'border-box', fontFamily:'inherit' }
const _lbl = { fontSize:11, fontWeight:700, color:'#6B7280', display:'block', marginBottom:4 }

function JobContactsTab({ jobId, profile, profiles }) {
  const toast = useToast()
  const [contacts, setContacts] = useState([])
  const [loading, setLoading]   = useState(true)
  const [form, setForm]         = useState(null)
  const [saving, setSaving]     = useState(false)
  const emptyForm = { name:'', role:'', company:'', email:'', phone:'', notes:'', type:'external' }

  useEffect(() => {
    if (!jobId) { setLoading(false); return }
    supabase.from('job_contacts').select('*').eq('job_id', jobId).order('created_at')
      .then(({ data, error }) => {
        if (error) console.warn('Contacts:', error.message)
        setContacts(data||[]); setLoading(false)
      }).catch(() => setLoading(false))
  }, [jobId])

  async function save() {
    if (!form?.name?.trim()) { toast('Name is required','error'); return }
    setSaving(true)
    if (form.id) {
      const { error } = await supabase.from('job_contacts').update({
        name:form.name, role:form.role||'', company:form.company||'',
        email:form.email||'', phone:form.phone||'', notes:form.notes||'', type:form.type
      }).eq('id', form.id)
      if (error) { toast(error.message,'error'); setSaving(false); return }
      setContacts(p => p.map(c => c.id===form.id ? {...c,...form} : c))
    } else {
      const { data, error } = await supabase.from('job_contacts').insert({
        job_id:jobId, name:form.name, role:form.role||'', company:form.company||'',
        email:form.email||'', phone:form.phone||'', notes:form.notes||'', type:form.type
      }).select().single()
      if (error) { toast(error.message,'error'); setSaving(false); return }
      setContacts(p => [...p, data])
    }
    toast('Contact saved ✓'); setForm(null); setSaving(false)
  }

  async function del(id) {
    if (!confirm('Delete this contact?')) return
    await supabase.from('job_contacts').delete().eq('id', id)
    setContacts(p => p.filter(c => c.id !== id))
  }

  return (
    <div style={{ background:'#fff', borderRadius:12, border:'1px solid #E8ECF0', padding:20 }}>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:16 }}>
        <div style={{ fontSize:16, fontWeight:800, color:'#2A3042' }}>Contacts</div>
        <button onClick={() => setForm({...emptyForm})}
          style={{ padding:'8px 16px', borderRadius:9, border:'none', background:'#5B8AF0', color:'#fff', fontSize:13, fontWeight:700, cursor:'pointer' }}>
          + Add contact
        </button>
      </div>
      {loading ? (
        <div style={{ textAlign:'center', padding:'30px 0' }}><div className="spinner"/></div>
      ) : contacts.length === 0 ? (
        <div style={{ textAlign:'center', padding:'40px 0', color:'#9CA3AF' }}>
          <div style={{ fontSize:28, marginBottom:8 }}>👥</div>
          <div style={{ fontSize:14, fontWeight:600, color:'#374151' }}>No contacts yet</div>
          <div style={{ fontSize:12, marginTop:4 }}>Add key people for this job</div>
        </div>
      ) : (
        <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
          {['internal','external'].map(type => {
            const list = contacts.filter(c => c.type===type)
            if (!list.length) return null
            return (
              <div key={type}>
                <div style={{ fontSize:11, fontWeight:700, color:'#9CA3AF', textTransform:'uppercase', letterSpacing:'.06em', marginBottom:8 }}>{type}</div>
                {list.map(c => (
                  <div key={c.id} style={{ background:'#F9FAFB', borderRadius:10, border:'1px solid #E8ECF0', padding:'12px 14px', display:'flex', alignItems:'flex-start', gap:12, marginBottom:8 }}>
                    <div style={{ width:36, height:36, borderRadius:'50%', background:'#EEF2FF', display:'flex', alignItems:'center', justifyContent:'center', fontSize:14, fontWeight:700, color:'#5B8AF0', flexShrink:0 }}>
                      {(c.name||'?')[0].toUpperCase()}
                    </div>
                    <div style={{ flex:1, minWidth:0 }}>
                      <div style={{ fontSize:13, fontWeight:700, color:'#2A3042' }}>{c.name}</div>
                      <div style={{ fontSize:12, color:'#9CA3AF' }}>{[c.role, c.company].filter(Boolean).join(' · ')}</div>
                      <div style={{ display:'flex', gap:12, marginTop:4, flexWrap:'wrap' }}>
                        {c.email && <a href={`mailto:${c.email}`} style={{ fontSize:12, color:'#5B8AF0', textDecoration:'none' }}>{c.email}</a>}
                        {c.phone && <a href={`tel:${c.phone}`} style={{ fontSize:12, color:'#5B8AF0', textDecoration:'none' }}>{c.phone}</a>}
                      </div>
                      {c.notes && <div style={{ fontSize:11, color:'#9CA3AF', marginTop:4, fontStyle:'italic' }}>{c.notes}</div>}
                    </div>
                    <div style={{ display:'flex', gap:6, flexShrink:0 }}>
                      <button onClick={() => setForm({...c})} style={{ padding:'3px 10px', borderRadius:7, border:'1px solid #E8ECF0', background:'#fff', color:'#6B7280', fontSize:12, cursor:'pointer' }}>Edit</button>
                      <button onClick={() => del(c.id)} style={{ padding:'3px 8px', borderRadius:7, border:'1px solid #FCA5A5', background:'#FEF2F2', color:'#DC2626', fontSize:12, cursor:'pointer' }}>✕</button>
                    </div>
                  </div>
                ))}
              </div>
            )
          })}
        </div>
      )}
      {form && (
        <div style={{ position:'fixed', inset:0, zIndex:600, background:'rgba(0,0,0,0.45)', display:'flex', alignItems:'center', justifyContent:'center', padding:16 }}
          onClick={e => e.target===e.currentTarget && setForm(null)}>
          <div style={{ background:'#fff', borderRadius:14, width:'100%', maxWidth:460, boxShadow:'0 20px 60px rgba(0,0,0,0.2)' }}>
            <div style={{ padding:'14px 18px', borderBottom:'1px solid #F3F4F6', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
              <div style={{ fontSize:15, fontWeight:700, color:'#2A3042' }}>{form.id ? 'Edit contact' : 'Add contact'}</div>
              <button onClick={() => setForm(null)} style={{ background:'none', border:'none', cursor:'pointer', color:'#9CA3AF', fontSize:22, lineHeight:1 }}>×</button>
            </div>
            <div style={{ padding:18, display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 }}>
              <div style={{ gridColumn:'span 2', display:'flex', gap:2, background:'#F3F4F6', borderRadius:8, padding:3 }}>
                {['internal','external'].map(t => (
                  <button key={t} onClick={() => setForm(f => ({...f, type:t}))}
                    style={{ flex:1, padding:'6px', borderRadius:6, border:'none', cursor:'pointer', fontSize:12, fontWeight:600, textTransform:'capitalize',
                      background:form.type===t?'#fff':'transparent', color:form.type===t?'#2A3042':'#9CA3AF',
                      boxShadow:form.type===t?'0 1px 3px rgba(0,0,0,0.1)':'none' }}>{t}</button>
                ))}
              </div>
              <div style={{ gridColumn:'span 2' }}>
                <label style={_lbl}>Name *</label>
                <input autoFocus value={form.name||''} onChange={e => setForm(f => ({...f, name:e.target.value}))} placeholder="Full name" style={_inp}/>
              </div>
              <div><label style={_lbl}>Role</label><input value={form.role||''} onChange={e => setForm(f => ({...f, role:e.target.value}))} placeholder="e.g. Architect" style={_inp}/></div>
              <div><label style={_lbl}>Company</label><input value={form.company||''} onChange={e => setForm(f => ({...f, company:e.target.value}))} placeholder="Company" style={_inp}/></div>
              <div><label style={_lbl}>Email</label><input type="email" value={form.email||''} onChange={e => setForm(f => ({...f, email:e.target.value}))} placeholder="email@example.com" style={_inp}/></div>
              <div><label style={_lbl}>Phone</label><input type="tel" value={form.phone||''} onChange={e => setForm(f => ({...f, phone:e.target.value}))} placeholder="+64 21 000 0000" style={_inp}/></div>
              <div style={{ gridColumn:'span 2' }}>
                <label style={_lbl}>Notes</label>
                <textarea value={form.notes||''} onChange={e => setForm(f => ({...f, notes:e.target.value}))} rows={2} style={{..._inp, resize:'none'}} placeholder="Additional notes…"/>
              </div>
            </div>
            <div style={{ padding:'10px 18px', borderTop:'1px solid #F3F4F6', display:'flex', gap:8, justifyContent:'flex-end' }}>
              <button onClick={() => setForm(null)} style={{ padding:'8px 14px', borderRadius:9, border:'1px solid #E8ECF0', background:'#fff', color:'#6B7280', fontSize:13, cursor:'pointer' }}>Cancel</button>
              <button onClick={save} disabled={saving} style={{ padding:'8px 18px', borderRadius:9, border:'none', background:'#5B8AF0', color:'#fff', fontSize:13, fontWeight:700, cursor:'pointer' }}>
                {saving ? 'Saving…' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

const _STATUS = {
  'Open':      { bg:'#FEF9C3', color:'#854D0E', border:'#FDE68A' },
  'In Review': { bg:'#DBEAFE', color:'#1E40AF', border:'#BFDBFE' },
  'Answered':  { bg:'#DCFCE7', color:'#065F46', border:'#86EFAC' },
  'Closed':    { bg:'#F3F4F6', color:'#6B7280', border:'#E5E7EB' },
}
const _PRI = { 'Low':'#9CA3AF', 'Normal':'#6B7280', 'High':'#D97706', 'Urgent':'#DC2626' }

function JobRFITab({ jobId, profile, profiles, rooms = [] }) {
  const toast = useToast()
  const [rfis, setRfis]         = useState([])
  const [contacts, setContacts] = useState([])
  const [loading, setLoading]   = useState(true)
  const [form, setForm]         = useState(null)
  const [detail, setDetail]     = useState(null)
  const [saving, setSaving]     = useState(false)
  const [sending, setSending]   = useState(null)

  useEffect(() => {
    if (!jobId) { setLoading(false); return }
    Promise.all([
      supabase.from('job_rfis').select('*,room_id').eq('job_id', jobId).order('created_at', { ascending:true }),
      supabase.from('job_contacts').select('*').eq('job_id', jobId).order('created_at'),
    ]).then(([{ data: rfiData, error: rfiErr }, { data: contactData }]) => {
      if (rfiErr) console.error('RFI load error:', rfiErr.message, rfiErr.hint || '', rfiErr.details || '')
      setRfis(rfiData || [])
      setContacts(contactData || [])
      setLoading(false)
    }).catch(e => { console.error('RFI catch:', e); setLoading(false) })
  }, [jobId])

  const pName = id => {
    if (!id) return ''
    if (String(id).startsWith('contact_')) {
      const c = contacts.find(x => x.id === id.replace('contact_', ''))
      return c ? `${c.name}${c.role ? ` (${c.role})` : ''}` : ''
    }
    const p = (profiles||[]).find(x => x.id===id)
    return p ? (p.full_name||p.email) : ''
  }

  function openNew() {
    const next = rfis.length ? Math.max(...rfis.map(r => r.number||0))+1 : 1
    setForm({ title:'', description:'', type:'internal', status:'Open', priority:'Normal', assigned_to:'', due_date:'', room_id: null, number:next })
  }

  const APP_URL = window.location.origin

  function makeUUID() {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) return makeUUID()
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
      const r = Math.random() * 16 | 0
      return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16)
    })
  }

  async function generateToken(rfiId) {
    const token = makeUUID()
    await supabase.from('job_rfis').update({ reply_token: token }).eq('id', rfiId)
    return token
  }

  function sendEmail(rfi, token, contact) {
    const link = `${APP_URL}/rfi/${token}`
    const rfiNum = `RFI-${String(rfi.number||0).padStart(3,'0')}`
    const subject = encodeURIComponent(`${rfiNum}: ${rfi.title}`)
    const body = encodeURIComponent(
`Hi ${contact.name || 'there'},

You have received a Request for Information (${rfiNum}) that requires your response.

RFI: ${rfi.title}
${rfi.description ? `\nDetails:\n${rfi.description}\n` : ''}${rfi.due_date ? `Due: ${new Date(rfi.due_date).toLocaleDateString('en-NZ', { day:'numeric', month:'long', year:'numeric' })}\n` : ''}
Please click the link below to view the details and submit your response:

${link}

Thank you.`)
    // Use an anchor click — works reliably on all mobile browsers
    const a = document.createElement('a')
    a.href = `mailto:${contact.email}?subject=${subject}&body=${body}`
    a.style.display = 'none'
    document.body.appendChild(a)
    a.click()
    setTimeout(() => document.body.removeChild(a), 100)
    const now = new Date().toISOString()
    supabase.from('job_rfis').update({ reply_sent_at: now, reply_sent_to: contact.email }).eq('id', rfi.id)
    toast(`Email opened for ${contact.email} ✓`)
  }

  async function saveRFI() {
    if (!form?.title?.trim()) { toast('Title is required','error'); return }
    setSaving(true)
    // Safety timeout — never hang longer than 10s
    const timeout = setTimeout(() => { setSaving(false); toast('Save timed out — please try again', 'error') }, 10000)
    // Only send columns we know exist
    const payload = {
      title: form.title,
      description: form.description || '',
      type: form.type || 'internal',
      status: form.status || 'Open',
      priority: form.priority || 'Normal',
      assigned_to: form.assigned_to
        ? String(form.assigned_to).replace('contact_', '')
        : null,
      due_date: form.due_date || null,
      room_id: form.room_id || null,
      updated_at: new Date().toISOString(),
    }
    // Only include number if it has a value
    if (form.number) payload.number = form.number

    let savedRfi = null
    if (form.id) {
      const { error } = await supabase.from('job_rfis').update(payload).eq('id', form.id)
      if (error) { clearTimeout(timeout); toast(`Save failed: ${error.message}`, 'error'); setSaving(false); return }
      setRfis(p => p.map(r => r.id===form.id ? {...r,...payload} : r))
      if (detail?.id===form.id) setDetail(d => ({...d,...payload}))
      savedRfi = { ...form, ...payload }
    } else {
      const insertData = { ...payload, job_id: jobId }
      // Only add created_by if we have a valid UUID
      if (profile?.id) insertData.created_by = profile.id
      const { data, error } = await supabase.from('job_rfis').insert(insertData).select().single()
      if (error) { clearTimeout(timeout); toast(`Save failed: ${error.message}`, 'error'); setSaving(false); return }
      setRfis(p => [...p, data])
      savedRfi = data
    }

    clearTimeout(timeout)
    toast('RFI saved ✓')
    setForm(null)
    setSaving(false)
  }

  async function respond(response) {
    if (!detail||!response.trim()) return
    const patch = { response, status:'Answered', responded_at:new Date().toISOString(), responded_by:profile?.id||null, updated_at:new Date().toISOString() }
    await supabase.from('job_rfis').update(patch).eq('id', detail.id)
    setRfis(p => p.map(r => r.id===detail.id ? {...r,...patch} : r))
    setDetail(d => ({...d,...patch}))
    toast('Response saved ✓')
  }

  async function changeStatus(status) {
    await supabase.from('job_rfis').update({ status, updated_at:new Date().toISOString() }).eq('id', detail.id)
    setRfis(p => p.map(r => r.id===detail.id ? {...r,status} : r))
    setDetail(d => ({...d,status}))
  }

  async function del(id) {
    if (!confirm('Delete this RFI?')) return
    await supabase.from('job_rfis').delete().eq('id', id)
    setRfis(p => p.filter(r => r.id!==id))
    if (detail?.id===id) setDetail(null)
  }

  return (
    <div style={{ background:'#fff', borderRadius:12, border:'1px solid #E8ECF0', padding:20 }}>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:16 }}>
        <div>
          <div style={{ fontSize:16, fontWeight:800, color:'#2A3042' }}>RFI</div>
          <div style={{ fontSize:12, color:'#9CA3AF' }}>Requests for Information</div>
        </div>
        <button onClick={openNew}
          style={{ padding:'8px 16px', borderRadius:9, border:'none', background:'#5B8AF0', color:'#fff', fontSize:13, fontWeight:700, cursor:'pointer' }}>
          + New RFI
        </button>
      </div>
      {loading ? (
        <div style={{ textAlign:'center', padding:'30px 0' }}><div className="spinner"/></div>
      ) : rfis.length === 0 ? (
        <div style={{ textAlign:'center', padding:'40px 0', color:'#9CA3AF' }}>
          <div style={{ fontSize:28, marginBottom:8 }}>📋</div>
          <div style={{ fontSize:14, fontWeight:600, color:'#374151' }}>No RFIs yet</div>
          <div style={{ fontSize:12, marginTop:4 }}>Create a request for information for this job</div>
        </div>
      ) : (
        <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
          {rfis.map(rfi => {
            const ss = _STATUS[rfi.status]||_STATUS.Open
            return (
              <div key={rfi.id} onClick={() => setDetail(rfi)}
                style={{ background:detail?.id===rfi.id?'#F8FAFF':'#F9FAFB', borderRadius:10,
                  border:`1px solid ${detail?.id===rfi.id?'#C4D4F8':'#E8ECF0'}`, padding:'12px 14px', cursor:'pointer' }}
                onMouseEnter={e => { if(detail?.id!==rfi.id) e.currentTarget.style.background='#F3F4F6' }}
                onMouseLeave={e => { if(detail?.id!==rfi.id) e.currentTarget.style.background='#F9FAFB' }}>
                <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', gap:8 }}>
                  <div style={{ flex:1, minWidth:0 }}>
                    <div style={{ display:'flex', alignItems:'center', gap:6, marginBottom:4, flexWrap:'wrap' }}>
                      <span style={{ fontSize:10, fontWeight:700, color:'#9CA3AF', fontFamily:'monospace' }}>RFI-{String(rfi.number||0).padStart(3,'0')}</span>
                      <span style={{ fontSize:11, fontWeight:700, padding:'1px 8px', borderRadius:20, background:ss.bg, color:ss.color, border:`1px solid ${ss.border}` }}>{rfi.status}</span>
                      <span style={{ fontSize:11, fontWeight:600, color:_PRI[rfi.priority]||'#6B7280' }}>{rfi.priority}</span>
                      <span style={{ fontSize:10, padding:'1px 7px', borderRadius:10, fontWeight:600,
                        background:rfi.type==='internal'?'#EEF2FF':'#FFF7ED', color:rfi.type==='internal'?'#3730A3':'#C2410C' }}>{rfi.type}</span>
                    </div>
                    <div style={{ fontSize:13, fontWeight:700, color:'#2A3042' }}>{rfi.title}</div>
                    {rfi.description && <div style={{ fontSize:12, color:'#6B7280', marginTop:2, lineHeight:1.5 }}>{rfi.description}</div>}
                    <div style={{ display:'flex', gap:10, marginTop:4, flexWrap:'wrap' }}>
                      {rfi.assigned_to && pName(rfi.assigned_to) && <span style={{ fontSize:11, color:'#9CA3AF' }}>→ {pName(rfi.assigned_to)}</span>}
                      {rfi.due_date && <span style={{ fontSize:11, color:'#9CA3AF' }}>Due {fmtDate(rfi.due_date)}</span>}
                    </div>
                    {rfi.response ? (
                      <div style={{ marginTop:8, padding:'8px 12px', background:'#F8FAFF', borderRadius:8, border:'1px solid #C4D4F8' }}>
                        <div style={{ fontSize:10, fontWeight:700, color:'#3730A3', marginBottom:3, textTransform:'uppercase', letterSpacing:'.05em' }}>Internal response</div>
                        <div style={{ fontSize:12, color:'#374151', lineHeight:1.5, whiteSpace:'pre-wrap' }}>{rfi.response}</div>
                        {rfi.responded_at && <div style={{ fontSize:10, color:'#9CA3AF', marginTop:4 }}>Answered {fmtDate(rfi.responded_at)}</div>}
                      </div>
                    ) : (rfi.status === 'Open' || rfi.status === 'In Review') ? (
                      <div style={{ marginTop:8, padding:'6px 10px', background:'#FFF7ED', borderRadius:8, border:'1px solid #FDBA74', fontSize:11, color:'#C2410C', fontWeight:600 }}>
                        Awaiting response
                      </div>
                    ) : null}
                    {rfi.external_reply && (
                      <div style={{ marginTop:6, padding:'8px 12px', background:'#F0FDF4', borderRadius:8, border:'1px solid #86EFAC' }}>
                        <div style={{ fontSize:10, fontWeight:700, color:'#065F46', marginBottom:3, textTransform:'uppercase', letterSpacing:'.05em' }}>✓ External reply</div>
                        <div style={{ fontSize:12, color:'#166534', lineHeight:1.5, whiteSpace:'pre-wrap' }}>{rfi.external_reply}</div>
                      </div>
                    )}
                  </div>
                  <div style={{ display:'flex', gap:5, flexShrink:0 }}>
                    <button onClick={e => { e.stopPropagation(); setForm({...rfi}) }}
                      style={{ padding:'3px 10px', borderRadius:7, border:'1px solid #E8ECF0', background:'#fff', color:'#6B7280', fontSize:12, cursor:'pointer' }}>Edit</button>
                    <button onClick={e => { e.stopPropagation(); del(rfi.id) }}
                      style={{ padding:'3px 8px', borderRadius:7, border:'1px solid #FCA5A5', background:'#FEF2F2', color:'#DC2626', fontSize:12, cursor:'pointer' }}>✕</button>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {detail && (
        <div style={{ position:'fixed', inset:0, zIndex:600, background:'rgba(0,0,0,0.45)', display:'flex', alignItems:'center', justifyContent:'center', padding:16 }}
          onClick={e => e.target===e.currentTarget && setDetail(null)}>
          <div style={{ background:'#fff', borderRadius:14, width:'100%', maxWidth:500, maxHeight:'88vh', display:'flex', flexDirection:'column', boxShadow:'0 20px 60px rgba(0,0,0,0.2)' }}>
            <div style={{ padding:'14px 18px', borderBottom:'1px solid #F3F4F6', display:'flex', justifyContent:'space-between', alignItems:'flex-start', flexShrink:0 }}>
              <div>
                <div style={{ fontSize:10, fontWeight:700, color:'#9CA3AF', fontFamily:'monospace', marginBottom:3 }}>RFI-{String(detail.number||0).padStart(3,'0')}</div>
                <div style={{ fontSize:16, fontWeight:800, color:'#2A3042' }}>{detail.title}</div>
              </div>
              <button onClick={() => setDetail(null)} style={{ background:'none', border:'none', cursor:'pointer', color:'#9CA3AF', fontSize:22, lineHeight:1, flexShrink:0 }}>×</button>
            </div>
            <div style={{ flex:1, overflowY:'auto', padding:18 }}>
              <div style={{ display:'flex', gap:6, flexWrap:'wrap', marginBottom:14 }}>
                {Object.keys(_STATUS).map(s => {
                  const st = _STATUS[s]
                  return (
                    <button key={s} onClick={() => changeStatus(s)}
                      style={{ padding:'4px 12px', borderRadius:20, fontSize:11, cursor:'pointer',
                        fontWeight:s===detail.status?700:500,
                        border:`1px solid ${s===detail.status?st.border:'#E8ECF0'}`,
                        background:s===detail.status?st.bg:'#fff',
                        color:s===detail.status?st.color:'#9CA3AF' }}>{s}</button>
                  )
                })}
              </div>
              {detail.description && (
                <div style={{ marginBottom:14 }}>
                  <div style={{ fontSize:11, fontWeight:700, color:'#9CA3AF', textTransform:'uppercase', letterSpacing:'.05em', marginBottom:4 }}>Description</div>
                  <div style={{ fontSize:13, color:'#374151', lineHeight:1.6 }}>{detail.description}</div>
                </div>
              )}
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8, marginBottom:14, fontSize:12 }}>
                {detail.assigned_to && pName(detail.assigned_to) && <div><span style={{ color:'#9CA3AF' }}>Assigned: </span><strong>{pName(detail.assigned_to)}</strong></div>}
                {detail.due_date && <div><span style={{ color:'#9CA3AF' }}>Due: </span><strong>{fmtDate(detail.due_date)}</strong></div>}
                <div><span style={{ color:'#9CA3AF' }}>Type: </span><strong style={{ textTransform:'capitalize' }}>{detail.type}</strong></div>
                <div><span style={{ color:'#9CA3AF' }}>Priority: </span><strong>{detail.priority}</strong></div>
              </div>
              <RFIResponseBox detail={detail} onRespond={respond} />
            </div>
          </div>
        </div>
      )}

      {form && (
        <div style={{ position:'fixed', inset:0, zIndex:600, background:'rgba(0,0,0,0.45)', display:'flex', alignItems:'center', justifyContent:'center', padding:16 }}
          onClick={e => e.target===e.currentTarget && setForm(null)}>
          <div style={{ background:'#fff', borderRadius:14, width:'100%', maxWidth:500, maxHeight:'88vh', display:'flex', flexDirection:'column', boxShadow:'0 20px 60px rgba(0,0,0,0.2)' }}>
            <div style={{ padding:'14px 18px', borderBottom:'1px solid #F3F4F6', display:'flex', justifyContent:'space-between', alignItems:'center', flexShrink:0 }}>
              <div style={{ fontSize:15, fontWeight:700, color:'#2A3042' }}>
                {form.id ? 'Edit RFI' : `New RFI — #${String(form.number||1).padStart(3,'0')}`}
              </div>
              <button onClick={() => setForm(null)} style={{ background:'none', border:'none', cursor:'pointer', color:'#9CA3AF', fontSize:22 }}>×</button>
            </div>
            <div style={{ flex:1, overflowY:'auto', padding:18, display:'flex', flexDirection:'column', gap:10 }}>
              <div style={{ display:'flex', gap:2, background:'#F3F4F6', borderRadius:8, padding:3 }}>
                {['internal','external'].map(t => (
                  <button key={t} onClick={() => setForm(f => ({...f, type:t}))}
                    style={{ flex:1, padding:'6px', borderRadius:6, border:'none', cursor:'pointer', fontSize:12, fontWeight:600, textTransform:'capitalize',
                      background:form.type===t?'#fff':'transparent', color:form.type===t?'#2A3042':'#9CA3AF',
                      boxShadow:form.type===t?'0 1px 3px rgba(0,0,0,0.1)':'none' }}>{t}</button>
                ))}
              </div>
              <div>
                <label style={_lbl}>Title *</label>
                <input autoFocus value={form.title||''} onChange={e => setForm(f => ({...f,title:e.target.value}))} placeholder="Brief description…" style={_inp}/>
              </div>
              <div>
                <label style={_lbl}>Description</label>
                <textarea value={form.description||''} onChange={e => setForm(f => ({...f,description:e.target.value}))} rows={3} style={{..._inp,resize:'vertical'}} placeholder="Details…"/>
              </div>
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 }}>
                <div>
                  <label style={_lbl}>Priority</label>
                  <select value={form.priority||'Normal'} onChange={e => setForm(f => ({...f,priority:e.target.value}))} style={{..._inp,cursor:'pointer'}}>
                    {['Low','Normal','High','Urgent'].map(p => <option key={p}>{p}</option>)}
                  </select>
                </div>
                <div>
                  <label style={_lbl}>Status</label>
                  <select value={form.status||'Open'} onChange={e => setForm(f => ({...f,status:e.target.value}))} style={{..._inp,cursor:'pointer'}}>
                    {['Open','In Review','Answered','Closed'].map(s => <option key={s}>{s}</option>)}
                  </select>
                </div>
                <div>
                  <label style={_lbl}>Assign to / Send to</label>
                  <select value={form.assigned_to||''} onChange={e => setForm(f => ({...f,assigned_to:e.target.value||null}))} style={{..._inp,cursor:'pointer'}}>
                    <option value="">Unassigned</option>
                    {(profiles||[]).length > 0 && (
                      <optgroup label="── Team">
                        {profiles.map(p => <option key={p.id} value={p.id}>{p.full_name||p.email}</option>)}
                      </optgroup>
                    )}
                    {contacts.filter(c => c.email).length > 0 && (
                      <optgroup label="── Job contacts">
                        {contacts.filter(c => c.email).map(c => (
                          <option key={`contact_${c.id}`} value={`contact_${c.id}`}>
                            {c.name}{c.role ? ` (${c.role})` : ''} — {c.email}
                          </option>
                        ))}
                      </optgroup>
                    )}
                    {contacts.filter(c => !c.email).length > 0 && (
                      <optgroup label="── Contacts (no email)">
                        {contacts.filter(c => !c.email).map(c => (
                          <option key={`contact_${c.id}`} value={`contact_${c.id}`}>
                            {c.name}{c.role ? ` (${c.role})` : ''}
                          </option>
                        ))}
                      </optgroup>
                    )}
                  </select>
                </div>
                <div>
                  <label style={_lbl}>Due date</label>
                  <input type="date" value={form.due_date||''} onChange={e => setForm(f => ({...f,due_date:e.target.value}))} style={{..._inp,color:'#374151'}}/>
                </div>
                <div style={{ gridColumn:'span 2' }}>
                  <label style={_lbl}>Room (optional)</label>
                  <select value={form.room_id||''} onChange={e => setForm(f => ({...f, room_id: e.target.value || null}))} style={{..._inp, cursor:'pointer'}}>
                    <option value="">— No specific room</option>
                    {[...rooms].sort((a,b)=>(a.name||'').localeCompare(b.name||'')).map(r => (
                      <option key={r.id} value={r.id}>{r.name}</option>
                    ))}
                  </select>
                </div>
              </div>
            </div>
            <div style={{ padding:'10px 18px', borderTop:'1px solid #F3F4F6', display:'flex', gap:8, justifyContent:'flex-end', alignItems:'center', flexShrink:0 }}>
              {form?.assigned_to && String(form.assigned_to).startsWith('contact_') && (() => {
                const c = contacts.find(x => x.id === form.assigned_to.replace('contact_', ''))
                return c?.email ? (
                  <span style={{ fontSize:11, color:'#6B7280', marginRight:'auto', display:'flex', alignItems:'center', gap:4 }}>
                    <span style={{ color:'#1D9E75' }}>✉</span> Will send link to {c.email}
                  </span>
                ) : null
              })()}
              <button onClick={() => setForm(null)} style={{ padding:'8px 14px', borderRadius:9, border:'1px solid #E8ECF0', background:'#fff', color:'#6B7280', fontSize:13, cursor:'pointer' }}>Cancel</button>
              <button onClick={saveRFI} disabled={saving}
                style={{ padding:'8px 18px', borderRadius:9, border:'none', fontSize:13, fontWeight:700, cursor:'pointer',
                  background: form?.assigned_to && String(form.assigned_to).startsWith('contact_') && contacts.find(x => x.id === form.assigned_to.replace('contact_',''))?.email ? '#1D9E75' : '#5B8AF0',
                  color:'#fff' }}>
                {saving ? 'Saving…' : (form?.assigned_to && String(form.assigned_to).startsWith('contact_') && contacts.find(x => x.id === form.assigned_to.replace('contact_',''))?.email) ? '✉ Save & Send' : 'Save RFI'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function RFIResponseBox({ detail, onRespond }) {
  const [response, setResponse] = useState(detail.response||'')
  const [saving, setSaving] = useState(false)
  useEffect(() => setResponse(detail.response||''), [detail.id])
  async function submit() {
    if (!response.trim()) return
    setSaving(true); await onRespond(response); setSaving(false)
  }
  return (
    <div>
      <div style={{ fontSize:11, fontWeight:700, color:'#9CA3AF', textTransform:'uppercase', letterSpacing:'.05em', marginBottom:6 }}>Response</div>
      <textarea value={response} onChange={e => setResponse(e.target.value)} rows={4}
        placeholder="Add a response…"
        style={{ width:'100%', padding:'10px 12px', border:'1px solid #DDE3EC', borderRadius:10, fontSize:13, outline:'none', resize:'vertical', fontFamily:'inherit', boxSizing:'border-box' }}/>
      <button onClick={submit} disabled={saving||!response.trim()}
        style={{ marginTop:8, padding:'9px 20px', borderRadius:9, border:'none', fontSize:13, fontWeight:700,
          cursor:response.trim()?'pointer':'default',
          background:response.trim()?'#1D9E75':'#E8ECF0', color:response.trim()?'#fff':'#9CA3AF' }}>
        {saving ? 'Saving…' : 'Save response'}
      </button>
    </div>
  )
}

function RFIDetailPanel({ rfi, profiles, onClose, onRespond, onStatusChange }) {
  const [response, setResponse] = useState(rfi.response || '')
  const [saving, setSaving]     = useState(false)

  useEffect(() => { setResponse(rfi.response || '') }, [rfi.id])

  function profileName(id) {
    const p = (profiles||[]).find(x => x.id === id)
    return p ? (p.full_name || p.email) : ''
  }

  async function submit() {
    if (!response.trim()) return
    setSaving(true)
    await onRespond(response)
    setSaving(false)
  }

  const ss = STATUS_STYLE[rfi.status] || STATUS_STYLE.Open

  return (
    <div style={{ position:'fixed', inset:0, zIndex:600, background:'rgba(0,0,0,0.45)', display:'flex', alignItems:'center', justifyContent:'center', padding:16 }}
      onClick={e => e.target===e.currentTarget && onClose()}>
      <div style={{ background:'#fff', borderRadius:14, width:'100%', maxWidth:500, maxHeight:'88vh', display:'flex', flexDirection:'column', boxShadow:'0 20px 60px rgba(0,0,0,0.2)' }}>
        <div style={{ padding:'14px 18px', borderBottom:'1px solid #F3F4F6', display:'flex', justifyContent:'space-between', alignItems:'flex-start', flexShrink:0 }}>
          <div>
            <div style={{ fontSize:10, fontWeight:700, color:'#9CA3AF', fontFamily:'monospace', marginBottom:3 }}>
              RFI-{String(rfi.number||0).padStart(3,'0')}
            </div>
            <div style={{ fontSize:16, fontWeight:800, color:'#2A3042' }}>{rfi.title}</div>
          </div>
          <button onClick={onClose} style={{ background:'none', border:'none', cursor:'pointer', color:'#9CA3AF', fontSize:22, lineHeight:1, flexShrink:0 }}>×</button>
        </div>
        <div style={{ flex:1, overflowY:'auto', padding:18 }}>
          {/* Status buttons */}
          <div style={{ display:'flex', gap:6, flexWrap:'wrap', marginBottom:14 }}>
            {Object.keys(STATUS_STYLE).map(s => {
              const st = STATUS_STYLE[s]
              return (
                <button key={s} onClick={() => onStatusChange(s)}
                  style={{ padding:'4px 12px', borderRadius:20, fontSize:11, fontWeight:s===rfi.status?700:500, cursor:'pointer',
                    border:`1px solid ${s===rfi.status?st.border:'#E8ECF0'}`,
                    background:s===rfi.status?st.bg:'#fff',
                    color:s===rfi.status?st.color:'#9CA3AF' }}>
                  {s}
                </button>
              )
            })}
          </div>

          {rfi.description && (
            <div style={{ marginBottom:14 }}>
              <div style={{ fontSize:11, fontWeight:700, color:'#9CA3AF', textTransform:'uppercase', letterSpacing:'.05em', marginBottom:4 }}>Description</div>
              <div style={{ fontSize:13, color:'#374151', lineHeight:1.6 }}>{rfi.description}</div>
            </div>
          )}

          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8, marginBottom:14, fontSize:12 }}>
            {rfi.assigned_to && profileName(rfi.assigned_to) && (
              <div><span style={{ color:'#9CA3AF' }}>Assigned: </span><strong>{profileName(rfi.assigned_to)}</strong></div>
            )}
            {rfi.due_date && <div><span style={{ color:'#9CA3AF' }}>Due: </span><strong>{fmtDate(rfi.due_date)}</strong></div>}
            <div><span style={{ color:'#9CA3AF' }}>Type: </span><strong style={{ textTransform:'capitalize' }}>{rfi.type}</strong></div>
            <div><span style={{ color:'#9CA3AF' }}>Priority: </span><strong>{rfi.priority}</strong></div>
            <div><span style={{ color:'#9CA3AF' }}>Created: </span><strong>{fmtDateTime(rfi.created_at)}</strong></div>
          </div>

          <div>
            <div style={{ fontSize:11, fontWeight:700, color:'#9CA3AF', textTransform:'uppercase', letterSpacing:'.05em', marginBottom:6 }}>Response</div>
            <textarea value={response} onChange={e => setResponse(e.target.value)} rows={4}
              placeholder="Add a response…"
              style={{ width:'100%', padding:'10px 12px', border:'1px solid #DDE3EC', borderRadius:10, fontSize:13, outline:'none', resize:'vertical', fontFamily:'inherit', boxSizing:'border-box' }}/>
            <button onClick={submit} disabled={saving || !response.trim()}
              style={{ marginTop:8, padding:'9px 20px', borderRadius:9, border:'none', fontSize:13, fontWeight:700, cursor:response.trim()?'pointer':'default',
                background:response.trim()?'#1D9E75':'#E8ECF0', color:response.trim()?'#fff':'#9CA3AF' }}>
              {saving ? 'Saving…' : 'Save response'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Scrollable Job Tabs ───────────────────────────────────────────
// ── Job Overview — room-by-room status & order summary ──────────────
const OVERVIEW_STATUS_COLORS = {
  'Pending':                '#9CA3AF',
  'In progress':            '#5B8AF0',
  'Submitted for approval': '#F97316',
  'Review':                 '#EF9F27',
  'On hold':                '#E24B4A',
  'Nested':                 '#8B5CF6',
  'Complete':               '#1D9E75',
}

function JobOverviewTab({ jobId, rooms, unorderedCount, onOpenRoomsTab, onOpenRoom, onRoomsChange, toast, rfis = [] }) {
  const [roomOrderStats, setRoomOrderStats] = React.useState({}) // room_id -> { total, ordered, toOrder }
  const [loading, setLoading] = React.useState(true)
  const [roomTaskCounts, setRoomTaskCounts] = React.useState({})
  const [sortMode, setSortMode] = React.useState(() => { try { return localStorage.getItem('room_sort_mode') || 'alpha' } catch { return 'alpha' } })

  React.useEffect(() => {
    function syncSortMode() { try { setSortMode(localStorage.getItem('room_sort_mode') || 'alpha') } catch {} }
    window.addEventListener('focus', syncSortMode)
    return () => window.removeEventListener('focus', syncSortMode)
  }, [])

  const priorityOrderedRooms = React.useMemo(() => {
    return [...rooms].sort((a, b) => (a.priority || 999) - (b.priority || 999))
  }, [rooms])

  // ── Reorder via up/down arrows, staged locally until Save is pressed ──
  const [pendingOrder, setPendingOrder] = React.useState(null)
  const [savingOrder, setSavingOrder] = React.useState(false)
  const baseOrderIds = React.useMemo(() => priorityOrderedRooms.map(r => r.id), [priorityOrderedRooms])
  const workingOrderIds = pendingOrder || baseOrderIds
  const hasUnsavedOrder = pendingOrder !== null

  function nudgeRoom(roomId, direction) {
    if (sortMode !== 'priority') { setSortMode('priority'); try { localStorage.setItem('room_sort_mode','priority') } catch {} }
    setPendingOrder(prev => {
      const current = prev || baseOrderIds
      const idx = current.indexOf(roomId)
      const targetIdx = idx + direction
      if (idx === -1 || targetIdx < 0 || targetIdx >= current.length) return prev
      const next = [...current]
      ;[next[idx], next[targetIdx]] = [next[targetIdx], next[idx]]
      return next
    })
  }

  async function saveRoomOrder() {
    if (!pendingOrder) return
    setSavingOrder(true)
    const updates = pendingOrder.map((id, i) => ({ id, priority: i + 1 }))
    onRoomsChange(p => p.map(r => {
      const u = updates.find(x => x.id === r.id)
      return u ? { ...r, priority: u.priority } : r
    }))
    await Promise.all(updates.map(u => supabase.from('rooms').update({ priority: u.priority }).eq('id', u.id)))
    setSavingOrder(false)
    setPendingOrder(null)
    toast?.('Room order saved ✓')
  }

  function cancelRoomOrder() {
    setPendingOrder(null)
  }

  // Mirror the same sort preference used on the Rooms tab — alphabetical by default.
  // If there's an unsaved reorder staged, that takes precedence so the list reflects
  // exactly what will be saved.
  const sortedRooms = React.useMemo(() => {
    if (hasUnsavedOrder) {
      return workingOrderIds.map(id => rooms.find(r => r.id === id)).filter(Boolean)
    }
    const list = [...rooms]
    if (sortMode === 'priority') {
      list.sort((a, b) => {
        const pa = a.priority || 999
        const pb = b.priority || 999
        if (pa !== pb) return pa - pb
        return (a.name || '').localeCompare(b.name || '')
      })
    } else {
      list.sort((a, b) => (a.name || '').localeCompare(b.name || ''))
    }
    return list
  }, [rooms, sortMode, hasUnsavedOrder, workingOrderIds])

  React.useEffect(() => {
    if (!jobId) return
    setLoading(true)
    supabase.from('order_items').select('room_id,status').eq('job_id', jobId)
      .then(({ data }) => {
        const stats = {}
        ;(data || []).forEach(o => {
          if (!o.room_id) return
          if (!stats[o.room_id]) stats[o.room_id] = { total:0, ordered:0, toOrder:0, received:0 }
          stats[o.room_id].total++
          if (o.status === 'Ordered') stats[o.room_id].ordered++
          else if (o.status === 'To order') stats[o.room_id].toOrder++
          else if (o.status === 'Received') stats[o.room_id].received++
        })
        setRoomOrderStats(stats)
        setLoading(false)
      })
  }, [jobId, rooms.length])

  React.useEffect(() => {
    const counts = {}
    ;(rooms || []).forEach(r => {
      const tasks = r.tasks ? (typeof r.tasks==='string' ? JSON.parse(r.tasks) : r.tasks) : []
      counts[r.id] = tasks.filter(t => !t.done).length
    })
    setRoomTaskCounts(counts)
  }, [rooms])

  const totalRooms = rooms.length
  const HIDDEN_STATUSES = ['Nested', 'Complete']
  const [showHidden, setShowHidden] = React.useState(() => { try { return localStorage.getItem('rooms_show_hidden') !== 'false' } catch { return true } })

  // Per-room RFI status — computed directly (no memo) so always fresh
  const _tod = new Date(); _tod.setHours(0,0,0,0)
  const roomRfiStatus = {}
  rooms.forEach(room => {
    const roomRfis = rfis.filter(r => r.room_id === room.id)
    const openRfis = roomRfis.filter(r => r.status === 'Open' || r.status === 'In Review')
    const overdueRfis = openRfis.filter(r => r.due_date && new Date(r.due_date) < _tod)
    roomRfiStatus[room.id] = {
      roomRfis, openRfis, overdueRfis,
      color: roomRfis.length === 0 ? null : overdueRfis.length > 0 ? '#E24B4A' : openRfis.length > 0 ? '#F97316' : '#1D9E75',
      title: roomRfis.length === 0 ? '' : overdueRfis.length > 0 ? `${overdueRfis.length} overdue RFI${overdueRfis.length!==1?'s':''}` : openRfis.length > 0 ? `${openRfis.length} open RFI${openRfis.length!==1?'s':''}` : `All ${roomRfis.length} RFIs resolved`,
    }
  })

  const statusCounts = {}
  rooms.forEach(r => {
    const s = r.status || 'Pending'
    statusCounts[s] = (statusCounts[s] || 0) + 1
  })
  const completeCount = statusCounts['Complete'] || 0

  const allOrderTotals = Object.values(roomOrderStats).reduce((acc, s) => ({
    total: acc.total + s.total, ordered: acc.ordered + s.ordered, toOrder: acc.toOrder + s.toOrder, received: acc.received + s.received,
  }), { total:0, ordered:0, toOrder:0, received:0 })

  function roomEmoji(room) {
    if (room.icon) return room.icon
    const t = room.type
    return t==='Kitchen'?'🍳':t==='Laundry'?'🫧':t==='Bathroom'||t==='Ensuite'?'🚿':t==='Bedroom'?'🛏':t==='Living'?'🛋':t==='Office'?'💼':'🏠'
  }

  return (
    <div style={{ marginBottom:16 }}>
      {/* Summary stat row */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(140px, 1fr))', gap:10, marginBottom:16 }}>
        <div style={{ background:'#fff', borderRadius:12, border:'1px solid #E8ECF0', padding:'14px 16px' }}>
          <div style={{ fontSize:11, fontWeight:700, color:'#9CA3AF', textTransform:'uppercase', letterSpacing:'.05em', marginBottom:4 }}>Rooms</div>
          <div style={{ fontSize:22, fontWeight:800, color:'#2A3042' }}>{totalRooms}</div>
          <div style={{ fontSize:11, color:'#9CA3AF', marginTop:2 }}>{completeCount} complete</div>
        </div>
        <div style={{ background:'#fff', borderRadius:12, border:'1px solid #E8ECF0', padding:'14px 16px' }}>
          <div style={{ fontSize:11, fontWeight:700, color:'#9CA3AF', textTransform:'uppercase', letterSpacing:'.05em', marginBottom:4 }}>Materials ordered</div>
          <div style={{ fontSize:22, fontWeight:800, color:'#2A3042' }}>{allOrderTotals.ordered + allOrderTotals.received}<span style={{ fontSize:14, fontWeight:600, color:'#C4C9D4' }}>/{allOrderTotals.total}</span></div>
          <div style={{ fontSize:11, color: allOrderTotals.toOrder > 0 ? '#E24B4A' : '#9CA3AF', marginTop:2 }}>
            {allOrderTotals.toOrder > 0 ? `${allOrderTotals.toOrder} still to order` : 'All ordered'}
          </div>
        </div>
        <div onClick={onOpenRoomsTab} style={{ background:'#fff', borderRadius:12, border:'1px solid #E8ECF0', padding:'14px 16px', cursor:'pointer' }}
          onMouseEnter={e=>e.currentTarget.style.borderColor='#C4D4F8'} onMouseLeave={e=>e.currentTarget.style.borderColor='#E8ECF0'}>
          <div style={{ fontSize:11, fontWeight:700, color:'#9CA3AF', textTransform:'uppercase', letterSpacing:'.05em', marginBottom:4 }}>Open tasks</div>
          <div style={{ fontSize:22, fontWeight:800, color:'#2A3042' }}>{Object.values(roomTaskCounts).reduce((a,b)=>a+b,0)}</div>
          <div style={{ fontSize:11, color:'#5B8AF0', marginTop:2 }}>across all rooms →</div>
        </div>
      </div>

      {/* Status breakdown bar */}
      {totalRooms > 0 && (
        <div style={{ background:'#fff', borderRadius:12, border:'1px solid #E8ECF0', padding:'14px 16px', marginBottom:16 }}>
          <div style={{ fontSize:11, fontWeight:700, color:'#9CA3AF', textTransform:'uppercase', letterSpacing:'.05em', marginBottom:10 }}>Room status breakdown</div>
          <div style={{ display:'flex', height:10, borderRadius:6, overflow:'hidden', marginBottom:10 }}>
            {Object.entries(statusCounts).map(([status, count]) => (
              <div key={status} title={`${status}: ${count}`} style={{ flex:count, background: OVERVIEW_STATUS_COLORS[status] || '#9CA3AF' }} />
            ))}
          </div>
          <div style={{ display:'flex', flexWrap:'wrap', gap:'6px 14px' }}>
            {Object.entries(statusCounts).map(([status, count]) => (
              <div key={status} style={{ display:'flex', alignItems:'center', gap:5, fontSize:11, color:'#6B7280' }}>
                <span style={{ width:8, height:8, borderRadius:'50%', background: OVERVIEW_STATUS_COLORS[status] || '#9CA3AF', flexShrink:0 }} />
                {status} ({count})
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Room cards */}
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:12 }}>
        <div style={{ fontSize:11, fontWeight:700, color:'#9CA3AF', textTransform:'uppercase', letterSpacing:'.05em' }}>Rooms</div>
        {totalRooms > 1 && (
          <div style={{ display:'flex', alignItems:'center', gap:8 }}>
            {rooms.some(r => HIDDEN_STATUSES.includes(r.status || '')) && (
              <button onClick={() => setShowHidden(s => { const n=!s; try{localStorage.setItem('rooms_show_hidden',String(n))}catch{}; return n })}
                style={{ fontSize:11, fontWeight:600, padding:'5px 10px', borderRadius:8, border:'1px solid #E8ECF0', background:'#fff', color:'#6B7280', cursor:'pointer' }}>
                {showHidden
                  ? `Hide completed (${rooms.filter(r => HIDDEN_STATUSES.includes(r.status||'')).length})`
                  : `Show completed (${rooms.filter(r => HIDDEN_STATUSES.includes(r.status||'')).length})`}
              </button>
            )}
            <div style={{ display:'flex', background:'#F3F4F6', borderRadius:8, padding:2 }}>
              <button onClick={() => { setSortMode('alpha'); try { localStorage.setItem('room_sort_mode','alpha') } catch {} }}
                style={{ fontSize:11, fontWeight:600, padding:'5px 10px', borderRadius:6, border:'none', cursor:'pointer',
                  background: sortMode==='alpha' ? '#fff' : 'transparent', color: sortMode==='alpha' ? '#2A3042' : '#9CA3AF',
                  boxShadow: sortMode==='alpha' ? '0 1px 2px rgba(0,0,0,0.08)' : 'none' }}>
                A–Z
              </button>
              <button onClick={() => { setSortMode('priority'); try { localStorage.setItem('room_sort_mode','priority') } catch {} }}
                style={{ fontSize:11, fontWeight:600, padding:'5px 10px', borderRadius:6, border:'none', cursor:'pointer',
                  background: sortMode==='priority' ? '#fff' : 'transparent', color: sortMode==='priority' ? '#2A3042' : '#9CA3AF',
                  boxShadow: sortMode==='priority' ? '0 1px 2px rgba(0,0,0,0.08)' : 'none' }}>
                Priority
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Unsaved reorder banner */}
      {hasUnsavedOrder && (
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', gap:10, background:'#FFF7ED', border:'1px solid #FDBA74', borderRadius:10, padding:'10px 14px', marginBottom:14 }}>
          <div style={{ fontSize:12, fontWeight:600, color:'#C2410C' }}>
            Build order changed — not saved yet
          </div>
          <div style={{ display:'flex', gap:8 }}>
            <button onClick={cancelRoomOrder} disabled={savingOrder}
              style={{ fontSize:12, fontWeight:600, padding:'6px 14px', borderRadius:8, border:'1px solid #E8ECF0', background:'#fff', color:'#6B7280', cursor:'pointer' }}>
              Cancel
            </button>
            <button onClick={saveRoomOrder} disabled={savingOrder}
              style={{ fontSize:12, fontWeight:700, padding:'6px 16px', borderRadius:8, border:'none', background:'#1D9E75', color:'#fff', cursor:'pointer' }}>
              {savingOrder ? 'Saving…' : 'Save order'}
            </button>
          </div>
        </div>
      )}

      {totalRooms === 0 ? (
        <div style={{ background:'#fff', borderRadius:12, border:'1px solid #E8ECF0', padding:'40px 20px', textAlign:'center' }}>
          <div style={{ fontSize:32, marginBottom:8 }}>🏠</div>
          <div style={{ fontSize:14, fontWeight:700, color:'#2A3042', marginBottom:4 }}>No rooms added yet</div>
          <div style={{ fontSize:12, color:'#9CA3AF', marginBottom:14 }}>Add rooms to start tracking progress room by room</div>
          <button onClick={onOpenRoomsTab}
            style={{ padding:'8px 18px', borderRadius:9, border:'none', background:'#5B8AF0', color:'#fff', fontSize:13, fontWeight:700, cursor:'pointer' }}>
            + Add a room
          </button>
        </div>
      ) : (
        <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
          {(showHidden ? sortedRooms : sortedRooms.filter(r => !HIDDEN_STATUSES.includes(r.status || ''))).map(room => {
            const status = room.status || 'Pending'
            const color = OVERVIEW_STATUS_COLORS[status] || '#9CA3AF'
            const stats = roomOrderStats[room.id] || { total:0, ordered:0, toOrder:0, received:0 }
            const orderedCount = stats.ordered + stats.received
            const allOrdered = stats.total > 0 && stats.toOrder === 0
            const taskCount = roomTaskCounts[room.id] || 0
            const tasks = room.tasks ? (typeof room.tasks==='string' ? JSON.parse(room.tasks) : room.tasks) : []
            const TODAY_OV = new Date(); TODAY_OV.setHours(0,0,0,0)
            const openTasks = tasks.filter(t => !t.done)
            const overdueTasks = openTasks.filter(t => t.date && new Date(t.date) < TODAY_OV)
            const taskIconColor = tasks.length === 0 ? null : overdueTasks.length > 0 ? '#E24B4A' : openTasks.length > 0 ? '#F97316' : '#1D9E75'
            const rfi = roomRfiStatus[room.id] || {}
            const workingIdx = workingOrderIds.indexOf(room.id)
            const roomPriority = workingIdx + 1

            return (
              <div key={room.id}
                className="overview-room-row"
                onClick={() => onOpenRoom(room)}
                style={{
                  display:'flex', alignItems:'center', gap:12,
                  background:'#fff', borderRadius:12,
                  border: '1px solid #E8ECF0',
                  padding:'10px 14px', cursor:'pointer',
                  transition:'all .12s',
                }}
                onMouseEnter={e=>{ e.currentTarget.style.boxShadow='0 4px 14px rgba(0,0,0,0.08)'; e.currentTarget.style.borderColor='#C4D4F8' }}
                onMouseLeave={e=>{ e.currentTarget.style.boxShadow='none'; e.currentTarget.style.borderColor='#E8ECF0' }}>

                {/* Reorder arrows — stage a move locally; nothing saves until Save order is pressed.
                    Stacked vertically on the left, matching the up/down direction they control. */}
                <div onClick={e => e.stopPropagation()}
                  style={{ display:'flex', flexDirection:'column', gap:1, flexShrink:0 }}>
                  <button onClick={() => nudgeRoom(room.id, -1)} disabled={workingIdx <= 0}
                    title="Move up in build order"
                    style={{ width:22, height:18, display:'flex', alignItems:'center', justifyContent:'center', background: workingIdx<=0 ? 'none' : '#F0F4FF', borderRadius:5, border:'none', cursor: workingIdx<=0 ? 'default' : 'pointer', color: workingIdx<=0 ? '#E8ECF0' : '#5B8AF0', padding:0 }}>
                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><polyline points="18 15 12 9 6 15"/></svg>
                  </button>
                  <button onClick={() => nudgeRoom(room.id, 1)} disabled={workingIdx >= workingOrderIds.length - 1}
                    title="Move down in build order"
                    style={{ width:22, height:18, display:'flex', alignItems:'center', justifyContent:'center', background: workingIdx>=workingOrderIds.length-1 ? 'none' : '#F0F4FF', borderRadius:5, border:'none', cursor: workingIdx>=workingOrderIds.length-1 ? 'default' : 'pointer', color: workingIdx>=workingOrderIds.length-1 ? '#E8ECF0' : '#5B8AF0', padding:0 }}>
                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><polyline points="6 9 12 15 18 9"/></svg>
                  </button>
                </div>

                {/* Priority number */}
                <span title={`Build priority: ${roomPriority}`}
                  style={{ width:24, height:24, borderRadius:7, background: hasUnsavedOrder ? '#FFF7ED' : '#F0F4FF', border: hasUnsavedOrder ? '1px solid #FDBA74' : '1px solid #C4D4F8', color: hasUnsavedOrder ? '#C2410C' : '#3730A3', fontSize:11, fontWeight:800, display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
                  {roomPriority}
                </span>

                {/* Icon */}
                <div style={{ width:36, height:36, borderRadius:9, background:'#F0F4FF', display:'flex', alignItems:'center', justifyContent:'center', fontSize:17, flexShrink:0 }}>
                  {roomEmoji(room)}
                </div>

                {/* Name + type */}
                <div style={{ minWidth:0, width:160, flexShrink:0 }}>
                  <div style={{ fontSize:13, fontWeight:700, color:'#2A3042', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{room.name}</div>
                  <div style={{ fontSize:11, color:'#9CA3AF' }}>{room.type}</div>
                </div>

                {/* Status + task badges */}
                <div style={{ display:'flex', alignItems:'center', gap:6, flexShrink:0, width:190 }}>
                  <span style={{ fontSize:10, fontWeight:700, padding:'3px 9px', borderRadius:7, background:`${color}18`, color, border:`1px solid ${color}40`, whiteSpace:'nowrap' }}>
                    {status}
                  </span>
                  {taskIconColor && (
                    <span title={openTasks.length === 0 ? 'All tasks done' : overdueTasks.length > 0 ? `${overdueTasks.length} overdue` : `${openTasks.length} open`}
                      style={{ display:'flex', alignItems:'center', gap:3, fontSize:10, fontWeight:700, padding:'3px 7px', borderRadius:7, background:`${taskIconColor}18`, color:taskIconColor, border:`1px solid ${taskIconColor}30`, whiteSpace:'nowrap' }}>
                      <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="9 11 12 14 22 4"/><path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11"/></svg>
                      {openTasks.length === 0 ? '✓' : openTasks.length}
                    </span>
                  )}
                  {rfi.color && (
                    <span title={rfi.title}
                      style={{ display:'flex', alignItems:'center', gap:3, fontSize:10, fontWeight:700, padding:'3px 7px', borderRadius:7, background:`${rfi.color}18`, color:rfi.color, border:`1px solid ${rfi.color}30`, whiteSpace:'nowrap' }}>
                      <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
                      {rfi.openRfis?.length === 0 ? '✓' : rfi.openRfis?.length}
                    </span>
                  )}
                </div>

                {/* Materials ordered indicator */}
                <div style={{ flex:1, minWidth:120 }}>
                  {stats.total > 0 ? (
                    <div>
                      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:4 }}>
                        <span style={{ fontSize:11, color:'#6B7280' }}>Materials</span>
                        <span style={{ fontSize:11, fontWeight:700, color: allOrdered ? '#1D9E75' : '#E24B4A' }}>
                          {orderedCount}/{stats.total} {allOrdered ? '✓' : ''}
                        </span>
                      </div>
                      <div style={{ height:6, borderRadius:4, background:'#F3F4F6', overflow:'hidden' }}>
                        <div style={{ height:'100%', width:`${(orderedCount/stats.total)*100}%`, background: allOrdered ? '#1D9E75' : '#F97316', transition:'width .2s' }} />
                      </div>
                    </div>
                  ) : (
                    <div style={{ fontSize:11, color:'#C4C9D4', fontStyle:'italic' }}>No materials ordered yet</div>
                  )}
                </div>

                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#C4C9D4" strokeWidth="2" style={{ flexShrink:0 }}>
                  <polyline points="9 18 15 12 9 6"/>
                </svg>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

function JobScrollableTabs({ jobTab, setJobTab, rooms, processes, specs, atts, feedback, unorderedCount, openTasks, allMaterials, setAllMaterials, allAppliances, setAllAppliances }) {
  const scrollRef = React.useRef()
  const [canLeft, setCanLeft]   = React.useState(false)
  const [canRight, setCanRight] = React.useState(false)

  const tabs = [
    { key:'overview',   label:'Overview' },
    { key:'details',    label:'Details' },
    { key:'contacts',   label:'Contacts' },
    { key:'rfi',        label:'RFI' },
    { key:'tasks',      label:'Tasks',     badge: openTasks?.length||null },
    { key:'rooms',      label:'Rooms',     badge: rooms?.length||null },
    { key:'materials',  label:'Materials' },
    { key:'appliances', label:'Appliances' },
    { key:'processes',  label:'Processes', badge: processes?.filter(p=>p.status!=='Complete').length||null },
    { key:'startup',    label:'Startup' },
    { key:'notes',      label:'Notes' },
    { key:'orders',     label:'Orders',    badge: unorderedCount||null },
    { key:'files',      label:'Files',     badge: atts?.length||null },
    { key:'feedback',   label:'Feedback',  badge: feedback?.filter(f=>f.status==='Open').length||null },
    { key:'specs',      label:'Specs',     badge: specs?.length||null },
    { key:'onsite',     label:'On-Site' },
  ]

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
    el.addEventListener('scroll', updateArrows, { passive:true })
    const ro = new ResizeObserver(updateArrows)
    ro.observe(el)
    return () => { el.removeEventListener('scroll', updateArrows); ro.disconnect() }
  }, [])

  // Scroll active tab into view when tab changes
  React.useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    const activeBtn = el.querySelector('[data-active="true"]')
    if (activeBtn) activeBtn.scrollIntoView({ behavior:'smooth', block:'nearest', inline:'nearest' })
  }, [jobTab])

  function scroll(dir) {
    scrollRef.current?.scrollBy({ left: dir * 140, behavior:'smooth' })
  }

  const arrowBtn = (show, dir) => (
    <button onClick={() => scroll(dir)}
      style={{ flexShrink:0, width:26, height:34, display:'flex', alignItems:'center', justifyContent:'center',
        background:'#fff', border:'1px solid #E8ECF0', borderRadius:8, cursor:'pointer',
        fontSize:14, color:'#6B7280', opacity: show ? 1 : 0, pointerEvents: show ? 'auto' : 'none', transition:'opacity .15s' }}>
      {dir < 0 ? '‹' : '›'}
    </button>
  )

  return (
    <div style={{ display:'flex', alignItems:'center', gap:4, marginBottom:16, minWidth:0 }}>
      {arrowBtn(canLeft, -1)}
      <div ref={scrollRef} onScroll={updateArrows}
        style={{ display:'flex', gap:2, flex:1, overflowX:'auto', background:'#F3F4F6', borderRadius:12, padding:4,
          scrollbarWidth:'none', msOverflowStyle:'none', WebkitOverflowScrolling:'touch', minWidth:0 }}>
        <style>{`.jd-tabs2::-webkit-scrollbar{display:none}`}</style>
        {tabs.map(t => (
          <button key={t.key} data-active={jobTab===t.key ? 'true' : 'false'}
            onClick={() => {
              setJobTab(t.key)
              if (t.key==='materials' && (!allMaterials||allMaterials.length===0))
                supabase.from('materials').select('id,name,supplier,panel_type,thickness,colour_code,finish,price,color,storage_path,category_id,custom_fields').order('name').then(({data})=>setAllMaterials(data||[]))
              if (t.key==='appliances' && (!allAppliances||allAppliances.length===0))
                supabase.from('appliances').select('id,name,brand,model,type,supplier,sku,price,storage_path,category_id').order('brand').then(({data})=>setAllAppliances(data||[]))
            }}
            style={{ display:'flex', alignItems:'center', gap:5, padding:'7px 12px', borderRadius:9, border:'none',
              cursor:'pointer', whiteSpace:'nowrap', flexShrink:0, fontSize:13,
              fontWeight: jobTab===t.key?700:500,
              background: jobTab===t.key?'#fff':'transparent',
              color: jobTab===t.key?'#2A3042':'#6B7280',
              boxShadow: jobTab===t.key?'0 1px 3px rgba(0,0,0,0.1)':'none' }}>
            {t.label}
            {t.badge ? <span style={{ fontSize:10, fontWeight:700, minWidth:16, height:16, borderRadius:8,
              background:jobTab===t.key?'#5B8AF0':'#9CA3AF', color:'#fff',
              display:'flex', alignItems:'center', justifyContent:'center', padding:'0 4px' }}>{t.badge}</span> : null}
          </button>
        ))}
      </div>
      {arrowBtn(canRight, 1)}
    </div>
  )
}

export default function JobDetail() {
  const { id }  = useParams()
  const navigate = useNavigate()
  const location = useLocation()
  const toast    = useToast()
  const { can, profile } = useApp()

  const [allJobProfiles, setAllJobProfiles] = useState([])
  const [job, setJob]       = useState(() => {
    try { const s = sessionStorage.getItem('draft_job_'+id); return s ? JSON.parse(s) : null } catch { return null }
  })
  const [atts, setAtts]     = useState([])
  const [materials, setMaterials] = useState([])
  const [jobMats, setJobMats]     = useState([])
  const [allMats, setAllMats]     = useState([])
  const [panelMaterials, setPanelMaterials] = useState([])
  const [loading, setLoading]     = useState(true)
  const [saving, setSaving]       = useState(false)
  const [tasks, setTasks]         = useState([])
  const [taskForm, setTaskForm]   = useState(false)
  const [newTask, setNewTask]     = useState({ title:'', date:'', time:'09:00', priority:'Medium' })
  const [editingTaskId, setEditingTaskId] = useState(null)
  const [matPickerOpen, setMatPickerOpen] = useState(false)
  const [matSearch, setMatSearch] = useState('')
  const [lbIdx, setLbIdx]         = useState(null)
  const [uploading, setUploading]   = useState(false)
  const [fileTypes, setFileTypes]   = useState([])
  const [approvals, setApprovals]   = useState([])
  const [pendingType, setPendingType] = useState('') // file_type_id for next upload
  const [showTypeModal, setShowTypeModal] = useState(false) // pending files waiting for type
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [timeRefresh, setTimeRefresh] = useState(0)
  const specsRef = React.useRef(null) // holds kitchen_specs without triggering re-renders
  const [jobNotes, setJobNotes] = useState([])
  const [startupNote, setStartupNote] = useState(null)
  const [showStartup, setShowStartup] = useState(false)
  const [rooms, setRooms]             = useState([])
  const [activeRoom, setActiveRoom]   = useState(null)
  const [processes, setProcesses]     = useState([])
  const [timeHistory, setTimeHistory] = useState([])
  const [feedback, setFeedback]       = useState([])
  const [specs, setSpecs]             = useState([])
  const [activeSpecId, setActiveSpecId] = useState(null)
  const jobStatuses = useJobStatuses()
  const roomStatuses = useRoomStatuses()
  const [rightTab, setRightTab]       = useState('rooms')
  const [activeEntries, setActiveEntries] = useState({}) // processId->entry — shared across panels
  const [unorderedCount, setUnorderedCount] = useState(0)
  const [jobLevelRfis, setJobLevelRfis] = useState([]) // rfis loaded at job level for overview/room icons
  const [showProcesses, setShowProcesses] = useState(false)
  const [startupOpenKey, setStartupOpenKey] = useState(0)
  const [allNotes, setAllNotes] = useState([])
  const [allJobs, setAllJobs] = useState([])
  const [dirty, setDirty] = useState(false)
  const [jobTab, setJobTab] = useState(() => new URLSearchParams(location.search).get('tab') || 'overview')
  // Refresh the lightweight RFI list (used for room-row icons) whenever switching
  // to a tab that shows them, so status changes made in the RFI tab are reflected.
  React.useEffect(() => {
    if (jobTab === 'overview' || jobTab === 'rooms') {
      supabase.from('job_rfis').select('id,title,status,due_date,number,room_id').eq('job_id',id).order('created_at')
        .then(({data}) => setJobLevelRfis(data||[]))
    }
  }, [jobTab, id])
  const [autoOpenRoomId, setAutoOpenRoomId] = useState(() => new URLSearchParams(location.search).get('room') || null)
  // Persist edits to sessionStorage — survives page reload
  const _jobRef = React.useRef(job)
  _jobRef.current = job
  useEffect(() => {
    if (dirty && job) try { sessionStorage.setItem('draft_job_'+id, JSON.stringify(job)) } catch {}
  }, [job, dirty, id])
  function clearJobDraft() { try { sessionStorage.removeItem('draft_job_'+id) } catch {} }

  const [jobAppliances, setJobAppliances] = useState([])
  const [allAppliances, setAllAppliances] = useState([])
  const [allMaterials,  setAllMaterials]  = useState([])
  const [showAppPicker, setShowAppPicker] = useState(false)

  // Track if all-materials has been fetched yet (lazy)
  const allMatsFetched = React.useRef(false)

  const loadAll = useCallback(async () => {
    // Only fetch what we need to render the page immediately
    // allMats (materials library) is fetched lazily when picker is opened
    const [{ data: j }, { data: a }, { data: jm }, { data: panelMats }, { data: ja }, { data: appLib }, { data: jNotes }, { data: fTypes }, { data: approvs }] = await Promise.all([
      supabase.from('jobs').select('*,customers(id,first_name,last_name,company)').eq('id', id).single(),
      supabase.from('attachments').select('id,name,size,type,storage_path,created_at,file_type_id').eq('job_id', id).order('created_at'),
      supabase.from('job_materials').select('*,materials(*)').eq('job_id', id),
      Promise.resolve({ data: [] }), // materials loaded lazily on tab open
      supabase.from('job_appliances').select('*,appliances(*)').eq('job_id', id).order('created_at'),
      Promise.resolve({ data: [] }), // appliances loaded lazily on tab open
      supabase.from('notes').select('id,title,is_public,created_by,updated_at,content,is_startup').eq('job_id', id).order('updated_at',{ascending:false}),
      supabase.from('file_types').select('*').order('name'),
      supabase.from('approval_requests').select('*,profiles!approval_requests_requested_by_fkey(full_name,email),reviewer:profiles!approval_requests_reviewed_by_fkey(full_name,email)').eq('job_id', id),
    ])
    setJob(j); setAtts(a||[])
    // Enrich material names using auto-name settings from Materials screen
    const rawJm = jm || []
    const enriched = await Promise.all(rawJm.map(async row => {
      if (!row.materials) return row
      const named = await enrichMaterialNames([row.materials])
      return { ...row, materials: named[0] }
    }))
    setJobMats(enriched)
    // Initialise specsRef from loaded job
    specsRef.current = j?.kitchen_specs
      ? (typeof j.kitchen_specs === 'string' ? JSON.parse(j.kitchen_specs) : j.kitchen_specs)
      : {}
    const panelCats = []
    setPanelMaterials((panelMats||[]).filter(m => m.panel_type || m.category_id))
    setTasks(j?.tasks ? JSON.parse(j.tasks) : [])
    setJobAppliances(ja||[])
    setAllAppliances(appLib||[])
    const allNotes = jNotes||[]
    setJobNotes(allNotes.filter(n => !n.is_startup))
    setStartupNote(allNotes.find(n => n.is_startup) || null)
    setFileTypes(fTypes||[])
    setApprovals(approvs||[])
    // Load rooms + rfis together before clearing the loading gate so InlineRoomsPanel
    // always mounts with real data — no race condition, no delayed prop updates.
    const [{ data:roomData }, { data:rfiData }, { data:procData }] = await Promise.all([
      supabase.from('rooms').select('*').eq('job_id', id).order('sort_order'),
      supabase.from('job_rfis').select('id,title,status,due_date,number,room_id').eq('job_id', id).order('created_at'),
      supabase.from('job_processes').select('id,name,status,color,assigned_to,due_date,sort_order,allocated_hours,time_logged,profiles(id,full_name,email)').eq('job_id', id).order('sort_order'),
    ])
    setRooms(roomData||[])
    setJobLevelRfis(rfiData||[])
    setProcesses(procData||[])
    if (autoOpenRoomId) setJobTab('rooms')
    setLoading(false)
    // Load processes
    // processes loaded in parallel above
    // Load feedback
    supabase.from('job_feedback').select('*, profiles(id,full_name,email)').eq('job_id', id).order('created_at',{ascending:false}).then(({data})=>setFeedback(data||[]))
    supabase.from('specs').select('id,title,status,updated_at').eq('job_id', id).order('updated_at',{ascending:false}).then(({data,error})=>{ if(!error){ setSpecs(data||[]); if(data?.length) setActiveSpecId(data[0].id) } })
    // Load active entries at job level so both panels stay in sync
    supabase.from('time_entries').select('id,job_id,user_id,process_id,clocked_in_at,clocked_out_at,duration_minutes').eq('job_id', id).is('clocked_out_at', null)
      .then(({data})=>{ const map={}; (data||[]).forEach(e=>{if(e.process_id)map[e.process_id]=e}); setActiveEntries(map) })
    // Load time history
    supabase.from('time_entries').select('*,profiles(id,full_name,email),job_processes(id,name,color)')
      .eq('job_id', id).order('clocked_in_at',{ascending:false}).limit(30)
      .then(({data})=>setTimeHistory(data||[]))
    // Unordered items count
    supabase.from('order_items').select('id',{count:'exact',head:true}).eq('job_id',id).eq('status','To order').then(({count})=>setUnorderedCount(count||0))
    setDirty(false)
    // Load all jobs + notes for the startup note editor dropdowns
    supabase.from('jobs').select('id,name').order('created_at',{ascending:false}).then(({data}) => setAllJobs(data||[]))
    supabase.from('notes').select('id,title,job_id,is_startup').order('updated_at',{ascending:false}).then(({data}) => setAllNotes(data||[]))
    supabase.from('profiles').select('id,full_name,email').order('full_name').then(({data}) => setAllJobProfiles(data||[]))

    // Always refresh mat_colors to ensure all fields are current
    if (j && jm?.length) {
      const freshColors = (jm||[]).filter(row => row.materials).map(row => ({
        name:         row.materials.name,
        color:        row.materials.color || '#888',
        storage_path: row.materials.storage_path || null,
        supplier:     row.materials.supplier || '',
        panel_type:   row.materials.panel_type || '',
        thickness:    row.materials.thickness || '',
        colour_code:  row.materials.colour_code || '',
        finish:       row.materials.finish || '',
        category_id:  row.materials.category_id || null,
      }))
      const stored = j.mat_colors ? JSON.parse(j.mat_colors) : []
      const needsRefresh = freshColors.some((f, i) =>
        !stored[i] || stored[i].colour_code !== f.colour_code || stored[i].finish !== f.finish
      )
      if (needsRefresh) {
        await supabase.from('jobs').update({ mat_colors: JSON.stringify(freshColors) }).eq('id', j.id)
        setJob(prev => prev ? { ...prev, mat_colors: JSON.stringify(freshColors) } : prev)
      }
    }
  }, [id])

  // Listen for clock changes from the topbar processes dropdown and refresh panels live
  useEffect(() => {
    function handleClockChange(e) {
      if (e.detail?.jobId !== id) return
      supabase.from('job_processes').select('*').eq('job_id',id).order('sort_order')
        .then(({data})=>setProcesses(data||[]))
      supabase.from('time_entries').select('*').eq('job_id',id).is('clocked_out_at',null)
        .then(({data})=>{ const map={}; (data||[]).forEach(e=>{if(e.process_id)map[e.process_id]=e}); setActiveEntries(map) })
      supabase.from('time_entries').select('*,profiles(id,full_name,email),job_processes(id,name,color)')
        .eq('job_id',id).order('clocked_in_at',{ascending:false}).limit(30)
        .then(({data})=>setTimeHistory(data||[]))
    }
    window.addEventListener('process-clock-change', handleClockChange)
    return () => window.removeEventListener('process-clock-change', handleClockChange)
  }, [id])

  useEffect(() => { loadAll() }, [loadAll])

  // Broadcast current state to Layout topbar
  // Use a ref for stable callbacks so the event always fires with current handlers
  const broadcastActions = React.useCallback(() => {
    window.dispatchEvent(new CustomEvent('job-actions', { detail: {
      dirty,
      saving,
      onSave: saveJob,
      onSketch: () => navigate(`/job/${id}/sketch`),
      onOrders: () => navigate(`/job/${id}/orders`),
      jobId: id,
      onProcesses: () => {}, // handled by Layout now
      onStartup: async () => {
        let sNote = null
        const { data: d1 } = await supabase.from('notes')
          .select('id,title,is_public,created_by,updated_at,content,is_startup')
          .eq('job_id', id).eq('is_startup', true).maybeSingle()
        if (d1) {
          sNote = d1
        } else {
          const { data: d2 } = await supabase.from('notes')
            .select('id,title,is_public,created_by,updated_at,content,is_startup')
            .eq('job_id', id).ilike('title', 'Startup%').order('created_at',{ascending:false}).limit(1).maybeSingle()
          if (d2) { sNote = d2; await supabase.from('notes').update({ is_startup: true }).eq('id', d2.id) }
        }
        setStartupNote(sNote)
        setShowStartup(true)
        setStartupOpenKey(k => k+1)
      },
    }}))
  }, [dirty, saving, id]) // eslint-disable-line

  useEffect(() => {
    broadcastActions()
  }, [broadcastActions])

  // Also re-broadcast after a short delay on mount to beat listener setup timing
  useEffect(() => {
    const t = setTimeout(broadcastActions, 50)
    return () => clearTimeout(t)
  }, [id]) // eslint-disable-line

  // Clean up on unmount
  useEffect(() => {
    return () => window.dispatchEvent(new CustomEvent('job-actions', { detail: null }))
  }, [])

  // Invalidate the materials cache immediately when a kit (or any material) is created/edited elsewhere
  useEffect(() => {
    function handler() {
      _materialsCache = null
      _materialsCacheTime = 0
      allMatsFetched.current = false
    }
    window.addEventListener('materials-library-updated', handler)
    return () => window.removeEventListener('materials-library-updated', handler)
  }, [])

  // Lazy-load the full materials library only when picker is opened.
  // Uses a module-level cache so re-opening the same or different job
  // doesn't hit the database again in the same session.
  async function openMatPicker() {
    setMatPickerOpen(v => !v)
    const cacheAge = Date.now() - _materialsCacheTime
    const cacheIsStale = cacheAge > 60000 // refresh if older than 60s
    if (!allMatsFetched.current || cacheIsStale) {
      allMatsFetched.current = true
      if (_materialsCache && !cacheIsStale) {
        setAllMats(_materialsCache)
      } else {
        const { data } = await supabase.from('materials').select('*').order('name')
        _materialsCache = data || []
        _materialsCacheTime = Date.now()
        setAllMats(_materialsCache)
      }
    }
  }

  async function saveJob() {
    setSaving(true)
    const num = String(job.job_number || '').trim()
    // Strip any existing number prefix from name before recomposing
    const rawName = String(job.name || '').replace(/^\d+\s*[-–—]\s*/,'').trim()
    const fullName = num ? `${num} - ${rawName}` : rawName

    console.log('Saving job:', { id, job_number: num, name: rawName, fullName })

    const { error } = await supabase.from('jobs').update({
      name:             fullName,
      job_number:       num || null,
      client:           job.client        || null,
      type:             job.type          || 'Kitchen',
      status:           job.status        || 'In progress',
      notes:            job.notes         || null,
      start_date:       job.start_date    || null,
      due_date:         job.due_date      || null,
      budget_hours:     job.budget_hours  ? parseFloat(job.budget_hours) : null,
      delivery_address: job.delivery_address || null,
      kitchen_specs:    specsRef.current && Object.keys(specsRef.current).length > 0
                          ? JSON.stringify(specsRef.current)
                          : (job.kitchen_specs || null),
    }).eq('id', id)

    if (error) {
      console.error('Job save error:', error)
      toast(error.message, 'error')
      setSaving(false)
      return
    }

    // Update local state so header reflects the composed name
    setJob(j => ({ ...j, name: fullName, job_number: num || j.job_number }))
    setSaving(false)
    toast('Saved ✓')
    setDirty(false)

    // Push kitchen_specs back to any linked notes with spec_field blocks
    if (job.kitchen_specs) {
      const specs = typeof job.kitchen_specs === 'string'
        ? JSON.parse(job.kitchen_specs) : (job.kitchen_specs || {})
      const { data: linkedNotes } = await supabase
        .from('notes').select('id,content').eq('job_id', id)
      if (linkedNotes?.length) {
        for (const note of linkedNotes) {
          const blocks = note.content?.blocks || []
          let changed = false
          const updated = blocks.map(b => {
            if (b.type !== 'spec_field' || !b.spec_key) return b
            const val = specs[b.spec_key]
            if (val === undefined || val === null) return b
            if (String(b.spec_value) === String(val)) return b
            changed = true
            return { ...b, spec_value: String(val), synced_to_job: true }
          })
          if (changed) {
            await supabase.from('notes')
              .update({ content: { blocks: updated }, updated_at: new Date().toISOString() })
              .eq('id', note.id)
          }
        }
      }
    }
  }

  // tasks
  // Private note tasks only visible to their creator; all other tasks visible to everyone
  const visibleTasks = tasks.filter(t => {
    if (!t.private || !t.from_note) return true
    return t.created_by === profile?.id || profile?.role === 'Admin'
  })
  const openTasks  = visibleTasks.filter(t => !t.done)
  const overTasks  = openTasks.filter(t => t.date && dFromNow(t.date, t.time) < 0)
  const sortedTasks = [...visibleTasks].sort((a,b) => {
    if (a.done !== b.done) return a.done ? 1 : -1
    if (!a.date && !b.date) return 0
    if (!a.date) return 1; if (!b.date) return -1
    return new Date(a.date) - new Date(b.date)
  })

  async function saveTasks(updated) {
    setTasks(updated)
    await supabase.from('jobs').update({ tasks: JSON.stringify(updated) }).eq('id', id)
  }

  // Sync room tasks into job task list — keeps them visible in one place
  async function syncJobTasksFromRoom(roomId, roomName, roomTasks) {
    // Remove old tasks from this room, then add current ones back
    const without = tasks.filter(t => t.from_room !== roomId)
    const roomItems = roomTasks.map(t => ({
      ...t,
      id: `room_${roomId}_${t.id}`, // stable unique id
      from_room: roomId,
      room_name: roomName,
    }))
    const merged = [...without, ...roomItems]
    setTasks(merged)
    await supabase.from('jobs').update({ tasks: JSON.stringify(merged) }).eq('id', id)
  }

  async function addTask() {
    if (!newTask.title.trim()) return
    const updated = [...tasks, { id: Date.now().toString(), ...newTask, done: false }]
    await saveTasks(updated)
    setNewTask({ title:'', date:'', time:'09:00' })
    setTaskForm(false)
  }

  async function updateTaskField(tid, field, value) {
    const updated = tasks.map(t => t.id === tid ? { ...t, [field]: value } : t)
    await saveTasks(updated)
  }

  async function toggleTask(tid) {
    const now = new Date().toISOString()
    await saveTasks(tasks.map(t => {
      if (t.id !== tid) return t
      const completing = !t.done
      return {
        ...t,
        done: completing,
        completed_by:   completing ? (profile?.full_name || profile?.email || 'Unknown') : null,
        completed_by_id: completing ? profile?.id : null,
        completed_at:   completing ? now : null,
      }
    }))
  }

  async function deleteTask(tid) {
    await saveTasks(tasks.filter(t => t.id !== tid))
  }

  // attachments
  const imgAtts  = atts.filter(a => a.type?.startsWith('image/'))
  const fileAtts = atts.filter(a => !a.type?.startsWith('image/'))

  const pendingFiles = React.useRef([])
  const [pendingRename, setPendingRename] = React.useState(null) // { files, typeId, names[] }

  function handleFiles(filesOrEvent) {
    const files = Array.from(filesOrEvent?.target?.files || filesOrEvent || [])
    if (!files.length) return
    // Always show rename/confirm modal — type picker is inside it
    setPendingRename({ files, typeId: '', names: files.map(f => f.name) })
  }

  async function uploadFiles(files, typeId) {
    setUploading(true)
    setShowTypeModal(false)
    for (const file of files) {
      const path = `${id}/${Date.now()}_${file.name}`
      await supabase.storage.from(BUCKET).upload(path, file, { contentType: file.type })
      const { data } = await supabase.from('attachments')
        .insert({ job_id: id, name: file.name, type: file.type, size: file.size, storage_path: path, file_type_id: typeId||null })
        .select().single()
      if (data) setAtts(prev => [...prev, data])
    }
    setUploading(false)
    pendingFiles.current = []
    toast('Uploaded ✓')
  }

  async function requestApproval(att) {
    // Find the PM assigned to this job, or any Admin
    const { data: pms } = await supabase.from('profiles')
      .select('id,full_name,email').in('role',['Admin','Project Manager']).limit(5)
    const pm = pms?.[0]
    if (!pm) { toast('No Project Manager found','error'); return }
    const { data, error } = await supabase.from('approval_requests').insert({
      job_id: id, attachment_id: att.id, attachment_name: att.name,
      requested_by: profile?.id, reviewed_by: pm.id,
      status: 'pending', created_at: new Date().toISOString()
    }).select('*,profiles!approval_requests_requested_by_fkey(full_name,email),reviewer:profiles!approval_requests_reviewed_by_fkey(full_name,email)').single()
    if (error) { toast(error.message,'error'); return }
    setApprovals(prev => [...prev, data])
    toast(`Approval requested from ${pm.full_name || pm.email}`)
  }

  async function reviewApproval(approvalId, status, notes='') {
    const { data } = await supabase.from('approval_requests')
      .update({ status, review_notes: notes, reviewed_at: new Date().toISOString(), reviewed_by: profile?.id })
      .eq('id', approvalId)
      .select('*,profiles!approval_requests_requested_by_fkey(full_name,email),reviewer:profiles!approval_requests_reviewed_by_fkey(full_name,email)').single()
    if (data) setApprovals(prev => prev.map(a => a.id===approvalId ? data : a))
    toast(status === 'approved' ? 'Approved ✓' : 'Declined')
  }

  async function deleteAtt(att) {
    if (!confirm('Delete this file?')) return
    if (att.storage_path) await supabase.storage.from(BUCKET).remove([att.storage_path])
    await supabase.from('attachments').delete().eq('id', att.id)
    setAtts(prev => prev.filter(x => x.id !== att.id))
    if (lbIdx !== null) setLbIdx(null)
  }

  // materials
  const usedMatIds = jobMats.map(jm => jm.material_id)
  const availMats  = allMats.filter(m => !usedMatIds.includes(m.id))

  async function addMat(mid, silent=false) {
    const { data } = await supabase.from('job_materials').insert({ job_id: id, material_id: mid }).select('*,materials(*)').single()
    if (data) {
      const named = await enrichMaterialNames([data.materials])
      const enrichedData = { ...data, materials: named[0] }
      setJobMats(prev => [...prev, enrichedData])
      const colors = [...jobMats, data].filter(jm=>jm.materials).map(jm=>({
        name: jm.materials.name, color: jm.materials.color||'#888',
        storage_path: jm.materials.storage_path||null,
        supplier: jm.materials.supplier||'', panel_type: jm.materials.panel_type||'',
        thickness: jm.materials.thickness||'', colour_code: jm.materials.colour_code||'',
        finish: jm.materials.finish||'', category_id: jm.materials.category_id||null,
      }))
      await supabase.from('jobs').update({ mat_colors: JSON.stringify(colors) }).eq('id', id)
    }
    if (!silent) {
      setMatPickerOpen(false)
      toast('Material added ✓')
    }
  }

  async function removeMat(jmid) {
    await supabase.from('job_materials').delete().eq('id', jmid)
    const remaining = jobMats.filter(x => x.id !== jmid)
    setJobMats(remaining)
    const colors = remaining.filter(jm=>jm.materials).map(jm=>({
      name: jm.materials.name, color: jm.materials.color||'#888',
      storage_path: jm.materials.storage_path||null,
      supplier: jm.materials.supplier||'', panel_type: jm.materials.panel_type||'',
      thickness: jm.materials.thickness||'', colour_code: jm.materials.colour_code||'',
      finish: jm.materials.finish||'', category_id: jm.materials.category_id||null,
    }))
    await supabase.from('jobs').update({ mat_colors: JSON.stringify(colors) }).eq('id', id)
  }

  async function archiveJob() {
    if (!confirm('Archive this job?')) return
    await supabase.from('jobs').update({ status:'Complete' }).eq('id', id)
    navigate('/')
    toast('Job archived')
  }


  async function deleteJob() {
    // Delete attachments from storage first
    if (atts.length) {
      const paths = atts.map(a => a.storage_path).filter(Boolean)
      if (paths.length) await supabase.storage.from(BUCKET).remove(paths)
    }
    // Delete DB records (job_materials + attachments cascade via FK, but be explicit)
    await supabase.from('attachments').delete().eq('job_id', id)
    await supabase.from('job_materials').delete().eq('job_id', id)
    await supabase.from('job_assignments').delete().eq('job_id', id)
    await supabase.from('jobs').delete().eq('id', id)
    toast('Job deleted')
    navigate('/')
  }

  if (loading) return <div className="flex justify-center py-16"><div className="spinner" /></div>
  if (!job) return <div className="text-center py-16 text-[#9CA3AF]">Job not found</div>

  const statusStyle = {
    'In progress': 'bg-blue-50 text-blue-700 border-blue-200',
  'Submitted for approval': 'bg-purple-50 text-purple-700 border-purple-200',
    'Review':      'bg-amber-50 text-amber-700 border-amber-200',
    'Complete':    'bg-teal-50 text-teal-700 border-teal-200',
    'On hold':     'bg-[#F3F4F6] text-[#6B7280] border-[#E8ECF0]',
  }


  return (
    <>
    {showStartup && (
      <StartupPanel
        key={startupOpenKey} job={job} jobMats={jobMats} jobApps={jobAppliances}
        startupNote={startupNote} allNotes={allNotes} allJobs={allJobs}
        onClose={() => {
          setShowStartup(false)
          supabase.from('notes').select('id,title,is_public,created_by,updated_at,content,is_startup')
            .eq('job_id', id).order('updated_at',{ascending:false})
            .then(({data}) => {
              if (!data) return
              setJobNotes(data.filter(n=>!n.is_startup))
              setStartupNote(data.find(n=>n.is_startup)||null)
            })
        }}
        onSaved={() => {}}
      />
    )}
    <div style={{ maxWidth:860, margin:'0 auto' }}>
      <BackButton to="/" label="Jobs" />
      <ActiveProcessBanner jobId={id} onClockChange={()=>{
        supabase.from('job_processes').select('*').eq('job_id',id).order('sort_order').then(({data})=>setProcesses(data||[]))
        supabase.from('time_entries').select('*').eq('job_id',id).is('clocked_out_at',null)
          .then(({data})=>{ const map={}; (data||[]).forEach(e=>{if(e.process_id)map[e.process_id]=e}); setActiveEntries(map) })
      }} />

      {/* Sticky header — job title/status + tab bar stay visible while scrolling.
          Negative top margin + matching padding cancels out <main>'s 16px top padding,
          so the sticky background covers that gap instead of letting content show through. */}
      <div style={{ position:'sticky', top:-16, zIndex:40, background:'var(--bg-page, #F0F2F5)', marginTop:-16, marginLeft:-16, marginRight:-16, paddingTop:16, paddingLeft:16, paddingRight:16 }}>
        <div className="flex items-start justify-between mb-3 gap-3 flex-wrap">
          <div>
            <h1 className="text-xl font-bold text-[#2A3042]">{job.name?.replace(/^.+?[\u2014\u2013-]{1,2}\s*/, '') || job.name}</h1>
            <div className="text-sm text-[#6B7280] mt-0.5">{[job.job_number, job.type, job.customers?.company || (job.customers ? `${job.customers.first_name||''} ${job.customers.last_name||''}`.trim() : null) || job.client].filter(Boolean).join(' \u00b7 ')}</div>
          </div>
          <select value={job.status} onChange={e => { setJob(j => ({ ...j, status: e.target.value })); setDirty(true) }}
            className={`text-xs font-semibold px-3 py-1.5 rounded-full border cursor-pointer ${statusStyle[job.status]}`}>
            {jobStatuses.map(s => <option key={s.label}>{s.label}</option>)}
          </select>
        </div>
        {overTasks.length > 0 && (
          <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-xl px-4 py-3 mb-3 text-sm text-red-700">
            ⚠ {overTasks.length} overdue task{overTasks.length > 1 ? 's' : ''} on this job
          </div>
        )}

        {/* TABS */}
        <JobScrollableTabs jobTab={jobTab} setJobTab={setJobTab}
          rooms={rooms} processes={processes} specs={specs} atts={atts}
          feedback={feedback} unorderedCount={unorderedCount} openTasks={openTasks}
          allMaterials={allMaterials} setAllMaterials={setAllMaterials}
          allAppliances={allAppliances} setAllAppliances={setAllAppliances} />
      </div>

      {/* OVERVIEW */}
      {jobTab === 'overview' && (
        <JobOverviewTab jobId={id} rooms={rooms} unorderedCount={unorderedCount}
          onOpenRoomsTab={() => setJobTab('rooms')}
          onOpenRoom={(room) => { setAutoOpenRoomId(`${room.id}_${Date.now()}`); setJobTab('rooms') }}
          onRoomsChange={setRooms} toast={toast} rfis={jobLevelRfis} />
      )}

      {/* DETAILS */}
      {jobTab === 'details' && <div>
        <div style={{ background:"#fff", borderRadius:12, border:"1px solid #E8ECF0", padding:18, marginBottom:14 }}>
          {/* Title preview */}
          {(job.job_number || job.name) && (
            <div style={{ padding:'8px 12px', background:'#F0F7FF', borderRadius:8, border:'1px solid #C4D4F8', marginBottom:14, fontSize:13 }}>
              <span style={{ color:'#9CA3AF', fontWeight:600 }}>Job title: </span>
              <span style={{ color:'#2A3042', fontWeight:700 }}>
                {job.job_number ? `${job.job_number} - ${job.name?.replace(/^\d+\s*-\s*/,'') || ''}` : job.name}
              </span>
            </div>
          )}
          <div className="grid grid-cols-2 gap-3">
            {[['Job number','job_number','text'],['Job name','name','text'],['Client','client','text'],['Budget hours','budget_hours','number'],['Start date','start_date','date'],['Due date','due_date','date']].map(([l,k,t]) => (
              <div key={k}><label className="label">{l}</label>
                <input className="input text-sm" type={t==='number'?'number':'text'}
                  value={k==='name' ? (job.name?.replace(/^\d+\s*-\s*/,'') || '') : (job[k]||'')}
                  onChange={e => { setJob(j => ({ ...j, [k]: e.target.value })); setDirty(true) }}
                  placeholder={k==='job_number'?'e.g. 1234':k==='name'?'e.g. John Smith':''} />
              </div>
            ))}
            <div><label className="label">Job type</label>
              <select className="input text-sm" value={job.type||'Kitchen'} onChange={e => { setJob(j => ({ ...j, type: e.target.value })); setDirty(true) }}>
                {TYPES.map(t => <option key={t}>{t}</option>)}
              </select>
            </div>
            <div><label className="label">Delivery address</label>
              <input className="input text-sm" value={job.delivery_address||''} onChange={e => { setJob(j => ({ ...j, delivery_address: e.target.value })); setDirty(true) }} />
            </div>
          </div>
        </div>
        <div style={{ background:"#fff", borderRadius:12, border:"1px solid #E8ECF0", padding:18, marginBottom:14 }}>
          <div style={{ fontSize:11, fontWeight:700, color:"#9CA3AF", textTransform:"uppercase", letterSpacing:".05em", marginBottom:8 }}>Notes</div>
          <textarea className="input text-sm min-h-[80px] resize-y w-full" placeholder="Notes, observations, specs…"
            value={job.notes||''} onChange={e => { setJob(j => ({ ...j, notes: e.target.value })); setDirty(true) }} />
        </div>
        {dirty && <div style={{ position:'sticky', bottom:16, display:'flex', justifyContent:'flex-end' }}>
          <button onClick={saveJob} className="btn-blue" style={{ boxShadow:'0 4px 12px rgba(91,138,240,0.4)' }}>Save changes</button>
        </div>}

        {/* Delete job */}
        <div style={{ marginTop:8, padding:'14px 16px', background:'#fff', borderRadius:12, border:'1px solid #E8ECF0' }}>
          {showDeleteConfirm ? (
            <div>
              <div style={{ fontSize:13, fontWeight:600, color:'#991B1B', marginBottom:10 }}>Delete "{job.name?.replace(/^.+?[—–-]{1,2}\s*/,'') || job.name}"?</div>
              <div style={{ fontSize:12, color:'#6B7280', marginBottom:12 }}>This will permanently delete the job and all associated data. This cannot be undone.</div>
              <div style={{ display:'flex', gap:8 }}>
                <button onClick={deleteJob} style={{ flex:1, padding:'8px', borderRadius:8, border:'none', background:'#E24B4A', color:'#fff', fontSize:13, fontWeight:700, cursor:'pointer' }}>Yes, delete job</button>
                <button onClick={() => setShowDeleteConfirm(false)} style={{ flex:1, padding:'8px', borderRadius:8, border:'1px solid #E8ECF0', background:'#F9FAFB', color:'#6B7280', fontSize:13, fontWeight:600, cursor:'pointer' }}>Cancel</button>
              </div>
            </div>
          ) : (
            <button onClick={() => setShowDeleteConfirm(true)}
              style={{ fontSize:13, fontWeight:600, color:'#9CA3AF', background:'none', border:'none', cursor:'pointer', padding:0, display:'flex', alignItems:'center', gap:6 }}
              onMouseEnter={e=>e.currentTarget.style.color='#E24B4A'} onMouseLeave={e=>e.currentTarget.style.color='#9CA3AF'}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4h6v2"/></svg>
              Delete job
            </button>
          )}
        </div>
      </div>}

      {/* CONTACTS */}
      {jobTab === 'contacts' && (
        <div style={{ background:'#F9FAFB', borderRadius:12, padding:16, minHeight:200 }}>
          <JobContactsTab jobId={id} profile={profile} profiles={allJobProfiles} />
        </div>
      )}

      {/* RFI */}
      {jobTab === 'rfi' && (
        <div style={{ background:'#F9FAFB', borderRadius:12, padding:16, minHeight:200 }}>
          <JobRFITab jobId={id} profile={profile} profiles={allJobProfiles} rooms={rooms} />
        </div>
      )}

      {/* TASKS */}

      {jobTab === 'tasks' && <div style={{ background:"#fff", borderRadius:12, border:"1px solid #E8ECF0", padding:18 }}>
        <div className="flex items-center justify-between mb-3">
          <span className="section-title">Tasks</span>
          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${overTasks.length>0?'bg-red-50 text-red-700':openTasks.length>0?'bg-blue-50 text-blue-700':tasks.length>0?'bg-teal-50 text-teal-700':'bg-[#F3F4F6] text-[#9CA3AF]'}`}>
            {overTasks.length>0?`${openTasks.length} remaining · ${overTasks.length} overdue`:openTasks.length>0?`${openTasks.length} of ${tasks.length} remaining`:tasks.length>0?'All complete':'No tasks'}
          </span>
        </div>
        <div className="divide-y divide-[#F3F4F6] mb-3">
          {sortedTasks.length === 0 && <div className="text-sm text-[#9CA3AF] py-2">No tasks yet</div>}
          {sortedTasks.map(t => {
            const isOver = !t.done && t.date && dFromNow(t.date, t.time) < 0
            const tPriority = t.priority || 'Medium'
            const tPs = {
              High:   { bg:'#E24B4A', color:'#fff', border:'#E24B4A', dot:'#E24B4A' },
              Medium: { bg:'#F97316', color:'#fff', border:'#F97316', dot:'#F97316' },
              Low:    { bg:'#1D9E75', color:'#fff', border:'#1D9E75', dot:'#1D9E75' },
            }[tPriority] || { bg:'#9CA3AF', color:'#fff', border:'#9CA3AF', dot:'#9CA3AF' }
            return (
              <div key={t.id} style={{ display:'flex', alignItems:'flex-start', gap:10, padding:'10px 12px', borderRadius:9, border:'1px solid #E8ECF0', background:'#fff', marginBottom:6 }}>
                <div onClick={() => toggleTask(t.id)}
                  style={{ width:18, height:18, borderRadius:5, border:`2px solid ${t.done?'#1D9E75':isOver?'#E24B4A':'#DDE3EC'}`, background:t.done?'#1D9E75':'#fff', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0, marginTop:1, cursor:'pointer', transition:'all .12s' }}>
                  {t.done && <span style={{ color:'#fff', fontSize:11, fontWeight:700 }}>✓</span>}
                </div>
                <div style={{ flex:1, minWidth:0 }}>
                  {/* Row 1: priority badge + room/note tags */}
                  <div style={{ display:'flex', alignItems:'center', gap:5, marginBottom:4, flexWrap:'wrap' }}>
                    {/* Priority badge — click to cycle, only for own tasks */}
                    {!t.from_room ? (
                      <button onClick={e=>{ e.stopPropagation(); const order=['High','Medium','Low']; updateTaskField(t.id,'priority',order[(order.indexOf(tPriority)+1)%3]) }}
                        title="Click to change priority"
                        style={{ fontSize:10, fontWeight:700, padding:'2px 8px', borderRadius:6, border:'none', background:tPs.bg, color:tPs.color, cursor:'pointer', outline:'none', flexShrink:0 }}>
                        {tPriority}
                      </button>
                    ) : (
                      <span style={{ fontSize:10, fontWeight:700, padding:'2px 8px', borderRadius:6, border:'none', background:tPs.bg, color:tPs.color, flexShrink:0 }}>{tPriority}</span>
                    )}
                    {t.from_room && <span style={{ fontSize:10, padding:'2px 7px', borderRadius:6, background:'#F0FDF4', color:'#065F46', fontWeight:600, flexShrink:0, border:'1px solid #86EFAC' }}>🏠 {t.room_name}</span>}
                    {t.from_note && <span onClick={()=>navigate(`/notes/${t.from_note}`)} style={{ fontSize:10, padding:'2px 7px', borderRadius:6, background:'#F0F4FF', color:'#3730A3', fontWeight:600, cursor:'pointer', border:'1px solid #C4D4F8', flexShrink:0 }}>📄 Note</span>}
                    {t.private && <span style={{ fontSize:10, padding:'2px 6px', borderRadius:6, background:'#F3F4F6', color:'#6B7280', fontWeight:600, flexShrink:0 }}>🔒</span>}
                  </div>
                  {/* Row 2: title */}
                  {!t.from_room && editingTaskId === t.id ? (
                    <input autoFocus defaultValue={t.title}
                      onBlur={e => { updateTaskField(t.id,'title',e.target.value.trim()||t.title); setEditingTaskId(null) }}
                      onKeyDown={e => { if(e.key==='Enter'){ updateTaskField(t.id,'title',e.target.value.trim()||t.title); setEditingTaskId(null) } if(e.key==='Escape') setEditingTaskId(null) }}
                      style={{ fontSize:13, fontWeight:500, color:'#2A3042', border:'none', borderBottom:'1.5px solid #5B8AF0', outline:'none', background:'transparent', padding:'0 0 2px', fontFamily:'inherit', width:'100%', boxSizing:'border-box', marginBottom:4 }} />
                  ) : (
                    <div onClick={() => !t.done && !t.from_room && setEditingTaskId(t.id)}
                      style={{ fontSize:13, fontWeight:500, color:t.done?'#9CA3AF':'#2A3042', textDecoration:t.done?'line-through':'none', cursor:(!t.done&&!t.from_room)?'text':'default', marginBottom:4 }}>
                      {t.title}
                    </div>
                  )}
                  {/* Row 3: due date / edit controls */}
                  {!t.from_room && editingTaskId === t.id ? (
                    <div style={{ display:'flex', gap:6, flexWrap:'wrap', alignItems:'center' }}>
                      <div style={{ position:'relative', display:'flex', alignItems:'center' }}>
                        <svg style={{ position:'absolute', left:5, pointerEvents:'none', color:'#9CA3AF' }} width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
                        <input type="date" value={t.date||''} onChange={e=>updateTaskField(t.id,'date',e.target.value)}
                          style={{ fontSize:11, padding:'3px 5px 3px 20px', border:'1px solid #C4D4F8', borderRadius:6, outline:'none', background:'#fff', WebkitAppearance:'none', appearance:'none' }} />
                      </div>
                      <div style={{ position:'relative', display:'flex', alignItems:'center' }}>
                        <svg style={{ position:'absolute', left:5, pointerEvents:'none', color:'#9CA3AF' }} width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
                        <input type="time" value={t.time||''} onChange={e=>updateTaskField(t.id,'time',e.target.value)}
                          style={{ fontSize:11, padding:'3px 5px 3px 20px', border:'1px solid #C4D4F8', borderRadius:6, outline:'none', background:'#fff', width:95, WebkitAppearance:'none', appearance:'none' }} />
                      </div>
                      <button onClick={()=>setEditingTaskId(null)} style={{ fontSize:11, color:'#1D9E75', fontWeight:700, background:'none', border:'none', cursor:'pointer' }}>Done</button>
                    </div>
                  ) : (
                    <div style={{ display:'flex', gap:6, alignItems:'center' }}>
                      <DueBadge t={t} />
                      {!t.done && !t.from_room && (
                        <button onClick={()=>setEditingTaskId(t.id)}
                          style={{ fontSize:11, color:'#C4C9D4', background:'none', border:'none', cursor:'pointer', padding:0, lineHeight:1 }}
                          onMouseEnter={e=>e.currentTarget.style.color='#5B8AF0'} onMouseLeave={e=>e.currentTarget.style.color='#C4C9D4'}>✏️</button>
                      )}
                      {t.done && t.completed_by && <span style={{ fontSize:10, color:'#9CA3AF' }}>✓ {t.completed_by}</span>}
                    </div>
                  )}
                </div>
                {!t.from_room && <button onClick={() => deleteTask(t.id)} style={{ color:'#D1D5DB', background:'none', border:'none', cursor:'pointer', fontSize:18, lineHeight:1, flexShrink:0 }}
                  onMouseEnter={e=>e.currentTarget.style.color='#E24B4A'} onMouseLeave={e=>e.currentTarget.style.color='#D1D5DB'}>×</button>}
              </div>
            )
          })}
        </div>
        {taskForm ? (
          <div style={{ background:'#F9FAFB', borderRadius:10, border:'1px solid #E8ECF0', padding:12, marginTop:8 }}>
            <input autoFocus value={newTask.title} onChange={e=>setNewTask(p=>({...p,title:e.target.value}))}
              onKeyDown={e=>e.key==='Enter'&&addTask()} placeholder="Task title…" className="input text-sm w-full mb-2" />
            <div style={{ display:'flex', gap:8, flexWrap:'wrap', alignItems:'center', marginBottom:8 }}>
              {/* Priority */}
              <select value={newTask.priority||'Medium'} onChange={e=>setNewTask(p=>({...p,priority:e.target.value}))}
                style={{ fontSize:11, fontWeight:700, padding:'4px 8px', borderRadius:7, border:'1px solid #DDE3EC', background:'#fff', color:'#374151', cursor:'pointer', outline:'none' }}>
                {['High','Medium','Low'].map(p=><option key={p} value={p}>{p}</option>)}
              </select>
              <div style={{ position:'relative', display:'flex', alignItems:'center' }}>
                <svg style={{ position:'absolute', left:7, pointerEvents:'none', color:'#9CA3AF' }} width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
                <input type="date" value={newTask.date||''} onChange={e=>setNewTask(p=>({...p,date:e.target.value}))} className="input text-sm" style={{ paddingLeft:24, WebkitAppearance:'none', appearance:'none', background:'#fff' }} />
              </div>
              <div style={{ position:'relative', display:'flex', alignItems:'center' }}>
                <svg style={{ position:'absolute', left:7, pointerEvents:'none', color:'#9CA3AF' }} width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
                <input type="time" value={newTask.time||''} onChange={e=>setNewTask(p=>({...p,time:e.target.value}))} className="input text-sm" style={{ width:110, paddingLeft:24, WebkitAppearance:'none', appearance:'none', background:'#fff' }} />
              </div>
              <label style={{ fontSize:12, display:'flex', alignItems:'center', gap:5, color:'#6B7280' }}>
                <input type="checkbox" checked={!!newTask.private} onChange={e=>setNewTask(p=>({...p,private:e.target.checked}))} /> Private
              </label>
            </div>
            <div style={{ display:'flex', gap:8 }}>
              <button onClick={addTask} className="btn-blue btn-sm">Add task</button>
              <button onClick={() => setTaskForm(false)} className="btn btn-sm">Cancel</button>
            </div>
          </div>
        ) : (
          <button onClick={() => setTaskForm(true)} className="btn-blue btn-sm">+ Add task</button>
        )}
      </div>}

      {/* ROOMS */}
      {jobTab === 'rooms' && <InlineRoomsPanel
        rooms={rooms} jobId={id} toast={toast}
        jobMats={jobMats} allAppliances={allAppliances}
        onRoomsChange={setRooms} onSyncJobTasks={syncJobTasksFromRoom}
        autoOpenRoomId={autoOpenRoomId} rfis={jobLevelRfis}
        roomStatuses={roomStatuses} />}

      {/* MATERIALS */}
      {jobTab === 'materials' && <div>
        <div style={{ background:"#fff", borderRadius:12, border:"1px solid #E8ECF0", padding:18, marginBottom:14 }}>
          <div style={{ fontSize:11, fontWeight:700, color:"#9CA3AF", textTransform:"uppercase", letterSpacing:".05em", marginBottom:12 }}>Materials</div>
          <div className="flex flex-wrap gap-2 mb-3">
            {jobMats.map(jm => {
              const m = jm.materials; if (!m) return null
              return (
                <div key={jm.id} style={{ display:'flex', alignItems:'center', gap:8, padding:'8px 12px', background:'#F9FAFB', border:'1px solid #E8ECF0', borderRadius:10 }}>
                  {m.storage_path ? <img src={pubUrl(m.storage_path)} style={{ width:28, height:28, borderRadius:6, objectFit:'cover', flexShrink:0 }} alt="" loading="lazy" /> : <div style={{ width:28, height:28, borderRadius:6, background:m.color||'#D1D5DB', flexShrink:0 }} />}
                  <div style={{ minWidth:0 }}>
                    <div style={{ fontSize:12, fontWeight:700, color:'#2A3042', display:'flex', alignItems:'center', gap:5 }}>
                      {m.is_kit && <span title="Kit" style={{ fontSize:11 }}>🧰</span>}
                      {m.name}
                    </div>
                    <div style={{ fontSize:11, color:'#9CA3AF' }}>{m.is_kit ? 'Kit' : [m.supplier, m.panel_type, m.thickness?m.thickness+'mm':null].filter(Boolean).join(' · ')}</div>
                  </div>
                  <button onClick={() => removeMat(jm.id)} style={{ background:'none', border:'none', cursor:'pointer', color:'#D1D5DB', fontSize:16, lineHeight:1, marginLeft:4 }}
                    onMouseEnter={e=>e.currentTarget.style.color='#E24B4A'} onMouseLeave={e=>e.currentTarget.style.color='#D1D5DB'}>×</button>
                </div>
              )
            })}
          </div>
          <button onClick={openMatPicker} className="btn-blue btn-sm">+ Add from library</button>
          {matPickerOpen && <div style={{ marginTop:10 }}>
            <div style={{ fontSize:10, color:'#9CA3AF', marginBottom:4 }}>
              {allMats.length} materials loaded · {allMats.filter(m=>m.is_kit).length} kits
            </div>
            <input autoFocus value={matSearch} onChange={e=>setMatSearch(e.target.value)} placeholder="Search materials…"
              style={{ width:'100%', padding:'8px 12px', border:'1px solid #DDE3EC', borderRadius:9, fontSize:13, outline:'none', boxSizing:'border-box', marginBottom:6 }} />
            {matSearch.trim() === '' ? <div style={{ fontSize:12, color:'#9CA3AF', textAlign:'center', padding:'12px 0' }}>Start typing…</div> : (() => {
              const q = matSearch.trim().toLowerCase()
              const words = q.split(/\s+/)
              const results = availMats.filter(m => {
                const haystack = [m.name, m.supplier, m.colour_code, m.panel_type]
                  .filter(v => v != null && v !== '')
                  .map(v => String(v).toLowerCase())
                  .join(' ')
                return words.every(w => haystack.includes(w))
              })
              return results.length === 0 ? <div style={{ fontSize:12, color:'#9CA3AF', textAlign:'center', padding:'12px 0' }}>No matches</div>
                : <div style={{ maxHeight:220, overflowY:'auto', border:'1px solid #E8ECF0', borderRadius:10, overflow:'hidden' }}>
                    {results.map(m => (
                      <div key={m.id} onClick={() => { addMat(m.id); setMatSearch(''); setMatPickerOpen(false) }}
                        style={{ display:'flex', alignItems:'center', gap:10, padding:'9px 12px', cursor:'pointer', borderBottom:'1px solid #F9FAFB', background:'#fff' }}
                        onMouseEnter={e=>e.currentTarget.style.background='#F9FAFB'} onMouseLeave={e=>e.currentTarget.style.background='#fff'}>
                        {m.storage_path ? <img src={pubUrl(m.storage_path)} style={{ width:36,height:36,borderRadius:8,objectFit:'cover',flexShrink:0 }} alt="" /> : <div style={{ width:36,height:36,borderRadius:8,background:m.color||'#F3F4F6',flexShrink:0 }} />}
                        <div style={{ flex:1, minWidth:0 }}>
                          <div style={{ fontSize:13, fontWeight:600, color:'#2A3042', display:'flex', alignItems:'center', gap:5 }}>
                            {m.is_kit && <span title="Kit">🧰</span>}
                            {m.name}
                          </div>
                          <div style={{ fontSize:11, color:'#9CA3AF' }}>{m.is_kit ? 'Kit' : [m.supplier,m.panel_type].filter(Boolean).join(' · ')}</div>
                        </div>
                      </div>
                    ))}
                  </div>
            })()}
          </div>}
        </div>

      </div>}

      {/* APPLIANCES */}
      {jobTab === 'appliances' && <JobAppliancesSection jobId={id} jobAppliances={jobAppliances} allAppliances={allAppliances} setJobAppliances={setJobAppliances} setAllAppliances={setAllAppliances} />}

      {/* PROCESSES + TIME + NOTES + FILES */}
      {jobTab === 'processes' && <div>
        <ProcessesPanel jobId={id} processes={processes} onProcessesChange={setProcesses} profile={profile} toast={toast}
          canDeleteProcesses={can('deleteProcess')}
          activeEntries={activeEntries} onActiveEntriesChange={setActiveEntries}
          onHistoryRefresh={()=>supabase.from('time_entries').select('*,profiles(id,full_name,email),job_processes(id,name,color)')
            .eq('job_id',id).order('clocked_in_at',{ascending:false}).limit(30).then(({data})=>setTimeHistory(data||[]))} />
        <div style={{ marginTop:12 }}><HistorySectionWithToggle timeHistory={timeHistory} /></div>
        <div style={{ background:'#fff', borderRadius:12, border:'1px solid #E8ECF0', padding:18, marginTop:12 }}>
          <BudgetBar budgetHours={job.budget_hours} timeLogged={job.time_logged || timeHistory.filter(e=>e.clocked_out_at).reduce((s,e)=>{
            const i=String(e.clocked_in_at).endsWith('Z')?e.clocked_in_at:e.clocked_in_at+'Z'
            const o=String(e.clocked_out_at).endsWith('Z')?e.clocked_out_at:e.clocked_out_at+'Z'
            return s+(new Date(o)-new Date(i))/3600000
          },0)} />
        </div>
      </div>}

      {/* STARTUP TAB */}
      {jobTab === 'startup' && (
        <InlineStartupNote
          jobId={id} job={job}
          startupNote={startupNote}
          onNoteChange={note => {
            setStartupNote(note)
            // Reload notes so sidebar also updates
            supabase.from('notes').select('id,title,is_public,created_by,updated_at,content,is_startup')
              .eq('job_id', id).order('updated_at', { ascending: false })
              .then(({ data }) => {
                if (!data) return
                setJobNotes(data.filter(n => !n.is_startup))
                setStartupNote(data.find(n => n.is_startup) || null)
              })
          }}
        />
      )}

      {/* NOTES TAB */}
      {jobTab === 'notes' && (
        <div style={{ background:'#fff', borderRadius:12, border:'1px solid #E8ECF0', padding:20, minHeight:300 }}>
          <NotionNotes
            jobId={id}
            context="job-notes"
            minHeight={300}
          />
        </div>
      )}

      {/* ON-SITE TAB */}
      {jobTab === 'onsite' && (
        <OnSite jobId={id} />
      )}

      {/* ORDERS TAB */}
      {jobTab === 'orders' && <div>
        {unorderedCount > 0 && (
          <div style={{ display:'flex', alignItems:'center', gap:10, padding:'12px 16px', background:'#FEF9C3', borderRadius:10, border:'1px solid #FDE68A', marginBottom:12, cursor:'pointer' }}
            onClick={() => navigate(`/job/${id}/orders`)}>
            <span style={{ fontSize:18 }}>📦</span>
            <div style={{ flex:1 }}>
              <div style={{ fontSize:13, fontWeight:700, color:'#854D0E' }}>{unorderedCount} item{unorderedCount!==1?'s':''} to order</div>
              <div style={{ fontSize:11, color:'#92400E' }}>Tap to open full order sheet</div>
            </div>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#92400E" strokeWidth="2"><polyline points="9 18 15 12 9 6"/></svg>
          </div>
        )}
        <div onClick={() => navigate(`/job/${id}/orders`)}
          style={{ display:'flex', alignItems:'center', gap:12, padding:'16px', background:'#fff', borderRadius:12, border:'1px solid #E8ECF0', cursor:'pointer' }}
          onMouseEnter={e=>{e.currentTarget.style.background='#F9FAFB';e.currentTarget.style.borderColor='#C4D4F8'}}
          onMouseLeave={e=>{e.currentTarget.style.background='#fff';e.currentTarget.style.borderColor='#E8ECF0'}}>
          <div style={{ width:44, height:44, borderRadius:12, background:'#EEF2FF', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#5B8AF0" strokeWidth="2"><path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2"/><rect x="9" y="3" width="6" height="4" rx="1"/><line x1="9" y1="12" x2="15" y2="12"/><line x1="9" y1="16" x2="13" y2="16"/></svg>
          </div>
          <div style={{ flex:1 }}>
            <div style={{ fontSize:14, fontWeight:700, color:'#2A3042' }}>Open Order Sheet</div>
            <div style={{ fontSize:12, color:'#9CA3AF' }}>Manage all materials and items to order</div>
          </div>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#C4C9D4" strokeWidth="2"><polyline points="9 18 15 12 9 6"/></svg>
        </div>
      </div>}

      {/* FILES TAB */}
      {jobTab === 'files' && <div>
        <div style={{ background:'#fff', borderRadius:12, border:'1px solid #E8ECF0', padding:18 }}>
          <div style={{ fontSize:14, fontWeight:700, color:'#2A3042', marginBottom:12 }}>Drawings & Files</div>
          <DropZone
            onFiles={files=>handleFiles(files)}
            accept=".pdf,.dwg,.dxf,image/*,.heic,.heif"
            multiple icon="📁"
            label="Upload files"
            sublabel="Drag PDFs, drawings, images here or click to browse"
            style={{ marginBottom:16 }}
          />
          {atts.length === 0
            ? <div style={{ textAlign:'center', padding:'24px 0', color:'#9CA3AF', fontSize:13 }}>
                <div style={{ fontSize:28, marginBottom:8 }}>📂</div>
                No files uploaded yet
              </div>
            : <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
                {atts.map(a => {
                  const ft = fileTypes.find(f=>f.id===a.file_type_id)
                  const approval = approvals.find(ap=>ap.attachment_id===a.id)
                  const ext = (a.name||'').split('.').pop().toUpperCase()
                  const isImg = a.type?.startsWith('image/')
                  return (
                    <div key={a.id} style={{ background:'#F9FAFB', borderRadius:10, border:'1px solid #E8ECF0', padding:'10px 14px' }}>
                      <div style={{ display:'flex', alignItems:'center', gap:10 }}>
                        {isImg
                          ? <img src={pubUrl(a.storage_path)} style={{ width:40, height:40, borderRadius:7, objectFit:'cover', flexShrink:0 }} alt="" />
                          : <div style={{ width:40, height:40, borderRadius:7, background:'#EEF2FF', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0, fontSize:11, fontWeight:800, color:'#5B8AF0' }}>{ext}</div>
                        }
                        <div style={{ flex:1, minWidth:0 }}>
                          <InlineRename name={a.name} url={pubUrl(a.storage_path)} onSave={async(n)=>{
                            await supabase.from('attachments').update({name:n}).eq('id',a.id)
                            setAtts(p=>p.map(x=>x.id===a.id?{...x,name:n}:x))
                          }} />
                          <div style={{ display:'flex', alignItems:'center', gap:8, marginTop:4 }}>
                            {ft && <div style={{ fontSize:11, color:'#9CA3AF' }}>{ft.name}</div>}
                            {(a.name?.toLowerCase().endsWith('.pdf') || a.type === 'application/pdf') && (
                              <button onClick={() => navigate(`/job/${id}/markup/${a.id}`)}
                                style={{ fontSize:10, fontWeight:700, padding:'2px 8px', borderRadius:6, border:'1px solid #C4D4F8', background:'#EEF2FF', color:'#3730A3', cursor:'pointer', display:'flex', alignItems:'center', gap:4 }}>
                                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                                Mark up
                                {a.annotated_at && <span style={{ fontSize:9, color:'#1D9E75' }}>✓</span>}
                              </button>
                            )}
                          </div>
                        </div>
                        <button onClick={()=>{ if(confirm('Delete this file?')){ supabase.storage.from(BUCKET).remove([a.storage_path]); supabase.from('attachments').delete().eq('id',a.id); setAtts(p=>p.filter(x=>x.id!==a.id)) }}}
                          style={{ background:'none', border:'none', cursor:'pointer', color:'#D1D5DB', fontSize:18, lineHeight:1, flexShrink:0 }}
                          onMouseEnter={e=>e.currentTarget.style.color='#E24B4A'} onMouseLeave={e=>e.currentTarget.style.color='#D1D5DB'}>×</button>
                      </div>
                      {ft?.requires_approval && <div style={{ marginTop:8 }}><ApprovalBar att={a} ft={ft} approval={approval} onRequest={()=>requestApproval(a.id)} onReview={(status,notes)=>reviewApproval(a.id,status,notes)} profile={profile} /></div>}
                    </div>
                  )
                })}
              </div>
          }
        </div>
      </div>}

      {/* SPECS */}
      {jobTab === 'specs' && <div>
        {/* Spec selector — compact list at top */}
        <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:14, flexWrap:'wrap' }}>
          {specs.map(spec => {
            const ss = spec.status==='Submitted'?{bg:'#DCFCE7',color:'#166534',border:'#86EFAC'}:
                       spec.status==='Draft'?{bg:'#F3F4F6',color:'#6B7280',border:'#E8ECF0'}:
                       {bg:'#DBEAFE',color:'#1E40AF',border:'#BFDBFE'}
            return (
              <button key={spec.id} onClick={()=>setActiveSpecId(spec.id)}
                style={{ display:'flex', alignItems:'center', gap:7, padding:'6px 12px', borderRadius:9,
                  border:`1.5px solid ${activeSpecId===spec.id?'#5B8AF0':ss.border}`,
                  background:activeSpecId===spec.id?'#5B8AF0':ss.bg,
                  color:activeSpecId===spec.id?'#fff':ss.color,
                  cursor:'pointer', fontSize:12, fontWeight:600 }}>
                📋 {spec.title||'Untitled'}
                <span style={{ fontSize:10, opacity:0.8 }}>{spec.status}</span>
              </button>
            )
          })}
          <button onClick={async () => {
            const { data } = await supabase.from('specs').insert({
              title:'New spec', status:'Draft', rooms:'[]', job_id:id,
              updated_at: new Date().toISOString()
            }).select().single()
            if (data) { setSpecs(p=>[...p, data]); setActiveSpecId(data.id) }
          }} style={{ fontSize:12, fontWeight:700, padding:'6px 12px', borderRadius:9, border:'1px dashed #C4D4F8', background:'transparent', color:'#5B8AF0', cursor:'pointer', display:'flex', alignItems:'center', gap:4 }}>
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
            New spec
          </button>
        </div>

        {/* Inline spec builder — shown directly */}
        {specs.length === 0 && !activeSpecId ? (
          <div style={{ textAlign:'center', padding:'40px 16px', background:'#F9FAFB', borderRadius:12, border:'1px dashed #E8ECF0', color:'#9CA3AF' }}>
            <div style={{ fontSize:28, marginBottom:8 }}>📋</div>
            <div style={{ fontSize:14, fontWeight:600, color:'#374151', marginBottom:4 }}>No specs yet</div>
            <div style={{ fontSize:13, marginBottom:16 }}>Create a spec to compile materials and appliances for this job</div>
            <button onClick={async () => {
              const { data } = await supabase.from('specs').insert({
                title:'New spec', status:'Draft', rooms:'[]', job_id:id,
                updated_at: new Date().toISOString()
              }).select().single()
              if (data) { setSpecs(p=>[...p, data]); setActiveSpecId(data.id) }
            }} style={{ fontSize:13, fontWeight:700, padding:'8px 18px', borderRadius:9, border:'none', background:'#5B8AF0', color:'#fff', cursor:'pointer' }}>+ Create first spec</button>
          </div>
        ) : activeSpecId ? (
          <InlineSpecBuilder
            key={activeSpecId}
            specId={activeSpecId}
            jobId={id}
            onBack={() => {
              supabase.from('specs').select('id,title,status,updated_at').eq('job_id', id)
                .order('updated_at',{ascending:false}).then(({data})=>{ if(data) setSpecs(data) })
            }}
          />
        ) : specs.length > 0 ? (
          // Auto-select first spec
          (() => { if(!activeSpecId && specs[0]) setTimeout(()=>setActiveSpecId(specs[0].id),0); return null })()
        ) : null}
      </div>}

      {/* FEEDBACK */}
      {jobTab === 'feedback' && <div>
        {feedback.length === 0
          ? <div style={{ textAlign:'center', padding:'48px 16px', background:'#fff', borderRadius:16, border:'1px solid #E8ECF0', color:'#9CA3AF' }}>
              <div style={{ fontSize:32, marginBottom:12 }}>✅</div>
              <div style={{ fontSize:15, fontWeight:600, color:'#374151' }}>No feedback yet</div>
            </div>
          : feedback.map(fb => {
              const SEV = {Minor:{bg:'#DCFCE7',color:'#166534',dot:'#1D9E75'},Moderate:{bg:'#FEF9C3',color:'#854D0E',dot:'#EF9F27'},Major:{bg:'#FEF2F2',color:'#991B1B',dot:'#E24B4A'}}
              const sv = SEV[fb.severity]||SEV.Minor
              return (
                <div key={fb.id} style={{ background:'#fff', borderRadius:12, border:'1px solid #E8ECF0', marginBottom:10, overflow:'hidden' }}>
                  <div style={{ height:3, background:sv.dot }} />
                  <div style={{ padding:'12px 16px' }}>
                    <div style={{ display:'flex', alignItems:'center', gap:6, marginBottom:6 }}>
                      <span style={{ fontSize:11, fontWeight:700, padding:'2px 8px', borderRadius:20, background:sv.bg, color:sv.color }}>{fb.severity}</span>
                      <span style={{ fontSize:12, fontWeight:600, color:'#374151' }}>{fb.category}</span>
                      <span style={{ fontSize:10, color:'#9CA3AF', marginLeft:'auto' }}>{fb.status}</span>
                    </div>
                    <div style={{ fontSize:13, color:'#374151', lineHeight:1.6 }}>{fb.message}</div>
                    {fb.notes && <div style={{ marginTop:8, padding:'8px 10px', background:'#F0FDF4', borderRadius:7, borderLeft:'3px solid #1D9E75', fontSize:12, color:'#374151' }}>{fb.notes}</div>}
                    <div style={{ fontSize:10, color:'#9CA3AF', marginTop:6 }}>{fb.profiles?.full_name}</div>
                  </div>
                </div>
              )
            })
        }
      </div>}

      {pendingRename && (
        <FileRenameModal
          pending={pendingRename}
          fileTypes={fileTypes}
          onCancel={() => setPendingRename(null)}
          onConfirm={async (names, chosenTypeId) => {
            const { files } = pendingRename
            setPendingRename(null)
            setUploading(true)
            for (let i = 0; i < files.length; i++) {
              const file = files[i]
              const name = names[i] || file.name
              const path = `${id}/${Date.now()}_${name}`
              const { error: upErr } = await supabase.storage.from(BUCKET).upload(path, file, { contentType: file.type || 'application/octet-stream' })
              if (upErr) { toast(upErr.message, 'error'); continue }
              const { data } = await supabase.from('attachments')
                .insert({ job_id: id, name, type: file.type, size: file.size, storage_path: path, file_type_id: chosenTypeId||null })
                .select().single()
              if (data) setAtts(prev => [...prev, data])
            }
            setUploading(false)
            toast('Uploaded ✓')
          }}
        />
      )}

    </div>
    </>
  )
}
