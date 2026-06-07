import { useState, useEffect } from 'react'
import { useParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'

const PRIORITY_COLOR = {
  Low:    { bg:'#F0FDF4', color:'#166534', border:'#86EFAC' },
  Normal: { bg:'#EEF2FF', color:'#3730A3', border:'#A5B4FC' },
  High:   { bg:'#FEF9C3', color:'#854D0E', border:'#FDE68A' },
  Urgent: { bg:'#FEF2F2', color:'#991B1B', border:'#FCA5A5' },
}

export default function RFIReply() {
  const { token } = useParams()
  const [rfi,     setRfi]     = useState(null)
  const [job,     setJob]     = useState(null)
  const [loading, setLoading] = useState(true)
  const [error,   setError]   = useState(null)
  const [reply,   setReply]   = useState('')
  const [name,    setName]    = useState('')
  const [sending, setSending] = useState(false)
  const [sent,    setSent]    = useState(false)

  useEffect(() => {
    if (!token) { setError('Invalid link'); setLoading(false); return }
    supabase.from('job_rfis').select('*, jobs(job_number, name)')
      .eq('reply_token', token)
      .maybeSingle()
      .then(({ data, error: err }) => {
        if (err || !data) { setError('This RFI link is invalid or has expired.'); setLoading(false); return }
        setRfi(data)
        setJob(data.jobs)
        // Pre-fill name if we have it from existing external reply
        if (data.external_reply_name) setName(data.external_reply_name)
        setLoading(false)
      })
  }, [token])

  async function submitReply() {
    if (!reply.trim()) return
    setSending(true)
    const { error: err } = await supabase.from('job_rfis').update({
      external_reply: reply.trim(),
      external_reply_name: name.trim() || null,
      external_reply_at: new Date().toISOString(),
      status: 'In Review',
    }).eq('reply_token', token)

    if (err) { alert('Failed to submit reply. Please try again.'); setSending(false); return }

    // Notify the job team via a notification record
    await supabase.from('rfi_notifications').insert({
      rfi_id: rfi.id,
      job_id: rfi.job_id,
      type: 'external_reply',
      message: `${name.trim() || 'External contact'} replied to RFI-${String(rfi.number||0).padStart(3,'0')}: "${rfi.title}"`,
      created_at: new Date().toISOString(),
    }).then(() => {}) // fail silently if table doesn't exist yet

    // Dispatch tasks-updated so the app reloads if open
    window.dispatchEvent?.(new CustomEvent('rfi-reply-received', { detail: { rfiId: rfi.id } }))

    setSent(true)
    setSending(false)
  }

  if (loading) return (
    <div style={{ minHeight:'100vh', display:'flex', alignItems:'center', justifyContent:'center', background:'#F8FAFF' }}>
      <div style={{ textAlign:'center', color:'#9CA3AF' }}>
        <div style={{ width:32, height:32, border:'3px solid #E8ECF0', borderTopColor:'#5B8AF0', borderRadius:'50%', animation:'spin 0.7s linear infinite', margin:'0 auto 12px' }} />
        Loading RFI…
        <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
      </div>
    </div>
  )

  if (error) return (
    <div style={{ minHeight:'100vh', display:'flex', alignItems:'center', justifyContent:'center', background:'#F8FAFF', padding:20 }}>
      <div style={{ textAlign:'center', maxWidth:400 }}>
        <div style={{ fontSize:48, marginBottom:12 }}>🔗</div>
        <div style={{ fontSize:18, fontWeight:700, color:'#2A3042', marginBottom:8 }}>Link not found</div>
        <div style={{ fontSize:14, color:'#9CA3AF' }}>{error}</div>
      </div>
    </div>
  )

  if (sent) return (
    <div style={{ minHeight:'100vh', display:'flex', alignItems:'center', justifyContent:'center', background:'#F8FAFF', padding:20 }}>
      <div style={{ textAlign:'center', maxWidth:440, background:'#fff', borderRadius:20, padding:40, boxShadow:'0 8px 40px rgba(0,0,0,0.08)' }}>
        <div style={{ width:64, height:64, borderRadius:'50%', background:'#DCFCE7', display:'flex', alignItems:'center', justifyContent:'center', margin:'0 auto 16px', fontSize:28 }}>✓</div>
        <div style={{ fontSize:20, fontWeight:800, color:'#2A3042', marginBottom:8 }}>Reply submitted</div>
        <div style={{ fontSize:14, color:'#6B7280', lineHeight:1.6 }}>
          Thank you — your reply to <strong>RFI-{String(rfi.number||0).padStart(3,'0')}</strong> has been received.<br/>
          The team will review it and get back to you if needed.
        </div>
      </div>
    </div>
  )

  const alreadyReplied = !!rfi.external_reply && !sent
  const pStyle = PRIORITY_COLOR[rfi.priority] || PRIORITY_COLOR.Normal

  return (
    <div style={{ minHeight:'100vh', background:'#F8FAFF', padding:'32px 16px' }}>
      <div style={{ maxWidth:600, margin:'0 auto' }}>

        {/* Header */}
        <div style={{ textAlign:'center', marginBottom:28 }}>
          <div style={{ fontSize:13, color:'#9CA3AF', marginBottom:4 }}>
            {job ? `${job.job_number ? `#${job.job_number} — ` : ''}${job.name}` : 'Joinery Job'}
          </div>
          <div style={{ fontSize:11, fontWeight:700, color:'#9CA3AF', letterSpacing:'.08em', textTransform:'uppercase' }}>
            RFI-{String(rfi.number||0).padStart(3,'0')}
          </div>
        </div>

        {/* RFI card */}
        <div style={{ background:'#fff', borderRadius:16, border:'1px solid #E8ECF0', boxShadow:'0 2px 12px rgba(0,0,0,0.06)', marginBottom:20, overflow:'hidden' }}>
          <div style={{ padding:'20px 24px', borderBottom:'1px solid #F3F4F6' }}>
            <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', gap:12, flexWrap:'wrap' }}>
              <h1 style={{ fontSize:20, fontWeight:800, color:'#2A3042', margin:0, flex:1 }}>{rfi.title}</h1>
              <span style={{ fontSize:11, fontWeight:700, padding:'4px 12px', borderRadius:20, border:`1px solid ${pStyle.border}`, background:pStyle.bg, color:pStyle.color, flexShrink:0 }}>
                {rfi.priority}
              </span>
            </div>
          </div>

          <div style={{ padding:'20px 24px' }}>
            {rfi.description && (
              <div style={{ marginBottom:20 }}>
                <div style={{ fontSize:11, fontWeight:700, color:'#9CA3AF', textTransform:'uppercase', letterSpacing:'.06em', marginBottom:8 }}>Details</div>
                <div style={{ fontSize:14, color:'#374151', lineHeight:1.7, whiteSpace:'pre-wrap' }}>{rfi.description}</div>
              </div>
            )}

            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
              {rfi.due_date && (
                <div style={{ background:'#F9FAFB', borderRadius:10, padding:'10px 14px' }}>
                  <div style={{ fontSize:10, fontWeight:700, color:'#9CA3AF', textTransform:'uppercase', letterSpacing:'.06em', marginBottom:3 }}>Due date</div>
                  <div style={{ fontSize:13, fontWeight:600, color:'#2A3042' }}>{new Date(rfi.due_date).toLocaleDateString('en-NZ', { day:'numeric', month:'long', year:'numeric' })}</div>
                </div>
              )}
              <div style={{ background:'#F9FAFB', borderRadius:10, padding:'10px 14px' }}>
                <div style={{ fontSize:10, fontWeight:700, color:'#9CA3AF', textTransform:'uppercase', letterSpacing:'.06em', marginBottom:3 }}>Type</div>
                <div style={{ fontSize:13, fontWeight:600, color:'#2A3042', textTransform:'capitalize' }}>{rfi.type || 'General'}</div>
              </div>
            </div>
          </div>
        </div>

        {/* Already replied banner */}
        {alreadyReplied && (
          <div style={{ background:'#F0FDF4', border:'1px solid #86EFAC', borderRadius:12, padding:'12px 16px', marginBottom:20, display:'flex', gap:10, alignItems:'flex-start' }}>
            <span style={{ fontSize:16, flexShrink:0 }}>✓</span>
            <div>
              <div style={{ fontSize:13, fontWeight:700, color:'#166534' }}>You already replied to this RFI</div>
              <div style={{ fontSize:12, color:'#166534', marginTop:2, opacity:0.8 }}>"{rfi.external_reply}"</div>
              <div style={{ fontSize:11, color:'#9CA3AF', marginTop:4 }}>You can update your reply below.</div>
            </div>
          </div>
        )}

        {/* Reply form */}
        <div style={{ background:'#fff', borderRadius:16, border:'1px solid #E8ECF0', boxShadow:'0 2px 12px rgba(0,0,0,0.06)', padding:'20px 24px' }}>
          <div style={{ fontSize:15, fontWeight:700, color:'#2A3042', marginBottom:16 }}>
            {alreadyReplied ? 'Update your reply' : 'Your reply'}
          </div>

          <div style={{ marginBottom:14 }}>
            <label style={{ fontSize:12, fontWeight:600, color:'#6B7280', display:'block', marginBottom:6 }}>Your name</label>
            <input value={name} onChange={e => setName(e.target.value)}
              placeholder="Enter your name…"
              style={{ width:'100%', padding:'10px 12px', border:'1px solid #DDE3EC', borderRadius:10, fontSize:13, outline:'none', boxSizing:'border-box' }} />
          </div>

          <div style={{ marginBottom:16 }}>
            <label style={{ fontSize:12, fontWeight:600, color:'#6B7280', display:'block', marginBottom:6 }}>
              Response <span style={{ color:'#E24B4A' }}>*</span>
            </label>
            <textarea value={reply} onChange={e => setReply(e.target.value)}
              rows={5}
              placeholder={alreadyReplied ? rfi.external_reply : 'Type your response here…'}
              style={{ width:'100%', padding:'10px 12px', border:'1px solid #DDE3EC', borderRadius:10, fontSize:13, outline:'none', resize:'vertical', fontFamily:'inherit', lineHeight:1.6, boxSizing:'border-box' }} />
          </div>

          <button onClick={submitReply} disabled={sending || !reply.trim()}
            style={{
              width:'100%', padding:'13px', borderRadius:12, border:'none', fontSize:14, fontWeight:700, cursor: reply.trim() ? 'pointer' : 'default',
              background: reply.trim() ? '#5B8AF0' : '#E8ECF0',
              color: reply.trim() ? '#fff' : '#9CA3AF',
              transition:'all .15s',
            }}>
            {sending ? 'Submitting…' : alreadyReplied ? 'Update reply' : 'Submit reply'}
          </button>
        </div>

        <div style={{ textAlign:'center', marginTop:20, fontSize:11, color:'#C4C9D4' }}>
          Powered by Joinery Jobs
        </div>
      </div>
    </div>
  )
}
