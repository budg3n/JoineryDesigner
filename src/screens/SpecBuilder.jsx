import { useState, useEffect, useRef } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { supabase, pubUrl } from '../lib/supabase'
import { useToast } from '../components/Toast'
import { useApp } from '../context/AppContext'
import NewJobModal from '../components/NewJobModal'

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
          {DIM_GROUPS.map(grp=>(
            <div key={grp.key} style={{ borderRadius:10, border:'1px solid #E8ECF0', overflow:'hidden' }}>
              <div style={{ padding:'8px 14px', background:grp.bg, display:'flex', alignItems:'center', gap:8 }}>
                <div style={{ width:10,height:10,borderRadius:3,background:grp.color,flexShrink:0 }} />
                <span style={{ fontSize:12, fontWeight:700, color:grp.color }}>{grp.label}</span>
              </div>
              <div style={{ padding:'12px 14px', background:'#fff', display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(130px,1fr))', gap:10 }}>
                {grp.fields.map(f=>(
                  <div key={f.key}>
                    <label style={{ fontSize:11, fontWeight:600, color:'#6B7280', display:'block', marginBottom:4 }}>{f.label}</label>
                    <div style={{ position:'relative' }}>
                      <input type={f.text?'text':'number'} value={dims[f.key]||''} onChange={e=>setDim(f.key,e.target.value)}
                        placeholder={f.placeholder}
                        style={{ width:'100%', padding:`7px ${f.unit?'30px':'10px'} 7px 10px`, border:'1px solid #DDE3EC', borderRadius:8, fontSize:13, outline:'none', boxSizing:'border-box' }} />
                      {f.unit && <span style={{ position:'absolute',right:9,top:'50%',transform:'translateY(-50%)',fontSize:11,color:'#9CA3AF',pointerEvents:'none' }}>{f.unit}</span>}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

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

// ── Main SpecBuilder screen ────────────────────────────────────────
export default function SpecBuilder() {
  const { id } = useParams()  // spec id (or 'new')
  const navigate = useNavigate()
  const toast    = useToast()
  const { profile } = useApp()

  const [spec, setSpec]       = useState(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving]   = useState(false)
  const [matCats, setMatCats]   = useState([])
  const [appCats, setAppCats]   = useState([])
  const [showNewJob, setShowNewJob] = useState(false)
  const [nextJobId, setNextJobId]   = useState(null)
  const [activeRoom, setActiveRoom] = useState(0)
  const [showAddRoom, setShowAddRoom] = useState(false)
  const [newRoomName, setNewRoomName] = useState('')
  const saveTimer = useRef()

  useEffect(() => {
    Promise.all([
      supabase.from('material_categories').select('*').order('name'),
      supabase.from('appliance_categories').select('*').order('name'),
      supabase.from('jobs').select('id').order('id', { ascending:false }).limit(1),
    ]).then(([{data:mc},{data:ac},{data:lastJob}]) => {
      // Pre-compute next job id (numeric + 1)
      const lastId = lastJob?.[0]?.id
      if (lastId && /^\d+$/.test(lastId)) setNextJobId(String(parseInt(lastId)+1))
      setMatCats(mc||[])
      setAppCats(ac||[])
    })


    if (id === 'new') {
      setSpec({ id:null, title:'New spec', client:'', status:'Draft', rooms:[], job_id:null, created_by:profile?.id, notes:'' })
      setLoading(false)
    } else {
      supabase.from('specs').select('*').eq('id', id).single()
        .then(async ({data, error}) => {
          if (error) { toast('Could not load spec — run the SQL migration first', 'error'); navigate('/spec-builder'); return }
          if (!data) { toast('Spec not found','error'); navigate('/spec-builder'); return }
          const rooms = safeJSON(data.rooms, [])
          // If job is linked but no rooms in spec yet, import from job
          if (data.job_id && rooms.length === 0) {
            const { data: jobRooms } = await supabase.from('rooms').select('*').eq('job_id', data.job_id).order('sort_order')
            if (jobRooms?.length) {
              const imported = jobRooms.map(jr => ({
                id: jr.id, name: jr.name,
                materials: [], appliances: [],
                notes: jr.notes || '', _fromJob: true,
              }))
              setSpec({ ...data, rooms: imported })
              setLoading(false)
              return
            }
          }
          setSpec({ ...data, rooms })
          setLoading(false)
        })
    }
  }, [id])

  const specRef = useRef(spec)
  useEffect(() => { specRef.current = spec }, [spec])

  function autoSave(updated) {
    clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(() => saveSpec(updated), 1500)
  }

  async function saveSpec(s) {
    if (!s) return
    setSaving(true)
    try {
      // Only send columns that exist in the specs table
      const row = {
        title:        s.title || 'New spec',
        client:       s.client || null,
        status:       s.status || 'Draft',
        rooms:        JSON.stringify(s.rooms || []),
        notes:        s.notes || null,
        job_id:       s.job_id || null,
        updated_at:   new Date().toISOString(),
      }

      if (!s.id) {
        const { data, error } = await supabase.from('specs')
          .insert({ ...row, created_by: profile?.id })
          .select().single()
        if (error) throw error
        setSpec(prev => ({ ...prev, id: data.id }))
        navigate(`/spec-builder/${data.id}`, { replace: true })
        toast('Spec saved ✓')
      } else {
        const { error } = await supabase.from('specs').update(row).eq('id', s.id)
        if (error) throw error
      }
    } catch(e) {
      toast('Save failed: ' + e.message, 'error')
      console.error('Save error:', e)
    }
    setSaving(false)
  }

  function updateSpec(patch) {
    const updated = { ...spec, ...patch }
    setSpec(updated)
    autoSave(updated)
  }

  function updateRoom(idx, room) {
    const rooms = spec.rooms.map((r,i) => i===idx ? room : r)
    updateSpec({ rooms })
  }

  function addRoom() {
    if (!newRoomName.trim()) return
    const room = { id: Date.now().toString(), name: newRoomName.trim(), materials:[], appliances:[], notes:'' }
    const rooms = [...spec.rooms, room]
    updateSpec({ rooms })
    setActiveRoom(rooms.length - 1)
    setNewRoomName('')
    setShowAddRoom(false)
    toast(`${room.name} added ✓`)
  }

  function removeRoom(idx) {
    if (!confirm(`Remove "${spec.rooms[idx].name}" from this spec?`)) return
    const rooms = spec.rooms.filter((_,i)=>i!==idx)
    updateSpec({ rooms })
    setActiveRoom(Math.min(activeRoom, rooms.length-1))
  }

  async function downloadPDF() {
    const rooms = spec.rooms || []
    const date  = new Date().toLocaleDateString('en-NZ', { day:'numeric', month:'long', year:'numeric' })

    // Get a fully-resolved public URL for any storage path
    function imgUrl(item) {
      const path = item.image_path || item.storage_path
      if (!path) return null
      if (path.startsWith('http')) return path
      // Use supabase storage public URL
      return supabase.storage.from('job-files').getPublicUrl(path).data.publicUrl
    }

    function itemImg(item) {
      const url = imgUrl(item)
      if (!url) return ''
      return `<img src="${url}" style="width:52px;height:52px;object-fit:cover;border-radius:8px;border:1px solid #ddd;flex-shrink:0;display:block" crossorigin="anonymous" />`
    }

    function matRow(m) {
      const tags = [m.supplier, m.panel_type, m.thickness ? m.thickness+'mm' : null, m.colour_code, m.finish].filter(Boolean).join(' · ')
      const swatch = itemImg(m) || `<div style="width:52px;height:52px;border-radius:8px;background:${m.color||'#eee'};border:1px solid #ddd;flex-shrink:0"></div>`
      return `
        <div style="display:flex;gap:12px;align-items:flex-start;padding:10px 12px;background:#f8f8f8;border-radius:8px;border:1px solid #e0e0e0;margin-bottom:8px">
          ${swatch}
          <div style="flex:1;min-width:0">
            <div style="font-size:14px;font-weight:600;color:#000">${m.name || '—'}</div>
            ${tags ? `<div style="font-size:11px;color:#444;margin-top:2px">${tags}</div>` : ''}
            ${m._note ? `<div style="margin-top:6px;font-size:12px;color:#000;background:#e8eeff;border-left:2px solid #5B8AF0;border-radius:4px;padding:5px 8px">${m._note}</div>` : ''}
          </div>
        </div>`
    }

    function appRow(a) {
      const sub = [a.type, a.width ? `${a.width}×${a.height}mm` : null].filter(Boolean).join(' · ')
      const swatch = itemImg(a) || `<div style="width:52px;height:52px;border-radius:8px;background:#f0f0f0;border:1px solid #ddd;flex-shrink:0;display:flex;align-items:center;justify-content:center;font-size:22px">🔌</div>`
      return `
        <div style="display:flex;gap:12px;align-items:flex-start;padding:10px 12px;background:#f8f8f8;border-radius:8px;border:1px solid #e0e0e0;margin-bottom:8px">
          ${swatch}
          <div style="flex:1;min-width:0">
            <div style="font-size:14px;font-weight:600;color:#000">${[a.brand,a.model].filter(Boolean).join(' ') || '—'}</div>
            ${sub ? `<div style="font-size:11px;color:#444;margin-top:2px">${sub}</div>` : ''}
            ${a._note ? `<div style="margin-top:6px;font-size:12px;color:#000;background:#e8eeff;border-left:2px solid #5B8AF0;border-radius:4px;padding:5px 8px">${a._note}</div>` : ''}
          </div>
        </div>`
    }

    const DIM_LABELS = {
      toe_kick_height:'Toe kick',base_height:'Base height',base_depth:'Base depth',
      upper_height:'Upper height',upper_depth:'Upper depth',tall_height:'Tall height',
      tall_depth:'Tall depth',bench_thickness:'Bench thickness',
      bench_overhang_front:'Overhang front',bench_overhang_side:'Overhang sides',bench_material:'Bench material'
    }
    const STATUS_LABELS = { confirmed:'✓ Confirmed', maybe:'? Maybe', alternative:'≈ Alternative' }
    const STATUS_COLORS = { confirmed:'#166534', maybe:'#854D0E', alternative:'#3730A3' }

    function itemsByStatus(arr) {
      const groups = { confirmed:[], maybe:[], alternative:[] }
      arr.forEach(e => { const s = e._status||'confirmed'; (groups[s]||groups.confirmed).push(e) })
      return groups
    }

    const roomSections = rooms.map(room => {
      const mats = room.materials || []
      const apps = room.appliances || []
      const dims = room.dimensions || {}
      const hasDims = Object.values(dims).some(v=>v)
      const matGroups = itemsByStatus(mats)
      const appGroups = itemsByStatus(apps)

      function statusSection(label, color, items, rowFn) {
        if (!items.length) return ''
        return `<div style="margin-bottom:10px">
          <div style="font-size:10px;font-weight:700;color:${color};text-transform:uppercase;letter-spacing:.05em;margin:10px 0 5px">${label}</div>
          ${items.map(rowFn).join('')}
        </div>`
      }

      return `
        <div style="margin-bottom:32px;page-break-inside:avoid">
          <div style="display:flex;align-items:baseline;justify-content:space-between;padding-bottom:8px;border-bottom:2px solid #000;margin-bottom:14px">
            <div style="font-size:18px;font-weight:700;color:#000">${room.name}</div>
            <div style="font-size:12px;color:#444">${mats.length} material${mats.length!==1?'s':''} · ${apps.length} appliance${apps.length!==1?'s':''}</div>
          </div>
          ${hasDims ? `
            <div style="font-size:10px;font-weight:700;color:#444;text-transform:uppercase;letter-spacing:.06em;margin-bottom:8px">Dimensions</div>
            <div style="display:flex;flex-wrap:wrap;gap:8px;margin-bottom:14px">
              ${Object.entries(dims).filter(([,v])=>v).map(([k,v])=>`
                <div style="background:#f5f5f5;border:1px solid #e0e0e0;border-radius:6px;padding:5px 10px;font-size:12px">
                  <span style="color:#555">${DIM_LABELS[k]||k}: </span><strong style="color:#000">${v}${k!=='bench_material'?'mm':''}</strong>
                </div>`).join('')}
            </div>
          ` : ''}
          ${mats.length > 0 ? `
            <div style="font-size:10px;font-weight:700;color:#444;text-transform:uppercase;letter-spacing:.06em;margin:8px 0 4px">Materials</div>
            ${statusSection('✓ Confirmed','#166534',matGroups.confirmed,matRow)}
            ${statusSection('? Maybe','#854D0E',matGroups.maybe,matRow)}
            ${statusSection('≈ Alternatives','#3730A3',matGroups.alternative,matRow)}
          ` : ''}
          ${apps.length > 0 ? `
            <div style="font-size:10px;font-weight:700;color:#444;text-transform:uppercase;letter-spacing:.06em;margin:14px 0 4px">Appliances</div>
            ${statusSection('✓ Confirmed','#166534',appGroups.confirmed,appRow)}
            ${statusSection('? Maybe','#854D0E',appGroups.maybe,appRow)}
            ${statusSection('≈ Alternatives','#3730A3',appGroups.alternative,appRow)}
          ` : ''}
          ${room.notes ? `<div style="margin-top:10px;font-size:12px;color:#000;background:#fffbeb;border-left:3px solid #f59e0b;padding:8px 12px;border-radius:4px"><strong>Notes:</strong> ${room.notes}</div>` : ''}
        </div>`
    }).join('')

    const totalMats = rooms.reduce((s,r)=>s+(r.materials||[]).length,0)
    const totalApps = rooms.reduce((s,r)=>s+(r.appliances||[]).length,0)

    const html = `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<title>${spec.title || 'Spec'}</title>
<style>
  * { box-sizing:border-box; margin:0; padding:0; -webkit-print-color-adjust:exact; print-color-adjust:exact; }
  body { font-family:-apple-system,BlinkMacSystemFont,'Helvetica Neue',Arial,sans-serif; color:#000; background:#fff; padding:32px 40px; max-width:800px; margin:0 auto; }
  img { display:block; }
  @media print {
    body { padding:0; max-width:100%; }
    @page { margin:15mm; size:A4; }
  }
</style>
</head>
<body>
  <!-- Header -->
  <div style="border-bottom:2px solid #000;padding-bottom:18px;margin-bottom:24px">
    <div style="display:flex;justify-content:space-between;align-items:flex-start">
      <div>
        <div style="font-size:28px;font-weight:800;color:#000">${spec.title || 'Untitled Spec'}</div>
        ${spec.client ? `<div style="font-size:15px;color:#333;margin-top:4px">${spec.client}</div>` : ''}
      </div>
      <div style="text-align:right">
        <div style="display:inline-block;font-size:11px;font-weight:700;padding:3px 10px;border-radius:20px;background:#e8e8e8;color:#000;margin-bottom:6px">${spec.status || 'Draft'}</div>
        <div style="font-size:12px;color:#333">${date}</div>
      </div>
    </div>
    <div style="display:flex;gap:28px;margin-top:16px">
      <div><span style="font-size:20px;font-weight:800;color:#000">${rooms.length}</span><span style="font-size:12px;color:#444;margin-left:4px">rooms</span></div>
      <div><span style="font-size:20px;font-weight:800;color:#000">${totalMats}</span><span style="font-size:12px;color:#444;margin-left:4px">materials</span></div>
      <div><span style="font-size:20px;font-weight:800;color:#000">${totalApps}</span><span style="font-size:12px;color:#444;margin-left:4px">appliances</span></div>
    </div>
  </div>

  ${roomSections}

  <div style="margin-top:32px;padding-top:14px;border-top:1px solid #ddd;display:flex;justify-content:space-between;font-size:11px;color:#666">
    <span>${spec.title || 'Spec'}</span>
    <span>${date}</span>
  </div>
</body>
</html>`

    const win = window.open('', '_blank')
    win.document.write(html)
    win.document.close()
    // Wait for images to load then print
    win.addEventListener('load', () => setTimeout(() => win.print(), 300))
    setTimeout(() => win.print(), 1200)
  }

  async function submitToSetout() {
    if (!spec.id) { await saveSpec(spec); return }
    if (!spec.job_id) { toast('Link this spec to a job first', 'error'); return }

    try {
      // Load existing job rooms so we know what already exists
      const { data: existingRooms, error: roomsErr } = await supabase.from('rooms').select('id,name,notes').eq('job_id', spec.job_id)
      if (roomsErr) throw new Error('Could not load job rooms: ' + roomsErr.message)
      const existingMap = Object.fromEntries((existingRooms||[]).map(r=>[r.id, r]))

      console.log('Spec rooms:', spec.rooms.map(r=>({id:r.id, name:r.name, _fromJob:r._fromJob})))
      console.log('Existing job rooms:', existingRooms?.map(r=>({id:r.id, name:r.name})))

      for (const room of spec.rooms || []) {
        // Build kitchen_specs from dimensions (same keys used by RoomDetail)
        const dims = room.dimensions || {}
        const hasDims = Object.values(dims).some(v=>v)
        const kitchen_specs = hasDims ? JSON.stringify(dims) : null

        // Build a spec summary note
        const confirmedMats  = (room.materials  ||[]).filter(m=>!m._status||m._status==='confirmed')
        const maybeMats      = (room.materials  ||[]).filter(m=>m._status==='maybe'||m._status==='alternative')
        const confirmedApps  = (room.appliances ||[]).filter(a=>!a._status||a._status==='confirmed')
        const maybeApps      = (room.appliances ||[]).filter(a=>a._status==='maybe'||a._status==='alternative')

        const lines = []
        if (confirmedMats.length)  lines.push(`✓ Materials: ${confirmedMats.map(m=>m.name||m.brand||'').filter(Boolean).join(', ')}`)
        if (confirmedApps.length)  lines.push(`✓ Appliances: ${confirmedApps.map(a=>`${a.brand||''} ${a.model||''}`.trim()).filter(Boolean).join(', ')}`)
        if (maybeMats.length)      lines.push(`? Maybe materials: ${maybeMats.map(m=>m.name||m.brand||'').filter(Boolean).join(', ')}`)
        if (maybeApps.length)      lines.push(`? Maybe appliances: ${maybeApps.map(a=>`${a.brand||''} ${a.model||''}`.trim()).filter(Boolean).join(', ')}`)
        if (room.notes)            lines.push(`Notes: ${room.notes}`)
        const spec_notes = lines.length ? `[From spec: ${spec.title}]\n${lines.join('\n')}` : null

        const matchedRoom = room.id && existingMap[room.id]
          // Fallback: match by name if id is a timestamp (manually added room)
          || (!existingMap[room.id] && (existingRooms||[]).find(r => r.name.toLowerCase() === room.name.toLowerCase()))
        console.log(`Room "${room.name}" id=${room.id} matched=${!!matchedRoom}`)

        if (matchedRoom) {
          // Room exists — update kitchen_specs and notes
          const currentNotes = matchedRoom.notes || ''
          const specTag = `[From spec: ${spec.title}]`
          const baseNotes = currentNotes.includes(specTag)
            ? currentNotes.substring(0, currentNotes.indexOf(specTag)).trim()
            : currentNotes
          const newNotes = spec_notes
            ? (baseNotes ? `${baseNotes}\n\n${spec_notes}` : spec_notes)
            : (baseNotes || null)

          const { error: updateErr } = await supabase.from('rooms')
            .update({ kitchen_specs, notes: newNotes })
            .eq('id', matchedRoom.id)
          if (updateErr) console.error(`Failed to update room ${matchedRoom.id}:`, updateErr)
          else {
            console.log(`Updated room ${matchedRoom.id} (${room.name}) ✓`)
            // Push confirmed materials into room_materials (skip duplicates)
            if (confirmedMats.length) {
              const { data: existing } = await supabase.from('room_materials').select('material_id').eq('room_id', matchedRoom.id)
              const existingIds = new Set((existing||[]).map(r=>r.material_id))
              const toInsert = confirmedMats.filter(m=>m.id && !existingIds.has(m.id)).map(m=>({ room_id: matchedRoom.id, material_id: m.id }))
              if (toInsert.length) await supabase.from('room_materials').insert(toInsert)
            }
            // Push confirmed appliances into room_appliances (skip duplicates)
            if (confirmedApps.length) {
              const { data: existing } = await supabase.from('room_appliances').select('appliance_id').eq('room_id', matchedRoom.id)
              const existingIds = new Set((existing||[]).map(r=>r.appliance_id))
              const toInsert = confirmedApps.filter(a=>a.id && !existingIds.has(a.id)).map(a=>({ room_id: matchedRoom.id, appliance_id: a.id }))
              if (toInsert.length) await supabase.from('room_appliances').insert(toInsert)
            }
          }

        } else {
          // Room not in job — create it
          const { error: insertErr } = await supabase.from('rooms').insert({
            job_id:     spec.job_id,
            name:       room.name,
            type:       'Kitchen',
            sort_order: 999,
            tasks:      '[]',
            kitchen_specs,
            notes:      spec_notes,
          })
          if (insertErr) console.error(`Failed to insert room ${room.name}:`, insertErr)
          else {
            console.log(`Created room "${room.name}" ✓`)
            // Get the new room's id then insert materials/appliances
            const { data: newRoom } = await supabase.from('rooms').select('id').eq('job_id', spec.job_id).eq('name', room.name).order('created_at', { ascending:false }).limit(1).single()
            if (newRoom) {
              if (confirmedMats.length) {
                await supabase.from('room_materials').insert(confirmedMats.filter(m=>m.id).map(m=>({ room_id: newRoom.id, material_id: m.id })))
              }
              if (confirmedApps.length) {
                await supabase.from('room_appliances').insert(confirmedApps.filter(a=>a.id).map(a=>({ room_id: newRoom.id, appliance_id: a.id })))
              }
            }
          }
        }
      }

      // Mark spec as submitted
      await supabase.from('specs').update({
        status: 'Submitted',
        submitted_at: new Date().toISOString()
      }).eq('id', spec.id)

      setSpec(p=>({...p, status:'Submitted'}))
      toast('Submitted ✓ — dimensions and selections pushed to job rooms')

    } catch(e) {
      toast('Submit failed: ' + e.message, 'error')
      console.error(e)
    }
  }

  if (loading) return <div style={{ display:'flex', justifyContent:'center', padding:'60px 0' }}><div className="spinner" /></div>
  if (!spec) return null

  const canSubmit = spec.rooms.length > 0 && spec.rooms.some(r=>(r.materials||[]).length+(r.appliances||[]).length > 0)

  return (
    <div style={{ maxWidth:860, margin:'0 auto', paddingBottom:40 }}>
      {/* Job link */}
      <div style={{ marginBottom:14 }}>
        <JobLinker
          jobId={spec.job_id}
          onLink={async (job_id) => {
            if (!job_id) { updateSpec({ job_id: null }); return }
            // Load the job's rooms and merge into spec
            const { data: jobRooms } = await supabase.from('rooms').select('*').eq('job_id', job_id).order('sort_order')
            const existingRoomNames = (spec.rooms||[]).map(r=>r.name.toLowerCase())
            const newRooms = (jobRooms||[])
              .filter(jr => !existingRoomNames.includes(jr.name.toLowerCase()))
              .map(jr => ({
                id: jr.id,
                name: jr.name,
                materials: [],
                appliances: [],
                notes: jr.notes || '',
                _fromJob: true,
              }))
            const merged = [...(spec.rooms||[]), ...newRooms]
            updateSpec({ job_id, rooms: merged })
            if (newRooms.length > 0) toast(`Imported ${newRooms.length} room${newRooms.length!==1?'s':''} from job ✓`)
          }}
          onCreateJob={() => setShowNewJob(true)}
        />
      </div>

      {/* Header */}
      <div style={{ display:'flex', alignItems:'flex-start', gap:12, marginBottom:20, flexWrap:'wrap' }}>
        <div style={{ flex:1, minWidth:240 }}>
          <input value={spec.title} onChange={e=>updateSpec({title:e.target.value})}
            style={{ fontSize:22, fontWeight:800, color:'#2A3042', border:'none', outline:'none', background:'transparent', width:'100%', fontFamily:'inherit', marginBottom:4 }} />
          <input value={spec.client||''} onChange={e=>updateSpec({client:e.target.value})}
            placeholder="Client name…"
            style={{ fontSize:14, color:'#6B7280', border:'none', outline:'none', background:'transparent', width:'100%', fontFamily:'inherit' }} />
        </div>
        <div style={{ display:'flex', gap:8, alignItems:'center', flexShrink:0 }}>
          <span style={{ fontSize:12, fontWeight:700, padding:'4px 10px', borderRadius:20,
            background: spec.status==='Submitted'?'#DCFCE7':spec.status==='Draft'?'#F3F4F6':'#EEF2FF',
            color: spec.status==='Submitted'?'#166534':spec.status==='Draft'?'#6B7280':'#3730A3' }}>
            {spec.status||'Draft'}
          </span>
          {saving && <span style={{ fontSize:11, color:'#9CA3AF' }}>Saving…</span>}
          {!saving && spec?.id && <span style={{ fontSize:11, color:'#1D9E75', fontWeight:600 }}>✓ Saved</span>}
          <Btn onClick={downloadPDF}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
            PDF
          </Btn>
          <Btn onClick={() => { clearTimeout(saveTimer.current); saveSpec(spec) }} variant="default">Save</Btn>
          <Btn onClick={submitToSetout} variant="primary" disabled={!canSubmit}>
            {spec.status==='Submitted' ? '↑ Resubmit' : 'Submit to Setout'}
          </Btn>
        </div>
      </div>

      {/* No rooms */}
      {spec.rooms.length === 0 && !showAddRoom && (
        <Card style={{ padding:'48px 24px', textAlign:'center', marginBottom:20 }}>
          <div style={{ fontSize:36, marginBottom:12 }}>🏠</div>
          <div style={{ fontSize:16, fontWeight:700, color:'#2A3042', marginBottom:6 }}>No rooms yet</div>
          <div style={{ fontSize:13, color:'#9CA3AF', marginBottom:20 }}>Add rooms or spaces to build out the spec</div>
          <Btn onClick={()=>setShowAddRoom(true)} variant="primary" style={{ margin:'0 auto' }}>+ Add first room</Btn>
        </Card>
      )}

      {/* Room tabs */}
      {spec.rooms.length > 0 && (
        <div style={{ display:'flex', gap:6, overflowX:'auto', marginBottom:16, paddingBottom:2 }}>
          {spec.rooms.map((room,i) => (
            <div key={room.id} style={{ display:'flex', alignItems:'center', gap:0, flexShrink:0 }}>
              <button onClick={()=>setActiveRoom(i)}
                style={{ fontSize:13, fontWeight:activeRoom===i?700:500, padding:'7px 14px', borderRadius:8, border:'none', cursor:'pointer', whiteSpace:'nowrap',
                  background:activeRoom===i?'#2A3042':'#F3F4F6', color:activeRoom===i?'#fff':'#6B7280' }}>
                {room.name}
                {((room.materials||[]).length+(room.appliances||[]).length) > 0 && (
                  <span style={{ marginLeft:6, fontSize:10, fontWeight:700, padding:'0 5px', height:15, borderRadius:8, background:activeRoom===i?'rgba(255,255,255,0.25)':'#9CA3AF', color:'#fff', display:'inline-flex', alignItems:'center' }}>
                    {(room.materials||[]).length+(room.appliances||[]).length}
                  </span>
                )}
              </button>
              {activeRoom===i && (
                <button onClick={()=>removeRoom(i)} style={{ marginLeft:-1, background:'#2A3042', border:'none', cursor:'pointer', color:'rgba(255,255,255,0.5)', fontSize:14, lineHeight:1, padding:'2px 6px', borderRadius:'0 8px 8px 0' }}
                  onMouseEnter={e=>e.currentTarget.style.color='#fff'} onMouseLeave={e=>e.currentTarget.style.color='rgba(255,255,255,0.5)'}>×</button>
              )}
            </div>
          ))}
          {!showAddRoom && (
            <button onClick={()=>setShowAddRoom(true)}
              style={{ fontSize:13, fontWeight:600, padding:'7px 12px', borderRadius:8, border:'1px dashed #C4D4F8', background:'transparent', color:'#5B8AF0', cursor:'pointer', flexShrink:0 }}>
              + Room
            </button>
          )}
        </div>
      )}

      {/* Add room form */}
      {showAddRoom && (
        <Card style={{ padding:'14px 16px', marginBottom:16, border:'1px solid #C4D4F8', background:'#F0F4FF' }}>
          <div style={{ display:'flex', gap:8 }}>
            <input autoFocus value={newRoomName} onChange={e=>setNewRoomName(e.target.value)}
              onKeyDown={e=>e.key==='Enter'&&addRoom()}
              placeholder="Room name (e.g. Kitchen, Master Ensuite…)"
              style={{ flex:1, padding:'8px 12px', border:'1px solid #DDE3EC', borderRadius:8, fontSize:13, outline:'none' }} />
            <Btn onClick={addRoom} variant="primary" disabled={!newRoomName.trim()}>Add</Btn>
            <Btn onClick={()=>{setShowAddRoom(false);setNewRoomName('')}}>Cancel</Btn>
          </div>
        </Card>
      )}

      {/* Active room spec */}
      {spec.rooms.length > 0 && spec.rooms[activeRoom] && (
        <Card style={{ padding:18 }}>
          <RoomSpec
            room={spec.rooms[activeRoom]}
            matCats={matCats}
            appCats={appCats}
            onUpdate={(room) => updateRoom(activeRoom, room)}
          />
        </Card>
      )}

      {/* Spec summary */}
      {spec.rooms.length > 0 && (
        <Card style={{ padding:'14px 18px', marginTop:14 }}>
          <div style={{ fontSize:11, fontWeight:700, color:'#9CA3AF', textTransform:'uppercase', letterSpacing:'.06em', marginBottom:10 }}>Summary</div>
          <div style={{ display:'flex', gap:20, flexWrap:'wrap' }}>
            <div style={{ textAlign:'center' }}>
              <div style={{ fontSize:22, fontWeight:800, color:'#2A3042' }}>{spec.rooms.length}</div>
              <div style={{ fontSize:11, color:'#9CA3AF' }}>Rooms</div>
            </div>
            <div style={{ textAlign:'center' }}>
              <div style={{ fontSize:22, fontWeight:800, color:'#5B8AF0' }}>{spec.rooms.reduce((s,r)=>s+(r.materials||[]).length,0)}</div>
              <div style={{ fontSize:11, color:'#9CA3AF' }}>Materials</div>
            </div>
            <div style={{ textAlign:'center' }}>
              <div style={{ fontSize:22, fontWeight:800, color:'#F97316' }}>{spec.rooms.reduce((s,r)=>s+(r.appliances||[]).length,0)}</div>
              <div style={{ fontSize:11, color:'#9CA3AF' }}>Appliances</div>
            </div>
          </div>
        </Card>
      )}
      {/* New job modal */}
      {showNewJob && (
        <NewJobModal show={showNewJob} nextId={nextJobId}
          onClose={() => setShowNewJob(false)}
          onCreated={job => {
            setShowNewJob(false)
            updateSpec({ job_id: job.id, title: spec.title==='New spec' ? (job.name?.replace(/^.+?[\u2014\u2013-]{1,2}\s*/,'') || job.name) : spec.title, client: spec.client || job.client })
            window.dispatchEvent(new CustomEvent('job-created', { detail: job }))
          }}
        />
      )}
    </div>
  )
}
