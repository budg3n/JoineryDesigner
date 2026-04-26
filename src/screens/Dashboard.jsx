import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useApp } from '../context/AppContext'
import { useToast } from '../components/Toast'
import Modal from '../components/Modal'
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

function SwatchStrip({ colors }) {
  if (!colors?.length) return (
    <span className="text-[10px] text-gray-400 border border-dashed border-gray-200 rounded px-1.5 py-0.5">No materials</span>
  )
  const vis = colors.slice(0, 4)
  const extra = colors.length - 4
  return (
    <div className="flex gap-1 items-end">
      {vis.map((c, i) => (
        <div key={i} title={c.name}
          className="w-6 h-6 rounded-[4px] border-2 border-white shadow-sm flex-shrink-0"
          style={{ background: c.color }} />
      ))}
      {extra > 0 && <div className="w-6 h-6 rounded-[4px] bg-gray-100 flex items-center justify-center text-[10px] text-gray-500">+{extra}</div>}
    </div>
  )
}

function TaskPill({ job }) {
  const s = taskStats(job)
  if (s.over > 0) return <span className="text-[11px] px-2 py-0.5 rounded-full bg-red-50 text-red-700 font-medium">⚠ {s.over} overdue · {s.open} left</span>
  if (s.open > 0) return <span className="text-[11px] px-2 py-0.5 rounded-full bg-teal-50 text-teal-700 font-medium">{s.open} task{s.open > 1 ? 's' : ''} left</span>
  if (s.total > 0) return <span className="text-[11px] px-2 py-0.5 rounded-full bg-teal-50 text-teal-700 font-medium">✓ All done</span>
  return <span className="text-[11px] px-2 py-0.5 rounded-full bg-gray-100 text-gray-400">No tasks</span>
}

function JobCard({ job, index, onClick }) {
  const [hovered, setHovered] = useState(false)
  const colors = job.mat_colors ? JSON.parse(job.mat_colors) : []
  const color = PALETTE[index % PALETTE.length]

  return (
    <div className="relative" onMouseEnter={() => setHovered(true)} onMouseLeave={() => setHovered(false)}>
      {/* swatch strip */}
      <div className={`absolute bottom-full left-0 right-0 px-3 pb-1.5 flex gap-1.5 items-end transition-all duration-150 pointer-events-none z-10 ${hovered ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-1'}`}>
        <SwatchStrip colors={colors} />
      </div>
      <div onClick={onClick}
        className="card p-3.5 cursor-pointer hover:border-gray-300 dark:hover:border-zinc-600 transition-colors active:scale-[0.98]">
        <div className="flex items-start justify-between mb-1.5">
          <span className="text-[10px] text-gray-400 font-mono">{job.id}</span>
          <StatusBadge status={job.status} />
        </div>
        <div className="font-semibold text-sm text-gray-900 dark:text-white mb-1 leading-snug">{job.name}</div>
        <div className="text-xs text-gray-500 dark:text-zinc-400 mb-3">{job.client || '—'}</div>
        <div className="flex flex-col gap-1.5">
          <TaskPill job={job} />
          {colors.length > 0 && (
            <div className="flex gap-1">
              {colors.slice(0, 3).map((c, i) => (
                <div key={i} className="w-2 h-2 rounded-[2px]" style={{ background: c.color }} />
              ))}
            </div>
          )}
        </div>
      </div>
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
