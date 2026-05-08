import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useToast } from '../components/Toast'

const STATUS_STYLE = {
  Draft:     { bg:'#F3F4F6', color:'#6B7280' },
  Submitted: { bg:'#DCFCE7', color:'#166534' },
  Approved:  { bg:'#DBEAFE', color:'#1E40AF' },
}

export default function SpecList() {
  const navigate  = useNavigate()
  const toast     = useToast()
  const [specs, setSpecs]     = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    supabase.from('specs').select('*,jobs(id,name,job_number,client)')
      .order('updated_at', { ascending:false })
      .then(({ data, error }) => { if (!error) setSpecs(data||[]); setLoading(false) })
  }, [])

  async function deleteSpec(e, id, title) {
    e.stopPropagation()
    if (!confirm(`Delete "${title}"?`)) return
    await supabase.from('specs').delete().eq('id', id)
    setSpecs(p => p.filter(s=>s.id!==id))
    toast('Deleted')
  }

  if (loading) return <div style={{ display:'flex', justifyContent:'center', padding:'60px 0' }}><div className="spinner" /></div>

  // Group specs: those with a job first (grouped by job), then unlinked
  const withJob    = specs.filter(s=>s.job_id)
  const withoutJob = specs.filter(s=>!s.job_id)

  // Unique jobs in order they appear
  const jobIds = [...new Set(withJob.map(s=>s.job_id))]

  function SpecRow({ spec }) {
    const rooms = typeof spec.rooms==='string' ? JSON.parse(spec.rooms||'[]') : (spec.rooms||[])
    const matCount = rooms.reduce((s,r)=>s+(r.materials||[]).length,0)
    const appCount = rooms.reduce((s,r)=>s+(r.appliances||[]).length,0)
    const ss = STATUS_STYLE[spec.status] || STATUS_STYLE.Draft
    return (
      <div onClick={()=>navigate(`/spec-builder/${spec.id}`)}
        style={{ display:'flex', alignItems:'center', gap:12, padding:'12px 16px', background:'#fff', borderRadius:10, border:'1px solid #E8ECF0', cursor:'pointer', transition:'all .12s' }}
        onMouseEnter={e=>{e.currentTarget.style.boxShadow='0 4px 16px rgba(0,0,0,0.08)';e.currentTarget.style.borderColor='#C4D4F8'}}
        onMouseLeave={e=>{e.currentTarget.style.boxShadow='none';e.currentTarget.style.borderColor='#E8ECF0'}}>
        <div style={{ width:36,height:36,borderRadius:9,background:'#EEF2FF',display:'flex',alignItems:'center',justifyContent:'center',fontSize:18,flexShrink:0 }}>📋</div>
        <div style={{ flex:1,minWidth:0 }}>
          <div style={{ fontSize:14,fontWeight:700,color:'#2A3042' }}>{spec.title||'Untitled spec'}</div>
          <div style={{ fontSize:12,color:'#9CA3AF',marginTop:2,display:'flex',gap:8,flexWrap:'wrap' }}>
            <span>{rooms.length} room{rooms.length!==1?'s':''}</span>
            {matCount>0&&<span>{matCount} material{matCount!==1?'s':''}</span>}
            {appCount>0&&<span>{appCount} appliance{appCount!==1?'s':''}</span>}
            {spec.updated_at&&<span>{new Date(spec.updated_at).toLocaleDateString('en-NZ',{day:'numeric',month:'short'})}</span>}
          </div>
        </div>
        <span style={{ fontSize:11,fontWeight:700,padding:'3px 10px',borderRadius:20,background:ss.bg,color:ss.color,flexShrink:0 }}>{spec.status||'Draft'}</span>
        <button onClick={e=>deleteSpec(e,spec.id,spec.title)}
          style={{ background:'none',border:'none',cursor:'pointer',color:'#D1D5DB',fontSize:16,flexShrink:0 }}
          onMouseEnter={e=>e.currentTarget.style.color='#E24B4A'} onMouseLeave={e=>e.currentTarget.style.color='#D1D5DB'}>×</button>
      </div>
    )
  }

  function JobGroup({ jobId }) {
    const jobSpecs = withJob.filter(s=>s.job_id===jobId)
    const job = jobSpecs[0]?.jobs
    const jobLabel = job ? [job.job_number?`#${job.job_number}`:'', job.name?.replace(/^.+?[—–-]{1,2}\s*/,'')||job.name].filter(Boolean).join(' ') : jobId
    return (
      <div style={{ marginBottom:20 }}>
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:8 }}>
          <div style={{ display:'flex', alignItems:'center', gap:8 }}>
            <a href={`/job/${jobId}`} onClick={e=>e.stopPropagation()} style={{ fontSize:14,fontWeight:700,color:'#2A3042',textDecoration:'none' }}
              onMouseEnter={e=>e.currentTarget.style.color='#5B8AF0'} onMouseLeave={e=>e.currentTarget.style.color='#2A3042'}>
              {jobLabel}
            </a>
            <span style={{ fontSize:11,color:'#9CA3AF' }}>{jobSpecs.length} spec{jobSpecs.length!==1?'s':''}</span>
          </div>
          <button onClick={()=>navigate('/spec-builder/new')}
            style={{ fontSize:12,fontWeight:600,padding:'4px 10px',borderRadius:7,border:'1px solid #C4D4F8',background:'#EEF2FF',color:'#3730A3',cursor:'pointer' }}>
            + Add spec
          </button>
        </div>
        <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
          {jobSpecs.map(s=><SpecRow key={s.id} spec={s} />)}
        </div>
      </div>
    )
  }

  return (
    <div style={{ maxWidth:860, margin:'0 auto' }}>
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:24 }}>
        <div>
          <h1 style={{ fontSize:20,fontWeight:800,color:'#2A3042',margin:0 }}>Spec Builder</h1>
          <p style={{ fontSize:13,color:'#9CA3AF',margin:'4px 0 0' }}>Build and submit specifications for client spaces</p>
        </div>
        <button onClick={()=>navigate('/spec-builder/new')}
          style={{ fontSize:13,fontWeight:700,padding:'9px 18px',borderRadius:9,border:'none',background:'#5B8AF0',color:'#fff',cursor:'pointer',display:'flex',alignItems:'center',gap:6,boxShadow:'0 2px 8px rgba(91,138,240,0.3)' }}>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
          New spec
        </button>
      </div>

      {specs.length === 0 ? (
        <div style={{ background:'#fff',borderRadius:16,border:'1px solid #E8ECF0',padding:'60px 24px',textAlign:'center' }}>
          <div style={{ fontSize:40,marginBottom:16 }}>📋</div>
          <div style={{ fontSize:16,fontWeight:700,color:'#2A3042',marginBottom:6 }}>No specs yet</div>
          <div style={{ fontSize:13,color:'#9CA3AF',marginBottom:24 }}>Create specs to compile materials and appliances for each space</div>
          <button onClick={()=>navigate('/spec-builder/new')} style={{ fontSize:13,fontWeight:700,padding:'9px 18px',borderRadius:9,border:'none',background:'#5B8AF0',color:'#fff',cursor:'pointer' }}>+ Create first spec</button>
        </div>
      ) : (
        <div>
          {/* Grouped by job */}
          {jobIds.map(jobId => <JobGroup key={jobId} jobId={jobId} />)}

          {/* Unlinked specs */}
          {withoutJob.length > 0 && (
            <div>
              <div style={{ fontSize:13,fontWeight:700,color:'#9CA3AF',marginBottom:8,display:'flex',alignItems:'center',gap:8 }}>
                Unlinked specs
                <span style={{ fontSize:11,fontWeight:400 }}>— not yet linked to a job</span>
              </div>
              <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
                {withoutJob.map(s=><SpecRow key={s.id} spec={s} />)}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
