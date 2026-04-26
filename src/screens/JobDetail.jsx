import React, { useState, useEffect, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { supabase, BUCKET, pubUrl } from '../lib/supabase'
import { useApp } from '../context/AppContext'
import { useToast } from '../components/Toast'
import BackButton from '../components/BackButton'
import StatusBadge from '../components/StatusBadge'

const TODAY = new Date(); TODAY.setHours(0,0,0,0)
const STATUSES = ['In progress','Review','Complete','On hold']

// Module-level cache — persists across navigations within the session
// so re-opening a job doesn't re-fetch the materials library
let _materialsCache = null
const TYPES    = ['Kitchen','Joinery','Laundry','Wardrobe','Other']

function dFromNow(dateStr, timeStr) {
  if (!dateStr) return null
  return (new Date(dateStr + 'T' + (timeStr || '09:00')) - new Date()) / 86400000
}

function DueBadge({ t }) {
  if (t.done) return <span className="text-[10px] px-1.5 py-0.5 rounded bg-gray-100 text-gray-400">Done</span>
  if (!t.date) return null
  const d = dFromNow(t.date, t.time)
  const lbl = new Date(t.date).toLocaleDateString('en-NZ', { day:'numeric', month:'short' }) + (t.time ? ' ' + t.time : '')
  if (d < 0)  return <span className="text-[10px] px-1.5 py-0.5 rounded bg-red-50 text-red-700 font-medium">⚠ Overdue · {lbl}</span>
  if (d < 2)  return <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-50 text-amber-700">Due soon · {lbl}</span>
  return <span className="text-[10px] px-1.5 py-0.5 rounded bg-teal-50 text-teal-700">Due {lbl}</span>
}

export default function JobDetail() {
  const { id }  = useParams()
  const navigate = useNavigate()
  const toast    = useToast()
  const { can } = useApp()

  const [job, setJob]       = useState(null)
  const [atts, setAtts]     = useState([])
  const [materials, setMaterials] = useState([])
  const [jobMats, setJobMats]     = useState([])
  const [allMats, setAllMats]     = useState([])
  const [loading, setLoading]     = useState(true)
  const [saving, setSaving]       = useState(false)
  const [tasks, setTasks]         = useState([])
  const [taskForm, setTaskForm]   = useState(false)
  const [newTask, setNewTask]     = useState({ title:'', date:'', time:'09:00' })
  const [matPickerOpen, setMatPickerOpen] = useState(false)
  const [lbIdx, setLbIdx]         = useState(null)
  const [uploading, setUploading] = useState(false)

  // Track if all-materials has been fetched yet (lazy)
  const allMatsFetched = React.useRef(false)

  const loadAll = useCallback(async () => {
    // Only fetch what we need to render the page immediately
    // allMats (materials library) is fetched lazily when picker is opened
    const [{ data: j }, { data: a }, { data: jm }] = await Promise.all([
      supabase.from('jobs').select('*').eq('id', id).single(),
      supabase.from('attachments').select('*').eq('job_id', id).order('created_at'),
      supabase.from('job_materials').select('*,materials(*)').eq('job_id', id),
    ])
    setJob(j); setAtts(a||[]); setJobMats(jm||[])
    setTasks(j?.tasks ? JSON.parse(j.tasks) : [])
    setLoading(false)
  }, [id])

  useEffect(() => { loadAll() }, [loadAll])

  // Lazy-load the full materials library only when picker is opened.
  // Uses a module-level cache so re-opening the same or different job
  // doesn't hit the database again in the same session.
  async function openMatPicker() {
    setMatPickerOpen(v => !v)
    if (!allMatsFetched.current) {
      allMatsFetched.current = true
      if (_materialsCache) {
        setAllMats(_materialsCache)
      } else {
        const { data } = await supabase.from('materials').select('*').order('name')
        _materialsCache = data || []
        setAllMats(_materialsCache)
      }
    }
  }

  async function saveJob() {
    setSaving(true)
    const { error } = await supabase.from('jobs').update({
      name: job.name, client: job.client, type: job.type, status: job.status,
      notes: job.notes, mvnum: job.mvnum, start_date: job.start_date,
      due_date: job.due_date, budget_hours: job.budget_hours, delivery_address: job.delivery_address,
    }).eq('id', id)
    setSaving(false)
    if (error) toast(error.message, 'error')
    else toast('Saved ✓')
  }

  // tasks
  const openTasks  = tasks.filter(t => !t.done)
  const overTasks  = openTasks.filter(t => t.date && dFromNow(t.date, t.time) < 0)
  const sortedTasks = [...tasks].sort((a,b) => {
    if (a.done !== b.done) return a.done ? 1 : -1
    if (!a.date && !b.date) return 0
    if (!a.date) return 1; if (!b.date) return -1
    return new Date(a.date) - new Date(b.date)
  })

  async function saveTasks(updated) {
    setTasks(updated)
    await supabase.from('jobs').update({ tasks: JSON.stringify(updated) }).eq('id', id)
  }

  async function addTask() {
    if (!newTask.title.trim()) return
    const updated = [...tasks, { id: Date.now().toString(), ...newTask, done: false }]
    await saveTasks(updated)
    setNewTask({ title:'', date:'', time:'09:00' })
    setTaskForm(false)
  }

  async function toggleTask(tid) {
    await saveTasks(tasks.map(t => t.id === tid ? { ...t, done: !t.done } : t))
  }

  async function deleteTask(tid) {
    await saveTasks(tasks.filter(t => t.id !== tid))
  }

  // attachments
  const imgAtts  = atts.filter(a => a.type?.startsWith('image/'))
  const fileAtts = atts.filter(a => !a.type?.startsWith('image/'))

  async function handleFiles(e) {
    setUploading(true)
    for (const file of Array.from(e.target.files)) {
      const path = `${id}/${Date.now()}_${file.name}`
      await supabase.storage.from(BUCKET).upload(path, file, { contentType: file.type })
      const { data } = await supabase.from('attachments').insert({ job_id: id, name: file.name, type: file.type, size: file.size, storage_path: path }).select().single()
      if (data) setAtts(prev => [...prev, data])
    }
    setUploading(false)
    toast('Uploaded ✓')
  }

  async function deleteAtt(att) {
    if (!confirm('Delete this file?')) return
    if (att.storage_path) await supabase.storage.from(BUCKET).remove([att.storage_path])
    await supabase.from('attachments').delete().eq('id', att.id)
    setAtts(prev => prev.filter(x => x.id !== att.id))
    if (lbIdx !== null) setLbIdx(null)
  }

  // materials
  const usedMatIds = jobMats.map(jm => jm.material_id)
  const availMats  = allMats.filter(m => !usedMatIds.includes(m.id))

  async function addMat(mid) {
    const { data } = await supabase.from('job_materials').insert({ job_id: id, material_id: mid }).select('*,materials(*)').single()
    if (data) {
      setJobMats(prev => [...prev, data])
      const colors = [...jobMats, data].filter(jm=>jm.materials).map(jm=>({ name: jm.materials.name, color: jm.materials.color||'#888', storage_path: jm.materials.storage_path||null, supplier: jm.materials.supplier||'', panel_type: jm.materials.panel_type||'', thickness: jm.materials.thickness||'' }))
      await supabase.from('jobs').update({ mat_colors: JSON.stringify(colors) }).eq('id', id)
    }
    setMatPickerOpen(false)
    toast('Material added ✓')
  }

  async function removeMat(jmid) {
    await supabase.from('job_materials').delete().eq('id', jmid)
    const remaining = jobMats.filter(x => x.id !== jmid)
    setJobMats(remaining)
    const colors = remaining.filter(jm=>jm.materials).map(jm=>({ name: jm.materials.name, color: jm.materials.color||'#888', storage_path: jm.materials.storage_path||null, supplier: jm.materials.supplier||'', panel_type: jm.materials.panel_type||'', thickness: jm.materials.thickness||'' }))
    await supabase.from('jobs').update({ mat_colors: JSON.stringify(colors) }).eq('id', id)
  }

  async function archiveJob() {
    if (!confirm('Archive this job?')) return
    await supabase.from('jobs').update({ status:'Complete' }).eq('id', id)
    navigate('/')
    toast('Job archived')
  }

  if (loading) return <div className="flex justify-center py-16"><div className="spinner" /></div>
  if (!job) return <div className="text-center py-16 text-gray-400">Job not found</div>

  const statusStyle = {
    'In progress': 'bg-blue-50 text-blue-700 border-blue-200',
    'Review':      'bg-amber-50 text-amber-700 border-amber-200',
    'Complete':    'bg-teal-50 text-teal-700 border-teal-200',
    'On hold':     'bg-gray-100 text-gray-600 border-gray-200',
  }

  return (
    <div>
      <BackButton to="/" label="Jobs" />

      {/* header */}
      <div className="flex items-start justify-between mb-4 gap-3 flex-wrap">
        <div>
          <h1 className="text-xl font-bold text-gray-900 dark:text-white">{job.name}</h1>
          <div className="text-sm text-gray-500 dark:text-zinc-400 mt-0.5">{job.id} · {job.type} · {job.client}</div>
        </div>
        <select value={job.status} onChange={e => setJob(j => ({ ...j, status: e.target.value }))}
          className={`text-xs font-semibold px-3 py-1.5 rounded-full border cursor-pointer ${statusStyle[job.status]}`}>
          {STATUSES.map(s => <option key={s}>{s}</option>)}
        </select>
      </div>

      {/* overdue banner */}
      {overTasks.length > 0 && (
        <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-xl px-4 py-3 mb-4 text-sm text-red-700">
          ⚠ {overTasks.length} overdue task{overTasks.length > 1 ? 's' : ''} on this job
        </div>
      )}

      {/* tasks */}
      <div className="card p-4 mb-3">
        <div className="flex items-center justify-between mb-3">
          <span className="section-title">Tasks</span>
          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${overTasks.length > 0 ? 'bg-red-50 text-red-700' : openTasks.length > 0 ? 'bg-blue-50 text-blue-700' : tasks.length > 0 ? 'bg-teal-50 text-teal-700' : 'bg-gray-100 text-gray-400'}`}>
            {overTasks.length > 0 ? `${openTasks.length} remaining · ${overTasks.length} overdue` : openTasks.length > 0 ? `${openTasks.length} of ${tasks.length} remaining` : tasks.length > 0 ? 'All complete' : 'No tasks'}
          </span>
        </div>
        <div className="divide-y divide-gray-100 dark:divide-zinc-700 mb-3">
          {sortedTasks.length === 0 && <div className="text-sm text-gray-400 py-2">No tasks yet</div>}
          {sortedTasks.map(t => {
            const isOver = !t.done && t.date && dFromNow(t.date, t.time) < 0
            return (
              <div key={t.id} className="flex items-start gap-2.5 py-2.5">
                <div onClick={() => toggleTask(t.id)}
                  className={`w-5 h-5 rounded-[4px] border-[1.5px] flex-shrink-0 mt-0.5 flex items-center justify-center cursor-pointer transition-colors
                    ${t.done ? 'bg-teal-500 border-teal-500 text-white' : isOver ? 'border-red-400' : 'border-gray-300 dark:border-zinc-600'}`}>
                  {t.done && <span className="text-[10px] font-bold">✓</span>}
                </div>
                <div className="flex-1 min-w-0">
                  <div className={`text-sm ${t.done ? 'line-through text-gray-400' : 'text-gray-900 dark:text-white'}`}>{t.title}</div>
                  <div className="flex flex-wrap gap-1.5 mt-1"><DueBadge t={t} /></div>
                </div>
                <button onClick={() => deleteTask(t.id)} className="text-gray-300 hover:text-red-400 text-lg leading-none bg-transparent border-none cursor-pointer flex-shrink-0">×</button>
              </div>
            )
          })}
        </div>
        {taskForm ? (
          <div className="border-t border-gray-100 dark:border-zinc-700 pt-3">
            <input className="input text-sm mb-2" placeholder="Task description…"
              value={newTask.title} onChange={e => setNewTask(p => ({ ...p, title: e.target.value }))}
              onKeyDown={e => e.key === 'Enter' && addTask()} autoFocus />
            <div className="grid grid-cols-2 gap-2 mb-3">
              <div><label className="label">Due date</label><input className="input text-sm" type="date" value={newTask.date} onChange={e => setNewTask(p => ({ ...p, date: e.target.value }))} /></div>
              <div><label className="label">Due time</label><input className="input text-sm" type="time" value={newTask.time} onChange={e => setNewTask(p => ({ ...p, time: e.target.value }))} /></div>
            </div>
            <div className="flex gap-2">
              <button onClick={addTask} className="btn-green btn-sm">Add task</button>
              <button onClick={() => setTaskForm(false)} className="btn btn-sm">Cancel</button>
            </div>
          </div>
        ) : (
          <button onClick={() => setTaskForm(true)} className="btn-blue btn-sm">+ Add task</button>
        )}
      </div>

      {/* job details */}
      <div className="card p-4 mb-3">
        <div className="section-title mb-3">Job details</div>
        <div className="grid grid-cols-2 gap-3">
          {[['Job name','name','text'],['Client','client','text'],['Microvellum #','mvnum','text'],['Budget hours','budget_hours','number'],['Start date','start_date','date'],['Due date','due_date','date']].map(([l,k,t]) => (
            <div key={k}><label className="label">{l}</label>
              <input className="input text-sm" type={t} value={job[k]||''} onChange={e => setJob(j => ({ ...j, [k]: e.target.value }))} />
            </div>
          ))}
          <div><label className="label">Job type</label>
            <select className="input text-sm" value={job.type||'Kitchen'} onChange={e => setJob(j => ({ ...j, type: e.target.value }))}>
              {TYPES.map(t => <option key={t}>{t}</option>)}
            </select>
          </div>
          <div><label className="label">Delivery address</label>
            <input className="input text-sm" value={job.delivery_address||''} onChange={e => setJob(j => ({ ...j, delivery_address: e.target.value }))} />
          </div>
        </div>
      </div>

      {/* notes */}
      <div className="card p-4 mb-3">
        <div className="section-title mb-2">Notes</div>
        <textarea className="input text-sm min-h-[80px] resize-y w-full" placeholder="Notes, observations, specs…"
          value={job.notes||''} onChange={e => setJob(j => ({ ...j, notes: e.target.value }))} />
      </div>

      {/* materials */}
      <div className="card p-4 mb-3">
        <div className="section-title mb-3">Materials</div>
        <div className="flex flex-wrap gap-2 mb-3">
          {jobMats.map(jm => {
            const m = jm.materials; if (!m) return null
            return (
              <div key={jm.id} className="flex items-center gap-1.5 px-2.5 py-1.5 bg-gray-50 dark:bg-zinc-700 border border-gray-200 dark:border-zinc-600 rounded-lg text-xs">
                <div className="w-3.5 h-3.5 rounded-[3px]" style={{ background: m.color||'#ccc' }} />
                <span className="font-medium text-gray-800 dark:text-zinc-200">{m.name}</span>
                <span className="text-gray-400">{m.panel_type} {m.thickness ? m.thickness+'mm' : ''}</span>
                <button onClick={() => removeMat(jm.id)} className="text-gray-300 hover:text-red-400 leading-none bg-transparent border-none cursor-pointer ml-1">×</button>
              </div>
            )
          })}
        </div>
        <button onClick={openMatPicker} className="btn-blue btn-sm">+ Add from library</button>
        {matPickerOpen && (
          <div className="mt-3 grid grid-cols-2 gap-2 max-h-52 overflow-y-auto border-t border-gray-100 dark:border-zinc-700 pt-3">
            {availMats.length === 0 ? <div className="col-span-2 text-sm text-gray-400 text-center py-3">All materials added</div> :
              availMats.map(m => (
                <div key={m.id} onClick={() => addMat(m.id)}
                  className="flex items-center gap-2 p-2 rounded-lg border border-gray-200 dark:border-zinc-700 cursor-pointer hover:border-gray-300 dark:hover:border-zinc-600 bg-white dark:bg-zinc-800">
                  {m.storage_path
                    ? <img src={pubUrl(m.storage_path)} className="w-7 h-7 rounded object-cover flex-shrink-0" alt="" loading="lazy" />
                    : <div className="w-7 h-7 rounded flex-shrink-0 bg-gray-100 dark:bg-zinc-700" />
                  }
                  <div><div className="text-xs font-medium text-gray-900 dark:text-white leading-tight">{m.name}</div>
                    <div className="text-[10px] text-gray-400">{m.panel_type} {m.thickness ? '· '+m.thickness+'mm' : ''}</div>
                  </div>
                </div>
              ))
            }
          </div>
        )}
      </div>

      {/* drawings */}
      <div className="card p-4 mb-3">
        <div className="section-title mb-3">Drawings &amp; sketches</div>
        {lbIdx !== null && (
          <div className="bg-black/90 rounded-xl p-3 mb-3 flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <span className="text-xs text-white/60 font-mono truncate flex-1">{imgAtts[lbIdx]?.name}</span>
              <div className="flex gap-2 flex-shrink-0">
                <button onClick={() => navigate(`/job/${id}/sketch/${atts.indexOf(imgAtts[lbIdx])}`)} className="text-xs px-3 py-1.5 rounded-lg border border-blue-400 bg-blue-400/30 text-white cursor-pointer">✏️ Edit</button>
                <button onClick={() => window.open(pubUrl(imgAtts[lbIdx]?.storage_path),'_blank')} className="text-xs px-3 py-1.5 rounded-lg border border-white/20 bg-white/10 text-white cursor-pointer">⬇️ Open</button>
                <button onClick={() => setLbIdx(null)} className="text-xs px-3 py-1.5 rounded-lg border border-white/20 bg-white/10 text-white cursor-pointer">Close</button>
                <button onClick={() => deleteAtt(imgAtts[lbIdx])} className="text-xs px-3 py-1.5 rounded-lg border border-red-400/30 bg-red-400/20 text-red-300 cursor-pointer">Delete</button>
              </div>
            </div>
            <img src={pubUrl(imgAtts[lbIdx]?.storage_path)} alt="" className="w-full max-h-[60vh] object-contain rounded-lg" />
            <div className="flex items-center justify-between">
              <button onClick={() => setLbIdx(i => Math.max(0, i-1))} disabled={lbIdx===0} className="text-white/60 hover:text-white disabled:opacity-30 bg-transparent border-none cursor-pointer text-lg">←</button>
              <span className="text-xs text-white/40">{lbIdx+1} / {imgAtts.length}</span>
              <button onClick={() => setLbIdx(i => Math.min(imgAtts.length-1, i+1))} disabled={lbIdx===imgAtts.length-1} className="text-white/60 hover:text-white disabled:opacity-30 bg-transparent border-none cursor-pointer text-lg">→</button>
            </div>
          </div>
        )}
        <div className="relative border-2 border-dashed border-gray-200 dark:border-zinc-600 rounded-xl px-4 py-3 text-sm text-gray-400 text-center cursor-pointer hover:border-gray-300 mb-3">
          <input type="file" accept="image/*,.pdf,.dwg,.dxf" multiple onChange={handleFiles} className="absolute inset-0 opacity-0 cursor-pointer w-full h-full" />
          {uploading ? 'Uploading…' : '📎 Tap to upload — images, PDFs, DWG, DXF'}
        </div>
        {imgAtts.length > 0 && (
          <div className="grid grid-cols-3 gap-2 mb-2">
            {imgAtts.map((a, i) => (
              <div key={a.id} onClick={() => setLbIdx(i)} className="relative aspect-square rounded-lg overflow-hidden border border-gray-200 dark:border-zinc-700 cursor-pointer hover:border-gray-300">
                <img src={pubUrl(a.storage_path)} alt={a.name} className="w-full h-full object-cover" loading="lazy" />
                <div className="absolute bottom-0 left-0 right-0 bg-black/40 px-1.5 py-0.5 text-[9px] text-white truncate">{a.name}</div>
                <button onClick={e => { e.stopPropagation(); deleteAtt(a) }} className="absolute top-1 right-1 w-5 h-5 rounded-full bg-black/50 text-white flex items-center justify-center text-xs border-none cursor-pointer">×</button>
              </div>
            ))}
          </div>
        )}
        {fileAtts.map(a => (
          <div key={a.id} onClick={() => window.open(pubUrl(a.storage_path),'_blank')}
            className="flex items-center gap-2 px-3 py-2.5 bg-gray-50 dark:bg-zinc-700/50 border border-gray-200 dark:border-zinc-700 rounded-lg cursor-pointer hover:border-gray-300 mb-2">
            <span className="text-base">📄</span>
            <span className="text-sm text-gray-600 dark:text-zinc-300 flex-1 truncate">{a.name}</span>
            <button onClick={e => { e.stopPropagation(); deleteAtt(a) }} className="text-gray-300 hover:text-red-400 text-base leading-none bg-transparent border-none cursor-pointer">×</button>
          </div>
        ))}
      </div>

      {/* actions */}
      <div className="flex flex-wrap gap-2 mb-3">
        <button onClick={saveJob} disabled={saving} className="btn-primary disabled:opacity-50">{saving ? 'Saving…' : 'Save changes'}</button>
        <button onClick={() => navigate(`/job/${id}/sketch`)} className="btn-green">✏️ New sketch</button>
      </div>
      <button onClick={archiveJob} className="btn btn-red btn-sm">Archive job</button>
    </div>
  )
}
