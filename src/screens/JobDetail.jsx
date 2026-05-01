import React, { useState, useEffect, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { supabase, BUCKET, pubUrl } from '../lib/supabase'
import { useApp } from '../context/AppContext'
import { ClockInButton, BudgetBar, TimeHistory, fmtHours } from './ClockIn'
import { NoteEditor } from './Notes'
import RoomDetail from './RoomDetail'
import { ActiveProcessBanner } from './JobProcesses'
import { useToast } from '../components/Toast'
import BackButton from '../components/BackButton'
import StatusBadge from '../components/StatusBadge'

const TODAY = new Date(); TODAY.setHours(0,0,0,0)
const STATUSES = ['In progress','Submitted for approval','Review','Complete','On hold']

// Module-level cache — persists across navigations within the session
// so re-opening a job doesn't re-fetch the materials library
let _materialsCache = null
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

function ProcessesPanel({ jobId, processes, onProcessesChange, profile, toast, onHistoryRefresh }) {
  const [templates, setTemplates]     = React.useState([])
  const [activeEntries, setActiveEntries] = React.useState({}) // processId->entry
  const [showAdd, setShowAdd]         = React.useState(false)
  const [newProc, setNewProc]         = React.useState({ name:'', hours:'' })
  const saveTimer = React.useRef()

  React.useEffect(() => {
    supabase.from('process_templates').select('*').order('sort_order').then(({data})=>setTemplates(data||[]))
    supabase.from('time_entries').select('*').eq('job_id',jobId).is('clocked_out_at',null)
      .then(({data})=>{
        const map={}; (data||[]).forEach(e=>{ if(e.process_id) map[e.process_id]=e }); setActiveEntries(map)
      })
  },[jobId])

  function update(id, patch) {
    onProcessesChange(p=>p.map(x=>x.id===id?{...x,...patch}:x))
    clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(()=>supabase.from('job_processes').update(patch).eq('id',id),500)
  }

  async function clockIn(proc) {
    // Clock out any active first
    for (const [pid,entry] of Object.entries(activeEntries)) {
      const mins=(Date.now()-new Date(entry.clocked_in_at).getTime())/60000
      await supabase.from('time_entries').update({clocked_out_at:new Date().toISOString(),duration_minutes:Math.round(mins)}).eq('id',entry.id)
      const p=processes.find(x=>x.id===pid)
      if(p) update(p.id,{time_logged:parseFloat(((p.time_logged||0)+mins/60).toFixed(2))})
    }
    const {data,error}=await supabase.from('time_entries').insert({
      job_id:jobId,user_id:profile.id,process_id:proc.id,clocked_in_at:new Date().toISOString()
    }).select().single()
    if(error){toast(error.message,'error');return}
    setActiveEntries({[proc.id]:data})
    // Write status immediately
    onProcessesChange(p=>p.map(x=>x.id===proc.id?{...x,status:'In progress',assigned_to:profile.id}:x))
    await supabase.from('job_processes').update({status:'In progress',assigned_to:profile.id}).eq('id',proc.id)
    toast(`▶ ${proc.name} started`)
    if(onHistoryRefresh) setTimeout(onHistoryRefresh,500)
  }

  async function clockOut(proc, newStatus) {
    const entry=activeEntries[proc.id]; if(!entry) return
    const mins=(Date.now()-new Date(entry.clocked_in_at).getTime())/60000
    await supabase.from('time_entries').update({clocked_out_at:new Date().toISOString(),duration_minutes:Math.round(mins)}).eq('id',entry.id)
    const newLogged=parseFloat(((proc.time_logged||0)+mins/60).toFixed(2))
    const patch = {time_logged:newLogged,...(newStatus?{status:newStatus,assigned_to:profile.id}:{})}
    // Write directly to DB immediately — don't debounce status changes
    onProcessesChange(p=>p.map(x=>x.id===proc.id?{...x,...patch}:x))
    await supabase.from('job_processes').update(patch).eq('id',proc.id)
    const {[proc.id]:_,...rest}=activeEntries; setActiveEntries(rest)
    toast(`${newStatus==='Complete'?'✓':newStatus==='On hold'?'⏸':'■'} ${proc.name} — ${(mins/60).toFixed(1)}h logged`)
    if(onHistoryRefresh) setTimeout(onHistoryRefresh,500)
  }

  async function addFromTemplate(t) {
    const {data,error}=await supabase.from('job_processes').insert({
      job_id:jobId,template_id:t.id,name:t.name,
      allocated_hours:t.default_hours||0,color:t.color||'#9CA3AF',
      status:'Not started',time_logged:0,sort_order:processes.length
    }).select().single()
    if(error){toast(error.message,'error');return}
    onProcessesChange(p=>[...p,data]); toast(`${t.name} added ✓`)
  }

  async function addCustom() {
    if(!newProc.name.trim()) return
    const {data,error}=await supabase.from('job_processes').insert({
      job_id:jobId,name:newProc.name,allocated_hours:parseFloat(newProc.hours)||0,
      color:'#9CA3AF',status:'Not started',time_logged:0,sort_order:processes.length
    }).select().single()
    if(error){toast(error.message,'error');return}
    onProcessesChange(p=>[...p,data]); setNewProc({name:'',hours:''}); setShowAdd(false)
    toast(`${data.name} added ✓`)
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
            const logged=proc.time_logged||0
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
                <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:isDone?0:6}}>
                  <div style={{width:10,height:10,borderRadius:'50%',
                    background: isDone ? '#C4C9D4' : (proc.color||'#9CA3AF'),
                    flexShrink:0,
                    boxShadow:isActive?`0 0 0 3px ${proc.color||'#9CA3AF'}33`:undefined}} />
                  <span style={{fontSize:13,fontWeight:isDone?500:700,color:isDone?'#9CA3AF':'#2A3042',flex:1,textDecoration:isDone?'line-through':'none'}}>{proc.name}</span>
                  <span style={{fontSize:10,fontWeight:700,padding:'2px 7px',borderRadius:8,background:ss.bg,color:ss.color,border:`1px solid ${ss.border}`}}>
                    {isActive?'● Active':proc.status}
                  </span>
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
                    <div style={{fontSize:11,color:'#9CA3AF',textAlign:'center',width:'100%',padding:'4px 0'}}>Completed ✓</div>
                  ) : (
                    <button onClick={()=>clockIn(proc)} style={{width:'100%',fontSize:12,fontWeight:700,padding:'6px',borderRadius:7,border:'1px solid #C4D4F8',background:'#EEF2FF',color:'#3730A3',cursor:'pointer'}}>
                      {proc.status==='On hold'?'▶ Resume':'▶ Start'}
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
          <div style={{display:'flex',gap:6}}>
            <input value={newProc.name} onChange={e=>setNewProc(p=>({...p,name:e.target.value}))}
              onKeyDown={e=>e.key==='Enter'&&addCustom()} placeholder="Process name" autoFocus
              style={{flex:1,padding:'6px 9px',border:'1px solid #DDE3EC',borderRadius:7,fontSize:12,outline:'none'}}/>
            <input type="number" value={newProc.hours} onChange={e=>setNewProc(p=>({...p,hours:e.target.value}))}
              placeholder="hrs" style={{width:50,padding:'6px 8px',border:'1px solid #DDE3EC',borderRadius:7,fontSize:12,outline:'none',textAlign:'center'}}/>
            <button onClick={addCustom} style={{padding:'6px 12px',borderRadius:7,border:'none',background:'#5B8AF0',color:'#fff',fontSize:12,fontWeight:700,cursor:'pointer'}}>Add</button>
          </div>
        </div>
      )}
    </div>
  )
}

