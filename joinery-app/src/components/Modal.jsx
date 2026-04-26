import { useEffect } from 'react'

export default function Modal({ show, onClose, title, children, footer, maxWidth = 'max-w-lg' }) {
  useEffect(() => {
    if (show) document.body.style.overflow = 'hidden'
    else document.body.style.overflow = ''
    return () => { document.body.style.overflow = '' }
  }, [show])

  if (!show) return null

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/50 px-4 py-8 overflow-y-auto"
      onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className={`bg-white dark:bg-zinc-800 rounded-2xl border border-gray-100 dark:border-zinc-700 w-full ${maxWidth} shadow-xl my-auto`}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 dark:border-zinc-700">
          <h2 className="text-base font-semibold text-gray-900 dark:text-white">{title}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-2xl leading-none bg-transparent border-none cursor-pointer">×</button>
        </div>
        <div className="px-5 py-4 max-h-[70vh] overflow-y-auto">
          {children}
        </div>
        {footer && (
          <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-gray-100 dark:border-zinc-700">
            {footer}
          </div>
        )}
      </div>
    </div>
  )
}
