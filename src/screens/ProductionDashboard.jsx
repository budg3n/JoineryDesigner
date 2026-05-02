import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { useApp } from '../context/AppContext'
import { useToast } from '../components/Toast'
import { useLiveTimer, fmtHours } from './ClockIn'

// ── Active clock-in banner ────────────────────────────────────────
function ActiveBanner({ entry, onClockOut }) {
  const elapsed = useLiveTimer(entry?.clocked_in_at)
  if (!entry) return null
  const proc = entry.job_processes
  const jobName = entry.jobs?.name?.replace(/^.+?[—–-]{1,2}\s*/, '') || entry.jobs?.name || 'Job'
  return (
    <div style={{ background:'linear-gradient(135deg,#065F46,#1D9E75)', borderRadius:12, padding:'14px 18px', marginBottom:16, display:'flex', alignItems:'center', gap:12 }}>
      <div style={{ width:10, height:10, borderRadius:'50%', background:'#6EE7B7', flexShrink:0, boxShadow:'0 0 0 3px rgba(110,231,183,0.3)' }} />
      <div style={{ flex:1 }}>
        <div style={{ fontSize:14, fontWeight:700, color:'#fff' }}>{proc?.name || 'Process'} — {jobName}</div>
        <div style={{ fontSize:12, color:'rgba(255,255,255,0.8)', marginTop:2 }}>⏱ {fmtHours(elapsed / 60)} this session</div>
      </div>
      <button onClick={onClockOut} style={{ fontSize:12, fontWeight:700, padding:'8px 16px', borderRadius:9, border:'none', background:'rgba(255,255,255,0.2)', color:'#fff', cursor:'pointer' }}>
        Clock out
      </button>
    </div>
  )
}

// ── Single feedback item entry ────────────────────────────────────
function FeedbackItem({ item, index, onChange, onRemove }) {
  const CATEGORIES = ['General','Material Issue','Measurement Error','Design Problem','Equipment Issue','Safety Concern','Quality Issue','Other']
  const SEVERITIES = [
    { val:'Minor',    color:'#1D9E75', bg:'#DCFCE7' },
    { val:'Moderate', color:'#EF9F27', bg:'#FEF9C3' },
    { val:'Major',    color:'#E24B4A', bg:'#FEF2F2' },
  ]

  return (
    <div style={{ background:'#fff', borderRadius:12, border:'1px solid #E8ECF0', padding:16, position:'relative' }}>
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:12 }}>
        <span style={{ fontSize:12, fontWeight:700, color:'#9CA3AF', textTransform:'uppercase', letterSpacing:'.05em' }}>Issue {index + 1}</span>
        {onRemove && (
          <button onClick={onRemove} style={{ background:'none', border:'none', cursor:'pointer', color:'#D1D5DB', fontSize:18, lineHeight:1 }}
            onMouseEnter={e=>e.currentTarget.style.color='#E24B4A'} onMouseLeave={e=>e.currentTarget.style.color='#D1D5DB'}>×</button>
        )}
      </div>

      {/* Category */}
      <div style={{ marginBottom:10 }}>
        <label style={{ fontSize:11, fontWeight:700, color:'#374151', textTransform:'uppercase', letterSpacing:'.05em', display:'block', marginBottom:6 }}>Category</label>
        <div style={{ display:'flex', flexWrap:'wrap', gap:5 }}>
          {CATEGORIES.map(c => (
            <button key={c} onClick={() => onChange({ ...item, category: c })}
              style={{ fontSize:11, fontWeight:600, padding:'4px 10px', borderRadius:20, border:'1px solid', cursor:'pointer',
                borderColor: item.category===c ? '#5B8AF0':'#E8ECF0',
                background: item.category===c ? '#EEF2FF':'#F9FAFB',
                color: item.category===c ? '#3730A3':'#6B7280' }}>
              {c}
            </button>
          ))}
        </div>
      </div>

      {/* Severity */}
      <div style={{ marginBottom:10 }}>
        <label style={{ fontSize:11, fontWeight:700, color:'#374151', textTransform:'uppercase', letterSpacing:'.05em', display:'block', marginBottom:6 }}>Severity</label>
        <div style={{ display:'flex', gap:6 }}>
          {SEVERITIES.map(s => (
            <button key={s.val} onClick={() => onChange({ ...item, severity: s.val })}
              style={{ flex:1, padding:'8px 4px', borderRadius:9, border:`2px solid ${item.severity===s.val ? s.color:'#E8ECF0'}`,
                background: item.severity===s.val ? s.bg:'#F9FAFB', cursor:'pointer', textAlign:'center' }}>
              <div style={{ fontSize:12, fontWeight:700, color: item.severity===s.val ? s.color:'#6B7280' }}>{s.val}</div>
            </button>
          ))}
        </div>
      </div>

      {/* Description */}
      <div style={{ marginBottom:10 }}>
        <label style={{ fontSize:11, fontWeight:700, color:'#374151', textTransform:'uppercase', letterSpacing:'.05em', display:'block', marginBottom:6 }}>What happened</label>
        <textarea value={item.message} onChange={e => onChange({ ...item, message: e.target.value })}
          placeholder="Describe the issue…" rows={3}
          style={{ width:'100%', padding:'8px 10px', border:'1px solid #DDE3EC', borderRadius:8, fontSize:13, outline:'none', resize:'none', boxSizing:'border-box', fontFamily:'inherit' }} />
      </div>


    </div>
  )
}

