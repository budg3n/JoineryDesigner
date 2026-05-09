import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useApp } from '../context/AppContext'

const STATUS_COLORS = {
  'In progress': { bg:'#DBEAFE', color:'#1E40AF', dot:'#3B82F6' },
  'Complete':    { bg:'#DCFCE7', color:'#166534', dot:'#22C55E' },
  'On hold':     { bg:'#FEF9C3', color:'#854D0E', dot:'#EAB308' },
  'Pending':     { bg:'#FEF2F2', color:'#991B1B', dot:'#EF4444' },
  'Cancelled':   { bg:'#F3F4F6', color:'#6B7280', dot:'#9CA3AF' },
}

const DAY_NAMES = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat']
const TODAY = new Date()

export default function WeekSnapshot() {
  const [open, setOpen]         = useState(false)
  const [jobs, setJobs]         = useState([])
  const [myJobIds, setMyJobIds] = useState(new Set())
  const [loading, setLoading]   = useState(true)
  const [weekOffset, setWeekOffset] = useState(0)
  const { profile } = useApp()
  const ref = useRef()
  const navigate = useNavigate()

  // Close on outside click
  useEffect(() => {
    function handle(e) { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', handle)
    return () => document.removeEventListener('mousedown', handle)
  }, [])

  // Load data when first opened
  useEffect(() => {
    if (!open || !profile?.id) return
    Promise.all([
      supabase.from('jobs').select('id,name,job_number,status,start_date,due_date').neq('status','Cancelled'),
      supabase.from('job_assignments').select('job_id').eq('user_id', profile.id),
    ]).then(([{data:j},{data:a}]) => {
      setJobs(j||[])
      setMyJobIds(new Set((a||[]).map(x=>x.job_id)))
      setLoading(false)
    })
  }, [open, profile?.id])

  // Compute week days (Mon–Sun)
  const monday = (() => {
    const d = new Date(TODAY)
    const dow = d.getDay()
    d.setDate(d.getDate() - (dow === 0 ? 6 : dow - 1) + weekOffset * 7)
    d.setHours(0,0,0,0)
    return d
  })()

  const days = Array.from({length:7}, (_,i) => {
    const d = new Date(monday)
    d.setDate(monday.getDate() + i)
    return d
  })

  function jobsForDay(date) {
    const ds = date.toISOString().slice(0,10)
    return jobs.filter(j => {
      if (!myJobIds.has(j.id)) return false
      const s = j.start_date?.slice(0,10) || ds
      const e = j.due_date?.slice(0,10)   || s
      return ds >= s && ds <= e
    })
  }

  const weekLabel = `${days[0].toLocaleDateString('en-NZ',{day:'numeric',month:'short'})} – ${days[6].toLocaleDateString('en-NZ',{day:'numeric',month:'short'})}`
  const totalThisWeek = days.reduce((sum,d)=>sum+jobsForDay(d).length,0)
  const isCurrentWeek = weekOffset === 0

  return (
    <div ref={ref} style={{ position:'relative' }}>
      {/* Trigger button */}
      <button onClick={() => setOpen(o=>!o)}
        style={{ position:'relative', width:34, height:34, borderRadius:9, border:'none', cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center',
          background: open ? '#EEF2FF' : '#F3F4F6',
          color: open ? '#5B8AF0' : '#6B7280' }}
        onMouseEnter={e=>{if(!open){e.currentTarget.style.background='#F3F4F6';e.currentTarget.style.color='#374151'}}}
        onMouseLeave={e=>{if(!open){e.currentTarget.style.background='#F3F4F6';e.currentTarget.style.color='#6B7280'}}}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="3" y="4" width="18" height="18" rx="2"/>
          <line x1="16" y1="2" x2="16" y2="6"/>
          <line x1="8" y1="2" x2="8" y2="6"/>
          <line x1="3" y1="10" x2="21" y2="10"/>
        </svg>
        {/* Dot indicator if there are jobs this week */}
        {!loading && totalThisWeek > 0 && isCurrentWeek && (
          <div style={{ position:'absolute', top:5, right:5, width:6, height:6, borderRadius:'50%', background:'#5B8AF0', border:'1.5px solid #fff' }} />
        )}
      </button>

      {/* Dropdown */}
      {open && (
        <div style={{ position:'absolute', right:0, top:'calc(100% + 8px)', width:340, background:'#fff', borderRadius:14, border:'1px solid #E8ECF0', boxShadow:'0 12px 40px rgba(0,0,0,0.14)', zIndex:500, overflow:'hidden' }}>

          {/* Header */}
          <div style={{ padding:'12px 16px', borderBottom:'1px solid #F3F4F6', display:'flex', alignItems:'center', justifyContent:'space-between' }}>
            <div>
              <div style={{ fontSize:13, fontWeight:800, color:'#2A3042' }}>My week</div>
              <div style={{ fontSize:11, color:'#9CA3AF', marginTop:1 }}>{weekLabel}</div>
            </div>
            <div style={{ display:'flex', gap:4 }}>
              <button onClick={()=>setWeekOffset(w=>w-1)}
                style={{ width:26, height:26, borderRadius:7, border:'1px solid #E8ECF0', background:'#F9FAFB', cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', color:'#6B7280' }}
                onMouseEnter={e=>e.currentTarget.style.background='#EEF2FF'} onMouseLeave={e=>e.currentTarget.style.background='#F9FAFB'}>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="15 18 9 12 15 6"/></svg>
              </button>
              {weekOffset !== 0 && (
                <button onClick={()=>setWeekOffset(0)}
                  style={{ fontSize:10, fontWeight:700, padding:'0 8px', height:26, borderRadius:7, border:'1px solid #C4D4F8', background:'#EEF2FF', cursor:'pointer', color:'#5B8AF0' }}>
                  Today
                </button>
              )}
              <button onClick={()=>setWeekOffset(w=>w+1)}
                style={{ width:26, height:26, borderRadius:7, border:'1px solid #E8ECF0', background:'#F9FAFB', cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', color:'#6B7280' }}
                onMouseEnter={e=>e.currentTarget.style.background='#EEF2FF'} onMouseLeave={e=>e.currentTarget.style.background='#F9FAFB'}>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="9 18 15 12 9 6"/></svg>
              </button>
            </div>
          </div>

          {/* Content */}
          {loading ? (
            <div style={{ padding:'32px 0', display:'flex', justifyContent:'center' }}>
              <div className="spinner" />
            </div>
          ) : (
            <div style={{ maxHeight:420, overflowY:'auto' }}>
              {days.map((date, i) => {
                const dayJobs  = jobsForDay(date)
                const isToday  = date.toDateString() === TODAY.toDateString()
                const isWeekend= date.getDay() === 0 || date.getDay() === 6
                const isEmpty  = dayJobs.length === 0
                return (
                  <div key={i} style={{ borderBottom:'1px solid #F9FAFB' }}>
                    {/* Day row */}
                    <div style={{ display:'flex', alignItems:'flex-start', gap:10, padding:'9px 16px',
                      background: isToday ? '#F0F7FF' : isWeekend ? '#FAFAFA' : '#fff' }}>
                      {/* Date badge */}
                      <div style={{ flexShrink:0, width:38, textAlign:'center' }}>
                        <div style={{ fontSize:9, fontWeight:700, color:isToday?'#5B8AF0':'#9CA3AF', textTransform:'uppercase', letterSpacing:'.06em' }}>
                          {DAY_NAMES[date.getDay()]}
                        </div>
                        <div style={{ width:28, height:28, borderRadius:'50%', margin:'2px auto 0', display:'flex', alignItems:'center', justifyContent:'center',
                          background: isToday ? '#5B8AF0' : 'transparent',
                          fontSize: 14, fontWeight: isToday ? 800 : 600,
                          color: isToday ? '#fff' : isWeekend ? '#9CA3AF' : '#2A3042' }}>
                          {date.getDate()}
                        </div>
                      </div>
                      {/* Jobs */}
                      <div style={{ flex:1, minWidth:0, paddingTop:2 }}>
                        {isEmpty ? (
                          <div style={{ fontSize:11, color:'#D1D5DB', paddingTop:6 }}>No jobs</div>
                        ) : (
                          <div style={{ display:'flex', flexDirection:'column', gap:4 }}>
                            {dayJobs.map(j => {
                              const sc = STATUS_COLORS[j.status] || STATUS_COLORS['Pending']
                              const isDue = j.due_date?.slice(0,10) === date.toISOString().slice(0,10)
                              return (
                                <div key={j.id} onClick={()=>{ navigate(`/job/${j.id}`); setOpen(false) }}
                                  style={{ display:'flex', alignItems:'center', gap:6, padding:'5px 8px', borderRadius:7,
                                    background:sc.bg, cursor:'pointer', borderLeft:`3px solid ${sc.dot}`, transition:'filter .1s' }}
                                  onMouseEnter={e=>e.currentTarget.style.filter='brightness(0.95)'}
                                  onMouseLeave={e=>e.currentTarget.style.filter='none'}>
                                  <div style={{ flex:1, minWidth:0 }}>
                                    <div style={{ fontSize:11, fontWeight:700, color:sc.color, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                                      {j.job_number && <span style={{ opacity:0.7, marginRight:3 }}>#{j.job_number}</span>}
                                      {j.name?.replace(/^.+?[—–-]{1,2}\s*/,'') || j.name}
                                    </div>
                                    <div style={{ fontSize:10, color:sc.color, opacity:0.75, marginTop:1 }}>{j.status}</div>
                                  </div>
                                  {isDue && (
                                    <span style={{ fontSize:9, fontWeight:700, padding:'1px 5px', borderRadius:20, background:sc.dot, color:'#fff', flexShrink:0 }}>Due</span>
                                  )}
                                </div>
                              )
                            })}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                )
              })}
              {days.every(d=>jobsForDay(d).length===0) && (
                <div style={{ padding:'32px 16px', textAlign:'center', color:'#9CA3AF' }}>
                  <div style={{ fontSize:22, marginBottom:8 }}>📅</div>
                  <div style={{ fontSize:13, fontWeight:600, color:'#374151', marginBottom:4 }}>No jobs this week</div>
                  <div style={{ fontSize:12 }}>Jobs assigned to you will appear here</div>
                </div>
              )}
            </div>
          )}

          {/* Footer */}
          <div style={{ padding:'10px 16px', borderTop:'1px solid #F3F4F6', display:'flex', alignItems:'center', justifyContent:'space-between' }}>
            <div style={{ fontSize:11, color:'#9CA3AF' }}>
              {loading ? '' : `${days.reduce((s,d)=>s+jobsForDay(d).length,0)} job${days.reduce((s,d)=>s+jobsForDay(d).length,0)!==1?'s':''} this week`}
            </div>
            <button onClick={()=>{ navigate('/calendar?view=week'); setOpen(false) }}
              style={{ fontSize:11, fontWeight:700, color:'#5B8AF0', background:'none', border:'none', cursor:'pointer', display:'flex', alignItems:'center', gap:3 }}
              onMouseEnter={e=>e.currentTarget.style.opacity='0.7'} onMouseLeave={e=>e.currentTarget.style.opacity='1'}>
              Full view
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="9 18 15 12 9 6"/></svg>
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
