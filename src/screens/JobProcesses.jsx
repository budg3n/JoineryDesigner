import { useState, useEffect, useRef } from 'react'
import { supabase } from '../lib/supabase'
import { useApp } from '../context/AppContext'
import { useToast } from '../components/Toast'
import { useLiveTimer, fmtHours } from './ClockIn'

const STATUS_OPTS = ['Not started','In progress','Complete','On hold']
const STATUS_STYLES = {
  'Not started': { bg:'#F3F4F6', color:'#6B7280', border:'#E8ECF0' },
  'In progress':  { bg:'#DBEAFE', color:'#1E40AF', border:'#BFDBFE' },
  'Complete':     { bg:'#DCFCE7', color:'#166534', border:'#86EFAC' },
  'On hold':      { bg:'#FEF9C3', color:'#854D0E', border:'#FDE68A' },
}

function ProgressBar({ allocated, logged, active=0 }) {
  const total = logged + active/60
  const pct   = allocated > 0 ? Math.min((total/allocated)*100,100) : 0
  const over  = allocated > 0 && total > allocated
  const color = over ? '#E24B4A' : pct > 80 ? '#EF9F27' : '#1D9E75'
  if (!allocated && !logged) return null
  return (
    <div style={{marginTop:8}}>
      <div style={{display:'flex',justifyContent:'space-between',marginBottom:3}}>
        <span style={{fontSize:10,color:'#9CA3AF'}}>{fmtHours(total)} {allocated>0?`/ ${fmtHours(allocated)}`:''}</span>
        {over && <span style={{fontSize:10,fontWeight:700,color:'#E24B4A'}}>⚠ {fmtHours(total-allocated)} over</span>}
        {!over && allocated>0 && <span style={{fontSize:10,color:'#9CA3AF'}}>{Math.round(pct)}%</span>}
      </div>
      {allocated>0&&(
        <div style={{height:4,background:'#F3F4F6',borderRadius:2,overflow:'hidden'}}>
          <div style={{height:'100%',width:`${pct}%`,background:color,borderRadius:2,transition:'width .3s'}}/>
        </div>
      )}
    </div>
  )
}

