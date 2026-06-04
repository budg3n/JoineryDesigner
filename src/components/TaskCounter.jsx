import { useState, useEffect, useRef } from 'react'
import { fmtDate, fmtDateLong, fmtDateTime, fmtTime } from '../lib/dates'
import { supabase } from '../lib/supabase'
import { useApp } from '../context/AppContext'
import { useNavigate } from 'react-router-dom'

const fmtNZTime = dt => {
  if (!dt) return ''
  const s = String(dt).endsWith('Z') || String(dt).includes('+') ? dt : dt + 'Z'
  const d = new Date(s)
  const off = (d.getUTCMonth() >= 4 && d.getUTCMonth() <= 8) ? 12 : 13
  const nz = new Date(d.getTime() + off * 3600000)
  return nz.getUTCDate() + ' ' + ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][nz.getUTCMonth()]
}

function daysUntil(dateStr) {
  if (!dateStr) return null
  const due = new Date(dateStr + 'T00:00:00Z')
  const now = new Date()
  const nowUTC = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate())
  return Math.ceil((due - nowUTC) / 86400000)
}

function UrgencyBadge({ days }) {
  if (days === null) return null
  if (days < 0) return <span style={{ fontSize:10, fontWeight:700, padding:'1px 6px', borderRadius:6, background:'#FEF2F2', color:'#991B1B', border:'1px solid #FCA5A5' }}>Overdue {Math.abs(days)}d</span>
  if (days === 0) return <span style={{ fontSize:10, fontWeight:700, padding:'1px 6px', borderRadius:6, background:'#FEF2F2', color:'#991B1B', border:'1px solid #FCA5A5' }}>Due today</span>
  if (days <= 3) return <span style={{ fontSize:10, fontWeight:700, padding:'1px 6px', borderRadius:6, background:'#FEF9C3', color:'#854D0E', border:'1px solid #FDE68A' }}>Due in {days}d</span>
  return <span style={{ fontSize:10, color:'#9CA3AF' }}>Due {fmtNZTime(dateStr => dateStr)}</span>
}

