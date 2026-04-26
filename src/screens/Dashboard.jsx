import { useState, useEffect, useCallback, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase, pubUrl } from '../lib/supabase'
import { useApp } from '../context/AppContext'
import { useToast } from '../components/Toast'
import StatusBadge from '../components/StatusBadge'
import NewJobModal from '../components/NewJobModal'

const PALETTE = ['#378ADD','#1D9E75','#EF9F27','#7F77DD','#E24B4A','#D4537E','#5DCAA5']
const TODAY = new Date(); TODAY.setHours(0,0,0,0)

function taskStats(job) {
  const tasks = job.tasks ? JSON.parse(job.tasks) : []
  const open = tasks.filter(t => !t.done)
  const over = open.filter(t => t.date && new Date(t.date) < TODAY)
  return { open: open.length, over: over.length, total: tasks.length }
}

function TaskPill({ job }) {
  const s = taskStats(job)
  if (s.over > 0) return <span className="text-[11px] px-2 py-0.5 rounded-full bg-red-50 text-red-700 font-medium">⚠ {s.over} overdue · {s.open} left</span>
  if (s.open > 0) return <span className="text-[11px] px-2 py-0.5 rounded-full bg-teal-50 text-teal-700 font-medium">{s.open} task{s.open > 1 ? 's' : ''} left</span>
  if (s.total > 0) return <span className="text-[11px] px-2 py-0.5 rounded-full bg-teal-50 text-teal-700 font-medium">✓ All done</span>
  return <span className="text-[11px] px-2 py-0.5 rounded-full bg-gray-100 text-gray-400">No tasks</span>
}

function SwatchDot({ c, size = 'sm' }) {
  const dim = size === 'lg' ? 'w-10 h-10' : 'w-2.5 h-2.5'
  const radius = size === 'lg' ? 'rounded-lg' : 'rounded-[3px]'
  if (c.storage_path) {
    return (
      <div className={`${dim} ${radius} overflow-hidden flex-shrink-0 border border-white/60 shadow-sm`}>
        <img src={pubUrl(c.storage_path)} alt={c.name} className="w-full h-full object-cover" loading="lazy" />
      </div>
    )
  }
  return (
    <div className={`${dim} ${radius} flex-shrink-0 border border-white/40`}
      style={{ background: c.color || '#d1d5db' }} />
  )
}