function HistoryPanel({ timeHistory }) {
  if (timeHistory.length===0) return (
    <div style={{textAlign:'center',padding:'32px 16px',color:'#9CA3AF',fontSize:13}}>No time entries yet</div>
  )

  function fmt(dt) {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: 'Pacific/Auckland',
      day: 'numeric', month: 'short',
      hour: 'numeric', minute: '2-digit', hour12: false
    }).formatToParts(new Date(dt))
    const get = t => parts.find(p=>p.type===t)?.value||''
    const h24 = parseInt(get('hour'), 10)
    const h12 = h24 % 12 || 12
    const ampm = h24 < 12 ? 'am' : 'pm'
    return `${get('day')} ${get('month')}, ${h12}:${get('minute')} ${ampm}`
  }
  function dur(entry) {
    // Active entries: always calculate live from clocked_in_at
    if (!entry.clocked_out_at) {
      const mins=(Date.now()-new Date(entry.clocked_in_at).getTime())/60000
      const h=Math.floor(mins/60), m=Math.round(mins%60)
      return h>0?`${h}h ${m}m`:`${m}m`
    }
    // Completed: use stored duration if valid (>0 and reasonable)
    if (entry.duration_minutes && entry.duration_minutes > 0) {
      // Sanity check: duration shouldn't exceed actual clock time by >10%
      const actualMins=(new Date(entry.clocked_out_at)-new Date(entry.clocked_in_at))/60000
      const stored=entry.duration_minutes
      const use = stored > actualMins * 10 ? actualMins : stored // fallback if wildly wrong
      const h=Math.floor(use/60), m=Math.round(use%60)
      return h>0?`${h}h ${m}m`:`${m}m`
    }
    // Calculate from timestamps
    const mins=(new Date(entry.clocked_out_at)-new Date(entry.clocked_in_at))/60000
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
                  {user?.full_name||user?.email||'Unknown'} · {fmt(entry.clocked_in_at)}
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
  processes, onProcessesChange, timeHistory, onHistoryChange, profile }) {

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
          onHistoryRefresh={()=>supabase.from('time_entries')
            .select('*,profiles(id,full_name,email),job_processes(id,name,color)')
            .eq('job_id',jobId).order('clocked_in_at',{ascending:false}).limit(30)
            .then(({data})=>onHistoryChange(data||[]))} />
      </div>

      {/* ── HISTORY ── */}
      <HistorySectionWithToggle timeHistory={timeHistory} />
    </div>
  )
}

// ── Rooms Panel (right column) ───────────────────────────────────
const ROOM_TYPES_LIST = ['Kitchen','Laundry',"Butler's Pantry",'Ensuite','Bathroom','Bedroom','Living','Office','Garage','Other']

