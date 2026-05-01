import { useState, useEffect, useRef } from 'react'
import { supabase } from '../lib/supabase'
import { useApp } from '../context/AppContext'
import { useToast } from '../components/Toast'
import { useLiveTimer, fmtHours } from './ClockIn'

const STATUS_OPTS = ['Not started','In progress','Complete','On hold']
const STATUS_STYLE = {
  'Not started': { bg:'#F3F4F6', color:'#6B7280' },
  'In progress':  { bg:'#DBEAFE', color:'#1E40AF' },
  'Complete':     { bg:'#DCFCE7', color:'#166534' },
  'On hold':      { bg:'#FEF9C3', color:'#854D0E' },
}

function ProgressBar({ allocated, logged, activeElapsed=0 }) {
  const total = logged + activeElapsed / 3600
  const pct = allocated > 0 ? Math.min((total / allocated) * 100, 100) : 0
  const over = allocated > 0 && total > allocated
  const color = over ? '#E24B4A' : pct > 80 ? '#EF9F27' : '#1D9E75'
  if (!allocated && !logged && !activeElapsed) return null
  return (
    <div style={{ marginTop:6 }}>
      <div style={{ display:'flex', justifyContent:'space-between', marginBottom:2 }}>
        <span style={{ fontSize:10, color:'#9CA3AF' }}>
          {fmtHours(total)} {allocated > 0 ? `/ ${fmtHours(allocated)} allocated` : 'logged'}
        </span>
        {over && <span style={{ fontSize:10, color:'#E24B4A', fontWeight:700 }}>⚠ Over by {fmtHours(total - allocated)}</span>}
        {!over && allocated > 0 && <span style={{ fontSize:10, color:'#9CA3AF' }}>{Math.round(pct)}%</span>}
      </div>
      {allocated > 0 && (
        <div style={{ height:4, background:'#F3F4F6', borderRadius:2, overflow:'hidden' }}>
          <div style={{ height:'100%', width:`${pct}%`, background:color, borderRadius:2, transition:'width .3s' }} />
        </div>
      )}
    </div>
  )
}

// ── Active process banner shown at top of job card ────────────────
export function ActiveProcessBanner({ jobId }) {
  const { profile } = useApp()
  const toast = useToast()
  const [active, setActive] = useState(null) // {entry, process}
  const elapsed = useLiveTimer(active?.entry?.clocked_in_at)

  useEffect(() => {
    if (!profile?.id) return
    supabase.from('time_entries')
      .select('*, job_processes(id,name,allocated_hours,time_logged,color)')
      .eq('job_id', jobId).eq('user_id', profile.id)
      .is('clocked_out_at', null).maybeSingle()
      .then(({ data }) => {
        if (data) setActive({ entry: data, process: data.job_processes })
      })
  }, [jobId, profile?.id])

  async function clockOut() {
    if (!active) return
    const mins = elapsed / 60
    await supabase.from('time_entries').update({
      clocked_out_at: new Date().toISOString(),
      duration_minutes: Math.round(mins)
    }).eq('id', active.entry.id)
    if (active.process?.id) {
      const newLogged = (parseFloat(active.process.time_logged) || 0) + mins / 60
      await supabase.from('job_processes').update({ time_logged: parseFloat(newLogged.toFixed(2)), status: 'In progress' }).eq('id', active.process.id)
    }
    toast(`${fmtHours(mins / 60)} logged on ${active.process?.name || 'process'} ✓`)
    setActive(null)
  }

  if (!active) return null

  const proc = active.process
  const allocated = parseFloat(proc?.allocated_hours) || 0
  const logged = parseFloat(proc?.time_logged) || 0
  const totalH = logged + elapsed / 3600
  const remaining = allocated > 0 ? Math.max(0, allocated - totalH) : null

  return (
    <div style={{ background:'linear-gradient(135deg,#065F46,#1D9E75)', borderRadius:12, padding:'12px 16px', marginBottom:16, display:'flex', alignItems:'center', gap:12 }}>
      <div style={{ width:10, height:10, borderRadius:'50%', background:'#6EE7B7', flexShrink:0, boxShadow:'0 0 0 3px rgba(110,231,183,0.3)', animation:'ping 1.5s infinite' }} />
      <div style={{ flex:1, minWidth:0 }}>
        <div style={{ fontSize:13, fontWeight:700, color:'#fff' }}>{proc?.name || 'Process'} — in progress</div>
        <div style={{ fontSize:12, color:'rgba(255,255,255,0.8)', marginTop:2, display:'flex', gap:12, flexWrap:'wrap' }}>
          <span>⏱ {fmtHours(elapsed / 3600)} this session</span>
          {remaining !== null && <span>⏳ {fmtHours(remaining)} remaining</span>}
          {remaining === null && <span>🕐 {fmtHours(totalH)} total logged</span>}
        </div>
      </div>
      <button onClick={clockOut}
        style={{ fontSize:12, fontWeight:700, padding:'7px 14px', borderRadius:9, border:'none', background:'rgba(255,255,255,0.2)', color:'#fff', cursor:'pointer', flexShrink:0, backdropFilter:'blur(4px)', whiteSpace:'nowrap' }}>
        Clock out
      </button>
    </div>
  )
}

