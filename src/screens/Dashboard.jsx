import { useState, useEffect, useCallback, useRef } from 'react'

function fmtNZTime(dt) {
  const d = new Date(dt)
  const offset = (d.getUTCMonth() >= 4 && d.getUTCMonth() <= 8) ? 12 : 13
  const nz = new Date(d.getTime() + offset * 3600000)
  const h24 = nz.getUTCHours()
  const h12 = h24 % 12 || 12
  const ampm = h24 < 12 ? 'am' : 'pm'
  const min = String(nz.getUTCMinutes()).padStart(2, '0')
  const mon = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][nz.getUTCMonth()]
  return `${nz.getUTCDate()} ${mon}, ${h12}:${min} ${ampm}`
}
import { useNavigate } from 'react-router-dom'
import { supabase, pubUrl } from '../lib/supabase'
import { useApp } from '../context/AppContext'
import { useToast } from '../components/Toast'
import StatusBadge from '../components/StatusBadge'
import { BudgetBar, fmtHours, useLiveTimer } from '../screens/ClockIn'
import NewJobModal from '../components/NewJobModal'

const PALETTE = ['#5B8AF0','#1D9E75','#EF9F27','#7F77DD','#E24B4A','#D4537E','#5DCAA5']
const TODAY   = new Date(); TODAY.setHours(0,0,0,0)

function taskStats(job) {
  const tasks = job.tasks ? JSON.parse(job.tasks) : []
  const open  = tasks.filter(t => !t.done)
  const over  = open.filter(t => t.date && new Date(t.date) < TODAY)
  return { open: open.length, over: over.length, total: tasks.length }
}

function StatCard({ label, value, sub, subColor, iconBg, iconColor, icon }) {
  return (
    <div className="stat-card">
      <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', marginBottom:12 }}>
        <div style={{ fontSize:11, fontWeight:700, color:'#9CA3AF', textTransform:'uppercase', letterSpacing:'.05em' }}>{label}</div>
        <div className="stat-icon" style={{ background: iconBg }}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={iconColor} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            {icon}
          </svg>
        </div>
      </div>
      <div style={{ fontSize:28, fontWeight:800, color:'#2A3042', lineHeight:1, marginBottom:4 }}>{value}</div>
      {sub && <div style={{ fontSize:11, color: subColor || '#9CA3AF', fontWeight:500 }}>{sub}</div>}
    </div>
  )
}

function TaskPill({ job }) {
  const s = taskStats(job)
  // Overdue — red with warning icon
  if (s.over > 0) return (
    <div style={{ display:'flex', alignItems:'center', gap:4 }}>
      <span style={{ fontSize:11, fontWeight:700, padding:'3px 9px', borderRadius:20, background:'#FEF2F2', color:'#991B1B', border:'1px solid #FCA5A5' }}>
        ⚠ {s.over} overdue
      </span>
      {s.open > s.over && (
        <span style={{ fontSize:11, fontWeight:600, padding:'3px 9px', borderRadius:20, background:'#FEF9C3', color:'#92400E', border:'1px solid #FDE68A' }}>
          {s.open - s.over} pending
        </span>
      )}
    </div>
  )
  // Pending tasks — amber counter badge
  if (s.open > 0) return (
    <span style={{ display:'inline-flex', alignItems:'center', gap:5, fontSize:11, fontWeight:700, padding:'3px 10px', borderRadius:20, background:'#FFF7ED', color:'#C2410C', border:'1px solid #FED7AA' }}>
      <span style={{ width:16, height:16, borderRadius:'50%', background:'#F97316', color:'#fff', display:'inline-flex', alignItems:'center', justifyContent:'center', fontSize:10, fontWeight:800, lineHeight:1, flexShrink:0 }}>{s.open}</span>
      task{s.open !== 1 ? 's' : ''} to do
    </span>
  )
  // All done
  if (s.total > 0) return (
    <span style={{ fontSize:11, fontWeight:600, padding:'3px 9px', borderRadius:20, background:'#ECFDF5', color:'#065F46', border:'1px solid #6EE7B7' }}>✓ All done</span>
  )
  return <span style={{ fontSize:11, padding:'3px 9px', borderRadius:20, background:'#F3F4F6', color:'#9CA3AF' }}>No tasks</span>
}

