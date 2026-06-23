import { useRef, useCallback } from 'react'

export function useDragColumns(cols, setCols) {
  const dragIdx = useRef(null)
  const ghost   = useRef(null)

  function reorder(from, to) {
    if (from === null || from === to || to < 0) return
    setCols(prev => {
      const next = [...prev]
      const [moved] = next.splice(from, 1)
      next.splice(to, 0, moved)
      return next
    })
  }

  // Mouse drag
  function onDragStart(idx) { dragIdx.current = idx }
  function onDragOver(e)    { e.preventDefault() }
  function onDrop(idx)      { reorder(dragIdx.current, idx); dragIdx.current = null }

  // Touch drag
  function onTouchStart(e, idx, label) {
    e.stopPropagation()
    dragIdx.current = idx

    const rect = e.currentTarget.getBoundingClientRect()
    const g = document.createElement('div')
    g.textContent = label || ''
    Object.assign(g.style, {
      position: 'fixed', zIndex: 9999, pointerEvents: 'none',
      background: '#5B8AF0', color: '#fff', fontSize: '11px', fontWeight: '700',
      padding: '6px 14px', borderRadius: '8px', whiteSpace: 'nowrap',
      opacity: '0.92', boxShadow: '0 4px 16px rgba(0,0,0,0.25)',
      top:  (e.touches[0].clientY - 20) + 'px',
      left: (e.touches[0].clientX - 40) + 'px',
    })
    document.body.appendChild(g)
    ghost.current = g
  }

  function onTouchMove(e) {
    e.preventDefault()
    const t = e.touches[0]
    if (ghost.current) {
      ghost.current.style.top  = (t.clientY - 20) + 'px'
      ghost.current.style.left = (t.clientX - 40) + 'px'
    }
    // Highlight target
    document.querySelectorAll('[data-col-idx]').forEach(el => el.style.outline = '')
    const el = document.elementFromPoint(t.clientX, t.clientY)?.closest('[data-col-idx]')
    if (el) el.style.outline = '2px solid #5B8AF0'
  }

  function onTouchEnd(e) {
    if (ghost.current) { ghost.current.remove(); ghost.current = null }
    document.querySelectorAll('[data-col-idx]').forEach(el => el.style.outline = '')
    const t = e.changedTouches[0]
    const el = document.elementFromPoint(t.clientX, t.clientY)?.closest('[data-col-idx]')
    if (el) {
      const to = parseInt(el.getAttribute('data-col-idx'), 10)
      reorder(dragIdx.current, to)
    }
    dragIdx.current = null
  }

  const getHeaderProps = useCallback((idx, label, extraStyle = {}) => ({
    'data-col-idx': idx,
    draggable: true,
    onDragStart:  ()  => onDragStart(idx),
    onDragOver:   (e) => onDragOver(e),
    onDrop:       ()  => onDrop(idx),
    onTouchStart: (e) => onTouchStart(e, idx, label),
    onTouchMove:  (e) => onTouchMove(e),
    onTouchEnd:   (e) => onTouchEnd(e),
    style: {
      cursor: 'grab', userSelect: 'none',
      touchAction: 'none', WebkitUserSelect: 'none',
      ...extraStyle,
    },
  }), [cols]) // eslint-disable-line

  return { getHeaderProps }
}
