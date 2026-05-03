import { useState, useEffect, useRef } from 'react'
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
    // Load all active jobs and extract outstanding tasks
    const { data: jobs } = await supabase
      .from('jobs')
      .select('id, name, job_number, tasks')
      .in('status', ['In progress', 'Review', 'Submitted for approval'])
    
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

    // Sort: overdue first, then by date, then undated
    allTasks.sort((a, b) => {
      const da = a.date ? daysUntil(a.date) : 999
      const db = b.date ? daysUntil(b.date) : 999
      return da - db
    })

    setTasks(allTasks)
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

  return (
    <div ref={dropRef} style={{ position:'relative' }}>
      <button onClick={() => { setOpen(s=>!s); loadTasks() }}
        style={{ position:'relative', background: open?'#F3F4F6':'transparent', border:'none', cursor:'pointer', width:36, height:36, display:'flex', alignItems:'center', justifyContent:'center', borderRadius:8, color:'#374151' }}>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11"/></svg>
        <span style={{ position:'absolute', top:2, right:2, minWidth:16, height:16, borderRadius:8, padding:'0 4px',
          background: overdue > 0 ? '#E24B4A' : '#5B8AF0',
          color:'#fff', fontSize:9, fontWeight:800, display:'flex', alignItems:'center', justifyContent:'center',
          border:'2px solid #fff' }}>
          {count > 99 ? '99+' : count}
        </span>
      </button>

      {open && (
        <div style={{ position:'fixed', top:54, right:8, zIndex:600, width:380, maxWidth:'calc(100vw - 16px)',
          background:'#fff', borderRadius:14, boxShadow:'0 16px 48px rgba(0,0,0,0.2)', border:'1px solid #E8ECF0', overflow:'hidden' }}>
          <div style={{ padding:'12px 16px', borderBottom:'1px solid #F3F4F6', display:'flex', alignItems:'center', justifyContent:'space-between' }}>
            <div>
              <span style={{ fontSize:14, fontWeight:700, color:'#2A3042' }}>My Tasks</span>
              {overdue > 0 && <span style={{ marginLeft:8, fontSize:11, fontWeight:700, padding:'1px 7px', borderRadius:8, background:'#FEF2F2', color:'#991B1B' }}>{overdue} overdue</span>}
            </div>
            <span style={{ fontSize:12, color:'#9CA3AF' }}>{count} outstanding</span>
          </div>

          <div style={{ maxHeight:420, overflowY:'auto' }}>
            {tasks.length === 0 ? (
              <div style={{ padding:'32px 16px', textAlign:'center', color:'#9CA3AF', fontSize:13 }}>
                <div style={{ fontSize:28, marginBottom:8 }}>✅</div>
                All caught up!
              </div>
            ) : tasks.map(task => {
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
        </div>
      )}
    </div>
  )
}