function SwatchDot({ c }) {
  if (c.storage_path) return (
    <div style={{ width:14, height:14, borderRadius:3, overflow:'hidden', border:'2px solid #fff', boxShadow:'0 0 0 1px #E8ECF0', flexShrink:0, background:c.color||'#D1D5DB' }}>
      <img src={pubUrl(c.storage_path)} 
        style={{ width:'100%', height:'100%', objectFit:'cover', display:'block' }} 
        loading="lazy"
        onError={e => { e.target.style.display='none' }} />
    </div>
  )
  // No image — show colour swatch (or neutral if no color stored)
  return <div style={{ width:14, height:14, borderRadius:3, background:c.color||'#D1D5DB', border:'2px solid #fff', boxShadow:'0 0 0 1px #E8ECF0', flexShrink:0 }} />
}

function MatHoverPanel({ colors, visible }) {
  if (!colors.length) return null
  return (
    <div style={{
      position:'absolute', left:'calc(100% + 8px)', top:0, zIndex:200,
      opacity: visible ? 1 : 0,
      transform: visible ? 'translateX(0) scale(1)' : 'translateX(-8px) scale(0.97)',
      transition:'all 0.16s ease',
      pointerEvents:'none',
    }}>
      <div style={{ background:'#fff', borderRadius:14, boxShadow:'0 8px 32px rgba(0,0,0,0.12)', border:'1px solid #E8ECF0', padding:14, minWidth:200 }}>
        <div style={{ fontSize:10, fontWeight:700, color:'#9CA3AF', textTransform:'uppercase', letterSpacing:'.07em', marginBottom:12 }}>Materials</div>
        {colors.map((c, i) => (
          <div key={i} style={{
            display:'flex', alignItems:'center', gap:10, marginBottom: i < colors.length-1 ? 10 : 0,
            opacity: visible ? 1 : 0,
            transform: visible ? 'translateX(0)' : 'translateX(-6px)',
            transition: `opacity 0.13s ease ${i*0.04}s, transform 0.13s ease ${i*0.04}s`,
          }}>
            <div style={{ width:40, height:40, borderRadius:9, overflow:'hidden', flexShrink:0, border:'1px solid #E8ECF0' }}>
              {c.storage_path
                ? <img src={pubUrl(c.storage_path)} style={{ width:'100%', height:'100%', objectFit:'cover', display:'block' }} loading="lazy" onError={e=>e.target.style.display='none'} />
                : <div style={{ width:'100%', height:'100%', background: c.color||'#D1D5DB' }} />
              }
            </div>
            <div style={{ minWidth:0 }}>
              <div style={{ fontSize:12, fontWeight:600, color:'#2A3042', lineHeight:1.3 }}>{c.name}</div>
              {c.supplier && <div style={{ fontSize:11, color:'#9CA3AF' }}>{c.supplier}</div>}
              {c.panel_type && <div style={{ fontSize:11, color:'#9CA3AF' }}>{c.panel_type}{c.thickness ? ` · ${c.thickness}mm` : ''}</div>}
            </div>
          </div>
        ))}
        <div style={{ position:'absolute', top:16, left:-5, width:10, height:10, background:'#fff', border:'1px solid #E8ECF0', borderRight:'none', borderTop:'none', transform:'rotate(45deg)' }} />
      </div>
    </div>
  )
}

