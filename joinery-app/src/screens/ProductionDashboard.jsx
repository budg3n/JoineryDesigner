import { useState, useEffect, useRef } from 'react'
import { supabase } from '../lib/supabase'
import { useApp } from '../context/AppContext'
import { useToast } from '../components/Toast'
import { fmtDateTime } from '../lib/dates'

function fmtHours(h) {
  const hrs = Math.floor(h), mins = Math.round((h-hrs)*60)
  return hrs > 0 ? `${hrs}h${mins>0?` ${mins}m`:''}` : `${mins}m`
}

const SEV_STYLES = {
  Minor:    { bg:'#F0FDF4', color:'#166534', border:'#86EFAC', dot:'#1D9E75' },
  Moderate: { bg:'#FEF9C3', color:'#854D0E', border:'#FDE68A', dot:'#EF9F27' },
  Major:    { bg:'#FEF2F2', color:'#991B1B', border:'#FCA5A5', dot:'#E24B4A' },
}

// ── Active clock-in banner ────────────────────────────────────────
function ActiveBanner({ entry, onClockOut }) {
  const [secs, setSecs] = useState(0)
  useEffect(() => {
    if (!entry) return
    const inAt = String(entry.clocked_in_at).endsWith('Z') ? entry.clocked_in_at : entry.clocked_in_at+'Z'
    const tick = () => setSecs(Math.floor((Date.now()-new Date(inAt).getTime())/1000))
    tick(); const t = setInterval(tick, 1000); return () => clearInterval(t)
  }, [entry?.id])
  if (!entry) return null
  const proc = entry.job_processes
  const jobName = entry.jobs?.name?.replace(/^.+?[—–-]{1,2}\s*/, '') || entry.jobs?.name || 'Job'
  const h = Math.floor(secs/3600), m = Math.floor((secs%3600)/60), s = secs%60
  const elapsed = `${h>0?h+'h ':''}${m}m ${s}s`
  return (
    <div style={{ background:'linear-gradient(135deg,#1D9E75,#059669)', borderRadius:14, padding:'14px 16px', marginBottom:16, color:'#fff' }}>
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', gap:10 }}>
        <div>
          <div style={{ fontSize:11, fontWeight:700, opacity:0.8, marginBottom:3, textTransform:'uppercase', letterSpacing:'.05em' }}>● Clocked in</div>
          <div style={{ fontSize:15, fontWeight:700 }}>{proc?.name || 'Process'} — {jobName}</div>
          <div style={{ fontSize:22, fontWeight:800, fontFamily:'monospace', marginTop:4 }}>{elapsed}</div>
        </div>
        <button onClick={onClockOut}
          style={{ padding:'10px 16px', borderRadius:10, border:'2px solid rgba(255,255,255,0.5)', background:'rgba(255,255,255,0.15)', color:'#fff', fontSize:13, fontWeight:700, cursor:'pointer', flexShrink:0 }}>
          ■ Clock out
        </button>
      </div>
    </div>
  )
}

