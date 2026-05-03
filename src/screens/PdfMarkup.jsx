import { useState, useEffect, useRef } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { supabase, pubUrl } from '../lib/supabase'
import { useToast } from '../components/Toast'

const COLOURS = ['#2A3042','#E24B4A','#F97316','#EAB308','#1D9E75','#3B82F6','#8B5CF6']
const TOOLS = [
  { id:'pen',       label:'Pen' },
  { id:'highlight', label:'Highlight' },
  { id:'arrow',     label:'Arrow' },
  { id:'text',      label:'Text' },
  { id:'eraser',    label:'Eraser' },
]

export default function PdfMarkup() {
  const { attachmentId, id: jobId } = useParams()
  const navigate = useNavigate()
  const toast    = useToast()

  const pdfCanvasRef = useRef()
  const drawCanvasRef = useRef()
  const wrapRef = useRef()

  const pdfDocRef    = useRef(null)
  const annotRef     = useRef({})   // page -> strokes (logical coords)
  const drawingRef   = useRef(false)
  const strokeRef    = useRef([])
  const toolRef      = useRef('pen')
  const colourRef    = useRef('#E24B4A')
  const sizeRef      = useRef(3)
  const pageRef      = useRef(1)
  const scaleRef     = useRef(1)

  const [att, setAtt]         = useState(null)
  const [loading, setLoading] = useState(true)
  const [totalPages, setTotal] = useState(1)
  const [page, setPageState]  = useState(1)
  const [scale, setScaleState] = useState(1)
  const [tool, setTool]       = useState('pen')
  const [colour, setColour]   = useState('#E24B4A')
  const [size, setSize]       = useState(3)
  const [textPos, setTextPos] = useState(null)
  const [textDraft, setTextDraft] = useState('')
  const textRef = useRef()
  const [saving, setSaving]   = useState(false)
  const [noteText, setNoteText] = useState('')
  const [showNotes, setShowNotes] = useState(false)
  const [noteId, setNoteId]   = useState(null)

  function setPage(n) { pageRef.current = n; setPageState(n) }
  function setScale(n) { scaleRef.current = n; setScaleState(n) }
  function syncTool(t) { toolRef.current = t; setTool(t) }
  function syncColour(c) { colourRef.current = c; setColour(c) }
  function syncSize(s) { sizeRef.current = s; setSize(s) }

  // Load PDF.js
  useEffect(() => {
    if (window.pdfjsLib) return
    const s = document.createElement('script')
    s.src = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js'
    s.onload = () => { window.pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js' }
    document.head.appendChild(s)
    return () => document.head.contains(s) && document.head.removeChild(s)
  }, [])

  // Load attachment
  useEffect(() => {
    supabase.from('attachments').select('*').eq('id', attachmentId).single()
      .then(({ data: a }) => {
        if (!a) { toast('File not found', 'error'); navigate(-1); return }
        setAtt(a)
        if (a.annotations) { try { annotRef.current = JSON.parse(a.annotations) } catch {} }
        setLoading(false)
      })
    supabase.from('notes').select('id,content').eq('job_id', jobId).like('title', 'PDF note:%').maybeSingle()
      .then(({ data: n }) => {
        if (!n) return
        setNoteId(n.id)
        try {
          const b = (typeof n.content === 'string' ? JSON.parse(n.content) : n.content)?.blocks || []
          setNoteText(b.map(x => x.content || '').join('\n'))
        } catch {}
      })
  }, [attachmentId])

  // Load PDF once att is ready
  useEffect(() => {
    if (!att) return
    function tryLoad() {
      if (!window.pdfjsLib) { setTimeout(tryLoad, 150); return }
      window.pdfjsLib.getDocument(pubUrl(att.storage_path)).promise
        .then(pdf => {
          pdfDocRef.current = pdf
          setTotal(pdf.numPages)
          renderPage(1, null) // null = auto-fit
        })
        .catch(() => toast('Could not load PDF', 'error'))
    }
    tryLoad()
  }, [att])

  // Re-render when page or scale changes (but NOT on first load — renderPage handles that)
  const firstRender = useRef(true)
  useEffect(() => {
    if (firstRender.current) { firstRender.current = false; return }
    if (pdfDocRef.current) renderPage(page, scale)
  }, [page, scale])

  async function renderPage(pg, sc) {
    if (!pdfDocRef.current) return
    const pdfPage = await pdfDocRef.current.getPage(pg)
    const dpr = window.devicePixelRatio || 1

    // Auto-fit: calculate CSS scale so page fills available width
    if (sc === null) {
      const raw = pdfPage.getViewport({ scale: 1 })
      const wrap = wrapRef.current
      const avail = wrap ? wrap.clientWidth - 40 : window.innerWidth - 40
      sc = Math.max(0.4, Math.min(3, avail / raw.width))
      scaleRef.current = sc
      setScaleState(sc)
    }

    // Render at DPR * scale for crisp retina/iPad display
    const vp = pdfPage.getViewport({ scale: sc * dpr })
    const pc = pdfCanvasRef.current
    const dc = drawCanvasRef.current
    if (!pc || !dc) return

    // Canvas buffer = full DPR resolution
    pc.width  = vp.width
    pc.height = vp.height
    // CSS display size = logical pixels (no DPR)
    pc.style.width  = (vp.width  / dpr) + 'px'
    pc.style.height = (vp.height / dpr) + 'px'

    const ctx = pc.getContext('2d')
    ctx.fillStyle = '#fff'
    ctx.fillRect(0, 0, pc.width, pc.height)
    await pdfPage.render({ canvasContext: ctx, viewport: vp }).promise

    // Draw canvas same physical size, same CSS display size
    dc.width  = vp.width
    dc.height = vp.height
    dc.style.width  = pc.style.width
    dc.style.height = pc.style.height

    redraw(pg, sc)
  }

  function redraw(pg, sc) {
    const dc = drawCanvasRef.current; if (!dc) return
    const ctx = dc.getContext('2d')
    ctx.clearRect(0, 0, dc.width, dc.height)
    const strokes = annotRef.current[pg ?? pageRef.current] || []
    const s = sc ?? scaleRef.current
    strokes.forEach(st => paint(ctx, st, s))
  }

  function paint(ctx, s, sc) {
    if (!s?.points?.length) return
    const dpr = window.devicePixelRatio || 1
    const r = sc * dpr  // canvas resolution scale
    ctx.save()
    if (s.tool === 'text') {
      ctx.font = `${s.size * 5 * r}px -apple-system, sans-serif`
      ctx.fillStyle = s.colour
      ctx.fillText(s.text || '', s.points[0].x * r, s.points[0].y * r)
      ctx.restore(); return
    }
    if (s.tool === 'eraser') ctx.globalCompositeOperation = 'destination-out'
    else if (s.tool === 'highlight') { ctx.globalAlpha = 0.35; ctx.globalCompositeOperation = 'source-over' }
    if (s.tool === 'arrow') {
      if (s.points.length < 2) { ctx.restore(); return }
      const [p1, p2] = [s.points[0], s.points[s.points.length - 1]]
      ctx.strokeStyle = ctx.fillStyle = s.colour
      ctx.lineWidth = s.size * r; ctx.lineCap = 'round'
      ctx.beginPath(); ctx.moveTo(p1.x*r, p1.y*r); ctx.lineTo(p2.x*r, p2.y*r); ctx.stroke()
      const a = Math.atan2(p2.y - p1.y, p2.x - p1.x), hw = s.size * r * 4
      ctx.beginPath(); ctx.moveTo(p2.x*r, p2.y*r)
      ctx.lineTo(p2.x*r - hw*Math.cos(a-.45), p2.y*r - hw*Math.sin(a-.45))
      ctx.lineTo(p2.x*r - hw*Math.cos(a+.45), p2.y*r - hw*Math.sin(a+.45))
      ctx.closePath(); ctx.fill(); ctx.restore(); return
    }
    ctx.strokeStyle = s.tool === 'eraser' ? '#000' : s.colour
    ctx.lineWidth   = s.tool === 'highlight' ? s.size * r * 8 : s.size * r
    ctx.lineCap = 'round'; ctx.lineJoin = 'round'
    ctx.beginPath()
    s.points.forEach((p, i) => i === 0 ? ctx.moveTo(p.x*r, p.y*r) : ctx.lineTo(p.x*r, p.y*r))
    ctx.stroke(); ctx.restore()
  }

  function getPos(e) {
    const dc = drawCanvasRef.current
    const rect = dc.getBoundingClientRect()
    const sc = scaleRef.current
    const ce = e.touches ? e.touches[0] : e
    // rect is CSS pixels; divide by sc to get logical PDF coords
    return {
      x: (ce.clientX - rect.left) / sc,
      y: (ce.clientY - rect.top)  / sc
    }
  }

  function onDown(e) {
    if (toolRef.current === 'text') return
    e.preventDefault()
    drawingRef.current = true
    strokeRef.current = [getPos(e)]
  }
  function onMove(e) {
    if (!drawingRef.current) return
    e.preventDefault()
    strokeRef.current.push(getPos(e))
    const sc = scaleRef.current
    const dc = drawCanvasRef.current; if (!dc) return
    const ctx = dc.getContext('2d')
    ctx.clearRect(0, 0, dc.width, dc.height)
    const strokes = annotRef.current[pageRef.current] || []
    strokes.forEach(s => paint(ctx, s, sc))
    paint(ctx, { tool: toolRef.current, colour: colourRef.current, size: sizeRef.current, points: [...strokeRef.current] }, sc)
  }
  function onUp(e) {
    if (!drawingRef.current) return
    drawingRef.current = false
    if (!strokeRef.current.length) return
    // For arrows: ensure at least 2 points (start + end)
    let pts = [...strokeRef.current]
    if (toolRef.current === 'arrow' && pts.length === 1 && e) {
      const pos = getPos(e)
      pts.push({ x: pos.x + 1, y: pos.y + 1 }) // tiny offset so it renders
    }
    const stroke = { tool: toolRef.current, colour: colourRef.current, size: sizeRef.current, points: pts }
    const pg = pageRef.current
    annotRef.current = { ...annotRef.current, [pg]: [...(annotRef.current[pg] || []), stroke] }
    strokeRef.current = []
    redraw(pg, scaleRef.current)
  }
  function onClick(e) {
    if (toolRef.current !== 'text') return
    e.preventDefault()
    setTextPos(getPos(e))
    setTextDraft('')
    setTimeout(() => textRef.current?.focus(), 30)
  }
  function commitText() {
    if (textDraft.trim() && textPos) {
      const stroke = { tool: 'text', colour: colourRef.current, size: sizeRef.current, points: [textPos], text: textDraft }
      const pg = pageRef.current
      annotRef.current = { ...annotRef.current, [pg]: [...(annotRef.current[pg] || []), stroke] }
      redraw(pg, scaleRef.current)
    }
    setTextPos(null); setTextDraft('')
  }
  function undo() {
    const pg = pageRef.current
    const arr = annotRef.current[pg] || []
    if (!arr.length) return
    annotRef.current = { ...annotRef.current, [pg]: arr.slice(0, -1) }
    redraw(pg, scaleRef.current)
  }
  function clearAll() {
    if (!confirm('Clear all annotations on this page?')) return
    annotRef.current = { ...annotRef.current, [pageRef.current]: [] }
    redraw(pageRef.current, scaleRef.current)
  }

  async function save() {
    setSaving(true)
    try {
      await supabase.from('attachments').update({ annotations: JSON.stringify(annotRef.current), annotated_at: new Date().toISOString() }).eq('id', attachmentId)
      if (noteText.trim()) {
        const blocks  = noteText.split('\n').map(l => ({ id: Math.random().toString(36).slice(2), type: 'paragraph', content: l }))
        const content = JSON.stringify({ blocks })
        const uid = (await supabase.auth.getUser()).data.user?.id
        if (noteId) {
          await supabase.from('notes').update({ content, updated_at: new Date().toISOString() }).eq('id', noteId)
        } else {
          const { data } = await supabase.from('notes').insert({ job_id: jobId, title: `PDF note: ${att?.name}`, content, is_public: true, created_by: uid }).select('id').single()
          if (data) setNoteId(data.id)
        }
      }
      toast('✓ Markup saved')
    } catch(e) { console.error('Save failed:', e); toast('Save failed: ' + e.message, 'error') }
    setSaving(false)
  }

  if (loading) return (
    <div style={{ display:'flex', alignItems:'center', justifyContent:'center', height:'100vh', background:'#F3F4F6', flexDirection:'column', gap:12, color:'#9CA3AF', fontSize:14 }}>
      <div className="spinner" />Loading PDF…
    </div>
  )

  const toolBtnStyle = (t) => ({
    padding:'6px 12px', borderRadius:8, border:'none', cursor:'pointer', fontSize:12, fontWeight:600,
    background: tool===t ? '#2A3042' : '#F3F4F6',
    color: tool===t ? '#fff' : '#6B7280',
  })

  return (
    <div style={{ display:'flex', flexDirection:'column', height:'100vh', background:'#F3F4F6', overflow:'hidden' }}>

      {/* Toolbar */}
      <div style={{ background:'#fff', borderBottom:'1px solid #E8ECF0', padding:'8px 14px', display:'flex', alignItems:'center', gap:8, flexWrap:'wrap', flexShrink:0, zIndex:10 }}>
        <button onClick={() => navigate(-1)} style={{ display:'flex', alignItems:'center', gap:4, background:'none', border:'none', cursor:'pointer', color:'#6B7280', fontSize:13, fontWeight:600, padding:'4px 6px', borderRadius:6 }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="15 18 9 12 15 6"/></svg>Back
        </button>
        <div style={{ width:1, height:20, background:'#E8ECF0' }} />
        <span style={{ fontSize:13, fontWeight:600, color:'#2A3042', maxWidth:220, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{att?.name}</span>
        <div style={{ flex:1 }} />

        {/* Tools */}
        {TOOLS.map(t => (
          <button key={t.id} onClick={() => syncTool(t.id)} style={toolBtnStyle(t.id)}>{t.label}</button>
        ))}
        <div style={{ width:1, height:20, background:'#E8ECF0' }} />

        {/* Colours */}
        {COLOURS.map(col => (
          <button key={col} onClick={() => syncColour(col)}
            style={{ width:22, height:22, borderRadius:'50%', background:col, border: colour===col?'3px solid #5B8AF0':'2px solid transparent', cursor:'pointer', padding:0, boxShadow: colour===col?'0 0 0 2px #fff, 0 0 0 4px #5B8AF0':'none' }} />
        ))}
        <div style={{ width:1, height:20, background:'#E8ECF0' }} />

        {/* Sizes */}
        {[1,3,6,12].map(s => (
          <button key={s} onClick={() => syncSize(s)}
            style={{ width:26, height:26, borderRadius:6, border: size===s?'2px solid #5B8AF0':'2px solid #E8ECF0', background: size===s?'#EEF2FF':'#F9FAFB', cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center' }}>
            <div style={{ width:s+2, height:s+2, borderRadius:'50%', background: size===s?'#5B8AF0':'#9CA3AF' }} />
          </button>
        ))}
        <div style={{ width:1, height:20, background:'#E8ECF0' }} />

        <button onClick={undo} title="Undo" style={{ padding:'5px 10px', borderRadius:8, border:'1px solid #E8ECF0', background:'#F9FAFB', cursor:'pointer', fontSize:13, color:'#6B7280' }}>↩ Undo</button>
        <button onClick={clearAll} title="Clear page" style={{ padding:'5px 10px', borderRadius:8, border:'1px solid #E8ECF0', background:'#F9FAFB', cursor:'pointer', fontSize:13, color:'#6B7280' }}>Clear</button>
        <button onClick={() => setShowNotes(s=>!s)} style={{ padding:'5px 10px', borderRadius:8, border:`1px solid ${showNotes?'#C4D4F8':'#E8ECF0'}`, background:showNotes?'#EEF2FF':'#F9FAFB', cursor:'pointer', fontSize:13, color:showNotes?'#3730A3':'#6B7280', fontWeight:600 }}>Notes</button>
        <button onClick={save} disabled={saving} style={{ padding:'6px 18px', borderRadius:8, border:'none', background:'#5B8AF0', color:'#fff', fontWeight:700, fontSize:13, cursor:'pointer', opacity:saving?0.7:1 }}>{saving?'Saving…':'Save'}</button>
      </div>

      {/* Page nav + zoom bar */}
      <div style={{ background:'#fff', borderBottom:'1px solid #F3F4F6', padding:'5px 14px', display:'flex', alignItems:'center', gap:10, flexShrink:0 }}>
        {totalPages > 1 && <>
          <button onClick={() => setPage(Math.max(1, page-1))} disabled={page===1} style={{ background:'none', border:'none', cursor:'pointer', color: page===1?'#D1D5DB':'#374151', fontSize:16 }}>‹</button>
          <span style={{ fontSize:12, color:'#6B7280' }}>Page {page} of {totalPages}</span>
          <button onClick={() => setPage(Math.min(totalPages, page+1))} disabled={page===totalPages} style={{ background:'none', border:'none', cursor:'pointer', color: page===totalPages?'#D1D5DB':'#374151', fontSize:16 }}>›</button>
          <div style={{ width:1, height:16, background:'#E8ECF0' }} />
        </>}
        <button onClick={() => setScale(Math.max(0.3, +(scale-0.1).toFixed(2)))} style={{ background:'none', border:'none', cursor:'pointer', color:'#374151', fontSize:16, lineHeight:1 }}>−</button>
        <span style={{ fontSize:12, color:'#6B7280', minWidth:36, textAlign:'center' }}>{Math.round(scale*100)}%</span>
        <button onClick={() => setScale(Math.min(4, +(scale+0.1).toFixed(2)))} style={{ background:'none', border:'none', cursor:'pointer', color:'#374151', fontSize:16, lineHeight:1 }}>+</button>
        <button onClick={() => renderPage(page, null)} style={{ fontSize:11, color:'#9CA3AF', background:'none', border:'none', cursor:'pointer' }}>Fit</button>
        <div style={{ marginLeft:'auto', fontSize:11, color:'#9CA3AF' }}>
          {tool==='text'?'Click to place text, Enter to confirm':tool==='highlight'?'Draw over text to highlight':tool==='eraser'?'Draw to erase':'Draw on the PDF'}
        </div>
      </div>

      {/* Canvas area + notes */}
      <div style={{ flex:1, display:'flex', overflow:'hidden' }}>
        <div ref={wrapRef} style={{ flex:1, overflow:'auto', display:'flex', justifyContent:'center', alignItems:'flex-start', padding:20, background:'#E8ECF0' }}>
          <div style={{ position:'relative', boxShadow:'0 4px 24px rgba(0,0,0,0.2)', borderRadius:2, background:'#fff', flexShrink:0, display:'inline-block' }}>
            <canvas ref={pdfCanvasRef} style={{ display:'block' }} />
            <canvas ref={drawCanvasRef}
              style={{ position:'absolute', top:0, left:0, cursor: tool==='text'?'text':tool==='eraser'?'cell':'crosshair', touchAction:'none' }}
              onMouseDown={onDown} onMouseMove={onMove} onMouseUp={e=>{onUp(e)}} onMouseLeave={()=>onUp(null)}
              onTouchStart={onDown} onTouchMove={onMove} onTouchEnd={e=>{onUp(e)}}
              onClick={onClick}
            />
            {textPos && (
              <div style={{ position:'absolute', left: textPos.x * scale, top: textPos.y * scale, zIndex:20 }}>
                <input ref={textRef} value={textDraft} onChange={e=>setTextDraft(e.target.value)}
                  onKeyDown={e=>{ if(e.key==='Enter'){e.preventDefault();commitText()} if(e.key==='Escape'){setTextPos(null);setTextDraft('')} }}
                  onBlur={commitText}
                  placeholder="Type…"
                  style={{ fontSize: size*5, color:colour, background:'rgba(255,255,255,0.95)', border:'2px solid '+colour, borderRadius:4, padding:'2px 8px', outline:'none', minWidth:100, fontFamily:'-apple-system,sans-serif', boxShadow:'0 2px 8px rgba(0,0,0,0.15)' }}
                />
              </div>
            )}
          </div>
        </div>

        {showNotes && (
          <div style={{ width:260, background:'#fff', borderLeft:'1px solid #E8ECF0', display:'flex', flexDirection:'column', flexShrink:0 }}>
            <div style={{ padding:'12px 14px', borderBottom:'1px solid #F3F4F6', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
              <span style={{ fontSize:13, fontWeight:700, color:'#2A3042' }}>Notes</span>
              <button onClick={()=>setShowNotes(false)} style={{ background:'none', border:'none', cursor:'pointer', color:'#9CA3AF', fontSize:18 }}>×</button>
            </div>
            <div style={{ padding:12, flex:1, display:'flex', flexDirection:'column', gap:8 }}>
              <div style={{ fontSize:11, color:'#9CA3AF', lineHeight:1.5 }}>Saved to the job on Save</div>
              <textarea value={noteText} onChange={e=>setNoteText(e.target.value)} placeholder="Observations, measurements…"
                style={{ flex:1, minHeight:200, padding:'8px 10px', border:'1px solid #E8ECF0', borderRadius:8, fontSize:13, outline:'none', resize:'none', fontFamily:'inherit', lineHeight:1.7 }} />
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
