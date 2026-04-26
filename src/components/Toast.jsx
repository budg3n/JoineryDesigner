import { useState, useCallback, createContext, useContext } from 'react'

const ToastContext = createContext(null)

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([])

  const toast = useCallback((msg, type = 'success') => {
    const id = Date.now()
    setToasts(t => [...t, { id, msg, type }])
    setTimeout(() => setToasts(t => t.filter(x => x.id !== id)), 2800)
  }, [])

  return (
    <ToastContext.Provider value={toast}>
      {children}
      <div style={{ position:'fixed', bottom:24, left:'50%', transform:'translateX(-50%)', zIndex:999, display:'flex', flexDirection:'column', gap:8, pointerEvents:'none', alignItems:'center' }}>
        {toasts.map(t => (
          <div key={t.id} style={{
            padding:'10px 20px', borderRadius:24,
            background: t.type === 'error' ? '#991B1B' : '#2A3042',
            color:'#fff', fontSize:13, fontWeight:600,
            boxShadow:'0 4px 16px rgba(0,0,0,0.2)',
            whiteSpace:'nowrap',
            animation:'fadeIn .2s ease',
          }}>
            {t.msg}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  )
}

export function useToast() { return useContext(ToastContext) }
