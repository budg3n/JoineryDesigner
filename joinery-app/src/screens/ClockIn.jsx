// ClockIn widget — can be used on both Dashboard (compact) and JobDetail (full)
import { useState, useEffect, useRef } from 'react'
import { supabase } from '../lib/supabase'
import { useApp } from '../context/AppContext'
import { useToast } from '../components/Toast'

// ── helpers ───────────────────────────────────────────────────────
export function fmtDuration(minutes) {
  if (!minutes && minutes !== 0) return '—'
  const h = Math.floor(Math.abs(minutes) / 60)
  const m = Math.floor(Math.abs(minutes) % 60)
  const sign = minutes < 0 ? '-' : ''
  if (h === 0) return `${sign}${m}m`
  return `${sign}${h}h ${m > 0 ? m + 'm' : ''}`
}

export function fmtHours(hours) {
  if (!hours && hours !== 0) return '—'
  const h = Math.floor(Math.abs(hours))
  const m = Math.round((Math.abs(hours) - h) * 60)
  const sign = hours < 0 ? '-' : ''
  if (h === 0) return `${sign}${m}m`
  return `${sign}${h}h ${m > 0 ? m + 'm' : ''}`
}

// ── Live timer hook ───────────────────────────────────────────────
export function useLiveTimer(clockedInAt) {
  const [elapsed, setElapsed] = useState(0) // minutes

  useEffect(() => {
    if (!clockedInAt) { setElapsed(0); return }
    function tick() {
      const s = String(clockedInAt).endsWith('Z')||String(clockedInAt).includes('+') ? clockedInAt : clockedInAt+'Z'
      const diff = (Date.now() - new Date(s).getTime()) / 60000
      setElapsed(diff)
    }
    tick()
    const i = setInterval(tick, 10000) // update every 10s
    return () => clearInterval(i)
  }, [clockedInAt])

  return elapsed
}

// ── Budget progress bar ───────────────────────────────────────────
export function BudgetBar({ budgetHours, loggedHours, activeMinutes = 0, compact = false }) {
  const budget  = parseFloat(budgetHours) || 0
  const logged  = parseFloat(loggedHours) || 0
  const live    = activeMinutes / 60
  const total   = logged + live
  const noBudget = budget === 0

  if (noBudget && total === 0) return null

  const pct     = noBudget ? 0 : Math.min((total / budget) * 100, 100)
  const isOver  = !noBudget && total > budget
  const remaining = budget - total
  const overBy  = total - budget

  const barColor = isOver ? '#E24B4A' : total / budget > 0.85 ? '#EF9F27' : '#1D9E75'

  if (compact) return (
    <div style={{ marginTop: 8 }}>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:4 }}>
        <span style={{ fontSize:10, fontWeight:600, color: isOver ? '#E24B4A' : '#6B7280' }}>
          {noBudget ? fmtHours(total) + ' logged' :
           isOver   ? `${fmtHours(overBy)} over` :
                      `${fmtHours(remaining)} left`}
        </span>
        {!noBudget && <span style={{ fontSize:10, color:'#9CA3AF' }}>{Math.round(pct)}%</span>}
      </div>
      {!noBudget && (
        <div style={{ height:4, background:'#F3F4F6', borderRadius:2, overflow:'hidden' }}>
          <div style={{ height:'100%', width:`${pct}%`, background: barColor, borderRadius:2, transition:'width .3s' }} />
        </div>
      )}
    </div>
  )

  return (
    <div>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'baseline', marginBottom:6 }}>
        <span style={{ fontSize:12, color:'#6B7280' }}>
          {fmtHours(total)} {budget > 0 ? `/ ${fmtHours(budget)}` : 'logged'}
        </span>
        <span style={{ fontSize:12, fontWeight:700, color: isOver ? '#E24B4A' : '#6B7280' }}>
          {noBudget ? '' : isOver ? `⚠ ${fmtHours(overBy)} over` : `${fmtHours(remaining)} remaining`}
        </span>
      </div>
      {!noBudget && (
        <div style={{ height:8, background:'#F3F4F6', borderRadius:4, overflow:'hidden' }}>
          <div style={{ height:'100%', width:`${pct}%`, background: barColor, borderRadius:4, transition:'width .3s',
            boxShadow: isOver ? '0 0 6px rgba(226,75,74,0.4)' : 'none' }} />
        </div>
      )}
    </div>
  )
}

