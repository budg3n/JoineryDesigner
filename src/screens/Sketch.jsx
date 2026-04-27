import { useEffect, useRef, useState, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { supabase, BUCKET, pubUrl } from '../lib/supabase'
import { useToast } from '../components/Toast'
import BackButton from '../components/BackButton'

const SK_COLORS = ['#1a1a1a','#ffffff','#E24B4A','#378ADD','#1D9E75','#EF9F27','#7F77DD','#888780','#D4537E']
const TOOLS = [
  { id:'pen',       lbl:'Pen',           svg:'<path d="M3 21l3-3L17 7a1.4 1.4 0 00-2-2L4 18 3 21z"/><line x1="15" y1="6" x2="18" y2="9"/>' },
  { id:'pencil',    lbl:'Pencil',        svg:'<path d="M5 17l2-5L16 3a1 1 0 011 1L8 13 5 17z"/><line x1="14" y1="4" x2="18" y2="8"/>' },
  { id:'highlight', lbl:'Marker',        svg:'<rect x="5" y="4" width="8" height="14" rx="2"/><line x1="9" y1="18" x2="9" y2="21"/><line x1="5" y1="10" x2="13" y2="10"/>' },
  { id:'line',      lbl:'Line',          svg:'<line x1="3" y1="21" x2="21" y2="3"/>' },
  { id:'rect',      lbl:'Rectangle',     svg:'<rect x="3" y="5" width="18" height="14" rx="1"/>' },
  { id:'circle',    lbl:'Circle',        svg:'<circle cx="12" cy="12" r="8"/>' },
  { id:'text',      lbl:'Text',          svg:'<line x1="4" y1="6" x2="20" y2="6"/><line x1="12" y1="6" x2="12" y2="20"/>' },
  { id:'straight',  lbl:'Straight lock', svg:'<line x1="3" y1="12" x2="21" y2="12"/><polyline points="3 7 12 3 21 7"/>' },
  { id:'calibrate', lbl:'Set reference', svg:'<line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="8" x2="3" y2="16"/><line x1="21" y1="8" x2="21" y2="16"/><path d="M9 7l3-3 3 3"/>' },
  { id:'eraser',    lbl:'Eraser',        svg:'<path d="M4 18l4-4L16 6a1 1 0 011 1L9 15l-2 3H4z"/><line x1="4" y1="18" x2="20" y2="18"/>' },
]

export default function Sketch() {
  const { id, attId } = useParams()
  const navigate = useNavigate()
  const toast    = useToast()

  const cvRef   = useRef(null)
  const wrapRef = useRef(null)
  const [ctx, setCtx]       = useState(null)
  const [tool, setTool]     = useState('pen')
  const [color, setColor]   = useState('#1a1a1a')
  const [size, setSize]     = useState(2)
  const [locked, setLocked] = useState(false)
  const [fabOpen, setFabOpen] = useState(false)
  const [hist, setHist]     = useState([])
  const [scale, setScale]   = useState(20)
  const [pxMm, setPxMm]     = useState(null)
  const [calPhase, setCalPhase] = useState(0)
  const [calLine, setCalLine]   = useState({ x1:0,y1:0,x2:0,y2:0 })
  const [calSnap, setCalSnap]   = useState(null)
  const [calMm, setCalMm]       = useState('')
  const [dimOpen, setDimOpen]   = useState(false)
  const [dimW, setDimW]         = useState('600')
  const [dimH, setDimH]         = useState('400')
  const [dimShape, setDimShape] = useState('rect')
  const [saving, setSaving]     = useState(false)
  const [editAtt, setEditAtt]   = useState(null)
  const [job, setJob]           = useState(null)

  const drawRef  = useRef(false)
  const lxRef    = useRef(0); const lyRef = useRef(0)
  const sxRef    = useRef(0); const syRef = useRef(0)
  const snapRef  = useRef(null)
  const toolRef  = useRef('pen'); const colorRef = useRef('#1a1a1a')
  const sizeRef  = useRef(2); const lockedRef = useRef(false)
  const pxMmRef  = useRef(null); const scaleRef = useRef(20)
  const calRef   = useRef(0); const calSnapRef = useRef(null)
  const calLineRef = useRef({ x1:0,y1:0,x2:0,y2:0 })

  useEffect(() => { toolRef.current = tool }, [tool])
  useEffect(() => { colorRef.current = color }, [color])
  useEffect(() => { sizeRef.current = size }, [size])
  useEffect(() => { lockedRef.current = locked }, [locked])
  useEffect(() => { pxMmRef.current = pxMm }, [pxMm])
  useEffect(() => { scaleRef.current = scale }, [scale])
  useEffect(() => { calRef.current = calPhase }, [calPhase])
  useEffect(() => { calSnapRef.current = calSnap }, [calSnap])
  useEffect(() => { calLineRef.current = calLine }, [calLine])

  useEffect(() => {
    supabase.from('jobs').select('*').eq('id', id).single().then(({ data }) => setJob(data))
    if (attId) {
      supabase.from('attachments').select('*').eq('job_id', id).then(({ data }) => {
        const att = data?.[parseInt(attId)]
        if (att) setEditAtt(att)
      })
    }
  }, [id, attId])

  const initCanvas = useCallback(() => {
    const cv = cvRef.current; const wrap = wrapRef.current
    if (!cv || !wrap) return
    const w = wrap.clientWidth || 340
    cv.width = w; cv.height = 500
    const c = cv.getContext('2d')
    setCtx(c)
    if (editAtt?.storage_path) {
      const img = new Image(); img.crossOrigin = 'anonymous'
      img.onload = () => { c.fillStyle = '#fff'; c.fillRect(0,0,w,500); c.drawImage(img,0,0,w,500) }
      img.src = pubUrl(editAtt.storage_path)
    } else {
      drawGridFn(c, w, 500, scale)
    }
    cv.oncontextmenu = e => { e.preventDefault(); setFabOpen(v => !v) }
  }, [editAtt, scale])

  useEffect(() => { setTimeout(initCanvas, 60) }, [initCanvas])

  function drawGridFn(c, w, h, sc) {
    c.fillStyle = '#fff'; c.fillRect(0,0,w,h)
    c.save()
    c.strokeStyle = '#dde8f0'; c.lineWidth = 0.5
    for (let x=0;x<=w;x+=sc){c.beginPath();c.moveTo(x,0);c.lineTo(x,h);c.stroke()}
    for (let y=0;y<=h;y+=sc){c.beginPath();c.moveTo(0,y);c.lineTo(w,y);c.stroke()}
    c.strokeStyle = '#c5d8e8'; c.lineWidth = 0.8
    const big = sc*5
    for (let x=0;x<=w;x+=big){c.beginPath();c.moveTo(x,0);c.lineTo(x,h);c.stroke()}
    for (let y=0;y<=h;y+=big){c.beginPath();c.moveTo(0,y);c.lineTo(w,y);c.stroke()}
    c.restore()
  }

  function pushHist(c) {
    if (!c) return
    setHist(prev => { const n=[...prev,c.getImageData(0,0,cvRef.current.width,cvRef.current.height)]; return n.slice(-50) })
  }

  function getPos(e) {
    const cv = cvRef.current; const r = cv.getBoundingClientRect()
    const sx = cv.width/r.width; const sy = cv.height/r.height
    const src = e.touches ? e.touches[0] : e
    return { x:(src.clientX-r.left)*sx, y:(src.clientY-r.top)*sy }
  }

  function snapAngle(x,y,ox,oy) {
    const dx=x-ox,dy=y-oy,a=Math.atan2(dy,dx),s=Math.round(a/(Math.PI/4))*(Math.PI/4),d=Math.sqrt(dx*dx+dy*dy)
    return { x:ox+Math.cos(s)*d, y:oy+Math.sin(s)*d }
  }

  function snapGrid(x,y,sc) { return { x:Math.round(x/sc)*sc, y:Math.round(y/sc)*sc } }

  function dimLabel(c,x,y,t,vert) {
    c.save();c.font='10px sans-serif';c.fillStyle='#378ADD'
    if(vert){c.translate(x,y);c.rotate(-Math.PI/2);c.fillText(t,0,0)}
    else{c.fillText(t,x-c.measureText(t).width/2,y)}
    c.restore()
  }

  const onStart = useCallback(e => {
    if (e.target.closest('.fab-wrap')) return
    e.preventDefault()
    const cv = cvRef.current; if (!cv) return
    const c = cv.getContext('2d')
    let p = getPos(e)
    const t = toolRef.current; const sc = scaleRef.current
    if (calRef.current === 1) {
      drawRef.current = true; sxRef.current=p.x; syRef.current=p.y; lxRef.current=p.x; lyRef.current=p.y
      calSnapRef.current = c.getImageData(0,0,cv.width,cv.height); return
    }
    if (['line','rect','circle'].includes(t)) p = snapGrid(p.x,p.y,sc)
    drawRef.current = true; lxRef.current=p.x; lyRef.current=p.y; sxRef.current=p.x; syRef.current=p.y
    pushHist(c); snapRef.current = c.getImageData(0,0,cv.width,cv.height)
    if (t === 'text') {
      drawRef.current = false
      const txt = prompt('Enter text:'); if (!txt) return
      c.save();c.font='14px sans-serif';c.fillStyle=colorRef.current;c.fillText(txt,p.x,p.y);c.restore()
    }
  }, [])

  const onMove = useCallback(e => {
    e.preventDefault(); if (!drawRef.current) return
    const cv = cvRef.current; if (!cv) return
    const c = cv.getContext('2d')
    let p = getPos(e)
    const t = toolRef.current; const sc = scaleRef.current
    if (calRef.current === 1) {
      p = snapAngle(p.x,p.y,sxRef.current,syRef.current)
      if (calSnapRef.current) c.putImageData(calSnapRef.current,0,0)
      c.save();c.strokeStyle='#EF9F27';c.lineWidth=2;c.setLineDash([6,4]);c.lineCap='round'
      c.beginPath();c.moveTo(sxRef.current,syRef.current);c.lineTo(p.x,p.y);c.stroke();c.setLineDash([])
      const ddx=p.x-sxRef.current,ddy=p.y-syRef.current,pl=Math.sqrt(ddx*ddx+ddy*ddy).toFixed(0)
      c.font='11px sans-serif';c.fillStyle='#C07000';c.fillText(pl+'px',(sxRef.current+p.x)/2+6,(syRef.current+p.y)/2-6)
      c.restore();lxRef.current=p.x;lyRef.current=p.y;return
    }
    if (lockedRef.current && ['pen','pencil'].includes(t)) p = snapAngle(p.x,p.y,sxRef.current,syRef.current)
    if (['line','rect','circle'].includes(t)) p = snapGrid(p.x,p.y,sc)
    const pm = pxMmRef.current
    if (['line','rect','circle'].includes(t)) {
      if (snapRef.current) c.putImageData(snapRef.current,0,0)
      c.save();c.strokeStyle=colorRef.current;c.lineWidth=sizeRef.current;c.lineCap='round'
      const sx=sxRef.current,sy=syRef.current
      if (t==='line'){c.beginPath();c.moveTo(sx,sy);c.lineTo(p.x,p.y);c.stroke();if(pm){const d=Math.sqrt((p.x-sx)**2+(p.y-sy)**2);dimLabel(c,(sx+p.x)/2,(sy+p.y)/2-8,Math.round(d/pm)+'mm')}}
      else if(t==='rect'){c.strokeRect(sx,sy,p.x-sx,p.y-sy);if(pm){dimLabel(c,(sx+p.x)/2,Math.min(sy,p.y)-6,Math.round(Math.abs(p.x-sx)/pm)+'mm');dimLabel(c,Math.max(sx,p.x)+4,(sy+p.y)/2,Math.round(Math.abs(p.y-sy)/pm)+'mm',true)}}
      else if(t==='circle'){const r=Math.sqrt((p.x-sx)**2+(p.y-sy)**2);c.beginPath();c.arc(sx,sy,r,0,Math.PI*2);c.stroke();if(pm)dimLabel(c,sx,sy-r-8,'Ø'+Math.round(r*2/pm)+'mm')}
      c.restore()
    } else {
      c.save();c.lineCap='round';c.lineJoin='round'
      if(t==='eraser'){c.globalCompositeOperation='destination-out';c.strokeStyle='rgba(0,0,0,1)';c.lineWidth=sizeRef.current;c.beginPath();c.moveTo(lxRef.current,lyRef.current);c.lineTo(p.x,p.y);c.stroke();c.globalCompositeOperation='source-over'}
      else if(t==='highlight'){c.globalAlpha=0.35;c.globalCompositeOperation='multiply';c.strokeStyle=colorRef.current;c.lineWidth=sizeRef.current;c.beginPath();c.moveTo(lxRef.current,lyRef.current);c.lineTo(p.x,p.y);c.stroke()}
      else if(t==='pencil'){c.globalAlpha=0.75;c.strokeStyle=colorRef.current;c.lineWidth=Math.max(1,sizeRef.current*0.7);c.beginPath();c.moveTo(lxRef.current,lyRef.current);c.lineTo(p.x,p.y);c.stroke()}
      else{c.strokeStyle=colorRef.current;c.lineWidth=sizeRef.current;c.beginPath();c.moveTo(lxRef.current,lyRef.current);c.lineTo(p.x,p.y);c.stroke()}
      c.restore()
    }
    lxRef.current=p.x; lyRef.current=p.y
  }, [])

  const onEnd = useCallback(e => {
    e.preventDefault()
    const cv = cvRef.current; if (!cv) return
    const c = cv.getContext('2d')
    if (calRef.current === 1 && drawRef.current) {
      const tc = e.changedTouches?.[0]
      let p = getPos(tc ? { touches:[{clientX:tc.clientX,clientY:tc.clientY}] } : e)
      p = snapAngle(p.x,p.y,sxRef.current,syRef.current)
      const newLine = { x1:sxRef.current, y1:syRef.current, x2:p.x, y2:p.y }
      calLineRef.current = newLine; setCalLine(newLine)
      drawRef.current = false
      if (calSnapRef.current) c.putImageData(calSnapRef.current,0,0)
      // draw preview cal line
      c.save();c.strokeStyle='#EF9F27';c.lineWidth=2;c.setLineDash([6,4]);c.lineCap='round'
      c.beginPath();c.moveTo(newLine.x1,newLine.y1);c.lineTo(newLine.x2,newLine.y2);c.stroke();c.setLineDash([])
      c.restore()
      setCalPhase(2); return
    }
    drawRef.current = false; snapRef.current = null
  }, [])

  function confirmCal() {
    const mm = parseFloat(calMm); if (!mm || mm <= 0) { toast('Enter a valid mm value','error'); return }
    const cv = cvRef.current; const c = cv.getContext('2d')
    const cl = calLineRef.current
    const dx=cl.x2-cl.x1,dy=cl.y2-cl.y1
    const newPxMm = Math.sqrt(dx*dx+dy*dy)/mm
    setPxMm(newPxMm); pxMmRef.current = newPxMm
    setCalPhase(0); setCalMm('')
    // draw final cal line annotation
    c.save();c.strokeStyle='#EF9F27';c.lineWidth=2;c.setLineDash([6,4]);c.lineCap='round'
    c.beginPath();c.moveTo(cl.x1,cl.y1);c.lineTo(cl.x2,cl.y2);c.stroke();c.setLineDash([])
    const ang=Math.atan2(cl.y2-cl.y1,cl.x2-cl.x1),perp=ang+Math.PI/2
    [[cl.x1,cl.y1],[cl.x2,cl.y2]].forEach(([x,y])=>{c.beginPath();c.moveTo(x+Math.cos(perp)*7,y+Math.sin(perp)*7);c.lineTo(x-Math.cos(perp)*7,y-Math.sin(perp)*7);c.stroke()})
    const mx=(cl.x1+cl.x2)/2,my=(cl.y1+cl.y2)/2,lbl=mm>=1000?(mm/1000).toFixed(2)+'m':mm+'mm'
    c.font='bold 12px sans-serif';const tw=c.measureText(lbl).width
    c.fillStyle='rgba(255,255,255,.9)';c.fillRect(mx-tw/2-4,my-15,tw+8,19)
    c.fillStyle='#C07000';c.fillText(lbl,mx-tw/2,my);c.restore()
    toast('Scale calibrated ✓')
    setTool('pen')
  }

  function drawDimShape() {
    const cv = cvRef.current; const c = cv.getContext('2d')
    const eff = pxMm || (1/scale)
    const pw = parseFloat(dimW)*eff, ph = parseFloat(dimH)*eff
    const cx2=cv.width/2, cy2=cv.height/2
    pushHist(c);c.save();c.strokeStyle=color;c.lineWidth=size;c.lineCap='round'
    if(dimShape==='rect'){c.strokeRect(cx2-pw/2,cy2-ph/2,pw,ph);dimLabel(c,cx2,cy2-ph/2-6,dimW+'mm');dimLabel(c,cx2+pw/2+4,cy2,dimH+'mm',true)}
    else if(dimShape==='line'){c.beginPath();c.moveTo(cx2-pw/2,cy2);c.lineTo(cx2+pw/2,cy2);c.stroke();dimLabel(c,cx2,cy2-8,dimW+'mm')}
    else if(dimShape==='circle'){const r=pw/2;c.beginPath();c.arc(cx2,cy2,r,0,Math.PI*2);c.stroke();dimLabel(c,cx2,cy2-r-6,'Ø'+dimW+'mm')}
    c.restore()
  }

  function skUndo() { if (!hist.length) return; const prev=hist[hist.length-1]; const cv=cvRef.current; const c=cv.getContext('2d'); c.putImageData(prev,0,0); setHist(h=>h.slice(0,-1)) }
  function skClear() { const cv=cvRef.current; const c=cv.getContext('2d'); pushHist(c); drawGridFn(c,cv.width,cv.height,scale) }

  async function saveSketch() {
    const cv = cvRef.current; if (!cv) return
    setSaving(true)
    const blob = await new Promise(res => cv.toBlob(res,'image/png'))
    const ts   = new Date().toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'})
    const fname = `Sketch ${ts}.png`
    const file  = new File([blob], fname, { type:'image/png' })
    const path  = `${id}/${Date.now()}_${fname}`
    if (editAtt?.storage_path) {
      await supabase.storage.from(BUCKET).remove([editAtt.storage_path])
      await supabase.from('attachments').delete().eq('id', editAtt.id)
    }
    await supabase.storage.from(BUCKET).upload(path, file, { contentType:'image/png' })
    await supabase.from('attachments').insert({ job_id:id, name:fname, type:'image/png', size:blob.size, storage_path:path })
    setSaving(false)
    toast('Sketch saved ✓')
    navigate(`/job/${id}`)
  }

  function pickTool(tid) {
    if (tid === 'straight') { setLocked(v => !v); return }
    if (tid === 'calibrate') { setCalPhase(1); setCalSnap(ctx?.getImageData(0,0,cvRef.current?.width||340,500)||null); setFabOpen(false); return }
    setTool(tid)
    if (tid==='eraser') setSize(18)
    else if (tid==='highlight') setSize(20)
    setFabOpen(false)
  }

  const toolName = { pen:'Pen',pencil:'Pencil',highlight:'Marker',line:'Line',rect:'Rectangle',circle:'Circle',text:'Text',eraser:'Eraser',calibrate:'Ref dim' }

  return (
    <div>
      <BackButton to={`/job/${id}`} label="Job details" />
      <div className="flex items-start justify-between mb-3 flex-wrap gap-2">
        <div>
          <h1 className="text-lg font-bold text-[#2A3042]">{job?.name || '…'}</h1>
          <div className="text-xs text-[#9CA3AF]">{job?.id} · {job?.client}</div>
        </div>
        {editAtt && <span className="text-xs bg-blue-50 text-blue-700 border border-blue-200 px-2 py-1 rounded-lg">Editing existing sketch</span>}
      </div>

      {/* cal banners */}
      {calPhase === 1 && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 mb-3 text-sm text-amber-800">
          <div className="font-semibold mb-1">📏 Reference dimension — step 1 of 2</div>
          <div className="text-xs text-amber-700 mb-2">Draw a line over a known measurement on the canvas.</div>
          <button onClick={() => setCalPhase(0)} className="btn btn-sm text-xs">Cancel</button>
        </div>
      )}
      {calPhase === 2 && (
        <div className="bg-blue-50 border border-blue-200 rounded-xl px-4 py-3 mb-3 text-sm text-blue-800">
          <div className="font-semibold mb-1">📏 Reference dimension — step 2 of 2</div>
          <div className="text-xs text-blue-700 mb-2">Enter the real-world length of the line you drew:</div>
          <div className="flex gap-2 items-center flex-wrap">
            <input value={calMm} onChange={e => setCalMm(e.target.value)} type="number" placeholder="e.g. 3600" className="input text-sm w-28" />
            <span className="text-xs text-blue-700">mm</span>
            <button onClick={confirmCal} className="btn-green btn-sm">Set scale ✓</button>
            <button onClick={() => setCalPhase(0)} className="btn btn-sm">Cancel</button>
          </div>
        </div>
      )}

      {/* topbar controls */}
      <div className="flex items-center gap-2 mb-2 flex-wrap">
        <select value={scale} onChange={e => setScale(parseInt(e.target.value))} className="input text-xs py-1.5 w-24">
          <option value={10}>1:10</option><option value={20}>1:20</option><option value={50}>1:50</option><option value={100}>1:100</option>
        </select>
        <span className="text-xs text-[#9CA3AF] font-mono">{pxMm ? `1px≈${(1/pxMm).toFixed(1)}mm` : `1px=${scale}mm`}</span>
        {pxMm && <span className="text-xs px-2 py-0.5 rounded-full bg-teal-50 text-teal-700 border border-teal-200">calibrated</span>}
        <button onClick={() => setDimOpen(v => !v)} className="btn btn-sm text-xs">📐 Dim</button>
        <button onClick={skUndo} className="btn btn-sm text-xs">↩ Undo</button>
        <button onClick={skClear} className="btn btn-sm text-xs">🗑 Clear</button>
      </div>

      {/* dim panel */}
      {dimOpen && (
        <div style={{ background:"#fff", borderRadius:12, border:"1px solid #E8ECF0", boxShadow:"0 1px 3px rgba(0,0,0,0.04)", padding:14, marginBottom:12 }}>
          <div className="text-xs font-semibold text-[#6B7280] uppercase tracking-wider mb-2">Draw at exact dimensions</div>
          <div className="grid grid-cols-2 gap-2 mb-2">
            <div><label className="label">Width (mm)</label><input className="input text-sm" type="number" value={dimW} onChange={e => setDimW(e.target.value)} /></div>
            <div><label className="label">Height / length (mm)</label><input className="input text-sm" type="number" value={dimH} onChange={e => setDimH(e.target.value)} /></div>
          </div>
          <div className="flex gap-2 items-center">
            <select className="input text-sm flex-1" value={dimShape} onChange={e => setDimShape(e.target.value)}>
              <option value="rect">Rectangle</option><option value="line">Line (width)</option><option value="circle">Circle (dia)</option>
            </select>
            <button onClick={drawDimShape} className="btn btn-sm">Draw</button>
          </div>
          <div className="text-xs text-[#9CA3AF] mt-1">{dimW}mm × {dimH}mm → {Math.round(parseFloat(dimW)*(pxMm||(1/scale)))}px × {Math.round(parseFloat(dimH)*(pxMm||(1/scale)))}px</div>
        </div>
      )}

      {/* colour + size */}
      <div className="flex items-center gap-3 mb-3 flex-wrap">
        <div className="flex gap-1.5">
          {SK_COLORS.map(c => (
            <div key={c} onClick={() => setColor(c)}
              className={`w-5 h-5 rounded-full cursor-pointer transition-transform ${color === c ? 'scale-125' : 'hover:scale-110'}`}
              style={{ background: c, border: c==='#ffffff' ? '1.5px solid #ccc' : c===color ? '2px solid #374151' : '1.5px solid transparent' }} />
          ))}
        </div>
        <div className="flex items-center gap-2 flex-1 min-w-24">
          <input type="range" min="1" max="40" step="1" value={size} onChange={e => setSize(parseInt(e.target.value))} className="flex-1" />
          <span className="text-xs text-[#6B7280] w-5">{size}</span>
        </div>
      </div>

      {/* canvas */}
      <div className="relative mb-3" ref={wrapRef}>
        <div className="border border-[#E8ECF0] rounded-xl overflow-hidden bg-white touch-none">
          <canvas ref={cvRef}
            onMouseDown={onStart} onMouseMove={onMove} onMouseUp={onEnd} onMouseLeave={onEnd}
            onTouchStart={onStart} onTouchMove={onMove} onTouchEnd={onEnd}
            style={{ display:'block', width:'100%' }} />
        </div>
        {/* FAB */}
        <div className="fab-wrap absolute bottom-3 right-3 z-20">
          {fabOpen && (
            <div className="absolute bottom-14 right-0 flex flex-col items-end gap-2 pointer-events-auto">
              {TOOLS.map(t => (
                <div key={t.id} onClick={() => pickTool(t.id)} className="flex items-center gap-2 cursor-pointer">
                  <span className={`text-xs px-3 py-1.5 rounded-full text-white ${tool===t.id||( t.id==='straight'&&locked) ? 'bg-blue-600' : 'bg-gray-800/85'}`}>{t.lbl}</span>
                  <div className={`w-9 h-9 rounded-full border flex items-center justify-center shadow-md cursor-pointer ${tool===t.id||(t.id==='straight'&&locked) ? 'bg-blue-500 border-blue-500 text-white' : 'bg-white border-[#E8ECF0] text-[#4B5563]'}`}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" dangerouslySetInnerHTML={{ __html: t.svg }} />
                  </div>
                </div>
              ))}
            </div>
          )}
          <button onClick={() => setFabOpen(v => !v)}
            className={`w-12 h-12 rounded-full border-none cursor-pointer flex items-center justify-center shadow-lg transition-colors ${fabOpen ? 'bg-blue-500' : 'bg-gray-900'}`}>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="1.6">
              <path d="M3 21l3-3L17 7a1.4 1.4 0 00-2-2L4 18 3 21z"/><line x1="15" y1="6" x2="18" y2="9"/>
            </svg>
          </button>
        </div>
      </div>

      {/* status + save */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-xs text-[#6B7280]">
          <div className="w-2.5 h-2.5 rounded-full" style={{ background: calPhase>0 ? '#EF9F27' : tool==='eraser' ? '#ccc' : color }} />
          <span>{calPhase>0 ? 'Drawing ref line…' : (toolName[tool]||tool)} · {size}px{locked ? ' · straight' : ''}</span>
        </div>
        <button onClick={saveSketch} disabled={saving} className="btn-green disabled:opacity-50">
          {saving ? 'Saving…' : 'Save sketch'}
        </button>
      </div>
    </div>
  )
}