function JobTimeStatus({ job, activeEntries, procEntries = [], procStatuses = [], accent }) {
  const active  = activeEntries.find(e => e.job_id === job.id)
  const elapsed = useLiveTimer(active?.clocked_in_at) // seconds
  const budget  = parseFloat(job.budget_hours) || 0
  const logged  = parseFloat(job.time_logged)  || 0
  const total   = logged + (elapsed / 3600)
  const noBudget = budget === 0
  const isOver   = !noBudget && total > budget
  const pct      = noBudget ? 0 : Math.min((total / budget) * 100, 100)
  const barColor = isOver ? '#E24B4A' : pct > 85 ? '#EF9F27' : '#1D9E75'

  // Process status pills — show each process with its status
  const PROC_STYLE = {
    'Not started': { bg:'#F3F4F6', color:'#6B7280', dot:'#C4C9D4' },
    'In progress':  { bg:'#ECFDF5', color:'#065F46', dot:'#1D9E75', live:true },
    'On hold':      { bg:'#FEF9C3', color:'#854D0E', dot:'#EF9F27' },
    'Complete':     { bg:'#DCFCE7', color:'#166534', dot:'#1D9E75' },
  }

  // Combine: active clock-ins + process statuses (In progress / On hold)
  const hasAnyProcess = procEntries.length > 0 || procStatuses.some(p=>p.status!=='Not started')
  const hasStarted = logged > 0 || !!active || hasAnyProcess

  return (
    <div style={{ marginTop:8 }}>
      {/* Process status pills — one pill per process, no duplicates */}
      {hasAnyProcess && (() => {
        // Index active clock-ins by process_id
        const activeMap = {}
        procEntries.forEach(e => { activeMap[e.process_id] = e })

        // One entry per non-complete process — use clock-in data if active
        const showProcs = procStatuses
          .filter(p => p.status !== 'Not started')
          .map(p => {
            const entry = activeMap[p.id]
            return {
              id: p.id, name: p.name, status: entry ? 'In progress' : p.status,
              color: p.color, allocated: p.allocated_hours, logged: p.time_logged,
              user: entry?.profiles || null,
              assignedProfile: p.profiles || null,
              clockedIn: entry?.clocked_in_at || null,
              isLive: !!entry,
            }
          })

        if (showProcs.length === 0) return null
        return (
          <div style={{ display:'flex', flexDirection:'column', gap:3, marginBottom:6 }}>
            {showProcs.slice(0,3).map((p, _pi) => {
              const ps = PROC_STYLE[p.status] || PROC_STYLE['Not started']
              const elapsed = p.isLive ? (Date.now()-new Date(p.clockedIn).getTime())/3600000 : 0
              const remaining = p.allocated>0 ? Math.max(0,(p.allocated||0)-(p.logged||0)-elapsed) : null
              const assignedName = p.assignedProfile?.full_name || p.user?.full_name || null
              const label = p.isLive && assignedName ? assignedName
                          : p.status==='On hold' ? (assignedName ? `⏸ ${assignedName.split(' ')[0]}` : '⏸ On hold')
                          : p.status==='In progress' ? (assignedName ? `● ${assignedName.split(' ')[0]}` : '● In progress')
                          : p.status
              return (
                <div key={p.id || _pi} style={{ display:'flex', alignItems:'center', gap:5, padding:'3px 7px', borderRadius:8, background:ps.bg, border:`1px solid ${p.isLive?'#6EE7B7':ps.dot+'55'}` }}>
                  {p.isLive
                    ? <span key='dot' style={{ width:6, height:6, borderRadius:'50%', background:ps.dot, flexShrink:0, display:'inline-block', animation:'ping 1.5s infinite' }} />
                    : <span key='dot' style={{ width:6, height:6, borderRadius:'50%', background:ps.dot, flexShrink:0 }} />
                  }
                  <span style={{ fontSize:10, fontWeight:700, color:ps.color, flex:1, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                    {p.name}
                  </span>
                  <span style={{ fontSize:9, fontWeight:600, color:ps.color, opacity:.9, flexShrink:0 }}>{label}</span>
                  {remaining !== null && p.isLive && (
                    <span style={{ fontSize:9, color:ps.color, flexShrink:0, marginLeft:2 }}>{remaining.toFixed(1)}h</span>
                  )}
                </div>
              )
            })}
          </div>
        )
      })()}

      {/* No processes started — show budget status or yet to start */}
      {!hasAnyProcess && (
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom: (!noBudget && hasStarted) ? 6 : 0 }}>
          {active ? (
            <span style={{ display:'inline-flex', alignItems:'center', gap:5, fontSize:10, fontWeight:700, padding:'2px 8px', borderRadius:20, background:'#ECFDF5', color:'#065F46', border:'1px solid #6EE7B7' }}>
              <span style={{ width:6, height:6, borderRadius:'50%', background:'#1D9E75', display:'inline-block' }} />
              {fmtHours(elapsed/3600)} live
            </span>
          ) : !hasStarted ? (
            <span style={{ fontSize:10, fontWeight:600, padding:'2px 8px', borderRadius:20, background:'#F3F4F6', color:'#9CA3AF' }}>Yet to start</span>
          ) : isOver ? (
            <span style={{ fontSize:10, fontWeight:700, padding:'2px 8px', borderRadius:20, background:'#FEF2F2', color:'#991B1B', border:'1px solid #FCA5A5' }}>
              ⚠ {fmtHours(total - budget)} over
            </span>
          ) : budget > 0 ? (
            <span style={{ fontSize:10, fontWeight:600, padding:'2px 8px', borderRadius:20, background:'#F0FDF4', color:'#065F46' }}>
              {fmtHours(budget - total)} left
            </span>
          ) : (
            <span style={{ fontSize:10, color:'#9CA3AF' }}>{fmtHours(total)} logged</span>
          )}
          {!noBudget && hasStarted && <span style={{ fontSize:10, color:'#9CA3AF' }}>{Math.round(pct)}%</span>}
        </div>
      )}

      {/* Budget progress bar */}
      {!noBudget && hasStarted && (
        <div style={{ height:3, background:'#F3F4F6', borderRadius:2, overflow:'hidden' }}>
          <div style={{ height:'100%', width:`${pct}%`, background: barColor, borderRadius:2, transition:'width .3s' }} />
        </div>
      )}
    </div>
  )
}