// ── Clock-in button (compact, for job detail) ─────────────────────
export function ClockInButton({ jobId, onUpdate }) {
  const { profile } = useApp()
  const toast = useToast()
  const [active, setActive]   = useState(null) // active entry for this user+job
  const [loading, setLoading] = useState(true)
  const elapsed = useLiveTimer(active?.clocked_in_at)

  useEffect(() => {
    if (!profile?.id || !jobId) return
    supabase.from('time_entries')
      .select('*')
      .eq('job_id', jobId)
      .eq('user_id', profile.id)
      .is('clocked_out_at', null)
      .maybeSingle()
      .then(({ data }) => { setActive(data); setLoading(false) })
  }, [jobId, profile?.id])

  async function clockIn() {
    setLoading(true)
    const { data, error } = await supabase.from('time_entries')
      .insert({ job_id: jobId, user_id: profile.id, clocked_in_at: new Date().toISOString() })
      .select().single()
    if (error) { toast(error.message, 'error'); setLoading(false); return }
    setActive(data)
    setLoading(false)
    toast('Clocked in ✓')
    onUpdate?.()
  }

  async function clockOut() {
    if (!active) return
    setLoading(true)
    const _inAt = String(active.clocked_in_at).endsWith('Z') ? active.clocked_in_at : active.clocked_in_at+'Z'
    const mins = (Date.now() - new Date(_inAt).getTime()) / 60000
    const { error } = await supabase.from('time_entries')
      .update({ clocked_out_at: new Date().toISOString(), duration_minutes: Math.round(mins) })
      .eq('id', active.id)
    if (error) { toast(error.message, 'error'); setLoading(false); return }
    // Update time_logged on job
    const { data: job } = await supabase.from('jobs').select('time_logged').eq('id', jobId).single()
    const newTotal = (parseFloat(job?.time_logged) || 0) + mins / 60
    await supabase.from('jobs').update({ time_logged: parseFloat(newTotal.toFixed(2)) }).eq('id', jobId)
    setActive(null)
    setLoading(false)
    toast(`Clocked out — ${fmtDuration(Math.round(mins))} logged`)
    onUpdate?.()
  }

  if (loading) return <div style={{ height:36, width:110, background:'#F3F4F6', borderRadius:9, animation:'pulse 1.5s infinite' }} />

  if (active) return (
    <button onClick={clockOut}
      style={{ display:'flex', alignItems:'center', gap:8, height:36, padding:'0 14px', borderRadius:9, border:'none', background:'#1D9E75', color:'#fff', cursor:'pointer', fontSize:13, fontWeight:700, transition:'background .15s' }}
      onMouseEnter={e=>e.currentTarget.style.background='#166853'}
      onMouseLeave={e=>e.currentTarget.style.background='#1D9E75'}>
      <span style={{ width:8, height:8, borderRadius:'50%', background:'#fff', animation:'ping 1.5s cubic-bezier(0,0,0.2,1) infinite', display:'inline-block' }} />
      {fmtDuration(Math.round(elapsed))} · Clock out
    </button>
  )

  return (
    <button onClick={clockIn}
      style={{ display:'flex', alignItems:'center', gap:7, height:36, padding:'0 14px', borderRadius:9, border:'1px solid #DDE3EC', background:'#fff', color:'#374151', cursor:'pointer', fontSize:13, fontWeight:600, transition:'all .15s' }}
      onMouseEnter={e=>{ e.currentTarget.style.background='#F9FAFB'; e.currentTarget.style.borderColor='#9CA3AF' }}
      onMouseLeave={e=>{ e.currentTarget.style.background='#fff'; e.currentTarget.style.borderColor='#DDE3EC' }}>
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
      Clock in
    </button>
  )
}

// ── Time history (for job detail expanded view) ───────────────────
export function TimeHistory({ jobId, refreshKey }) {
  const [entries, setEntries] = useState([])
  const [profiles, setProfiles] = useState({})

  useEffect(() => {
    supabase.from('time_entries')
      .select('*')
      .eq('job_id', jobId)
      .not('clocked_out_at', 'is', null)
      .order('clocked_in_at', { ascending: false })
      .limit(20)
      .then(async ({ data }) => {
        setEntries(data || [])
        // load profile names
        const ids = [...new Set((data||[]).map(e => e.user_id))]
        if (ids.length) {
          const { data: profs } = await supabase.from('profiles').select('id,full_name,email').in('id', ids)
          const map = {}
          ;(profs||[]).forEach(p => { map[p.id] = p.full_name || p.email })
          setProfiles(map)
        }
      })
  }, [jobId, refreshKey])

  if (!entries.length) return (
    <div style={{ fontSize:12, color:'#9CA3AF', padding:'8px 0' }}>No time entries yet</div>
  )

  return (
    <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
      {entries.map(e => (
        <div key={e.id} style={{ display:'flex', alignItems:'center', gap:10, padding:'8px 12px', background:'#F9FAFB', borderRadius:9, border:'1px solid #E8ECF0' }}>
          <div style={{ width:28, height:28, borderRadius:'50%', background:'#EEF2FF', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#5B8AF0" strokeWidth="2"><circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7"/></svg>
          </div>
          <div style={{ flex:1, minWidth:0 }}>
            <div style={{ fontSize:12, fontWeight:600, color:'#2A3042' }}>{profiles[e.user_id] || 'Unknown'}</div>
            <div style={{ fontSize:11, color:'#9CA3AF' }}>
              {new Date(e.clocked_in_at).toLocaleDateString('en-NZ',{day:'numeric',month:'short'})} · {new Date(e.clocked_in_at).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'})} → {new Date(e.clocked_out_at).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'})}
            </div>
          </div>
          <span style={{ fontSize:13, fontWeight:700, color:'#2A3042', flexShrink:0 }}>{fmtDuration(e.duration_minutes)}</span>
        </div>
      ))}
    </div>
  )
}