function MaterialHoverPanel({ colors, visible }) {
  if (!colors.length) return null
  return (
    <div className="absolute left-full top-0 ml-2 z-50 pointer-events-none"
      style={{
        opacity: visible ? 1 : 0,
        transform: visible ? 'translateX(0)' : 'translateX(-8px)',
        transition: 'opacity 0.18s ease, transform 0.18s ease',
      }}>
      <div className="bg-white dark:bg-zinc-800 rounded-2xl shadow-xl border border-gray-100 dark:border-zinc-700 p-3 min-w-[190px] max-w-[230px]">
        <div className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-2.5">Materials</div>
        <div className="flex flex-col gap-2.5">
          {colors.map((c, i) => (
            <div key={i} className="flex items-center gap-2.5"
              style={{
                opacity: visible ? 1 : 0,
                transform: visible ? 'translateX(0)' : 'translateX(-6px)',
                transition: `opacity 0.14s ease ${i * 0.045}s, transform 0.14s ease ${i * 0.045}s`,
              }}>
              <SwatchDot c={c} size="lg" />
              <div className="min-w-0 flex-1">
                <div className="text-xs font-semibold text-gray-800 dark:text-zinc-200 truncate leading-tight">{c.name}</div>
                {c.supplier && <div className="text-[10px] text-gray-400 truncate">{c.supplier}</div>}
                {c.panel_type && (
                  <div className="text-[10px] text-gray-400 truncate">
                    {c.panel_type}{c.thickness ? ` · ${c.thickness}mm` : ''}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
        <div className="absolute top-4 -left-[5px] w-2.5 h-2.5 bg-white dark:bg-zinc-800 border-l border-b border-gray-100 dark:border-zinc-700 rotate-45" />
      </div>
    </div>
  )
}

function JobCard({ job, index, onClick }) {
  const [hovered, setHovered] = useState(false)
  const timerRef = useRef(null)
  const colors = job.mat_colors ? JSON.parse(job.mat_colors) : []
  const accentColor = PALETTE[index % PALETTE.length]

  function handleEnter() { clearTimeout(timerRef.current); setHovered(true) }
  function handleLeave() { timerRef.current = setTimeout(() => setHovered(false), 120) }

  const logged = parseFloat(job.time_logged) || 0
  const budget = parseFloat(job.budget_hours) || 0
  const progPct = budget > 0 ? Math.min(100, Math.round((logged / budget) * 100)) : 0
  const isOverBudget = budget > 0 && logged > budget

  return (
    <div className="relative" onMouseEnter={handleEnter} onMouseLeave={handleLeave}>
      <div className="absolute top-0 left-0 right-0 h-0.5 rounded-t-xl transition-opacity duration-200 z-10"
        style={{ background: accentColor, opacity: hovered ? 1 : 0 }} />

      <div onClick={onClick}
        className="card p-3.5 cursor-pointer transition-all duration-150 active:scale-[0.98] overflow-hidden"
        style={{ borderColor: hovered ? accentColor + '44' : undefined }}>

        <div className="flex items-start justify-between mb-1.5">
          <span className="text-[10px] text-gray-400 font-mono">{job.id}</span>
          <StatusBadge status={job.status} />
        </div>

        <div className="font-semibold text-sm text-gray-900 dark:text-white mb-0.5 leading-snug">{job.name}</div>
        <div className="text-xs text-gray-500 dark:text-zinc-400 mb-1">{job.client || '—'}</div>

        {job.due_date && (
          <div className="text-[10px] text-gray-400 mb-2">
            Due {new Date(job.due_date).toLocaleDateString('en-NZ', { day:'numeric', month:'short' })}
          </div>
        )}

        <div className="flex items-center justify-between gap-1 mb-2">
          <TaskPill job={job} />
          {colors.length > 0 && (
            <div className="flex items-center gap-0.5 flex-shrink-0">
              {colors.slice(0, 4).map((c, i) => <SwatchDot key={i} c={c} size="sm" />)}
              {colors.length > 4 && <span className="text-[10px] text-gray-400 ml-1">+{colors.length - 4}</span>}
            </div>
          )}
        </div>

        {budget > 0 && (
          <div>
            <div className="flex items-center justify-between mb-0.5">
              <span className="text-[10px] text-gray-400">{logged}h / {budget}h</span>
              <span className={`text-[10px] font-medium ${isOverBudget ? 'text-red-500' : 'text-gray-400'}`}>{progPct}%</span>
            </div>
            <div className="h-0.5 bg-gray-100 dark:bg-zinc-700 rounded-full overflow-hidden">
              <div className="h-full rounded-full"
                style={{ width: `${progPct}%`, background: isOverBudget ? '#E24B4A' : accentColor }} />
            </div>
          </div>
        )}
      </div>

      {colors.length > 0 && <MaterialHoverPanel colors={colors} visible={hovered} />}
    </div>
  )
}

const TABS = [
  { key: 'active',  label: 'Active',   filter: j => j.status === 'In progress' },
  { key: 'review',  label: 'Review',   filter: j => j.status === 'Review' },
  { key: 'hold',    label: 'On hold',  filter: j => j.status === 'On hold' },
  { key: 'done',    label: 'Done',     filter: j => j.status === 'Complete' },
]

export default function Dashboard() {
  const navigate   = useNavigate()
  const { can, profile } = useApp()
  const toast      = useToast()

  const [jobs, setJobs]         = useState([])
  const [loading, setLoading]   = useState(true)
  const [tab, setTab]           = useState('active')
  const [search, setSearch]     = useState('')
  const [showModal, setShowModal] = useState(false)

  const loadJobs = useCallback(async () => {
    setLoading(true)
    let q = supabase.from('jobs').select('*').order('created_at', { ascending: false })
    if (!can('seeAllJobs') && profile?.id) {
      const { data: assigned } = await supabase.from('job_assignments').select('job_id').eq('user_id', profile.id)
      const ids = (assigned || []).map(x => x.job_id)
      if (ids.length) q = q.in('id', ids)
      else { setJobs([]); setLoading(false); return }
    }
    const { data, error } = await q
    if (error) toast(error.message, 'error')
    else setJobs(data || [])
    setLoading(false)
  }, [can, profile])

  useEffect(() => { loadJobs() }, [loadJobs])

  const filtered = jobs.filter(j => {
    const tabMatch = TABS.find(t => t.key === tab)?.filter(j) ?? true
    const q = search.toLowerCase()
    const searchMatch = !q || (j.name || '').toLowerCase().includes(q) ||
      (j.client || '').toLowerCase().includes(q) || (j.id || '').toLowerCase().includes(q)
    return tabMatch && searchMatch
  })

  const stats = {
    active:  jobs.filter(j => j.status === 'In progress').length,
    review:  jobs.filter(j => j.status === 'Review').length,
    hold:    jobs.filter(j => j.status === 'On hold').length,
  }

  return (
    <>
      {/* search */}
      <div className="relative mb-3">
        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm pointer-events-none">⌕</span>
        <input value={search} onChange={e => setSearch(e.target.value)}
          placeholder="Search jobs, clients…"
          className="input pl-9 rounded-xl text-sm" />
        {search && (
          <button onClick={() => setSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 bg-transparent border-none cursor-pointer">✕</button>
        )}
      </div>

      {/* tabs */}
      <div className="flex border border-gray-200 dark:border-zinc-700 rounded-xl overflow-hidden mb-3">
        {TABS.map(t => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className={`flex-1 text-xs font-medium py-2 border-none cursor-pointer transition-colors
              ${tab === t.key ? 'bg-white dark:bg-zinc-800 text-gray-900 dark:text-white' : 'bg-gray-50 dark:bg-zinc-900 text-gray-500 dark:text-zinc-400 hover:bg-gray-100'}`}>
            {t.label}
          </button>
        ))}
      </div>

      {/* stats */}
      <div className="grid grid-cols-3 gap-2 mb-4">
        {[['Active', stats.active], ['Review', stats.review], ['On hold', stats.hold]].map(([l, v]) => (
          <div key={l} className="bg-gray-100 dark:bg-zinc-800 rounded-xl p-3">
            <div className="text-xs text-gray-500 dark:text-zinc-400 mb-1">{l}</div>
            <div className="text-xl font-bold text-gray-900 dark:text-white">{v}</div>
          </div>
        ))}
      </div>

      {/* grid */}
      {loading ? (
        <div className="flex justify-center py-16"><div className="spinner" /></div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
          {tab === 'done' && filtered.length > 0 && (
            <div className="col-span-full text-xs text-gray-400 border-b border-gray-200 pb-1">Archived / completed jobs</div>
          )}
          {filtered.map((job, i) => (
            <JobCard key={job.id} job={job} index={i} onClick={() => navigate(`/job/${job.id}`)} />
          ))}
          {filtered.length === 0 && (
            <div className="col-span-full text-center py-12 text-sm text-gray-400">
              {search ? `No jobs match "${search}"` : tab === 'done' ? 'No archived jobs yet.' : 'No jobs in this category.'}
            </div>
          )}
          {can('createJob') && tab !== 'done' && (
            <button onClick={() => setShowModal(true)}
              className="border border-dashed border-gray-200 dark:border-zinc-700 rounded-xl p-4 flex items-center justify-center text-sm text-gray-400 hover:border-gray-300 hover:text-gray-500 cursor-pointer min-h-[100px] bg-transparent">
              + New job
            </button>
          )}
        </div>
      )}

      <NewJobModal
        show={showModal}
        onClose={() => setShowModal(false)}
        onCreated={(job) => { setJobs(j => [job, ...j]); navigate(`/job/${job.id}`) }}
        nextId={`J-${String(jobs.length + 1).padStart(3, '0')}`}
      />
    </>
  )
}
