import { useState, useEffect, useRef } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { supabase, pubUrl } from '../lib/supabase'
import { useToast } from '../components/Toast'

const COLOURS = ['#2A3042','#E24B4A','#F97316','#EAB308','#1D9E75','#3B82F6','#8B5CF6']
const TOOLS = ['pen','highlight','arrow','text','eraser']

export default function PdfMarkup() {
  const { attachmentId, id: jobId } = useParams()
  const navigate = useNavigate()
  const toast    = useToast()

  // Canvas refs
  const pdfCanvasRef  = useRef()
  const drawCanvasRef = useRef()
  const wrapRef       = useRef()

  // PDF state (all refs — zero re-renders during draw)
  const pdfDocRef   = useRef(null)
  const annotRef    = useRef({})
  const drawingRef  = useRef(false)
  const strokeRef   = useRef([])
  const toolRef     = useRef('pen')
  const colourRef   = useRef('#E24B4A')
  const sizeRef     = useRef(3)
  const pageRef     = useRef(1)
  const scaleRef    = useRef(1)

  // Pinch zoom
  const pinchRef        = useRef(null)  // { dist, scale }
  const isPinchingRef   = useRef(false)

  // React state (UI only)
  const [att, setAtt]           = useState(null)
  const [loading, setLoading]   = useState(true)
  const [totalPages, setTotal]  = useState(1)
  const [page, setPageState]    = useState(1)
  const [scale, setScaleState]  = useState(1)
  const [tool, setTool]         = useState('pen')
  const [colour, setColour]     = useState('#E24B4A')
  const [size, setSize]         = useState(3)
  const [textPos, setTextPos]   = useState(null)
  const [textDraft, setTextDraft] = useState('')
  const textInputRef = useRef()
  const [saving, setSaving]     = useState(false)
  const [noteText, setNoteText] = useState('')
  const [showNotes, setShowNotes] = useState(false)
  const [noteId, setNoteId]     = useState(null)
  const firstRender = useRef(true)

  function setPage(n)  { pageRef.current = n; setPageState(n) }
  function setScale(n) { scaleRef.current = n; setScaleState(n) }
  function pickTool(t) { toolRef.current = t; setTool(t) }
  function pickColour(c) { colourRef.current = c; setColour(c) }
  function pickSize(s) { sizeRef.current = s; setSize(s) }

  // ── Load PDF.js ───────────────────────────────────────────────
  useEffect(() => {
    if (window.pdfjsLib) return
    const s = document.createElement('script')
    s.src = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js'
    s.onload = () => { window.pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js' }
    document.head.appendChild(s)
    return () => document.head.contains(s) && document.head.removeChild(s)
  }, [])

  // ── Load attachment ───────────────────────────────────────────
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

  // ── Load PDF when att ready ───────────────────────────────────
  useEffect(() => {
    if (!att) return
    const tryLoad = () => {
      if (!window.pdfjsLib) { setTimeout(tryLoad, 150); return }
      window.pdfjsLib.getDocument(pubUrl(att.storage_path)).promise
        .then(pdf => { pdfDocRef.current = pdf; setTotal(pdf.numPages); renderPage(1, null) })
        .catch(() => toast('Could not load PDF', 'error'))
    }
    tryLoad()
  }, [att])

  // Re-render on page/scale change (not first load)
  useEffect(() => {
    if (firstRender.current) { firstRender.current = false; return }
    if (pdfDocRef.current) renderPage(page, scale)
  }, [page, scale])

  // ── Render PDF page ───────────────────────────────────────────
  async function renderPage(pg, sc) {
    if (!pdfDocRef.current) return
    const pdfPage = await pdfDocRef.current.getPage(pg)
    const dpr = window.devicePixelRatio || 1

    if (sc === null) {
      const raw = pdfPage.getViewport({ scale: 1 })
      const avail = (wrapRef.current ? wrapRef.current.clientWidth : window.innerWidth) - 40
      sc = Math.max(0.3, Math.min(4, avail / raw.width))
      scaleRef.current = sc
      setScaleState(sc)
    }

    const vp = pdfPage.getViewport({ scale: sc * dpr })
    const pc = pdfCanvasRef.current
    const dc = drawCanvasRef.current
    if (!pc || !dc) return

    pc.width = vp.width;  pc.height = vp.height
    pc.style.width  = vp.width  / dpr + 'px'
    pc.style.height = vp.height / dpr + 'px'
    dc.width = vp.width;  dc.height = vp.height
    dc.style.width  = pc.style.width
    dc.style.height = pc.style.height

    const ctx = pc.getContext('2d')
    ctx.fillStyle = '#fff'
    ctx.fillRect(0, 0, pc.width, pc.height)
    await pdfPage.render({ canvasContext: ctx, viewport: vp }).promise
    redraw()
    bindTouchEvents()
  }

  // ── Redraw annotations ────────────────────────────────────────
  function redraw(extra) {
    const dc = drawCanvasRef.current; if (!dc) return
    const ctx = dc.getContext('2d')
    ctx.clearRect(0, 0, dc.width, dc.height)
    const strokes = annotRef.current[pageRef.current] || []
    strokes.forEach(s => paint(ctx, s))
    if (extra) paint(ctx, extra)
  }

  function paint(ctx, s) {
    if (!s?.points?.length) return
    const dpr = window.devicePixelRatio || 1
    const r = scaleRef.current * dpr
    ctx.save()
    if (s.tool === 'text') {
      ctx.font = `${s.size * 5 * r}px -apple-system, sans-serif`
      ctx.fillStyle = s.colour
      ctx.fillText(s.text || '', s.points[0].x * r, s.points[0].y * r)
      ctx.restore(); return
    }
    if (s.tool === 'eraser')         ctx.globalCompositeOperation = 'destination-out'
    else if (s.tool === 'highlight') { ctx.globalAlpha = 0.35 }
    if (s.tool === 'arrow') {
      if (s.points.length < 2) { ctx.restore(); return }
      const p1 = s.points[0], p2 = s.points[s.points.length - 1]
      ctx.strokeStyle = ctx.fillStyle = s.colour
      ctx.lineWidth = s.size * r; ctx.lineCap = 'round'
      ctx.beginPath(); ctx.moveTo(p1.x*r, p1.y*r); ctx.lineTo(p2.x*r, p2.y*r); ctx.stroke()
      const a = Math.atan2(p2.y - p1.y, p2.x - p1.x), hw = s.size * r * 5
      ctx.beginPath(); ctx.moveTo(p2.x*r, p2.y*r)
      ctx.lineTo(p2.x*r - hw*Math.cos(a-.4), p2.y*r - hw*Math.sin(a-.4))
      ctx.lineTo(p2.x*r - hw*Math.cos(a+.4), p2.y*r - hw*Math.sin(a+.4))
      ctx.closePath(); ctx.fill(); ctx.restore(); return
    }
    ctx.strokeStyle = s.tool === 'eraser' ? '#000' : s.colour
    ctx.lineWidth   = s.tool === 'highlight' ? s.size * r * 7 : s.size * r
    ctx.lineCap = 'round'; ctx.lineJoin = 'round'
    ctx.beginPath()
    s.points.forEach((p, i) => i === 0 ? ctx.moveTo(p.x*r, p.y*r) : ctx.lineTo(p.x*r, p.y*r))
    ctx.stroke(); ctx.restore()
  }

  // ── Coordinate helper ─────────────────────────────────────────
  function getPos(e) {
    const dc = drawCanvasRef.current
    const rect = dc.getBoundingClientRect()
    const ce = e.touches ? e.touches[0] : e
    return {
      x: (ce.clientX - rect.left) / scaleRef.current,
      y: (ce.clientY - rect.top)  / scaleRef.current
    }
  }

  // ── Touch events — attached after PDF renders so refs are valid ────────
  const touchBound = useRef(false)
  function bindTouchEvents() {
    const dc = drawCanvasRef.current
    if (!dc || touchBound.current) return
    touchBound.current = true

    function onTouchStart(e) {
      if (e.touches.length === 2) {
        isPinchingRef.current = true
        drawingRef.current = false
        strokeRef.current = []
        const dx = e.touches[0].clientX - e.touches[1].clientX
        const dy = e.touches[0].clientY - e.touches[1].clientY
        pinchRef.current = { dist: Math.hypot(dx, dy), scale: scaleRef.current }
        e.preventDefault()
        return
      }
      if (e.touches.length === 1 && !isPinchingRef.current && toolRef.current !== 'text') {
        e.preventDefault()
        drawingRef.current = true
        strokeRef.current = [getPos(e)]
      }
    }

    function onTouchMove(e) {
      if (isPinchingRef.current && e.touches.length >= 2 && pinchRef.current) {
        e.preventDefault()
        const dx = e.touches[0].clientX - e.touches[1].clientX
        const dy = e.touches[0].clientY - e.touches[1].clientY
        const newDist = Math.hypot(dx, dy)
        const newScale = Math.max(0.3, Math.min(5, pinchRef.current.scale * (newDist / pinchRef.current.dist)))
        scaleRef.current = newScale
        setScaleState(newScale)
        return
      }
      if (drawingRef.current && e.touches.length === 1) {
        e.preventDefault()
        strokeRef.current.push(getPos(e))
        redraw({ tool: toolRef.current, colour: colourRef.current, size: sizeRef.current, points: [...strokeRef.current] })
      }
    }

    function onTouchEnd(e) {
      if (isPinchingRef.current) {
        if (e.touches.length < 2) {
          isPinchingRef.current = false
          pinchRef.current = null
          if (pdfDocRef.current) renderPage(pageRef.current, scaleRef.current)
        }
        return
      }
      if (!drawingRef.current) return
      drawingRef.current = false
      if (!strokeRef.current.length) return
      let pts = [...strokeRef.current]
      if (toolRef.current === 'arrow' && pts.length === 1) pts.push({ x: pts[0].x + 2, y: pts[0].y + 2 })
      const stroke = { tool: toolRef.current, colour: colourRef.current, size: sizeRef.current, points: pts }
      const pg = pageRef.current
      annotRef.current = { ...annotRef.current, [pg]: [...(annotRef.current[pg] || []), stroke] }
      strokeRef.current = []
      redraw()
    }

    dc.addEventListener('touchstart', onTouchStart, { passive: false })
    dc.addEventListener('touchmove',  onTouchMove,  { passive: false })
    dc.addEventListener('touchend',   onTouchEnd,   { passive: false })
  }

  // ── Mouse handlers (desktop) ──────────────────────────────────
  function onMouseDown(e) {
    if (toolRef.current === 'text') return
    drawingRef.current = true
    strokeRef.current = [getPos(e)]
  }
  function onMouseMove(e) {
    if (!drawingRef.current) return
    strokeRef.current.push(getPos(e))
    redraw({ tool: toolRef.current, colour: colourRef.current, size: sizeRef.current, points: [...strokeRef.current] })
  }
  function onMouseUp(e) {
    if (!drawingRef.current) return
    drawingRef.current = false
    if (!strokeRef.current.length) return
    let pts = [...strokeRef.current]
    if (toolRef.current === 'arrow' && pts.length === 1) pts.push({ x: pts[0].x + 2, y: pts[0].y + 2 })
    const stroke = { tool: toolRef.current, colour: colourRef.current, size: sizeRef.current, points: pts }
    const pg = pageRef.current
    annotRef.current = { ...annotRef.current, [pg]: [...(annotRef.current[pg] || []), stroke] }
    strokeRef.current = []
    redraw()
  }
  function onCanvasClick(e) {
    if (toolRef.current !== 'text') return
    setTextPos(getPos(e))
    setTextDraft('')
    setTimeout(() => textInputRef.current?.focus(), 30)
  }
  function commitText() {
    if (textDraft.trim() && textPos) {
      const pg = pageRef.current
      const stroke = { tool:'text', colour:colourRef.current, size:sizeRef.current, points:[textPos], text:textDraft }
      annotRef.current = { ...annotRef.current, [pg]: [...(annotRef.current[pg]||[]), stroke] }
      redraw()
    }
    setTextPos(null); setTextDraft('')
  }

  function undo() {
    const pg = pageRef.current
    const arr = annotRef.current[pg] || []
    if (!arr.length) return
    annotRef.current = { ...annotRef.current, [pg]: arr.slice(0, -1) }
    redraw()
  }
  function clearAll() {
    if (!confirm('Clear all annotations on this page?')) return
    annotRef.current = { ...annotRef.current, [pageRef.current]: [] }
    redraw()
  }

  async function save() {
    setSaving(true)
    try {
      await supabase.from('attachments').update({
        annotations: JSON.stringify(annotRef.current),
        annotated_at: new Date().toISOString()
      }).eq('id', attachmentId)
      if (noteText.trim()) {
        const blocks  = noteText.split('\n').map(l => ({ id: Math.random().toString(36).slice(2), type:'paragraph', content:l }))
        const content = JSON.stringify({ blocks })
        const uid = (await supabase.auth.getUser()).data.user?.id
        if (noteId) {
          await supabase.from('notes').update({ content, updated_at: new Date().toISOString() }).eq('id', noteId)
        } else {
          const { data } = await supabase.from('notes').insert({ job_id:jobId, title:`PDF note: ${att?.name}`, content, is_public:true, created_by:uid }).select('id').single()
          if (data) setNoteId(data.id)
        }
      }
      toast('✓ Markup saved')
    } catch(e) { toast('Save failed: ' + e.message, 'error') }
    setSaving(false)
  }

  if (loading) return (
    <div style={{ display:'flex', alignItems:'center', justifyContent:'center', height:'100vh', background:'#F3F4F6', flexDirection:'column', gap:12, color:'#9CA3AF', fontSize:14 }}>
      <div className="spinner" />Loading PDF…
    </div>
  )

  const tb = (active) => ({
    padding:'6px 12px', borderRadius:8, border:'none', cursor:'pointer', fontSize:12, fontWeight:600,
    background: active ? '#2A3042' : '#F3F4F6', color: active ? '#fff' : '#6B7280',
    WebkitTapHighlightColor:'transparent',
  })

  return (
    <div style={{ display:'flex', flexDirection:'column', height:'100vh', background:'#F3F4F6', overflow:'hidden' }}>

      {/* Toolbar */}
      <div style={{ background:'#fff', borderBottom:'1px solid #E8ECF0', padding:'8px 12px', display:'flex', alignItems:'center', gap:6, flexWrap:'wrap', flexShrink:0 }}>
        <button onClick={() => navigate(-1)} style={{ ...tb(false), display:'flex', alignItems:'center', gap:4 }}>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="15 18 9 12 15 6"/></svg>Back
        </button>
        <div style={{ width:1, height:20, background:'#E8ECF0' }} />
        <span style={{ fontSize:13, fontWeight:600, color:'#2A3042', maxWidth:160, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{att?.name}</span>
        <div style={{ flex:1 }} />

        {/* Tools */}
        {TOOLS.map(t => <button key={t} onClick={() => pickTool(t)} style={tb(tool===t)}>{t.charAt(0).toUpperCase()+t.slice(1)}</button>)}
        <div style={{ width:1, height:20, background:'#E8ECF0' }} />

        {/* Colours */}
        {COLOURS.map(col => (
          <button key={col} onClick={() => pickColour(col)}
            style={{ width:22, height:22, borderRadius:'50%', background:col, border:'none', cursor:'pointer', padding:0,
              outline: colour===col ? '3px solid #5B8AF0' : '2px solid transparent',
              outlineOffset: 2, WebkitTapHighlightColor:'transparent' }} />
        ))}
        <div style={{ width:1, height:20, background:'#E8ECF0' }} />

        {/* Sizes */}
        {[1,3,6,12].map(s => (
          <button key={s} onClick={() => pickSize(s)}
            style={{ width:26, height:26, borderRadius:6, border: size===s?'2px solid #5B8AF0':'2px solid #E8ECF0',
              background:size===s?'#EEF2FF':'#F9FAFB', cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', WebkitTapHighlightColor:'transparent' }}>
            <div style={{ width:Math.min(s+2,16), height:Math.min(s+2,16), borderRadius:'50%', background:size===s?'#5B8AF0':'#9CA3AF' }} />
          </button>
        ))}
        <div style={{ width:1, height:20, background:'#E8ECF0' }} />

        <button onClick={undo} style={tb(false)}>↩ Undo</button>
        <button onClick={clearAll} style={tb(false)}>Clear</button>
        <button onClick={() => setShowNotes(s=>!s)} style={tb(showNotes)}>Notes</button>
        <button onClick={save} disabled={saving} style={{ ...tb(false), background:'#5B8AF0', color:'#fff', fontWeight:700 }}>{saving?'Saving…':'Save'}</button>
      </div>

      {/* Page nav + zoom */}
      <div style={{ background:'#fff', borderBottom:'1px solid #F3F4F6', padding:'5px 14px', display:'flex', alignItems:'center', gap:10, flexShrink:0 }}>
        {totalPages > 1 && <>
          <button onClick={() => setPage(Math.max(1,page-1))} disabled={page===1} style={{ background:'none', border:'none', cursor:'pointer', color:page===1?'#D1D5DB':'#374151', fontSize:18, padding:'0 4px' }}>‹</button>
          <span style={{ fontSize:12, color:'#6B7280' }}>{page} / {totalPages}</span>
          <button onClick={() => setPage(Math.min(totalPages,page+1))} disabled={page===totalPages} style={{ background:'none', border:'none', cursor:'pointer', color:page===totalPages?'#D1D5DB':'#374151', fontSize:18, padding:'0 4px' }}>›</button>
          <div style={{ width:1, height:16, background:'#E8ECF0' }} />
        </>}
        <button onClick={() => setScale(Math.max(0.3,+(scale-0.1).toFixed(2)))} style={{ background:'none', border:'none', cursor:'pointer', fontSize:18, color:'#374151', padding:'0 4px' }}>−</button>
        <span style={{ fontSize:12, color:'#6B7280', minWidth:38, textAlign:'center' }}>{Math.round(scale*100)}%</span>
        <button onClick={() => setScale(Math.min(5,+(scale+0.1).toFixed(2)))} style={{ background:'none', border:'none', cursor:'pointer', fontSize:18, color:'#374151', padding:'0 4px' }}>+</button>
        <button onClick={() => renderPage(page,null)} style={{ fontSize:11, color:'#9CA3AF', background:'none', border:'none', cursor:'pointer' }}>Fit</button>
        <span style={{ marginLeft:'auto', fontSize:11, color:'#9CA3AF' }}>
          {tool==='text'?'Tap to place text':'Use two fingers to zoom · Apple Pencil to draw'}
        </span>
      </div>

      {/* Canvas + notes */}
      <div style={{ flex:1, display:'flex', overflow:'hidden' }}>
        <div ref={wrapRef} style={{ flex:1, overflow:'auto', display:'flex', justifyContent:'center', alignItems:'flex-start', padding:20, background:'#D1D5DB' }}>
          <div style={{ position:'relative', boxShadow:'0 4px 32px rgba(0,0,0,0.25)', borderRadius:2, background:'#fff', flexShrink:0, display:'inline-block' }}>
            <canvas ref={pdfCanvasRef} style={{ display:'block' }} />
            <canvas ref={drawCanvasRef}
              style={{ position:'absolute', top:0, left:0,
                cursor: tool==='text'?'text':tool==='eraser'?'cell':'crosshair',
                touchAction:'none',
                WebkitTapHighlightColor:'transparent' }}
              onMouseDown={onMouseDown}
              onMouseMove={onMouseMove}
              onMouseUp={onMouseUp}
              onMouseLeave={() => { if(drawingRef.current) onMouseUp() }}
              onClick={onCanvasClick}
            />
            {/* Text input */}
            {textPos && (
              <div style={{ position:'absolute', left: textPos.x * scale, top: textPos.y * scale, zIndex:20 }}>
                <input ref={textInputRef} value={textDraft} onChange={e=>setTextDraft(e.target.value)}
                  onKeyDown={e=>{ if(e.key==='Enter'){e.preventDefault();commitText()} if(e.key==='Escape'){setTextPos(null);setTextDraft('')} }}
                  onBlur={commitText}
                  placeholder="Type then Enter…"
                  style={{ fontSize:size*5, color:colour, background:'rgba(255,255,255,0.95)', border:'2px solid '+colour,
                    borderRadius:4, padding:'2px 8px', outline:'none', minWidth:100,
                    fontFamily:'-apple-system,sans-serif', boxShadow:'0 2px 12px rgba(0,0,0,0.18)' }} />
              </div>
            )}
          </div>
        </div>

        {showNotes && (
          <div style={{ width:260, background:'#fff', borderLeft:'1px solid #E8ECF0', display:'flex', flexDirection:'column', flexShrink:0 }}>
            <div style={{ padding:'12px 14px', borderBottom:'1px solid #F3F4F6', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
              <span style={{ fontSize:13, fontWeight:700, color:'#2A3042' }}>Notes</span>
              <button onClick={()=>setShowNotes(false)} style={{ background:'none', border:'none', cursor:'pointer', color:'#9CA3AF', fontSize:18, lineHeight:1 }}>×</button>
            </div>
            <div style={{ padding:12, flex:1, display:'flex', flexDirection:'column', gap:8 }}>
              <div style={{ fontSize:11, color:'#9CA3AF', lineHeight:1.5 }}>Saved to job on Save</div>
              <textarea value={noteText} onChange={e=>setNoteText(e.target.value)}
                placeholder="Observations, measurements, actions…"
                style={{ flex:1, minHeight:200, padding:'8px 10px', border:'1px solid #E8ECF0', borderRadius:8, fontSize:13, outline:'none', resize:'none', fontFamily:'inherit', lineHeight:1.7 }} />
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