// ── Feedback panel (bottom sheet) ─────────────────────────────────
function FeedbackSheet({ job, onClose, onSubmit }) {
  const EMPTY = { category:'General', severity:'Minor', message:'' }
  const draftKey = `feedback_draft_${job.id}`

  const [items, setItems] = useState(() => {
    try {
      const saved = localStorage.getItem(draftKey)
      return saved ? JSON.parse(saved) : [{ ...EMPTY }]
    } catch { return [{ ...EMPTY }] }
  })
  const [submitting, setSubmitting] = useState(false)
  const [savedAt, setSavedAt]       = useState(null)

  // Auto-save to localStorage on every change
  function updateItem(i, val) {
    setItems(p => {
      const next = p.map((x,idx) => idx===i ? val : x)
      localStorage.setItem(draftKey, JSON.stringify(next))
      setSavedAt(new Date())
      return next
    })
  }
  function addItem() {
    setItems(p => {
      const next = [...p, { ...EMPTY }]
      localStorage.setItem(draftKey, JSON.stringify(next))
      return next
    })
  }
  function removeItem(i) {
    setItems(p => {
      const next = p.filter((_,idx) => idx!==i)
      localStorage.setItem(draftKey, JSON.stringify(next))
      return next
    })
  }

  function saveDraftAndClose() {
    localStorage.setItem(draftKey, JSON.stringify(items))
    onClose()
  }

  const canSubmit = items.every(it => it.message.trim())
  const hasDraft  = items.some(it => it.message.trim() || it.category !== 'General' || it.severity !== 'Minor')

  async function submit() {
    if (!canSubmit) return
    setSubmitting(true)
    await onSubmit(items)
    localStorage.removeItem(draftKey)
    setSubmitting(false)
  }

  const jobName = job.name?.replace(/^.+?[—–-]{1,2}\s*/, '') || job.name

  return (
    <div style={{ position:'fixed', inset:0, zIndex:800, background:'rgba(0,0,0,0.5)', display:'flex', alignItems:'flex-start', justifyContent:'center', paddingTop:16, paddingLeft:16, paddingRight:16 }}
      onClick={e => e.target===e.currentTarget && onClose()}>
      <div style={{ background:'#F3F4F6', borderRadius:20, width:'100%', maxWidth:560, maxHeight:'calc(100vh - 32px)', display:'flex', flexDirection:'column', boxShadow:'0 24px 64px rgba(0,0,0,0.25)' }}>
        {/* Header */}
        <div style={{ padding:'16px 20px 12px', background:'#fff', borderRadius:'20px 20px 0 0', borderBottom:'1px solid #E8ECF0', flexShrink:0 }}>
          <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', gap:10 }}>
            <div>
              <div style={{ fontSize:17, fontWeight:800, color:'#2A3042' }}>Job Feedback</div>
              <div style={{ fontSize:13, color:'#9CA3AF', marginTop:2 }}>{jobName}</div>
              {savedAt && <div style={{ fontSize:11, color:'#1D9E75', marginTop:3 }}>✓ Draft saved</div>}
              {!savedAt && hasDraft && <div style={{ fontSize:11, color:'#9CA3AF', marginTop:3 }}>Draft restored</div>}
            </div>
            <div style={{ display:'flex', gap:6, flexShrink:0 }}>
              {hasDraft && (
                <button onClick={saveDraftAndClose}
                  style={{ fontSize:12, fontWeight:700, padding:'7px 12px', borderRadius:8, border:'1px solid #C4D4F8', background:'#EEF2FF', color:'#3730A3', cursor:'pointer' }}>
                  Save & close
                </button>
              )}
              <button onClick={onClose} style={{ background:'#F3F4F6', border:'none', borderRadius:8, width:32, height:32, cursor:'pointer', fontSize:18, color:'#6B7280' }}>×</button>
            </div>
          </div>
        </div>

        {/* Items */}
        <div style={{ flex:1, overflowY:'auto', padding:'14px 16px', display:'flex', flexDirection:'column', gap:12 }}>
          {items.map((item, i) => (
            <FeedbackItem key={i} item={item} index={i}
              onChange={val => updateItem(i, val)}
              onRemove={items.length > 1 ? () => removeItem(i) : null} />
          ))}

          <button onClick={addItem}
            style={{ fontSize:13, fontWeight:600, padding:'10px', borderRadius:10, border:'1px dashed #C4D4F8', background:'#F0F4FF', color:'#5B8AF0', cursor:'pointer' }}>
            + Add another issue
          </button>
        </div>

        {/* Submit */}
        <div style={{ padding:'12px 16px', background:'#fff', borderTop:'1px solid #E8ECF0', flexShrink:0 }}>
          {!canSubmit && <div style={{ fontSize:11, color:'#9CA3AF', textAlign:'center', marginBottom:8 }}>Fill in "What happened" for each issue to submit</div>}
          <button onClick={submit} disabled={!canSubmit || submitting}
            style={{ width:'100%', padding:'14px', borderRadius:12, border:'none',
              background: canSubmit ? '#2A3042':'#E8ECF0',
              color: canSubmit ? '#fff':'#9CA3AF',
              fontSize:15, fontWeight:700, cursor: canSubmit ? 'pointer':'default' }}>
            {submitting ? 'Submitting…' : `Submit ${items.length} item${items.length!==1?'s':''}`}
          </button>
        </div>
      </div>
    </div>
  )
}

