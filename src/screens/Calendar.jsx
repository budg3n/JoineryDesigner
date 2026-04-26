import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
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
  const [view, setView]       = useState('gantt')
  const [calYear, setCalYear] = useState(TODAY.getFullYear())
  const [calMonth, setCalMonth] = useState(TODAY.getMonth())
  const [clockJobId, setClockJobId] = useState(null)
  const [clockState, setClockState] = useState('off') // off | in | hold
  const [clockSecs, setClockSecs]   = useState(0)
  const [clockLog, setClockLog]     = useState([])
  const intervalRef = useRef(null)
  const [taskJobFilter, setTaskJobFilter]   = useState('all')
  const [taskStatusFilter, setTaskStatusFilter] = useState('all')

  useEffect(() => {
    supabase.from('jobs').select('*').order('created_at',{ascending:false}).then(({ data }) => {
      setJobs(data || [])
      setLoading(false)
    })
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
    if (t.done) return <span className="text-[10px] px-1.5 py-0.5 rounded bg-gray-100 dark:bg-zinc-700 text-gray-400">Done</span>
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
            {['M','T','W','T','F','S','S'].map((d,i) => <div key={i} className="text-center text-[10px] text-gray-400 py-1">{d}</div>)}
            {Array(firstDay).fill(null).map((_,i) => <div key={'e'+i} />)}
            {Array(daysInMonth).fill(null).map((_,i) => {
              const d = i+1
              const isToday = calYear===TODAY.getFullYear() && calMonth===TODAY.getMonth() && d===TODAY.getDate()
              const has = busyDays.has(d)
              return (
                <div key={d} className={`aspect-square flex items-center justify-center text-xs rounded-lg cursor-pointer relative
                  ${isToday ? 'bg-blue-100 text-blue-800 font-semibold' : 'text-gray-600 dark:text-zinc-400 hover:bg-gray-100 dark:hover:bg-zinc-700'}`}>
                  {d}
                  {has && <span className={`absolute bottom-0.5 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full ${isToday ? 'bg-blue-600' : 'bg-blue-400'}`} />}
                </div>
              )
            })}
          </div>
          <div className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-2">Jobs this period</div>
          {jobs.filter(j=>j.status!=='Complete').map((j,i) => {
            const tasks = j.tasks ? JSON.parse(j.tasks) : []
            const open  = tasks.filter(t=>!t.done).length
            return (
              <div key={j.id} onClick={() => navigate(`/job/${j.id}`)}
                className="flex items-center gap-2 px-2 py-1.5 rounded-lg cursor-pointer hover:bg-gray-50 dark:hover:bg-zinc-700 mb-1">
                <div className="w-2.5 h-2.5 rounded-[3px] flex-shrink-0" style={{ background: PALETTE[i%PALETTE.length] }} />
                <span className="text-xs text-gray-800 dark:text-zinc-200 flex-1 truncate font-medium">{j.name}</span>
                <span className="text-[10px] text-gray-400">{open}t</span>
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
            <h1 className="text-xl font-bold text-gray-900 dark:text-white">Schedule</h1>
          </div>
          <div className="flex border border-gray-200 dark:border-zinc-700 rounded-xl overflow-hidden">
            {[['gantt','Gantt'],['clock','Time clock'],['tasks','Tasks']].map(([v,l]) => (
              <button key={v} onClick={() => setView(v)}
                className={`text-xs px-4 py-2 border-none cursor-pointer transition-colors
                  ${view===v ? 'bg-white dark:bg-zinc-800 text-gray-900 dark:text-white font-semibold' : 'bg-gray-50 dark:bg-zinc-900 text-gray-500 dark:text-zinc-400 hover:bg-gray-100 dark:hover:bg-zinc-800'}`}>
                {l}
              </button>
            ))}
          </div>
        </div>

        {/* stats */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
          <div className="card p-3"><div className="text-xs text-gray-400 mb-1">Active jobs</div><div className="text-xl font-bold text-gray-900 dark:text-white">{active.length}</div></div>
          <div className="card p-3"><div className="text-xs text-gray-400 mb-1">Tasks open</div><div className="text-xl font-bold text-gray-900 dark:text-white">{totalOpen}</div>{totalOver>0 && <div className="text-xs text-red-600">{totalOver} overdue</div>}</div>
          <div className="card p-3"><div className="text-xs text-gray-400 mb-1">Hours logged</div><div className="text-xl font-bold text-gray-900 dark:text-white">{totalHours.toFixed(1)}h</div></div>
          <div className="card p-3"><div className="text-xs text-gray-400 mb-1">On schedule</div><div className="text-xl font-bold text-gray-900 dark:text-white">{jobs.length > 0 ? Math.round(onSched/jobs.length*100) : 100}%</div></div>
        </div>

        {/* GANTT */}
        {view === 'gantt' && (
          <div style={{ background:"#fff", borderRadius:12, border:"1px solid #E8ECF0", boxShadow:"0 1px 3px rgba(0,0,0,0.04)", overflow:"hidden" }}>
            <div className="overflow-x-auto">
              <div style={{ minWidth: 600 }}>
                {/* header */}
                <div className="grid border-b border-gray-100 dark:border-zinc-700" style={{ gridTemplateColumns:'160px 1fr' }}>
                  <div className="text-xs font-semibold text-gray-500 px-3 py-2 border-r border-gray-100 dark:border-zinc-700">Job / Task</div>
                  <div className="relative h-8">
                    {[0,7,14,21,28,35].map(d => {
                      const dt = new Date(ganttStart); dt.setDate(dt.getDate()+d)
                      const p = (d/ganttDays)*100
                      return <span key={d} className="absolute top-2 text-[9px] text-gray-400 -translate-x-1/2" style={{left:`${p}%`}}>{dt.getDate()} {MONTHS[dt.getMonth()].slice(0,3)}</span>
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
                      <div className="grid border-b border-gray-100 dark:border-zinc-700" style={{ gridTemplateColumns:'160px 1fr' }}>
                        <div className="flex items-center gap-2 px-3 py-2 border-r border-gray-100 dark:border-zinc-700 cursor-pointer hover:bg-gray-50 dark:hover:bg-zinc-700" onClick={() => navigate(`/job/${j.id}`)}>
                          <div className="w-2.5 h-2.5 rounded-[3px] flex-shrink-0" style={{background:color}} />
                          <span className="text-xs font-semibold text-gray-800 dark:text-zinc-200 truncate">{j.name}</span>
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
                          <div key={t.id} className="grid border-b border-gray-50 dark:border-zinc-800 bg-gray-50/50 dark:bg-zinc-800/50" style={{gridTemplateColumns:'160px 1fr'}}>
                            <div className="text-[10px] text-gray-400 px-3 py-1.5 border-r border-gray-100 dark:border-zinc-700 pl-7 truncate">
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
                {jobs.length === 0 && <div className="p-8 text-center text-sm text-gray-400">No jobs to display</div>}
              </div>
            </div>
          </div>
        )}

        {/* TIME CLOCK */}
        {view === 'clock' && (
          <div>
            <div style={{ background:"#fff", borderRadius:12, border:"1px solid #E8ECF0", boxShadow:"0 1px 3px rgba(0,0,0,0.04)", padding:18, marginBottom:14 }}>
              <div className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Time clock</div>
              {!clockJobId ? (
                <div>
                  <div className="text-sm text-gray-500 mb-3">Select a job to clock in:</div>
                  <div className="flex flex-col gap-2">
                    {jobs.filter(j=>['In progress','Review'].includes(j.status)).map((j,i) => (
                      <div key={j.id} onClick={() => setClockJobId(j.id)}
                        className="flex items-center gap-3 p-3 rounded-xl border border-gray-200 dark:border-zinc-700 cursor-pointer hover:border-gray-300 dark:hover:border-zinc-600 bg-white dark:bg-zinc-800">
                        <div className="w-3 h-3 rounded-[3px]" style={{background:PALETTE[i%PALETTE.length]}} />
                        <div className="flex-1">
                          <div className="text-sm font-medium text-gray-900 dark:text-white">{j.name}</div>
                          <div className="text-xs text-gray-400">{parseFloat(j.budget_hours)||0}h budget · {parseFloat(j.time_logged)||0}h logged</div>
                        </div>
                      </div>
                    ))}
                    {jobs.filter(j=>['In progress','Review'].includes(j.status)).length === 0 && (
                      <div className="text-sm text-gray-400 text-center py-6">No active jobs</div>
                    )}
                  </div>
                </div>
              ) : (
                <div>
                  <div className="flex items-center gap-2 mb-3">
                    <div className="w-3 h-3 rounded-[3px]" style={{background:PALETTE[jobs.findIndex(j=>j.id===clockJobId)%PALETTE.length]}} />
                    <div className="text-sm font-semibold text-gray-900 dark:text-white">{clockJob?.name}</div>
                    <button onClick={() => { clearInterval(intervalRef.current); setClockJobId(null); setClockState('off'); setClockSecs(0) }} className="ml-auto text-xs text-gray-400 hover:text-gray-600 bg-transparent border-none cursor-pointer">Change</button>
                  </div>
                  <div className="grid grid-cols-3 gap-2 mb-3">
                    {[['Session',fmtHMS(clockSecs),'teal'],['Budget',budget>0?fmtHM(budget):'—','gray'],['Logged',fmtHM(total),over?'red':'gray']].map(([l,v,c]) => (
                      <div key={l} className="bg-gray-50 dark:bg-zinc-700/50 rounded-xl p-3 text-center">
                        <div className={`text-base font-bold ${c==='teal'?'text-teal-600':c==='red'?'text-red-600':'text-gray-900 dark:text-white'}`}>{v}</div>
                        <div className="text-[10px] text-gray-400 mt-0.5">{l}</div>
                      </div>
                    ))}
                  </div>
                  {budget > 0 && (
                    <div className="h-1.5 bg-gray-100 dark:bg-zinc-700 rounded-full mb-2 overflow-hidden">
                      <div className={`h-full rounded-full transition-all ${progPct>=100?'bg-red-500':progPct>=80?'bg-amber-400':'bg-teal-500'}`} style={{width:`${progPct}%`}} />
                    </div>
                  )}
                  <div className="text-xs text-gray-500 mb-3">{over ? `⚠ ${fmtHM(total-budget)} over budget` : budget>0 ? `${fmtHM(budget-total)} remaining` : ''}</div>
                  <div className="flex gap-2">
                    <button onClick={startClock} disabled={clockState==='in'} className="btn-green flex-1 disabled:opacity-40">Clock in</button>
                    <button onClick={holdClock} disabled={clockState!=='in'} className="btn flex-1 border-amber-300 bg-amber-50 text-amber-800 disabled:opacity-40">Pause</button>
                    <button onClick={stopClock} disabled={clockState==='off'} className="btn-red flex-1 disabled:opacity-40">Clock out</button>
                  </div>
                </div>
              )}
            </div>
            <div style={{ background:"#fff", borderRadius:12, border:"1px solid #E8ECF0", boxShadow:"0 1px 3px rgba(0,0,0,0.04)", overflow:"hidden" }}>
              <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 dark:border-zinc-700">
                <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Session log</span>
                <span className="text-xs text-gray-400">{TODAY.toLocaleDateString('en-NZ',{weekday:'short',day:'numeric',month:'short'})}</span>
              </div>
              {clockLog.length === 0 ? (
                <div className="p-6 text-center text-sm text-gray-400">No entries yet today</div>
              ) : [...clockLog].reverse().map((e,i) => (
                <div key={i} className="flex items-center gap-3 px-4 py-2.5 border-b border-gray-50 dark:border-zinc-800 last:border-0">
                  <span className="text-xs text-gray-400 font-mono min-w-[42px]">{e.time}</span>
                  <span className="text-sm text-gray-800 dark:text-zinc-200 flex-1">{e.action}{e.job ? ` — ${e.job}` : ''}</span>
                  {e.dur && <span className="text-xs text-gray-400">{e.dur}</span>}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* TASKS */}
        {view === 'tasks' && (
          <div style={{ background:"#fff", borderRadius:12, border:"1px solid #E8ECF0", boxShadow:"0 1px 3px rgba(0,0,0,0.04)", overflow:"hidden" }}>
            <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 dark:border-zinc-700 flex-wrap gap-2">
              <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">All tasks</span>
              <div className="flex gap-2">
                <select value={taskJobFilter} onChange={e => setTaskJobFilter(e.target.value)} className="text-xs border border-gray-200 dark:border-zinc-600 rounded-lg px-2 py-1 bg-white dark:bg-zinc-800">
                  <option value="all">All jobs</option>
                  {jobs.map(j => <option key={j.id} value={j.id}>{j.name}</option>)}
                </select>
                <select value={taskStatusFilter} onChange={e => setTaskStatusFilter(e.target.value)} className="text-xs border border-gray-200 dark:border-zinc-600 rounded-lg px-2 py-1 bg-white dark:bg-zinc-800">
                  <option value="all">All</option>
                  <option value="open">Open</option>
                  <option value="overdue">Overdue</option>
                  <option value="done">Done</option>
                </select>
              </div>
            </div>
            {allTasks.length === 0 ? (
              <div className="p-8 text-center text-sm text-gray-400">No tasks found</div>
            ) : allTasks.map(t => {
              const isOver = !t.done && t.date && new Date(t.date) < TODAY
              return (
                <div key={t.id} className="flex items-start gap-3 px-4 py-3 border-b border-gray-50 dark:border-zinc-800 last:border-0 hover:bg-gray-50/50 dark:hover:bg-zinc-800/50">
                  <div className={`w-4 h-4 rounded-[3px] border-[1.5px] flex-shrink-0 mt-0.5 flex items-center justify-center text-[9px] font-bold
                    ${t.done ? 'bg-teal-500 border-teal-500 text-white' : isOver ? 'border-red-400' : 'border-gray-300 dark:border-zinc-600'}`}>
                    {t.done && '✓'}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className={`text-sm ${t.done ? 'line-through text-gray-400' : 'text-gray-900 dark:text-white'}`}>{t.title}</div>
                    <div className="flex flex-wrap items-center gap-2 mt-1">
                      <div className="flex items-center gap-1">
                        <div className="w-2 h-2 rounded-[2px]" style={{background:t.jobColor}} />
                        <span className="text-[10px] text-gray-400">{t.jobName}</span>
                      </div>
                      {t.hours && <span className="text-[10px] text-gray-400">{t.hours}h</span>}
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
