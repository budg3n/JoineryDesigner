import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'

function daysUntil(dateStr) {
  if (!dateStr) return null
  const now = new Date(); now.setHours(0,0,0,0)
  const d = new Date(dateStr); d.setHours(0,0,0,0)
  return Math.round((d - now) / 86400000)
}

const STATUS_STYLE = {
  'Open':      { bg:'#EEF2FF', color:'#3730A3', border:'#C7D2FE' },
  'In Review': { bg:'#FEF9C3', color:'#854D0E', border:'#FDE68A' },
  'Resolved':  { bg:'#DCFCE7', color:'#166534', border:'#86EFAC' },
  'Closed':    { bg:'#F3F4F6', color:'#6B7280', border:'#E5E7EB' },
}

export default function RFIBell() {
  const navigate   = useNavigate()
  const dropRef    = useRef()
  const [open, setOpen]     = useState(false)
  const [rfis, setRfis]     = useState([])
  const [jobs, setJobs]     = useState({}) // id -> {name, job_number}
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    loadRFIs()
    // Reload when an RFI reply is received
    window.addEventListener('rfi-reply-received', loadRFIs)
    return () => window.removeEventListener('rfi-reply-received', loadRFIs)
  }, [])

  useEffect(() => {
    if (!open) return
    function handleClick(e) { if (dropRef.current && !dropRef.current.contains(e.target)) setOpen(false) }
    setTimeout(() => document.addEventListener('mousedown', handleClick), 0)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [open])

  async function loadRFIs() {
    setLoading(true)
    const { data } = await supabase.from('job_rfis')
      .select('*')
      .not('status', 'in', '("Closed","Resolved")')
      .order('created_at', { ascending: false })
      .limit(50)
    if (!data) { setLoading(false); return }
    setRfis(data)

    // Load job info for all unique job IDs
    const jobIds = [...new Set(data.map(r => r.job_id).filter(Boolean))]
    if (jobIds.length) {
      const { data: jobData } = await supabase.from('jobs')
        .select('id,name,job_number').in('id', jobIds)
      const jobMap = {}
      ;(jobData||[]).forEach(j => { jobMap[j.id] = j })
      setJobs(jobMap)
    }
    setLoading(false)
  }

  const overdueCount = rfis.filter(r => r.due_date && daysUntil(r.due_date) < 0 && r.status !== 'Closed' && r.status !== 'Resolved').length
  const hasNew = rfis.some(r => r.external_reply && !r.response) // replied but not internally responded
  const count = rfis.length

  if (count === 0 && !open) return (
    <div ref={dropRef} style={{ position:'relative' }}>
      <button onClick={() => { setOpen(s=>!s); loadRFIs() }}
        style={{ position:'relative', background:'transparent', border:'none', cursor:'pointer', width:36, height:36, display:'flex', alignItems:'center', justifyContent:'center', borderRadius:8, color:'#6B7280' }}>
        <RFIIcon />
      </button>
    </div>
  )

  return (
    <div ref={dropRef} style={{ position:'relative' }}>
      {/* Trigger button */}
      <button onClick={() => { setOpen(s=>!s); if (!open) loadRFIs() }}
        style={{ position:'relative', background: open?'#F3F4F6':'transparent', border:'none', cursor:'pointer', width:36, height:36, display:'flex', alignItems:'center', justifyContent:'center', borderRadius:8, color:'#374151' }}>
        <RFIIcon />
        <span style={{
          position:'absolute', top:2, right:2, minWidth:16, height:16, borderRadius:8, padding:'0 4px',
          background: overdueCount > 0 ? '#E24B4A' : hasNew ? '#1D9E75' : '#5B8AF0',
          color:'#fff', fontSize:9, fontWeight:800, display:'flex', alignItems:'center', justifyContent:'center',
          border:'2px solid #fff',
          animation: overdueCount > 0 ? 'rfi-pulse-red 1.8s ease-in-out infinite' : 'none',
        }}>
          {count > 99 ? '99+' : count}
        </span>
        {overdueCount > 0 && (
          <span style={{
            position:'absolute', top:2, right:2, width:16, height:16, borderRadius:8,
            background:'#E24B4A', opacity:0,
            animation:'rfi-ring-red 1.8s ease-out infinite',
            pointerEvents:'none',
          }} />
        )}
        <style>{`
          @keyframes rfi-pulse-red {
            0%,100% { transform:scale(1); }
            50% { transform:scale(1.15); }
          }
          @keyframes rfi-ring-red {
            0% { transform:scale(1); opacity:0.6; }
            100% { transform:scale(2.4); opacity:0; }
          }
        `}</style>
      </button>

      {/* Dropdown panel */}
      {open && (
        <div style={{
          position:'absolute', top:'calc(100% + 6px)', right:0, width:360, maxHeight:520,
          background:'#fff', borderRadius:14, boxShadow:'0 8px 40px rgba(0,0,0,0.15)',
          border:'1px solid #E8ECF0', zIndex:500, display:'flex', flexDirection:'column',
          overflow:'hidden',
        }}>
          {/* Header */}
          <div style={{ padding:'12px 16px', borderBottom:'1px solid #F3F4F6', display:'flex', alignItems:'center', justifyContent:'space-between', flexShrink:0 }}>
            <div style={{ fontSize:13, fontWeight:800, color:'#2A3042', display:'flex', alignItems:'center', gap:8 }}>
              <RFIIcon size={16} />
              RFIs
              {overdueCount > 0 && (
                <span style={{ fontSize:10, fontWeight:700, padding:'2px 7px', borderRadius:10, background:'#FEF2F2', color:'#E24B4A', border:'1px solid #FCA5A5' }}>
                  {overdueCount} overdue
                </span>
              )}
              {hasNew && (
                <span style={{ fontSize:10, fontWeight:700, padding:'2px 7px', borderRadius:10, background:'#DCFCE7', color:'#166534', border:'1px solid #86EFAC' }}>
                  reply received
                </span>
              )}
            </div>
            <div style={{ fontSize:11, color:'#9CA3AF' }}>{count} open</div>
          </div>

          {/* List */}
          <div style={{ overflowY:'auto', flex:1 }}>
            {loading ? (
              <div style={{ padding:'20px 16px', textAlign:'center', color:'#9CA3AF', fontSize:13 }}>Loading…</div>
            ) : rfis.length === 0 ? (
              <div style={{ padding:'20px 16px', textAlign:'center', color:'#9CA3AF', fontSize:13 }}>No open RFIs</div>
            ) : rfis.map(rfi => {
              const job = jobs[rfi.job_id]
              const days = daysUntil(rfi.due_date)
              const isOverdue = days !== null && days < 0
              const isDueSoon = days !== null && days >= 0 && days <= 3
              const ss = STATUS_STYLE[rfi.status] || STATUS_STYLE.Open
              const hasReply = !!rfi.external_reply && !rfi.response
              return (
                <div key={rfi.id}
                  onClick={() => { navigate(`/job/${rfi.job_id}?tab=rfi`); setOpen(false) }}
                  style={{
                    padding:'10px 16px', borderBottom:'1px solid #F9FAFB', cursor:'pointer',
                    background: isOverdue ? '#FFF5F5' : hasReply ? '#F0FDF4' : '#fff',
                    transition:'background .1s',
                  }}
                  onMouseEnter={e => e.currentTarget.style.background = isOverdue?'#FEE2E2':hasReply?'#DCFCE7':'#F8FAFF'}
                  onMouseLeave={e => e.currentTarget.style.background = isOverdue?'#FFF5F5':hasReply?'#F0FDF4':'#fff'}>
                  <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', gap:8 }}>
                    <div style={{ flex:1, minWidth:0 }}>
                      <div style={{ display:'flex', alignItems:'center', gap:6, marginBottom:2, flexWrap:'wrap' }}>
                        <span style={{ fontSize:10, fontWeight:700, color:'#9CA3AF', fontFamily:'monospace' }}>
                          RFI-{String(rfi.number||0).padStart(3,'0')}
                        </span>
                        <span style={{ fontSize:11, fontWeight:700, padding:'1px 7px', borderRadius:8,
                          background:ss.bg, color:ss.color, border:`1px solid ${ss.border}` }}>
                          {rfi.status}
                        </span>
                        {hasReply && <span style={{ fontSize:10, fontWeight:700, padding:'1px 7px', borderRadius:8, background:'#DCFCE7', color:'#166534', border:'1px solid #86EFAC' }}>✓ reply</span>}
                        {isOverdue && <span style={{ fontSize:10, fontWeight:700, padding:'1px 7px', borderRadius:8, background:'#FEF2F2', color:'#E24B4A', border:'1px solid #FCA5A5',
                          animation:'rfi-pulse-red 1.8s ease-in-out infinite' }}>
                          {Math.abs(days)}d overdue
                        </span>}
                        {isDueSoon && !isOverdue && <span style={{ fontSize:10, fontWeight:700, padding:'1px 7px', borderRadius:8, background:'#FEF9C3', color:'#854D0E', border:'1px solid #FDE68A' }}>
                          due in {days}d
                        </span>}
                      </div>
                      <div style={{ fontSize:13, fontWeight:600, color:'#2A3042', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                        {rfi.title}
                      </div>
                      {job && (
                        <div style={{ fontSize:11, color:'#9CA3AF', marginTop:2 }}>
                          {job.job_number ? `#${job.job_number} · ` : ''}{job.name}
                        </div>
                      )}
                      {rfi.external_reply && (
                        <div style={{ fontSize:11, color:'#166534', marginTop:3, fontStyle:'italic', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                          "{rfi.external_reply}"
                        </div>
                      )}
                    </div>
                    {rfi.priority && rfi.priority !== 'Normal' && (
                      <span style={{ fontSize:9, fontWeight:700, color: rfi.priority==='Urgent'?'#E24B4A':rfi.priority==='High'?'#F97316':'#9CA3AF', flexShrink:0, marginTop:2 }}>
                        {rfi.priority.toUpperCase()}
                      </span>
                    )}
                  </div>
                </div>
              )
            })}
          </div>

          {/* Footer */}
          <div style={{ padding:'10px 16px', borderTop:'1px solid #F3F4F6', flexShrink:0 }}>
            <button onClick={() => { navigate('/job'); setOpen(false) }}
              style={{ width:'100%', padding:'7px', borderRadius:8, border:'1px solid #E8ECF0', background:'#fff', color:'#6B7280', fontSize:12, fontWeight:600, cursor:'pointer' }}>
              View all jobs
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

function RFIIcon({ size=18 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/>
      <line x1="9" y1="10" x2="15" y2="10"/>
      <line x1="12" y1="7" x2="12" y2="13"/>
    </svg>
  )
}
