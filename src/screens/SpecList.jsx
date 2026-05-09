import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useToast } from '../components/Toast'
import NewJobModal from '../components/NewJobModal'

const STATUS_STYLE = {
  Draft:     { bg:'#F3F4F6', color:'#6B7280' },
  Submitted: { bg:'#DCFCE7', color:'#166534' },
  Approved:  { bg:'#DBEAFE', color:'#1E40AF' },
}

export default function SpecList() {
  const navigate  = useNavigate()
  const toast     = useToast()
  const [jobs, setJobs]         = useState([])
  const [specs, setSpecs]       = useState([])
  const [loading, setLoading]   = useState(true)
  const [search, setSearch]     = useState('')
  const [showModal, setShowModal] = useState(false)
  const [selectedJob, setSelectedJob] = useState(null)   // job the user clicked on
  const searchRef = useRef()

  useEffect(() => {
    Promise.all([
      supabase.from('jobs').select('id,name,job_number,client,status,customers(company)').order('created_at',{ascending:false}),
      supabase.from('specs').select('id,title,status,job_id,updated_at').order('updated_at',{ascending:false}),
    ]).then(([{data:j},{data:s}]) => {
      setJobs(j||[])
      setSpecs(s||[])
      setLoading(false)
    })
  }, [])

  // Filter jobs by search
  const filtered = jobs.filter(j => {
    if (!search.trim()) return true
    const q = search.toLowerCase()
    return (
      j.name?.toLowerCase().includes(q) ||
      String(j.job_number||'').includes(q) ||
      j.client?.toLowerCase().includes(q) ||
      j.customers?.company?.toLowerCase().includes(q)
    )
  })

  function specCount(jobId) { return specs.filter(s=>s.job_id===jobId).length }

  function jobLabel(j) {
    const num  = j.job_number ? `#${j.job_number}` : ''
    const name = j.name?.replace(/^\d+\s*[-–—]\s*/,'') || j.name
    return [num, name].filter(Boolean).join(' ')
  }

  function clientLabel(j) {
    return j.customers?.company || j.client || ''
  }

  const STATUS_DOT = {
    'Pending':     '#9CA3AF',
    'In progress': '#5B8AF0',
    'Complete':    '#1D9E75',
    'On hold':     '#E24B4A',
    'Review':      '#EF9F27',
  }

  async function deleteSpec(e, id, title) {
    e.stopPropagation()
    if (!confirm(`Delete "${title}"?`)) return
    await supabase.from('specs').delete().eq('id', id)
    setSpecs(p => p.filter(s=>s.id!==id))
    toast('Deleted')
  }

  async function addSpecToJob(job) {
    const { data } = await supabase.from('specs').insert({
      title: `${jobLabel(job)} spec`, status:'Draft', rooms:'[]',
      job_id: job.id, updated_at: new Date().toISOString(),
    }).select().single()
    if (data) {
      setSpecs(p=>[data,...p])
      navigate(`/job/${job.id}?tab=specs`)
    }
  }

  if (loading) return <div style={{ display:'flex', justifyContent:'center', padding:'60px 0' }}><div className="spinner" /></div>

  return (
    <div style={{ maxWidth:780, margin:'0 auto' }}>
      {/* Header */}
      <div style={{ marginBottom:24 }}>
        <h1 style={{ fontSize:20, fontWeight:800, color:'#2A3042', margin:'0 0 4px' }}>Spec Builder</h1>
        <p style={{ fontSize:13, color:'#9CA3AF', margin:0 }}>Search for a job to build or view its specs</p>
      </div>

      {/* Search + create */}
      <div style={{ display:'flex', gap:10, marginBottom:20 }}>
        <div style={{ flex:1, position:'relative' }}>
          <svg style={{ position:'absolute', left:12, top:'50%', transform:'translateY(-50%)', pointerEvents:'none' }}
            width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#9CA3AF" strokeWidth="2">
            <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
          </svg>
          <input ref={searchRef} autoFocus value={search} onChange={e=>setSearch(e.target.value)}
            placeholder="Search by job number, name or client…"
            style={{ width:'100%', padding:'10px 12px 10px 36px', border:'1px solid #DDE3EC', borderRadius:10,
              fontSize:13, outline:'none', boxSizing:'border-box', background:'#fff',
              boxShadow:'0 1px 4px rgba(0,0,0,0.05)' }}
            onFocus={e=>e.target.style.borderColor='#5B8AF0'}
            onBlur={e=>e.target.style.borderColor='#DDE3EC'} />
          {search && (
            <button onClick={()=>setSearch('')} style={{ position:'absolute', right:10, top:'50%', transform:'translateY(-50%)',
              background:'none', border:'none', cursor:'pointer', color:'#9CA3AF', fontSize:16, lineHeight:1 }}>×</button>
          )}
        </div>
        <button onClick={()=>setShowModal(true)}
          style={{ fontSize:13, fontWeight:700, padding:'10px 18px', borderRadius:10, border:'none',
            background:'#2A3042', color:'#fff', cursor:'pointer', display:'flex', alignItems:'center', gap:6,
            whiteSpace:'nowrap', boxShadow:'0 2px 8px rgba(42,48,66,0.2)' }}>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
          New job
        </button>
      </div>

      {/* Job list */}
      {filtered.length === 0 ? (
        <div style={{ background:'#fff', borderRadius:14, border:'1px solid #E8ECF0', padding:'48px 24px', textAlign:'center' }}>
          <div style={{ fontSize:32, marginBottom:12 }}>🔍</div>
          <div style={{ fontSize:15, fontWeight:700, color:'#2A3042', marginBottom:6 }}>
            {search ? `No jobs matching "${search}"` : 'No jobs yet'}
          </div>
          <div style={{ fontSize:13, color:'#9CA3AF', marginBottom:20 }}>
            {search ? 'Try a different search or create a new job' : 'Create a job first, then you can build specs for it'}
          </div>
          <button onClick={()=>setShowModal(true)}
            style={{ fontSize:13, fontWeight:700, padding:'9px 20px', borderRadius:9, border:'none',
              background:'#5B8AF0', color:'#fff', cursor:'pointer' }}>
            + Create new job
          </button>
        </div>
      ) : (
        <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
          {filtered.map(job => {
            const jobSpecs = specs.filter(s=>s.job_id===job.id)
            const dot = STATUS_DOT[job.status] || '#9CA3AF'
            const isOpen = selectedJob?.id === job.id

            return (
              <div key={job.id} style={{ background:'#fff', borderRadius:12, border:`1px solid ${isOpen?'#C4D4F8':'#E8ECF0'}`,
                overflow:'hidden', boxShadow: isOpen?'0 4px 16px rgba(91,138,240,0.1)':'0 1px 3px rgba(0,0,0,0.04)' }}>

                {/* Job row */}
                <div onClick={()=>setSelectedJob(isOpen?null:job)}
                  style={{ display:'flex', alignItems:'center', gap:14, padding:'14px 18px', cursor:'pointer' }}
                  onMouseEnter={e=>!isOpen&&(e.currentTarget.style.background='#FAFAFA')}
                  onMouseLeave={e=>e.currentTarget.style.background='transparent'}>
                  {/* Status dot */}
                  <div style={{ width:10, height:10, borderRadius:'50%', background:dot, flexShrink:0 }} />
                  <div style={{ flex:1, minWidth:0 }}>
                    <div style={{ fontSize:14, fontWeight:700, color:'#2A3042', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                      {jobLabel(job)}
                    </div>
                    <div style={{ fontSize:12, color:'#9CA3AF', marginTop:2, display:'flex', gap:8 }}>
                      {clientLabel(job) && <span>{clientLabel(job)}</span>}
                      <span style={{ color:dot, fontWeight:600 }}>{job.status}</span>
                    </div>
                  </div>
                  {/* Spec count badge */}
                  <div style={{ fontSize:12, color:'#9CA3AF', flexShrink:0 }}>
                    {jobSpecs.length > 0
                      ? <span style={{ fontWeight:700, color:'#5B8AF0' }}>{jobSpecs.length} spec{jobSpecs.length!==1?'s':''}</span>
                      : <span>No specs</span>}
                  </div>
                  {/* Chevron */}
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#C4C9D4" strokeWidth="2"
                    style={{ flexShrink:0, transform: isOpen?'rotate(90deg)':'rotate(0)', transition:'transform .2s' }}>
                    <polyline points="9 18 15 12 9 6"/>
                  </svg>
                </div>

                {/* Expanded: specs + add spec */}
                {isOpen && (
                  <div style={{ borderTop:'1px solid #F3F4F6', background:'#FAFBFF' }}>
                    {jobSpecs.length > 0 && (
                      <div style={{ padding:'10px 18px', display:'flex', flexDirection:'column', gap:6 }}>
                        {jobSpecs.map(spec => {
                          const ss = STATUS_STYLE[spec.status] || STATUS_STYLE.Draft
                          return (
                            <div key={spec.id}
                              onClick={()=>navigate(`/job/${job.id}?tab=specs`)}
                              style={{ display:'flex', alignItems:'center', gap:10, padding:'9px 12px',
                                background:'#fff', borderRadius:9, border:'1px solid #E8ECF0', cursor:'pointer' }}
                              onMouseEnter={e=>{e.currentTarget.style.borderColor='#C4D4F8';e.currentTarget.style.background='#F8FAFF'}}
                              onMouseLeave={e=>{e.currentTarget.style.borderColor='#E8ECF0';e.currentTarget.style.background='#fff'}}>
                              <div style={{ fontSize:16, flexShrink:0 }}>📋</div>
                              <div style={{ flex:1, minWidth:0 }}>
                                <div style={{ fontSize:13, fontWeight:700, color:'#2A3042' }}>{spec.title||'Untitled spec'}</div>
                                <div style={{ fontSize:11, color:'#9CA3AF', marginTop:1 }}>
                                  {spec.updated_at&&`Updated ${new Date(spec.updated_at).toLocaleDateString('en-NZ',{day:'numeric',month:'short'})}`}
                                </div>
                              </div>
                              <span style={{ fontSize:10, fontWeight:700, padding:'2px 8px', borderRadius:20, background:ss.bg, color:ss.color, flexShrink:0 }}>
                                {spec.status||'Draft'}
                              </span>
                              <button onClick={e=>deleteSpec(e,spec.id,spec.title)}
                                style={{ background:'none', border:'none', cursor:'pointer', color:'#D1D5DB', fontSize:15, flexShrink:0, padding:'2px 4px' }}
                                onMouseEnter={e=>e.currentTarget.style.color='#E24B4A'}
                                onMouseLeave={e=>e.currentTarget.style.color='#D1D5DB'}>×</button>
                            </div>
                          )
                        })}
                      </div>
                    )}

                    {/* Add spec to this job */}
                    <div style={{ padding: jobSpecs.length>0 ? '0 18px 14px' : '14px 18px', display:'flex', gap:8 }}>
                      <button onClick={()=>addSpecToJob(job)}
                        style={{ flex:1, fontSize:12, fontWeight:700, padding:'9px 0', borderRadius:9,
                          border:'1.5px dashed #C4D4F8', background:'#F0F4FF', color:'#5B8AF0', cursor:'pointer',
                          display:'flex', alignItems:'center', justifyContent:'center', gap:5 }}
                        onMouseEnter={e=>e.currentTarget.style.background='#EEF2FF'}
                        onMouseLeave={e=>e.currentTarget.style.background='#F0F4FF'}>
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                        New spec for this job
                      </button>
                      <button onClick={()=>navigate(`/job/${job.id}?tab=specs`)}
                        style={{ fontSize:12, fontWeight:600, padding:'9px 14px', borderRadius:9,
                          border:'1px solid #E8ECF0', background:'#fff', color:'#374151', cursor:'pointer' }}
                        onMouseEnter={e=>e.currentTarget.style.background='#F3F4F6'}
                        onMouseLeave={e=>e.currentTarget.style.background='#fff'}>
                        Open job →
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* New job modal */}
      {showModal && (
        <NewJobModal
          show={true}
          onClose={()=>setShowModal(false)}
          onCreated={job => {
            setJobs(p=>[job,...p])
            setShowModal(false)
            setSelectedJob(job)
          }}
        />
      )}
    </div>
  )
}
