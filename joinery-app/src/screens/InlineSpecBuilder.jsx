import { useState, useEffect, useRef } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { supabase, pubUrl } from '../lib/supabase'
import { useToast } from '../components/Toast'
import { useApp } from '../context/AppContext'
import NewJobModal from '../components/NewJobModal'
import { ALL_FIELDS, DEFAULT_TEMPLATES } from './RoomTypeSettings'

// ── Helpers ───────────────────────────────────────────────────────
function safeJSON(v, fallback={}) { try { return typeof v==='string'?JSON.parse(v):v||fallback } catch { return fallback } }

function Card({ children, style }) {
  return <div style={{ background:'#fff', borderRadius:12, border:'1px solid #E8ECF0', boxShadow:'0 1px 3px rgba(0,0,0,0.04)', ...style }}>{children}</div>
}

function SectionTitle({ children, action }) {
  return (
    <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:12 }}>
      <div style={{ fontSize:11, fontWeight:700, color:'#9CA3AF', textTransform:'uppercase', letterSpacing:'.06em' }}>{children}</div>
      {action}

    </div>
  )
}

function Btn({ onClick, children, variant='default', disabled, style }) {
  const base = { fontSize:13, fontWeight:600, padding:'7px 14px', borderRadius:8, cursor:disabled?'not-allowed':'pointer', opacity:disabled?0.6:1, border:'none', display:'flex', alignItems:'center', gap:6, ...style }
  const v = { default:{background:'#F3F4F6',color:'#374151'}, primary:{background:'#5B8AF0',color:'#fff',boxShadow:'0 2px 6px rgba(91,138,240,0.3)'}, ghost:{background:'none',color:'#6B7280',padding:'4px 8px'}, danger:{background:'#FEF2F2',color:'#E24B4A',border:'1px solid #FCA5A5'} }
  return <button onClick={onClick} disabled={disabled} style={{...base,...v[variant]}}>{children}</button>
}