function JobCard({ job, index, onClick, activeEntries = [], procEntries = [], procStatuses = [], unorderedCount = 0, allCustomers = [] }) {
  const [hovered, setHovered] = useState(false)
  const timerRef = useRef(null)
  const colors   = job.mat_colors ? JSON.parse(job.mat_colors) : []
  const accent   = PALETTE[index % PALETTE.length]


  const STATUS_BADGE = {
    'In progress': { bg:'#EEF2FF', color:'#3730A3' },
    'Review':      { bg:'#FEF3C7', color:'#92400E' },
    'Complete':    { bg:'#ECFDF5', color:'#065F46' },
    'On hold':     { bg:'#F3F4F6', color:'#6B7280' },
  }
  const badge = STATUS_BADGE[job.status] || STATUS_BADGE['On hold']

  return (
    <div style={{ position:'relative' }}
      onMouseEnter={() => { clearTimeout(timerRef.current); setHovered(true) }}
      onMouseLeave={() => { timerRef.current = setTimeout(() => setHovered(false), 100) }}>
      <div onClick={onClick} style={{
        background:'#fff', borderRadius:12, border:`1px solid ${hovered ? accent+'55' : '#E8ECF0'}`,
        overflow:'hidden', cursor:'pointer',
        boxShadow: hovered ? `0 4px 20px rgba(0,0,0,0.08), 0 0 0 1px ${accent}22` : '0 1px 3px rgba(0,0,0,0.04)',
        transition:'all .15s ease',
      }}>
        {/* accent stripe */}
        <div style={{ height:3, background: accent }} />
        <div style={{ padding:16 }}>
          <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', marginBottom:10 }}>
<div>
              <span style={{ fontSize:16, fontWeight:800, color:'#2A3042', fontFamily:'monospace', letterSpacing:'-0.5px', lineHeight:1 }}>
                {job.job_number || job.mvnum || ''}
              </span>
            </div>
            <span style={{ fontSize:11, fontWeight:700, padding:'2px 9px', borderRadius:20, background:badge.bg, color:badge.color }}>{job.status}</span>
          </div>
          <div style={{ fontSize:14, fontWeight:700, color:'#2A3042', marginBottom:2, lineHeight:1.3 }}>{job.name?.replace(/^.+?[—–-]{1,2}\s*/, '') || job.name}</div>
          <div style={{ fontSize:12, color:'#9CA3AF', marginBottom: job.due_date ? 4 : 12 }}>
            {(() => {
              // Try linked customer first
              const linked = job.customers
              if (linked?.company) return linked.company
              if (linked) return `${linked.first_name||''} ${linked.last_name||''}`.trim() || job.client
              // Try to match by customer_id in our full list
              const byId = job.customer_id ? allCustomers.find(cu => cu.id === job.customer_id) : null
              if (byId?.company) return byId.company
              if (byId) return `${byId.first_name||''} ${byId.last_name||''}`.trim() || job.client
              // Try match by client name
              const byName = allCustomers.find(cu =>
                job.client && (
                  cu.company?.toLowerCase() === job.client.toLowerCase() ||
                  (`${cu.first_name} ${cu.last_name}`).toLowerCase() === job.client.toLowerCase()
                )
              )
              if (byName?.company) return byName.company
              return job.client || '—'
            })()}
          </div>
          {job.due_date && (
            <div style={{ fontSize:11, color:'#6B7280', marginBottom:12 }}>
              Due {new Date(job.due_date).toLocaleDateString('en-NZ', { day:'numeric', month:'short', timeZone:'Pacific/Auckland' })}
            </div>
          )}
          <div style={{ height:1, background:'#F3F4F6', marginBottom:12 }} />
          <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', gap:8 }}>
            <TaskPill job={job} />
            {colors.length > 0 && (
              <div style={{ display:'flex', gap:3, alignItems:'center', flexShrink:0 }}>
                {colors.slice(0,4).map((c,i) => <SwatchDot key={i} c={c} />)}
                {colors.length > 4 && <span style={{ fontSize:10, color:'#9CA3AF', marginLeft:2 }}>+{colors.length-4}</span>}
              </div>
            )}
          </div>
          <JobTimeStatus job={job} activeEntries={activeEntries} procEntries={procEntries} procStatuses={procStatuses} accent={accent} />

          {/* Unordered materials */}
          {unorderedCount > 0 && (
            <div style={{ display:'flex', alignItems:'center', gap:5, padding:'4px 8px', background:'#FEF9C3', border:'1px solid #FDE68A', borderRadius:8, marginTop:4 }}>
              <span style={{ fontSize:12,lineHeight:1 }}>📦</span>
              <span style={{ fontSize:11,fontWeight:600,color:'#854D0E' }}>{unorderedCount} item{unorderedCount!==1?'s':''} to order</span>
            </div>
          )}
        </div>
      </div>
      {colors.length > 0 && <MatHoverPanel colors={colors} visible={hovered} />}
    </div>
  )
}

