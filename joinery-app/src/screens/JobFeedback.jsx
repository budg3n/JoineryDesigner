import { useState, useEffect } from 'react'
import { useParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useApp } from '../context/AppContext'
import { useToast } from '../components/Toast'

const fmtNZTime = dt => {
  const s = String(dt).endsWith('Z') || String(dt).includes('+') ? dt : dt + 'Z'
  const d = new Date(s)
  const off = (d.getUTCMonth() >= 4 && d.getUTCMonth() <= 8) ? 12 : 13
  const nz = new Date(d.getTime() + off * 3600000)
  const H = nz.getUTCHours()
  return nz.getUTCDate() + ' ' +
    ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][nz.getUTCMonth()] +
    ', ' + (H % 12 || 12) + ':' + String(nz.getUTCMinutes()).padStart(2,'0') + ' ' + (H < 12 ? 'am' : 'pm')
}

const SEV = {
  Minor:    { bg:'#DCFCE7', color:'#166534', dot:'#1D9E75' },
  Moderate: { bg:'#FEF9C3', color:'#854D0E', dot:'#EF9F27' },
  Major:    { bg:'#FEF2F2', color:'#991B1B', dot:'#E24B4A' },
}
const STATUS_STYLE = {
  Open:         { bg:'#FEF2F2', color:'#991B1B' },
  Acknowledged: { bg:'#FEF9C3', color:'#854D0E' },
  Resolved:     { bg:'#DCFCE7', color:'#166534' },
}

// Inline notes editor
function NotesEditor({ fbId, initialValue, onChange }) {
  const [val, setVal] = useState(initialValue)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  async function save() {
    if (val === initialValue) return
    setSaving(true)
    await supabase.from('job_feedback').update({ notes: val }).eq('id', fbId)
    setSaving(false); setSaved(true)
    setTimeout(() => setSaved(false), 2000)
    if (onChange) onChange(val)
  }
  return (
    <div style={{ position:'relative' }}>
      <textarea value={val} onChange={e => { setVal(e.target.value); setSaved(false) }}
        onBlur={save} placeholder="What needs to be done to prevent this happening again?"
        rows={3}
        style={{ width:'100%', padding:'8px 10px', border:'1px solid #86EFAC', borderRadius:8, fontSize:13,
          outline:'none', resize:'none', boxSizing:'border-box', fontFamily:'inherit',
          background:'transparent', color:'#374151', lineHeight:1.6 }} />
      {(saving || saved) && (
        <div style={{ position:'absolute', bottom:8, right:8, fontSize:10, color:'#1D9E75', fontWeight:600 }}>
          {saving ? 'Saving…' : '✓ Saved'}
        </div>
      )}
    </div>
  )
}