// Shows draft indicator on job card if there's an unsaved draft
function FeedbackDraftButton({ job, onFeedback }) {
  const draftKey = `feedback_draft_${job.id}`
  const [hasDraft, setHasDraft] = useState(false)
  useEffect(() => {
    try {
      const saved = localStorage.getItem(draftKey)
      if (saved) {
        const items = JSON.parse(saved)
        setHasDraft(items.some(it => it.message?.trim()))
      }
    } catch {}
  }, [draftKey])
  return (
    <button onClick={() => onFeedback(job)}
      style={{ width:'100%', fontSize:13, fontWeight:600, padding:'9px', borderRadius:9, cursor:'pointer',
        display:'flex', alignItems:'center', justifyContent:'center', gap:6,
        border: hasDraft ? '1px solid #FCD34D' : '1px solid #E8ECF0',
        background: hasDraft ? '#FFFBEB' : '#F9FAFB',
        color: hasDraft ? '#92400E' : '#374151' }}>
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/></svg>
      {hasDraft ? '● Continue feedback draft' : 'Submit feedback'}
    </button>
  )
}

// ── Job card ──────────────────────────────────────────────────────
function ProductionJobCard({ job, activeEntry, onClockIn, onFeedback }) {
  const [processes, setProcesses] = useState([])
  const [expanded, setExpanded]   = useState(false)

  useEffect(() => {
    supabase.from('job_processes').select('*').eq('job_id', job.id)
      .neq('status','Complete').order('sort_order')
      .then(({ data }) => setProcesses(data || []))
  }, [job.id])

  const jobName = job.name?.replace(/^.+?[—–-]{1,2}\s*/, '') || job.name
  const isActive = activeEntry?.job_id === job.id
  const activeProc = isActive ? processes.find(p => p.id === activeEntry?.process_id) : null

  return (
    <div style={{ background:'#fff', borderRadius:14, border:`1px solid ${isActive?'#86EFAC':'#E8ECF0'}`, overflow:'hidden', boxShadow:'0 1px 4px rgba(0,0,0,0.06)' }}>
      {isActive && <div style={{ height:3, background:'linear-gradient(90deg,#1D9E75,#34D399)' }} />}
      <div style={{ padding:'14px 16px' }}>
        <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', marginBottom:10 }}>
          <div>
            {job.job_number && <div style={{ fontSize:11, fontWeight:700, color:'#9CA3AF', fontFamily:'monospace', marginBottom:3 }}>{job.job_number}</div>}
            <div style={{ fontSize:16, fontWeight:700, color:'#2A3042' }}>{jobName}</div>
            <div style={{ fontSize:13, color:'#9CA3AF', marginTop:2 }}>{job.customers?.company || job.client}</div>
          </div>
          {isActive && (
            <span style={{ fontSize:11, fontWeight:700, padding:'3px 9px', borderRadius:20, background:'#DCFCE7', color:'#065F46', border:'1px solid #86EFAC' }}>
              ● {activeProc?.name || 'Active'}
            </span>
          )}
        </div>

        {processes.length > 0 && (
          <div style={{ marginBottom:10 }}>
            <button onClick={() => setExpanded(s=>!s)}
              style={{ fontSize:12, color:'#6B7280', background:'none', border:'none', cursor:'pointer', padding:0, display:'flex', alignItems:'center', gap:4, marginBottom: expanded?8:0 }}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
                style={{ transform: expanded?'rotate(90deg)':'rotate(0)', transition:'transform .15s' }}>
                <polyline points="9 18 15 12 9 6"/>
              </svg>
              {processes.length} process{processes.length!==1?'es':''} available
            </button>
            {expanded && processes.map(proc => {
              const isClockedIntoThis = isActive && activeEntry?.process_id === proc.id
              return (
                <div key={proc.id} style={{ display:'flex', alignItems:'center', gap:10, padding:'8px 12px', background:'#F9FAFB', borderRadius:9, border:'1px solid #E8ECF0', marginBottom:5 }}>
                  <div style={{ width:8, height:8, borderRadius:'50%', background:proc.color||'#9CA3AF', flexShrink:0 }} />
                  <span style={{ fontSize:13, fontWeight:600, color:'#374151', flex:1 }}>{proc.name}</span>
                  {isClockedIntoThis ? (
                    <span style={{ fontSize:11, color:'#1D9E75', fontWeight:700 }}>● Active</span>
                  ) : (
                    <button onClick={() => onClockIn(job, proc)}
                      style={{ fontSize:11, fontWeight:700, padding:'4px 10px', borderRadius:7, border:'1px solid #C4D4F8', background:'#EEF2FF', color:'#3730A3', cursor:'pointer' }}>
                      ▶ Start
                    </button>
                  )}
                </div>
              )
            })}
          </div>
        )}

        <div style={{ paddingTop:8, borderTop:'1px solid #F3F4F6' }}>
          <FeedbackDraftButton job={job} onFeedback={onFeedback} />
        </div>
      </div>
    </div>
  )
}

