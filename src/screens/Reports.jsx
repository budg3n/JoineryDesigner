import { useState, useEffect, useRef } from 'react'
import { supabase } from '../lib/supabase'
import { useToast } from '../components/Toast'

// ── Helpers ───────────────────────────────────────────────────────
function fmtDate(d) {
  if (!d) return '—'
  return new Date(d).toLocaleDateString('en-NZ', { day:'numeric', month:'short', year:'numeric' })
}
function fmtTime(d) {
  if (!d) return '—'
  return new Date(d).toLocaleTimeString([], { hour:'2-digit', minute:'2-digit' })
}
function fmtDuration(mins) {
  if (!mins) return '—'
  const h = Math.floor(mins / 60), m = mins % 60
  return h > 0 ? `${h}h ${m > 0 ? m + 'm' : ''}`.trim() : `${m}m`
}
function fmtDecimalHours(mins) {
  if (!mins) return '0.0'
  return (mins / 60).toFixed(1)
}

function safeDuration(entry) {
  // Use stored duration_minutes if it looks reasonable (< 24h)
  if (entry.duration_minutes && entry.duration_minutes > 0 && entry.duration_minutes < 1440) {
    return entry.duration_minutes
  }
  // Recalculate from timestamps as fallback (ensures Z suffix for UTC parsing)
  if (entry.clocked_in_at && entry.clocked_out_at) {
    const inAt  = String(entry.clocked_in_at).endsWith('Z')  ? entry.clocked_in_at  : entry.clocked_in_at  + 'Z'
    const outAt = String(entry.clocked_out_at).endsWith('Z') ? entry.clocked_out_at : entry.clocked_out_at + 'Z'
    const mins  = (new Date(outAt) - new Date(inAt)) / 60000
    return mins > 0 && mins < 1440 ? Math.round(mins) : 0
  }
  return 0
}

const SEV_COLORS = {
  Minor:    { bg:'#DCFCE7', color:'#166534', dot:'#1D9E75' },
  Moderate: { bg:'#FEF9C3', color:'#854D0E', dot:'#EF9F27' },
  Major:    { bg:'#FEF2F2', color:'#991B1B', dot:'#E24B4A' },
}

// ── Print CSS injected once ────────────────────────────────────────
const PRINT_STYLE = `
  @media print {
    body > *:not(#report-print-root) { display: none !important; }
    #report-print-root { display: block !important; }
    .no-print { display: none !important; }
    .print-page { page-break-after: always; }
    @page { margin: 15mm; size: A4; }
  }
`

// ── Download CSV ───────────────────────────────────────────────────
function downloadCSV(rows, filename) {
  const csv = rows.map(r => r.map(c => `"${String(c??'').replace(/"/g,'""')}"`).join(',')).join('\n')
  const blob = new Blob([csv], { type: 'text/csv' })
  const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(blob), download: filename })
  a.click(); URL.revokeObjectURL(a.href)
}