// Resolve modal — requires a resolution comment
function ResolveModal({ fb, onResolve, onClose }) {
  const [comment, setComment] = useState(fb.notes || '')
  const [saving, setSaving] = useState(false)

  async function confirm() {
    if (!comment.trim()) return
    setSaving(true)
    await supabase.from('job_feedback').update({
      status: 'Resolved',
      notes: comment.trim(),
      resolved_at: new Date().toISOString(),
    }).eq('id', fb.id)
    onResolve(fb.id, comment.trim())
    setSaving(false)
  }

  const sv = SEV[fb.severity] || SEV.Minor
  return (
    <div style={{ position:'fixed', inset:0, zIndex:700, background:'rgba(0,0,0,0.45)', display:'flex', alignItems:'center', justifyContent:'center', padding:16 }}
      onClick={e=>e.target===e.currentTarget&&onClose()}>
      <div style={{ background:'#fff', borderRadius:16, width:'100%', maxWidth:460, padding:24, boxShadow:'0 20px 60px rgba(0,0,0,0.2)' }}>
        {/* Header */}
        <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:16 }}>
          <div style={{ width:36, height:36, borderRadius:10, background:'#DCFCE7', display:'flex', alignItems:'center', justifyContent:'center', fontSize:20 }}>✓</div>
          <div>
            <div style={{ fontSize:15, fontWeight:800, color:'#2A3042' }}>Mark as Resolved</div>
            <div style={{ fontSize:12, color:'#9CA3AF', marginTop:1 }}>A resolution comment is required</div>
          </div>
        </div>

        {/* Feedback summary */}
        <div style={{ padding:'10px 12px', background:'#F9FAFB', borderRadius:10, border:'1px solid #E8ECF0', marginBottom:16 }}>
          <div style={{ display:'flex', gap:6, marginBottom:6 }}>
            <span style={{ fontSize:11, fontWeight:700, padding:'2px 8px', borderRadius:20, background:sv.bg, color:sv.color }}>{fb.severity}</span>
            <span style={{ fontSize:12, fontWeight:600, color:'#374151' }}>{fb.category}</span>
          </div>
          <div style={{ fontSize:13, color:'#374151', lineHeight:1.5 }}>{fb.message}</div>
        </div>

        {/* Resolution comment */}
        <label style={{ fontSize:12, fontWeight:700, color:'#065F46', display:'block', marginBottom:6 }}>
          Resolution / How was this fixed? *
        </label>
        <textarea
          autoFocus value={comment} onChange={e=>setComment(e.target.value)}
          placeholder="Describe what was done to resolve this issue and prevent recurrence…"
          rows={4}
          style={{ width:'100%', padding:'10px 12px', border:`2px solid ${comment.trim()?'#86EFAC':'#E8ECF0'}`, borderRadius:10, fontSize:13,
            outline:'none', resize:'vertical', boxSizing:'border-box', fontFamily:'inherit', lineHeight:1.6,
            background:'#F0FDF4', transition:'border-color .2s' }} />
        {!comment.trim() && (
          <div style={{ fontSize:11, color:'#E24B4A', marginTop:4 }}>A resolution comment is required to mark as resolved</div>
        )}

        <div style={{ display:'flex', gap:8, marginTop:16, justifyContent:'flex-end' }}>
          <button onClick={onClose} style={{ fontSize:13, fontWeight:600, padding:'8px 16px', borderRadius:9, border:'1px solid #E8ECF0', background:'#F9FAFB', cursor:'pointer', color:'#6B7280' }}>
            Cancel
          </button>
          <button onClick={confirm} disabled={!comment.trim() || saving}
            style={{ fontSize:13, fontWeight:700, padding:'8px 20px', borderRadius:9, border:'none', cursor:comment.trim()?'pointer':'not-allowed',
              background: comment.trim() ? '#1D9E75' : '#E8ECF0', color: comment.trim() ? '#fff' : '#9CA3AF',
              opacity: saving ? 0.6 : 1, boxShadow: comment.trim() ? '0 2px 8px rgba(29,158,117,0.3)' : 'none' }}>
            {saving ? 'Resolving…' : '✓ Mark as Resolved'}
          </button>
        </div>
      </div>
    </div>
  )
}

