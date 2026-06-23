import { useState, useEffect, useRef } from 'react'
import { supabase } from '../lib/supabase'
import { useApp } from '../context/AppContext'
import { useNavigate } from 'react-router-dom'

const fmtNZTime = dt => {
  const s = String(dt).endsWith('Z') || String(dt).includes('+') ? dt : dt + 'Z'
  const d = new Date(s)
  const off = (d.getUTCMonth() >= 4 && d.getUTCMonth() <= 8) ? 12 : 13
  const nz = new Date(d.getTime() + off * 3600000)
  const H = nz.getUTCHours()
  return nz.getUTCDate() + ' ' +
    ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][nz.getUTCMonth()] +
    ', ' + (H % 12 || 12) + ':' + String(nz.getUTCMinutes()).padStart(2,'0') +
    ' ' + (H < 12 ? 'am' : 'pm')
}

const SEVERITY_STYLE = {
  Minor:    { bg:'#DCFCE7', color:'#166534', dot:'#1D9E75' },
  Moderate: { bg:'#FEF9C3', color:'#854D0E', dot:'#EF9F27' },
  Major:    { bg:'#FEF2F2', color:'#991B1B', dot:'#E24B4A' },
}

export default function NotificationBell() {
  const { profile } = useApp()
  const navigate = useNavigate()
  const [notifs, setNotifs]   = useState([])
  const [open, setOpen]       = useState(false)
  const dropRef = useRef()

  const unread = notifs.filter(n => !n.read).length

  useEffect(() => {
    if (!profile?.id) return
    loadNotifs()
    // Real-time subscription
    const sub = supabase.channel('notifications')
      .on('postgres_changes', { event:'INSERT', schema:'public', table:'notifications', filter:`user_id=eq.${profile.id}` },
        payload => { setNotifs(p => [payload.new, ...p]) })
      .subscribe()
    return () => supabase.removeChannel(sub)
  }, [profile?.id])

  // Close on outside click
  useEffect(() => {
    const handler = e => { if (dropRef.current && !dropRef.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  async function loadNotifs() {
    const { data } = await supabase.from('notifications')
      .select('*').eq('user_id', profile.id)
      .order('created_at', { ascending: false }).limit(30)
    setNotifs(data || [])
  }

  async function markRead(id) {
    await supabase.from('notifications').update({ read: true }).eq('id', id)
    setNotifs(p => p.map(n => n.id === id ? { ...n, read: true } : n))
  }

  async function markAllRead() {
    await supabase.from('notifications').update({ read: true }).eq('user_id', profile.id).eq('read', false)
    setNotifs(p => p.map(n => ({ ...n, read: true })))
  }

  return (
    <div ref={dropRef} style={{ position:'relative' }}>
      <button onClick={() => setOpen(s => !s)}
        style={{ position:'relative', border:'1px solid rgba(255,255,255,0.2)', cursor:'pointer', width:36, height:36, display:'flex', alignItems:'center', justifyContent:'center', borderRadius:8,
          background: open ? '#F3F4F6' : 'transparent',
          color: 'rgba(255,255,255,0.85)' }}>
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#374151" strokeWidth="1.8">
          <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/>
          <path d="M13.73 21a2 2 0 0 1-3.46 0"/>
        </svg>
        {unread > 0 && (
          <span style={{ position:'absolute', top:4, right:4, width:16, height:16, borderRadius:'50%',
            background:'#E24B4A', color:'#fff', fontSize:9, fontWeight:700,
            display:'flex', alignItems:'center', justifyContent:'center', border:'2px solid #fff' }}>
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </button>

      {open && (
        <div style={{ position:'fixed', top:54, right:8, zIndex:600, width:360, maxWidth:'calc(100vw - 16px)',
          background:'#fff', borderRadius:14, boxShadow:'0 16px 48px rgba(0,0,0,0.2)', border:'1px solid #E8ECF0', overflow:'hidden' }}>
          <div style={{ padding:'12px 16px', display:'flex', alignItems:'center', justifyContent:'space-between', borderBottom:'1px solid #F3F4F6' }}>
            <span style={{ fontSize:14, fontWeight:700, color:'#2A3042' }}>Notifications</span>
            {unread > 0 && (
              <button onClick={markAllRead}
                style={{ fontSize:12, color:'#5B8AF0', background:'none', border:'none', cursor:'pointer', fontWeight:600 }}>
                Mark all read
              </button>
            )}
          </div>

          <div style={{ maxHeight:400, overflowY:'auto' }}>
            {notifs.length === 0 ? (
              <div style={{ padding:'32px 16px', textAlign:'center', color:'#9CA3AF', fontSize:13 }}>
                No notifications yet
              </div>
            ) : notifs.map(n => {
              const ss = SEVERITY_STYLE[n.body?.match(/^(Minor|Moderate|Major)/)?.[1]] || {}
              return (
                <div key={n.id}
                  onClick={() => { markRead(n.id); setOpen(false); if(n.job_id) setTimeout(()=>navigate(n.type==='feedback'?`/job/${n.job_id}/feedback`:`/job/${n.job_id}`),50) }}
                  style={{ padding:'12px 16px', borderBottom:'1px solid #F9FAFB', cursor:'pointer',
                    background: n.read ? '#fff' : '#F8F9FF', display:'flex', gap:10, alignItems:'flex-start' }}
                  onMouseEnter={e => e.currentTarget.style.background = '#F9FAFB'}
                  onMouseLeave={e => e.currentTarget.style.background = n.read ? '#fff' : '#F8F9FF'}>
                  <div style={{ width:8, height:8, borderRadius:'50%', background: ss.dot || '#5B8AF0', flexShrink:0, marginTop:5 }} />
                  <div style={{ flex:1, minWidth:0 }}>
                    <div style={{ fontSize:13, fontWeight: n.read ? 500 : 700, color:'#2A3042' }}>{n.title}</div>
                    <div style={{ fontSize:12, color:'#6B7280', marginTop:2, lineHeight:1.4 }}>{n.body}</div>
                    <div style={{ fontSize:10, color:'#9CA3AF', marginTop:4 }}>{fmtNZTime(n.created_at)}</div>
                  </div>
                  {!n.read && <div style={{ width:8, height:8, borderRadius:'50%', background:'#5B8AF0', flexShrink:0, marginTop:5 }} />}
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