// ── Download PDF (print new window) ───────────────────────────────
function downloadPDF(html, title) {
  const win = window.open('', '_blank')
  win.document.write(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>${title}</title>
  <style>
    * { box-sizing:border-box; margin:0; padding:0; -webkit-print-color-adjust:exact; print-color-adjust:exact; }
    body { font-family:-apple-system,BlinkMacSystemFont,'Helvetica Neue',Arial,sans-serif; color:#000; padding:32px 40px; max-width:900px; margin:0 auto; }
    table { width:100%; border-collapse:collapse; font-size:13px; }
    th { background:#2A3042; color:#fff; padding:8px 12px; text-align:left; font-weight:700; font-size:11px; text-transform:uppercase; letter-spacing:.05em; }
    td { padding:8px 12px; border-bottom:1px solid #E8ECF0; vertical-align:top; }
    tr:nth-child(even) td { background:#F9FAFB; }
    .badge { display:inline-block; padding:2px 8px; border-radius:20px; font-size:11px; font-weight:700; }
    h1 { font-size:24px; font-weight:800; color:#2A3042; margin-bottom:4px; }
    .sub { font-size:13px; color:#6B7280; margin-bottom:20px; }
    .summary { display:flex; gap:24px; margin-bottom:24px; padding:14px 18px; background:#F9FAFB; border-radius:10px; border:1px solid #E8ECF0; }
    .stat { text-align:center; }
    .stat-num { font-size:24px; font-weight:800; color:#2A3042; }
    .stat-lbl { font-size:11px; color:#9CA3AF; margin-top:2px; }
    .section-title { font-size:13px; font-weight:700; color:#2A3042; margin:20px 0 8px; padding-bottom:6px; border-bottom:2px solid #2A3042; }
    @media print { body { padding:0; } @page { margin:15mm; size:A4; } }
  </style></head><body>${html}</body></html>`)
  win.document.close()
  win.addEventListener('load', () => setTimeout(() => win.print(), 300))
  setTimeout(() => win.print(), 1000)
}

// ── Report card wrapper ────────────────────────────────────────────
function ReportCard({ title, icon, description, children, onDownloadCSV, onDownloadPDF, onPrint, loading }) {
  return (
    <div style={{ background:'#fff', borderRadius:14, border:'1px solid #E8ECF0', boxShadow:'0 1px 4px rgba(0,0,0,0.05)', overflow:'hidden', marginBottom:24 }}>
      <div style={{ padding:'16px 20px', borderBottom:'1px solid #F3F4F6', display:'flex', alignItems:'center', justifyContent:'space-between', flexWrap:'wrap', gap:10 }}>
        <div style={{ display:'flex', alignItems:'center', gap:10 }}>
          <div style={{ width:38, height:38, borderRadius:10, background:'#EEF2FF', display:'flex', alignItems:'center', justifyContent:'center', fontSize:18 }}>{icon}</div>
          <div>
            <div style={{ fontSize:15, fontWeight:800, color:'#2A3042' }}>{title}</div>
            <div style={{ fontSize:12, color:'#9CA3AF', marginTop:1 }}>{description}</div>
          </div>
        </div>
        <div className="no-print" style={{ display:'flex', gap:6 }}>
          <button onClick={onPrint} style={{ fontSize:12, fontWeight:600, padding:'6px 12px', borderRadius:8, border:'1px solid #E8ECF0', background:'#F9FAFB', cursor:'pointer', color:'#374151', display:'flex', alignItems:'center', gap:5 }}
            onMouseEnter={e=>e.currentTarget.style.background='#EEF2FF'} onMouseLeave={e=>e.currentTarget.style.background='#F9FAFB'}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 01-2-2v-5a2 2 0 012-2h16a2 2 0 012 2v5a2 2 0 01-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg>
            Print
          </button>
          <button onClick={onDownloadCSV} style={{ fontSize:12, fontWeight:600, padding:'6px 12px', borderRadius:8, border:'1px solid #E8ECF0', background:'#F9FAFB', cursor:'pointer', color:'#374151', display:'flex', alignItems:'center', gap:5 }}
            onMouseEnter={e=>e.currentTarget.style.background='#F0FDF4'} onMouseLeave={e=>e.currentTarget.style.background='#F9FAFB'}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
            CSV
          </button>
          <button onClick={onDownloadPDF} style={{ fontSize:12, fontWeight:600, padding:'6px 12px', borderRadius:8, border:'none', background:'#5B8AF0', color:'#fff', cursor:'pointer', display:'flex', alignItems:'center', gap:5, boxShadow:'0 2px 6px rgba(91,138,240,0.25)' }}
            onMouseEnter={e=>e.currentTarget.style.background='#4A7AE0'} onMouseLeave={e=>e.currentTarget.style.background='#5B8AF0'}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
            PDF
          </button>
        </div>
      </div>
      <div style={{ padding:'0 0 4px' }}>
        {loading ? (
          <div style={{ padding:'48px 0', display:'flex', justifyContent:'center' }}><div className="spinner" /></div>
        ) : children}
      </div>
    </div>
  )
}

// ── Filter bar ─────────────────────────────────────────────────────
function FilterBar({ jobs, jobFilter, setJobFilter, dateFrom, setDateFrom, dateTo, setDateTo }) {
  return (
    <div className="no-print" style={{ display:'flex', gap:10, flexWrap:'wrap', marginBottom:20, padding:'12px 16px', background:'#F9FAFB', borderRadius:10, border:'1px solid #E8ECF0' }}>
      <div>
        <label style={{ fontSize:11, fontWeight:600, color:'#6B7280', display:'block', marginBottom:4 }}>Job</label>
        <select value={jobFilter} onChange={e=>setJobFilter(e.target.value)}
          style={{ padding:'6px 10px', border:'1px solid #DDE3EC', borderRadius:8, fontSize:13, outline:'none', background:'#fff', minWidth:200 }}>
          <option value="">All jobs</option>
          {jobs.map(j=><option key={j.id} value={j.id}>{j.job_number?`#${j.job_number} `:''}{j.name}</option>)}
        </select>
      </div>
      <div>
        <label style={{ fontSize:11, fontWeight:600, color:'#6B7280', display:'block', marginBottom:4 }}>From</label>
        <input type="date" value={dateFrom} onChange={e=>setDateFrom(e.target.value)}
          style={{ padding:'6px 10px', border:'1px solid #DDE3EC', borderRadius:8, fontSize:13, outline:'none' }} />
      </div>
      <div>
        <label style={{ fontSize:11, fontWeight:600, color:'#6B7280', display:'block', marginBottom:4 }}>To</label>
        <input type="date" value={dateTo} onChange={e=>setDateTo(e.target.value)}
          style={{ padding:'6px 10px', border:'1px solid #DDE3EC', borderRadius:8, fontSize:13, outline:'none' }} />
      </div>
      <div style={{ alignSelf:'flex-end' }}>
        <button onClick={()=>{ setJobFilter(''); setDateFrom(''); setDateTo('') }}
          style={{ padding:'6px 12px', border:'1px solid #E8ECF0', borderRadius:8, fontSize:12, background:'#fff', cursor:'pointer', color:'#6B7280' }}>
          Clear
        </button>
      </div>
    </div>
  )
}

// ── Time Tracking Report ───────────────────────────────────────────
function TimeReport({ jobs, jobFilter, dateFrom, dateTo }) {
  const [entries, setEntries] = useState([])
  const [loading, setLoading] = useState(true)
  const toast = useToast()

  useEffect(() => {
    let q = supabase.from('time_entries')
      .select('*, profiles(id,full_name,email), jobs(id,name,job_number)')
      .not('clocked_out_at', 'is', null)
      .order('clocked_in_at', { ascending: false })
    if (jobFilter) q = q.eq('job_id', jobFilter)
    if (dateFrom)  q = q.gte('clocked_in_at', dateFrom)
    if (dateTo)    q = q.lte('clocked_in_at', dateTo + 'T23:59:59')
    q.then(({ data, error }) => {
      if (!error) setEntries(data||[])
      setLoading(false)
    })
  }, [jobFilter, dateFrom, dateTo])

  const totalMins = entries.reduce((s,e) => s + safeDuration(e), 0)

  // Group by person for summary
  const byPerson = {}
  entries.forEach(e => {
    const name = e.profiles?.full_name || e.profiles?.email || 'Unknown'
    if (!byPerson[name]) byPerson[name] = 0
    byPerson[name] += safeDuration(e)
  })

  // Group by job for summary
  const byJob = {}
  entries.forEach(e => {
    const name = e.jobs?.job_number ? `#${e.jobs.job_number} ${e.jobs.name}` : (e.jobs?.name || 'Unknown job')
    if (!byJob[name]) byJob[name] = 0
    byJob[name] += safeDuration(e)
  })

  function handleCSV() {
    const rows = [
      ['Date', 'Job', 'Person', 'Clock In', 'Clock Out', 'Duration (hrs)', 'Duration (mins)'],
      ...entries.map(e => [
        fmtDate(e.clocked_in_at),
        e.jobs?.job_number ? `#${e.jobs.job_number} ${e.jobs.name}` : (e.jobs?.name || ''),
        e.profiles?.full_name || e.profiles?.email || '',
        fmtTime(e.clocked_in_at),
        fmtTime(e.clocked_out_at),
        fmtDecimalHours(safeDuration(e)),
        safeDuration(e),
      ])
    ]
    downloadCSV(rows, `time-report-${new Date().toISOString().slice(0,10)}.csv`)
    toast('CSV downloaded ✓')
  }

  function handlePDF() {
    const date = new Date().toLocaleDateString('en-NZ', { day:'numeric', month:'long', year:'numeric' })
    // Summary cards
    const summaryHTML = `
      <h1>Time Tracking Report</h1>
      <div class="sub">Generated ${date}${jobFilter ? ` · ${jobs.find(j=>j.id===jobFilter)?.name||''}` : ' · All jobs'}</div>
      <div class="summary">
        <div class="stat"><div class="stat-num">${entries.length}</div><div class="stat-lbl">Sessions</div></div>
        <div class="stat"><div class="stat-num">${fmtDecimalHours(totalMins)}</div><div class="stat-lbl">Total hours</div></div>
        <div class="stat"><div class="stat-num">${Object.keys(byPerson).length}</div><div class="stat-lbl">Team members</div></div>
      </div>
      <div class="section-title">By Person</div>
      <table><tr><th>Name</th><th>Hours</th><th>Sessions</th></tr>
      ${Object.entries(byPerson).sort((a,b)=>b[1]-a[1]).map(([name,mins])=>`
        <tr><td>${name}</td><td>${fmtDecimalHours(mins)}h</td><td>${entries.filter(e=>(e.profiles?.full_name||e.profiles?.email||'Unknown')===name).length}</td></tr>
      `).join('')}</table>
      <div class="section-title">All Sessions</div>
      <table><tr><th>Date</th><th>Job</th><th>Person</th><th>Clock In</th><th>Clock Out</th><th>Duration</th></tr>
      ${entries.map(e=>`
        <tr>
          <td>${fmtDate(e.clocked_in_at)}</td>
          <td>${e.jobs?.job_number?`#${e.jobs.job_number} `:''} ${e.jobs?.name||'—'}</td>
          <td>${e.profiles?.full_name||e.profiles?.email||'—'}</td>
          <td>${fmtTime(e.clocked_in_at)}</td>
          <td>${fmtTime(e.clocked_out_at)}</td>
          <td>${fmtDuration(safeDuration(e))}</td>
        </tr>
      `).join('')}</table>`
    downloadPDF(summaryHTML, 'Time Tracking Report')
    toast('PDF opened ✓')
  }

  function handlePrint() {
    window.print()
  }

  return (
    <ReportCard title="Time Tracking" icon="⏱" description="Clock-in sessions by job and team member"
      onDownloadCSV={handleCSV} onDownloadPDF={handlePDF} onPrint={handlePrint} loading={loading}>

      {entries.length === 0 ? (
        <div style={{ padding:'40px 20px', textAlign:'center', color:'#9CA3AF', fontSize:13 }}>No time entries found for the selected filters</div>
      ) : (
        <>
          {/* Summary stats */}
          <div style={{ display:'flex', gap:0, borderBottom:'1px solid #F3F4F6' }}>
            {[
              { label:'Sessions', value:entries.length, color:'#2A3042' },
              { label:'Total hours', value:fmtDecimalHours(totalMins)+'h', color:'#5B8AF0' },
              { label:'Team members', value:Object.keys(byPerson).length, color:'#1D9E75' },
              { label:'Jobs covered', value:Object.keys(byJob).length, color:'#EF9F27' },
            ].map((s,i) => (
              <div key={i} style={{ flex:1, padding:'14px 20px', borderRight:'1px solid #F3F4F6', textAlign:'center' }}>
                <div style={{ fontSize:22, fontWeight:800, color:s.color }}>{s.value}</div>
                <div style={{ fontSize:11, color:'#9CA3AF', marginTop:2 }}>{s.label}</div>
              </div>
            ))}
          </div>

          {/* By person summary */}
          {!jobFilter && Object.keys(byPerson).length > 1 && (
            <div style={{ padding:'12px 20px', borderBottom:'1px solid #F3F4F6' }}>
              <div style={{ fontSize:11, fontWeight:700, color:'#9CA3AF', textTransform:'uppercase', letterSpacing:'.06em', marginBottom:10 }}>By person</div>
              <div style={{ display:'flex', flexWrap:'wrap', gap:8 }}>
                {Object.entries(byPerson).sort((a,b)=>b[1]-a[1]).map(([name,mins]) => (
                  <div key={name} style={{ padding:'6px 12px', background:'#F9FAFB', borderRadius:8, border:'1px solid #E8ECF0', fontSize:12 }}>
                    <span style={{ fontWeight:700, color:'#2A3042' }}>{name}</span>
                    <span style={{ color:'#9CA3AF', marginLeft:8 }}>{fmtDecimalHours(mins)}h</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Entry table */}
          <div style={{ overflowX:'auto' }}>
            <table style={{ width:'100%', borderCollapse:'collapse', fontSize:13 }}>
              <thead>
                <tr style={{ background:'#F9FAFB' }}>
                  {['Date', 'Job', 'Person', 'Clock in', 'Clock out', 'Duration'].map(h => (
                    <th key={h} style={{ padding:'10px 16px', textAlign:'left', fontSize:11, fontWeight:700, color:'#9CA3AF', textTransform:'uppercase', letterSpacing:'.05em', borderBottom:'1px solid #E8ECF0', whiteSpace:'nowrap' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {entries.map((e, i) => (
                  <tr key={e.id} style={{ background:i%2===0?'#fff':'#FAFAFA' }}>
                    <td style={{ padding:'10px 16px', color:'#374151', borderBottom:'1px solid #F3F4F6', whiteSpace:'nowrap' }}>{fmtDate(e.clocked_in_at)}</td>
                    <td style={{ padding:'10px 16px', borderBottom:'1px solid #F3F4F6' }}>
                      <span style={{ fontSize:13, fontWeight:600, color:'#2A3042' }}>
                        {e.jobs?.job_number && <span style={{ color:'#9CA3AF', marginRight:4 }}>#{e.jobs.job_number}</span>}
                        {e.jobs?.name || '—'}
                      </span>
                    </td>
                    <td style={{ padding:'10px 16px', borderBottom:'1px solid #F3F4F6' }}>
                      <div style={{ display:'flex', alignItems:'center', gap:7 }}>
                        <div style={{ width:26, height:26, borderRadius:'50%', background:'#EEF2FF', display:'flex', alignItems:'center', justifyContent:'center', fontSize:10, fontWeight:700, color:'#5B8AF0', flexShrink:0 }}>
                          {(e.profiles?.full_name||'?')[0].toUpperCase()}
                        </div>
                        <span style={{ color:'#374151' }}>{e.profiles?.full_name || e.profiles?.email || '—'}</span>
                      </div>
                    </td>
                    <td style={{ padding:'10px 16px', color:'#374151', borderBottom:'1px solid #F3F4F6', whiteSpace:'nowrap' }}>{fmtTime(e.clocked_in_at)}</td>
                    <td style={{ padding:'10px 16px', color:'#374151', borderBottom:'1px solid #F3F4F6', whiteSpace:'nowrap' }}>{fmtTime(e.clocked_out_at)}</td>
                    <td style={{ padding:'10px 16px', borderBottom:'1px solid #F3F4F6', whiteSpace:'nowrap' }}>
                      <span style={{ fontSize:13, fontWeight:700, color:'#2A3042' }}>{fmtDuration(safeDuration(e))}</span>
                      <span style={{ fontSize:11, color:'#9CA3AF', marginLeft:4 }}>({fmtDecimalHours(safeDuration(e))}h)</span>
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr style={{ background:'#F3F4F6' }}>
                  <td colSpan={5} style={{ padding:'10px 16px', fontSize:12, fontWeight:700, color:'#6B7280', textAlign:'right' }}>Total</td>
                  <td style={{ padding:'10px 16px', fontSize:13, fontWeight:800, color:'#2A3042' }}>{fmtDuration(totalMins)} ({fmtDecimalHours(totalMins)}h)</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </>
      )}
    </ReportCard>
  )
}

// ── Feedback job modal ─────────────────────────────────────────────
function FeedbackJobModal({ job, userFilter, dateFrom, dateTo, onClose }) {
  const [feedback, setFeedback] = useState([])
  const [loading, setLoading]   = useState(true)
  const toast = useToast()

  useEffect(() => {
    let q = supabase.from('job_feedback')
      .select('*, profiles(id,full_name,email)')
      .eq('job_id', job.id)
      .order('created_at', { ascending: false })
    if (userFilter) q = q.eq('user_id', userFilter)
    if (dateFrom)   q = q.gte('created_at', dateFrom)
    if (dateTo)     q = q.lte('created_at', dateTo + 'T23:59:59')
    q.then(({ data, error }) => { if (!error) setFeedback(data||[]); setLoading(false) })
  }, [job.id, userFilter, dateFrom, dateTo])

  const open     = feedback.filter(f=>f.status==='Open').length
  const resolved = feedback.filter(f=>f.status==='Resolved'||f.status==='Closed').length
  const major    = feedback.filter(f=>f.severity==='Major').length

  function handleCSV() {
    const rows = [
      ['Date','Severity','Category','Status','Message','Notes','Reported by'],
      ...feedback.map(f=>[fmtDate(f.created_at),f.severity||'',f.category||'',f.status||'',f.message||'',f.notes||'',f.profiles?.full_name||f.profiles?.email||''])
    ]
    downloadCSV(rows, `feedback-${job.name?.replace(/\s+/g,'-')}-${new Date().toISOString().slice(0,10)}.csv`)
    toast('CSV downloaded ✓')
  }

  function handlePDF() {
    const date = new Date().toLocaleDateString('en-NZ',{day:'numeric',month:'long',year:'numeric'})
    const html = `
      <h1>Feedback Report</h1>
      <div class="sub">${job.job_number?`#${job.job_number} `:''}${job.name} · Generated ${date}</div>
      <div class="summary">
        <div class="stat"><div class="stat-num">${feedback.length}</div><div class="stat-lbl">Total</div></div>
        <div class="stat"><div class="stat-num" style="color:#E24B4A">${open}</div><div class="stat-lbl">Open</div></div>
        <div class="stat"><div class="stat-num" style="color:#1D9E75">${resolved}</div><div class="stat-lbl">Resolved</div></div>
        <div class="stat"><div class="stat-num" style="color:#EF9F27">${major}</div><div class="stat-lbl">Major</div></div>
      </div>
      <table>
        <tr><th>Date</th><th>Severity</th><th>Category</th><th>Status</th><th>Message</th><th>By</th></tr>
        ${feedback.map(f=>`<tr>
          <td style="white-space:nowrap">${fmtDate(f.created_at)}</td>
          <td><span class="badge" style="background:${SEV_COLORS[f.severity]?.bg||'#F3F4F6'};color:${SEV_COLORS[f.severity]?.color||'#6B7280'}">${f.severity||'—'}</span></td>
          <td>${f.category||'—'}</td>
          <td>${f.status||'—'}</td>
          <td>${f.message||'—'}${f.notes?`<div style="margin-top:4px;font-size:11px;color:#666;font-style:italic">✓ ${f.notes}</div>`:''}</td>
          <td>${f.profiles?.full_name||'—'}</td>
        </tr>`).join('')}
      </table>`
    downloadPDF(html, `Feedback — ${job.name}`)
    toast('PDF opened ✓')
  }

  return (
    <div style={{ position:'fixed', inset:0, zIndex:700, background:'rgba(0,0,0,0.5)', display:'flex', alignItems:'center', justifyContent:'center', padding:16 }}
      onClick={e=>e.target===e.currentTarget&&onClose()}>
      <div style={{ background:'#fff', borderRadius:16, width:'100%', maxWidth:680, maxHeight:'88vh', display:'flex', flexDirection:'column', boxShadow:'0 24px 64px rgba(0,0,0,0.22)' }}>

        {/* Modal header */}
        <div style={{ padding:'16px 20px', borderBottom:'1px solid #F3F4F6', display:'flex', alignItems:'center', justifyContent:'space-between', flexShrink:0 }}>
          <div>
            <div style={{ fontSize:16, fontWeight:800, color:'#2A3042' }}>
              {job.job_number && <span style={{ color:'#9CA3AF', marginRight:6 }}>#{job.job_number}</span>}
              {job.name}
            </div>
            <div style={{ fontSize:12, color:'#9CA3AF', marginTop:2 }}>Feedback report</div>
          </div>
          <div style={{ display:'flex', gap:6, alignItems:'center' }}>
            <button onClick={handleCSV} style={{ fontSize:12, fontWeight:600, padding:'5px 10px', borderRadius:7, border:'1px solid #E8ECF0', background:'#F9FAFB', cursor:'pointer', color:'#374151', display:'flex', alignItems:'center', gap:4 }}
              onMouseEnter={e=>e.currentTarget.style.background='#F0FDF4'} onMouseLeave={e=>e.currentTarget.style.background='#F9FAFB'}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
              CSV
            </button>
            <button onClick={handlePDF} style={{ fontSize:12, fontWeight:600, padding:'5px 10px', borderRadius:7, border:'none', background:'#5B8AF0', color:'#fff', cursor:'pointer', display:'flex', alignItems:'center', gap:4 }}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
              PDF
            </button>
            <button onClick={onClose} style={{ background:'none', border:'none', cursor:'pointer', color:'#9CA3AF', fontSize:22, lineHeight:1, padding:'0 2px', marginLeft:4 }}>×</button>
          </div>
        </div>

        {/* Stats */}
        {!loading && feedback.length > 0 && (
          <div style={{ display:'flex', borderBottom:'1px solid #F3F4F6', flexShrink:0 }}>
            {[{label:'Total',value:feedback.length,color:'#2A3042'},{label:'Open',value:open,color:'#E24B4A'},{label:'Resolved',value:resolved,color:'#1D9E75'},{label:'Major',value:major,color:'#EF9F27'}].map((s,i)=>(
              <div key={i} style={{ flex:1, padding:'12px 0', textAlign:'center', borderRight:'1px solid #F3F4F6' }}>
                <div style={{ fontSize:20, fontWeight:800, color:s.color }}>{s.value}</div>
                <div style={{ fontSize:11, color:'#9CA3AF', marginTop:1 }}>{s.label}</div>
              </div>
            ))}
          </div>
        )}

        {/* Feedback list */}
        <div style={{ flex:1, overflowY:'auto', padding:'12px 16px' }}>
          {loading ? (
            <div style={{ display:'flex', justifyContent:'center', padding:'40px 0' }}><div className="spinner" /></div>
          ) : feedback.length === 0 ? (
            <div style={{ textAlign:'center', padding:'40px 0', color:'#9CA3AF', fontSize:13 }}>No feedback for this job{userFilter?' from selected user':''}</div>
          ) : feedback.map(fb => {
            const sv = SEV_COLORS[fb.severity] || SEV_COLORS.Minor
            return (
              <div key={fb.id} style={{ borderRadius:10, border:`1px solid ${sv.dot}33`, overflow:'hidden', marginBottom:8 }}>
                <div style={{ height:3, background:sv.dot }} />
                <div style={{ padding:'10px 14px' }}>
                  <div style={{ display:'flex', alignItems:'center', gap:7, marginBottom:6, flexWrap:'wrap' }}>
                    <span style={{ fontSize:11, fontWeight:700, padding:'2px 8px', borderRadius:20, background:sv.bg, color:sv.color }}>{fb.severity}</span>
                    <span style={{ fontSize:12, fontWeight:600, color:'#374151' }}>{fb.category}</span>
                    <span style={{ fontSize:11, padding:'2px 8px', borderRadius:20,
                      background:fb.status==='Resolved'?'#DCFCE7':fb.status==='Open'?'#FEF2F2':'#F3F4F6',
                      color:fb.status==='Resolved'?'#166534':fb.status==='Open'?'#991B1B':'#6B7280',
                      fontWeight:600 }}>{fb.status}</span>
                    <span style={{ fontSize:11, color:'#9CA3AF', marginLeft:'auto' }}>{fmtDate(fb.created_at)}</span>
                  </div>
                  <div style={{ fontSize:13, color:'#374151', lineHeight:1.6 }}>{fb.message}</div>
                  {fb.notes && (
                    <div style={{ marginTop:7, padding:'6px 10px', background:'#F0FDF4', borderRadius:7, borderLeft:'3px solid #1D9E75', fontSize:12, color:'#374151' }}>
                      <span style={{ fontWeight:600 }}>Resolution: </span>{fb.notes}
                    </div>
                  )}
                  {fb.profiles?.full_name && (
                    <div style={{ fontSize:11, color:'#9CA3AF', marginTop:5 }}>Reported by {fb.profiles.full_name}</div>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

// ── Feedback Report — job tiles ────────────────────────────────────
function FeedbackReport({ dateFrom, dateTo }) {
  const [allFeedback, setAllFeedback] = useState([])
  const [users, setUsers]             = useState([])
  const [userFilter, setUserFilter]   = useState('')
  const [loading, setLoading]         = useState(true)
  const [activeJob, setActiveJob]     = useState(null)  // job object for modal
  const toast = useToast()

  useEffect(() => {
    let q = supabase.from('job_feedback')
      .select('*, profiles(id,full_name,email), jobs(id,name,job_number,status)')
      .order('created_at', { ascending: false })
    if (dateFrom) q = q.gte('created_at', dateFrom)
    if (dateTo)   q = q.lte('created_at', dateTo + 'T23:59:59')
    q.then(({ data, error }) => {
      if (!error) {
        setAllFeedback(data||[])
        // Build unique users list from feedback
        const seen = {}, us = []
        ;(data||[]).forEach(f => {
          if (f.profiles?.id && !seen[f.profiles.id]) {
            seen[f.profiles.id] = true
            us.push({ id: f.user_id, name: f.profiles.full_name || f.profiles.email || 'Unknown' })
          }
        })
        setUsers(us)
      }
      setLoading(false)
    })
  }, [dateFrom, dateTo])

  // Filter by user
  const filtered = userFilter ? allFeedback.filter(f=>f.user_id===userFilter) : allFeedback

  // Group by job
  const byJob = {}
  filtered.forEach(f => {
    const jid = f.job_id
    if (!byJob[jid]) byJob[jid] = { job: f.jobs, items: [] }
    byJob[jid].items.push(f)
  })

  const jobGroups = Object.values(byJob).sort((a,b) => {
    // Sort by open issues desc, then total desc
    const aOpen = a.items.filter(f=>f.status==='Open').length
    const bOpen = b.items.filter(f=>f.status==='Open').length
    return bOpen - aOpen || b.items.length - a.items.length
  })

  // Total stats
  const totalOpen  = filtered.filter(f=>f.status==='Open').length
  const totalMajor = filtered.filter(f=>f.severity==='Major').length

  function handleCSVAll() {
    const rows = [
      ['Date','Job','Severity','Category','Status','Message','Notes','Reported by'],
      ...filtered.map(f=>[fmtDate(f.created_at),f.jobs?.job_number?`#${f.jobs.job_number} ${f.jobs.name}`:(f.jobs?.name||''),f.severity||'',f.category||'',f.status||'',f.message||'',f.notes||'',f.profiles?.full_name||f.profiles?.email||''])
    ]
    downloadCSV(rows, `feedback-all-${new Date().toISOString().slice(0,10)}.csv`)
    toast('CSV downloaded ✓')
  }

  function handlePDFAll() {
    const date = new Date().toLocaleDateString('en-NZ',{day:'numeric',month:'long',year:'numeric'})
    const html = `
      <h1>Job Feedback Report</h1>
      <div class="sub">All jobs · Generated ${date}</div>
      <div class="summary">
        <div class="stat"><div class="stat-num">${filtered.length}</div><div class="stat-lbl">Total</div></div>
        <div class="stat"><div class="stat-num" style="color:#E24B4A">${totalOpen}</div><div class="stat-lbl">Open</div></div>
        <div class="stat"><div class="stat-num" style="color:#EF9F27">${totalMajor}</div><div class="stat-lbl">Major</div></div>
        <div class="stat"><div class="stat-num">${jobGroups.length}</div><div class="stat-lbl">Jobs</div></div>
      </div>
      ${jobGroups.map(({job,items})=>`
        <div class="section-title">${job?.job_number?`#${job.job_number} `:''}${job?.name||'Unknown job'}</div>
        <table>
          <tr><th>Date</th><th>Severity</th><th>Category</th><th>Status</th><th>Message</th><th>By</th></tr>
          ${items.map(f=>`<tr>
            <td style="white-space:nowrap">${fmtDate(f.created_at)}</td>
            <td><span class="badge" style="background:${SEV_COLORS[f.severity]?.bg||'#F3F4F6'};color:${SEV_COLORS[f.severity]?.color||'#6B7280'}">${f.severity||'—'}</span></td>
            <td>${f.category||'—'}</td><td>${f.status||'—'}</td>
            <td>${f.message||'—'}${f.notes?`<div style="margin-top:4px;font-size:11px;color:#666">✓ ${f.notes}</div>`:''}</td>
            <td>${f.profiles?.full_name||'—'}</td>
          </tr>`).join('')}
        </table>`).join('')}`
    downloadPDF(html, 'Feedback Report — All Jobs')
    toast('PDF opened ✓')
  }

  return (
    <ReportCard title="Job Feedback" icon="💬" description="Click any job tile to view its feedback report"
      onDownloadCSV={handleCSVAll} onDownloadPDF={handlePDFAll} onPrint={()=>window.print()} loading={loading}>

      {/* User filter + stats */}
      {!loading && (
        <div style={{ padding:'12px 20px', borderBottom:'1px solid #F3F4F6', display:'flex', alignItems:'center', gap:12, flexWrap:'wrap' }}>
          {/* User filter */}
          <div style={{ display:'flex', alignItems:'center', gap:8 }}>
            <label style={{ fontSize:12, fontWeight:600, color:'#6B7280', whiteSpace:'nowrap' }}>Filter by user</label>
            <select value={userFilter} onChange={e=>setUserFilter(e.target.value)}
              style={{ padding:'5px 10px', border:'1px solid #DDE3EC', borderRadius:7, fontSize:12, outline:'none', background:'#fff' }}>
              <option value="">All users</option>
              {users.map(u=><option key={u.id} value={u.id}>{u.name}</option>)}
            </select>
          </div>
          {/* Quick stats */}
          <div style={{ display:'flex', gap:12, marginLeft:'auto', flexWrap:'wrap' }}>
            {[{label:'Total',v:filtered.length,c:'#2A3042'},{label:'Open',v:totalOpen,c:'#E24B4A'},{label:'Major',v:totalMajor,c:'#EF9F27'},{label:'Jobs',v:jobGroups.length,c:'#5B8AF0'}].map((s,i)=>(
              <div key={i} style={{ textAlign:'center' }}>
                <div style={{ fontSize:18, fontWeight:800, color:s.c }}>{s.v}</div>
                <div style={{ fontSize:10, color:'#9CA3AF' }}>{s.label}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Job tiles grid */}
      {!loading && (
        jobGroups.length === 0 ? (
          <div style={{ padding:'40px 20px', textAlign:'center', color:'#9CA3AF', fontSize:13 }}>No feedback found</div>
        ) : (
          <div style={{ padding:'16px', display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(200px,1fr))', gap:12 }}>
            {jobGroups.map(({ job, items }) => {
              const open    = items.filter(f=>f.status==='Open').length
              const major   = items.filter(f=>f.severity==='Major').length
              const moderate= items.filter(f=>f.severity==='Moderate').length
              const hasOpen = open > 0
              const hasMajor= major > 0
              // Severity colour for tile accent
              const accent = hasMajor ? '#E24B4A' : open > 0 ? '#EF9F27' : '#1D9E75'
              return (
                <div key={job?.id} onClick={()=>setActiveJob(job)}
                  style={{ background:'#fff', borderRadius:12, border:`1px solid ${accent}33`, overflow:'hidden', cursor:'pointer', transition:'all .15s' }}
                  onMouseEnter={e=>{e.currentTarget.style.boxShadow=`0 6px 20px ${accent}22`;e.currentTarget.style.transform='translateY(-2px)'}}
                  onMouseLeave={e=>{e.currentTarget.style.boxShadow='none';e.currentTarget.style.transform='none'}}>
                  {/* Colour bar */}
                  <div style={{ height:4, background:accent }} />
                  <div style={{ padding:'12px 14px' }}>
                    <div style={{ fontSize:13, fontWeight:700, color:'#2A3042', marginBottom:2, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                      {job?.job_number && <span style={{ color:'#9CA3AF', marginRight:4, fontSize:11 }}>#{job.job_number}</span>}
                      {job?.name || 'Unknown job'}
                    </div>
                    {/* Severity breakdown */}
                    <div style={{ display:'flex', gap:5, marginTop:8, flexWrap:'wrap' }}>
                      {major > 0 && <span style={{ fontSize:10, fontWeight:700, padding:'2px 7px', borderRadius:20, background:'#FEF2F2', color:'#E24B4A' }}>{major} Major</span>}
                      {moderate > 0 && <span style={{ fontSize:10, fontWeight:700, padding:'2px 7px', borderRadius:20, background:'#FEF9C3', color:'#854D0E' }}>{moderate} Mod</span>}
                      {open > 0
                        ? <span style={{ fontSize:10, fontWeight:700, padding:'2px 7px', borderRadius:20, background:'#FEF2F2', color:'#991B1B' }}>{open} Open</span>
                        : <span style={{ fontSize:10, fontWeight:700, padding:'2px 7px', borderRadius:20, background:'#DCFCE7', color:'#166534' }}>✓ All resolved</span>
                      }
                    </div>
                    <div style={{ fontSize:11, color:'#9CA3AF', marginTop:8 }}>{items.length} item{items.length!==1?'s':''} total</div>
                  </div>
                </div>
              )
            })}
          </div>
        )
      )}

      {/* Job detail modal */}
      {activeJob && (
        <FeedbackJobModal
          job={activeJob}
          userFilter={userFilter}
          dateFrom={dateFrom}
          dateTo={dateTo}
          onClose={()=>setActiveJob(null)}
        />
      )}
    </ReportCard>
  )
}

// ── Main Reports screen ────────────────────────────────────────────
export default function Reports() {
  const [active, setActive]       = useState(null)  // null | 'time' | 'feedback'
  const [jobs, setJobs]           = useState([])
  const [jobFilter, setJobFilter] = useState('')
  const [dateFrom, setDateFrom]   = useState('')
  const [dateTo, setDateTo]       = useState('')

  useEffect(() => {
    if (!document.getElementById('report-print-style')) {
      const s = document.createElement('style')
      s.id = 'report-print-style'
      s.textContent = PRINT_STYLE
      document.head.appendChild(s)
    }
    supabase.from('jobs').select('id,name,job_number').order('name').then(({data})=>setJobs(data||[]))
  }, [])

  // ── Report tile definitions ──────────────────────────────────────
  const REPORT_TILES = [
    {
      id:          'time',
      icon:        '⏱',
      label:       'Time Tracking',
      description: 'Clock-in sessions by job and team member',
      color:       '#5B8AF0',
      bg:          '#EEF2FF',
    },
    {
      id:          'feedback',
      icon:        '💬',
      label:       'Job Feedback',
      description: 'Issues and feedback across all jobs',
      color:       '#E24B4A',
      bg:          '#FEF2F2',
    },
  ]

  // ── Landing — report tiles ───────────────────────────────────────
  if (!active) {
    return (
      <div style={{ maxWidth:960, margin:'0 auto', paddingBottom:40 }}>
        <div style={{ marginBottom:28 }}>
          <h1 style={{ fontSize:20, fontWeight:800, color:'#2A3042', margin:'0 0 4px' }}>Reports</h1>
          <p style={{ fontSize:13, color:'#9CA3AF', margin:0 }}>Select a report to view, filter and export</p>
        </div>

        <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(220px,1fr))', gap:16 }}>
          {REPORT_TILES.map(tile => (
            <div key={tile.id} onClick={()=>setActive(tile.id)}
              style={{ background:'#fff', borderRadius:16, border:'1px solid #E8ECF0', padding:24, cursor:'pointer',
                boxShadow:'0 1px 4px rgba(0,0,0,0.05)', transition:'all .15s' }}
              onMouseEnter={e=>{e.currentTarget.style.boxShadow='0 8px 24px rgba(0,0,0,0.1)';e.currentTarget.style.transform='translateY(-3px)';e.currentTarget.style.borderColor=tile.color+'66'}}
              onMouseLeave={e=>{e.currentTarget.style.boxShadow='0 1px 4px rgba(0,0,0,0.05)';e.currentTarget.style.transform='none';e.currentTarget.style.borderColor='#E8ECF0'}}>
              {/* Icon */}
              <div style={{ width:52, height:52, borderRadius:14, background:tile.bg, display:'flex', alignItems:'center', justifyContent:'center', fontSize:26, marginBottom:16 }}>
                {tile.icon}
              </div>
              <div style={{ fontSize:16, fontWeight:800, color:'#2A3042', marginBottom:6 }}>{tile.label}</div>
              <div style={{ fontSize:13, color:'#9CA3AF', lineHeight:1.5, marginBottom:16 }}>{tile.description}</div>
              <div style={{ display:'flex', alignItems:'center', gap:4, fontSize:12, fontWeight:700, color:tile.color }}>
                View report
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="9 18 15 12 9 6"/></svg>
              </div>
            </div>
          ))}
        </div>
      </div>
    )
  }

  // ── Report view (back to landing on back button) ─────────────────
  const tile = REPORT_TILES.find(t=>t.id===active)

  return (
    <div style={{ maxWidth:960, margin:'0 auto', paddingBottom:40 }}>
      {/* Back + title */}
      <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:22 }}>
        <button onClick={()=>setActive(null)}
          style={{ background:'none', border:'none', cursor:'pointer', color:'#6B7280', display:'flex', alignItems:'center', gap:4, fontSize:13, fontWeight:600, padding:0 }}
          onMouseEnter={e=>e.currentTarget.style.color='#2A3042'} onMouseLeave={e=>e.currentTarget.style.color='#6B7280'}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="15 18 9 12 15 6"/></svg>
          Reports
        </button>
        <span style={{ color:'#D1D5DB' }}>›</span>
        <div style={{ display:'flex', alignItems:'center', gap:8 }}>
          <div style={{ width:30, height:30, borderRadius:9, background:tile.bg, display:'flex', alignItems:'center', justifyContent:'center', fontSize:16 }}>{tile.icon}</div>
          <span style={{ fontSize:16, fontWeight:800, color:'#2A3042' }}>{tile.label}</span>
        </div>
      </div>

      {/* Filters */}
      {active === 'time' && (
        <FilterBar jobs={jobs} jobFilter={jobFilter} setJobFilter={setJobFilter}
          dateFrom={dateFrom} setDateFrom={setDateFrom} dateTo={dateTo} setDateTo={setDateTo} />
      )}
      {active === 'feedback' && (
        <div className="no-print" style={{ display:'flex', gap:10, alignItems:'flex-end', marginBottom:16 }}>
          <div>
            <label style={{ fontSize:11, fontWeight:600, color:'#6B7280', display:'block', marginBottom:4 }}>From</label>
            <input type="date" value={dateFrom} onChange={e=>setDateFrom(e.target.value)}
              style={{ padding:'6px 10px', border:'1px solid #DDE3EC', borderRadius:8, fontSize:13, outline:'none' }} />
          </div>
          <div>
            <label style={{ fontSize:11, fontWeight:600, color:'#6B7280', display:'block', marginBottom:4 }}>To</label>
            <input type="date" value={dateTo} onChange={e=>setDateTo(e.target.value)}
              style={{ padding:'6px 10px', border:'1px solid #DDE3EC', borderRadius:8, fontSize:13, outline:'none' }} />
          </div>
          {(dateFrom||dateTo) && (
            <button onClick={()=>{setDateFrom('');setDateTo('')}}
              style={{ padding:'6px 12px', border:'1px solid #E8ECF0', borderRadius:8, fontSize:12, background:'#fff', cursor:'pointer', color:'#6B7280' }}>
              Clear
            </button>
          )}
        </div>
      )}

      {/* Report content */}
      {active === 'time'     && <TimeReport     jobs={jobs} jobFilter={jobFilter} dateFrom={dateFrom} dateTo={dateTo} />}
      {active === 'feedback' && <FeedbackReport dateFrom={dateFrom} dateTo={dateTo} />}
    </div>
  )
}