function ProcessCard({ proc, profiles, onUpdate, onDelete, jobId }) {
  const {profile} = useApp()
  const toast = useToast()
  const [active, setActive]   = useState(null) // active time entry
  const [expanded, setExpanded] = useState(false)
  const [editNotes, setEditNotes] = useState(false)
  const [notes, setNotes]     = useState(proc.notes||'')
  const elapsed = useLiveTimer(active?.clocked_in_at)

  useEffect(()=>{
    if (!profile?.id) return
    supabase.from('time_entries').select('*')
      .eq('job_id', jobId).eq('user_id', profile.id).eq('process_id', proc.id)
      .is('clocked_out_at', null).maybeSingle()
      .then(({data})=>setActive(data))
  },[proc.id,profile?.id])

  async function clockIn() {
    const {data,error} = await supabase.from('time_entries').insert({
      job_id:jobId, user_id:profile.id, process_id:proc.id,
      clocked_in_at:new Date().toISOString()
    }).select().single()
    if (error){toast(error.message,'error');return}
    setActive(data)
    onUpdate(proc.id,{status:'In progress'})
    toast(`Clocked into ${proc.name} ✓`)
  }

  async function clockOut() {
    if (!active) return
    const mins = (Date.now()-new Date(active.clocked_in_at).getTime())/60000
    await supabase.from('time_entries').update({clocked_out_at:new Date().toISOString(),duration_minutes:Math.round(mins)}).eq('id',active.id)
    const newLogged = (parseFloat(proc.time_logged)||0)+mins/60
    onUpdate(proc.id,{time_logged:parseFloat(newLogged.toFixed(2))})
    setActive(null)
    toast(`${fmtHours(mins/60)} logged on ${proc.name}`)
  }

  const s = STATUS_STYLES[proc.status]||STATUS_STYLES['Not started']
  const assignedUser = profiles.find(p=>p.id===proc.assigned_to)

  return (
    <div style={{background:'#fff',borderRadius:12,border:`1px solid ${active?'#6EE7B7':'#E8ECF0'}`,overflow:'hidden',marginBottom:10,transition:'border-color .2s'}}>
      {/* main row */}
      <div style={{display:'flex',alignItems:'center',gap:12,padding:'12px 16px',cursor:'pointer'}} onClick={()=>setExpanded(e=>!e)}>
        {/* colour bar */}
        <div style={{width:4,height:40,borderRadius:2,background:proc.color||'#9CA3AF',flexShrink:0}}/>
        {/* info */}
        <div style={{flex:1,minWidth:0}}>
          <div style={{display:'flex',alignItems:'center',gap:8,flexWrap:'wrap'}}>
            <span style={{fontSize:14,fontWeight:700,color:'#2A3042'}}>{proc.name}</span>
            {active&&<span style={{fontSize:10,fontWeight:700,padding:'2px 7px',borderRadius:10,background:'#ECFDF5',color:'#065F46',border:'1px solid #6EE7B7',display:'flex',alignItems:'center',gap:4}}>
              <span style={{width:6,height:6,borderRadius:'50%',background:'#1D9E75',display:'inline-block',animation:'ping 1.5s infinite'}}/>
              {fmtHours(elapsed/60)} live
            </span>}
          </div>
          <ProgressBar allocated={proc.allocated_hours} logged={proc.time_logged||0} active={active?elapsed:0}/>
        </div>
        {/* status */}
        <select value={proc.status||'Not started'} onClick={e=>e.stopPropagation()}
          onChange={e=>{e.stopPropagation();onUpdate(proc.id,{status:e.target.value})}}
          style={{fontSize:11,fontWeight:700,padding:'4px 8px',border:`1px solid ${s.border}`,borderRadius:8,background:s.bg,color:s.color,cursor:'pointer',outline:'none'}}>
          {STATUS_OPTS.map(o=><option key={o}>{o}</option>)}
        </select>
        {/* clock button */}
        {active
          ? <button onClick={e=>{e.stopPropagation();clockOut()}} style={{fontSize:11,fontWeight:700,padding:'5px 10px',borderRadius:8,border:'none',background:'#1D9E75',color:'#fff',cursor:'pointer',flexShrink:0}}>Clock out</button>
          : <button onClick={e=>{e.stopPropagation();clockIn()}} style={{fontSize:11,fontWeight:600,padding:'5px 10px',borderRadius:8,border:'1px solid #DDE3EC',background:'#fff',color:'#374151',cursor:'pointer',flexShrink:0}}>Clock in</button>
        }
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#9CA3AF" strokeWidth="2"
          style={{transform:expanded?'rotate(180deg)':'rotate(0)',transition:'transform .15s',flexShrink:0}}>
          <polyline points="6 9 12 15 18 9"/>
        </svg>
      </div>

      {/* expanded */}
      {expanded&&(
        <div style={{borderTop:'1px solid #F3F4F6',padding:'12px 16px',background:'#FAFAFA'}}>
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:10,marginBottom:12}}>
            {/* allocated hours */}
            <div>
              <label style={{fontSize:10,fontWeight:700,color:'#9CA3AF',display:'block',marginBottom:4,textTransform:'uppercase'}}>Allocated hours</label>
              <input type="number" min="0" step="0.5" value={proc.allocated_hours||''} placeholder="0"
                onChange={e=>onUpdate(proc.id,{allocated_hours:parseFloat(e.target.value)||0})}
                style={{width:'100%',padding:'6px 8px',border:'1px solid #DDE3EC',borderRadius:7,fontSize:13,outline:'none',boxSizing:'border-box'}}/>
            </div>
            {/* assigned to */}
            <div>
              <label style={{fontSize:10,fontWeight:700,color:'#9CA3AF',display:'block',marginBottom:4,textTransform:'uppercase'}}>Assigned to</label>
              <select value={proc.assigned_to||''} onChange={e=>onUpdate(proc.id,{assigned_to:e.target.value||null})}
                style={{width:'100%',padding:'6px 8px',border:'1px solid #DDE3EC',borderRadius:7,fontSize:12,outline:'none',boxSizing:'border-box',background:'#fff'}}>
                <option value="">Unassigned</option>
                {profiles.map(p=><option key={p.id} value={p.id}>{p.full_name||p.email}</option>)}
              </select>
            </div>
            {/* time logged */}
            <div>
              <label style={{fontSize:10,fontWeight:700,color:'#9CA3AF',display:'block',marginBottom:4,textTransform:'uppercase'}}>Time logged</label>
              <div style={{padding:'6px 8px',border:'1px solid #E8ECF0',borderRadius:7,fontSize:13,color:'#374151',background:'#F9FAFB'}}>
                {fmtHours(proc.time_logged||0)}
              </div>
            </div>
          </div>
          {/* notes */}
          <div>
            <label style={{fontSize:10,fontWeight:700,color:'#9CA3AF',display:'block',marginBottom:4,textTransform:'uppercase'}}>Notes</label>
            {editNotes
              ? <textarea value={notes} onChange={e=>setNotes(e.target.value)} autoFocus
                  onBlur={()=>{setEditNotes(false);onUpdate(proc.id,{notes})}}
                  style={{width:'100%',border:'1px solid #DDE3EC',borderRadius:7,padding:'7px 10px',fontSize:12,outline:'none',resize:'vertical',minHeight:60,fontFamily:'inherit',boxSizing:'border-box'}}/>
              : <div onClick={()=>setEditNotes(true)} style={{padding:'7px 10px',border:'1px solid #E8ECF0',borderRadius:7,fontSize:12,color:notes?'#374151':'#C4C9D4',cursor:'text',minHeight:36,background:'#fff'}}>
                  {notes||'Click to add notes…'}
                </div>
            }
          </div>
          <div style={{display:'flex',justifyContent:'flex-end',marginTop:10}}>
            <button onClick={()=>onDelete(proc.id)} style={{fontSize:11,color:'#FCA5A5',background:'none',border:'none',cursor:'pointer',fontWeight:600}}>Delete process</button>
          </div>
        </div>
      )}
    </div>
  )
}