// ── Single feedback item ──────────────────────────────────────────
function FeedbackItem({ item, index, rooms, onChange, onRemove }) {
  const CATS = ['General','Quality','Measurement','Material','Design','Safety','Other']
  const SEVS = ['Minor','Moderate','Major']
  return (
    <div style={{ background:'#fff', borderRadius:12, border:'1px solid #E8ECF0', padding:14, position:'relative' }}>
      {onRemove && (
        <button onClick={onRemove} style={{ position:'absolute', top:10, right:10, background:'none', border:'none', cursor:'pointer', color:'#9CA3AF', fontSize:18 }}
          onMouseEnter={e=>e.currentTarget.style.color='#E24B4A'} onMouseLeave={e=>e.currentTarget.style.color='#9CA3AF'}>×</button>
      )}
      <div style={{ fontSize:12, fontWeight:700, color:'#9CA3AF', marginBottom:10 }}>Issue {index+1}</div>

      {/* Room selector */}
      {rooms.length > 0 && (
        <div style={{ marginBottom:10 }}>
          <label style={{ fontSize:11, fontWeight:600, color:'#6B7280', display:'block', marginBottom:4 }}>Room (optional)</label>
          <select value={item.room_id||''} onChange={e=>onChange({...item,room_id:e.target.value||null})}
            style={{ width:'100%', padding:'8px 10px', border:'1px solid #DDE3EC', borderRadius:8, fontSize:13, outline:'none', background:'#fff' }}>
            <option value="">No specific room</option>
            {rooms.map(r=><option key={r.id} value={r.id}>{r.name}</option>)}
          </select>
        </div>
      )}

      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10, marginBottom:10 }}>
        <div>
          <label style={{ fontSize:11, fontWeight:600, color:'#6B7280', display:'block', marginBottom:4 }}>Category</label>
          <select value={item.category} onChange={e=>onChange({...item,category:e.target.value})}
            style={{ width:'100%', padding:'8px 10px', border:'1px solid #DDE3EC', borderRadius:8, fontSize:13, outline:'none', background:'#fff' }}>
            {CATS.map(c=><option key={c}>{c}</option>)}
          </select>
        </div>
        <div>
          <label style={{ fontSize:11, fontWeight:600, color:'#6B7280', display:'block', marginBottom:4 }}>Severity</label>
          <select value={item.severity} onChange={e=>onChange({...item,severity:e.target.value})}
            style={{ width:'100%', padding:'8px 10px', border:`1px solid ${SEV_STYLES[item.severity]?.border||'#DDE3EC'}`, borderRadius:8, fontSize:13, outline:'none', background:SEV_STYLES[item.severity]?.bg||'#fff', color:SEV_STYLES[item.severity]?.color||'#374151', fontWeight:600 }}>
            {SEVS.map(s=><option key={s}>{s}</option>)}
          </select>
        </div>
      </div>
      <div style={{ marginBottom:10 }}>
        <label style={{ fontSize:11, fontWeight:600, color:'#6B7280', display:'block', marginBottom:4 }}>What happened? *</label>
        <textarea value={item.message} onChange={e=>onChange({...item,message:e.target.value})} rows={3}
          placeholder="Describe the issue…"
          style={{ width:'100%', padding:'8px 10px', border:`1px solid ${item.message.trim()?'#DDE3EC':'#FCA5A5'}`, borderRadius:8, fontSize:13, outline:'none', resize:'none', fontFamily:'inherit', boxSizing:'border-box' }}/>
      </div>
      <div>
        <label style={{ fontSize:11, fontWeight:600, color:'#6B7280', display:'block', marginBottom:4 }}>Additional notes</label>
        <textarea value={item.notes||''} onChange={e=>onChange({...item,notes:e.target.value})} rows={2}
          placeholder="Any extra context…"
          style={{ width:'100%', padding:'8px 10px', border:'1px solid #DDE3EC', borderRadius:8, fontSize:13, outline:'none', resize:'none', fontFamily:'inherit', boxSizing:'border-box' }}/>
      </div>
    </div>
  )
}