const TABS = [
  { key:'active',    label:'Active',               f: j => j.status === 'In progress' },
  { key:'submitted', label:'Submitted for approval',f: j => j.status === 'Submitted for approval' },
  { key:'review',    label:'Review',               f: j => j.status === 'Review' },
  { key:'hold',      label:'On hold',              f: j => j.status === 'On hold' },
  { key:'done',      label:'Done',                 f: j => j.status === 'Complete', hideCount: true },
]

export default function Dashboard() {
  const navigate = useNavigate()
  const { can, profile } = useApp()
  const toast    = useToast()
  const [jobs, setJobs]       = useState([])
  const [loading, setLoading] = useState(true)
  const [tab, setTab]         = useState('active')
  const [search, setSearch]   = useState('')
  const [showModal, setShowModal] = useState(false)
  const [activeEntries, setActiveEntries] = useState([])
  const [sortBy, setSortBy] = useState('created_desc')
  const [allCustomers, setAllCustomers] = useState([])
  const [jobProcessData, setJobProcessData] = useState({}) // jobId -> active clock-in entries
  const [jobProcessStatus, setJobProcessStatus] = useState({}) // jobId -> [{name,status,color,allocated_hours,time_logged}]
  const [unorderedCounts, setUnorderedCounts] = useState({}) // jobId -> count // currently clocked-in sessions

  const loadJobs = useCallback(async () => {
    if (profile === undefined) return // context not ready yet
    setLoading(true)
    let q = supabase.from('jobs').select('*, customers(id,first_name,last_name,company)').order('created_at', { ascending:false })
    if (!can('seeAllJobs') && profile?.id) {
      const { data: a } = await supabase.from('job_assignments').select('job_id').eq('user_id', profile?.id)
      const ids = (a||[]).map(x => x.job_id)
      if (ids.length) q = q.in('id', ids)
      else { setJobs([]); setLoading(false); return }
    }
    const { data, error } = await q
    if (error) toast(error.message, 'error')
    else setJobs(data||[])
    setLoading(false)
  }, [can, profile])

  useEffect(() => { loadJobs() }, [loadJobs])

  useEffect(() => {
    const handler = () => setShowModal(true)
    window.addEventListener('open-new-job', handler)
    return () => window.removeEventListener('open-new-job', handler)
  }, [])

  function loadLiveData() {
    supabase.from('time_entries').select('*').is('clocked_out_at', null)
      .then(({ data }) => setActiveEntries(data || []))
    supabase.from('time_entries')
      .select('job_id,clocked_in_at,process_id,job_processes(id,name,allocated_hours,time_logged,color),profiles(id,full_name,email)')
      .is('clocked_out_at', null).not('process_id', 'is', null)
      .then(({ data: ae }) => {
        const map = {}
        ;(ae||[]).forEach(e => { if (!map[e.job_id]) map[e.job_id]=[]; map[e.job_id].push(e) })
        setJobProcessData(map)
      })
    supabase.from('job_processes').select('job_id,name,status,color,allocated_hours,time_logged,assigned_to,profiles(id,full_name,email)')
      .neq('status','Complete').order('sort_order')
      .then(({ data: jp }) => {
        const map = {}
        ;(jp||[]).forEach(p => { if (!map[p.job_id]) map[p.job_id]=[]; map[p.job_id].push(p) })
        setJobProcessStatus(map)
      })
    supabase.from('order_items').select('job_id').eq('status','To order')
      .then(({ data: oi }) => {
        const counts = {}
        ;(oi||[]).forEach(o => { counts[o.job_id]=(counts[o.job_id]||0)+1 })
        setUnorderedCounts(counts)
      })
  }

  // Load live data on mount and every 30s — only when tab is visible
  useEffect(() => {
    loadLiveData()
    const interval = setInterval(() => {
      if (!document.hidden) loadLiveData()
    }, 30000)
    return () => clearInterval(interval)
  }, [])

  // Listen for task completions from TaskCounter — update job card instantly
  useEffect(() => {
    function handleTasksUpdated(e) {
      const jobId = e.detail?.jobId
      supabase.from('jobs').select('id,tasks').eq('id', jobId).single()
        .then(({ data }) => {
          if (data) setJobs(prev => prev.map(j => j.id === jobId ? { ...j, tasks: data.tasks } : j))
        })
    }
    window.addEventListener('tasks-updated', handleTasksUpdated)
    return () => window.removeEventListener('tasks-updated', handleTasksUpdated)
  }, [])

  const sortedJobs = [...jobs].sort((a, b) => {
    if (sortBy === 'created_desc') return new Date(b.created_at) - new Date(a.created_at)
    if (sortBy === 'created_asc')  return new Date(a.created_at) - new Date(b.created_at)
    if (sortBy === 'due_asc') {
      if (!a.due_date && !b.due_date) return 0
      if (!a.due_date) return 1
      if (!b.due_date) return -1
      return new Date(a.due_date) - new Date(b.due_date)
    }
    if (sortBy === 'due_desc') {
      if (!a.due_date && !b.due_date) return 0
      if (!a.due_date) return 1
      if (!b.due_date) return -1
      return new Date(b.due_date) - new Date(a.due_date)
    }
    if (sortBy === 'number_asc') return (a.job_number||a.mvnum||'').localeCompare(b.job_number||b.mvnum||'', undefined, {numeric:true})
    if (sortBy === 'name_asc') return (a.name||'').localeCompare(b.name||'')
    return 0
  })

  const filtered = sortedJobs.filter(j => {
    const tabOk    = TABS.find(t => t.key === tab)?.f(j) ?? true
    const q        = search.toLowerCase()
    const searchOk = !q || [j.name, j.client, j.id, j.type, j.job_number, j.mvnum, j.customers?.company].some(s => (s||'').toLowerCase().includes(q))
    return tabOk && searchOk
  })

  const stats = {
    active:   jobs.filter(j => j.status === 'In progress').length,
    review:   jobs.filter(j => j.status === 'Review').length,
    hold:     jobs.filter(j => j.status === 'On hold').length,
    tasks:    jobs.reduce((a, j) => { const t = j.tasks ? JSON.parse(j.tasks) : []; return a + t.filter(x=>!x.done).length }, 0),
    overdue:  jobs.reduce((a, j) => { const t = j.tasks ? JSON.parse(j.tasks) : []; return a + t.filter(x=>!x.done&&x.date&&new Date(x.date)<TODAY).length }, 0),
    hours:    jobs.reduce((a, j) => a + (parseFloat(j.time_logged)||0), 0).toFixed(1),
    onSched:  jobs.length > 0 ? Math.round(jobs.filter(j => { const b=parseFloat(j.budget_hours)||0; const l=parseFloat(j.time_logged)||0; return b===0||l<=b }).length / jobs.length * 100) : 100,
  }

  if (!profile && !can('seeAllJobs')) return (
    <div style={{ display:'flex', justifyContent:'center', padding:'60px 0' }}><div className="spinner" /></div>
  )

  return (
    <>
      {/* stat row */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(2,1fr)', gap:10, marginBottom:16 }}>
        <StatCard label="Active jobs"  value={stats.active}        sub={`${stats.review} in review`}        subColor="#6B7280" iconBg="#EEF2FF" iconColor="#5B8AF0" icon={<><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/></>} />
        <StatCard label="Tasks open"   value={stats.tasks}         sub={stats.overdue > 0 ? `⚠ ${stats.overdue} overdue` : 'All on track'} subColor={stats.overdue > 0 ? '#991B1B' : '#065F46'} iconBg="#FEF3C7" iconColor="#D97706" icon={<><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></>} />
        <StatCard label="Hours logged" value={stats.hours + 'h'}   sub="total across jobs"                  subColor="#6B7280" iconBg="#ECFDF5" iconColor="#1D9E75" icon={<><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></>} />
        <StatCard label="On schedule"  value={stats.onSched + '%'} sub={`${jobs.filter(j=>{const b=parseFloat(j.budget_hours)||0;const l=parseFloat(j.time_logged)||0;return b===0||l<=b}).length} of ${jobs.length} jobs`} subColor={stats.onSched >= 75 ? '#065F46' : '#991B1B'} iconBg="#F0FDF4" iconColor="#16A34A" icon={<polyline points="20 6 9 17 4 12"/>} />
      </div>

      {/* jobs header */}
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:12, flexWrap:'wrap', gap:8 }}>
        <div style={{ display:'flex', alignItems:'center', gap:12 }}>
          <span style={{ fontSize:15, fontWeight:700, color:'#2A3042' }}>Jobs</span>
          {/* search */}
          <div style={{ position:'relative' }}>
            <span style={{ position:'absolute', left:10, top:'50%', transform:'translateY(-50%)', color:'#9CA3AF', fontSize:14, pointerEvents:'none' }}>⌕</span>
            <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search…"
              style={{ height:34, paddingLeft:30, paddingRight:10, fontSize:13, border:'1px solid #DDE3EC', borderRadius:9, background:'#fff', color:'#2A3042', outline:'none', width:180 }}
              onFocus={e=>e.target.style.borderColor='#5B8AF0'} onBlur={e=>e.target.style.borderColor='#DDE3EC'} />
          </div>
        </div>
        {/* tabs */}
        <div style={{ display:'flex', gap:2, background:'#F0F2F5', borderRadius:10, padding:3, overflowX:'auto', flexShrink:0 }}>
          {TABS.map(t => {
            const count = jobs.filter(t.f).length
            return (
              <button key={t.key} onClick={() => setTab(t.key)}
                style={{ fontSize:12, fontWeight: tab===t.key ? 600 : 500, padding:'5px 12px', borderRadius:8, border:'none', cursor:'pointer', background: tab===t.key ? '#fff' : 'transparent', color: tab===t.key ? '#2A3042' : '#9CA3AF', boxShadow: tab===t.key ? '0 1px 4px rgba(0,0,0,0.08)' : 'none', transition:'all .12s', display:'flex', alignItems:'center', gap:5, whiteSpace:'nowrap' }}>
                {t.label}
                {!t.hideCount && (
                  <span style={{ fontSize:10, fontWeight:700, padding:'1px 5px', borderRadius:8, background: tab===t.key ? '#EEF2FF' : '#E8ECF0', color: tab===t.key ? '#5B8AF0' : '#9CA3AF', minWidth:16, textAlign:'center' }}>
                    {count}
                  </span>
                )}
              </button>
            )
          })}
        </div>
      </div>

      {/* job grid */}
      {loading ? (
        <div style={{ display:'flex', justifyContent:'center', padding:'60px 0' }}><div className="spinner" /></div>
      ) : (
        <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(min(100%,240px),1fr))', gap:12 }}>
          {filtered.length === 0 && (
            <div style={{ gridColumn:'1/-1', textAlign:'center', padding:'60px 0', color:'#9CA3AF', fontSize:14 }}>
              {search ? `No jobs match "${search}"` : 'No jobs in this category'}
            </div>
          )}
          {filtered.map((job, i) => (
            <JobCard key={job.id} job={job} index={i} onClick={() => navigate(`/job/${job.id}`)} activeEntries={activeEntries} procEntries={jobProcessData[job.id]||[]} procStatuses={jobProcessStatus[job.id]||[]} unorderedCount={unorderedCounts[job.id]||0} allCustomers={allCustomers} />
          ))}
          {can('createJob') && tab !== 'done' && (
            <div onClick={() => setShowModal(true)}
              style={{ border:'2px dashed #DDE3EC', borderRadius:12, display:'flex', alignItems:'center', justifyContent:'center', fontSize:13, color:'#9CA3AF', cursor:'pointer', minHeight:160, transition:'all .12s' }}
              onMouseEnter={e=>{e.currentTarget.style.borderColor='#5B8AF0';e.currentTarget.style.color='#5B8AF0'}}
              onMouseLeave={e=>{e.currentTarget.style.borderColor='#DDE3EC';e.currentTarget.style.color='#9CA3AF'}}>
              + New job
            </div>
          )}
        </div>
      )}

      <NewJobModal show={showModal} onClose={() => setShowModal(false)}
        onCreated={job => { setJobs(j => [job, ...j]); navigate(`/job/${job.id}`) }}
        nextId={`J-${String(jobs.length+1).padStart(3,'0')}`} />
    </>
  )
}
