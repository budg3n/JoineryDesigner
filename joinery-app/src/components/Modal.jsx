import { useEffect } from 'react'

export default function Modal({ show, onClose, title, children, footer, maxWidth = 540 }) {
  useEffect(() => {
    if (show) document.body.style.overflow = 'hidden'
    else document.body.style.overflow = ''
    return () => { document.body.style.overflow = '' }
  }, [show])

  if (!show) return null

  return (
    <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.5)', zIndex:500, display:'flex', alignItems:'flex-start', justifyContent:'center', padding:'40px 16px 40px', overflowY:'auto' }}
      onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={{ background:'#fff', borderRadius:16, width:'100%', maxWidth, boxShadow:'0 20px 60px rgba(0,0,0,0.2)', marginTop:'auto', marginBottom:'auto' }}>
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'18px 22px', borderBottom:'1px solid #F3F4F6' }}>
          <h2 style={{ fontSize:16, fontWeight:700, color:'#2A3042', margin:0 }}>{title}</h2>
          <button onClick={onClose} style={{ background:'none', border:'none', cursor:'pointer', color:'#9CA3AF', fontSize:22, lineHeight:1, padding:0, display:'flex', borderRadius:6 }}
            onMouseEnter={e=>e.currentTarget.style.color='#2A3042'} onMouseLeave={e=>e.currentTarget.style.color='#9CA3AF'}>×</button>
        </div>
        <div style={{ padding:'20px 22px', maxHeight:'70vh', overflowY:'auto' }}>
          {children}
        </div>
        {footer && (
          <div style={{ display:'flex', alignItems:'center', justifyContent:'flex-end', gap:8, padding:'14px 22px', borderTop:'1px solid #F3F4F6' }}>
            {footer}
          </div>
        )}
      </div>
    </div>
  )
}