function RoomsPanel({ rooms, jobId, toast, onAddRoom, onOpenRoom, onRoomsChange }) {
  const [adding, setAdding] = React.useState(false)
  const [newName, setNewName] = React.useState('')
  const [newType, setNewType] = React.useState('Kitchen')
  const inputRef = React.useRef()

  React.useEffect(() => { if (adding && inputRef.current) inputRef.current.focus() }, [adding])

  async function addRoom() {
    const name = newName.trim() || newType
    const { data, error } = await supabase.from('rooms').insert({
      job_id: jobId, name, type: newType, sort_order: rooms.length, tasks: '[]',
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
          <select value={newType} onChange={e=>setNewType(e.target.value)}
            style={{ width:'100%', padding:'7px 10px', border:'1px solid #DDE3EC', borderRadius:8, fontSize:13, outline:'none', marginBottom:8, background:'#fff' }}>
            {ROOM_TYPES_LIST.map(t=><option key={t}>{t}</option>)}
          </select>
          <input ref={inputRef} value={newName} onChange={e=>setNewName(e.target.value)}
            placeholder={`Room name (default: ${newType})`}
            onKeyDown={e=>e.key==='Enter'&&addRoom()}
            style={{ width:'100%', padding:'7px 10px', border:'1px solid #DDE3EC', borderRadius:8, fontSize:13, outline:'none', marginBottom:8, boxSizing:'border-box' }} />
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
                    {room.type==='Kitchen'?'🍳':room.type==='Laundry'?'🫧':room.type==='Bathroom'||room.type==='Ensuite'?'🚿':room.type==='Bedroom'?'🛏':room.type==='Living'?'🛋':room.type==='Office'?'💼':'🏠'}
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

export default function JobDetail() {
  const { id }  = useParams()
  const navigate = useNavigate()
  const toast    = useToast()
  const { can, profile } = useApp()

  const [job, setJob]       = useState(null)
  const [atts, setAtts]     = useState([])
  const [materials, setMaterials] = useState([])
  const [jobMats, setJobMats]     = useState([])
  const [allMats, setAllMats]     = useState([])
  const [panelMaterials, setPanelMaterials] = useState([])
  const [loading, setLoading]     = useState(true)
  const [saving, setSaving]       = useState(false)
  const [tasks, setTasks]         = useState([])
  const [taskForm, setTaskForm]   = useState(false)
  const [newTask, setNewTask]     = useState({ title:'', date:'', time:'09:00' })
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
  const [rightTab, setRightTab]       = useState('rooms')
  const [unorderedCount, setUnorderedCount] = useState(0)
  const [showProcesses, setShowProcesses] = useState(false)
  const [startupOpenKey, setStartupOpenKey] = useState(0)
  const [allNotes, setAllNotes] = useState([])
  const [allJobs, setAllJobs] = useState([])
  const [dirty, setDirty] = useState(false)
  const [jobAppliances, setJobAppliances] = useState([])
  const [allAppliances, setAllAppliances] = useState([])
  const [showAppPicker, setShowAppPicker] = useState(false)

  // Track if all-materials has been fetched yet (lazy)
  const allMatsFetched = React.useRef(false)

  const loadAll = useCallback(async () => {
    // Only fetch what we need to render the page immediately
    // allMats (materials library) is fetched lazily when picker is opened
    const [{ data: j }, { data: a }, { data: jm }, { data: panelMats }, { data: ja }, { data: appLib }, { data: jNotes }, { data: fTypes }, { data: approvs }] = await Promise.all([
      supabase.from('jobs').select('*').eq('id', id).single(),
      supabase.from('attachments').select('*').eq('job_id', id).order('created_at'),
      supabase.from('job_materials').select('*,materials(*)').eq('job_id', id),
      supabase.from('materials').select('*').order('name'),
      supabase.from('job_appliances').select('*,appliances(*)').eq('job_id', id).order('created_at'),
      supabase.from('appliances').select('*').order('brand'),
      supabase.from('notes').select('id,title,is_public,created_by,updated_at,content,is_startup').eq('job_id', id).order('updated_at',{ascending:false}),
      supabase.from('file_types').select('*').order('name'),
      supabase.from('approval_requests').select('*,profiles!approval_requests_requested_by_fkey(full_name,email),reviewer:profiles!approval_requests_reviewed_by_fkey(full_name,email)').eq('job_id', id),
    ])
    setJob(j); setAtts(a||[]); setJobMats(jm||[])
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
    setLoading(false)
    // Load rooms
    supabase.from('rooms').select('*').eq('job_id', id).order('sort_order').then(({data})=>setRooms(data||[]))
    // Load processes
    supabase.from('job_processes').select('*').eq('job_id', id).order('sort_order').then(({data})=>setProcesses(data||[]))
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

    // Silently refresh mat_colors if stored version is missing storage_path data
    // (happens for jobs created before this field was added)
    if (j && jm?.length) {
      const stored = j.mat_colors ? JSON.parse(j.mat_colors) : []
      const needsRefresh = (jm||[]).some(row => 
        row.materials?.storage_path && !stored.find(s => s.name === row.materials.name && s.storage_path)
      )
      if (needsRefresh) {
        const freshColors = (jm||[]).filter(row => row.materials).map(row => ({
          name:       row.materials.name,
          color:      row.materials.color || '#888',
          storage_path: row.materials.storage_path || null,
          supplier:   row.materials.supplier || '',
          panel_type: row.materials.panel_type || '',
          thickness:  row.materials.thickness || '',
        }))
        await supabase.from('jobs').update({ mat_colors: JSON.stringify(freshColors) }).eq('id', j.id)
        setJob(prev => prev ? { ...prev, mat_colors: JSON.stringify(freshColors) } : prev)
      }
    }
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

  // Lazy-load the full materials library only when picker is opened.
  // Uses a module-level cache so re-opening the same or different job
  // doesn't hit the database again in the same session.
  async function openMatPicker() {
    setMatPickerOpen(v => !v)
    if (!allMatsFetched.current) {
      allMatsFetched.current = true
      if (_materialsCache) {
        setAllMats(_materialsCache)
      } else {
        const { data } = await supabase.from('materials').select('*').order('name')
        _materialsCache = data || []
        setAllMats(_materialsCache)
      }
    }
  }

  async function saveJob() {
    setSaving(true)
    const { error } = await supabase.from('jobs').update({
      name: job.name, client: job.client, type: job.type, status: job.status,
      notes: job.notes, mvnum: job.mvnum, job_number: job.job_number ? String(job.job_number) : null, start_date: job.start_date,
      due_date: job.due_date, budget_hours: job.budget_hours, delivery_address: job.delivery_address,
      kitchen_specs: specsRef.current && Object.keys(specsRef.current).length > 0 ? JSON.stringify(specsRef.current) : (job.kitchen_specs || null),
    }).eq('id', id)
    setSaving(false)
    if (error) toast(error.message, 'error')
    else {
      toast('Saved ✓'); setDirty(false)
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

  async function addTask() {
    if (!newTask.title.trim()) return
    const updated = [...tasks, { id: Date.now().toString(), ...newTask, done: false }]
    await saveTasks(updated)
    setNewTask({ title:'', date:'', time:'09:00' })
    setTaskForm(false)
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

  function handleFiles(e) {
    const files = Array.from(e.target.files)
    if (!files.length) return
    if (fileTypes.length === 0) {
      // no file types configured — upload directly
      uploadFiles(files, '')
    } else {
      pendingFiles.current = files
      setShowTypeModal(true)
    }
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

  async function addMat(mid) {
    const { data } = await supabase.from('job_materials').insert({ job_id: id, material_id: mid }).select('*,materials(*)').single()
    if (data) {
      setJobMats(prev => [...prev, data])
      const colors = [...jobMats, data].filter(jm=>jm.materials).map(jm=>({ name: jm.materials.name, color: jm.materials.color||'#888', storage_path: jm.materials.storage_path||null, supplier: jm.materials.supplier||'', panel_type: jm.materials.panel_type||'', thickness: jm.materials.thickness||'' }))
      await supabase.from('jobs').update({ mat_colors: JSON.stringify(colors) }).eq('id', id)
    }
    setMatPickerOpen(false)
    toast('Material added ✓')
  }

  async function removeMat(jmid) {
    await supabase.from('job_materials').delete().eq('id', jmid)
    const remaining = jobMats.filter(x => x.id !== jmid)
    setJobMats(remaining)
    const colors = remaining.filter(jm=>jm.materials).map(jm=>({ name: jm.materials.name, color: jm.materials.color||'#888', storage_path: jm.materials.storage_path||null, supplier: jm.materials.supplier||'', panel_type: jm.materials.panel_type||'', thickness: jm.materials.thickness||'' }))
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
    {/* Startup overlay — outside grid so it covers full screen */}
    {showStartup && (
      <StartupPanel
        key={startupOpenKey}
        job={job}
        jobMats={jobMats}
        jobApps={jobAppliances}
        startupNote={startupNote}
        allNotes={allNotes}
        allJobs={allJobs}
        onClose={() => {
          setShowStartup(false)
          // Refresh notes list after panel closes
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
    <div className='job-detail-grid' style={{ alignItems:'start' }}>
      {/* LEFT COLUMN — always shown */}
      <div>

      <BackButton to="/" label="Jobs" />

      {/* Active process banner */}
      <ActiveProcessBanner jobId={id} />

      {/* header */}
      <div className="flex items-start justify-between mb-4 gap-3 flex-wrap">
        <div>
          <h1 className="text-xl font-bold text-[#2A3042]">{job.name}</h1>
          <div className="text-sm text-[#6B7280] mt-0.5">{job.id} · {job.type} · {job.client}</div>
        </div>
        <select value={job.status} onChange={e => { setJob(j => ({ ...j, status: e.target.value })); setDirty(true) }}
          className={`text-xs font-semibold px-3 py-1.5 rounded-full border cursor-pointer ${statusStyle[job.status]}`}>
          {STATUSES.map(s => <option key={s}>{s}</option>)}
        </select>
      </div>

      {/* overdue banner */}
      {overTasks.length > 0 && (
        <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-xl px-4 py-3 mb-4 text-sm text-red-700">
          ⚠ {overTasks.length} overdue task{overTasks.length > 1 ? 's' : ''} on this job
        </div>
      )}

      {/* tasks */}
      <div style={{ background:"#fff", borderRadius:12, border:"1px solid #E8ECF0", boxShadow:"0 1px 3px rgba(0,0,0,0.04)", padding:18, marginBottom:14 }}>
        <div className="flex items-center justify-between mb-3">
          <span className="section-title">Tasks</span>
          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${overTasks.length > 0 ? 'bg-red-50 text-red-700' : openTasks.length > 0 ? 'bg-blue-50 text-blue-700' : tasks.length > 0 ? 'bg-teal-50 text-teal-700' : 'bg-[#F3F4F6] text-[#9CA3AF]'}`}>
            {overTasks.length > 0 ? `${openTasks.length} remaining · ${overTasks.length} overdue` : openTasks.length > 0 ? `${openTasks.length} of ${tasks.length} remaining` : tasks.length > 0 ? 'All complete' : 'No tasks'}
          </span>
        </div>
        <div className="divide-y divide-[#F3F4F6] mb-3">
          {sortedTasks.length === 0 && <div className="text-sm text-[#9CA3AF] py-2">No tasks yet</div>}
          {sortedTasks.map(t => {
            const isOver = !t.done && t.date && dFromNow(t.date, t.time) < 0
            return (
              <div key={t.id} className="flex items-start gap-2.5 py-2.5">
                <div onClick={() => toggleTask(t.id)}
                  className={`w-5 h-5 rounded-[4px] border-[1.5px] flex-shrink-0 mt-0.5 flex items-center justify-center cursor-pointer transition-colors
                    ${t.done ? 'bg-teal-500 border-teal-500 text-white' : isOver ? 'border-red-400' : 'border-[#DDE3EC]'}`}>
                  {t.done && <span className="text-[10px] font-bold">✓</span>}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <div className={`text-sm ${t.done ? 'line-through text-[#9CA3AF]' : 'text-[#2A3042]'}`}>{t.title}</div>
                    {t.from_note && (
                      <span onClick={() => navigate(`/notes/${t.from_note}`)}
                        title="From a linked note — click to open"
                        style={{ fontSize:10, padding:'1px 7px', borderRadius:8, background:'#F0F4FF', color:'#3730A3', fontWeight:600, cursor:'pointer', border:'1px solid #C4D4F8', flexShrink:0 }}>
                        📄 Note
                      </span>
                    )}
                    {t.private && (
                      <span title="Only visible to you" style={{ fontSize:10, padding:'1px 7px', borderRadius:8, background:'#F3F4F6', color:'#6B7280', fontWeight:600, flexShrink:0 }}>
                        🔒
                      </span>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-1.5 mt-1">
                    <DueBadge t={t} />
                    {t.done && t.completed_by && (
                      <span style={{ fontSize:10, color:'#9CA3AF', display:'flex', alignItems:'center', gap:3 }}>
                        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7"/></svg>
                        {t.completed_by}
                        {t.completed_at && (
                          <span style={{ color:'#C4C9D4' }}>
                            · {new Date(t.completed_at).toLocaleDateString('en-NZ',{day:'numeric',month:'short'})} {new Date(t.completed_at).toLocaleTimeString('en-NZ',{hour:'2-digit',minute:'2-digit',timeZone:'Pacific/Auckland',hour12:true})}
                          </span>
                        )}
                      </span>
                    )}
                  </div>
                </div>
                <button onClick={() => deleteTask(t.id)} className="text-[#D1D5DB] hover:text-red-400 text-lg leading-none bg-transparent border-none cursor-pointer flex-shrink-0">×</button>
              </div>
            )
          })}
        </div>
        {taskForm ? (
          <div className="border-t border-[#F3F4F6] pt-3">
            <input className="input text-sm mb-2" placeholder="Task description…"
              value={newTask.title} onChange={e => setNewTask(p => ({ ...p, title: e.target.value }))}
              onKeyDown={e => e.key === 'Enter' && addTask()} autoFocus />
            <div className="grid grid-cols-2 gap-2 mb-3">
              <div><label className="label">Due date</label><input className="input text-sm" type="date" value={newTask.date} onChange={e => setNewTask(p => ({ ...p, date: e.target.value }))} /></div>
              <div><label className="label">Due time</label><input className="input text-sm" type="time" value={newTask.time} onChange={e => setNewTask(p => ({ ...p, time: e.target.value }))} /></div>
            </div>
            <div className="flex gap-2">
              <button onClick={addTask} className="btn-green btn-sm">Add task</button>
              <button onClick={() => setTaskForm(false)} className="btn btn-sm">Cancel</button>
            </div>
          </div>
        ) : (
          <button onClick={() => setTaskForm(true)} className="btn-blue btn-sm">+ Add task</button>
        )}
      </div>

      {/* job details */}
      <div style={{ background:"#fff", borderRadius:12, border:"1px solid #E8ECF0", boxShadow:"0 1px 3px rgba(0,0,0,0.04)", padding:18, marginBottom:14 }}>
        <div style={{ fontSize:11, fontWeight:700, color:"#9CA3AF", textTransform:"uppercase", letterSpacing:".05em", marginBottom:12, display:"block" }}>Job details</div>
        <div className="grid grid-cols-2 gap-3">
          {[['Job name','name','text'],['Job number','job_number','text'],['Client','client','text'],['Microvellum #','mvnum','text'],['Budget hours','budget_hours','number'],['Start date','start_date','date'],['Due date','due_date','date']].map(([l,k,t]) => (
            <div key={k}><label className="label">{l}</label>
              <input className="input text-sm" type={t==='number'?'number':'text'} value={job[k]||''}
                onChange={e => setJob(j => ({ ...j, [k]: e.target.value }))}
                onBlur={e => { setJob(j => ({ ...j, [k]: e.target.value })); setDirty(true) }} />
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

      {/* notes */}
      <div style={{ background:"#fff", borderRadius:12, border:"1px solid #E8ECF0", boxShadow:"0 1px 3px rgba(0,0,0,0.04)", padding:18, marginBottom:14 }}>
        <div style={{ fontSize:11, fontWeight:700, color:"#9CA3AF", textTransform:"uppercase", letterSpacing:".05em", marginBottom:8, display:"block" }}>Notes</div>
        <textarea className="input text-sm min-h-[80px] resize-y w-full" placeholder="Notes, observations, specs…"
          value={job.notes||''} onChange={e => { setJob(j => ({ ...j, notes: e.target.value })); setDirty(true) }} />
      </div>

      {/* materials */}
      <div style={{ background:"#fff", borderRadius:12, border:"1px solid #E8ECF0", boxShadow:"0 1px 3px rgba(0,0,0,0.04)", padding:18, marginBottom:14 }}>
        <div style={{ fontSize:11, fontWeight:700, color:"#9CA3AF", textTransform:"uppercase", letterSpacing:".05em", marginBottom:12, display:"block" }}>Materials</div>
        <div className="flex flex-wrap gap-2 mb-3">
          {jobMats.map(jm => {
            const m = jm.materials; if (!m) return null
            return (
              <div key={jm.id} style={{ display:'flex', alignItems:'center', gap:8, padding:'8px 12px', background:'#F9FAFB', border:'1px solid #E8ECF0', borderRadius:10 }}>
                {m.storage_path
                  ? <img src={pubUrl(m.storage_path)} style={{ width:28, height:28, borderRadius:6, objectFit:'cover', flexShrink:0, border:'1px solid #E8ECF0' }} alt="" loading="lazy" />
                  : <div style={{ width:28, height:28, borderRadius:6, background:m.color||'#D1D5DB', flexShrink:0, border:'1px solid rgba(0,0,0,0.08)' }} />
                }
                <div style={{ minWidth:0 }}>
                  <div style={{ fontSize:12, fontWeight:700, color:'#2A3042', whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>{m.name}</div>
                  <div style={{ fontSize:11, color:'#9CA3AF', marginTop:1, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>
                    {[m.supplier, m.panel_type, m.thickness?m.thickness+'mm':null, m.colour_code, m.finish].filter(Boolean).join(' · ')}
                  </div>
                </div>
                <button onClick={() => removeMat(jm.id)} style={{ background:'none', border:'none', cursor:'pointer', color:'#D1D5DB', fontSize:16, lineHeight:1, marginLeft:4, flexShrink:0, padding:'0 2px' }}
                  onMouseEnter={e=>e.currentTarget.style.color='#E24B4A'} onMouseLeave={e=>e.currentTarget.style.color='#D1D5DB'}>×</button>
              </div>
            )
          })}
        </div>
        <button onClick={openMatPicker} className="btn-blue btn-sm">+ Add from library</button>
        {matPickerOpen && (
          <div style={{ marginTop:10 }}>
            <input autoFocus value={matSearch} onChange={e=>setMatSearch(e.target.value)}
              placeholder="Search materials…"
              style={{ width:'100%', padding:'8px 12px', border:'1px solid #DDE3EC', borderRadius:9, fontSize:13, outline:'none', boxSizing:'border-box', marginBottom:6 }} />
            {matSearch.trim() === '' ? (
              <div style={{ fontSize:12, color:'#9CA3AF', textAlign:'center', padding:'12px 0' }}>Start typing to search…</div>
            ) : (() => {
              const q = matSearch.toLowerCase()
              const results = availMats.filter(m =>
                (m.name||'').toLowerCase().includes(q) ||
                (m.supplier||'').toLowerCase().includes(q) ||
                (m.colour_code||'').toLowerCase().includes(q) ||
                (m.finish||'').toLowerCase().includes(q) ||
                (m.panel_type||'').toLowerCase().includes(q)
              )
              return results.length === 0
                ? <div style={{ fontSize:12, color:'#9CA3AF', textAlign:'center', padding:'12px 0' }}>No matches found</div>
                : <div style={{ maxHeight:220, overflowY:'auto', border:'1px solid #E8ECF0', borderRadius:10, overflow:'hidden' }}>
                    {results.map(m => (
                      <div key={m.id} onClick={() => { addMat(m.id); setMatSearch(''); setMatPickerOpen(false) }}
                        style={{ display:'flex', alignItems:'center', gap:10, padding:'9px 12px', cursor:'pointer', borderBottom:'1px solid #F9FAFB', background:'#fff' }}
                        onMouseEnter={e=>e.currentTarget.style.background='#F9FAFB'}
                        onMouseLeave={e=>e.currentTarget.style.background='#fff'}>
                        {m.storage_path
                          ? <img src={pubUrl(m.storage_path)} style={{ width:36,height:36,borderRadius:8,objectFit:'cover',flexShrink:0,border:'1px solid #E8ECF0' }} alt="" />
                          : <div style={{ width:36,height:36,borderRadius:8,background:m.color||'#F3F4F6',flexShrink:0 }} />
                        }
                        <div style={{ flex:1, minWidth:0 }}>
                          <div style={{ fontSize:13, fontWeight:600, color:'#2A3042' }}>{m.name}</div>
                          <div style={{ fontSize:11, color:'#9CA3AF', marginTop:1 }}>
                            {[m.supplier, m.panel_type, m.thickness?m.thickness+'mm':null, m.colour_code, m.finish].filter(Boolean).join(' · ')}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
            })()}
          </div>
        )}
      </div>

      {/* appliances */}
      <JobAppliancesSection
        jobId={id}
        jobAppliances={jobAppliances}
        allAppliances={allAppliances}
        setJobAppliances={setJobAppliances}
        setAllAppliances={setAllAppliances}
      />

      {/* linked notes */}
      {/* unordered items banner */}
      {unorderedCount > 0 && (
        <div onClick={() => navigate(`/job/${id}/orders`)}
          style={{ display:'flex', alignItems:'center', gap:10, padding:'10px 14px', background:'#FEF9C3', borderRadius:10, border:'1px solid #FDE68A', marginBottom:10, cursor:'pointer', transition:'all .1s' }}
          onMouseEnter={e=>e.currentTarget.style.background='#FEF3C7'}
          onMouseLeave={e=>e.currentTarget.style.background='#FEF9C3'}>
          <span style={{ fontSize:18 }}>📦</span>
          <div style={{ flex:1 }}>
            <div style={{ fontSize:13, fontWeight:700, color:'#854D0E' }}>{unorderedCount} item{unorderedCount!==1?'s':''} need to be ordered</div>
            <div style={{ fontSize:11, color:'#92400E' }}>Tap to open order sheet</div>
          </div>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#92400E" strokeWidth="2"><polyline points="9 18 15 12 9 6"/></svg>
        </div>
      )}

      {/* order sheet quick link */}
      <div onClick={() => navigate(`/job/${id}/orders`)}
        style={{ display:'flex', alignItems:'center', gap:12, padding:'12px 16px', background:'#fff', borderRadius:12, border:'1px solid #E8ECF0', boxShadow:'0 1px 3px rgba(0,0,0,0.04)', marginBottom:14, cursor:'pointer', transition:'all .12s' }}
        onMouseEnter={e=>{e.currentTarget.style.background='#F9FAFB';e.currentTarget.style.borderColor='#C4D4F8'}}
        onMouseLeave={e=>{e.currentTarget.style.background='#fff';e.currentTarget.style.borderColor='#E8ECF0'}}>
        <div style={{ width:36, height:36, borderRadius:9, background:'#EEF2FF', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#5B8AF0" strokeWidth="2"><path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2"/><rect x="9" y="3" width="6" height="4" rx="1"/><line x1="9" y1="12" x2="15" y2="12"/><line x1="9" y1="16" x2="13" y2="16"/></svg>
        </div>
        <div style={{ flex:1 }}>
          <div style={{ fontSize:13, fontWeight:700, color:'#2A3042' }}>To be ordered</div>
          <div style={{ fontSize:11, color:'#9CA3AF' }}>Manage materials and items to order</div>
        </div>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#C4C9D4" strokeWidth="2"><polyline points="9 18 15 12 9 6"/></svg>
      </div>

      <div style={{ background:'#fff', borderRadius:12, border:'1px solid #E8ECF0', boxShadow:'0 1px 3px rgba(0,0,0,0.04)', padding:18, marginBottom:14 }}>
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:12 }}>
          <div style={{ fontSize:11, fontWeight:700, color:'#9CA3AF', textTransform:'uppercase', letterSpacing:'.05em' }}>Notes</div>
          <button onClick={() => navigate(`/notes/new?job=${id}`)}
            style={{ fontSize:12, fontWeight:600, padding:'5px 12px', borderRadius:8, border:'1px solid #C4D4F8', background:'#EEF2FF', color:'#3730A3', cursor:'pointer' }}>
            + New note
          </button>
        </div>
        {/* startup note card */}
        <div
          style={{ display:'flex', alignItems:'center', gap:10, padding:'10px 12px', background: startupNote ? '#FFF7ED' : '#FAFAFA', borderRadius:9, border:`1px solid ${startupNote ? '#FED7AA' : '#E8ECF0'}`, cursor:'pointer', marginBottom: jobNotes.length > 0 ? 8 : 0, transition:'all .12s' }}
          onClick={async () => {
              let sNote = null
              const { data: d1 } = await supabase.from('notes')
                .select('id,title,is_public,created_by,updated_at,content,is_startup')
                .eq('job_id', id).eq('is_startup', true).maybeSingle()
              if (d1) { sNote = d1 } else {
                const { data: d2 } = await supabase.from('notes')
                  .select('id,title,is_public,created_by,updated_at,content,is_startup')
                  .eq('job_id', id).ilike('title', 'Startup%').order('created_at',{ascending:false}).limit(1).maybeSingle()
                if (d2) { sNote = d2; await supabase.from('notes').update({ is_startup: true }).eq('id', d2.id) }
              }
              setStartupNote(sNote)
              setShowStartup(true)
              setStartupOpenKey(k => k+1)
            }}
          onMouseEnter={e=>{e.currentTarget.style.background=startupNote?'#FEF3C7':'#F3F4F6'}}
          onMouseLeave={e=>{e.currentTarget.style.background=startupNote?'#FFF7ED':'#FAFAFA'}}>
          <div style={{ width:32, height:32, borderRadius:8, background: startupNote ? '#F97316' : '#E8ECF0', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
            <span style={{ fontSize:16 }}>🚀</span>
          </div>
          <div style={{ flex:1, minWidth:0 }}>
            <div style={{ fontSize:13, fontWeight:700, color:'#2A3042' }}>Startup meeting</div>
            <div style={{ fontSize:11, color:'#9CA3AF' }}>
              {startupNote ? `Last updated ${new Date(startupNote.updated_at||startupNote.created_at).toLocaleDateString('en-NZ',{day:'numeric',month:'short'})}` : 'No startup note yet — tap to create'}
            </div>
          </div>
          {startupNote && (
            <span style={{ fontSize:10, padding:'2px 7px', borderRadius:8, background:'#ECFDF5', color:'#065F46', fontWeight:600, border:'1px solid #6EE7B7' }}>Ready</span>
          )}
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#C4C9D4" strokeWidth="2"><polyline points="9 18 15 12 9 6"/></svg>
        </div>
        {jobNotes.length === 0 ? (
          <div style={{ textAlign:'center', padding:'12px 0', color:'#9CA3AF', fontSize:13 }}>No notes linked to this job</div>
        ) : (
          <div style={{ display:'flex', flexDirection:'column', gap:7 }}>
              {jobNotes.map(n => (
                <div key={n.id} onClick={() => navigate(`/notes/${n.id}`)}
                  style={{ display:'flex', alignItems:'center', gap:10, padding:'9px 12px', background:'#F9FAFB', borderRadius:9, border:'1px solid #E8ECF0', cursor:'pointer', transition:'all .1s' }}
                  onMouseEnter={e=>{e.currentTarget.style.background='#F0F4FF';e.currentTarget.style.borderColor='#C4D4F8'}}
                  onMouseLeave={e=>{e.currentTarget.style.background='#F9FAFB';e.currentTarget.style.borderColor='#E8ECF0'}}>
                  <span style={{ fontSize:16 }}>📄</span>
                  <div style={{ flex:1, minWidth:0 }}>
                    <div style={{ fontSize:13, fontWeight:600, color:'#2A3042', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{n.title||'Untitled'}</div>
                    <div style={{ fontSize:11, color:'#9CA3AF' }}>{new Date(n.updated_at||n.created_at).toLocaleDateString('en-NZ',{day:'numeric',month:'short'})}</div>
                  </div>
                  <span style={{ fontSize:10, padding:'2px 7px', borderRadius:10, background: n.is_public?'#ECFDF5':'#F3F4F6', color: n.is_public?'#065F46':'#6B7280', fontWeight:600, flexShrink:0 }}>
                    {n.is_public ? '🌐' : '🔒'}
                  </span>
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#C4C9D4" strokeWidth="2"><polyline points="9 18 15 12 9 6"/></svg>
                </div>
              ))}
          </div>
        )}
      </div>

      {/* time tracking */}
      <div style={{ background:'#fff', borderRadius:12, border:'1px solid #E8ECF0', boxShadow:'0 1px 3px rgba(0,0,0,0.04)', padding:18, marginBottom:14 }}>
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:14 }}>
          <div style={{ fontSize:11, fontWeight:700, color:'#9CA3AF', textTransform:'uppercase', letterSpacing:'.05em' }}>Time tracking</div>
          <ClockInButton jobId={id} onUpdate={() => setTimeRefresh(r => r+1)} />
        </div>
        <BudgetBar budgetHours={job.budget_hours} loggedHours={job.time_logged} />
        <div style={{ marginTop:14 }}>
          <div style={{ fontSize:11, fontWeight:700, color:'#9CA3AF', textTransform:'uppercase', letterSpacing:'.05em', marginBottom:8 }}>History</div>
          <TimeHistory jobId={id} refreshKey={timeRefresh} />
        </div>
      </div>

      {/* file type selection modal */}
      {showTypeModal && (
        <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.5)', zIndex:500, display:'flex', alignItems:'center', justifyContent:'center', padding:24 }}
          onClick={e => e.target===e.currentTarget && setShowTypeModal(false)}>
          <div style={{ background:'#fff', borderRadius:16, width:'100%', maxWidth:400, boxShadow:'0 20px 60px rgba(0,0,0,0.2)', overflow:'hidden' }}>
            <div style={{ padding:'16px 20px', borderBottom:'1px solid #F3F4F6' }}>
              <h2 style={{ fontSize:15, fontWeight:700, color:'#2A3042', margin:0 }}>Select file type</h2>
              <p style={{ fontSize:12, color:'#9CA3AF', margin:'4px 0 0' }}>{pendingFiles.current.length} file{pendingFiles.current.length!==1?'s':''} ready to upload</p>
            </div>
            <div style={{ padding:16, display:'flex', flexDirection:'column', gap:8 }}>
              {fileTypes.map(ft => (
                <div key={ft.id} onClick={() => uploadFiles(pendingFiles.current, ft.id)}
                  style={{ display:'flex', alignItems:'center', gap:12, padding:'12px 14px', borderRadius:10, border:'1px solid #E8ECF0', cursor:'pointer', transition:'all .1s' }}
                  onMouseEnter={e=>{e.currentTarget.style.background='#F9FAFB';e.currentTarget.style.borderColor=ft.color||'#9CA3AF'}}
                  onMouseLeave={e=>{e.currentTarget.style.background='#fff';e.currentTarget.style.borderColor='#E8ECF0'}}>
                  <div style={{ width:12, height:12, borderRadius:'50%', background:ft.color||'#9CA3AF', flexShrink:0 }} />
                  <div style={{ flex:1 }}>
                    <div style={{ fontSize:14, fontWeight:600, color:'#2A3042' }}>{ft.name}</div>
                    {ft.requires_approval && <div style={{ fontSize:11, color:'#5B8AF0' }}>Requires PM approval</div>}
                  </div>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#C4C9D4" strokeWidth="2"><polyline points="9 18 15 12 9 6"/></svg>
                </div>
              ))}
              <button onClick={() => uploadFiles(pendingFiles.current, '')}
                style={{ padding:'11px', borderRadius:10, border:'1px dashed #E8ECF0', background:'transparent', color:'#9CA3AF', cursor:'pointer', fontSize:13 }}>
                Upload without a type
              </button>
            </div>
          </div>
        </div>
      )}

      {/* drawings */}
      <div style={{ background:"#fff", borderRadius:12, border:"1px solid #E8ECF0", boxShadow:"0 1px 3px rgba(0,0,0,0.04)", padding:18, marginBottom:14 }}>
        <div style={{ fontSize:11, fontWeight:700, color:"#9CA3AF", textTransform:"uppercase", letterSpacing:".05em", marginBottom:12, display:"block" }}>Drawings &amp; files</div>
        {lbIdx !== null && (
          <div className="bg-black/90 rounded-xl p-3 mb-3 flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <span className="text-xs text-white/60 font-mono truncate flex-1">{imgAtts[lbIdx]?.name}</span>
              <div className="flex gap-2 flex-shrink-0">
                <button onClick={() => navigate(`/job/${id}/sketch/${atts.indexOf(imgAtts[lbIdx])}`)} className="text-xs px-3 py-1.5 rounded-lg border border-blue-400 bg-blue-400/30 text-white cursor-pointer">✏️ Edit</button>
                <button onClick={() => window.open(pubUrl(imgAtts[lbIdx]?.storage_path),'_blank')} className="text-xs px-3 py-1.5 rounded-lg border border-white/20 bg-white/10 text-white cursor-pointer">⬇️ Open</button>
                <button onClick={() => setLbIdx(null)} className="text-xs px-3 py-1.5 rounded-lg border border-white/20 bg-white/10 text-white cursor-pointer">Close</button>
                <button onClick={() => deleteAtt(imgAtts[lbIdx])} className="text-xs px-3 py-1.5 rounded-lg border border-red-400/30 bg-red-400/20 text-red-300 cursor-pointer">Delete</button>
              </div>
            </div>
            <img src={pubUrl(imgAtts[lbIdx]?.storage_path)} alt="" className="w-full max-h-[60vh] object-contain rounded-lg" />
            <div className="flex items-center justify-between">
              <button onClick={() => setLbIdx(i => Math.max(0, i-1))} disabled={lbIdx===0} className="text-white/60 hover:text-white disabled:opacity-30 bg-transparent border-none cursor-pointer text-lg">←</button>
              <span className="text-xs text-white/40">{lbIdx+1} / {imgAtts.length}</span>
              <button onClick={() => setLbIdx(i => Math.min(imgAtts.length-1, i+1))} disabled={lbIdx===imgAtts.length-1} className="text-white/60 hover:text-white disabled:opacity-30 bg-transparent border-none cursor-pointer text-lg">→</button>
            </div>
          </div>
        )}
        <div className="relative border-2 border-dashed border-[#E8ECF0] rounded-xl px-4 py-3 text-sm text-[#9CA3AF] text-center cursor-pointer hover:border-gray-300 mb-3">
          <input type="file" accept="image/*,.pdf,.dwg,.dxf" multiple onChange={handleFiles} className="absolute inset-0 opacity-0 cursor-pointer w-full h-full" />
          {uploading ? 'Uploading…' : '📎 Tap to upload — images, PDFs, DWG, DXF'}
        </div>
        {imgAtts.length > 0 && (
          <div className="grid grid-cols-3 gap-2 mb-2">
            {imgAtts.map((a, i) => {
              const ft = fileTypes.find(f => f.id === a.file_type_id)
              const approval = approvals.find(ap => ap.attachment_id === a.id)
              return (
                <div key={a.id} style={{ position:'relative' }}>
                  <div onClick={() => setLbIdx(i)} className="relative aspect-square rounded-lg overflow-hidden border border-[#E8ECF0] cursor-pointer hover:border-gray-300">
                    <img src={pubUrl(a.storage_path)} alt={a.name} className="w-full h-full object-cover" loading="lazy" />
                    {ft && <div style={{ position:'absolute', top:4, left:4, fontSize:9, fontWeight:700, padding:'2px 6px', borderRadius:8, background:ft.color+'ee', color:'#fff' }}>{ft.name}</div>}
                    <div className="absolute bottom-0 left-0 right-0 bg-black/40 px-1.5 py-0.5 text-[9px] text-white truncate">{a.name}</div>
                    <button onClick={e => { e.stopPropagation(); deleteAtt(a) }} className="absolute top-1 right-1 w-5 h-5 rounded-full bg-black/50 text-white flex items-center justify-center text-xs border-none cursor-pointer">×</button>
                  </div>
                  <ApprovalBar att={a} ft={ft} approval={approval} onRequest={() => requestApproval(a)} onReview={reviewApproval} profile={profile} />
                </div>
              )
            })}
          </div>
        )}
        {fileAtts.map(a => {
          const ft = fileTypes.find(f => f.id === a.file_type_id)
          const approval = approvals.find(ap => ap.attachment_id === a.id)
          return (
            <div key={a.id} style={{ marginBottom:8 }}>
              <div onClick={() => window.open(pubUrl(a.storage_path),'_blank')}
                style={{ display:'flex', alignItems:'center', gap:10, padding:'10px 12px', background:'#F9FAFB', border:'1px solid #E8ECF0', borderRadius:10, cursor:'pointer', transition:'all .1s' }}
                onMouseEnter={e=>{e.currentTarget.style.background='#F3F4F6'}} onMouseLeave={e=>{e.currentTarget.style.background='#F9FAFB'}}>
                <span style={{ fontSize:18 }}>📄</span>
                <div style={{ flex:1, minWidth:0 }}>
                  <div style={{ fontSize:13, fontWeight:500, color:'#2A3042', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{a.name}</div>
                  {ft && <div style={{ fontSize:11, fontWeight:600, color:ft.color||'#9CA3AF', marginTop:1 }}>{ft.name}</div>}
                </div>
                <button onClick={e=>{e.stopPropagation();deleteAtt(a)}} style={{ color:'#D1D5DB', background:'none', border:'none', cursor:'pointer', fontSize:18, lineHeight:1 }}>×</button>
              </div>
              <ApprovalBar att={a} ft={ft} approval={approval} onRequest={() => requestApproval(a)} onReview={reviewApproval} profile={profile} />
            </div>
          )
        })}
      </div>

      {/* archive + delete */}
      <div style={{ display:'flex', gap:8, marginBottom:12 }}>
        <button onClick={archiveJob} className="btn btn-red btn-sm">Archive job</button>
      </div>

      {/* delete — admin only */}
      {can('deleteJob') && (
        <div style={{ marginTop:24, paddingTop:20, borderTop:'1px solid #F3F4F6' }}>
          {!showDeleteConfirm ? (
            <button onClick={() => setShowDeleteConfirm(true)}
              style={{ display:'flex', alignItems:'center', gap:8, background:'none', border:'1px solid #FCA5A5', borderRadius:9, padding:'8px 16px', cursor:'pointer', color:'#991B1B', fontSize:13, fontWeight:600, transition:'all .15s' }}
              onMouseEnter={e => { e.currentTarget.style.background='#FEF2F2'; e.currentTarget.style.borderColor='#F87171' }}
              onMouseLeave={e => { e.currentTarget.style.background='none'; e.currentTarget.style.borderColor='#FCA5A5' }}>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4h6v2"/>
              </svg>
              Delete job permanently
            </button>
          ) : (
            <div style={{ background:'#FEF2F2', border:'1px solid #FCA5A5', borderRadius:12, padding:'16px 18px' }}>
              <div style={{ display:'flex', alignItems:'flex-start', gap:12, marginBottom:14 }}>
                <div style={{ width:36, height:36, borderRadius:10, background:'#FEE2E2', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#991B1B" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
                  </svg>
                </div>
                <div>
                  <div style={{ fontSize:14, fontWeight:700, color:'#991B1B', marginBottom:4 }}>Delete "{job.name}"?</div>
                  <div style={{ fontSize:13, color:'#DC2626', lineHeight:1.5 }}>
                    This will permanently delete the job, all tasks, materials, attachments and uploaded files. <strong>This cannot be undone.</strong>
                  </div>
                </div>
              </div>
              <div style={{ display:'flex', gap:8 }}>
                <button onClick={deleteJob}
                  style={{ flex:1, background:'#991B1B', color:'#fff', border:'none', borderRadius:9, padding:'9px 0', fontSize:13, fontWeight:700, cursor:'pointer', transition:'background .15s' }}
                  onMouseEnter={e => e.currentTarget.style.background='#7F1D1D'}
                  onMouseLeave={e => e.currentTarget.style.background='#991B1B'}>
                  Yes, delete permanently
                </button>
                <button onClick={() => setShowDeleteConfirm(false)}
                  style={{ padding:'9px 18px', background:'#fff', border:'1px solid #FCA5A5', borderRadius:9, fontSize:13, fontWeight:600, color:'#6B7280', cursor:'pointer' }}>
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>
      )}
      </div>{/* end left column */}

      {/* RIGHT COLUMN — Rooms / Processes / History */}
      <div style={{ position:'sticky', top:80, maxHeight:'calc(100vh - 96px)', overflowY:'auto', overflowX:'hidden', paddingRight:2 }}>
        <RightPanel
          jobId={id} toast={toast}
          rooms={rooms} onAddRoom={room=>{setRooms(p=>[...p,room]);setActiveRoom(room)}}
          onOpenRoom={room=>setActiveRoom(room)} onRoomsChange={setRooms}
          processes={processes} onProcessesChange={setProcesses}
          timeHistory={timeHistory} onHistoryChange={setTimeHistory}
          profile={profile}
        />
      </div>

      {/* Room detail overlay */}
      {activeRoom && (
        <RoomDetail
          room={activeRoom}
          jobId={id}
          jobMats={jobMats}
          allAppliances={allAppliances}
          onClose={() => setActiveRoom(null)}
          onSave={saved => setRooms(p=>p.map(r=>r.id===saved.id?saved:r))}
        />
      )}
    </div>
    </>
  )
}
