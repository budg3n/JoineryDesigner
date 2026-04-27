import React, { useState, useEffect, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { supabase, BUCKET, pubUrl } from '../lib/supabase'
import { useApp } from '../context/AppContext'
import { useToast } from '../components/Toast'
import BackButton from '../components/BackButton'
import StatusBadge from '../components/StatusBadge'

const TODAY = new Date(); TODAY.setHours(0,0,0,0)
const STATUSES = ['In progress','Review','Complete','On hold']

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
function MaterialSelector({ panelMaterials, specs, onChange }) {
  const parsed = specs ? (typeof specs === 'string' ? JSON.parse(specs) : specs) : {}
  const set = (key, val) => onChange(JSON.stringify({ ...parsed, [key]: val }))

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
              <select value={matId} onChange={e => set(sel.key, e.target.value)}
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
function KitchenSpecs({ specs, onChange, panelMaterials }) {
  const parsed = specs ? (typeof specs === 'string' ? JSON.parse(specs) : specs) : {}
  const set = (key, val) => {
    const updated = { ...parsed, [key]: val }
    onChange(JSON.stringify(updated))
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

      {/* material selectors */}
      <MaterialSelector panelMaterials={panelMaterials} specs={specs} onChange={onChange} />

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

export default function JobDetail() {
  const { id }  = useParams()
  const navigate = useNavigate()
  const toast    = useToast()
  const { can } = useApp()

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
  const [lbIdx, setLbIdx]         = useState(null)
  const [uploading, setUploading] = useState(false)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [dirty, setDirty] = useState(false)

  // Track if all-materials has been fetched yet (lazy)
  const allMatsFetched = React.useRef(false)

  const loadAll = useCallback(async () => {
    // Only fetch what we need to render the page immediately
    // allMats (materials library) is fetched lazily when picker is opened
    const [{ data: j }, { data: a }, { data: jm }, { data: panelMats }] = await Promise.all([
      supabase.from('jobs').select('*').eq('id', id).single(),
      supabase.from('attachments').select('*').eq('job_id', id).order('created_at'),
      supabase.from('job_materials').select('*,materials(*)').eq('job_id', id),
      supabase.from('materials').select('*').order('name'),
    ])
    setJob(j); setAtts(a||[]); setJobMats(jm||[])
    const panelCats = []
    setPanelMaterials((panelMats||[]).filter(m => m.panel_type || m.category_id))
    setTasks(j?.tasks ? JSON.parse(j.tasks) : [])
    setLoading(false)
    setDirty(false)

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
  useEffect(() => {
    window.dispatchEvent(new CustomEvent('job-actions', { detail: {
      dirty,
      saving,
      onSave: saveJob,
      onSketch: () => navigate(`/job/${id}/sketch`),
    }}))
  }, [dirty, saving, id])

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
      notes: job.notes, mvnum: job.mvnum, start_date: job.start_date,
      due_date: job.due_date, budget_hours: job.budget_hours, delivery_address: job.delivery_address,
      kitchen_specs: job.kitchen_specs || null,
    }).eq('id', id)
    setSaving(false)
    if (error) toast(error.message, 'error')
    else { toast('Saved ✓'); setDirty(false) }
  }

  // tasks
  const openTasks  = tasks.filter(t => !t.done)
  const overTasks  = openTasks.filter(t => t.date && dFromNow(t.date, t.time) < 0)
  const sortedTasks = [...tasks].sort((a,b) => {
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
    await saveTasks(tasks.map(t => t.id === tid ? { ...t, done: !t.done } : t))
  }

  async function deleteTask(tid) {
    await saveTasks(tasks.filter(t => t.id !== tid))
  }

  // attachments
  const imgAtts  = atts.filter(a => a.type?.startsWith('image/'))
  const fileAtts = atts.filter(a => !a.type?.startsWith('image/'))

  async function handleFiles(e) {
    setUploading(true)
    for (const file of Array.from(e.target.files)) {
      const path = `${id}/${Date.now()}_${file.name}`
      await supabase.storage.from(BUCKET).upload(path, file, { contentType: file.type })
      const { data } = await supabase.from('attachments').insert({ job_id: id, name: file.name, type: file.type, size: file.size, storage_path: path }).select().single()
      if (data) setAtts(prev => [...prev, data])
    }
    setUploading(false)
    toast('Uploaded ✓')
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
    'Review':      'bg-amber-50 text-amber-700 border-amber-200',
    'Complete':    'bg-teal-50 text-teal-700 border-teal-200',
    'On hold':     'bg-[#F3F4F6] text-[#6B7280] border-[#E8ECF0]',
  }

  const isKitchen = (job.type||'').toLowerCase() === 'kitchen'

  return (
    <div style={{ display: isKitchen ? 'grid' : 'block', gridTemplateColumns: isKitchen ? '1fr 380px' : undefined, gap: isKitchen ? 20 : undefined, alignItems:'start' }}>
      {/* LEFT COLUMN — always shown */}
      <div>
      <BackButton to="/" label="Jobs" />

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
                  <div className={`text-sm ${t.done ? 'line-through text-[#9CA3AF]' : 'text-[#2A3042]'}`}>{t.title}</div>
                  <div className="flex flex-wrap gap-1.5 mt-1"><DueBadge t={t} /></div>
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
          {[['Job name','name','text'],['Client','client','text'],['Microvellum #','mvnum','text'],['Budget hours','budget_hours','number'],['Start date','start_date','date'],['Due date','due_date','date']].map(([l,k,t]) => (
            <div key={k}><label className="label">{l}</label>
              <input className="input text-sm" type={t} value={job[k]||''} onChange={e => { setJob(j => ({ ...j, [k]: e.target.value })); setDirty(true) }} />
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
              <div key={jm.id} className="flex items-center gap-1.5 px-2.5 py-1.5 bg-[#F9FAFB] border border-[#E8ECF0] rounded-lg text-xs">
                <div className="w-3.5 h-3.5 rounded-[3px]" style={{ background: m.color||'#ccc' }} />
                <span className="font-medium text-[#374151]">{m.name}</span>
                <span className="text-[#9CA3AF]">{m.panel_type} {m.thickness ? m.thickness+'mm' : ''}</span>
                <button onClick={() => removeMat(jm.id)} className="text-[#D1D5DB] hover:text-red-400 leading-none bg-transparent border-none cursor-pointer ml-1">×</button>
              </div>
            )
          })}
        </div>
        <button onClick={openMatPicker} className="btn-blue btn-sm">+ Add from library</button>
        {matPickerOpen && (
          <div className="mt-3 grid grid-cols-2 gap-2 max-h-52 overflow-y-auto border-t border-[#F3F4F6] pt-3">
            {availMats.length === 0 ? <div className="col-span-2 text-sm text-[#9CA3AF] text-center py-3">All materials added</div> :
              availMats.map(m => (
                <div key={m.id} onClick={() => addMat(m.id)}
                  className="flex items-center gap-2 p-2 rounded-lg border border-[#E8ECF0] cursor-pointer hover:border-gray-300 bg-white">
                  {m.storage_path
                    ? <img src={pubUrl(m.storage_path)} className="w-7 h-7 rounded object-cover flex-shrink-0" alt="" loading="lazy" />
                    : <div className="w-7 h-7 rounded flex-shrink-0 bg-[#F3F4F6]" />
                  }
                  <div><div className="text-xs font-medium text-[#2A3042] leading-tight">{m.name}</div>
                    <div className="text-[10px] text-[#9CA3AF]">{m.panel_type} {m.thickness ? '· '+m.thickness+'mm' : ''}</div>
                  </div>
                </div>
              ))
            }
          </div>
        )}
      </div>

      {/* drawings */}
      <div style={{ background:"#fff", borderRadius:12, border:"1px solid #E8ECF0", boxShadow:"0 1px 3px rgba(0,0,0,0.04)", padding:18, marginBottom:14 }}>
        <div style={{ fontSize:11, fontWeight:700, color:"#9CA3AF", textTransform:"uppercase", letterSpacing:".05em", marginBottom:12, display:"block" }}>Drawings &amp; sketches</div>
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
            {imgAtts.map((a, i) => (
              <div key={a.id} onClick={() => setLbIdx(i)} className="relative aspect-square rounded-lg overflow-hidden border border-[#E8ECF0] cursor-pointer hover:border-gray-300">
                <img src={pubUrl(a.storage_path)} alt={a.name} className="w-full h-full object-cover" loading="lazy" />
                <div className="absolute bottom-0 left-0 right-0 bg-black/40 px-1.5 py-0.5 text-[9px] text-white truncate">{a.name}</div>
                <button onClick={e => { e.stopPropagation(); deleteAtt(a) }} className="absolute top-1 right-1 w-5 h-5 rounded-full bg-black/50 text-white flex items-center justify-center text-xs border-none cursor-pointer">×</button>
              </div>
            ))}
          </div>
        )}
        {fileAtts.map(a => (
          <div key={a.id} onClick={() => window.open(pubUrl(a.storage_path),'_blank')}
            className="flex items-center gap-2 px-3 py-2.5 bg-[#F9FAFB] border border-[#E8ECF0] rounded-lg cursor-pointer hover:border-gray-300 mb-2">
            <span className="text-base">📄</span>
            <span className="text-sm text-[#6B7280] flex-1 truncate">{a.name}</span>
            <button onClick={e => { e.stopPropagation(); deleteAtt(a) }} className="text-[#D1D5DB] hover:text-red-400 text-base leading-none bg-transparent border-none cursor-pointer">×</button>
          </div>
        ))}
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

      {/* RIGHT COLUMN — kitchen specs panel, sticky alongside content */}
      {isKitchen && (
        <div style={{ position:'sticky', top:80 }}>
          <KitchenSpecs
            specs={job.kitchen_specs}
            panelMaterials={panelMaterials}
            onChange={specs => { setJob(j => ({ ...j, kitchen_specs: specs })); setDirty(true) }}
          />
        </div>
      )}
    </div>
  )
}