export default function JobFeedback() {
  const { id } = useParams()
  const { profile } = useApp()
  const toast = useToast()
  const [job, setJob]           = useState(null)
  const [feedback, setFeedback] = useState([])
  const [loading, setLoading]   = useState(true)
  const [resolving, setResolving] = useState(null)  // feedback item being resolved

  const canEdit = ['Admin','Project Manager','Setout','Production Manager'].includes(profile?.role)

  useEffect(() => {
    async function load() {
      const [{ data: jobData }, { data: fbData }] = await Promise.all([
        supabase.from('jobs').select('id,name,job_number,client,customers(company)').eq('id', id).single(),
        supabase.from('job_feedback').select('*, profiles(id,full_name,email)')
          .eq('job_id', id).order('created_at', { ascending: false })
      ])
      setJob(jobData)
      setFeedback(fbData || [])
      setLoading(false)
    }
    load()
  }, [id])

  async function updateStatus(fb, newStatus) {
    // Resolving requires a comment — open modal
    if (newStatus === 'Resolved' && fb.status === 'Acknowledged') {
      setResolving(fb)
      return
    }
    await supabase.from('job_feedback').update({ status: newStatus }).eq('id', fb.id)
    setFeedback(p => p.map(f => f.id === fb.id ? { ...f, status: newStatus } : f))
    toast(`Marked as ${newStatus}`)
  }

  function handleResolved(fbId, comment) {
    setFeedback(p => p.map(f => f.id === fbId ? { ...f, status:'Resolved', notes:comment } : f))
    setResolving(null)
    toast('✓ Feedback resolved')
  }

  if (loading) return <div style={{ textAlign:'center', padding:'60px 0', color:'#9CA3AF' }}>Loading…</div>
  if (!job)    return <div style={{ textAlign:'center', padding:'60px 0', color:'#9CA3AF' }}>Job not found</div>

  const jobName = job.name?.replace(/^.+?[—–-]{1,2}\s*/, '') || job.name
  const open    = feedback.filter(f => f.status === 'Open').length
  const resolved = feedback.filter(f => f.status === 'Resolved').length

  return (
    <div style={{ maxWidth:640, margin:'0 auto' }}>
      <div style={{ marginBottom:20 }}>
        <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:4 }}>
          <h1 style={{ fontSize:20, fontWeight:800, color:'#2A3042', margin:0 }}>{jobName}</h1>
          {job.job_number && <span style={{ fontSize:12, color:'#9CA3AF', fontFamily:'monospace' }}>#{job.job_number}</span>}
        </div>
        <div style={{ fontSize:13, color:'#9CA3AF' }}>{job.customers?.company || job.client}</div>
        <div style={{ display:'flex', gap:8, marginTop:10 }}>
          <span style={{ fontSize:12, fontWeight:600, padding:'3px 10px', borderRadius:20, background:'#FEF2F2', color:'#991B1B' }}>{open} open</span>
          <span style={{ fontSize:12, fontWeight:600, padding:'3px 10px', borderRadius:20, background:'#DCFCE7', color:'#166534' }}>{resolved} resolved</span>
          <span style={{ fontSize:12, fontWeight:600, padding:'3px 10px', borderRadius:20, background:'#F3F4F6', color:'#6B7280' }}>{feedback.length} total</span>
        </div>
      </div>

      {feedback.length === 0 ? (
        <div style={{ textAlign:'center', padding:'60px 0', color:'#9CA3AF', background:'#fff', borderRadius:16, border:'1px solid #E8ECF0' }}>
          <div style={{ fontSize:32, marginBottom:12 }}>✅</div>
          <div style={{ fontSize:15, fontWeight:600, color:'#374151' }}>No feedback yet</div>
        </div>
      ) : (
        <div style={{ display:'flex', flexDirection:'column', gap:12 }}>
          {feedback.map(fb => {
            const sv = SEV[fb.severity] || SEV.Minor
            const ss = STATUS_STYLE[fb.status] || STATUS_STYLE.Open
            const STATUS_FLOW = { Open:'Acknowledged', Acknowledged:'Resolved', Resolved:'Open' }
            const nextStatus = STATUS_FLOW[fb.status]
            const isResolved = fb.status === 'Resolved'
            return (
              <div key={fb.id} style={{ background:'#fff', borderRadius:14, border:`1px solid ${isResolved?'#86EFAC':'#E8ECF0'}`, overflow:'hidden', boxShadow:'0 1px 3px rgba(0,0,0,0.04)' }}>
                <div style={{ height:4, background:isResolved?'#1D9E75':sv.dot }} />
                <div style={{ padding:'14px 16px' }}>
                  {/* top row */}
                  <div style={{ display:'flex', alignItems:'flex-start', gap:8, marginBottom:10 }}>
                    <div style={{ flex:1 }}>
                      <div style={{ display:'flex', alignItems:'center', gap:6, flexWrap:'wrap', marginBottom:4 }}>
                        <span style={{ fontSize:12, fontWeight:700, padding:'2px 9px', borderRadius:20, background:sv.bg, color:sv.color }}>{fb.severity}</span>
                        <span style={{ fontSize:12, fontWeight:600, color:'#374151' }}>{fb.category}</span>
                      </div>
                      <div style={{ fontSize:11, color:'#9CA3AF' }}>
                        {fb.profiles?.full_name || 'Production'} · {fmtNZTime(fb.created_at)}
                      </div>
                    </div>
                    {canEdit ? (
                      <div style={{ display:'flex', flexDirection:'column', alignItems:'flex-end', gap:4 }}>
                        <span style={{ fontSize:11, fontWeight:700, padding:'4px 10px', borderRadius:20, background:ss.bg, color:ss.color }}>{fb.status}</span>
                        {!isResolved && (
                          <button onClick={() => updateStatus(fb, nextStatus)}
                            style={{ fontSize:10, fontWeight:700, padding:'3px 8px', borderRadius:7, border:'1px solid #E8ECF0', background:'#F9FAFB', cursor:'pointer', color:'#6B7280' }}
                            onMouseEnter={e=>{e.currentTarget.style.background='#EEF2FF';e.currentTarget.style.color='#5B8AF0'}}
                            onMouseLeave={e=>{e.currentTarget.style.background='#F9FAFB';e.currentTarget.style.color='#6B7280'}}>
                            → {nextStatus}
                          </button>
                        )}
                      </div>
                    ) : (
                      <span style={{ fontSize:11, fontWeight:700, padding:'4px 10px', borderRadius:20, background:ss.bg, color:ss.color }}>{fb.status}</span>
                    )}
                  </div>

                  {/* what happened */}
                  <div style={{ marginBottom:10 }}>
                    <div style={{ fontSize:11, fontWeight:700, color:'#9CA3AF', textTransform:'uppercase', letterSpacing:'.05em', marginBottom:4 }}>What happened</div>
                    <div style={{ fontSize:13, color:'#374151', lineHeight:1.6 }}>{fb.message}</div>
                  </div>

                  {/* resolution / notes */}
                  {isResolved ? (
                    <div style={{ padding:'10px 12px', background:'#F0FDF4', borderRadius:8, borderLeft:'3px solid #1D9E75' }}>
                      <div style={{ fontSize:11, fontWeight:700, color:'#065F46', textTransform:'uppercase', letterSpacing:'.05em', marginBottom:4 }}>
                        ✓ Resolution
                        {fb.resolved_at && <span style={{ fontWeight:400, textTransform:'none', marginLeft:8 }}>{fmtNZTime(fb.resolved_at)}</span>}
                      </div>
                      <div style={{ fontSize:13, color:'#374151', lineHeight:1.6 }}>{fb.notes}</div>
                    </div>
                  ) : (
                    <div style={{ marginTop:6, padding:'10px 12px', background:'#F0FDF4', borderRadius:8, borderLeft:'3px solid #1D9E75' }}>
                      <div style={{ fontSize:11, fontWeight:700, color:'#065F46', textTransform:'uppercase', letterSpacing:'.05em', marginBottom:6 }}>Notes / Prevention</div>
                      {canEdit ? (
                        <NotesEditor fbId={fb.id} initialValue={fb.notes||''} onChange={v=>setFeedback(p=>p.map(f=>f.id===fb.id?{...f,notes:v}:f))} />
                      ) : (
                        fb.notes
                          ? <div style={{ fontSize:13, color:'#374151', lineHeight:1.6 }}>{fb.notes}</div>
                          : <div style={{ fontSize:13, color:'#9CA3AF', fontStyle:'italic' }}>No notes added yet</div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {resolving && (
        <ResolveModal
          fb={resolving}
          onResolve={handleResolved}
          onClose={() => setResolving(null)}
        />
      )}
    </div>
  )
}