// ── Main ──────────────────────────────────────────────────────────
export default function ProductionDashboard() {
  const { profile } = useApp()
  const toast = useToast()
  const [jobs, setJobs]               = useState([])
  const [loading, setLoading]         = useState(true)
  const [activeEntry, setActiveEntry] = useState(null)
  const [feedbackJob, setFeedbackJob] = useState(null)

  useEffect(() => { if (profile?.id) loadData() }, [profile?.id])

  async function loadData() {
    const [{ data: jobsData }, { data: entryData }] = await Promise.all([
      supabase.from('jobs').select('*, customers(id,first_name,last_name,company)')
        .in('status', ['In progress','Review','Submitted for approval'])
        .order('created_at', { ascending: false }),
      supabase.from('time_entries').select('*, job_processes(id,name,color), jobs(id,name)')
        .eq('user_id', profile.id).is('clocked_out_at', null).maybeSingle()
    ])
    setJobs(jobsData || [])
    setActiveEntry(entryData || null)
    setLoading(false)
  }

  async function clockIn(job, proc) {
    if (activeEntry) {
      const inAt = String(activeEntry.clocked_in_at).endsWith('Z') ? activeEntry.clocked_in_at : activeEntry.clocked_in_at+'Z'
      const mins = (Date.now() - new Date(inAt).getTime()) / 60000
      await supabase.from('time_entries').update({ clocked_out_at: new Date().toISOString(), duration_minutes: Math.round(mins) }).eq('id', activeEntry.id)
    }
    const { data } = await supabase.from('time_entries').insert({
      job_id: job.id, user_id: profile.id, process_id: proc.id,
      clocked_in_at: new Date().toISOString()
    }).select('*, job_processes(id,name,color), jobs(id,name)').single()
    await supabase.from('job_processes').update({ status:'In progress', assigned_to: profile.id }).eq('id', proc.id)
    setActiveEntry(data)
    toast(`▶ Started ${proc.name}`)
  }

  async function clockOut() {
    if (!activeEntry) return
    const inAt = String(activeEntry.clocked_in_at).endsWith('Z') ? activeEntry.clocked_in_at : activeEntry.clocked_in_at+'Z'
    const mins = (Date.now() - new Date(inAt).getTime()) / 60000
    await supabase.from('time_entries').update({ clocked_out_at: new Date().toISOString(), duration_minutes: Math.round(mins) }).eq('id', activeEntry.id)
    toast(`✓ ${fmtHours(mins/60)} logged`)
    setActiveEntry(null)
  }

  async function submitFeedback(items) {
    // Insert all feedback items
    const rows = items.map(it => ({
      job_id: feedbackJob.id, submitted_by: profile.id,
      category: it.category, severity: it.severity,
      message: it.message, notes: it.notes || null,
      status: 'Open',
    }))
    const { error } = await supabase.from('job_feedback').insert(rows)
    if (error) { toast(error.message, 'error'); return }

    // Notify Setout/Admin/PM (not submitter)
    const { data: notifyUsers } = await supabase.from('profiles')
      .select('id').in('role', ['Admin','Project Manager','Setout']).neq('id', profile.id)
    if (notifyUsers?.length) {
      const jobName = feedbackJob.name?.replace(/^.+?[—–-]{1,2}\s*/, '') || feedbackJob.name
      const topSeverity = items.some(i=>i.severity==='Major') ? 'Major' : items.some(i=>i.severity==='Moderate') ? 'Moderate' : 'Minor'
      await supabase.from('notifications').insert(
        notifyUsers.map(u => ({
          user_id: u.id, type: 'feedback',
          title: `${topSeverity} feedback — ${jobName}`,
          body: `${items.length} issue${items.length!==1?'s':''} reported by ${profile.full_name?.split(' ')[0] || 'Production'}: ${items[0].category}${items.length>1?` +${items.length-1} more`:''}`,
          job_id: feedbackJob.id, read: false,
        }))
      )
    }
    toast(`✓ ${items.length} item${items.length!==1?'s':''} submitted`)
    setFeedbackJob(null)
  }

  if (loading) return <div style={{ textAlign:'center', padding:'60px 0', color:'#9CA3AF' }}>Loading…</div>

  return (
    <div style={{ maxWidth:560, margin:'0 auto' }}>
      <div style={{ marginBottom:20 }}>
        <h1 style={{ fontSize:20, fontWeight:800, color:'#2A3042', margin:'0 0 4px' }}>
          Hey {profile?.full_name?.split(' ')[0] || 'there'} 👋
        </h1>
        <p style={{ fontSize:13, color:'#9CA3AF', margin:0 }}>Active jobs you can work on</p>
      </div>
      <ActiveBanner entry={activeEntry} onClockOut={clockOut} />
      {jobs.length === 0
        ? <div style={{ textAlign:'center', padding:'60px 0', color:'#9CA3AF' }}><div style={{ fontSize:32, marginBottom:12 }}>🎉</div><div style={{ fontSize:15, fontWeight:600, color:'#374151' }}>No active jobs</div></div>
        : <div style={{ display:'flex', flexDirection:'column', gap:12 }}>
            {jobs.map(job => <ProductionJobCard key={job.id} job={job} activeEntry={activeEntry} onClockIn={clockIn} onFeedback={setFeedbackJob} />)}
          </div>
      }
      {feedbackJob && <FeedbackSheet job={feedbackJob} onClose={() => setFeedbackJob(null)} onSubmit={submitFeedback} />}
    </div>
  )
}