export default function TaskCounter() {
  const { profile } = useApp()
  const navigate = useNavigate()
  const [tasks, setTasks]     = useState([])
  const [open, setOpen]       = useState(false)
  const [confirmId, setConfirmId] = useState(null)
  const [showAdd, setShowAdd]     = useState(false)
  const [allJobs, setAllJobs]     = useState([])
  const [jobSearch, setJobSearch] = useState('')
  const [selectedJob, setSelectedJob] = useState(null)
  const [newTaskTitle, setNewTaskTitle] = useState('')
  const [newTaskDate, setNewTaskDate]   = useState('')
  const [addSaving, setAddSaving]       = useState(false)
  const taskInputRef = useRef()
  const dropRef = useRef()

  useEffect(() => {
    if (profile?.id) loadTasks()
  }, [profile?.id])

  // Close on outside click
  useEffect(() => {
    const h = e => { if (dropRef.current && !dropRef.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [])

  async function loadTasks() {
    const { data: jobs } = await supabase
      .from('jobs')
      .select('id, name, job_number, tasks')
      .in('status', ['Pending', 'In progress', 'Review', 'Submitted for approval', 'On hold'])

    if (!jobs) return

    const allTasks = []
    for (const job of jobs) {
      const jobTasks = job.tasks ? (typeof job.tasks === 'string' ? JSON.parse(job.tasks) : job.tasks) : []
      jobTasks.filter(t => !t.done).forEach(t => {
        allTasks.push({
          ...t,
          jobId: job.id,
          jobName: job.name?.replace(/^.+?[—–-]{1,2}\s*/, '') || job.name,
          jobNumber: job.job_number,
        })
      })
    }

    // Priority: overdue first, then soonest due, then undated
    allTasks.sort((a, b) => {
      const da = a.date ? daysUntil(a.date) : 999
      const db = b.date ? daysUntil(b.date) : 999
      return da - db
    })

    setTasks(allTasks)
  }

  async function addTask() {
    if (!newTaskTitle.trim() || !selectedJob) return
    setAddSaving(true)
    const { data: job } = await supabase.from('jobs').select('tasks').eq('id', selectedJob.id).single()
    const existing = job?.tasks ? (typeof job.tasks==='string'?JSON.parse(job.tasks):job.tasks) : []
    const task = { id: Date.now().toString(36)+Math.random().toString(36).slice(2), title:newTaskTitle.trim(), done:false, ...(newTaskDate?{date:newTaskDate}:{}) }
    await supabase.from('jobs').update({ tasks: JSON.stringify([...existing, task]) }).eq('id', selectedJob.id)
    setNewTaskTitle(''); setNewTaskDate(''); setSelectedJob(null); setJobSearch(''); setShowAdd(false); setAddSaving(false)
    await loadTasks()
    window.dispatchEvent(new CustomEvent('tasks-updated', { detail: { jobId: selectedJob.id } }))
  }

  async function completeTask(task) {
    // Find the job and update the task
    const { data: job } = await supabase.from('jobs').select('tasks').eq('id', task.jobId).single()
    if (!job) return
    const jobTasks = typeof job.tasks === 'string' ? JSON.parse(job.tasks) : (job.tasks || [])
    // Handle both direct tasks and room tasks (room_ prefixed ids)
    let updated
    if (task.id.startsWith('room_')) {
      // Room task — update via rooms table
      const parts = task.id.split('_') // room_{roomId}_{taskId}
      const roomId = parts[1]
      const realTaskId = parts.slice(2).join('_')
      const { data: room } = await supabase.from('rooms').select('tasks').eq('id', roomId).single()
      if (room) {
        const roomTasks = typeof room.tasks === 'string' ? JSON.parse(room.tasks) : (room.tasks || [])
        const updatedRoom = roomTasks.map(t => t.id === realTaskId ? { ...t, done: true, completed_by: profile?.full_name || 'Unknown', completed_at: new Date().toISOString() } : t)
        await supabase.from('rooms').update({ tasks: JSON.stringify(updatedRoom) }).eq('id', roomId)
      }
      updated = jobTasks.map(t => t.id === task.id ? { ...t, done: true } : t)
    } else {
      updated = jobTasks.map(t => t.id === task.id ? { ...t, done: true, completed_by: profile?.full_name || 'Unknown', completed_at: new Date().toISOString() } : t)
    }
    await supabase.from('jobs').update({ tasks: JSON.stringify(updated) }).eq('id', task.jobId)
    setTasks(p => p.filter(t => t.id !== task.id))
    setConfirmId(null)
    window.dispatchEvent(new CustomEvent('tasks-updated', { detail: { jobId: task.jobId } }))
  }

  const overdue  = tasks.filter(t => t.date && daysUntil(t.date) < 0).length
  const count    = tasks.length

  if (count === 0 && !open) return (
    <div ref={dropRef} style={{ position:'relative' }}>
      <button onClick={() => setOpen(s=>!s)}
        style={{ position:'relative', background:'transparent', border:'none', cursor:'pointer', width:36, height:36, display:'flex', alignItems:'center', justifyContent:'center', borderRadius:8, color:'#6B7280' }}>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11"/></svg>
      </button>
    </div>
  )

  return (
    <div ref={dropRef} style={{ position:'relative' }}>
      <button onClick={() => {
        setOpen(s => { const next=!s; if(next){ loadTasks(); supabase.from('jobs').select('id,name,job_number').in('status',['Pending','In progress','Review','On hold']).order('created_at',{ascending:false}).then(({data})=>setAllJobs(data||[])) }; return next })
      }}
        style={{ position:'relative', background: open?'#F3F4F6':'transparent', border:'none', cursor:'pointer', width:36, height:36, display:'flex', alignItems:'center', justifyContent:'center', borderRadius:8, color:'#374151' }}>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11"/></svg>
        <span style={{ position:'absolute', top:2, right:2, minWidth:16, height:16, borderRadius:8, padding:'0 4px',
          background: overdue > 0 ? '#E24B4A' : '#5B8AF0',
          color:'#fff', fontSize:9, fontWeight:800, display:'flex', alignItems:'center', justifyContent:'center',
          border:'2px solid #fff',
          animation: overdue > 0 ? 'task-pulse-red 1.8s ease-in-out infinite' : 'task-pulse-blue 2.5s ease-in-out infinite',
        }}>
          {count > 99 ? '99+' : count}
        </span>
        {/* Pulse ring */}
        <span style={{
          position:'absolute', top:2, right:2, width:16, height:16, borderRadius:8,
          background: overdue > 0 ? '#E24B4A' : '#5B8AF0',
          opacity:0,
          animation: overdue > 0 ? 'task-ring-red 1.8s ease-out infinite' : 'task-ring-blue 2.5s ease-out infinite',
          pointerEvents:'none',
        }} />
        <style>{`
          @keyframes task-pulse-red {
            0%, 100% { transform: scale(1); box-shadow: 0 0 0 0 rgba(226,75,74,0.7); }
            50% { transform: scale(1.15); box-shadow: 0 0 0 4px rgba(226,75,74,0); }
          }
          @keyframes task-pulse-blue {
            0%, 100% { transform: scale(1); }
            50% { transform: scale(1.1); }
          }
          @keyframes task-ring-red {
            0% { transform: scale(1); opacity: 0.6; }
            100% { transform: scale(2.8); opacity: 0; }
          }
          @keyframes task-ring-blue {
            0% { transform: scale(1); opacity: 0.4; }
            100% { transform: scale(2.4); opacity: 0; }
          }
        `}</style>
      </button>

      {open && (
        <div style={{ position:'fixed', top:54, right:8, zIndex:600, width:380, maxWidth:'calc(100vw - 16px)',
          maxHeight:'calc(100vh - 70px)', overflowY:'auto', background:'#fff', borderRadius:14, boxShadow:'0 16px 48px rgba(0,0,0,0.2)', border:'1px solid #E8ECF0', overflow:'hidden' }}>
          <div style={{ padding:'12px 16px', borderBottom:'1px solid #F3F4F6', display:'flex', alignItems:'center', justifyContent:'space-between' }}>
            <div>
              <span style={{ fontSize:14, fontWeight:700, color:'#2A3042' }}>My Tasks</span>
              {overdue > 0 && <span style={{ marginLeft:8, fontSize:11, fontWeight:700, padding:'1px 7px', borderRadius:8, background:'#FEF2F2', color:'#991B1B' }}>{overdue} overdue</span>}
            </div>
            <span style={{ fontSize:12, color:'#9CA3AF' }}>{count} outstanding</span>
          </div>

          <div style={{ maxHeight:380, overflowY:'auto' }}>
            {tasks.length === 0 ? (
              <div style={{ padding:'32px 16px', textAlign:'center', color:'#9CA3AF', fontSize:13 }}>
                <div style={{ fontSize:28, marginBottom:8 }}>✅</div>
                All caught up!
              </div>
            ) : tasks.slice(0, 3).map(task => {
              const days = task.date ? daysUntil(task.date) : null
              const isOverdue = days !== null && days < 0
              const isUrgent  = days !== null && days <= 3
              const isConfirming = confirmId === task.id

              return (
                <div key={task.id} style={{ padding:'10px 16px', borderBottom:'1px solid #F9FAFB',
                  background: isConfirming ? '#F0FDF4' : isOverdue ? '#FFF9F9' : '#fff' }}>
                  {isConfirming ? (
                    <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                      <div style={{ flex:1, fontSize:13, color:'#374151' }}>Mark "<b>{task.title}</b>" complete?</div>
                      <button onClick={() => completeTask(task)}
                        style={{ fontSize:12, fontWeight:700, padding:'5px 12px', borderRadius:8, border:'none', background:'#1D9E75', color:'#fff', cursor:'pointer' }}>✓ Yes</button>
                      <button onClick={() => setConfirmId(null)}
                        style={{ fontSize:12, fontWeight:600, padding:'5px 10px', borderRadius:8, border:'1px solid #E8ECF0', background:'#fff', color:'#6B7280', cursor:'pointer' }}>No</button>
                    </div>
                  ) : (
                    <div style={{ display:'flex', alignItems:'flex-start', gap:10 }}>
                      <button onClick={() => setConfirmId(task.id)}
                        style={{ width:18, height:18, borderRadius:4, border:`1.5px solid ${isOverdue?'#FCA5A5':'#DDE3EC'}`, background:'#fff', cursor:'pointer', flexShrink:0, marginTop:2, display:'flex', alignItems:'center', justifyContent:'center' }} />
                      <div style={{ flex:1, minWidth:0, cursor:'pointer' }} onClick={() => { navigate(`/job/${task.jobId}`); setOpen(false) }}>
                        <div style={{ fontSize:13, fontWeight:600, color:'#2A3042', marginBottom:3 }}>{task.title}</div>
                        <div style={{ display:'flex', flexWrap:'wrap', gap:5, alignItems:'center' }}>
                          <span style={{ fontSize:11, color:'#9CA3AF' }}>{task.jobName}{task.jobNumber ? ` · #${task.jobNumber}` : ''}</span>
                          {task.room_name && <span style={{ fontSize:10, fontWeight:600, padding:'1px 6px', borderRadius:6, background:'#F0FDF4', color:'#065F46', border:'1px solid #86EFAC' }}>🏠 {task.room_name}</span>}
                          {days !== null && (
                            <span style={{ fontSize:10, fontWeight:700, padding:'1px 6px', borderRadius:6,
                              background: isOverdue?'#FEF2F2':isUrgent?'#FEF9C3':'#F3F4F6',
                              color: isOverdue?'#991B1B':isUrgent?'#854D0E':'#6B7280',
                              border: isOverdue?'1px solid #FCA5A5':isUrgent?'1px solid #FDE68A':'1px solid #E8ECF0' }}>
                              {isOverdue ? `Overdue ${Math.abs(days)}d` : days === 0 ? 'Due today' : `Due in ${days}d`}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )
            })}
          </div>

          {tasks.length > 3 && (
            <div style={{ padding:'8px 16px', borderTop:'1px solid #F9FAFB', textAlign:'center' }}>
              <button onClick={()=>{ navigate('/'); setOpen(false) }}
                style={{ fontSize:11, fontWeight:700, color:'#5B8AF0', background:'none', border:'none', cursor:'pointer' }}>
                +{tasks.length - 3} more tasks · View all →
              </button>
            </div>
          )}

          {/* Add task footer */}
          {!showAdd ? (
            <div style={{ padding:'10px 16px', borderTop:'1px solid #F3F4F6' }}>
              <button onClick={()=>{ setShowAdd(true); setJobSearch(''); setSelectedJob(null); setNewTaskTitle(''); setNewTaskDate('') }}
                style={{ width:'100%', padding:'8px', borderRadius:9, border:'1.5px dashed #C4D4F8', background:'transparent', color:'#5B8AF0', fontSize:12, fontWeight:700, cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', gap:5 }}
                onMouseEnter={e=>e.currentTarget.style.background='#EEF2FF'} onMouseLeave={e=>e.currentTarget.style.background='transparent'}>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                Add task to a job
              </button>
            </div>
          ) : (
            <div style={{ padding:'12px 16px', borderTop:'1px solid #F3F4F6', background:'#F8FAFF' }}>
              <div style={{ fontSize:11, fontWeight:700, color:'#5B8AF0', marginBottom:10, display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                <span>Add task</span>
                <button onClick={()=>setShowAdd(false)} style={{ background:'none', border:'none', cursor:'pointer', color:'#9CA3AF', fontSize:16 }}>×</button>
              </div>

              {/* Job search / selector */}
              {!selectedJob ? (
                <div style={{ marginBottom:10 }}>
                  <div style={{ position:'relative' }}>
                    <svg style={{ position:'absolute', left:9, top:'50%', transform:'translateY(-50%)', pointerEvents:'none' }} width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#9CA3AF" strokeWidth="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
                    <input autoFocus value={jobSearch} onChange={e=>setJobSearch(e.target.value)}
                      placeholder="Search for a job…"
                      style={{ width:'100%', padding:'7px 10px 7px 28px', border:'1px solid #DDE3EC', borderRadius:8, fontSize:12, outline:'none', boxSizing:'border-box' }} />
                  </div>
                  {jobSearch.trim() && (
                    <div style={{ maxHeight:140, overflowY:'auto', marginTop:4, borderRadius:8, border:'1px solid #E8ECF0', background:'#fff', boxShadow:'0 4px 12px rgba(0,0,0,0.08)' }}>
                      {allJobs.filter(j=>{
                        const q=jobSearch.toLowerCase()
                        return j.name?.toLowerCase().includes(q)||String(j.job_number||'').includes(q)
                      }).slice(0,6).map(j=>(
                        <div key={j.id} onClick={()=>{ setSelectedJob(j); setJobSearch(''); setTimeout(()=>taskInputRef.current?.focus(),50) }}
                          style={{ padding:'8px 12px', cursor:'pointer', fontSize:12, color:'#2A3042', borderBottom:'1px solid #F9FAFB' }}
                          onMouseEnter={e=>e.currentTarget.style.background='#F0F4FF'}
                          onMouseLeave={e=>e.currentTarget.style.background='transparent'}>
                          {j.job_number&&<span style={{ color:'#9CA3AF', marginRight:5 }}>#{j.job_number}</span>}
                          {j.name?.replace(/^\d+\s*[-–—]\s*/,'')||j.name}
                        </div>
                      ))}
                      {allJobs.filter(j=>{ const q=jobSearch.toLowerCase(); return j.name?.toLowerCase().includes(q)||String(j.job_number||'').includes(q) }).length===0&&(
                        <div style={{ padding:'10px 12px', fontSize:12, color:'#9CA3AF' }}>No jobs found</div>
                      )}
                    </div>
                  )}
                </div>
              ) : (
                <div style={{ display:'flex', alignItems:'center', gap:6, padding:'5px 10px', background:'#EEF2FF', borderRadius:8, marginBottom:10, border:'1px solid #C4D4F8' }}>
                  <div style={{ flex:1, fontSize:12, fontWeight:600, color:'#3730A3' }}>
                    {selectedJob.job_number&&<span style={{ opacity:0.6, marginRight:4 }}>#{selectedJob.job_number}</span>}
                    {selectedJob.name?.replace(/^\d+\s*[-–—]\s*/,'')||selectedJob.name}
                  </div>
                  <button onClick={()=>setSelectedJob(null)} style={{ background:'none', border:'none', cursor:'pointer', color:'#9CA3AF', fontSize:14 }}>×</button>
                </div>
              )}

              {/* Task details */}
              <div style={{ display:'flex', gap:7, flexDirection:'column' }}>
                <input ref={taskInputRef} value={newTaskTitle} onChange={e=>setNewTaskTitle(e.target.value)}
                  onKeyDown={e=>e.key==='Enter'&&!e.shiftKey&&addTask()}
                  placeholder="Task description…"
                  style={{ width:'100%', padding:'7px 10px', border:'1px solid #DDE3EC', borderRadius:8, fontSize:12, outline:'none', boxSizing:'border-box' }} />
                <div style={{ display:'flex', gap:7 }}>
                  <input type="date" value={newTaskDate} onChange={e=>setNewTaskDate(e.target.value)}
                    style={{ flex:1, padding:'6px 8px', border:'1px solid #DDE3EC', borderRadius:8, fontSize:12, outline:'none', color:'#374151', WebkitAppearance:'none', appearance:'none', background:'#fff' }} />
                  <button onClick={addTask} disabled={!newTaskTitle.trim()||!selectedJob||addSaving}
                    style={{ fontSize:12, fontWeight:700, padding:'6px 14px', borderRadius:8, border:'none',
                      background:(newTaskTitle.trim()&&selectedJob)?'#5B8AF0':'#E8ECF0',
                      color:(newTaskTitle.trim()&&selectedJob)?'#fff':'#9CA3AF',
                      cursor:(newTaskTitle.trim()&&selectedJob)?'pointer':'not-allowed', whiteSpace:'nowrap' }}>
                    {addSaving ? 'Adding…' : 'Add task'}
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