// ── Processes dropdown panel ──────────────────────────────────────
export default function JobProcesses({ jobId, onClose }) {
  const { profile } = useApp()
  const toast = useToast()
  const [processes, setProcesses] = useState([])
  const [templates, setTemplates] = useState([])
  const [profiles, setProfiles]   = useState([])
  const [loading, setLoading]     = useState(true)
  const [activeEntries, setActiveEntries] = useState({}) // processId -> entry
  const [showAdd, setShowAdd]     = useState(false)
  const [newProc, setNewProc]     = useState({ name:'', allocated_hours:'', color:'#5B8AF0' })
  const panelRef = useRef()
  const saveTimer = useRef()

  useEffect(() => {
    if (!jobId) return
    Promise.all([
      supabase.from('job_processes').select('*').eq('job_id', jobId).order('sort_order'),
      supabase.from('process_templates').select('*').order('sort_order'),
      supabase.from('profiles').select('id,full_name,email').order('full_name'),
      supabase.from('time_entries').select('*').eq('job_id', jobId).is('clocked_out_at', null),
    ]).then(([{data:p},{data:t},{data:pr},{data:ae}]) => {
      setProcesses(p||[])
      setTemplates(t||[])
      setProfiles(pr||[])
      const map = {}
      ;(ae||[]).forEach(e => { if (e.process_id) map[e.process_id] = e })
      setActiveEntries(map)
      setLoading(false)
    })
  }, [jobId])

  // Close on outside click
  useEffect(() => {
    const handler = e => { if (panelRef.current && !panelRef.current.contains(e.target)) onClose() }
    setTimeout(() => document.addEventListener('mousedown', handler), 100)
    return () => document.removeEventListener('mousedown', handler)
  }, [onClose])

  function update(id, patch) {
    setProcesses(p => p.map(x => x.id === id ? {...x,...patch} : x))
    clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(() => supabase.from('job_processes').update(patch).eq('id', id), 600)
  }

  async function clockIn(proc) {
    if (activeEntries[proc.id]) { toast('Already clocked in','error'); return }
    // Clock out of any other active entry first
    for (const [pid, entry] of Object.entries(activeEntries)) {
      const mins = (Date.now() - new Date(entry.clocked_in_at).getTime()) / 60000
      await supabase.from('time_entries').update({ clocked_out_at: new Date().toISOString(), duration_minutes: Math.round(mins) }).eq('id', entry.id)
      const p = processes.find(x => x.id === pid)
      if (p) await supabase.from('job_processes').update({ time_logged: parseFloat(((p.time_logged||0) + mins/60).toFixed(2)) }).eq('id', pid)
    }
    const { data, error } = await supabase.from('time_entries').insert({
      job_id: jobId, user_id: profile.id, process_id: proc.id,
      clocked_in_at: new Date().toISOString()
    }).select().single()
    if (error) { toast(error.message,'error'); return }
    setActiveEntries({ [proc.id]: data })
    update(proc.id, { status: 'In progress' })
    toast(`Started ${proc.name} ✓`)
    onClose()
  }

  async function clockOut(proc) {
    const entry = activeEntries[proc.id]
    if (!entry) return
    const mins = (Date.now() - new Date(entry.clocked_in_at).getTime()) / 60000
    await supabase.from('time_entries').update({ clocked_out_at: new Date().toISOString(), duration_minutes: Math.round(mins) }).eq('id', entry.id)
    const newLogged = parseFloat(((proc.time_logged||0) + mins/60).toFixed(2))
    update(proc.id, { time_logged: newLogged })
    const { [proc.id]: _, ...rest } = activeEntries
    setActiveEntries(rest)
    toast(`${fmtHours(mins/60)} logged ✓`)
  }

  async function addProcess(fromTemplate) {
    const name = fromTemplate ? fromTemplate.name : newProc.name.trim()
    if (!name) return
    const { data, error } = await supabase.from('job_processes').insert({
      job_id: jobId, name,
      template_id: fromTemplate?.id || null,
      allocated_hours: parseFloat(fromTemplate?.default_hours || newProc.allocated_hours) || 0,
      color: fromTemplate?.color || newProc.color || '#9CA3AF',
      status: 'Not started', time_logged: 0, sort_order: processes.length,
    }).select().single()
    if (error) { toast(error.message,'error'); return }
    setProcesses(p => [...p, data])
    setNewProc({ name:'', allocated_hours:'', color:'#5B8AF0' })
    setShowAdd(false)
    toast(`${name} added ✓`)
  }

  const already = processes.map(p => p.template_id)
  const availTemplates = templates.filter(t => !already.includes(t.id))

  const totalAllocated = processes.reduce((a,p) => a+(p.allocated_hours||0), 0)
  const totalLogged    = processes.reduce((a,p) => a+(p.time_logged||0), 0)
  const complete       = processes.filter(p => p.status==='Complete').length

  if (!jobId) return null

  return (
    <div ref={panelRef} style={{ position:'absolute', top:'calc(100% + 8px)', left:0, zIndex:500, width:480, maxWidth:'calc(100vw - 32px)', background:'#fff', borderRadius:16, boxShadow:'0 16px 48px rgba(0,0,0,0.18)', border:'1px solid #E8ECF0', overflow:'hidden' }}>
      {/* header */}
      <div style={{ background:'#2A3042', padding:'14px 18px', display:'flex', alignItems:'center', gap:10 }}>
        <span style={{ fontSize:16 }}>⚙️</span>
        <div style={{ flex:1 }}>
          <div style={{ fontSize:14, fontWeight:800, color:'#fff' }}>Job processes</div>
          {processes.length > 0 && (
            <div style={{ fontSize:11, color:'rgba(255,255,255,0.6)', marginTop:1 }}>
              {complete}/{processes.length} complete · {fmtHours(totalLogged)}/{fmtHours(totalAllocated)} logged
            </div>
          )}
        </div>
        {totalAllocated > 0 && (
          <div style={{ fontSize:11, fontWeight:700, padding:'3px 10px', borderRadius:10, background: complete===processes.length?'#1D9E75':'rgba(255,255,255,0.15)', color:'#fff' }}>
            {Math.round((totalLogged/totalAllocated)*100)}%
          </div>
        )}
        <button onClick={onClose} style={{ background:'rgba(255,255,255,0.15)', border:'none', cursor:'pointer', color:'#fff', width:26, height:26, borderRadius:6, fontSize:16, display:'flex', alignItems:'center', justifyContent:'center' }}>×</button>
      </div>

      <div style={{ maxHeight:'65vh', overflowY:'auto' }}>
        {loading ? (
          <div style={{ textAlign:'center', padding:'32px 0', color:'#9CA3AF' }}>Loading…</div>
        ) : processes.length === 0 && !showAdd ? (
          <div style={{ textAlign:'center', padding:'32px 16px', color:'#9CA3AF' }}>
            <div style={{ fontSize:28, marginBottom:8 }}>⚙️</div>
            <div style={{ fontSize:13, fontWeight:600, color:'#374151', marginBottom:4 }}>No processes yet</div>
            <div style={{ fontSize:12, marginBottom:16 }}>Add production stages to track time per phase</div>
            <button onClick={() => setShowAdd(true)} style={{ fontSize:13, fontWeight:700, padding:'8px 20px', borderRadius:9, border:'none', background:'#5B8AF0', color:'#fff', cursor:'pointer' }}>+ Add process</button>
          </div>
        ) : (
          <div>
            {processes.map(proc => {
              const isActive = !!activeEntries[proc.id]
              const ss = STATUS_STYLE[proc.status] || STATUS_STYLE['Not started']
              return (
                <div key={proc.id} style={{ padding:'12px 18px', borderBottom:'1px solid #F3F4F6', background: isActive ? '#F0FDF4' : '#fff', transition:'background .2s' }}>
                  <div style={{ display:'flex', alignItems:'center', gap:10 }}>
                    {/* colour + active indicator */}
                    <div style={{ position:'relative', flexShrink:0 }}>
                      <div style={{ width:12, height:12, borderRadius:'50%', background: proc.color||'#9CA3AF' }} />
                      {isActive && <div style={{ position:'absolute', inset:-3, borderRadius:'50%', border:'2px solid #1D9E75', animation:'ping 1.5s infinite' }} />}
                    </div>
                    <div style={{ flex:1, minWidth:0 }}>
                      <div style={{ display:'flex', alignItems:'center', gap:6, flexWrap:'wrap' }}>
                        <span style={{ fontSize:13, fontWeight:700, color:'#2A3042' }}>{proc.name}</span>
                        {isActive && <span style={{ fontSize:10, fontWeight:700, padding:'1px 7px', borderRadius:8, background:'#ECFDF5', color:'#065F46', border:'1px solid #6EE7B7' }}>● Active</span>}
                        <select value={proc.status} onClick={e=>e.stopPropagation()}
                          onChange={e => update(proc.id, {status:e.target.value})}
                          style={{ fontSize:10, fontWeight:700, padding:'2px 6px', border:`1px solid ${ss.bg}`, borderRadius:8, background:ss.bg, color:ss.color, cursor:'pointer', outline:'none', marginLeft:'auto' }}>
                          {STATUS_OPTS.map(o => <option key={o}>{o}</option>)}
                        </select>
                      </div>
                      <ProgressBar allocated={proc.allocated_hours||0} logged={proc.time_logged||0} />
                    </div>
                    {/* hours input */}
                    <div style={{ display:'flex', alignItems:'center', gap:4, flexShrink:0 }}>
                      <input type="number" min="0" step="0.5" value={proc.allocated_hours||''}
                        onChange={e => update(proc.id, {allocated_hours:parseFloat(e.target.value)||0})}
                        placeholder="hrs"
                        style={{ width:48, padding:'4px 6px', border:'1px solid #E8ECF0', borderRadius:7, fontSize:11, outline:'none', textAlign:'center' }} />
                      <span style={{ fontSize:10, color:'#9CA3AF' }}>hrs</span>
                    </div>
                    {/* clock button */}
                    {isActive ? (
                      <div style={{ display:'flex', gap:5, flexShrink:0 }}>
                        <button onClick={() => { clockOut(proc); update(proc.id,{status:'On hold'}) }}
                          style={{ fontSize:11, fontWeight:700, padding:'5px 8px', borderRadius:8, border:'1px solid #FDE68A', background:'#FEF9C3', color:'#854D0E', cursor:'pointer', whiteSpace:'nowrap' }}>
                          ⏸ Hold
                        </button>
                        <button onClick={() => clockOut(proc)}
                          style={{ fontSize:11, fontWeight:700, padding:'5px 8px', borderRadius:8, border:'none', background:'#1D9E75', color:'#fff', cursor:'pointer', whiteSpace:'nowrap' }}>
                          ■ Stop
                        </button>
                      </div>
                    ) : (
                      <button onClick={() => clockIn(proc)}
                        style={{ fontSize:11, fontWeight:700, padding:'5px 10px', borderRadius:8, border:'1px solid #C4D4F8', background:'#EEF2FF', color:'#3730A3', cursor:'pointer', flexShrink:0, whiteSpace:'nowrap' }}>
                        ▶ Start
                      </button>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}

        {/* add section */}
        {showAdd && (
          <div style={{ padding:'14px 18px', borderTop:'1px solid #F3F4F6', background:'#FAFAFA' }}>
            {availTemplates.length > 0 && (
              <>
                <div style={{ fontSize:11, fontWeight:700, color:'#9CA3AF', textTransform:'uppercase', letterSpacing:'.05em', marginBottom:8 }}>From templates</div>
                <div style={{ display:'flex', flexDirection:'column', gap:6, marginBottom:12 }}>
                  {availTemplates.map(t => (
                    <div key={t.id} onClick={() => addProcess(t)}
                      style={{ display:'flex', alignItems:'center', gap:10, padding:'9px 12px', borderRadius:9, border:'1px solid #E8ECF0', cursor:'pointer', background:'#fff', transition:'all .1s' }}
                      onMouseEnter={e=>{e.currentTarget.style.background='#F0F4FF';e.currentTarget.style.borderColor=t.color||'#C4D4F8'}}
                      onMouseLeave={e=>{e.currentTarget.style.background='#fff';e.currentTarget.style.borderColor='#E8ECF0'}}>
                      <div style={{ width:10, height:10, borderRadius:'50%', background:t.color||'#9CA3AF', flexShrink:0 }} />
                      <div style={{ flex:1 }}>
                        <div style={{ fontSize:12, fontWeight:600, color:'#2A3042' }}>{t.name}</div>
                        {t.default_hours > 0 && <div style={{ fontSize:10, color:'#9CA3AF' }}>{t.default_hours}h default</div>}
                      </div>
                      <span style={{ fontSize:11, color:'#5B8AF0', fontWeight:600 }}>+ Add</span>
                    </div>
                  ))}
                </div>
              </>
            )}
            <div style={{ fontSize:11, fontWeight:700, color:'#9CA3AF', textTransform:'uppercase', letterSpacing:'.05em', marginBottom:8 }}>Custom process</div>
            <div style={{ display:'flex', gap:8 }}>
              <input value={newProc.name} onChange={e=>setNewProc(p=>({...p,name:e.target.value}))}
                onKeyDown={e=>e.key==='Enter'&&addProcess()}
                placeholder="Process name…" autoFocus
                style={{ flex:1, padding:'7px 10px', border:'1px solid #DDE3EC', borderRadius:8, fontSize:12, outline:'none' }} />
              <input type="number" min="0" step="0.5" value={newProc.allocated_hours}
                onChange={e=>setNewProc(p=>({...p,allocated_hours:e.target.value}))}
                placeholder="hrs"
                style={{ width:56, padding:'7px 8px', border:'1px solid #DDE3EC', borderRadius:8, fontSize:12, outline:'none', textAlign:'center' }} />
              <button onClick={()=>addProcess()}
                style={{ padding:'7px 14px', borderRadius:8, border:'none', background:'#5B8AF0', color:'#fff', fontSize:12, fontWeight:700, cursor:'pointer' }}>Add</button>
            </div>
            <button onClick={()=>setShowAdd(false)} style={{ marginTop:8, fontSize:11, color:'#9CA3AF', background:'none', border:'none', cursor:'pointer' }}>Cancel</button>
          </div>
        )}

        {/* footer */}
        {!showAdd && processes.length > 0 && (
          <div style={{ padding:'10px 18px', borderTop:'1px solid #F3F4F6', background:'#FAFAFA' }}>
            <button onClick={() => setShowAdd(true)}
              style={{ fontSize:12, fontWeight:600, padding:'7px 16px', borderRadius:9, border:'1px dashed #C4D4F8', background:'#F0F4FF', color:'#5B8AF0', cursor:'pointer', width:'100%' }}>
              + Add process
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