export default function JobProcesses({ jobId, onClose }) {
  const toast = useToast()
  const [processes, setProcesses]   = useState([])
  const [templates, setTemplates]   = useState([])
  const [profiles,  setProfiles]    = useState([])
  const [loading,   setLoading]     = useState(true)
  const [showAdd,   setShowAdd]     = useState(false)
  const saveTimer = useRef()

  useEffect(()=>{
    Promise.all([
      supabase.from('job_processes').select('*').eq('job_id',jobId).order('sort_order'),
      supabase.from('process_templates').select('*').order('sort_order'),
      supabase.from('profiles').select('id,full_name,email,role').order('full_name'),
    ]).then(([{data:p},{data:t},{data:pr}])=>{
      setProcesses(p||[]); setTemplates(t||[]); setProfiles(pr||[])
      setLoading(false)
    })
  },[jobId])

  async function addFromTemplate(tmpl) {
    const {data,error} = await supabase.from('job_processes').insert({
      job_id:jobId, template_id:tmpl.id, name:tmpl.name,
      allocated_hours:tmpl.default_hours||0, color:tmpl.color||'#9CA3AF',
      status:'Not started', time_logged:0, sort_order:processes.length,
    }).select().single()
    if (error){toast(error.message,'error');return}
    setProcesses(p=>[...p,data])
    setShowAdd(false)
  }

  async function addCustom(name) {
    const {data,error} = await supabase.from('job_processes').insert({
      job_id:jobId, name, color:'#9CA3AF',
      status:'Not started', time_logged:0, sort_order:processes.length,
    }).select().single()
    if (error){toast(error.message,'error');return}
    setProcesses(p=>[...p,data])
    setShowAdd(false)
  }

  function updateProcess(id, patch) {
    setProcesses(p=>p.map(x=>x.id===id?{...x,...patch}:x))
    clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(()=>{
      supabase.from('job_processes').update(patch).eq('id',id)
    }, 500)
  }

  async function deleteProcess(id) {
    if (!confirm('Remove this process?')) return
    await supabase.from('job_processes').delete().eq('id',id)
    setProcesses(p=>p.filter(x=>x.id!==id))
  }

  const totalAllocated = processes.reduce((a,p)=>a+(p.allocated_hours||0),0)
  const totalLogged    = processes.reduce((a,p)=>a+(p.time_logged||0),0)
  const complete       = processes.filter(p=>p.status==='Complete').length
  const remaining      = templates.filter(t=>!processes.some(p=>p.template_id===t.id))

  return (
    <div style={{position:'fixed',inset:0,zIndex:400,display:'flex',justifyContent:'flex-end',pointerEvents:'none'}}>
      <div style={{position:'absolute',inset:0,background:'rgba(0,0,0,0.35)',pointerEvents:'all'}} onClick={onClose}/>
      <div style={{position:'relative',width:'min(600px,100vw)',height:'100%',background:'#F0F2F5',boxShadow:'-8px 0 40px rgba(0,0,0,0.18)',display:'flex',flexDirection:'column',pointerEvents:'all',zIndex:1,overflow:'hidden'}}>

        {/* header */}
        <div style={{background:'#2A3042',padding:'14px 20px',flexShrink:0}}>
          <div style={{display:'flex',alignItems:'center',gap:10}}>
            <span style={{fontSize:18}}>⚙️</span>
            <div style={{flex:1}}>
              <div style={{fontSize:16,fontWeight:800,color:'#fff'}}>Job processes</div>
              {processes.length>0&&(
                <div style={{fontSize:11,color:'rgba(255,255,255,0.6)',marginTop:2}}>
                  {complete}/{processes.length} complete · {fmtHours(totalLogged)} / {fmtHours(totalAllocated)} logged
                </div>
              )}
            </div>
            <button onClick={onClose} style={{background:'rgba(255,255,255,0.15)',border:'none',cursor:'pointer',color:'#fff',width:28,height:28,borderRadius:7,fontSize:18,display:'flex',alignItems:'center',justifyContent:'center'}}>×</button>
          </div>
          {/* overall progress */}
          {totalAllocated>0&&(
            <div style={{marginTop:10}}>
              <div style={{height:6,background:'rgba(255,255,255,0.15)',borderRadius:3,overflow:'hidden'}}>
                <div style={{height:'100%',width:`${Math.min((totalLogged/totalAllocated)*100,100)}%`,background:'#1D9E75',borderRadius:3,transition:'width .3s'}}/>
              </div>
            </div>
          )}
        </div>

        {/* body */}
        <div style={{flex:1,overflowY:'auto',padding:'16px'}}>
          {loading ? <div style={{display:'flex',justifyContent:'center',padding:'40px 0'}}><div className="spinner"/></div>
          : processes.length===0&&!showAdd ? (
            <div style={{textAlign:'center',padding:'40px 16px',color:'#9CA3AF'}}>
              <div style={{fontSize:32,marginBottom:12}}>⚙️</div>
              <div style={{fontSize:14,fontWeight:600,color:'#374151',marginBottom:6}}>No processes set up</div>
              <div style={{fontSize:13,marginBottom:20}}>Add production stages to track time and progress</div>
              <button onClick={()=>setShowAdd(true)} style={{fontSize:13,fontWeight:700,padding:'9px 20px',borderRadius:9,border:'none',background:'#5B8AF0',color:'#fff',cursor:'pointer'}}>+ Add process</button>
            </div>
          ) : (
            <>
              {processes.map(p=>(
                <ProcessCard key={p.id} proc={p} profiles={profiles} jobId={jobId}
                  onUpdate={updateProcess} onDelete={deleteProcess}/>
              ))}
              <button onClick={()=>setShowAdd(s=>!s)}
                style={{width:'100%',fontSize:13,fontWeight:600,padding:'9px',borderRadius:10,border:'1px dashed #C4D4F8',background:'#F0F4FF',color:'#5B8AF0',cursor:'pointer',marginBottom:10}}>
                + Add process
              </button>
            </>
          )}

          {/* add panel */}
          {showAdd&&(
            <div style={{background:'#fff',borderRadius:12,border:'1px solid #E8ECF0',padding:16}}>
              <div style={{fontSize:13,fontWeight:700,color:'#2A3042',marginBottom:12}}>Add from templates</div>
              {remaining.length===0&&<div style={{fontSize:12,color:'#9CA3AF',marginBottom:10}}>All templates already added</div>}
              <div style={{display:'flex',flexDirection:'column',gap:7,marginBottom:12}}>
                {remaining.map(t=>(
                  <div key={t.id} onClick={()=>addFromTemplate(t)}
                    style={{display:'flex',alignItems:'center',gap:10,padding:'10px 14px',borderRadius:9,border:'1px solid #E8ECF0',cursor:'pointer',transition:'all .1s'}}
                    onMouseEnter={e=>{e.currentTarget.style.background='#F0F4FF';e.currentTarget.style.borderColor=t.color||'#C4D4F8'}}
                    onMouseLeave={e=>{e.currentTarget.style.background='#fff';e.currentTarget.style.borderColor='#E8ECF0'}}>
                    <div style={{width:12,height:12,borderRadius:'50%',background:t.color||'#9CA3AF',flexShrink:0}}/>
                    <div style={{flex:1}}>
                      <div style={{fontSize:13,fontWeight:600,color:'#2A3042'}}>{t.name}</div>
                      {t.default_hours>0&&<div style={{fontSize:11,color:'#9CA3AF'}}>{t.default_hours}h default</div>}
                    </div>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#C4C9D4" strokeWidth="2"><polyline points="9 18 15 12 9 6"/></svg>
                  </div>
                ))}
              </div>
              <div style={{borderTop:'1px solid #F3F4F6',paddingTop:12}}>
                <div style={{fontSize:12,fontWeight:600,color:'#6B7280',marginBottom:8}}>Or add a custom process:</div>
                <div style={{display:'flex',gap:8}}>
                  <input id="custom-proc" placeholder="Process name…"
                    style={{flex:1,padding:'7px 10px',border:'1px solid #DDE3EC',borderRadius:8,fontSize:13,outline:'none'}}
                    onKeyDown={e=>{if(e.key==='Enter'){addCustom(e.target.value);e.target.value=''}}}/>
                  <button onClick={()=>{const el=document.getElementById('custom-proc');if(el.value.trim()){addCustom(el.value);el.value=''}}}
                    style={{fontSize:12,fontWeight:700,padding:'7px 14px',borderRadius:8,border:'none',background:'#5B8AF0',color:'#fff',cursor:'pointer'}}>Add</button>
                </div>
              </div>
              <button onClick={()=>setShowAdd(false)} style={{marginTop:10,fontSize:12,color:'#9CA3AF',background:'none',border:'none',cursor:'pointer'}}>Cancel</button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
