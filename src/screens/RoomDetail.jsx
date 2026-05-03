// RoomDetail — floating panel showing a single room's details
import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase, pubUrl, BUCKET } from '../lib/supabase'
import { useApp } from '../context/AppContext'
import { useToast } from '../components/Toast'

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

function TaskRow({ task, onToggle, onDelete, onUpdate }) {
  const [editing, setEditing] = React.useState(false)
  const isOver = !task.done && task.date && new Date(task.date) < new Date()
  return (
    <div style={{ display:'flex', alignItems:'flex-start', gap:10, padding:'8px 12px', background:'#F9FAFB', borderRadius:9, border:`1px solid ${isOver?'#FCA5A5':'#E8ECF0'}`, marginBottom:6 }}>
      <div onClick={onToggle} style={{ width:18, height:18, borderRadius:5, border:`2px solid ${task.done?'#1D9E75':isOver?'#E24B4A':'#C4C9D4'}`, background:task.done?'#1D9E75':'#fff', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0, marginTop:2, cursor:'pointer', transition:'all .12s' }}>
        {task.done && <span style={{ color:'#fff', fontSize:11, fontWeight:700 }}>✓</span>}
      </div>
      <div style={{ flex:1, minWidth:0 }}>
        <div style={{ fontSize:13, fontWeight:500, color: task.done?'#9CA3AF':'#2A3042', textDecoration:task.done?'line-through':'none' }}>{task.title}</div>
        {editing ? (
          <div style={{ display:'flex', gap:5, marginTop:5, flexWrap:'wrap', alignItems:'center' }}>
            <input type="date" defaultValue={task.date||''} onChange={e=>onUpdate('date',e.target.value)}
              style={{ fontSize:11, padding:'2px 6px', border:'1px solid #C4D4F8', borderRadius:6, outline:'none' }} />
            <input type="time" defaultValue={task.time||''} onChange={e=>onUpdate('time',e.target.value)}
              style={{ fontSize:11, padding:'2px 6px', border:'1px solid #C4D4F8', borderRadius:6, outline:'none', width:88 }} />
            <button onClick={()=>setEditing(false)} style={{ fontSize:11, color:'#1D9E75', fontWeight:700, background:'none', border:'none', cursor:'pointer' }}>Done</button>
          </div>
        ) : (
          <div style={{ display:'flex', alignItems:'center', gap:6, marginTop:2 }}>
            {task.date && <span style={{ fontSize:11, color:isOver?'#E24B4A':'#9CA3AF' }}>Due {new Date(task.date).toLocaleDateString('en-NZ',{day:'numeric',month:'short'})}{task.time ? ' ' + task.time : ''}</span>}
            {!task.done && <button onClick={()=>setEditing(true)} style={{ fontSize:10, color:'#C4C9D4', background:'none', border:'none', cursor:'pointer', padding:0 }}
              onMouseEnter={e=>e.currentTarget.style.color='#5B8AF0'} onMouseLeave={e=>e.currentTarget.style.color='#C4C9D4'}>✏️</button>}
            {task.done && task.completed_by && <span style={{ fontSize:10, color:'#9CA3AF' }}>✓ {task.completed_by}</span>}
          </div>
        )}
      </div>
      <button onClick={onDelete} style={{ background:'none', border:'none', cursor:'pointer', color:'#D1D5DB', fontSize:16, lineHeight:1 }}
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

function RoomOrdersTab({ room, jobId, jobMats, onOpenFull }) {
  const toast = useToast()
  const [orders,  setOrders]  = useState([])
  const [loading, setLoading] = useState(true)
  const [adding,  setAdding]  = useState(false)
  const [form,    setForm]    = useState(EMPTY_FORM)
  const [search,  setSearch]  = useState('')
  const [showDrop,setShowDrop]= useState(false)
  const searchRef = useRef()

  useEffect(()=>{
    supabase.from('order_items').select('*').eq('job_id',jobId).eq('room_id',room.id).order('created_at')
      .then(({data})=>{ setOrders(data||[]); setLoading(false) })
  },[room.id,jobId])

  // Materials available to search — job materials + full library
  const [allMats, setAllMats] = useState([])
  useEffect(()=>{
    supabase.from('materials').select('*').order('name').then(({data})=>setAllMats(data||[]))
  },[])

  const matches = search.trim().length > 0
    ? allMats.filter(m =>
        (m.name||'').toLowerCase().includes(search.toLowerCase()) ||
        (m.supplier||'').toLowerCase().includes(search.toLowerCase()) ||
        (m.colour_code||'').toLowerCase().includes(search.toLowerCase()) ||
        (m.panel_type||'').toLowerCase().includes(search.toLowerCase())
      ).slice(0,8)
    : []

  function pickMaterial(m) {
    setForm({
      item:        m.name||'',
      supplier:    m.supplier||'',
      panel_type:  m.panel_type||'',
      thickness:   m.thickness ? String(m.thickness) : '',
      colour:      m.colour_code||'',
      finish:      m.finish||'',
      dimensions:  m.dimensions||'',
      sku:         m.sku||'',
      price:       m.price ? String(m.price) : '',
      notes:       '',
      qty:         '',
      unit:        'sheets',
      material_id: m.id,
    })
    setSearch(m.name)
    setShowDrop(false)
  }

  function setF(k,v) { setForm(p=>({...p,[k]:v})) }

  async function addItem() {
    if (!form.item.trim()) { toast('Enter an item name','error'); return }
    const row = {
      id: Date.now().toString(36)+Math.random().toString(36).slice(2),
      job_id:jobId, room_id:room.id, status:'To order',
      category: form.panel_type ? 'Board' : 'Hardware',
      updated_at: new Date().toISOString(),
      ...form,
    }
    const {data,error} = await supabase.from('order_items').insert(row).select().single()
    if (error) { toast(error.message,'error'); return }
    setOrders(p=>[...p,data])
    setForm(EMPTY_FORM); setSearch(''); setAdding(false)
    toast('Added to order sheet ✓')
  }

  async function removeItem(id) {
    await supabase.from('order_items').delete().eq('id',id)
    setOrders(p=>p.filter(o=>o.id!==id))
  }

  async function toggleStatus(o) {
    const next = o.status==='To order'?'Ordered':o.status==='Ordered'?'Received':'To order'
    await supabase.from('order_items').update({status:next}).eq('id',o.id)
    setOrders(p=>p.map(x=>x.id===o.id?{...x,status:next}:x))
  }

  const toOrder = orders.filter(o=>o.status==='To order').length
  const inp = {width:'100%',padding:'8px 10px',border:'1px solid #DDE3EC',borderRadius:8,fontSize:12,outline:'none',boxSizing:'border-box',fontFamily:'inherit'}

  return (
    <div>
      {/* header */}
      <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:12}}>
        <div style={{display:'flex',alignItems:'center',gap:8}}>
          <span style={{fontSize:13,fontWeight:700,color:'#2A3042'}}>Items to order</span>
          {toOrder>0&&<span style={{fontSize:11,fontWeight:700,padding:'2px 8px',borderRadius:10,background:'#FEF9C3',color:'#854D0E'}}>{toOrder} to order</span>}
        </div>
        <button onClick={onOpenFull}
          style={{fontSize:11,fontWeight:600,padding:'5px 12px',borderRadius:8,border:'1px solid #C4D4F8',background:'#EEF2FF',color:'#3730A3',cursor:'pointer',display:'flex',alignItems:'center',gap:5}}>
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
          Full order sheet
        </button>
      </div>

      {/* existing items */}
      {loading ? <div style={{textAlign:'center',padding:'20px 0',color:'#9CA3AF',fontSize:12}}>Loading…</div>
      : orders.length > 0 && (
        <div style={{display:'flex',flexDirection:'column',gap:6,marginBottom:12}}>
          {orders.map(o=>{
            const sc = STATUS_COLOR[o.status]||STATUS_COLOR['To order']
            const spec = [o.panel_type, o.thickness?o.thickness+'mm':null, o.colour, o.finish].filter(Boolean).join(' · ')
            const qty = parseFloat(o.qty), price = parseFloat(o.price)
            const total = !isNaN(qty)&&!isNaN(price)&&qty>0&&price>0 ? (qty*price).toFixed(2) : null
            return (
              <div key={o.id} style={{background:'#fff',borderRadius:10,border:'1px solid #E8ECF0',overflow:'hidden'}}>
                {/* top row */}
                <div style={{display:'flex',alignItems:'flex-start',gap:8,padding:'10px 12px 6px'}}>
                  <div style={{flex:1,minWidth:0}}>
                    <div style={{fontSize:13,fontWeight:700,color:'#2A3042'}}>{o.item}</div>
                    {spec&&<div style={{fontSize:11,color:'#6B7280',marginTop:2}}>{spec}</div>}
                    {o.supplier&&<div style={{fontSize:11,color:'#9CA3AF',marginTop:1}}>{o.supplier}</div>}
                  </div>
                  <button onClick={()=>toggleStatus(o)}
                    style={{fontSize:10,fontWeight:700,padding:'3px 9px',borderRadius:8,border:`1px solid ${sc.bg}`,background:sc.bg,color:sc.color,cursor:'pointer',whiteSpace:'nowrap',flexShrink:0}}>
                    {o.status}
                  </button>
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
                    <div style={{fontSize:12,fontWeight:700,color:'#374151'}}>${parseFloat(o.price).toFixed(2)}</div>
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
                    <div style={{fontSize:9,fontWeight:700,color:'#C4C9D4',textTransform:'uppercase',letterSpacing:'.05em'}}>SKU</div>
                    <div style={{fontSize:12,fontWeight:600,color:'#374151'}}>{o.sku}</div>
                  </div>}
                </div>
                {o.notes&&<div style={{padding:'4px 12px 8px',fontSize:11,color:'#9CA3AF',fontStyle:'italic'}}>{o.notes}</div>}
              </div>
            )
          })}
        </div>
      )}

      {!loading && orders.length===0 && !adding && (
        <div style={{textAlign:'center',padding:'20px 0',color:'#9CA3AF',fontSize:13,marginBottom:8}}>
          No items to order for this room yet
        </div>
      )}

      {/* add form */}
      {adding ? (
        <div style={{background:'#fff',borderRadius:12,border:'1px solid #E8ECF0',padding:14}}>
          {/* material search */}
          <div style={{position:'relative',marginBottom:10}}>
            <label style={{fontSize:10,fontWeight:700,color:'#9CA3AF',textTransform:'uppercase',letterSpacing:'.05em',display:'block',marginBottom:4}}>Search materials library</label>
            <input ref={searchRef} value={search}
              onChange={e=>{setSearch(e.target.value);setShowDrop(true);if(!e.target.value)setForm(EMPTY_FORM)}}
              onFocus={()=>setShowDrop(true)}
              placeholder="Type to search — or fill in manually below…"
              style={{...inp,fontWeight:form.material_id?600:400,color:form.material_id?'#2A3042':'#374151'}}/>
            {showDrop && matches.length > 0 && (
              <div style={{position:'absolute',top:'100%',left:0,right:0,zIndex:200,background:'#fff',border:'1px solid #E8ECF0',borderRadius:10,boxShadow:'0 8px 24px rgba(0,0,0,0.12)',marginTop:2,overflow:'hidden'}}>
                {matches.map(m=>(
                  <div key={m.id} onMouseDown={()=>pickMaterial(m)}
                    style={{display:'flex',alignItems:'center',gap:10,padding:'9px 12px',cursor:'pointer',borderBottom:'1px solid #F9FAFB'}}
                    onMouseEnter={e=>e.currentTarget.style.background='#F9FAFB'}
                    onMouseLeave={e=>e.currentTarget.style.background='#fff'}>
                    {m.storage_path
                      ? <img src={pubUrl(m.storage_path)} style={{width:32,height:32,borderRadius:6,objectFit:'cover',flexShrink:0}} alt=""/>
                      : <div style={{width:32,height:32,borderRadius:6,background:m.color||'#E8ECF0',flexShrink:0,border:'1px solid rgba(0,0,0,0.06)'}}/>
                    }
                    <div style={{flex:1,minWidth:0}}>
                      <div style={{fontSize:12,fontWeight:700,color:'#2A3042'}}>{m.name}</div>
                      <div style={{fontSize:10,color:'#9CA3AF'}}>
                        {[m.supplier,m.panel_type,m.thickness?m.thickness+'mm':null,m.colour_code,m.finish].filter(Boolean).join(' · ')}
                      </div>
                    </div>
                    {m.price&&<div style={{fontSize:11,fontWeight:600,color:'#374151',flexShrink:0}}>${m.price}</div>}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* fields — pre-filled if material picked, all editable */}
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8,marginBottom:10}}>
            {[
              ['Name *','item','span2'],
              ['Supplier','supplier',''],
              ['Panel type','panel_type',''],
              ['Thickness (mm)','thickness',''],
              ['Colour','colour',''],
              ['Finish','finish',''],
              ['Dimensions','dimensions',''],
              ['SKU','sku',''],
            ].map(([label,key,cls])=>(
              <div key={key} style={{gridColumn:cls==='span2'?'span 2':'auto'}}>
                <label style={{fontSize:10,fontWeight:700,color:'#9CA3AF',textTransform:'uppercase',letterSpacing:'.05em',display:'block',marginBottom:3}}>{label}</label>
                <input value={form[key]} onChange={e=>setF(key,e.target.value)}
                  style={{...inp}} placeholder={label.replace(' *','')}/>
              </div>
            ))}
          </div>

          {/* qty / unit / price row */}
          <div style={{display:'grid',gridTemplateColumns:'70px 1fr 80px',gap:8,marginBottom:10}}>
            <div>
              <label style={{fontSize:10,fontWeight:700,color:'#9CA3AF',textTransform:'uppercase',letterSpacing:'.05em',display:'block',marginBottom:3}}>Qty</label>
              <input type="number" min="0" value={form.qty} onChange={e=>setF('qty',e.target.value)}
                placeholder="0" style={inp}/>
            </div>
            <div>
              <label style={{fontSize:10,fontWeight:700,color:'#9CA3AF',textTransform:'uppercase',letterSpacing:'.05em',display:'block',marginBottom:3}}>Unit</label>
              <select value={form.unit} onChange={e=>setF('unit',e.target.value)}
                style={{...inp,cursor:'pointer',background:'#fff'}}>
                {UNITS.map(u=><option key={u}>{u}</option>)}
              </select>
            </div>
            <div>
              <label style={{fontSize:10,fontWeight:700,color:'#9CA3AF',textTransform:'uppercase',letterSpacing:'.05em',display:'block',marginBottom:3}}>Unit price</label>
              <input type="number" min="0" step="0.01" value={form.price} onChange={e=>setF('price',e.target.value)}
                placeholder="0.00" style={inp}/>
            </div>
          </div>

          <div style={{marginBottom:12}}>
            <label style={{fontSize:10,fontWeight:700,color:'#9CA3AF',textTransform:'uppercase',letterSpacing:'.05em',display:'block',marginBottom:3}}>Notes</label>
            <input value={form.notes} onChange={e=>setF('notes',e.target.value)}
              placeholder="Any additional notes…" style={inp}/>
          </div>

          {form.qty&&form.price&&(
            <div style={{fontSize:12,fontWeight:700,color:'#2A3042',background:'#F9FAFB',borderRadius:8,padding:'6px 10px',marginBottom:10}}>
              Total: ${(parseFloat(form.qty)*parseFloat(form.price)).toFixed(2)}
            </div>
          )}

          <div style={{display:'flex',gap:8}}>
            <button onClick={addItem}
              style={{flex:1,padding:'9px',borderRadius:9,border:'none',background:'#5B8AF0',color:'#fff',fontSize:13,fontWeight:700,cursor:'pointer'}}>
              Add to order sheet
            </button>
            <button onClick={()=>{setAdding(false);setForm(EMPTY_FORM);setSearch('')}}
              style={{padding:'9px 14px',borderRadius:9,border:'1px solid #E8ECF0',background:'#fff',color:'#6B7280',fontSize:13,cursor:'pointer'}}>
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <button onClick={()=>setAdding(true)}
          style={{width:'100%',fontSize:13,fontWeight:600,padding:'9px',borderRadius:10,border:'1px dashed #C4D4F8',background:'#F0F4FF',color:'#5B8AF0',cursor:'pointer'}}>
          + Add item to order
        </button>
      )}
    </div>
  )
}

export default function RoomDetail({ room: initialRoom, jobId, jobMats, allAppliances, onClose, onSave, onSyncJobTasks, inline=false }) {
  const toast = useToast()
  const { profile } = useApp()
  const navigate = useNavigate()
  const [room, setRoom]       = useState(initialRoom)
  const [roomMats, setRoomMats] = useState([])
  const [roomApps, setRoomApps] = useState([])
  const [dirty, setDirty]     = useState(false)
  const [saving, setSaving]   = useState(false)
  const [tab, setTab]         = useState('overview')
  const [newTask, setNewTask] = useState({ title:'', date:'', time:'' })
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
    ]).then(([{data:rm},{data:ra}]) => {
      setRoomMats(rm||[])
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

  async function saveRoom(data = room) {
    setSaving(true)
    const { data: saved, error } = await supabase.from('rooms')
      .update({ name: data.name, type: data.type, notes: data.notes, kitchen_specs: data.kitchen_specs, tasks: data.tasks, sort_order: data.sort_order })
      .eq('id', data.id).select().single()
    if (error) toast(error.message, 'error')
    else { setRoom(saved); setDirty(false); onSave(saved) }
    setSaving(false)
  }

  // Tasks
  const tasks = room.tasks ? (typeof room.tasks==='string'?JSON.parse(room.tasks):room.tasks) : []
  function saveTasks(updated) {
    const r = { ...room, tasks: JSON.stringify(updated) }
    setRoom(r)
    supabase.from('rooms').update({ tasks: JSON.stringify(updated) }).eq('id', room.id)
    if (onSave) onSave(r)
    // Sync to job tasks — push room tasks up to parent job
    if (onSyncJobTasks) onSyncJobTasks(room.id, room.name, updated)
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
    setRoomMats(p=>[...p,data]); setMatSearch('')
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

  const TABS = [
    { key:'overview',  label:'Overview' },
    { key:'specs',     label:'Specs' },
    { key:'tasks',     label:`Tasks${tasks.filter(t=>!t.done).length>0?` (${tasks.filter(t=>!t.done).length})`:''}` },
    { key:'materials', label:`Materials${roomMats.length>0?` (${roomMats.length})`:''}` },
    { key:'appliances',label:`Appliances${roomApps.length>0?` (${roomApps.length})`:''}` },
    { key:'orders',    label:'📋 Orders' },
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
            <div style={{ display:'flex', gap:2, overflowX:'auto', background:'#EEEFF2', borderRadius:9, padding:3 }}>
              {TABS.map(t=>(
                <button key={t.key} onClick={()=>setTab(t.key)}
                  style={{ fontSize:12, fontWeight:tab===t.key?700:500, padding:'5px 12px', borderRadius:7, border:'none', whiteSpace:'nowrap', cursor:'pointer',
                    background: tab===t.key?'#fff':'transparent',
                    color: tab===t.key?'#2A3042':'#6B7280',
                    boxShadow: tab===t.key?'0 1px 3px rgba(0,0,0,0.1)':'none' }}>
                  {t.label}
                </button>
              ))}
            </div>
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
          <div style={{ display:'flex', gap:2, padding:'8px 12px', background:'#fff', borderBottom:'1px solid #E8ECF0', overflowX:'auto', flexShrink:0 }}>
            {TABS.map(t=>(
              <button key={t.key} onClick={()=>setTab(t.key)}
                style={{ fontSize:12, fontWeight:tab===t.key?700:500, padding:'6px 14px', borderRadius:8, border:'none', background:tab===t.key?'#EEF2FF':'transparent', color:tab===t.key?'#3730A3':'#6B7280', cursor:'pointer', whiteSpace:'nowrap' }}>
                {t.label}
              </button>
            ))}
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
                <textarea value={room.notes||''} onChange={e=>setField('notes',e.target.value)}
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
                  <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8, marginBottom:10 }}>
                    <div>
                      <div style={{ fontSize:10, fontWeight:600, color:'#9CA3AF', textTransform:'uppercase', letterSpacing:'.05em', marginBottom:4 }}>Due date</div>
                      <input type="date" value={newTask.date||''} onChange={e=>setNewTask(p=>({...p,date:e.target.value}))}
                        style={{ width:'100%', fontSize:13, border:'1px solid #E8ECF0', borderRadius:7, padding:'7px 8px', outline:'none', boxSizing:'border-box' }} />
                    </div>
                    <div>
                      <div style={{ fontSize:10, fontWeight:600, color:'#9CA3AF', textTransform:'uppercase', letterSpacing:'.05em', marginBottom:4 }}>Time</div>
                      <input type="time" value={newTask.time||''} onChange={e=>setNewTask(p=>({...p,time:e.target.value}))}
                        style={{ width:'100%', fontSize:13, border:'1px solid #E8ECF0', borderRadius:7, padding:'7px 8px', outline:'none', boxSizing:'border-box' }} />
                    </div>
                  </div>
                  <div style={{ display:'flex', gap:8 }}>
                    <button onClick={addTask} style={{ flex:1, fontSize:13, fontWeight:700, padding:'8px', borderRadius:8, border:'none', background:'#5B8AF0', color:'#fff', cursor:'pointer' }}>Add task</button>
                    <button onClick={()=>{ setAddingTask(false); setNewTask({title:'',date:'',time:''}) }} style={{ fontSize:13, padding:'8px 14px', borderRadius:8, border:'1px solid #E8ECF0', background:'#fff', cursor:'pointer', color:'#6B7280' }}>Cancel</button>
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
            <div>
              {/* Available job materials not yet added to this room */}
              {filteredMats.length > 0 && (
                <div style={{ marginBottom:14 }}>
                  <div style={{ fontSize:11, fontWeight:700, color:'#9CA3AF', textTransform:'uppercase', letterSpacing:'.05em', marginBottom:8 }}>
                    Job materials — tap to add
                  </div>
                  <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
                    {filteredMats.map(jm=>(
                      <div key={jm.id} onClick={()=>addMat(jm.materials)}
                        style={{ display:'flex', alignItems:'center', gap:10, padding:'10px 14px', cursor:'pointer', fontSize:13, background:'#fff', borderRadius:10, border:'1px solid #E8ECF0', transition:'all .1s' }}
                        onMouseEnter={e=>{e.currentTarget.style.background='#F0F4FF';e.currentTarget.style.borderColor='#C4D4F8'}}
                        onMouseLeave={e=>{e.currentTarget.style.background='#fff';e.currentTarget.style.borderColor='#E8ECF0'}}>
                        {jm.materials.storage_path
                          ? <img src={pubUrl(jm.materials.storage_path)} style={{ width:36,height:36,borderRadius:8,objectFit:'cover',flexShrink:0,border:'1px solid #E8ECF0' }} alt="" />
                          : <div style={{ width:36,height:36,borderRadius:8,background:jm.materials.color||'#E8ECF0',flexShrink:0,border:'1px solid rgba(0,0,0,0.06)' }} />
                        }
                        <div style={{ flex:1, minWidth:0 }}>
                          <div style={{ fontWeight:700, color:'#2A3042', fontSize:13 }}>{jm.materials.name}</div>
                          <div style={{ fontSize:11, color:'#9CA3AF', marginTop:2 }}>
                            {[jm.materials.supplier, jm.materials.panel_type,
                              jm.materials.thickness ? jm.materials.thickness+'mm' : null,
                              jm.materials.colour_code, jm.materials.finish
                            ].filter(Boolean).join(' · ')}
                          </div>
                        </div>
                        <div style={{ width:22, height:22, borderRadius:'50%', border:'1.5px solid #C4D4F8', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
                          <span style={{ fontSize:14, color:'#5B8AF0', lineHeight:1 }}>+</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {filteredMats.length === 0 && roomMats.length === 0 && (
                <div style={{ textAlign:'center', padding:'24px 0', color:'#9CA3AF', fontSize:13 }}>
                  No materials assigned to this job yet — add materials from the job card first
                </div>
              )}
              {roomMats.length > 0 && (
                <div style={{ fontSize:11, fontWeight:700, color:'#9CA3AF', textTransform:'uppercase', letterSpacing:'.05em', marginBottom:8 }}>
                  In this room
                </div>
              )}
              {roomMats.map(rm=>{
                    const m=rm.materials; if(!m) return null
                    return (
                      <div key={rm.id} style={{ display:'flex', alignItems:'center', gap:10, padding:'10px 12px', background:'#fff', borderRadius:10, border:'1px solid #E8ECF0', marginBottom:7 }}>
                        {m.storage_path
                          ? <img src={pubUrl(m.storage_path)} style={{ width:36,height:36,borderRadius:8,objectFit:'cover',flexShrink:0,border:'1px solid #E8ECF0' }} alt="" />
                          : <div style={{ width:36,height:36,borderRadius:8,background:m.color||'#E8ECF0',flexShrink:0,border:'1px solid rgba(0,0,0,0.06)' }} />
                        }
                        <div style={{ flex:1,minWidth:0 }}>
                          <div style={{ fontSize:13,fontWeight:700,color:'#2A3042' }}>{m.name}</div>
                          <div style={{ fontSize:11,color:'#9CA3AF',marginTop:2 }}>
                            {[m.supplier,m.panel_type,m.thickness?m.thickness+'mm':null,m.colour_code,m.finish].filter(Boolean).join(' · ')}
                          </div>
                        </div>
                        <button onClick={()=>removeMat(rm.id)} style={{ background:'none',border:'none',cursor:'pointer',color:'#D1D5DB',fontSize:18 }}
                          onMouseEnter={e=>e.currentTarget.style.color='#E24B4A'} onMouseLeave={e=>e.currentTarget.style.color='#D1D5DB'}>×</button>
                      </div>
                    )
                  })
              }
            </div>
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
            <RoomOrdersTab room={room} jobId={jobId} jobMats={jobMats}
              onOpenFull={()=>{ onClose(); setTimeout(()=>navigate(`/job/${jobId}/orders?room=${room.id}`),150) }} />
          )}

        </div>
      </div>
    </div>
  )
}
