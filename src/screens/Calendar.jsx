import { useState, useEffect, useRef, useCallback } from 'react'
import { fmtDate, fmtDateLong, fmtDateTime, fmtTime } from '../lib/dates'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useApp } from '../context/AppContext'
import { useToast } from '../components/Toast'
import BackButton from '../components/BackButton'

const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December']
const PALETTE = ['#378ADD','#1D9E75','#EF9F27','#7F77DD','#E24B4A','#D4537E','#5DCAA5']
const TODAY   = new Date(); TODAY.setHours(0,0,0,0)

function fmtHMS(s){ const h=Math.floor(s/3600),m=Math.floor((s%3600)/60),sc=s%60; return`${h}:${String(m).padStart(2,'0')}:${String(sc).padStart(2,'0')}` }
function fmtHM(s){ return`${Math.floor(s/3600)}h ${String(Math.floor((s%3600)/60)).padStart(2,'0')}m` }

export default function Calendar() {
  const navigate = useNavigate()
  const toast    = useToast()

  const [jobs, setJobs]       = useState([])
  const [loading, setLoading] = useState(true)
  const [assignments, setAssignments] = useState([])  // {job_id, user_id}
  const [profiles, setProfiles]   = useState({})
  const { profile } = useApp()
  const [weekOffset, setWeekOffset] = useState(0)  // 0=current week, -1=prev, +1=next
  const [myProcesses, setMyProcesses] = useState([])
  const [view, setView]       = useState(() => new URLSearchParams(window.location.search).get('view') || 'gantt')
  const [calYear, setCalYear] = useState(TODAY.getFullYear())
  const [calMonth, setCalMonth] = useState(TODAY.getMonth())
  const [clockJobId, setClockJobId] = useState(null)
  const [clockState, setClockState] = useState('off') // off | in | hold
  const [clockSecs, setClockSecs]   = useState(0)
  const [clockLog, setClockLog]     = useState([])
  const intervalRef = useRef(null)
  const [taskJobFilter, setTaskJobFilter]   = useState('all')
  const [taskStatusFilter, setTaskStatusFilter] = useState('all')

  function loadProcesses() {
    supabase.from('job_processes').select('id,name,job_id,assigned_to,status,due_date,jobs(id,name,job_number,start_date,due_date,status)')
      .not('assigned_to','is',null).neq('status','Complete')
      .then(({data})=>setMyProcesses(data||[]))
  }

  useEffect(() => {
    supabase.from('job_assignments').select('job_id,user_id').then(({data})=>setAssignments(data||[]))
    supabase.from('profiles').select('id,full_name,email').then(({data})=>{
      const map = {}
      ;(data||[]).forEach(p=>{ map[p.id] = p.full_name || p.email || '?' })
      setProfiles(map)
    })
    loadProcesses()
    supabase.from('jobs').select('*').order('created_at',{ascending:false}).then(({ data }) => {
      setJobs(data || [])
      setLoading(false)
    })

    // Re-fetch whenever processes are added or changed anywhere in the app
    window.addEventListener('processes-updated', loadProcesses)
    window.addEventListener('process-clock-change', loadProcesses)
    return () => {
      window.removeEventListener('processes-updated', loadProcesses)
      window.removeEventListener('process-clock-change', loadProcesses)
    }
  }, [])

  const jobColor = (j, i) => PALETTE[i % PALETTE.length]

  // ── mini cal ──
  function changeMonth(d) {
    let m = calMonth + d, y = calYear
    if (m > 11) { m = 0; y++ }
    if (m < 0)  { m = 11; y-- }
    setCalMonth(m); setCalYear(y)
  }

  const daysInMonth = new Date(calYear, calMonth+1, 0).getDate()
  const firstDay    = (new Date(calYear, calMonth, 1).getDay() + 6) % 7

  const busyDays = new Set()
  jobs.forEach(j => {
    const tasks = j.tasks ? JSON.parse(j.tasks) : []
    tasks.forEach(t => {
      if (!t.date) return
      const d = new Date(t.date)
      if (d.getFullYear()===calYear && d.getMonth()===calMonth) busyDays.add(d.getDate())
    })
  })

  // ── stats ──
  const active = jobs.filter(j => j.status==='In progress')
  let totalOpen=0, totalOver=0, totalHours=0, onSched=0
  jobs.forEach(j => {
    const tasks = j.tasks ? JSON.parse(j.tasks) : []
    const open  = tasks.filter(t => !t.done)
    const over  = open.filter(t => t.date && new Date(t.date) < TODAY)
    totalOpen += open.length; totalOver += over.length
    totalHours += parseFloat(j.time_logged)||0
    const b = parseFloat(j.budget_hours)||0; const l = parseFloat(j.time_logged)||0
    if (b > 0 && l <= b) onSched++
  })

  // ── gantt ──
  const ganttDays = 35
  const ganttStart = new Date(TODAY); ganttStart.setDate(ganttStart.getDate() - 7)
  const ganttEnd   = new Date(ganttStart); ganttEnd.setDate(ganttEnd.getDate() + ganttDays)
  const todayPct   = Math.max(0,Math.min(100,((TODAY-ganttStart)/86400000/ganttDays)*100))

  function barPct(date) { return Math.max(0,Math.min(100,((new Date(date)-ganttStart)/86400000/ganttDays)*100)) }
  function barW(start, end) {
    const s = barPct(start), e = Math.min(100,barPct(end))
    return Math.max(1, e - s)
  }

  // ── clock ──
  const clockJob = jobs.find(j => j.id === clockJobId)

  function startClock() {
    if (clockState === 'in') return
    setClockState('in')
    const now = new Date()
    setClockLog(l => [...l, { time: now.toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'}), action:'Clocked in', job: clockJob?.name }])
    intervalRef.current = setInterval(() => setClockSecs(s => s+1), 1000)
    toast('Clocked in ✓')
  }

  function holdClock() {
    clearInterval(intervalRef.current)
    setClockState('hold')
    const now = new Date()
    setClockLog(l => [...l, { time: now.toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'}), action:'Paused', dur: fmtHM(clockSecs) }])
    toast('Paused')
  }

  async function stopClock() {
    clearInterval(intervalRef.current)
    setClockState('off')
    const hrs = clockSecs / 3600
    const now = new Date()
    setClockLog(l => [...l, { time: now.toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'}), action:'Clocked out', dur: fmtHM(clockSecs) }])
    if (clockJob) {
      const prev = parseFloat(clockJob.time_logged)||0
      const newTotal = Math.round((prev+hrs)*100)/100
      await supabase.from('jobs').update({ time_logged: newTotal }).eq('id', clockJobId)
      setJobs(jbs => jbs.map(j => j.id===clockJobId ? { ...j, time_logged: newTotal } : j))
    }
    setClockSecs(0)
    toast('Clocked out — time saved ✓')
  }

  useEffect(() => () => clearInterval(intervalRef.current), [])

  const budget  = parseFloat(clockJob?.budget_hours||0)*3600
  const logged  = parseFloat(clockJob?.time_logged||0)*3600
  const total   = logged + clockSecs
  const progPct = budget > 0 ? Math.min(100, Math.round(total/budget*100)) : 0
  const over    = budget > 0 && total > budget

  // ── tasks ──
  let allTasks = []
  jobs.forEach((j,i) => {
    const tasks = j.tasks ? JSON.parse(j.tasks) : []
    tasks.forEach(t => allTasks.push({ ...t, jobId:j.id, jobName:j.name, jobColor:PALETTE[i%PALETTE.length] }))
  })
  if (taskJobFilter !== 'all') allTasks = allTasks.filter(t => t.jobId === taskJobFilter)
  if (taskStatusFilter === 'open')    allTasks = allTasks.filter(t => !t.done)
  if (taskStatusFilter === 'overdue') allTasks = allTasks.filter(t => !t.done && t.date && new Date(t.date) < TODAY)
  if (taskStatusFilter === 'done')    allTasks = allTasks.filter(t => t.done)
  allTasks.sort((a,b) => { if(a.done!==b.done)return a.done?1:-1; if(!a.date&&!b.date)return 0; if(!a.date)return 1; if(!b.date)return -1; return new Date(a.date)-new Date(b.date) })

  function taskDueLabel(t) {
    if (t.done) return <span className="text-[10px] px-1.5 py-0.5 rounded bg-[#F3F4F6] text-[#9CA3AF]">Done</span>
    if (!t.date) return null
    const d = new Date(t.date); const diff = (d-TODAY)/86400000
    const lbl = d.toLocaleDateString('en-NZ',{day:'numeric',month:'short'})
    if (diff < 0) return <span className="text-[10px] px-1.5 py-0.5 rounded bg-red-50 text-red-700 font-medium">⚠ Overdue · {lbl}</span>
    if (diff < 3) return <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-50 text-amber-700">Due {lbl}</span>
    return <span className="text-[10px] px-1.5 py-0.5 rounded bg-teal-50 text-teal-700">Due {lbl}</span>
  }

  if (loading) return <div className="flex justify-center py-16"><div className="spinner" /></div>

  return (
    <div className="lg:grid lg:grid-cols-[220px_1fr] lg:gap-6">
      {/* sidebar */}
      <div className="hidden lg:block">
        <div className="card p-4 sticky top-4">
          <div className="flex items-center gap-2 mb-3">
            <button onClick={() => changeMonth(-1)} className="btn btn-sm px-2 text-xs">←</button>
            <span className="text-sm font-semibold flex-1 text-center">{MONTHS[calMonth].slice(0,3)} {calYear}</span>
            <button onClick={() => changeMonth(1)} className="btn btn-sm px-2 text-xs">→</button>
          </div>
          <div className="grid grid-cols-7 gap-px mb-3">
            {['M','T','W','T','F','S','S'].map((d,i) => <div key={i} className="text-center text-[10px] text-[#9CA3AF] py-1">{d}</div>)}
            {Array(firstDay).fill(null).map((_,i) => <div key={'e'+i} />)}
            {Array(daysInMonth).fill(null).map((_,i) => {
              const d = i+1
              const isToday = calYear===TODAY.getFullYear() && calMonth===TODAY.getMonth() && d===TODAY.getDate()
              const has = busyDays.has(d)
              return (
                <div key={d} className={`aspect-square flex items-center justify-center text-xs rounded-lg cursor-pointer relative
                  ${isToday ? 'bg-blue-100 text-blue-800 font-semibold' : 'text-[#6B7280] hover:bg-[#F3F4F6]'}`}>
                  {d}
                  {has && <span className={`absolute bottom-0.5 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full ${isToday ? 'bg-blue-600' : 'bg-blue-400'}`} />}
                </div>
              )
            })}
          </div>
          <div className="text-[10px] font-semibold text-[#9CA3AF] uppercase tracking-wider mb-2">Jobs this period</div>
          {jobs.filter(j=>j.status!=='Complete').map((j,i) => {
            const tasks = j.tasks ? JSON.parse(j.tasks) : []
            const open  = tasks.filter(t=>!t.done).length
            return (
              <div key={j.id} onClick={() => navigate(`/job/${j.id}`)}
                className="flex items-center gap-2 px-2 py-1.5 rounded-lg cursor-pointer hover:bg-[#F9FAFB] mb-1">
                <div className="w-2.5 h-2.5 rounded-[3px] flex-shrink-0" style={{ background: PALETTE[i%PALETTE.length] }} />
                <span className="text-xs text-[#374151] flex-1 truncate font-medium">{j.name}</span>
                <span className="text-[10px] text-[#9CA3AF]">{open}t</span>
              </div>
            )
          })}
        </div>
      </div>

      {/* main */}
      <div>
        <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
          <div className="flex items-center gap-3">
            <BackButton to="/" label="Jobs" />
            <h1 className="text-xl font-bold text-[#2A3042]">Schedule</h1>
          </div>
          <div className="flex border border-[#E8ECF0] rounded-xl overflow-hidden">
            {[['gantt','Gantt'],['month','Monthly'],['week','My week'],['clock','Time clock'],['tasks','Tasks']].map(([v,l]) => (
              <button key={v} onClick={() => setView(v)}
                className={`text-xs px-4 py-2 border-none cursor-pointer transition-colors
                  ${view===v ? 'bg-white text-[#2A3042] font-semibold' : 'bg-[#F0F2F5] text-[#6B7280] hover:bg-[#E8ECF0]'}`}>
                {l}
              </button>
            ))}
          </div>
        </div>

        {/* ── MONTHLY BOARD ── */}
        {view === 'month' && (() => {
          const year = calYear, month = calMonth
          const firstDay = new Date(year, month, 1)
          const lastDay  = new Date(year, month + 1, 0)
          const startDow = firstDay.getDay() // 0=Sun
          // Build grid cells (pad start with empty days)
          const cells = []
          for (let i = 0; i < startDow; i++) cells.push(null)
          for (let d = 1; d <= lastDay.getDate(); d++) cells.push(new Date(year, month, d))

          const STATUS_COLORS = {
            'In progress': { bg:'#DBEAFE', color:'#1E40AF', dot:'#3B82F6' },
            'Complete':    { bg:'#DCFCE7', color:'#166534', dot:'#22C55E' },
            'On hold':     { bg:'#FEF9C3', color:'#854D0E', dot:'#EAB308' },
            'Cancelled':   { bg:'#F3F4F6', color:'#6B7280', dot:'#9CA3AF' },
            'Pending':     { bg:'#FEF2F2', color:'#991B1B', dot:'#EF4444' },
          }

          function jobsForDay(date) {
            if (!date) return []
            const ds = date.toISOString().slice(0,10)
            return jobs.filter(j => {
              const s = j.start_date ? j.start_date.slice(0,10) : null
              const e = j.due_date   ? j.due_date.slice(0,10)   : null
              if (!s && !e) return false
              if (s && e)  return ds >= s && ds <= e  // has both — show in range
              if (s)       return ds === s             // only start — show on start day
              if (e)       return ds === e             // only due — show on due day
              return false
            })
          }

          const isToday = d => d && d.toDateString() === TODAY.toDateString()

          return (
            <div style={{ background:'#fff', borderRadius:12, border:'1px solid #E8ECF0', overflow:'hidden' }}>
              {/* Month nav */}
              <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'14px 20px', borderBottom:'1px solid #F3F4F6' }}>
                <button onClick={()=>changeMonth(-1)} style={{ background:'none', border:'none', cursor:'pointer', color:'#6B7280', fontSize:18, padding:'2px 8px', borderRadius:8 }}
                  onMouseEnter={e=>e.currentTarget.style.background='#F3F4F6'} onMouseLeave={e=>e.currentTarget.style.background='none'}>‹</button>
                <div style={{ fontSize:16, fontWeight:800, color:'#2A3042' }}>
                  {firstDay.toLocaleDateString('en-NZ',{month:'long',year:'numeric'})}
                </div>
                <button onClick={()=>changeMonth(1)} style={{ background:'none', border:'none', cursor:'pointer', color:'#6B7280', fontSize:18, padding:'2px 8px', borderRadius:8 }}
                  onMouseEnter={e=>e.currentTarget.style.background='#F3F4F6'} onMouseLeave={e=>e.currentTarget.style.background='none'}>›</button>
              </div>
              {/* Day headers */}
              <div style={{ display:'grid', gridTemplateColumns:'repeat(7,1fr)', borderBottom:'1px solid #F3F4F6' }}>
                {['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].map(d=>(
                  <div key={d} style={{ padding:'8px 0', textAlign:'center', fontSize:11, fontWeight:700, color:'#9CA3AF', textTransform:'uppercase', letterSpacing:'.05em' }}>{d}</div>
                ))}
              </div>
              {/* Calendar grid */}
              <div style={{ display:'grid', gridTemplateColumns:'repeat(7,1fr)' }}>
                {cells.map((date, i) => {
                  const dayJobs = jobsForDay(date)
                  const today   = isToday(date)
                  return (
                    <div key={i} style={{ minHeight:100, padding:'6px', borderRight:i%7!==6?'1px solid #F3F4F6':'none', borderBottom:'1px solid #F3F4F6', background:today?'#F0F7FF':'#fff', position:'relative' }}>
                      {date && (
                        <>
                          <div style={{ fontSize:12, fontWeight:today?800:500, width:24, height:24, borderRadius:'50%', display:'flex', alignItems:'center', justifyContent:'center', background:today?'#5B8AF0':'transparent', color:today?'#fff':'#6B7280', marginBottom:4 }}>
                            {date.getDate()}
                          </div>
                          <div style={{ display:'flex', flexDirection:'column', gap:2 }}>
                            {dayJobs.slice(0,3).map(j => {
                              const sc = STATUS_COLORS[j.status] || STATUS_COLORS['Pending']
                              const assignedUsers = assignments.filter(a=>a.job_id===j.id).map(a=>profiles[a.user_id]||'').filter(Boolean)
                              return (
                                <div key={j.id} title={`${j.name}${assignedUsers.length?` — ${assignedUsers.join(', ')}`:''}`}
                                  style={{ fontSize:10, fontWeight:600, padding:'2px 6px', borderRadius:5, background:sc.bg, color:sc.color, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', cursor:'default', borderLeft:`3px solid ${sc.dot}` }}>
                                  {j.job_number ? `#${j.job_number} ` : ''}{j.name?.replace(/^.+?[—–-]{1,2}\s*/,'') || j.name}
                                </div>
                              )
                            })}
                            {dayJobs.length > 3 && (
                              <div style={{ fontSize:10, color:'#9CA3AF', fontWeight:600, paddingLeft:2 }}>+{dayJobs.length-3} more</div>
                            )}
                          </div>
                        </>
                      )}
                    </div>
                  )
                })}
              </div>
              {/* Legend */}
              <div style={{ padding:'10px 16px', borderTop:'1px solid #F3F4F6', display:'flex', flexWrap:'wrap', gap:12 }}>
                {Object.entries(STATUS_COLORS).map(([s,c])=>(
                  <div key={s} style={{ display:'flex', alignItems:'center', gap:5, fontSize:11, color:'#6B7280' }}>
                    <div style={{ width:8, height:8, borderRadius:'50%', background:c.dot }} />
                    {s}
                  </div>
                ))}
              </div>
            </div>
          )
        })()}

        {/* ── MY WEEK ── */}
        {view === 'week' && (() => {
          // Week starting Monday
          const now = new Date(TODAY)
          const dow = now.getDay() // 0=Sun
          const monday = new Date(now)
          monday.setDate(now.getDate() - (dow === 0 ? 6 : dow - 1) + (weekOffset * 7))

          const days = Array.from({length:7}, (_,i) => {
            const d = new Date(monday)
            d.setDate(monday.getDate() + i)
            return d
          })

          const myJobIds = new Set(assignments.filter(a=>a.user_id===profile?.id).map(a=>a.job_id))
          // Also include jobs where user has an assigned process
          const myProcessJobIds = new Set(myProcesses.filter(p=>p.assigned_to===profile?.id).map(p=>p.job_id))
          const allMyJobIds = new Set([...myJobIds, ...myProcessJobIds])

          function myJobsForDay(date) {
            const ds = date.toISOString().slice(0,10)
            // Jobs assigned directly or via process
            const dayJobs = jobs.filter(j => {
              if (!allMyJobIds.has(j.id)) return false
              const s = j.start_date ? j.start_date.slice(0,10) : null
              const e = j.due_date   ? j.due_date.slice(0,10)   : null
              if (!s && !e) return false
              const start = s || e, end = e || s
              return ds >= start && ds <= end
            })
            return dayJobs
          }

          function myProcessesForDay(date) {
            return myProcesses.filter(p => {
              if (p.assigned_to !== profile?.id) return false
              // Use process's own due_date if set, otherwise fall back to job dates
              if (p.due_date) return p.due_date.slice(0,10) === date.toISOString().slice(0,10)
              const j = p.jobs
              if (!j) return false
              const ds = date.toISOString().slice(0,10)
              const s = j.start_date?.slice(0,10), e = j.due_date?.slice(0,10)
              if (!s && !e) return false
              return ds >= (s||e) && ds <= (e||s)
            })
          }

          const STATUS_COLORS = {
            'In progress': { bg:'#DBEAFE', color:'#1E40AF', border:'#93C5FD', dot:'#3B82F6' },
            'Complete':    { bg:'#DCFCE7', color:'#166534', border:'#86EFAC', dot:'#22C55E' },
            'On hold':     { bg:'#FEF9C3', color:'#854D0E', border:'#FDE68A', dot:'#EAB308' },
            'Pending':     { bg:'#FEF2F2', color:'#991B1B', border:'#FCA5A5', dot:'#EF4444' },
            'Cancelled':   { bg:'#F3F4F6', color:'#6B7280', border:'#E5E7EB', dot:'#9CA3AF' },
          }

          const weekLabel = () => {
            const s = days[0].toLocaleDateString('en-NZ',{day:'numeric',month:'short'})
            const e = days[6].toLocaleDateString('en-NZ',{day:'numeric',month:'short',year:'numeric'})
            return `${s} – ${e}`
          }

          const hasAny = days.some(d => myJobsForDay(d).length > 0)

          return (
            <div>
              {/* Week nav */}
              <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:16 }}>
                <div style={{ fontSize:15, fontWeight:800, color:'#2A3042' }}>{weekLabel()}</div>
                <div style={{ display:'flex', gap:6, alignItems:'center' }}>
                  <button onClick={()=>setWeekOffset(w=>w-1)} style={{ padding:'6px 12px', border:'1px solid #E8ECF0', borderRadius:8, background:'#fff', cursor:'pointer', fontSize:12, fontWeight:600, color:'#6B7280' }}>← Prev week</button>
                  {weekOffset !== 0 && <button onClick={()=>setWeekOffset(0)} style={{ padding:'6px 12px', border:'1px solid #5B8AF0', borderRadius:8, background:'#EEF2FF', cursor:'pointer', fontSize:12, fontWeight:700, color:'#5B8AF0' }}>This week</button>}
                  <button onClick={()=>setWeekOffset(w=>w+1)} style={{ padding:'6px 12px', border:'1px solid #E8ECF0', borderRadius:8, background:'#fff', cursor:'pointer', fontSize:12, fontWeight:600, color:'#6B7280' }}>Next week →</button>
                </div>
              </div>

              {!hasAny && (
                <div style={{ background:'#fff', borderRadius:12, border:'1px solid #E8ECF0', padding:'48px 24px', textAlign:'center', color:'#9CA3AF' }}>
                  <div style={{ fontSize:28, marginBottom:8 }}>📅</div>
                  <div style={{ fontSize:14, fontWeight:600, color:'#374151', marginBottom:4 }}>No jobs assigned this week</div>
                  <div style={{ fontSize:13 }}>Jobs assigned to you will appear here</div>
                </div>
              )}

              {/* Day columns */}
              <div style={{ display:'grid', gridTemplateColumns:'repeat(7,1fr)', gap:8 }}>
                {days.map((date, i) => {
                  const dayJobs   = myJobsForDay(date)
                  const isToday   = date.toDateString() === TODAY.toDateString()
                  const isWeekend = date.getDay() === 0 || date.getDay() === 6
                  return (
                    <div key={i} style={{ background:isToday?'#F0F7FF':isWeekend?'#FAFAFA':'#fff', borderRadius:12, border:`1.5px solid ${isToday?'#93C5FD':'#E8ECF0'}`, overflow:'hidden', minHeight:160 }}>
                      {/* Day header */}
                      <div style={{ padding:'8px 10px', borderBottom:'1px solid #F3F4F6', background:isToday?'#DBEAFE':isWeekend?'#F3F4F6':'#F9FAFB' }}>
                        <div style={{ fontSize:10, fontWeight:700, color:isToday?'#1E40AF':'#9CA3AF', textTransform:'uppercase', letterSpacing:'.06em' }}>
                          {date.toLocaleDateString('en-NZ',{weekday:'short'})}
                        </div>
                        <div style={{ fontSize:18, fontWeight:800, color:isToday?'#1E40AF':'#2A3042', lineHeight:1.2 }}>
                          {date.getDate()}
                        </div>
                        <div style={{ fontSize:10, color:'#9CA3AF' }}>{date.toLocaleDateString('en-NZ',{month:'short'})}</div>
                      </div>
                      {/* Jobs */}
                      <div style={{ padding:'6px 8px', display:'flex', flexDirection:'column', gap:4 }}>
                        {dayJobs.length === 0 && myProcessesForDay(date).length === 0 ? (
                          <div style={{ fontSize:10, color:'#D1D5DB', textAlign:'center', padding:'12px 0' }}>—</div>
                        ) : <>
                          {dayJobs.map(j => {
                            const sc = STATUS_COLORS[j.status] || STATUS_COLORS['Pending']
                            const isDue = j.due_date?.slice(0,10) === date.toISOString().slice(0,10)
                            return (
                              <div key={j.id} style={{ background:sc.bg, borderRadius:7, border:`1px solid ${sc.border}`, padding:'6px 8px', borderLeft:`3px solid ${sc.dot}`, marginBottom:3 }}>
                                <div style={{ fontSize:11, fontWeight:700, color:sc.color, lineHeight:1.3, overflow:'hidden', display:'-webkit-box', WebkitLineClamp:2, WebkitBoxOrient:'vertical' }}>
                                  {j.job_number && <span style={{ opacity:0.7, marginRight:3 }}>#{j.job_number}</span>}
                                  {j.name?.replace(/^.+?[—–-]{1,2}\s*/,'') || j.name}
                                </div>
                                <div style={{ display:'flex', gap:4, marginTop:4, flexWrap:'wrap' }}>
                                  <span style={{ fontSize:10, color:sc.color, opacity:0.8 }}>{j.status}</span>
                                  {isDue && <span style={{ fontSize:9, fontWeight:700, padding:'1px 5px', borderRadius:20, background:sc.dot, color:'#fff' }}>Due</span>}
                                </div>
                              </div>
                            )
                          })}
                          {myProcessesForDay(date).map(p => (
                            <div key={p.id} style={{ background:'#F5F3FF', borderRadius:7, border:'1px solid #DDD6FE', padding:'5px 8px', borderLeft:'3px solid #7C3AED', marginBottom:3 }}>
                              <div style={{ fontSize:10, fontWeight:700, color:'#5B21B6', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                                ⚙️ {p.name}
                              </div>
                              <div style={{ fontSize:9, color:'#6D28D9', marginTop:1, opacity:0.8, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', display:'flex', alignItems:'center', gap:4 }}>
                                {p.jobs?.name?.replace(/^.+?[—–-]{1,2}\s*/,'') || p.jobs?.name}
                                {p.due_date && <span style={{ fontSize:9, fontWeight:700, padding:'1px 4px', borderRadius:10, background:'#7C3AED', color:'#fff', flexShrink:0 }}>Due</span>}
                              </div>
                            </div>
                          ))}
                        </>}
                      </div>
                    </div>
                  )
                })}
              </div>

              <div style={{ marginTop:12, fontSize:12, color:'#9CA3AF', textAlign:'center' }}>
                Showing jobs assigned to you — assign jobs from the job card
              </div>
            </div>
          )
        })()}


        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
          <div style={{ background:"#fff", borderRadius:12, border:"1px solid #E8ECF0", boxShadow:"0 1px 3px rgba(0,0,0,0.04)", padding:14 }}><div className="text-xs text-[#9CA3AF] mb-1">Active jobs</div><div className="text-xl font-bold text-[#2A3042]">{active.length}</div></div>
          <div style={{ background:"#fff", borderRadius:12, border:"1px solid #E8ECF0", boxShadow:"0 1px 3px rgba(0,0,0,0.04)", padding:14 }}><div className="text-xs text-[#9CA3AF] mb-1">Tasks open</div><div className="text-xl font-bold text-[#2A3042]">{totalOpen}</div>{totalOver>0 && <div className="text-xs text-red-600">{totalOver} overdue</div>}</div>
          <div style={{ background:"#fff", borderRadius:12, border:"1px solid #E8ECF0", boxShadow:"0 1px 3px rgba(0,0,0,0.04)", padding:14 }}><div className="text-xs text-[#9CA3AF] mb-1">Hours logged</div><div className="text-xl font-bold text-[#2A3042]">{totalHours.toFixed(1)}h</div></div>
          <div style={{ background:"#fff", borderRadius:12, border:"1px solid #E8ECF0", boxShadow:"0 1px 3px rgba(0,0,0,0.04)", padding:14 }}><div className="text-xs text-[#9CA3AF] mb-1">On schedule</div><div className="text-xl font-bold text-[#2A3042]">{jobs.length > 0 ? Math.round(onSched/jobs.length*100) : 100}%</div></div>
        </div>

        {/* GANTT */}
        {view === 'gantt' && (
          <div style={{ background:"#fff", borderRadius:12, border:"1px solid #E8ECF0", boxShadow:"0 1px 3px rgba(0,0,0,0.04)", overflow:"hidden" }}>
            <div className="overflow-x-auto">
              <div style={{ minWidth: 600 }}>
                {/* header */}
                <div className="grid border-b border-[#F3F4F6]" style={{ gridTemplateColumns:'160px 1fr' }}>
                  <div className="text-xs font-semibold text-[#6B7280] px-3 py-2 border-r border-[#F3F4F6]">Job / Task</div>
                  <div className="relative h-8">
                    {[0,7,14,21,28,35].map(d => {
                      const dt = new Date(ganttStart); dt.setDate(dt.getDate()+d)
                      const p = (d/ganttDays)*100
                      return <span key={d} className="absolute top-2 text-[9px] text-[#9CA3AF] -translate-x-1/2" style={{left:`${p}%`}}>{dt.getDate()} {MONTHS[dt.getMonth()].slice(0,3)}</span>
                    })}
                    <div className="absolute top-0 bottom-0 w-px bg-red-400 z-10" style={{ left:`${todayPct}%` }} />
                  </div>
                </div>
                {jobs.map((j,i) => {
                  const color  = PALETTE[i%PALETTE.length]
                  const tasks  = j.tasks ? JSON.parse(j.tasks) : []
                  const budget2 = parseFloat(j.budget_hours)||0
                  const logged2 = parseFloat(j.time_logged)||0
                  const hasBar  = j.start_date || j.due_date
                  const lPct   = hasBar ? barPct(j.start_date || j.due_date) : 5
                  const wPct   = hasBar && j.start_date && j.due_date ? barW(j.start_date, j.due_date) : 20
                  return (
                    <div key={j.id}>
                      <div className="grid border-b border-[#F3F4F6]" style={{ gridTemplateColumns:'160px 1fr' }}>
                        <div className="flex items-center gap-2 px-3 py-2 border-r border-[#F3F4F6] cursor-pointer hover:bg-[#F9FAFB]" onClick={() => navigate(`/job/${j.id}`)}>
                          <div className="w-2.5 h-2.5 rounded-[3px] flex-shrink-0" style={{background:color}} />
                          <span className="text-xs font-semibold text-[#374151] truncate">{j.name}</span>
                        </div>
                        <div className="relative h-9">
                          <div className="absolute top-0 bottom-0 w-px bg-red-400 opacity-40" style={{left:`${todayPct}%`}} />
                          <div className="absolute top-1/2 -translate-y-1/2 h-4 rounded flex items-center px-2 text-[10px] text-white font-medium cursor-pointer truncate"
                            style={{ left:`${lPct}%`, width:`${wPct}%`, background:color, opacity: j.status==='On hold'?0.4:1 }}
                            onClick={() => navigate(`/job/${j.id}`)}>
                            {budget2>0 ? `${logged2}h / ${budget2}h${logged2>budget2?' ⚠':''}` : j.status}
                          </div>
                        </div>
                      </div>
                      {tasks.map(t => {
                        if (!t.date) return null
                        const tp = barPct(t.date)
                        const isDone = t.done; const isOver = !isDone && new Date(t.date) < TODAY
                        return (
                          <div key={t.id} className="grid border-b border-gray-50 bg-[#F9FAFB]/50" style={{gridTemplateColumns:'160px 1fr'}}>
                            <div className="text-[10px] text-[#9CA3AF] px-3 py-1.5 border-r border-[#F3F4F6] pl-7 truncate">
                              {isDone?'✓ ':isOver?'⚠ ':''}{t.title}
                            </div>
                            <div className="relative h-6">
                              <div className="absolute top-0 bottom-0 w-px bg-red-400 opacity-30" style={{left:`${todayPct}%`}} />
                              <div className="absolute top-1/2 -translate-y-1/2 h-2 rounded-sm"
                                style={{ left:`${tp}%`, width:`${Math.max(1.5,(parseFloat(t.hours)||1)/ganttDays*3)}%`, background: isDone?'#9BA5A8':isOver?'#E24B4A':color, opacity:isDone?0.4:0.8 }} />
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  )
                })}
                {jobs.length === 0 && <div className="p-8 text-center text-sm text-[#9CA3AF]">No jobs to display</div>}
              </div>
            </div>
          </div>
        )}

        {/* TIME CLOCK */}
        {view === 'clock' && (
          <div>
            <div style={{ background:"#fff", borderRadius:12, border:"1px solid #E8ECF0", boxShadow:"0 1px 3px rgba(0,0,0,0.04)", padding:18, marginBottom:14 }}>
              <div className="text-xs font-semibold text-[#9CA3AF] uppercase tracking-wider mb-3">Time clock</div>
              {!clockJobId ? (
                <div>
                  <div className="text-sm text-[#6B7280] mb-3">Select a job to clock in:</div>
                  <div className="flex flex-col gap-2">
                    {jobs.filter(j=>['In progress','Review'].includes(j.status)).map((j,i) => (
                      <div key={j.id} onClick={() => setClockJobId(j.id)}
                        className="flex items-center gap-3 p-3 rounded-xl border border-[#E8ECF0] cursor-pointer hover:border-gray-300 bg-white">
                        <div className="w-3 h-3 rounded-[3px]" style={{background:PALETTE[i%PALETTE.length]}} />
                        <div className="flex-1">
                          <div className="text-sm font-medium text-[#2A3042]">{j.name}</div>
                          <div className="text-xs text-[#9CA3AF]">{parseFloat(j.budget_hours)||0}h budget · {parseFloat(j.time_logged)||0}h logged</div>
                        </div>
                      </div>
                    ))}
                    {jobs.filter(j=>['In progress','Review'].includes(j.status)).length === 0 && (
                      <div className="text-sm text-[#9CA3AF] text-center py-6">No active jobs</div>
                    )}
                  </div>
                </div>
              ) : (
                <div>
                  <div className="flex items-center gap-2 mb-3">
                    <div className="w-3 h-3 rounded-[3px]" style={{background:PALETTE[jobs.findIndex(j=>j.id===clockJobId)%PALETTE.length]}} />
                    <div className="text-sm font-semibold text-[#2A3042]">{clockJob?.name}</div>
                    <button onClick={() => { clearInterval(intervalRef.current); setClockJobId(null); setClockState('off'); setClockSecs(0) }} className="ml-auto text-xs text-[#9CA3AF] hover:text-[#6B7280] bg-transparent border-none cursor-pointer">Change</button>
                  </div>
                  <div className="grid grid-cols-3 gap-2 mb-3">
                    {[['Session',fmtHMS(clockSecs),'teal'],['Budget',budget>0?fmtHM(budget):'—','gray'],['Logged',fmtHM(total),over?'red':'gray']].map(([l,v,c]) => (
                      <div key={l} className="bg-[#F9FAFB] rounded-xl p-3 text-center">
                        <div className={`text-base font-bold ${c==='teal'?'text-teal-600':c==='red'?'text-red-600':'text-[#2A3042]'}`}>{v}</div>
                        <div className="text-[10px] text-[#9CA3AF] mt-0.5">{l}</div>
                      </div>
                    ))}
                  </div>
                  {budget > 0 && (
                    <div className="h-1.5 bg-[#F3F4F6] rounded-full mb-2 overflow-hidden">
                      <div className={`h-full rounded-full transition-all ${progPct>=100?'bg-red-500':progPct>=80?'bg-amber-400':'bg-teal-500'}`} style={{width:`${progPct}%`}} />
                    </div>
                  )}
                  <div className="text-xs text-[#6B7280] mb-3">{over ? `⚠ ${fmtHM(total-budget)} over budget` : budget>0 ? `${fmtHM(budget-total)} remaining` : ''}</div>
                  <div className="flex gap-2">
                    <button onClick={startClock} disabled={clockState==='in'} className="btn-green flex-1 disabled:opacity-40">Clock in</button>
                    <button onClick={holdClock} disabled={clockState!=='in'} className="btn flex-1 border-amber-300 bg-amber-50 text-amber-800 disabled:opacity-40">Pause</button>
                    <button onClick={stopClock} disabled={clockState==='off'} className="btn-red flex-1 disabled:opacity-40">Clock out</button>
                  </div>
                </div>
              )}
            </div>
            <div style={{ background:"#fff", borderRadius:12, border:"1px solid #E8ECF0", boxShadow:"0 1px 3px rgba(0,0,0,0.04)", overflow:"hidden" }}>
              <div className="flex items-center justify-between px-4 py-3 border-b border-[#F3F4F6]">
                <span className="text-xs font-semibold text-[#6B7280] uppercase tracking-wider">Session log</span>
                <span className="text-xs text-[#9CA3AF]">{TODAY.toLocaleDateString('en-NZ',{weekday:'short',day:'numeric',month:'short'})}</span>
              </div>
              {clockLog.length === 0 ? (
                <div className="p-6 text-center text-sm text-[#9CA3AF]">No entries yet today</div>
              ) : [...clockLog].reverse().map((e,i) => (
                <div key={i} className="flex items-center gap-3 px-4 py-2.5 border-b border-gray-50 last:border-0">
                  <span className="text-xs text-[#9CA3AF] font-mono min-w-[42px]">{e.time}</span>
                  <span className="text-sm text-[#374151] flex-1">{e.action}{e.job ? ` — ${e.job}` : ''}</span>
                  {e.dur && <span className="text-xs text-[#9CA3AF]">{e.dur}</span>}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* TASKS */}
        {view === 'tasks' && (
          <div style={{ background:"#fff", borderRadius:12, border:"1px solid #E8ECF0", boxShadow:"0 1px 3px rgba(0,0,0,0.04)", overflow:"hidden" }}>
            <div className="flex items-center justify-between px-4 py-3 border-b border-[#F3F4F6] flex-wrap gap-2">
              <span className="text-xs font-semibold text-[#6B7280] uppercase tracking-wider">All tasks</span>
              <div className="flex gap-2">
                <select value={taskJobFilter} onChange={e => setTaskJobFilter(e.target.value)} className="text-xs border border-[#E8ECF0] rounded-lg px-2 py-1 bg-white">
                  <option value="all">All jobs</option>
                  {jobs.map(j => <option key={j.id} value={j.id}>{j.name}</option>)}
                </select>
                <select value={taskStatusFilter} onChange={e => setTaskStatusFilter(e.target.value)} className="text-xs border border-[#E8ECF0] rounded-lg px-2 py-1 bg-white">
                  <option value="all">All</option>
                  <option value="open">Open</option>
                  <option value="overdue">Overdue</option>
                  <option value="done">Done</option>
                </select>
              </div>
            </div>
            {allTasks.length === 0 ? (
              <div className="p-8 text-center text-sm text-[#9CA3AF]">No tasks found</div>
            ) : allTasks.map(t => {
              const isOver = !t.done && t.date && new Date(t.date) < TODAY
              return (
                <div key={t.id} className="flex items-start gap-3 px-4 py-3 border-b border-gray-50 last:border-0 hover:bg-[#F9FAFB]/50">
                  <div className={`w-4 h-4 rounded-[3px] border-[1.5px] flex-shrink-0 mt-0.5 flex items-center justify-center text-[9px] font-bold
                    ${t.done ? 'bg-teal-500 border-teal-500 text-white' : isOver ? 'border-red-400' : 'border-[#DDE3EC]'}`}>
                    {t.done && '✓'}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className={`text-sm ${t.done ? 'line-through text-[#9CA3AF]' : 'text-[#2A3042]'}`}>{t.title}</div>
                    <div className="flex flex-wrap items-center gap-2 mt-1">
                      <div className="flex items-center gap-1">
                        <div className="w-2 h-2 rounded-[2px]" style={{background:t.jobColor}} />
                        <span className="text-[10px] text-[#9CA3AF]">{t.jobName}</span>
                      </div>
                      {t.hours && <span className="text-[10px] text-[#9CA3AF]">{t.hours}h</span>}
                      {taskDueLabel(t)}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