// ── Feedback sheet ────────────────────────────────────────────────
function FeedbackSheet({ job, rooms, onClose, onSubmit }) {
  const EMPTY = { category:'General', severity:'Minor', message:'', notes:'', room_id:null }
  const draftKey = `feedback_draft_${job.id}`
  const [items, setItems] = useState(() => {
    try { const s = localStorage.getItem(draftKey); return s ? JSON.parse(s) : [{ ...EMPTY }] }
    catch { return [{ ...EMPTY }] }
  })
  const [submitting, setSubmitting] = useState(false)
  const [savedAt, setSavedAt] = useState(null)

  function updateItem(i, val) {
    setItems(p => { const next = p.map((x,idx) => idx===i ? val : x); localStorage.setItem(draftKey, JSON.stringify(next)); setSavedAt(new Date()); return next })
  }
  function addItem() { setItems(p => { const next=[...p,{...EMPTY}]; localStorage.setItem(draftKey,JSON.stringify(next)); return next }) }
  function removeItem(i) { setItems(p => { const next=p.filter((_,idx)=>idx!==i); localStorage.setItem(draftKey,JSON.stringify(next)); return next }) }
  function saveDraftAndClose() { localStorage.setItem(draftKey, JSON.stringify(items)); onClose() }

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
        <div style={{ padding:'16px 20px 12px', background:'#fff', borderRadius:'20px 20px 0 0', borderBottom:'1px solid #E8ECF0', flexShrink:0 }}>
          <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', gap:10 }}>
            <div>
              <div style={{ fontSize:17, fontWeight:800, color:'#2A3042' }}>Submit Feedback</div>
              <div style={{ fontSize:13, color:'#9CA3AF', marginTop:2 }}>{jobName}</div>
              {savedAt && <div style={{ fontSize:11, color:'#1D9E75', marginTop:3 }}>✓ Draft saved</div>}
            </div>
            <div style={{ display:'flex', gap:6, flexShrink:0 }}>
              {hasDraft && <button onClick={saveDraftAndClose} style={{ fontSize:12, fontWeight:700, padding:'7px 12px', borderRadius:8, border:'1px solid #C4D4F8', background:'#EEF2FF', color:'#3730A3', cursor:'pointer' }}>Save draft</button>}
              <button onClick={onClose} style={{ background:'#F3F4F6', border:'none', borderRadius:8, width:32, height:32, cursor:'pointer', fontSize:18, color:'#6B7280' }}>×</button>
            </div>
          </div>
        </div>
        <div style={{ flex:1, overflowY:'auto', padding:'14px 16px', display:'flex', flexDirection:'column', gap:12 }}>
          {items.map((item, i) => (
            <FeedbackItem key={i} item={item} index={i} rooms={rooms}
              onChange={val => updateItem(i, val)}
              onRemove={items.length > 1 ? () => removeItem(i) : null} />
          ))}
          <button onClick={addItem} style={{ fontSize:13, fontWeight:600, padding:'10px', borderRadius:10, border:'1px dashed #C4D4F8', background:'#F0F4FF', color:'#5B8AF0', cursor:'pointer' }}>
            + Add another issue
          </button>
        </div>
        <div style={{ padding:'12px 16px', background:'#fff', borderTop:'1px solid #E8ECF0', flexShrink:0 }}>
          {!canSubmit && <div style={{ fontSize:11, color:'#9CA3AF', textAlign:'center', marginBottom:8 }}>Fill in "What happened" for each issue to submit</div>}
          <button onClick={submit} disabled={!canSubmit||submitting}
            style={{ width:'100%', padding:'14px', borderRadius:12, border:'none', background:canSubmit?'#2A3042':'#E8ECF0', color:canSubmit?'#fff':'#9CA3AF', fontSize:15, fontWeight:700, cursor:canSubmit?'pointer':'default' }}>
            {submitting ? 'Submitting…' : `Submit ${items.length} feedback item${items.length!==1?'s':''}`}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Submitted feedback tile ───────────────────────────────────────
function FeedbackTile({ fb, rooms }) {
  const ss = SEV_STYLES[fb.severity] || SEV_STYLES.Minor
  const room = rooms.find(r => r.id === fb.room_id)
  return (
    <div style={{ background:'#fff', borderRadius:10, border:`1px solid ${ss.border}`, padding:'10px 14px', display:'flex', gap:10, alignItems:'flex-start' }}>
      <div style={{ width:8, height:8, borderRadius:'50%', background:ss.dot, flexShrink:0, marginTop:4 }}/>
      <div style={{ flex:1, minWidth:0 }}>
        <div style={{ display:'flex', alignItems:'center', gap:6, marginBottom:3, flexWrap:'wrap' }}>
          <span style={{ fontSize:11, fontWeight:700, padding:'1px 7px', borderRadius:20, background:ss.bg, color:ss.color }}>{fb.severity}</span>
          <span style={{ fontSize:11, color:'#9CA3AF' }}>{fb.category}</span>
          {room && <span style={{ fontSize:11, color:'#5B8AF0', fontWeight:600 }}>📍 {room.name}</span>}
          <span style={{ fontSize:10, color:'#C4C9D4', marginLeft:'auto' }}>{fmtDateTime(fb.created_at)}</span>
        </div>
        <div style={{ fontSize:13, color:'#374151', lineHeight:1.5 }}>{fb.message}</div>
        {fb.notes && <div style={{ fontSize:11, color:'#6B7280', marginTop:4, fontStyle:'italic' }}>{fb.notes}</div>}
        <div style={{ marginTop:5 }}>
          <span style={{ fontSize:10, fontWeight:700, padding:'1px 7px', borderRadius:20,
            background: fb.status==='Resolved'?'#DCFCE7':fb.status==='Acknowledged'?'#EEF2FF':'#FEF9C3',
            color: fb.status==='Resolved'?'#065F46':fb.status==='Acknowledged'?'#3730A3':'#854D0E' }}>
            {fb.status||'Open'}
          </span>
        </div>
      </div>
    </div>
  )
}

// ── Job card ──────────────────────────────────────────────────────
function ProductionJobCard({ job, activeEntry, onClockIn, onFeedback }) {
  const [processes, setProcesses] = useState([])
  const [rooms, setRooms]         = useState([])
  const [feedback, setFeedback]   = useState([])
  const [expanded, setExpanded]   = useState(false)
  const [fbExpanded, setFbExpanded] = useState(false)

  useEffect(() => {
    Promise.all([
      supabase.from('job_processes').select('*').eq('job_id', job.id).neq('status','Complete').order('sort_order'),
      supabase.from('rooms').select('id,name').eq('job_id', job.id).order('sort_order'),
      supabase.from('job_feedback').select('*').eq('job_id', job.id).order('created_at',{ascending:false}).limit(10),
    ]).then(([{data:p},{data:r},{data:f}]) => {
      setProcesses(p||[])
      setRooms(r||[])
      setFeedback(f||[])
    })
  }, [job.id])

  const jobName = job.name?.replace(/^.+?[—–-]{1,2}\s*/, '') || job.name
  const isActive = activeEntry?.job_id === job.id
  const activeProc = isActive ? processes.find(p => p.id === activeEntry?.process_id) : null
  const hasDraft = !!localStorage.getItem(`feedback_draft_${job.id}`)
  const openFb = feedback.filter(f => f.status !== 'Resolved')

  return (
    <div style={{ background:'#fff', borderRadius:14, border:`1px solid ${isActive?'#86EFAC':'#E8ECF0'}`, overflow:'hidden', boxShadow:'0 1px 4px rgba(0,0,0,0.06)' }}>
      {isActive && <div style={{ height:3, background:'linear-gradient(90deg,#1D9E75,#34D399)' }} />}
      <div style={{ padding:'14px 16px' }}>
        {/* Header */}
        <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', marginBottom:10 }}>
          <div>
            {job.job_number && <div style={{ fontSize:11, fontWeight:700, color:'#9CA3AF', fontFamily:'monospace', marginBottom:3 }}>#{job.job_number}</div>}
            <div style={{ fontSize:16, fontWeight:700, color:'#2A3042' }}>{jobName}</div>
            <div style={{ fontSize:13, color:'#9CA3AF', marginTop:2 }}>{job.customers?.company || job.client}</div>
          </div>
          {isActive && (
            <span style={{ fontSize:11, fontWeight:700, padding:'3px 9px', borderRadius:20, background:'#DCFCE7', color:'#065F46', border:'1px solid #86EFAC' }}>
              ● {activeProc?.name || 'Active'}
            </span>
          )}
        </div>

        {/* Processes */}
        {processes.length > 0 && (
          <div style={{ marginBottom:10 }}>
            <button onClick={() => setExpanded(s=>!s)}
              style={{ fontSize:12, color:'#6B7280', background:'none', border:'none', cursor:'pointer', padding:0, display:'flex', alignItems:'center', gap:4, marginBottom:expanded?8:0 }}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
                style={{ transform:expanded?'rotate(90deg)':'rotate(0)', transition:'transform .15s' }}>
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

        {/* Feedback section */}
        <div style={{ borderTop:'1px solid #F3F4F6', paddingTop:10 }}>
          {/* Submit feedback button */}
          <button onClick={() => onFeedback(job, rooms)}
            style={{ width:'100%', display:'flex', alignItems:'center', justifyContent:'center', gap:6, padding:'9px 14px', borderRadius:10,
              border:`1px solid ${hasDraft?'#FDE68A':'#E8ECF0'}`,
              background:hasDraft?'#FEF9C3':'#F9FAFB',
              color:hasDraft?'#854D0E':'#6B7280',
              fontSize:13, fontWeight:600, cursor:'pointer', marginBottom: openFb.length>0?10:0 }}
            onMouseEnter={e=>e.currentTarget.style.background=hasDraft?'#FEF3C7':'#F3F4F6'}
            onMouseLeave={e=>e.currentTarget.style.background=hasDraft?'#FEF9C3':'#F9FAFB'}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/></svg>
            {hasDraft ? '● Continue feedback draft' : 'Submit feedback'}
          </button>

          {/* Previous feedback tiles */}
          {openFb.length > 0 && (
            <div>
              <button onClick={() => setFbExpanded(s=>!s)}
                style={{ fontSize:11, fontWeight:600, color:'#9CA3AF', background:'none', border:'none', cursor:'pointer', padding:'2px 0', display:'flex', alignItems:'center', gap:4, marginBottom:fbExpanded?8:0 }}>
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
                  style={{ transform:fbExpanded?'rotate(90deg)':'rotate(0)', transition:'transform .15s' }}>
                  <polyline points="9 18 15 12 9 6"/>
                </svg>
                {openFb.length} open issue{openFb.length!==1?'s':''}
              </button>
              {fbExpanded && (
                <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
                  {openFb.map(fb => <FeedbackTile key={fb.id} fb={fb} rooms={rooms} />)}
                </div>
              )}
            </div>
          )}
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
  const [feedbackTarget, setFeedbackTarget] = useState(null)  // { job, rooms }

  useEffect(() => { if (profile?.id) loadData() }, [profile?.id])

  async function loadData() {
    const [{ data: jobsData }, { data: entryData }] = await Promise.all([
      supabase.from('jobs').select('*, customers(id,first_name,last_name,company)')
        .in('status', ['Pending','In progress','Review','Submitted for approval'])
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
    const job = feedbackTarget.job
    const rows = items.map(it => ({
      job_id: job.id, submitted_by: profile.id,
      category: it.category, severity: it.severity,
      message: it.message, notes: it.notes || null,
      room_id: it.room_id || null,
      status: 'Open',
    }))
    const { error } = await supabase.from('job_feedback').insert(rows)
    if (error) { toast(error.message, 'error'); return }

    const { data: notifyUsers } = await supabase.from('profiles')
      .select('id').in('role', ['Admin','Project Manager','Setout']).neq('id', profile.id)
    if (notifyUsers?.length) {
      const jobName = job.name?.replace(/^.+?[—–-]{1,2}\s*/, '') || job.name
      const topSeverity = items.some(i=>i.severity==='Major') ? 'Major' : items.some(i=>i.severity==='Moderate') ? 'Moderate' : 'Minor'
      await supabase.from('notifications').insert(
        notifyUsers.map(u => ({
          user_id: u.id, type:'feedback',
          title: `${topSeverity} feedback — ${jobName}`,
          body: `${items.length} issue${items.length!==1?'s':''} from ${profile.full_name?.split(' ')[0]||'Production'}: ${items[0].category}${items.length>1?` +${items.length-1} more`:''}`,
          job_id: job.id, read: false,
        }))
      )
    }
    toast(`✓ ${items.length} item${items.length!==1?'s':''} submitted`)
    setFeedbackTarget(null)
    // Reload to show new feedback tiles
    loadData()
  }

  if (loading) return <div style={{ textAlign:'center', padding:'60px 0', color:'#9CA3AF' }}>Loading…</div>

  return (
    <div style={{ maxWidth:560, margin:'0 auto' }}>
      <div style={{ marginBottom:20 }}>
        <h1 style={{ fontSize:20, fontWeight:800, color:'#2A3042', margin:'0 0 4px' }}>
          Hey {profile?.full_name?.split(' ')[0] || 'there'} 👋
        </h1>
        <p style={{ fontSize:13, color:'#9CA3AF', margin:0 }}>Active jobs — clock in and submit feedback</p>
      </div>
      <ActiveBanner entry={activeEntry} onClockOut={clockOut} />
      {jobs.length === 0
        ? <div style={{ textAlign:'center', padding:'60px 0', color:'#9CA3AF' }}>
            <div style={{ fontSize:32, marginBottom:12 }}>🎉</div>
            <div style={{ fontSize:15, fontWeight:600, color:'#374151' }}>No active jobs assigned to you</div>
          </div>
        : <div style={{ display:'flex', flexDirection:'column', gap:12 }}>
            {jobs.map(job => (
              <ProductionJobCard key={job.id} job={job} activeEntry={activeEntry}
                onClockIn={clockIn}
                onFeedback={(job, rooms) => setFeedbackTarget({ job, rooms })} />
            ))}
          </div>
      }
      {feedbackTarget && (
        <FeedbackSheet
          job={feedbackTarget.job}
          rooms={feedbackTarget.rooms}
          onClose={() => setFeedbackTarget(null)}
          onSubmit={submitFeedback} />
      )}
    </div>
  )
}
