import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useApp } from '../context/AppContext'
import { useToast } from './Toast'

// Live elapsed timer
function useTimer(clockedInAt) {
  const [secs, setSecs] = useState(0)
  useEffect(() => {
    if (!clockedInAt) { setSecs(0); return }
    const calc = () => {
      const s = String(clockedInAt).endsWith('Z') ? clockedInAt : clockedInAt + 'Z'
      setSecs(Math.floor((Date.now() - new Date(s).getTime()) / 1000))
    }
    calc()
    const t = setInterval(calc, 1000)
    return () => clearInterval(t)
  }, [clockedInAt])
  const h = Math.floor(secs / 3600)
  const m = Math.floor((secs % 3600) / 60)
  const s = secs % 60
  return h > 0
    ? `${h}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`
    : `${m}:${String(s).padStart(2,'0')}`
}

export default function JobClock() {
  const [open, setOpen]           = useState(false)
  const [active, setActive]       = useState(null)   // current time_entry with job+process
  const [nextProcess, setNext]    = useState(null)   // next assigned process
  const [loading, setLoading]     = useState(true)
  const { profile } = useApp()
  const toast   = useToast()
  const navigate = useNavigate()
  const ref = useRef()
  const elapsed = useTimer(active?.clocked_in_at)

  // Close on outside click
  useEffect(() => {
    const h = e => { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [])

  async function load() {
    if (!profile?.id) return
    const [{ data: entry }, { data: procs }] = await Promise.all([
      // Active clock-in (no clocked_out_at)
      supabase.from('time_entries')
        .select('*, jobs(id,name,job_number,status), job_processes(id,name,color)')
        .eq('user_id', profile.id)
        .is('clocked_out_at', null)
        .order('clocked_in_at', { ascending: false })
        .limit(1)
        .maybeSingle(),
      // Upcoming assigned processes (not complete, has due_date)
      supabase.from('job_processes')
        .select('id,name,color,due_date,job_id,jobs(id,name,job_number,status,start_date,due_date)')
        .eq('assigned_to', profile.id)
        .neq('status', 'Complete')
        .not('due_date', 'is', null)
        .gte('due_date', new Date().toISOString().slice(0,10))
        .order('due_date', { ascending: true })
        .limit(5),
    ])
    setActive(entry || null)
    // Next = first upcoming process not currently active
    const next = (procs||[]).find(p => !entry || p.id !== entry.process_id)
    setNext(next || null)
    setLoading(false)
  }

  useEffect(() => {
    if (!open || !profile?.id) return
    load()
  }, [open, profile?.id])

  // Listen for clock changes from anywhere
  useEffect(() => {
    const refresh = () => { if (open) load() }
    window.addEventListener('process-clock-change', refresh)
    window.addEventListener('processes-updated', refresh)
    return () => {
      window.removeEventListener('process-clock-change', refresh)
      window.removeEventListener('processes-updated', refresh)
    }
  }, [open, profile?.id])

  async function clockOut(status) {
    if (!active) return
    const s = String(active.clocked_in_at).endsWith('Z') ? active.clocked_in_at : active.clocked_in_at + 'Z'
    const mins = Math.round((Date.now() - new Date(s).getTime()) / 60000)
    await supabase.from('time_entries').update({
      clocked_out_at: new Date().toISOString(),
      duration_minutes: mins,
    }).eq('id', active.id)
    if (status && active.process_id) {
      await supabase.from('job_processes').update({ status }).eq('id', active.process_id)
    }
    toast(status === 'Complete' ? '✓ Process completed' : '⏸ Put on hold')
    window.dispatchEvent(new CustomEvent('process-clock-change', { detail: { jobId: active.job_id } }))
    setActive(null)
    load()
  }

  async function startNext() {
    if (!nextProcess) return
    // Clock out current if active
    if (active) await clockOut(null)
    // Clock into next process
    const { data, error } = await supabase.from('time_entries').insert({
      job_id: nextProcess.job_id,
      user_id: profile.id,
      process_id: nextProcess.id,
      clocked_in_at: new Date().toISOString(),
    }).select('*, jobs(id,name,job_number,status), job_processes(id,name,color)').single()
    if (error) { toast(error.message, 'error'); return }
    await supabase.from('job_processes').update({ status: 'In progress', assigned_to: profile.id }).eq('id', nextProcess.id)
    toast(`▶ Started ${nextProcess.name}`)
    window.dispatchEvent(new CustomEvent('process-clock-change', { detail: { jobId: nextProcess.job_id } }))
    setActive(data)
    load()
  }

  const isClocked = !!active
  const jobName = active?.jobs?.name?.replace(/^.+?[—–-]{1,2}\s*/,'') || active?.jobs?.name

  function fmtDate(d) {
    if (!d) return ''
    return new Date(d).toLocaleDateString('en-NZ', { weekday:'short', day:'numeric', month:'short' })
  }

  return (
    <div ref={ref} style={{ position:'relative' }}>
      {/* Trigger */}
      <button onClick={() => setOpen(o => !o)}
        style={{ position:'relative', width:34, height:34, borderRadius:9, border:'none', cursor:'pointer',
          display:'flex', alignItems:'center', justifyContent:'center',
          background: isClocked ? '#DCFCE7' : open ? '#EEF2FF' : '#F3F4F6',
          color: isClocked ? '#166534' : open ? '#5B8AF0' : '#6B7280',
          transition: 'all .15s' }}>
        {/* Briefcase icon */}
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="2" y="7" width="20" height="14" rx="2"/>
          <path d="M16 7V5a2 2 0 00-2-2h-4a2 2 0 00-2 2v2"/>
          <line x1="12" y1="12" x2="12" y2="16"/>
          <line x1="10" y1="14" x2="14" y2="14"/>
        </svg>
        {/* Active pulsing dot */}
        {isClocked && (
          <div style={{ position:'absolute', top:5, right:5, width:7, height:7, borderRadius:'50%',
            background:'#1D9E75', border:'1.5px solid #fff', animation:'pulse 2s infinite' }} />
        )}
      </button>

      {/* Dropdown */}
      {open && (
        <div style={{ position:'absolute', right:0, top:'calc(100% + 8px)', width:320,
          background:'#fff', borderRadius:14, border:'1px solid #E8ECF0',
          boxShadow:'0 12px 40px rgba(0,0,0,0.14)', zIndex:500, overflow:'hidden' }}>

          {/* Header */}
          <div style={{ padding:'12px 16px', borderBottom:'1px solid #F3F4F6', background:'#F9FAFB' }}>
            <div style={{ fontSize:12, fontWeight:800, color:'#2A3042' }}>Job Status</div>
            <div style={{ fontSize:11, color:'#9CA3AF', marginTop:1 }}>Your current and upcoming work</div>
          </div>

          {loading ? (
            <div style={{ padding:'32px 0', display:'flex', justifyContent:'center' }}>
              <div className="spinner" />
            </div>
          ) : (
            <div>
              {/* ── CURRENTLY CLOCKED IN ── */}
              <div style={{ padding:'14px 16px', borderBottom:'1px solid #F3F4F6' }}>
                <div style={{ fontSize:10, fontWeight:700, color:'#9CA3AF', textTransform:'uppercase', letterSpacing:'.06em', marginBottom:10 }}>
                  Currently clocked in
                </div>

                {!active ? (
                  <div style={{ display:'flex', alignItems:'center', gap:10, padding:'10px 12px', background:'#F9FAFB', borderRadius:10, border:'1px solid #E8ECF0' }}>
                    <div style={{ width:8, height:8, borderRadius:'50%', background:'#D1D5DB', flexShrink:0 }} />
                    <div style={{ fontSize:13, color:'#9CA3AF' }}>Not clocked in</div>
                  </div>
                ) : (
                  <div style={{ background:'#F0FDF4', borderRadius:10, border:'1px solid #86EFAC', padding:'12px 14px' }}>
                    <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', gap:8, marginBottom:10 }}>
                      <div style={{ flex:1, minWidth:0 }}>
                        <div style={{ fontSize:13, fontWeight:700, color:'#166534', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                          {jobName || 'Job'}
                        </div>
                        {active.job_processes && (
                          <div style={{ display:'flex', alignItems:'center', gap:5, marginTop:3 }}>
                            <div style={{ width:7, height:7, borderRadius:'50%', background:active.job_processes.color||'#9CA3AF', flexShrink:0 }} />
                            <div style={{ fontSize:11, color:'#166534', opacity:0.8 }}>{active.job_processes.name}</div>
                          </div>
                        )}
                      </div>
                      {/* Live timer */}
                      <div style={{ fontSize:16, fontWeight:800, color:'#166534', fontVariantNumeric:'tabular-nums', flexShrink:0 }}>
                        {elapsed}
                      </div>
                    </div>

                    {/* Action buttons */}
                    <div style={{ display:'flex', gap:6 }}>
                      <button onClick={() => clockOut('On hold')}
                        style={{ flex:1, fontSize:11, fontWeight:700, padding:'7px 0', borderRadius:8,
                          border:'1px solid #FDE68A', background:'#FEF9C3', color:'#854D0E', cursor:'pointer' }}
                        onMouseEnter={e=>e.currentTarget.style.background='#FEF08A'}
                        onMouseLeave={e=>e.currentTarget.style.background='#FEF9C3'}>
                        ⏸ Hold
                      </button>
                      <button onClick={() => clockOut('Complete')}
                        style={{ flex:1, fontSize:11, fontWeight:700, padding:'7px 0', borderRadius:8,
                          border:'1px solid #86EFAC', background:'#DCFCE7', color:'#166534', cursor:'pointer' }}
                        onMouseEnter={e=>e.currentTarget.style.background='#BBF7D0'}
                        onMouseLeave={e=>e.currentTarget.style.background='#DCFCE7'}>
                        ✓ Complete
                      </button>
                      <button onClick={() => { navigate(`/job/${active.job_id}`); setOpen(false) }}
                        style={{ fontSize:11, fontWeight:700, padding:'7px 10px', borderRadius:8,
                          border:'1px solid #C4D4F8', background:'#EEF2FF', color:'#3730A3', cursor:'pointer' }}
                        onMouseEnter={e=>e.currentTarget.style.background='#E0E7FF'}
                        onMouseLeave={e=>e.currentTarget.style.background='#EEF2FF'}>
                        Open
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {/* ── NEXT UP ── */}
              <div style={{ padding:'14px 16px' }}>
                <div style={{ fontSize:10, fontWeight:700, color:'#9CA3AF', textTransform:'uppercase', letterSpacing:'.06em', marginBottom:10 }}>
                  Next up
                </div>

                {!nextProcess ? (
                  <div style={{ padding:'10px 12px', background:'#F9FAFB', borderRadius:10, border:'1px solid #E8ECF0', fontSize:13, color:'#9CA3AF' }}>
                    No upcoming processes assigned
                  </div>
                ) : (
                  <div style={{ background:'#F9FAFB', borderRadius:10, border:'1px solid #E8ECF0', padding:'12px 14px' }}>
                    <div style={{ display:'flex', alignItems:'flex-start', gap:10, marginBottom:10 }}>
                      <div style={{ width:8, height:8, borderRadius:'50%', background:nextProcess.color||'#9CA3AF', flexShrink:0, marginTop:4 }} />
                      <div style={{ flex:1, minWidth:0 }}>
                        <div style={{ fontSize:13, fontWeight:700, color:'#2A3042', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                          {nextProcess.jobs?.name?.replace(/^.+?[—–-]{1,2}\s*/,'') || nextProcess.jobs?.name}
                        </div>
                        <div style={{ fontSize:11, color:'#6B7280', marginTop:2 }}>{nextProcess.name}</div>
                        {nextProcess.due_date && (
                          <div style={{ fontSize:10, color:'#9CA3AF', marginTop:2 }}>
                            Due {fmtDate(nextProcess.due_date)}
                          </div>
                        )}
                      </div>
                    </div>

                    <div style={{ display:'flex', gap:6 }}>
                      <button onClick={startNext}
                        style={{ flex:1, fontSize:11, fontWeight:700, padding:'7px 0', borderRadius:8,
                          border:'none', background:'#2A3042', color:'#fff', cursor:'pointer' }}
                        onMouseEnter={e=>e.currentTarget.style.background='#374151'}
                        onMouseLeave={e=>e.currentTarget.style.background='#2A3042'}>
                        {active ? '■ Finish current & start' : '▶ Start'}
                      </button>
                      <button onClick={() => { navigate(`/job/${nextProcess.job_id}`); setOpen(false) }}
                        style={{ fontSize:11, fontWeight:700, padding:'7px 10px', borderRadius:8,
                          border:'1px solid #E8ECF0', background:'#fff', color:'#374151', cursor:'pointer' }}
                        onMouseEnter={e=>e.currentTarget.style.background='#F3F4F6'}
                        onMouseLeave={e=>e.currentTarget.style.background='#fff'}>
                        View job
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; transform: scale(1); }
          50% { opacity: 0.6; transform: scale(1.3); }
        }
      `}</style>
    </div>
  )
}