// ── Picker modal — browse materials/appliances and confirm ─────────
function PickerModal({ type, categories, onConfirm, onClose }) {
  const [allItems, setAllItems] = useState([])
  const [loading, setLoading]  = useState(true)
  const [stack, setStack]      = useState([])
  const [search, setSearch]    = useState('')
  const [selected, setSelected] = useState(null)
  const [note, setNote]        = useState('')
  const [status, setStatus]    = useState('confirmed')

  const catTable  = type === 'material' ? 'material_categories' : 'appliance_categories'
  const itemTable = type === 'material' ? 'materials' : 'appliances'

  useEffect(() => {
    const q = type === 'material'
      ? supabase.from('materials').select('*').order('name')
      : supabase.from('appliances').select('*').order('brand')
    q.then(({ data }) => { setAllItems(data||[]); setLoading(false) })
  }, [type])

  const currentCatId = stack[stack.length-1] || null
  const currentCat   = categories.find(c=>c.id===currentCatId) || null
  const children     = categories.filter(c=>c.parent_id===currentCatId)

  const inCat = allItems.filter(item => {
    if (search) {
      const q = search.toLowerCase()
      if (type==='material') return (item.name||'').toLowerCase().includes(q)||(item.supplier||'').toLowerCase().includes(q)
      return (item.brand||'').toLowerCase().includes(q)||(item.model||'').toLowerCase().includes(q)
    }
    if (!currentCatId) return false
    return item.category_id === currentCatId
  })

  const showItems = search || (currentCatId && children.length === 0)

  function itemLabel(item) {
    return type==='material' ? item.name : `${item.brand} ${item.model}`
  }
  function itemSub(item) {
    return type==='material'
      ? [item.supplier, item.panel_type, item.thickness?item.thickness+'mm':null, item.finish].filter(Boolean).join(' · ')
      : [item.type, item.width?`${item.width}×${item.height}mm`:null].filter(Boolean).join(' · ')
  }

  return (
    <div style={{ position:'fixed', inset:0, zIndex:700, background:'rgba(0,0,0,0.5)', display:'flex', alignItems:'flex-end', justifyContent:'center', padding:16 }}
      onClick={e=>e.target===e.currentTarget&&onClose()}>
      <div style={{ background:'#fff', borderRadius:16, width:'100%', maxWidth:560, maxHeight:'85vh', display:'flex', flexDirection:'column', boxShadow:'0 24px 64px rgba(0,0,0,0.2)' }}>

        {/* Header */}
        <div style={{ padding:'16px 20px', borderBottom:'1px solid #F3F4F6', display:'flex', alignItems:'center', justifyContent:'space-between', flexShrink:0 }}>
          <div>
            <div style={{ fontSize:16, fontWeight:800, color:'#2A3042' }}>
              {selected ? `Confirm ${type}` : `Pick a ${type}`}
            </div>
            {/* Breadcrumb */}
            {!selected && stack.length > 0 && (
              <div style={{ display:'flex', gap:4, marginTop:4, flexWrap:'wrap' }}>
                <button onClick={()=>setStack([])} style={{ background:'none', border:'none', cursor:'pointer', fontSize:12, color:'#6B7280', padding:0 }}>All</button>
                {stack.map((id,i)=>{
                  const cat = categories.find(c=>c.id===id)
                  return cat ? (
                    <span key={id} style={{ display:'flex', alignItems:'center', gap:4 }}>
                      <span style={{ color:'#C4C9D4' }}>›</span>
                      <button onClick={()=>setStack(s=>s.slice(0,i+1))} style={{ background:'none', border:'none', cursor:'pointer', fontSize:12, color:i===stack.length-1?'#2A3042':'#6B7280', fontWeight:i===stack.length-1?700:400, padding:0 }}>{cat.name}</button>
                    </span>
                  ) : null
                })}
              </div>
            )}
          </div>
          <button onClick={onClose} style={{ background:'none', border:'none', cursor:'pointer', color:'#9CA3AF', fontSize:22, lineHeight:1 }}>×</button>
        </div>

        {/* Search */}
        {!selected && (
          <div style={{ padding:'10px 20px', borderBottom:'1px solid #F3F4F6', flexShrink:0 }}>
            <div style={{ position:'relative' }}>
              <svg style={{ position:'absolute', left:10, top:'50%', transform:'translateY(-50%)', color:'#9CA3AF' }} width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
              <input value={search} onChange={e=>{setSearch(e.target.value);if(e.target.value)setStack([])}}
                placeholder={`Search ${type}s…`}
                style={{ width:'100%', padding:'7px 10px 7px 30px', border:'1px solid #E8ECF0', borderRadius:8, fontSize:13, outline:'none', boxSizing:'border-box' }} />
            </div>
          </div>
        )}

        {/* Content */}
        <div style={{ flex:1, overflowY:'auto', padding:'12px 20px' }}>
          {selected ? (
            /* Confirm screen */
            <div>
              <div style={{ display:'flex', gap:14, alignItems:'flex-start', padding:'14px', background:'#F0F4FF', borderRadius:12, border:'1px solid #C4D4F8', marginBottom:16 }}>
                {selected.image_path || selected.storage_path ? (
                  <img src={pubUrl(selected.image_path||selected.storage_path)} style={{ width:64, height:64, borderRadius:10, objectFit:'cover', flexShrink:0 }} alt="" />
                ) : (
                  <div style={{ width:64, height:64, borderRadius:10, background:'#E0E7FF', display:'flex', alignItems:'center', justifyContent:'center', fontSize:28, flexShrink:0 }}>
                    {type==='material'?'🎨':'🔌'}
                  </div>
                )}
                <div style={{ flex:1 }}>
                  <div style={{ fontSize:15, fontWeight:700, color:'#2A3042' }}>{itemLabel(selected)}</div>
                  <div style={{ fontSize:12, color:'#6B7280', marginTop:3 }}>{itemSub(selected)}</div>
                </div>
              </div>
              <label style={{ fontSize:12, fontWeight:600, color:'#6B7280', display:'block', marginBottom:6 }}>Status</label>
              <div style={{ display:'flex', gap:6, marginBottom:14 }}>
                {Object.entries({confirmed:{label:'Confirmed',icon:'✓',color:'#166534',bg:'#DCFCE7',border:'#86EFAC'},maybe:{label:'Maybe',icon:'?',color:'#854D0E',bg:'#FEF9C3',border:'#FDE68A'},alternative:{label:'Alternative',icon:'≈',color:'#3730A3',bg:'#EEF2FF',border:'#C4D4F8'}}).map(([key,cfg])=>(
                  <button key={key} onClick={()=>setStatus(key)}
                    style={{ flex:1, padding:'8px 6px', borderRadius:9, border:`2px solid ${status===key?cfg.border:'#E8ECF0'}`, background:status===key?cfg.bg:'#F9FAFB', color:status===key?cfg.color:'#9CA3AF', cursor:'pointer', fontSize:12, fontWeight:700, display:'flex', alignItems:'center', justifyContent:'center', gap:5 }}>
                    <span>{cfg.icon}</span> {cfg.label}
                  </button>
                ))}
              </div>
              <label style={{ fontSize:12, fontWeight:600, color:'#6B7280', display:'block', marginBottom:6 }}>Notes / specification detail <span style={{ fontWeight:400 }}>(optional)</span></label>
              <textarea value={note} onChange={e=>setNote(e.target.value)} placeholder="e.g. Used on upper cabinet doors, Matt finish preferred…"
                style={{ width:'100%', minHeight:80, padding:'9px 12px', border:'1px solid #E8ECF0', borderRadius:9, fontSize:13, outline:'none', resize:'vertical', fontFamily:'inherit', lineHeight:1.6, boxSizing:'border-box' }} />
              <div style={{ display:'flex', gap:8, marginTop:14 }}>
                <Btn onClick={()=>setSelected(null)}>← Back</Btn>
                <Btn onClick={()=>onConfirm(selected, note, status)} variant="primary" style={{ flex:1, justifyContent:'center' }}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="20 6 9 17 4 12"/></svg>
                  Add to spec
                </Btn>
              </div>
            </div>
          ) : loading ? (
            <div className="spinner" style={{ margin:'30px auto' }} />
          ) : !search && children.length > 0 ? (
            /* Category tiles */
            <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(130px,1fr))', gap:10 }}>
              {children.map(cat=>(
                <div key={cat.id} onClick={()=>setStack(s=>[...s,cat.id])}
                  style={{ background:'#F9FAFB', borderRadius:12, border:'1px solid #E8ECF0', padding:'14px 12px', cursor:'pointer', textAlign:'center', transition:'all .12s' }}
                  onMouseEnter={e=>{e.currentTarget.style.background='#EEF2FF';e.currentTarget.style.borderColor='#C4D4F8'}}
                  onMouseLeave={e=>{e.currentTarget.style.background='#F9FAFB';e.currentTarget.style.borderColor='#E8ECF0'}}>
                  <div style={{ fontSize:26, marginBottom:6 }}>{type==='material'?'🎨':'🔌'}</div>
                  <div style={{ fontSize:12, fontWeight:600, color:'#2A3042' }}>{cat.name}</div>
                  <div style={{ fontSize:10, color:'#9CA3AF', marginTop:2 }}>
                    {categories.filter(c=>c.parent_id===cat.id).length > 0
                      ? `${categories.filter(c=>c.parent_id===cat.id).length} subcategories`
                      : `${allItems.filter(i=>i.category_id===cat.id).length} items`}
                  </div>
                </div>
              ))}
            </div>
          ) : !search && !currentCatId ? (
            /* No category selected yet */
            <div style={{ textAlign:'center', padding:'32px 0', color:'#9CA3AF', fontSize:13 }}>
              Select a category above or search to browse all {type}s
            </div>
          ) : showItems && inCat.length === 0 ? (
            <div style={{ textAlign:'center', padding:'32px 0', color:'#9CA3AF', fontSize:13 }}>No {type}s found</div>
          ) : (
            /* Item list */
            <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
              {inCat.map(item=>(
                <div key={item.id} onClick={()=>setSelected(item)}
                  style={{ display:'flex', alignItems:'center', gap:12, padding:'10px 12px', background:'#F9FAFB', borderRadius:10, border:'1px solid #E8ECF0', cursor:'pointer', transition:'all .1s' }}
                  onMouseEnter={e=>{e.currentTarget.style.background='#EEF2FF';e.currentTarget.style.borderColor='#C4D4F8'}}
                  onMouseLeave={e=>{e.currentTarget.style.background='#F9FAFB';e.currentTarget.style.borderColor='#E8ECF0'}}>
                  {(item.image_path||item.storage_path) ? (
                    <img src={pubUrl(item.image_path||item.storage_path)} style={{ width:44,height:44,borderRadius:8,objectFit:'cover',flexShrink:0,border:'1px solid #E8ECF0' }} alt="" />
                  ) : (
                    <div style={{ width:44,height:44,borderRadius:8,background:item.color||'#F3F4F6',flexShrink:0,display:'flex',alignItems:'center',justifyContent:'center',fontSize:20 }}>
                      {type==='material'?'🎨':'🔌'}
                    </div>
                  )}
                  <div style={{ flex:1, minWidth:0 }}>
                    <div style={{ fontSize:13, fontWeight:600, color:'#2A3042' }}>{itemLabel(item)}</div>
                    <div style={{ fontSize:11, color:'#9CA3AF', marginTop:2 }}>{itemSub(item)}</div>
                  </div>
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#C4C9D4" strokeWidth="2"><polyline points="9 18 15 12 9 6"/></svg>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

    </div>
  )
}

// ── Status config ──────────────────────────────────────────────────
const STATUS_CFG = {
  confirmed:   { label:'Confirmed',   icon:'✓', color:'#166534', bg:'#DCFCE7', border:'#86EFAC' },
  maybe:       { label:'Maybe',       icon:'?', color:'#854D0E', bg:'#FEF9C3', border:'#FDE68A' },
  alternative: { label:'Alternative', icon:'≈', color:'#3730A3', bg:'#EEF2FF', border:'#C4D4F8' },
}

// ── Spec item card ─────────────────────────────────────────────────
function SpecItemCard({ item, onRemove, onStatusChange, type }) {
  const isApp  = type==='appliance'
  const label  = isApp ? `${item.brand||''} ${item.model||''}`.trim() : item.name
  const sub    = isApp
    ? [item.type, item.width?`${item.width}×${item.height}mm`:null].filter(Boolean).join(' · ')
    : [item.supplier, item.panel_type, item.thickness?item.thickness+'mm':null, item.finish].filter(Boolean).join(' · ')
  const status = item._status || 'confirmed'
  const sc     = STATUS_CFG[status] || STATUS_CFG.confirmed

  return (
    <div style={{ display:'flex', gap:12, alignItems:'flex-start', padding:'12px 14px', background:'#F9FAFB', borderRadius:10, border:`1px solid ${sc.border}`, marginBottom:8 }}>
      {(item.image_path||item.storage_path) ? (
        <img src={pubUrl(item.image_path||item.storage_path)} style={{ width:48,height:48,borderRadius:8,objectFit:'cover',flexShrink:0,border:'1px solid #E8ECF0' }} alt="" />
      ) : (
        <div style={{ width:48,height:48,borderRadius:8,background:item.color||'#EEF2FF',flexShrink:0,display:'flex',alignItems:'center',justifyContent:'center',fontSize:22 }}>
          {isApp?'🔌':'🎨'}
        </div>
      )}
      <div style={{ flex:1, minWidth:0 }}>
        <div style={{ fontSize:13, fontWeight:700, color:'#2A3042' }}>{label}</div>
        {sub && <div style={{ fontSize:11, color:'#9CA3AF', marginTop:2 }}>{sub}</div>}
        {item._note && <div style={{ marginTop:6, fontSize:12, color:'#374151', background:'#EEF2FF', borderRadius:6, padding:'5px 8px', borderLeft:'2px solid #5B8AF0' }}>{item._note}</div>}
        {/* Status pills */}
        <div style={{ display:'flex', gap:5, marginTop:8 }}>
          {Object.entries(STATUS_CFG).map(([key,cfg])=>(
            <button key={key} onClick={()=>onStatusChange(key)}
              style={{ fontSize:11, fontWeight:700, padding:'2px 8px', borderRadius:20, border:`1px solid ${status===key?cfg.border:'#E8ECF0'}`, background:status===key?cfg.bg:'transparent', color:status===key?cfg.color:'#9CA3AF', cursor:'pointer' }}>
              {cfg.icon} {cfg.label}
            </button>
          ))}
        </div>
      </div>
      <button onClick={onRemove} style={{ background:'none', border:'none', cursor:'pointer', color:'#D1D5DB', fontSize:16, flexShrink:0, padding:'2px 4px', marginLeft:4 }}
        onMouseEnter={e=>e.currentTarget.style.color='#E24B4A'} onMouseLeave={e=>e.currentTarget.style.color='#D1D5DB'}>×</button>
    </div>
  )
}

// ── Dimension groups matching JobDetail kitchen specs ──────────────
const DIM_GROUPS = [
  { key:'base', label:'Base cabinets', color:'#5B8AF0', bg:'#EEF2FF', fields:[
    { key:'toe_kick_height',  label:'Toe kick',      unit:'mm', placeholder:'150' },
    { key:'base_height',      label:'Height',        unit:'mm', placeholder:'720' },
    { key:'base_depth',       label:'Depth',         unit:'mm', placeholder:'560' },
  ]},
  { key:'upper', label:'Upper cabinets', color:'#1D9E75', bg:'#F0FDF4', fields:[
    { key:'upper_height',     label:'Height',        unit:'mm', placeholder:'700' },
    { key:'upper_depth',      label:'Depth',         unit:'mm', placeholder:'320' },
  ]},
  { key:'tall', label:'Tall cabinets', color:'#EF9F27', bg:'#FEF3C7', fields:[
    { key:'tall_height',      label:'Height',        unit:'mm', placeholder:'2100' },
    { key:'tall_depth',       label:'Depth',         unit:'mm', placeholder:'560' },
  ]},
  { key:'bench', label:'Benchtop', color:'#7F77DD', bg:'#F5F3FF', fields:[
    { key:'bench_thickness',       label:'Thickness',     unit:'mm', placeholder:'40' },
    { key:'bench_overhang_front',  label:'Overhang front',unit:'mm', placeholder:'20' },
    { key:'bench_overhang_side',   label:'Overhang sides',unit:'mm', placeholder:'0'  },
    { key:'bench_material',        label:'Material',      unit:'',   placeholder:'e.g. Stone', text:true },
  ]},
]

// ── Room spec tab ──────────────────────────────────────────────────
function RoomSpec({ room, matCats, appCats, onUpdate }) {
  const [tab, setTab]       = useState('dimensions')
  const [picker, setPicker] = useState(null)
  const toast = useToast()

  const dims       = room.dimensions  || {}
  const materials  = room.materials   || []
  const appliances = room.appliances  || []

  function setDim(key, val) {
    onUpdate({ ...room, dimensions: { ...dims, [key]: val } })
  }

  function addItem(type, item, note, status='confirmed') {
    const entry = { ...item, _note: note||'', _status: status, _addedAt: new Date().toISOString() }
    const key   = type === 'material' ? 'materials' : 'appliances'
    const arr   = type === 'material' ? materials : appliances
    if (arr.some(e=>e.id===item.id&&e._status===status)) { toast(`Already added as ${status}`,'error'); return }
    onUpdate({ ...room, [key]: [...arr, entry] })
    setPicker(null)
    toast('Added to spec ✓')
  }

  function removeItem(type, idx) {
    const key = type === 'material' ? 'materials' : 'appliances'
    const arr = (type === 'material' ? materials : appliances)
    onUpdate({ ...room, [key]: arr.filter((_,i)=>i!==idx) })
  }

  function setItemStatus(type, idx, status) {
    const key = type === 'material' ? 'materials' : 'appliances'
    const arr = (type === 'material' ? materials : appliances).map((e,i)=>i===idx?{...e,_status:status}:e)
    onUpdate({ ...room, [key]: arr })
  }

  // Group items by status for display
  function byStatus(arr) {
    return {
      confirmed:   arr.filter(e=>!e._status||e._status==='confirmed'),
      maybe:       arr.filter(e=>e._status==='maybe'),
      alternative: arr.filter(e=>e._status==='alternative'),
    }
  }

  const TABS = [
    { key:'dimensions', label:'Dimensions' },
    { key:'materials',  label:'Materials',  count:materials.length  },
    { key:'appliances', label:'Appliances', count:appliances.length },
    { key:'notes',      label:'Notes'       },
  ]

  function ItemGroup({ type, arr }) {
    if (arr.length === 0) return null
    const source = type === 'material' ? materials : appliances
    return arr.map((item, i) => {
      const idx = source.indexOf(item)
      return (
        <SpecItemCard key={idx} item={item} type={type}
          onRemove={()=>removeItem(type, idx)}
          onStatusChange={s=>setItemStatus(type, idx, s)} />
      )
    })
  }

  function ItemSection({ type }) {
    const arr = type === 'material' ? materials : appliances
    const groups = byStatus(arr)
    const empty = arr.length === 0
    const label = type === 'material' ? 'material' : 'appliance'
    return (
      <div>
        {empty ? (
          <div style={{ textAlign:'center', padding:'24px 0', color:'#9CA3AF', fontSize:13, background:'#F9FAFB', borderRadius:10, border:'1px dashed #E8ECF0', marginBottom:12 }}>
            No {label}s added yet
          </div>
        ) : (
          <>
            {groups.confirmed.length > 0 && (
              <div style={{ marginBottom:14 }}>
                <div style={{ fontSize:11, fontWeight:700, color:'#166534', textTransform:'uppercase', letterSpacing:'.05em', marginBottom:8, display:'flex', alignItems:'center', gap:5 }}>
                  <span style={{ width:16,height:16,borderRadius:8,background:'#DCFCE7',border:'1px solid #86EFAC',display:'inline-flex',alignItems:'center',justifyContent:'center',fontSize:9,color:'#166534' }}>✓</span>
                  Confirmed
                </div>
                <ItemGroup type={type} arr={groups.confirmed} />
              </div>
            )}
            {groups.maybe.length > 0 && (
              <div style={{ marginBottom:14 }}>
                <div style={{ fontSize:11, fontWeight:700, color:'#854D0E', textTransform:'uppercase', letterSpacing:'.05em', marginBottom:8, display:'flex', alignItems:'center', gap:5 }}>
                  <span style={{ width:16,height:16,borderRadius:8,background:'#FEF9C3',border:'1px solid #FDE68A',display:'inline-flex',alignItems:'center',justifyContent:'center',fontSize:9,color:'#854D0E' }}>?</span>
                  Maybe
                </div>
                <ItemGroup type={type} arr={groups.maybe} />
              </div>
            )}
            {groups.alternative.length > 0 && (
              <div style={{ marginBottom:14 }}>
                <div style={{ fontSize:11, fontWeight:700, color:'#3730A3', textTransform:'uppercase', letterSpacing:'.05em', marginBottom:8, display:'flex', alignItems:'center', gap:5 }}>
                  <span style={{ width:16,height:16,borderRadius:8,background:'#EEF2FF',border:'1px solid #C4D4F8',display:'inline-flex',alignItems:'center',justifyContent:'center',fontSize:9,color:'#3730A3' }}>≈</span>
                  Alternatives
                </div>
                <ItemGroup type={type} arr={groups.alternative} />
              </div>
            )}
          </>
        )}
        <Btn onClick={()=>setPicker(type)} variant="primary" style={{ width:'100%', justifyContent:'center' }}>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
          Add {label} from library
        </Btn>
      </div>
    )
  }

  return (
    <div>
      {/* Tab bar */}
      <div style={{ display:'flex', gap:2, background:'#F3F4F6', borderRadius:10, padding:3, marginBottom:16 }}>
        {TABS.map(t=>(
          <button key={t.key} onClick={()=>setTab(t.key)}
            style={{ flex:1, display:'flex', alignItems:'center', justifyContent:'center', gap:4, padding:'6px 8px', borderRadius:8, border:'none', cursor:'pointer', fontSize:12, fontWeight:tab===t.key?700:500,
              background:tab===t.key?'#fff':'transparent', color:tab===t.key?'#2A3042':'#6B7280',
              boxShadow:tab===t.key?'0 1px 3px rgba(0,0,0,0.1)':'none', whiteSpace:'nowrap' }}>
            {t.label}
            {t.count > 0 && <span style={{ fontSize:10,fontWeight:700,minWidth:16,height:16,borderRadius:8,background:tab===t.key?'#5B8AF0':'#9CA3AF',color:'#fff',display:'flex',alignItems:'center',justifyContent:'center',padding:'0 4px' }}>{t.count}</span>}
          </button>
        ))}
      </div>

      {/* DIMENSIONS */}
      {tab==='dimensions' && (
        <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
          {(() => {
            const templateFields = room._templateFields || null
            const customLabels = room._customFieldLabels || {}
            const standardFields = templateFields
              ? ALL_FIELDS.filter(f=>templateFields.includes(f.key))
              : ALL_FIELDS.filter(f=>['toe_kick_height','base_height','base_depth','upper_height','upper_depth','tall_height','tall_depth','bench_thickness','bench_overhang_front','bench_overhang_side','bench_material'].includes(f.key))
            const customFieldKeys = (templateFields||[]).filter(k => k.startsWith('custom_'))
            const customFieldObjs = customFieldKeys.map(k => ({
              key: k, label: customLabels[k]?.label || k,
              unit: customLabels[k]?.unit || 'mm',
              group: customLabels[k]?.group || (standardFields[0]?.group || 'Custom'),
              text: false,
            }))
            const activeFields = [...standardFields, ...customFieldObjs]

            if (activeFields.length === 0) return (
              <div style={{ textAlign:'center', padding:'24px', color:'#9CA3AF', fontSize:13, background:'#F9FAFB', borderRadius:10, border:'1px dashed #E8ECF0' }}>
                No spec fields for this room type.
              </div>
            )

            const GROUP_STYLE = {
              'Base cabinets':   { color:'#5B8AF0', bg:'#EEF2FF' },
              'Upper cabinets':  { color:'#1D9E75', bg:'#F0FDF4' },
              'Tall cabinets':   { color:'#EF9F27', bg:'#FEF3C7' },
              'Benchtop':        { color:'#7F77DD', bg:'#F5F3FF' },
              'Room dimensions': { color:'#374151', bg:'#F9FAFB' },
              'Wardrobe':        { color:'#EC4899', bg:'#FDF2F8' },
              'Vanity':          { color:'#06B6D4', bg:'#ECFEFF' },
            }

            const groups = {}
            activeFields.forEach(f=>{ if(!groups[f.group])groups[f.group]=[]; groups[f.group].push(f) })

            function removeField(key) {
              const f = ALL_FIELDS.find(f=>f.key===key)
              if (!confirm(`Remove "${f?.label||key}" from this room? You can't undo this.`)) return
              const newFields = (room._templateFields||[]).filter(k=>k!==key)
              const newDims = { ...dims }; delete newDims[key]
              onUpdate({ ...room, _templateFields: newFields, dimensions: newDims })
            }

            return Object.entries(groups).map(([group, fields]) => {
              const gs = GROUP_STYLE[group] || { color:'#374151', bg:'#F9FAFB' }
              return (
                <div key={group} style={{ borderRadius:10, border:'1px solid #E8ECF0', overflow:'hidden' }}>
                  <div style={{ padding:'8px 14px', background:gs.bg, display:'flex', alignItems:'center', gap:8 }}>
                    <div style={{ width:10,height:10,borderRadius:3,background:gs.color,flexShrink:0 }} />
                    <span style={{ fontSize:12, fontWeight:700, color:gs.color, flex:1 }}>{group}</span>
                  </div>
                  <div style={{ padding:'12px 14px', background:'#fff', display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(130px,1fr))', gap:10 }}>
                    {fields.map(f=>(
                      <div key={f.key} style={{ position:'relative' }}>
                        <label style={{ fontSize:11, fontWeight:600, color:'#6B7280', display:'block', marginBottom:4 }}>
                          {room._customFieldLabels?.[f.key]?.label || f.label}
                        </label>
                        <div style={{ position:'relative' }}>
                          {(() => {
                            const unit = f.text ? '' : (room._customFieldLabels?.[f.key]?.unit || f.unit || '')
                            return <>
                              <input type={f.text?'text':'number'} value={dims[f.key]||''} onChange={e=>setDim(f.key,e.target.value)}
                                placeholder="0"
                                style={{ width:'100%', padding:`7px ${unit?'30px':'10px'} 7px 10px`, border:'1px solid #DDE3EC', borderRadius:8, fontSize:13, outline:'none', boxSizing:'border-box' }} />
                              {unit && <span style={{ position:'absolute',right:9,top:'50%',transform:'translateY(-50%)',fontSize:11,color:'#9CA3AF',pointerEvents:'none' }}>{unit}</span>}
                            </>
                          })()}
                        </div>
                        <button onClick={()=>removeField(f.key)} title="Remove this field"
                          style={{ position:'absolute', top:-2, right:-4, background:'#fff', border:'1px solid #E8ECF0', borderRadius:'50%', width:16, height:16, display:'flex', alignItems:'center', justifyContent:'center', cursor:'pointer', fontSize:9, color:'#9CA3AF', padding:0 }}
                          onMouseEnter={e=>{e.currentTarget.style.background='#FEF2F2';e.currentTarget.style.color='#E24B4A';e.currentTarget.style.borderColor='#FCA5A5'}}
                          onMouseLeave={e=>{e.currentTarget.style.background='#fff';e.currentTarget.style.color='#9CA3AF';e.currentTarget.style.borderColor='#E8ECF0'}}>×</button>
                      </div>
                    ))}
                  </div>
                  <TemplateGroupAddField groupLabel={group} gs={gs} dims={dims} onUpdate={onUpdate} room={room} />
                </div>
              )
            })
          })()}
        </div>
      )}

      {tab==='dimensions' && <CustomMeasurements room={room} onUpdate={onUpdate} />}
      {tab==='materials'  && <ItemSection type="material"  />}
      {tab==='appliances' && <ItemSection type="appliance" />}

      {tab==='notes' && (
        <textarea value={room.notes||''} onChange={e=>onUpdate({...room,notes:e.target.value})}
          placeholder="Room-level notes, client preferences, constraints…"
          style={{ width:'100%', minHeight:160, padding:'12px', border:'1px solid #E8ECF0', borderRadius:10, fontSize:13, outline:'none', resize:'vertical', fontFamily:'inherit', lineHeight:1.7, boxSizing:'border-box' }} />
      )}

      {picker && (
        <PickerModal type={picker}
          categories={picker==='material' ? matCats : appCats}
          onConfirm={(item,note,status)=>addItem(picker,item,note,status)}
          onClose={()=>setPicker(null)} />
      )}
    </div>
  )
}


// ── Job Linker ─────────────────────────────────────────────────────
function JobLinker({ jobId, onLink, onCreateJob }) {
  const [jobs, setJobs]       = useState([])
  const [search, setSearch]   = useState('')
  const [loading, setLoading] = useState(true)
  const [open, setOpen]       = useState(false)
  const [linkedJob, setLinkedJob] = useState(null)
  const dropRef = useRef()

  useEffect(() => {
    supabase.from('jobs').select('id,name,job_number,client,customers(first_name,last_name,company),status')
      .neq('status','Complete').order('name')
      .then(({ data }) => { setJobs(data||[]); setLoading(false) })
  }, [])

  useEffect(() => {
    if (jobId && jobs.length) {
      const j = jobs.find(j=>j.id===jobId)
      setLinkedJob(j||null)
    }
  }, [jobId, jobs])

  // Close on outside click
  useEffect(() => {
    const h = e => { if(dropRef.current && !dropRef.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [])

  const filtered = jobs.filter(j => {
    if (!search) return true
    const q = search.toLowerCase()
    return (j.name||'').toLowerCase().includes(q)||
           (j.job_number||'').toLowerCase().includes(q)||
           (j.client||'').toLowerCase().includes(q)
  }).slice(0, 8)

  function jobLabel(j) {
    const customer = j.customers?.company || (j.customers ? `${j.customers.first_name||''} ${j.customers.last_name||''}`.trim() : null) || j.client
    return [j.job_number, j.name?.replace(/^.+?[—–-]{1,2}\s*/,''), customer].filter(Boolean).join(' · ')
  }

  return (
    <div ref={dropRef} style={{ position:'relative' }}>
      {linkedJob ? (
        /* Linked state */
        <div style={{ display:'flex', alignItems:'center', gap:10, padding:'10px 14px', background:'#F0FDF4', borderRadius:10, border:'1px solid #86EFAC' }}>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#1D9E75" strokeWidth="2"><path d="M10 13a5 5 0 007.54.54l3-3a5 5 0 00-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 00-7.54-.54l-3 3a5 5 0 007.07 7.07l1.71-1.71"/></svg>
          <div style={{ flex:1, minWidth:0 }}>
            <div style={{ fontSize:12, fontWeight:600, color:'#065F46' }}>Linked to job</div>
            <div style={{ fontSize:13, fontWeight:700, color:'#2A3042', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{jobLabel(linkedJob)}</div>
          </div>
          <button onClick={()=>{ setLinkedJob(null); onLink(null) }}
            style={{ background:'none', border:'none', cursor:'pointer', color:'#9CA3AF', fontSize:13, fontWeight:600 }}>Change</button>
          <a href={`/job/${linkedJob.id}`} target="_blank" rel="noreferrer"
            style={{ fontSize:12, fontWeight:600, color:'#1D9E75', textDecoration:'none', display:'flex', alignItems:'center', gap:4 }}>
            Open job
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
          </a>
        </div>
      ) : (
        /* Unlinked state */
        <div style={{ display:'flex', gap:8, alignItems:'center' }}>
          <button onClick={()=>setOpen(s=>!s)}
            style={{ flex:1, display:'flex', alignItems:'center', gap:8, padding:'9px 14px', background:'#F9FAFB', border:'1px solid #E8ECF0', borderRadius:9, cursor:'pointer', fontSize:13, color:'#6B7280', textAlign:'left' }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M10 13a5 5 0 007.54.54l3-3a5 5 0 00-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 00-7.54-.54l-3 3a5 5 0 007.07 7.07l1.71-1.71"/></svg>
            <span>Link to an existing job…</span>
          </button>
          <Btn onClick={onCreateJob} variant="primary">+ New job</Btn>
        </div>
      )}

      {/* Dropdown */}
      {open && (
        <div style={{ position:'absolute', top:'calc(100% + 6px)', left:0, right:0, zIndex:200, background:'#fff', borderRadius:12, border:'1px solid #E8ECF0', boxShadow:'0 8px 32px rgba(0,0,0,0.12)', overflow:'hidden' }}>
          <div style={{ padding:'8px 12px', borderBottom:'1px solid #F3F4F6' }}>
            <input autoFocus value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search jobs…"
              style={{ width:'100%', padding:'6px 10px', border:'1px solid #E8ECF0', borderRadius:7, fontSize:13, outline:'none', boxSizing:'border-box' }} />
          </div>
          <div style={{ maxHeight:240, overflowY:'auto' }}>
            {loading ? <div className="spinner" style={{ margin:'16px auto' }} /> :
             filtered.length === 0 ? <div style={{ padding:'16px', textAlign:'center', fontSize:13, color:'#9CA3AF' }}>No jobs found</div> :
             filtered.map(j => (
              <div key={j.id} onClick={()=>{ setLinkedJob(j); onLink(j.id); setOpen(false); setSearch('') }}
                style={{ padding:'10px 14px', cursor:'pointer', borderBottom:'1px solid #F9FAFB', fontSize:13, color:'#374151' }}
                onMouseEnter={e=>e.currentTarget.style.background='#F0F4FF'} onMouseLeave={e=>e.currentTarget.style.background='#fff'}>
                <div style={{ fontWeight:600, color:'#2A3042' }}>{j.name?.replace(/^.+?[—–-]{1,2}\s*/,'') || j.name}</div>
                <div style={{ fontSize:11, color:'#9CA3AF', marginTop:2 }}>
                  {[j.job_number, j.customers?.company||(j.customers?`${j.customers.first_name||''} ${j.customers.last_name||''}`.trim():null)||j.client].filter(Boolean).join(' · ')}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

    </div>
  )
}



// ── Add measurement to a template group ───────────────────────────
function TemplateGroupAddField({ groupLabel, gs, dims, onUpdate, room }) {
  const [adding, setAdding] = useState(false)
  const [label, setLabel]   = useState('')
  const [unit, setUnit]     = useState('mm')

  function add() {
    if (!label.trim()) return
    const key = 'custom_' + Math.random().toString(36).slice(2,8)
    // Add to dimensions with the new key, and track in _templateFields
    const newFields = [...(room._templateFields||[]), key]
    onUpdate({
      ...room,
      _templateFields: newFields,
      dimensions: { ...(room.dimensions||{}), [key]: '' },
      _customFieldLabels: { ...(room._customFieldLabels||{}), [key]: { label: label.trim(), unit: unit, group: groupLabel } },
    })
    setLabel(''); setUnit('mm'); setAdding(false)
  }

  return adding ? (
    <div style={{ display:'flex', gap:6, padding:'10px 12px', background:'#F9FAFB', borderRadius:8, border:`1px dashed ${gs.color}44`, alignItems:'center', flexWrap:'wrap', marginTop:10 }}>
      <div style={{ flex:1, minWidth:140 }}>
        <div style={{ fontSize:10, fontWeight:600, color:'#9CA3AF', marginBottom:3 }}>Measurement name</div>
        <input autoFocus value={label} onChange={e=>setLabel(e.target.value)}
          onKeyDown={e=>{ if(e.key==='Enter')add(); if(e.key==='Escape')setAdding(false) }}
          placeholder="e.g. Floor gap, Cabinet void…"
          style={{ width:'100%', padding:'6px 10px', border:'1px solid #DDE3EC', borderRadius:7, fontSize:12, outline:'none', boxSizing:'border-box' }} />
      </div>
      <div style={{ width:80 }}>
        <div style={{ fontSize:10, fontWeight:600, color:'#9CA3AF', marginBottom:3 }}>Unit</div>
        <select value={unit} onChange={e=>setUnit(e.target.value)}
          style={{ width:'100%', padding:'6px 8px', border:'1px solid #DDE3EC', borderRadius:7, fontSize:12, outline:'none', background:'#fff', boxSizing:'border-box' }}>
          {['mm','m','cm','inch','°','kg','L','pcs'].map(u=><option key={u}>{u}</option>)}
        </select>
      </div>
      <button onClick={add} disabled={!label.trim()}
        style={{ fontSize:12, fontWeight:700, padding:'6px 12px', borderRadius:7, border:'none',
          background:label.trim()?gs.color:'#E8ECF0', color:label.trim()?'#fff':'#9CA3AF', cursor:label.trim()?'pointer':'not-allowed' }}>Add</button>
      <button onClick={()=>setAdding(false)}
        style={{ fontSize:11, padding:'6px 8px', borderRadius:7, border:'1px solid #E8ECF0', background:'#fff', cursor:'pointer', color:'#6B7280' }}>Cancel</button>
    </div>
  ) : (
    <button onClick={()=>setAdding(true)}
      style={{ fontSize:11, fontWeight:700, padding:'5px 10px', borderRadius:7, border:`1px dashed ${gs.color}66`,
        background:'transparent', color:gs.color, cursor:'pointer', display:'flex', alignItems:'center', gap:4, marginTop:8 }}
      onMouseEnter={e=>e.currentTarget.style.background=gs.bg||'#F9FAFB'}
      onMouseLeave={e=>e.currentTarget.style.background='transparent'}>
      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
      Add measurement to {groupLabel}
    </button>
  )
}

// ── Custom measurement group editor ───────────────────────────────────────────
const MEAS_COLORS = [
  { color:'#5B8AF0', bg:'#EEF2FF' },
  { color:'#1D9E75', bg:'#F0FDF4' },
  { color:'#EF9F27', bg:'#FEF3C7' },
  { color:'#E24B4A', bg:'#FEF2F2' },
  { color:'#7F77DD', bg:'#F5F3FF' },
  { color:'#EC4899', bg:'#FDF2F8' },
  { color:'#06B6D4', bg:'#ECFEFF' },
  { color:'#374151', bg:'#F3F4F6' },
  { color:'#F97316', bg:'#FFF7ED' },
  { color:'#8B5CF6', bg:'#F5F3FF' },
]

function uid2() { return Math.random().toString(36).slice(2,8) }

function CustomMeasurements({ room, onUpdate }) {
  const [showAdd, setShowAdd]         = useState(false)
  const [groupName, setGroupName]     = useState('')
  const [groupColor, setGroupColor]   = useState(MEAS_COLORS[0])
  const [addingTo, setAddingTo]       = useState(null)   // groupId currently adding a field to
  const [newFieldLabel, setNewFieldLabel] = useState('')
  const [newFieldUnit, setNewFieldUnit]   = useState('mm')
  const [editingGroup, setEditingGroup]   = useState(null)

  const groups = room.customGroups || []

  function addGroup() {
    if (!groupName.trim()) return
    const g = { id: uid2(), name: groupName.trim(), color: groupColor.color, bg: groupColor.bg, fields: [] }
    const updated = [...groups, g]
    onUpdate({ ...room, customGroups: updated })
    setGroupName(''); setGroupColor(MEAS_COLORS[0]); setShowAdd(false)
    setAddingTo(g.id)   // open the add-field form straight away
  }

  function removeGroup(id) {
    if (!confirm('Remove this measurement group? This can\'t be undone.')) return
    onUpdate({ ...room, customGroups: groups.filter(g=>g.id!==id) })
    if (editingGroup===id) setEditingGroup(null)
    if (addingTo===id) setAddingTo(null)
  }

  function addField(groupId) {
    if (!newFieldLabel.trim()) return
    const updated = groups.map(g => g.id!==groupId ? g : {
      ...g, fields: [...g.fields, { id:uid2(), label:newFieldLabel.trim(), unit:newFieldUnit, value:'' }]
    })
    onUpdate({ ...room, customGroups: updated })
    setNewFieldLabel(''); setNewFieldUnit('mm')
  }

  function removeField(groupId, fieldId) {
    if (!confirm('Remove this measurement?')) return
    const updated = groups.map(g => g.id!==groupId ? g : { ...g, fields: g.fields.filter(f=>f.id!==fieldId) })
    onUpdate({ ...room, customGroups: updated })
  }

  function setFieldValue(groupId, fieldId, value) {
    const updated = groups.map(g => g.id!==groupId ? g : {
      ...g, fields: g.fields.map(f => f.id!==fieldId ? f : { ...f, value })
    })
    onUpdate({ ...room, customGroups: updated })
  }

  function updateGroupName(id, name) {
    const updated = groups.map(g => g.id!==id ? g : { ...g, name })
    onUpdate({ ...room, customGroups: updated })
  }

  return (
    <div style={{ marginTop: groups.length>0 ? 12 : 8 }}>
      {groups.map(g => (
        <div key={g.id} style={{ borderRadius:10, border:'1px solid #E8ECF0', overflow:'hidden', marginBottom:10 }}>
          {/* Group header */}
          <div style={{ padding:'8px 14px', background:g.bg||'#F3F4F6', display:'flex', alignItems:'center', gap:8 }}>
            <div style={{ width:10,height:10,borderRadius:3,background:g.color||'#9CA3AF',flexShrink:0 }} />
            {editingGroup===g.id ? (
              <input autoFocus value={g.name} onChange={e=>updateGroupName(g.id,e.target.value)}
                onBlur={()=>setEditingGroup(null)} onKeyDown={e=>e.key==='Enter'&&setEditingGroup(null)}
                style={{ flex:1, fontSize:12, fontWeight:700, color:g.color, border:'none', background:'transparent', outline:'none', fontFamily:'inherit' }} />
            ) : (
              <span onClick={()=>setEditingGroup(g.id)} title="Click to rename"
                style={{ fontSize:12, fontWeight:700, color:g.color||'#374151', flex:1, cursor:'text' }}>{g.name}</span>
            )}
            <button onClick={()=>removeGroup(g.id)} title="Remove group"
              style={{ background:'none', border:'none', cursor:'pointer', color:'rgba(0,0,0,0.2)', fontSize:15, lineHeight:1, padding:'0 2px' }}
              onMouseEnter={e=>e.currentTarget.style.color='#E24B4A'} onMouseLeave={e=>e.currentTarget.style.color='rgba(0,0,0,0.2)'}>×</button>
          </div>

          {/* Fields */}
          <div style={{ padding:'12px 14px', background:'#fff' }}>
            {g.fields.length === 0 && addingTo !== g.id && (
              <div style={{ fontSize:12, color:'#9CA3AF', marginBottom:10, fontStyle:'italic' }}>No measurements yet</div>
            )}
            {g.fields.length > 0 && (
              <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(130px,1fr))', gap:10, marginBottom:10 }}>
                {g.fields.map(f => (
                  <div key={f.id} style={{ position:'relative' }}>
                    <label style={{ fontSize:11, fontWeight:600, color:'#6B7280', display:'block', marginBottom:4 }}>{f.label}</label>
                    <div style={{ position:'relative' }}>
                      <input type="number" value={f.value||''} onChange={e=>setFieldValue(g.id,f.id,e.target.value)}
                        placeholder={f.unit||''}
                        style={{ width:'100%', padding:`7px ${f.unit?'30px':'10px'} 7px 10px`, border:'1px solid #DDE3EC', borderRadius:8, fontSize:13, outline:'none', boxSizing:'border-box' }} />
                      {f.unit && <span style={{ position:'absolute',right:9,top:'50%',transform:'translateY(-50%)',fontSize:11,color:'#9CA3AF',pointerEvents:'none' }}>{f.unit}</span>}
                    </div>
                    <button onClick={()=>removeField(g.id,f.id)} title="Remove"
                      style={{ position:'absolute',top:-2,right:-4,background:'#fff',border:'1px solid #E8ECF0',borderRadius:'50%',width:16,height:16,display:'flex',alignItems:'center',justifyContent:'center',cursor:'pointer',fontSize:9,color:'#9CA3AF',padding:0 }}
                      onMouseEnter={e=>{e.currentTarget.style.background='#FEF2F2';e.currentTarget.style.color='#E24B4A';e.currentTarget.style.borderColor='#FCA5A5'}}
                      onMouseLeave={e=>{e.currentTarget.style.background='#fff';e.currentTarget.style.color='#9CA3AF';e.currentTarget.style.borderColor='#E8ECF0'}}>×</button>
                  </div>
                ))}
              </div>
            )}

            {/* Inline add field form — always accessible */}
            {addingTo === g.id ? (
              <div style={{ display:'flex', gap:6, padding:'10px 12px', background:'#F9FAFB', borderRadius:8, border:`1px solid ${g.color}44`, alignItems:'center', flexWrap:'wrap' }}>
                <input autoFocus value={newFieldLabel} onChange={e=>setNewFieldLabel(e.target.value)}
                  onKeyDown={e=>{ if(e.key==='Enter')addField(g.id); if(e.key==='Escape'){setAddingTo(null);setNewFieldLabel('');setNewFieldUnit('mm')} }}
                  placeholder="e.g. Floor gap, Cabinet void, Ceiling height…"
                  style={{ flex:1, minWidth:140, padding:'6px 10px', border:'1px solid #DDE3EC', borderRadius:7, fontSize:12, outline:'none' }} />
                <select value={newFieldUnit} onChange={e=>setNewFieldUnit(e.target.value)}
                  style={{ width:72, padding:'6px 6px', border:'1px solid #DDE3EC', borderRadius:7, fontSize:12, outline:'none', background:'#fff' }}>
                  {['mm','m','cm','inch','°','kg','L','pcs'].map(u=><option key={u}>{u}</option>)}
                </select>
                <button onClick={()=>addField(g.id)} disabled={!newFieldLabel.trim()}
                  style={{ fontSize:12, fontWeight:700, padding:'6px 12px', borderRadius:7, border:'none',
                    background:newFieldLabel.trim()?g.color:'#E8ECF0', color:newFieldLabel.trim()?'#fff':'#9CA3AF',
                    cursor:newFieldLabel.trim()?'pointer':'not-allowed' }}>Add</button>
                <button onClick={()=>{setAddingTo(null);setNewFieldLabel('');setNewFieldUnit('mm')}}
                  style={{ fontSize:11, padding:'6px 8px', borderRadius:7, border:'1px solid #E8ECF0', background:'#fff', cursor:'pointer', color:'#6B7280' }}>Cancel</button>
              </div>
            ) : (
              <button onClick={()=>{setAddingTo(g.id);setNewFieldLabel('');setNewFieldUnit('mm')}}
                style={{ fontSize:11, fontWeight:700, padding:'5px 10px', borderRadius:7, border:`1px dashed ${g.color}66`,
                  background:'transparent', color:g.color, cursor:'pointer', display:'flex', alignItems:'center', gap:4 }}
                onMouseEnter={e=>e.currentTarget.style.background=g.bg||'#F9FAFB'}
                onMouseLeave={e=>e.currentTarget.style.background='transparent'}>
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                Add measurement
              </button>
            )}
          </div>
        </div>
      ))}

      {/* Add custom group button / form */}
      {!showAdd ? (
        <button onClick={()=>setShowAdd(true)}
          style={{ width:'100%', padding:'9px 0', borderRadius:9, border:'1.5px dashed #C4D4F8', background:'transparent',
            color:'#5B8AF0', fontSize:12, fontWeight:700, cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', gap:5 }}
          onMouseEnter={e=>e.currentTarget.style.background='#EEF2FF'}
          onMouseLeave={e=>e.currentTarget.style.background='transparent'}>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
          Add custom measurement group
        </button>
      ) : (
        <div style={{ padding:'14px 16px', background:'#F8FAFF', borderRadius:10, border:'1px solid #C4D4F8' }}>
          <div style={{ fontSize:12, fontWeight:700, color:'#2A3042', marginBottom:10 }}>New measurement group</div>
          <div style={{ display:'flex', gap:8, marginBottom:12 }}>
            <input autoFocus value={groupName} onChange={e=>setGroupName(e.target.value)}
              onKeyDown={e=>e.key==='Enter'&&addGroup()}
              placeholder="e.g. Island, Void measurements, Floor gaps"
              style={{ flex:1, padding:'8px 12px', border:'1px solid #DDE3EC', borderRadius:8, fontSize:13, outline:'none' }} />
          </div>
          <div style={{ marginBottom:12 }}>
            <div style={{ fontSize:11, fontWeight:600, color:'#6B7280', marginBottom:7 }}>Colour</div>
            <div style={{ display:'flex', gap:7, flexWrap:'wrap' }}>
              {MEAS_COLORS.map((mc,i) => (
                <button key={i} onClick={()=>setGroupColor(mc)}
                  style={{ width:28, height:28, borderRadius:'50%', background:mc.color,
                    border:`3px solid ${groupColor===mc?'#2A3042':'transparent'}`, cursor:'pointer', padding:0 }} />
              ))}
            </div>
          </div>
          {/* Preview */}
          <div style={{ padding:'6px 12px', background:groupColor.bg, borderRadius:7, marginBottom:12, display:'flex', alignItems:'center', gap:6 }}>
            <div style={{ width:8,height:8,borderRadius:2,background:groupColor.color }} />
            <span style={{ fontSize:12, fontWeight:700, color:groupColor.color }}>{groupName||'Group name'}</span>
          </div>
          <div style={{ display:'flex', gap:7 }}>
            <button onClick={addGroup} disabled={!groupName.trim()}
              style={{ fontSize:12, fontWeight:700, padding:'7px 16px', borderRadius:8, border:'none',
                background:groupName.trim()?'#5B8AF0':'#E8ECF0', color:groupName.trim()?'#fff':'#9CA3AF', cursor:groupName.trim()?'pointer':'not-allowed' }}>
              Create group
            </button>
            <button onClick={()=>{setShowAdd(false);setGroupName('');setGroupColor(MEAS_COLORS[0])}}
              style={{ fontSize:12, fontWeight:600, padding:'7px 12px', borderRadius:8, border:'1px solid #E8ECF0', background:'#fff', cursor:'pointer', color:'#6B7280' }}>
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  )
}


// ── InlineSpecBuilder — embedded in JobDetail specs tab ──────────
export default function InlineSpecBuilder({ specId, jobId, onBack }) {
  const toast    = useToast()
  const { profile } = useApp()

  const [spec, setSpec]         = useState(null)
  const [loading, setLoading]   = useState(true)
  const [saving, setSaving]     = useState(false)
  const [matCats, setMatCats]   = useState([])
  const [appCats, setAppCats]   = useState([])
  const [activeRoom, setActiveRoom]   = useState(0)
  const [showAddRoom, setShowAddRoom] = useState(false)
  const [newRoomName, setNewRoomName] = useState('')
  const [roomTemplates, setRoomTemplates] = useState(DEFAULT_TEMPLATES)
  const saveTimer = useRef()

  useEffect(() => {
    supabase.from('app_settings').select('value').eq('key','room_type_templates').maybeSingle()
      .then(({data})=>{ if(data?.value){const v=typeof data.value==='string'?JSON.parse(data.value):data.value;if(Array.isArray(v)&&v.length)setRoomTemplates(v)} })
    Promise.all([
      supabase.from('material_categories').select('id,name,parent_id').order('name'),
      supabase.from('appliance_categories').select('id,name,parent_id').order('name'),
    ]).then(([{data:mc},{data:ac}]) => { setMatCats(mc||[]); setAppCats(ac||[]) })

    supabase.from('specs').select('*').eq('id', specId).single()
      .then(async ({data, error}) => {
        if (error || !data) { toast('Could not load spec','error'); onBack(); return }
        const rooms = safeJSON(data.rooms, [])
        // Import job rooms if spec has none yet
        if (data.job_id && rooms.length === 0) {
          const { data: jobRooms } = await supabase.from('rooms').select('*').eq('job_id', data.job_id).order('sort_order')
          if (jobRooms?.length) {
            const imported = jobRooms.map(jr => ({ id:jr.id, name:jr.name, materials:[], appliances:[], notes:jr.notes||'', _fromJob:true }))
            setSpec({ ...data, rooms: imported })
            setLoading(false); return
          }
        }
        setSpec({ ...data, rooms })
        setLoading(false)
      })
  }, [specId])

  function autoSave(updated) {
    clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(() => saveSpec(updated), 1500)
  }

  async function saveSpec(s) {
    if (!s) return
    setSaving(true)
    try {
      const row = {
        title:      s.title || 'New spec',
        client:     s.client || null,
        status:     s.status || 'Draft',
        rooms:      JSON.stringify(s.rooms || []),
        notes:      s.notes || null,
        job_id:     s.job_id || jobId || null,
        updated_at: new Date().toISOString(),
      }
      const { error } = await supabase.from('specs').update(row).eq('id', s.id)
      if (error) throw error
    } catch(e) { toast('Save failed: ' + e.message, 'error') }
    setSaving(false)
  }

  function updateSpec(patch) {
    const updated = { ...spec, ...patch }
    setSpec(updated)
    autoSave(updated)
  }

  function updateRoom(idx, room) {
    updateSpec({ rooms: spec.rooms.map((r,i)=>i===idx?room:r) })
  }

  function addRoom(template) {
    const name = template ? template.name : newRoomName.trim()
    if (!name) return
    const dimensions = template
      ? Object.fromEntries((template.fields||[]).map(k=>[k,'']))
      : {}
    const room = {
      id: Date.now().toString(), name,
      materials:[], appliances:[], notes:'',
      dimensions,
      _templateId:     template?.id || null,
      _templateFields: template ? [...(template.fields||[])] : [],
    }
    const rooms = [...spec.rooms, room]
    updateSpec({ rooms })
    setActiveRoom(rooms.length - 1)
    setNewRoomName(''); setShowAddRoom(false)
    toast(`${name} added ✓`)
  }

  function removeRoom(idx) {
    if (!confirm(`Remove "${spec.rooms[idx].name}" from this spec?`)) return
    const rooms = spec.rooms.filter((_,i)=>i!==idx)
    updateSpec({ rooms })
    setActiveRoom(Math.max(0, Math.min(activeRoom, rooms.length-1)))
  }

  async function downloadPDF() {
    const rooms = spec.rooms || []
    const date  = new Date().toLocaleDateString('en-NZ', { day:'numeric', month:'long', year:'numeric' })

    const DIM_LABELS = {
      toe_kick_height:'Toe kick', base_height:'Base height', base_depth:'Base depth',
      upper_height:'Upper height', upper_depth:'Upper depth', tall_height:'Tall height',
      tall_depth:'Tall depth', bench_thickness:'Bench thickness',
      bench_overhang_front:'Overhang front', bench_overhang_side:'Overhang sides',
      bench_material:'Bench material', room_width:'Room width', room_height:'Room height',
      room_depth:'Room depth', wardrobe_height:'Wardrobe height', wardrobe_depth:'Wardrobe depth',
      wardrobe_width:'Wardrobe width', vanity_height:'Vanity height', vanity_depth:'Vanity depth',
    }

    function imgUrl(item) {
      const path = item.image_path || item.storage_path
      if (!path) return null
      if (path.startsWith('http')) return path
      return supabase.storage.from('job-files').getPublicUrl(path).data.publicUrl
    }

    function matRow(m) {
      const tags=[m.supplier,m.panel_type,m.thickness?m.thickness+'mm':null,m.colour_code,m.finish].filter(Boolean).join(' · ')
      const url=imgUrl(m)
      const img=url?`<img src="${url}" width="48" height="48" style="object-fit:cover;border-radius:6px;border:1px solid #ddd;flex-shrink:0" />`:`<div style="width:48px;height:48px;border-radius:6px;background:#eee;border:1px solid #ddd;flex-shrink:0"></div>`
      return `<div class="item-row">${img}<div class="item-body"><div class="item-name">${m.name||'—'}</div>${tags?`<div class="item-sub">${tags}</div>`:''} ${m._note?`<div class="item-note">${m._note}</div>`:''}</div></div>`
    }

    function appRow(a) {
      const name=[a.brand,a.model].filter(Boolean).join(' ')||'—'
      const sub=[a.type,a.width?`${a.width}x${a.height}mm`:null].filter(Boolean).join(' · ')
      const url=imgUrl(a)
      const img=url?`<img src="${url}" width="48" height="48" style="object-fit:cover;border-radius:6px;border:1px solid #ddd;flex-shrink:0" />`:`<div style="width:48px;height:48px;border-radius:6px;background:#f0f0f0;border:1px solid #ddd;flex-shrink:0;display:flex;align-items:center;justify-content:center;font-size:20px">🔌</div>`
      return `<div class="item-row">${img}<div class="item-body"><div class="item-name">${name}</div>${sub?`<div class="item-sub">${sub}</div>`:''} ${a._note?`<div class="item-note">${a._note}</div>`:''}</div></div>`
    }

    function statusSection(label,color,items,rowFn) {
      if(!items.length)return ''
      return `<div class="status-group"><div class="status-label" style="color:${color}">${label}</div>${items.map(rowFn).join('')}</div>`
    }

    function itemsByStatus(arr) {
      const g={confirmed:[],maybe:[],alternative:[]}
      arr.forEach(e=>{const s=e._status||'confirmed';(g[s]||g.confirmed).push(e)})
      return g
    }

    const roomSections=rooms.map(room=>{
      const mats=room.materials||[], apps=room.appliances||[], dims=room.dimensions||{}
      const customGroups=room.customGroups||[]
      const hasDims=Object.entries(dims).some(([,v])=>v)
      const hasCustom=customGroups.some(g=>g.fields?.some(f=>f.value))
      const matG=itemsByStatus(mats), appG=itemsByStatus(apps)

      const dimPills=Object.entries(dims).filter(([,v])=>v).map(([k,v])=>{
        const label = DIM_LABELS[k] || room._customFieldLabels?.[k]?.label || k
        const unit  = room._customFieldLabels?.[k]?.unit ?? (k==='bench_material' ? '' : 'mm')
        return `<div class="dim-pill"><span class="dim-key">${label}</span><strong>${v}${unit}</strong></div>`
      }).join('')

      const customHTML=customGroups.filter(g=>g.fields?.some(f=>f.value)).map(g=>
        `<div class="custom-group"><div class="custom-group-header" style="border-left:3px solid ${g.color||'#9CA3AF'}"><span style="color:${g.color||'#374151'};font-weight:700;font-size:11px;text-transform:uppercase;letter-spacing:.05em">${g.name}</span></div><div class="dim-row">${g.fields.filter(f=>f.value).map(f=>`<div class="dim-pill"><span class="dim-key">${f.label}</span><strong>${f.value}${f.unit||''}</strong></div>`).join('')}</div></div>`
      ).join('')

      return `<div class="room-section">
        <div class="room-header"><div class="room-name">${room.name}</div><div class="room-meta">${mats.length} material${mats.length!==1?'s':''} · ${apps.length} appliance${apps.length!==1?'s':''}</div></div>
        ${hasDims?`<div class="section-label">Dimensions</div><div class="dim-row">${dimPills}</div>`:''}
        ${hasCustom?customHTML:''}
        ${mats.length?`<div class="section-label">Materials</div>${statusSection('✓ Confirmed','#166534',matG.confirmed,matRow)}${statusSection('? Maybe','#854D0E',matG.maybe,matRow)}${statusSection('≈ Alternatives','#3730A3',matG.alternative,matRow)}`:''}
        ${apps.length?`<div class="section-label" style="margin-top:14px">Appliances</div>${statusSection('✓ Confirmed','#166534',appG.confirmed,appRow)}${statusSection('? Maybe','#854D0E',appG.maybe,appRow)}${statusSection('≈ Alternatives','#3730A3',appG.alternative,appRow)}`:''}
        ${room.notes?`<div class="notes-box"><strong>Notes:</strong> ${room.notes}</div>`:''}
      </div>`
    }).join('')

    const totalMats=rooms.reduce((s,r)=>s+(r.materials||[]).length,0)
    const totalApps=rooms.reduce((s,r)=>s+(r.appliances||[]).length,0)

    const html=`<!DOCTYPE html><html><head><meta charset="utf-8">
<title>${spec.title||'Spec'} — ${date}</title>
<style>
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0;-webkit-print-color-adjust:exact;print-color-adjust:exact}
body{font-family:-apple-system,BlinkMacSystemFont,'Helvetica Neue',Arial,sans-serif;color:#111;background:#fff;max-width:820px;margin:0 auto;padding:40px}
.header{display:flex;justify-content:space-between;align-items:flex-start;border-bottom:2.5px solid #000;padding-bottom:16px;margin-bottom:20px}
.header-right{text-align:right}
h1{font-size:26px;font-weight:800;margin-bottom:4px}
.sub{font-size:14px;color:#555;margin-bottom:12px}
.status-badge{display:inline-block;font-size:10px;font-weight:700;padding:3px 10px;border-radius:20px;background:#e8e8e8;color:#000;margin-bottom:4px}
.header-date{font-size:12px;color:#555}
.stats{display:flex;gap:24px;margin-top:12px}
.stat-num{font-size:22px;font-weight:800}
.stat-lbl{font-size:11px;color:#555;margin-left:3px}
.room-section{margin-bottom:36px;page-break-inside:avoid}
.room-header{display:flex;align-items:baseline;justify-content:space-between;padding-bottom:7px;border-bottom:2px solid #000;margin-bottom:12px}
.room-name{font-size:17px;font-weight:800}
.room-meta{font-size:11px;color:#666}
.section-label{font-size:9px;font-weight:800;color:#888;text-transform:uppercase;letter-spacing:.07em;margin:12px 0 7px}
.dim-row{display:flex;flex-wrap:wrap;gap:7px;margin-bottom:10px}
.dim-pill{background:#f4f4f4;border:1px solid #ddd;border-radius:6px;padding:5px 10px;font-size:12px}
.dim-key{color:#666;margin-right:4px}
.custom-group{margin-bottom:10px}
.custom-group-header{padding:4px 10px;margin-bottom:7px;background:#f9f9f9;border-radius:4px}
.status-group{margin-bottom:6px}
.status-label{font-size:9px;font-weight:800;text-transform:uppercase;letter-spacing:.06em;margin:8px 0 5px}
.item-row{display:flex;gap:10px;align-items:flex-start;padding:9px 10px;background:#f8f8f8;border:1px solid #e8e8e8;border-radius:7px;margin-bottom:6px}
.item-body{flex:1;min-width:0}
.item-name{font-size:13px;font-weight:600}
.item-sub{font-size:11px;color:#555;margin-top:2px}
.item-note{font-size:11px;background:#e8eeff;border-left:2px solid #5B8AF0;border-radius:3px;padding:4px 8px;margin-top:5px}
.notes-box{font-size:12px;background:#fffbeb;border-left:3px solid #f59e0b;padding:8px 12px;border-radius:4px;margin-top:10px}
.footer{margin-top:32px;padding-top:12px;border-top:1px solid #ddd;display:flex;justify-content:space-between;font-size:10px;color:#888}
@media print{body{padding:0}}@page{margin:15mm;size:A4}body{font-family:-apple-system,BlinkMacSystemFont,'Helvetica Neue',Arial,sans-serif;font-size:10px;color:#111;padding:15mm;background:#fff}
</style></head><body>
<div class="header"><div><h1>${spec.title||'Untitled Spec'}</h1>${spec.client?`<div class="sub">${spec.client}</div>`:''}<div class="stats"><div><span class="stat-num">${rooms.length}</span><span class="stat-lbl">rooms</span></div><div><span class="stat-num">${totalMats}</span><span class="stat-lbl">materials</span></div><div><span class="stat-num">${totalApps}</span><span class="stat-lbl">appliances</span></div></div></div><div class="header-right"><div class="status-badge">${spec.status||'Draft'}</div><div class="header-date">${date}</div></div></div>
${roomSections}
<div class="footer"><span>${spec.title||'Spec'}</span><span>${date}</span></div>
</body></html>`

    const blob=new Blob([html],{type:'text/html;charset=utf-8'})
    const url=URL.createObjectURL(blob)
    const win=window.open(url,'_blank')
    if(!win){
      const a=document.createElement('a'); a.href=url; a.download=`${(spec.title||'spec').replace(/\s+/g,'-')}.html`; a.click()
      toast('Popup blocked — file saved. Open it and use File › Print to export as PDF.')
    } else {
      setTimeout(()=>URL.revokeObjectURL(url),30000)
    }
  }

  async function submitToSetout() {
    if (!spec?.id) return
    const jobIdToUse = spec.job_id || jobId
    if (!jobIdToUse) { toast('No job linked', 'error'); return }
    try {
      const { data: existingRooms, error: roomsErr } = await supabase.from('rooms').select('id,name,notes').eq('job_id', jobIdToUse)
      if (roomsErr) throw new Error('Could not load job rooms: ' + roomsErr.message)
      const existingMap = Object.fromEntries((existingRooms||[]).map(r=>[r.id,r]))
      for (const room of spec.rooms||[]) {
        const dims = room.dimensions||{}
        const kitchen_specs = Object.values(dims).some(v=>v) ? JSON.stringify(dims) : null
        const confirmedMats = (room.materials||[]).filter(m=>!m._status||m._status==='confirmed')
        const maybeMats     = (room.materials||[]).filter(m=>m._status==='maybe'||m._status==='alternative')
        const confirmedApps = (room.appliances||[]).filter(a=>!a._status||a._status==='confirmed')
        const maybeApps     = (room.appliances||[]).filter(a=>a._status==='maybe'||a._status==='alternative')
        const lines=[]
        if(confirmedMats.length) lines.push(`✓ Materials: ${confirmedMats.map(m=>m.name||m.brand||''). filter(Boolean).join(', ')}`)
        if(confirmedApps.length) lines.push(`✓ Appliances: ${confirmedApps.map(a=>`${a.brand||''} ${a.model||''}`.trim()).filter(Boolean).join(', ')}`)
        if(maybeMats.length)     lines.push(`? Maybe: ${maybeMats.map(m=>m.name||m.brand||'').filter(Boolean).join(', ')}`)
        if(maybeApps.length)     lines.push(`? Maybe: ${maybeApps.map(a=>`${a.brand||''} ${a.model||''}`.trim()).filter(Boolean).join(', ')}`)
        if(room.notes)           lines.push(`Notes: ${room.notes}`)
        const spec_notes = lines.length ? `[From spec: ${spec.title}]\n${lines.join('\n')}` : null
        const matchedRoom = (room.id && existingMap[room.id]) || (existingRooms||[]).find(r=>r.name.toLowerCase()===room.name.toLowerCase())
        if (matchedRoom) {
          const currentNotes=matchedRoom.notes||''
          const specTag=`[From spec: ${spec.title}]`
          const baseNotes=currentNotes.includes(specTag)?currentNotes.substring(0,currentNotes.indexOf(specTag)).trim():currentNotes
          const newNotes=spec_notes?(baseNotes?`${baseNotes}\n\n${spec_notes}`:spec_notes):(baseNotes||null)
          await supabase.from('rooms').update({kitchen_specs,notes:newNotes}).eq('id',matchedRoom.id)
          if(confirmedMats.length){const{data:ex}=await supabase.from('room_materials').select('material_id').eq('room_id',matchedRoom.id);const eIds=new Set((ex||[]).map(r=>r.material_id));const ins=confirmedMats.filter(m=>m.id&&!eIds.has(m.id)).map(m=>({room_id:matchedRoom.id,material_id:m.id}));if(ins.length)await supabase.from('room_materials').insert(ins)}
          if(confirmedApps.length){const{data:ex}=await supabase.from('room_appliances').select('appliance_id').eq('room_id',matchedRoom.id);const eIds=new Set((ex||[]).map(r=>r.appliance_id));const ins=confirmedApps.filter(a=>a.id&&!eIds.has(a.id)).map(a=>({room_id:matchedRoom.id,appliance_id:a.id}));if(ins.length)await supabase.from('room_appliances').insert(ins)}
        } else {
          const{error:ie}=await supabase.from('rooms').insert({job_id:jobIdToUse,name:room.name,type:'Kitchen',sort_order:999,tasks:'[]',kitchen_specs,notes:spec_notes})
          if(!ie && confirmedMats.length){
            const{data:nr}=await supabase.from('rooms').select('id').eq('job_id',jobIdToUse).eq('name',room.name).order('created_at',{ascending:false}).limit(1).single()
            if(nr){
              if(confirmedMats.length)await supabase.from('room_materials').insert(confirmedMats.filter(m=>m.id).map(m=>({room_id:nr.id,material_id:m.id})))
              if(confirmedApps.length)await supabase.from('room_appliances').insert(confirmedApps.filter(a=>a.id).map(a=>({room_id:nr.id,appliance_id:a.id})))
            }
          }
        }
      }
      await supabase.from('specs').update({status:'Submitted',submitted_at:new Date().toISOString()}).eq('id',spec.id)
      setSpec(p=>({...p,status:'Submitted'}))
      toast('Submitted ✓ — data pushed to job rooms')
    } catch(e) { toast('Submit failed: '+e.message,'error') }
  }

  if (loading) return <div style={{ display:'flex', justifyContent:'center', padding:'40px 0' }}><div className="spinner" /></div>
  if (!spec) return null

  const canSubmit = spec.rooms.length > 0 && spec.rooms.some(r=>(r.materials||[]).length+(r.appliances||[]).length > 0)

  return (
    <div>
      {/* Header */}
      <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:14, flexWrap:'wrap' }}>
        <input value={spec.title} onChange={e=>updateSpec({title:e.target.value})}
          style={{ fontSize:15, fontWeight:700, color:'#2A3042', border:'none', outline:'none', background:'transparent', fontFamily:'inherit', flex:1, minWidth:120 }} />
        <div style={{ display:'flex', gap:6, alignItems:'center', marginLeft:'auto', flexShrink:0 }}>
          <span style={{ fontSize:11, fontWeight:700, padding:'3px 10px', borderRadius:20,
            background: spec.status==='Submitted'?'#DCFCE7':'#F3F4F6',
            color: spec.status==='Submitted'?'#166534':'#6B7280' }}>{spec.status||'Draft'}</span>
          {saving && <span style={{ fontSize:11, color:'#9CA3AF' }}>Saving…</span>}
          {!saving && <span style={{ fontSize:11, color:'#1D9E75', fontWeight:600 }}>✓ Saved</span>}
          <button onClick={downloadPDF} style={{ fontSize:12, fontWeight:600, padding:'5px 10px', borderRadius:7, border:'1px solid #E8ECF0', background:'#F9FAFB', cursor:'pointer', color:'#374151', display:'flex', alignItems:'center', gap:4 }}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
            PDF
          </button>
          <button onClick={()=>{ clearTimeout(saveTimer.current); saveSpec(spec) }} style={{ fontSize:12, fontWeight:600, padding:'5px 10px', borderRadius:7, border:'1px solid #E8ECF0', background:'#F9FAFB', cursor:'pointer', color:'#374151' }}>Save</button>
          <button onClick={submitToSetout} disabled={!canSubmit}
            style={{ fontSize:12, fontWeight:700, padding:'5px 12px', borderRadius:7, border:'none', background: canSubmit?'#5B8AF0':'#E8ECF0', color: canSubmit?'#fff':'#9CA3AF', cursor: canSubmit?'pointer':'not-allowed' }}>
            {spec.status==='Submitted'?'↑ Resubmit':'Submit to Setout'}
          </button>
        </div>
      </div>

      {/* Room tabs */}
      {spec.rooms.length === 0 && !showAddRoom ? (
        <div style={{ textAlign:'center', padding:'32px 16px', background:'#F9FAFB', borderRadius:12, border:'1px dashed #E8ECF0', marginBottom:14 }}>
          <div style={{ fontSize:24, marginBottom:8 }}>🏠</div>
          <div style={{ fontSize:13, fontWeight:600, color:'#374151', marginBottom:12 }}>No rooms yet</div>
          <button onClick={()=>setShowAddRoom(true)} style={{ fontSize:12, fontWeight:700, padding:'7px 14px', borderRadius:8, border:'none', background:'#5B8AF0', color:'#fff', cursor:'pointer' }}>+ Add room</button>
        </div>
      ) : (
        <div style={{ display:'flex', gap:5, overflowX:'auto', marginBottom:14, paddingBottom:2 }}>
          {spec.rooms.map((room,i) => (
            <div key={room.id} style={{ display:'flex', alignItems:'center', flexShrink:0 }}>
              <button onClick={()=>setActiveRoom(i)}
                style={{ fontSize:12, fontWeight:activeRoom===i?700:500, padding:'6px 12px', borderRadius:activeRoom===i?'8px 0 0 8px':8, border:'none', cursor:'pointer', whiteSpace:'nowrap',
                  background:activeRoom===i?'#2A3042':'#F3F4F6', color:activeRoom===i?'#fff':'#6B7280' }}>
                {room.name}
                {((room.materials||[]).length+(room.appliances||[]).length)>0 && (
                  <span style={{ marginLeft:5, fontSize:10, fontWeight:700, padding:'0 4px', height:14, borderRadius:7, background:activeRoom===i?'rgba(255,255,255,0.25)':'#9CA3AF', color:'#fff', display:'inline-flex', alignItems:'center' }}>
                    {(room.materials||[]).length+(room.appliances||[]).length}
                  </span>
                )}
              </button>
              {activeRoom===i && (
                <button onClick={()=>removeRoom(i)} style={{ background:'#2A3042', border:'none', cursor:'pointer', color:'rgba(255,255,255,0.5)', fontSize:13, padding:'6px 7px', borderRadius:'0 8px 8px 0' }}
                  onMouseEnter={e=>e.currentTarget.style.color='#fff'} onMouseLeave={e=>e.currentTarget.style.color='rgba(255,255,255,0.5)'}>×</button>
              )}
            </div>
          ))}
          {!showAddRoom && (
            <button onClick={()=>setShowAddRoom(true)} style={{ fontSize:12, fontWeight:600, padding:'6px 10px', borderRadius:8, border:'1px dashed #C4D4F8', background:'transparent', color:'#5B8AF0', cursor:'pointer', flexShrink:0 }}>+ Room</button>
          )}
        </div>
      )}

      {/* Add room — type picker modal */}
      {showAddRoom && (
        <div style={{ position:'fixed', inset:0, zIndex:600, background:'rgba(0,0,0,0.45)', display:'flex', alignItems:'center', justifyContent:'center', padding:16 }}
          onClick={e=>e.target===e.currentTarget&&(setShowAddRoom(false),setNewRoomName(''))}>
          <div style={{ background:'#fff', borderRadius:16, width:'100%', maxWidth:500, boxShadow:'0 24px 64px rgba(0,0,0,0.2)' }}>
            <div style={{ padding:'16px 20px', borderBottom:'1px solid #F3F4F6', display:'flex', alignItems:'center', justifyContent:'space-between' }}>
              <div>
                <div style={{ fontSize:15, fontWeight:800, color:'#2A3042' }}>Add a room</div>
                <div style={{ fontSize:12, color:'#9CA3AF', marginTop:2 }}>Choose a type to pre-fill its spec fields</div>
              </div>
              <button onClick={()=>{setShowAddRoom(false);setNewRoomName('')}}
                style={{ background:'none', border:'none', cursor:'pointer', color:'#9CA3AF', fontSize:22 }}>×</button>
            </div>
            <div style={{ padding:'16px 20px' }}>
              {/* Room type tiles */}
              <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(120px,1fr))', gap:8, marginBottom:14 }}>
                {roomTemplates.map(t=>(
                  <button key={t.id} onClick={()=>addRoom(t)}
                    style={{ padding:'12px 8px', borderRadius:11, border:'1.5px solid #E8ECF0', background:'#F9FAFB', cursor:'pointer', textAlign:'center', transition:'all .12s' }}
                    onMouseEnter={e=>{e.currentTarget.style.borderColor='#5B8AF0';e.currentTarget.style.background='#EEF2FF'}}
                    onMouseLeave={e=>{e.currentTarget.style.borderColor='#E8ECF0';e.currentTarget.style.background='#F9FAFB'}}>
                    <div style={{ fontSize:26, marginBottom:5 }}>{t.icon}</div>
                    <div style={{ fontSize:12, fontWeight:700, color:'#2A3042', marginBottom:2 }}>{t.name}</div>
                    <div style={{ fontSize:10, color:'#9CA3AF' }}>{(t.fields||[]).length} field{(t.fields||[]).length!==1?'s':''}</div>
                  </button>
                ))}
              </div>
              {/* Custom name fallback */}
              <div style={{ borderTop:'1px solid #F3F4F6', paddingTop:12 }}>
                <div style={{ fontSize:11, fontWeight:600, color:'#9CA3AF', marginBottom:8 }}>Or enter a custom room name</div>
                <div style={{ display:'flex', gap:8 }}>
                  <input value={newRoomName} onChange={e=>setNewRoomName(e.target.value)}
                    onKeyDown={e=>e.key==='Enter'&&newRoomName.trim()&&addRoom(null)}
                    placeholder="e.g. Scullery, Wine cellar…"
                    style={{ flex:1, padding:'8px 12px', border:'1px solid #DDE3EC', borderRadius:9, fontSize:13, outline:'none' }} />
                  <button onClick={()=>addRoom(null)} disabled={!newRoomName.trim()}
                    style={{ fontSize:12, fontWeight:700, padding:'8px 16px', borderRadius:9, border:'none',
                      background:newRoomName.trim()?'#5B8AF0':'#E8ECF0', color:newRoomName.trim()?'#fff':'#9CA3AF',
                      cursor:newRoomName.trim()?'pointer':'not-allowed' }}>Add</button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Active room */}
      {spec.rooms.length > 0 && spec.rooms[activeRoom] && (
        <div style={{ background:'#fff', borderRadius:12, border:'1px solid #E8ECF0', padding:16 }}>
          <RoomSpec room={spec.rooms[activeRoom]} matCats={matCats} appCats={appCats} onUpdate={room=>updateRoom(activeRoom,room)} />
        </div>
      )}

      {/* Summary */}
      {spec.rooms.length > 0 && (
        <div style={{ display:'flex', gap:20, padding:'12px 16px', background:'#F9FAFB', borderRadius:10, border:'1px solid #E8ECF0', marginTop:12 }}>
          <div style={{ textAlign:'center' }}><div style={{ fontSize:20,fontWeight:800,color:'#2A3042' }}>{spec.rooms.length}</div><div style={{ fontSize:11,color:'#9CA3AF' }}>Rooms</div></div>
          <div style={{ textAlign:'center' }}><div style={{ fontSize:20,fontWeight:800,color:'#5B8AF0' }}>{spec.rooms.reduce((s,r)=>s+(r.materials||[]).length,0)}</div><div style={{ fontSize:11,color:'#9CA3AF' }}>Materials</div></div>
          <div style={{ textAlign:'center' }}><div style={{ fontSize:20,fontWeight:800,color:'#F97316' }}>{spec.rooms.reduce((s,r)=>s+(r.appliances||[]).length,0)}</div><div style={{ fontSize:11,color:'#9CA3AF' }}>Appliances</div></div>
        </div>
      )}
    </div>
  )
}
