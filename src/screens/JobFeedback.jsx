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

const STATUS_NEXT = { 'Open':'Acknowledged', 'Acknowledged':'Resolved', 'Resolved':'Open' }
const STATUS_STYLE = {
  Open:         { bg:'#FEF2F2', color:'#991B1B' },
  Acknowledged: { bg:'#FEF9C3', color:'#854D0E' },
  Resolved:     { bg:'#DCFCE7', color:'#166534' },
}

// Inline notes editor — auto-saves on blur
function NotesEditor({ fbId, initialValue }) {
  const [val, setVal] = useState(initialValue)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  async function save() {
    if (val === initialValue) return
    setSaving(true)
    await supabase.from('job_feedback').update({ notes: val }).eq('id', fbId)
    setSaving(false)
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  return (
    <div style={{ position:'relative' }}>
      <textarea value={val} onChange={e => { setVal(e.target.value); setSaved(false) }}
        onBlur={save}
        placeholder="What needs to be done to prevent this happening again?"
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

export default function JobFeedback() {
  const { id } = useParams()
  const { profile } = useApp()
  const toast = useToast()
  const [job, setJob]         = useState(null)
  const [feedback, setFeedback] = useState([])
  const [loading, setLoading] = useState(true)

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

  async function updateStatus(fbId, newStatus) {
    await supabase.from('job_feedback').update({ status: newStatus }).eq('id', fbId)
    setFeedback(p => p.map(f => f.id === fbId ? { ...f, status: newStatus } : f))
    toast(`Marked as ${newStatus}`)
  }

  if (loading) return <div style={{ textAlign:'center', padding:'60px 0', color:'#9CA3AF' }}>Loading…</div>
  if (!job)    return <div style={{ textAlign:'center', padding:'60px 0', color:'#9CA3AF' }}>Job not found</div>

  const jobName = job.name?.replace(/^.+?[—–-]{1,2}\s*/, '') || job.name
  const open    = feedback.filter(f => f.status === 'Open').length
  const total   = feedback.length

  return (
    <div style={{ maxWidth:640, margin:'0 auto' }}>
      {/* Header */}
      <div style={{ marginBottom:20 }}>
        <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:4 }}>
          <h1 style={{ fontSize:20, fontWeight:800, color:'#2A3042', margin:0 }}>{jobName}</h1>
          {job.job_number && <span style={{ fontSize:12, color:'#9CA3AF', fontFamily:'monospace' }}>#{job.job_number}</span>}
        </div>
        <div style={{ fontSize:13, color:'#9CA3AF' }}>{job.customers?.company || job.client}</div>
        <div style={{ display:'flex', gap:8, marginTop:10 }}>
          <span style={{ fontSize:12, fontWeight:600, padding:'3px 10px', borderRadius:20, background:'#FEF2F2', color:'#991B1B' }}>
            {open} open
          </span>
          <span style={{ fontSize:12, fontWeight:600, padding:'3px 10px', borderRadius:20, background:'#F3F4F6', color:'#6B7280' }}>
            {total} total
          </span>
        </div>
      </div>

      {feedback.length === 0 ? (
        <div style={{ textAlign:'center', padding:'60px 0', color:'#9CA3AF', background:'#fff', borderRadius:16, border:'1px solid #E8ECF0' }}>
          <div style={{ fontSize:32, marginBottom:12 }}>✅</div>
          <div style={{ fontSize:15, fontWeight:600, color:'#374151' }}>No feedback yet</div>
          <div style={{ fontSize:13, color:'#9CA3AF', marginTop:4 }}>Production team hasn't reported any issues</div>
        </div>
      ) : (
        <div style={{ display:'flex', flexDirection:'column', gap:12 }}>
          {feedback.map(fb => {
            const sv = SEV[fb.severity] || SEV.Minor
            const ss = STATUS_STYLE[fb.status] || STATUS_STYLE.Open
            return (
              <div key={fb.id} style={{ background:'#fff', borderRadius:14, border:'1px solid #E8ECF0', overflow:'hidden', boxShadow:'0 1px 3px rgba(0,0,0,0.04)' }}>
                {/* severity bar */}
                <div style={{ height:4, background:sv.dot }} />
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
                    {/* status button */}
                    {canEdit ? (
                      <button onClick={() => updateStatus(fb.id, STATUS_NEXT[fb.status])}
                        style={{ fontSize:11, fontWeight:700, padding:'4px 10px', borderRadius:20, border:'none', cursor:'pointer', background:ss.bg, color:ss.color, flexShrink:0 }}>
                        {fb.status}
                      </button>
                    ) : (
                      <span style={{ fontSize:11, fontWeight:700, padding:'4px 10px', borderRadius:20, background:ss.bg, color:ss.color, flexShrink:0 }}>{fb.status}</span>
                    )}
                  </div>

                  {/* what happened */}
                  <div style={{ marginBottom: fb.notes ? 10 : 0 }}>
                    <div style={{ fontSize:11, fontWeight:700, color:'#9CA3AF', textTransform:'uppercase', letterSpacing:'.05em', marginBottom:4 }}>What happened</div>
                    <div style={{ fontSize:13, color:'#374151', lineHeight:1.6 }}>{fb.message}</div>
                  </div>

                  {/* notes/prevention — editable by Setout/Admin only */}
                  <div style={{ marginTop:10, padding:'10px 12px', background:'#F0FDF4', borderRadius:8, borderLeft:'3px solid #1D9E75' }}>
                    <div style={{ fontSize:11, fontWeight:700, color:'#065F46', textTransform:'uppercase', letterSpacing:'.05em', marginBottom:6 }}>
                      Notes / Prevention
                      {canEdit && <span style={{ fontSize:9, color:'#1D9E75', marginLeft:6, fontWeight:500, textTransform:'none' }}>· only visible to you</span>}
                    </div>
                    {canEdit ? (
                      <NotesEditor fbId={fb.id} initialValue={fb.notes||''} />
                    ) : (
                      fb.notes
                        ? <div style={{ fontSize:13, color:'#374151', lineHeight:1.6 }}>{fb.notes}</div>
                        : <div style={{ fontSize:13, color:'#9CA3AF', fontStyle:'italic' }}>No notes added yet</div>
                    )}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
