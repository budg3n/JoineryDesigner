import { useNavigate } from 'react-router-dom'
export default function BackButton({ to, label = 'Back' }) {
  const navigate = useNavigate()
  return (
    <button onClick={() => to ? navigate(to) : navigate(-1)}
      style={{ display:'inline-flex', alignItems:'center', gap:6, fontSize:13, color:'#6B7280', background:'none', border:'none', cursor:'pointer', padding:'0 0 16px', fontWeight:500 }}
      onMouseEnter={e=>e.currentTarget.style.color='#2A3042'} onMouseLeave={e=>e.currentTarget.style.color='#6B7280'}>
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/></svg>
      {label}
    </button>
  )
}
