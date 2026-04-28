import { useState, useEffect, useRef, useCallback } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useApp } from '../context/AppContext'
import { useToast } from '../components/Toast'
import BackButton from '../components/BackButton'

// ── Block types config ────────────────────────────────────────────
const BLOCK_TYPES = [
  { type:'paragraph',  label:'Text',          icon:'¶',  desc:'Plain text' },
  { type:'heading1',   label:'Heading 1',     icon:'H1', desc:'Large heading' },
  { type:'heading2',   label:'Heading 2',     icon:'H2', desc:'Medium heading' },
  { type:'heading3',   label:'Heading 3',     icon:'H3', desc:'Small heading' },
  { type:'bullet',     label:'Bullet list',   icon:'•',  desc:'Bulleted list item' },
  { type:'numbered',   label:'Numbered list', icon:'1.', desc:'Numbered list item' },
  { type:'todo',       label:'To-do',         icon:'☐',  desc:'Checkbox item' },
  { type:'quote',      label:'Quote',         icon:'"',  desc:'Highlighted quote' },
  { type:'divider',    label:'Divider',       icon:'—',  desc:'Horizontal line' },
  { type:'link_note',  label:'Link to note',  icon:'🔗', desc:'Link another note' },
  { type:'code',       label:'Code',          icon:'<>', desc:'Code block' },
]

function makeBlock(type='paragraph', content='') {
  return { id: Date.now().toString(36) + Math.random().toString(36).slice(2), type, content, checked: false }
}

// ── Slash command menu ────────────────────────────────────────────
function SlashMenu({ filter, onSelect, onClose }) {
  const filtered = BLOCK_TYPES.filter(b =>
    !filter || b.label.toLowerCase().includes(filter.toLowerCase()) || b.type.includes(filter.toLowerCase())
  )
  const [sel, setSel] = useState(0)

  useEffect(() => {
    function onKey(e) {
      if (e.key === 'ArrowDown') { e.preventDefault(); setSel(s => Math.min(s+1, filtered.length-1)) }
      if (e.key === 'ArrowUp')   { e.preventDefault(); setSel(s => Math.max(s-1, 0)) }
      if (e.key === 'Enter')     { e.preventDefault(); if (filtered[sel]) onSelect(filtered[sel].type) }
      if (e.key === 'Escape')    onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [filtered, sel, onSelect, onClose])

  if (!filtered.length) return null

  return (
    <div style={{ position:'absolute', top:'calc(100% + 4px)', left:0, zIndex:200, background:'#fff', border:'1px solid #E8ECF0', borderRadius:12, boxShadow:'0 8px 32px rgba(0,0,0,0.12)', minWidth:220, overflow:'hidden' }}>
      <div style={{ padding:'6px 10px', fontSize:10, fontWeight:700, color:'#9CA3AF', textTransform:'uppercase', letterSpacing:'.06em', borderBottom:'1px solid #F3F4F6' }}>Blocks</div>
      {filtered.map((b, i) => (
        <div key={b.type} onClick={() => onSelect(b.type)}
          style={{ display:'flex', alignItems:'center', gap:10, padding:'8px 12px', cursor:'pointer', background: i===sel ? '#F3F4F6' : 'transparent', transition:'background .08s' }}
          onMouseEnter={() => setSel(i)}>
          <div style={{ width:28, height:28, borderRadius:7, background:'#F9FAFB', border:'1px solid #E8ECF0', display:'flex', alignItems:'center', justifyContent:'center', fontSize:11, fontWeight:700, color:'#374151', flexShrink:0 }}>{b.icon}</div>
          <div>
            <div style={{ fontSize:13, fontWeight:600, color:'#2A3042' }}>{b.label}</div>
            <div style={{ fontSize:11, color:'#9CA3AF' }}>{b.desc}</div>
          </div>
        </div>
      ))}
    </div>
  )
}

// ── Single Block ──────────────────────────────────────────────────
function Block({ block, index, total, allNotes, jobs, onChange, onDelete, onEnter, onArrowUp, onArrowDown, onFocus, focused, dragHandlers }) {
  const ref = useRef()
  const [showSlash, setShowSlash] = useState(false)
  const [slashFilter, setSlashFilter] = useState('')
  const [showLinkPicker, setShowLinkPicker] = useState(false)
  const [linkSearch, setLinkSearch] = useState('')
  const navigate = useNavigate()

  // Set innerHTML ONCE on mount only — never let React update it
  useEffect(() => {
    if (ref.current && block.type !== 'divider' && block.type !== 'link_note') {
      ref.current.innerHTML = block.content || ''
    }
  }, []) // empty deps — only on mount

  // Focus management
  useEffect(() => {
    if (focused && ref.current && block.type !== 'divider' && block.type !== 'link_note') {
      ref.current.focus()
      try {
        const range = document.createRange()
        const sel = window.getSelection()
        range.selectNodeContents(ref.current)
        range.collapse(false)
        sel.removeAllRanges()
        sel.addRange(range)
      } catch(e) {}
    }
  }, [focused])

  function handleInput(e) {
    const text = e.currentTarget.textContent || ''
    onChange(block.id, { content: text })
    // slash command detection
    const sel = window.getSelection()
    const pos = sel?.anchorOffset || 0
    const before = text.slice(0, pos)
    const lastSlash = before.lastIndexOf('/')
    if (lastSlash >= 0 && !before.slice(lastSlash + 1).includes(' ')) {
      setSlashFilter(before.slice(lastSlash + 1))
      setShowSlash(true)
    } else {
      setShowSlash(false)
      setSlashFilter('')
    }
  }

  function handleKey(e) {
    if (e.key === 'Enter' && !e.shiftKey && !showSlash) {
      e.preventDefault(); onEnter(block.id)
    }
    if (e.key === 'Backspace' && !(ref.current?.textContent) && block.type !== 'paragraph') {
      e.preventDefault(); onChange(block.id, { type: 'paragraph', content: '' })
      if (ref.current) ref.current.innerHTML = ''
    }
    if (e.key === 'Backspace' && !(ref.current?.textContent) && index > 0) {
      e.preventDefault(); onDelete(block.id)
    }
    if (e.key === 'ArrowUp') {
      const sel = window.getSelection()
      if (sel?.anchorOffset === 0) { e.preventDefault(); onArrowUp(index) }
    }
    if (e.key === 'ArrowDown') onArrowDown(index)
    if (e.key === 'Escape') { setShowSlash(false); setSlashFilter('') }
  }

  function selectBlockType(type) {
    const text = ref.current?.textContent || ''
    const lastSlash = text.lastIndexOf('/')
    const newContent = lastSlash >= 0 ? text.slice(0, lastSlash) : text
    setShowSlash(false); setSlashFilter('')
    if (type === 'divider') { onChange(block.id, { type, content: '' }); return }
    if (type === 'link_note') { onChange(block.id, { type, content: newContent }); setShowLinkPicker(true); return }
    onChange(block.id, { type, content: newContent })
    if (ref.current) ref.current.innerHTML = newContent
    setTimeout(() => ref.current?.focus(), 10)
  }

  function linkNote(note) {
    onChange(block.id, { type: 'link_note', content: note.title, linked_note_id: note.id })
    setShowLinkPicker(false)
  }

  const baseStyle = {
    outline: 'none', width: '100%', minHeight: 28, lineHeight: 1.7,
    WebkitUserSelect: 'text', userSelect: 'text', fontFamily: 'inherit',
    wordBreak: 'break-word',
  }
  const STYLES = {
    paragraph: { fontSize:15, color:'#374151' },
    heading1:  { fontSize:30, fontWeight:800, color:'#111318', lineHeight:1.25, marginTop:8 },
    heading2:  { fontSize:22, fontWeight:700, color:'#2A3042', lineHeight:1.3, marginTop:6 },
    heading3:  { fontSize:17, fontWeight:700, color:'#2A3042', lineHeight:1.4, marginTop:4 },
    bullet:    { fontSize:15, color:'#374151' },
    numbered:  { fontSize:15, color:'#374151' },
    quote:     { fontSize:15, color:'#4B5563', fontStyle:'italic', borderLeft:'3px solid #5B8AF0', paddingLeft:14 },
    code:      { fontSize:13, color:'#2D3748', fontFamily:'monospace', background:'#F3F4F6', padding:'6px 10px', borderRadius:7, display:'block' },
  }

  if (block.type === 'divider') return (
    <div style={{ display:'flex', alignItems:'center', gap:8, padding:'8px 0' }}>
      <div style={{ flex:1, height:1, background:'#E8ECF0' }} />
    </div>
  )

  if (block.type === 'link_note') {
    const linked = allNotes?.find(n => n.id === block.linked_note_id)
    return (
      <div style={{ position:'relative' }}>
        {showLinkPicker && (
          <div style={{ position:'absolute', top:'calc(100% + 4px)', left:0, zIndex:200, background:'#fff', border:'1px solid #E8ECF0', borderRadius:12, boxShadow:'0 8px 32px rgba(0,0,0,0.12)', minWidth:260, overflow:'hidden' }}>
            <div style={{ padding:'8px 12px', borderBottom:'1px solid #F3F4F6' }}>
              <input autoFocus value={linkSearch} onChange={e=>setLinkSearch(e.target.value)}
                placeholder="Search notes…"
                style={{ width:'100%', border:'none', outline:'none', fontSize:13, color:'#2A3042', WebkitUserSelect:'text', userSelect:'text' }} />
            </div>
            <div style={{ maxHeight:200, overflowY:'auto' }}>
              {allNotes?.filter(n => !linkSearch || (n.title||'').toLowerCase().includes(linkSearch.toLowerCase())).map(n => (
                <div key={n.id} onClick={() => linkNote(n)}
                  style={{ padding:'9px 14px', cursor:'pointer', fontSize:13, color:'#2A3042', borderBottom:'1px solid #F9FAFB' }}
                  onMouseEnter={e=>e.currentTarget.style.background='#F9FAFB'}
                  onMouseLeave={e=>e.currentTarget.style.background='transparent'}>
                  📄 {n.title || 'Untitled'}
                </div>
              ))}
            </div>
          </div>
        )}
        <div style={{ display:'flex', alignItems:'center', gap:10, padding:'8px 12px', background:'#F0F4FF', border:'1px solid #C4D4F8', borderRadius:9, cursor:'pointer' }}
          onClick={() => linked && navigate(`/notes/${linked.id}`)}>
          <span>🔗</span>
          <span style={{ fontSize:13, fontWeight:600, color:'#3730A3', flex:1 }}>{linked?.title || block.content || 'Linked note'}</span>
          <button onClick={e=>{e.stopPropagation();onDelete(block.id)}} style={{ fontSize:14, color:'#A5B4FC', background:'none', border:'none', cursor:'pointer', lineHeight:1 }}>×</button>
        </div>
      </div>
    )
  }

  if (block.type === 'todo') return (
    <div style={{ display:'flex', alignItems:'flex-start', gap:8, position:'relative' }}>
      <div onClick={() => onChange(block.id, { checked: !block.checked })}
        style={{ width:18, height:18, borderRadius:5, border:`2px solid ${block.checked?'#5B8AF0':'#C4C9D4'}`, background:block.checked?'#5B8AF0':'#fff', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0, marginTop:5, cursor:'pointer', transition:'all .12s' }}>
        {block.checked && <span style={{ color:'#fff', fontSize:11, fontWeight:700, lineHeight:1 }}>✓</span>}
      </div>
      <div ref={ref} contentEditable suppressContentEditableWarning
        onInput={handleInput} onKeyDown={handleKey} onFocus={() => onFocus(index)}
        style={{ ...baseStyle, ...STYLES.paragraph, flex:1, textDecoration:block.checked?'line-through':'none', color:block.checked?'#9CA3AF':'#374151' }} />
      {showSlash && <SlashMenu filter={slashFilter} onSelect={selectBlockType} onClose={()=>setShowSlash(false)} />}
    </div>
  )

  if (block.type === 'bullet' || block.type === 'numbered') return (
    <div style={{ display:'flex', alignItems:'flex-start', gap:8, position:'relative' }}>
      <div style={{ width:20, flexShrink:0, textAlign:'right', fontSize:15, color:'#9CA3AF', marginTop:1, fontWeight:600, lineHeight:1.7 }}>
        {block.type === 'bullet' ? '•' : `${index+1}.`}
      </div>
      <div ref={ref} contentEditable suppressContentEditableWarning
        onInput={handleInput} onKeyDown={handleKey} onFocus={() => onFocus(index)}
        style={{ ...baseStyle, ...STYLES.paragraph, flex:1 }} />
      {showSlash && <SlashMenu filter={slashFilter} onSelect={selectBlockType} onClose={()=>setShowSlash(false)} />}
    </div>
  )

  const style = STYLES[block.type] || STYLES.paragraph
  return (
    <div style={{ position:'relative' }}>
      <div ref={ref} contentEditable suppressContentEditableWarning
        onInput={handleInput} onKeyDown={handleKey} onFocus={() => onFocus(index)}
        data-placeholder={block.type==='paragraph' ? "Type '/' for commands…" : ''}
        style={{ ...baseStyle, ...style }} />
      {showSlash && <SlashMenu filter={slashFilter} onSelect={selectBlockType} onClose={()=>setShowSlash(false)} />}
    </div>
  )
}


// ── Note Editor ───────────────────────────────────────────────────
function NoteEditor({ note, allNotes, jobs, onSave, onBack }) {
  const { profile } = useApp()
  const toast = useToast()
  const navigate = useNavigate()

  const [title, setTitle]       = useState(note?.title || '')
  const [blocks, setBlocks]     = useState(note?.content?.blocks?.length ? note.content.blocks : [makeBlock()])
  const [isPublic, setIsPublic] = useState(note?.is_public ?? false)
  const [jobId, setJobId]       = useState(note?.job_id || '')
  const [focusedIdx, setFocusedIdx] = useState(0)
  const [saving, setSaving]     = useState(false)
  const [lastSaved, setLastSaved] = useState(null)
  const [dirty, setDirty]       = useState(false)
  const titleRef = useRef()
  const saveTimer = useRef()

  // Auto-save after 1.5s of inactivity
  useEffect(() => {
    if (!dirty) return
    clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(() => saveNote(true), 1500)
    return () => clearTimeout(saveTimer.current)
  }, [title, blocks, isPublic, jobId, dirty])

  async function saveNote(auto = false) {
    setSaving(true)
    const content = { blocks }
    const row = { title: title||'Untitled', content, is_public: isPublic, job_id: jobId||null, updated_at: new Date().toISOString() }
    let saved
    if (note?.id) {
      const { data } = await supabase.from('notes').update(row).eq('id', note.id).select().single()
      saved = data
    } else {
      const { data } = await supabase.from('notes').insert({ ...row, created_by: profile?.id }).select().single()
      saved = data
      if (saved) navigate(`/notes/${saved.id}`, { replace: true })
    }
    setSaving(false)
    setDirty(false)
    setLastSaved(new Date())
    if (!auto) toast('Saved ✓')
    if (saved) onSave(saved)
  }

  function markDirty() { setDirty(true) }

  function changeBlock(id, patch) {
    setBlocks(prev => prev.map(b => b.id === id ? { ...b, ...patch } : b))
    markDirty()
  }

  function deleteBlock(id) {
    setBlocks(prev => {
      const idx = prev.findIndex(b => b.id === id)
      const next = prev.filter(b => b.id !== id)
      setTimeout(() => setFocusedIdx(Math.max(0, idx - 1)), 10)
      return next.length ? next : [makeBlock()]
    })
    markDirty()
  }

  function enterBlock(id) {
    const idx = blocks.findIndex(b => b.id === id)
    const newBlock = makeBlock()
    setBlocks(prev => { const n=[...prev]; n.splice(idx+1,0,newBlock); return n })
    setTimeout(() => setFocusedIdx(idx + 1), 10)
    markDirty()
  }

  // simple drag-to-reorder
  const dragBlock = useRef(null)
  function dragStart(idx) { dragBlock.current = idx }
  function dragOver(e, idx) { e.preventDefault() }
  function drop(idx) {
    if (dragBlock.current === null || dragBlock.current === idx) return
    setBlocks(prev => {
      const n = [...prev]
      const [moved] = n.splice(dragBlock.current, 1)
      n.splice(idx, 0, moved)
      return n
    })
    dragBlock.current = null
    markDirty()
  }

  const canEdit = note ? (note.created_by === profile?.id || profile?.role === 'Admin') : true

  return (
    <div style={{ maxWidth:760, margin:'0 auto' }}>
      {/* toolbar */}
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:24, flexWrap:'wrap', gap:10 }}>
        <div style={{ display:'flex', alignItems:'center', gap:10 }}>
          <button onClick={onBack} style={{ background:'none', border:'none', cursor:'pointer', fontSize:13, color:'#6B7280', display:'flex', alignItems:'center', gap:5, padding:0, fontWeight:500 }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/></svg>
            Notes
          </button>
          {lastSaved && <span style={{ fontSize:11, color:'#9CA3AF' }}>Saved {lastSaved.toLocaleTimeString([], { hour:'2-digit', minute:'2-digit' })}</span>}
          {saving && <span style={{ fontSize:11, color:'#9CA3AF' }}>Saving…</span>}
        </div>
        <div style={{ display:'flex', gap:8, alignItems:'center' }}>
          {/* visibility toggle */}
          <div onClick={() => { setIsPublic(v=>!v); markDirty() }}
            style={{ display:'flex', alignItems:'center', gap:6, padding:'5px 11px', borderRadius:20, border:`1.5px solid ${isPublic?'#1D9E75':'#E8ECF0'}`, background:isPublic?'#ECFDF5':'#fff', cursor:'pointer', fontSize:12, fontWeight:600, color:isPublic?'#065F46':'#6B7280', transition:'all .15s' }}>
            <span>{isPublic ? '🌐' : '🔒'}</span>
            <span>{isPublic ? 'Public' : 'Private'}</span>
          </div>
          {/* link to job */}
          <select value={jobId} onChange={e=>{setJobId(e.target.value);markDirty()}}
            style={{ fontSize:12, padding:'5px 10px', borderRadius:9, border:'1px solid #E8ECF0', background:'#fff', color: jobId?'#2A3042':'#9CA3AF', cursor:'pointer', outline:'none' }}>
            <option value="">No job linked</option>
            {jobs.map(j => <option key={j.id} value={j.id}>🔗 {j.name}</option>)}
          </select>
          {canEdit && (
            <button onClick={() => saveNote(false)} disabled={saving}
              style={{ fontSize:12, fontWeight:700, padding:'6px 16px', borderRadius:9, border:'none', background:'#5B8AF0', color:'#fff', cursor:saving?'not-allowed':'pointer', opacity:saving?0.7:1 }}>
              Save
            </button>
          )}
        </div>
      </div>

      {/* editor */}
      <div style={{ background:'#fff', borderRadius:16, border:'1px solid #E8ECF0', boxShadow:'0 1px 3px rgba(0,0,0,0.04)', padding:'40px 48px 60px', minHeight:500 }}>
        {/* title */}
        <input ref={titleRef} value={title} onChange={e=>{setTitle(e.target.value);markDirty()}}
          placeholder="Untitled note"
          onKeyDown={e => { if (e.key==='Enter'){e.preventDefault();setFocusedIdx(0)} if (e.key==='ArrowDown'){setFocusedIdx(0)} }}
          readOnly={!canEdit}
          style={{ width:'100%', border:'none', outline:'none', fontSize:36, fontWeight:800, color:'#111318', marginBottom:24, background:'transparent', lineHeight:1.2, fontFamily:'inherit', WebkitUserSelect:'text', userSelect:'text' }} />

        {/* blocks */}
        <div style={{ display:'flex', flexDirection:'column', gap:2 }}>
          {blocks.map((block, idx) => (
            <div key={block.id} style={{ display:'flex', alignItems:'flex-start', gap:6, padding:'2px 0', position:'relative' }}
              draggable={canEdit} onDragStart={() => dragStart(idx)} onDragOver={e => dragOver(e,idx)} onDrop={() => drop(idx)}>
              {/* drag handle */}
              {canEdit && (
                <div style={{ width:16, flexShrink:0, display:'flex', alignItems:'center', justifyContent:'center', opacity:0, cursor:'grab', marginTop:4, color:'#C4C9D4', fontSize:12, height:24 }} className="drag-handle">⠿</div>
              )}
              <div style={{ flex:1, minWidth:0 }}>
                <Block
                  block={block} index={idx} total={blocks.length}
                  allNotes={allNotes} jobs={jobs}
                  onChange={canEdit ? changeBlock : ()=>{}}
                  onDelete={canEdit ? deleteBlock : ()=>{}}
                  onEnter={canEdit ? enterBlock : ()=>{}}
                  onArrowUp={i => setFocusedIdx(Math.max(0,i-1))}
                  onArrowDown={i => setFocusedIdx(Math.min(blocks.length-1,i+1))}
                  onFocus={setFocusedIdx}
                  focused={focusedIdx === idx}
                  dragHandlers={{}}
                />
              </div>
            </div>
          ))}
        </div>

        {/* click empty area to add block */}
        {canEdit && (
          <div onClick={() => { setBlocks(p=>[...p,makeBlock()]); setTimeout(()=>setFocusedIdx(blocks.length),10) }}
            style={{ height:60, cursor:'text' }} />
        )}
      </div>

      <style>{`
        [contenteditable]:empty:before { content: attr(data-placeholder); color: #C4C9D4; pointer-events:none; }
        .drag-handle:hover { opacity:1 !important; }
        div:hover > .drag-handle { opacity:1; }
        [draggable]:hover .del-btn { opacity:1 !important; }
      `}</style>
    </div>
  )
}

// ── Notes List ────────────────────────────────────────────────────
function NotesList({ notes, jobs, onCreate, onOpen }) {
  const [search, setSearch] = useState('')
  const [jobFilter, setJobFilter] = useState('')

  const filtered = notes.filter(n => {
    if (jobFilter && n.job_id !== jobFilter) return false
    if (!search) return true
    return (n.title||'').toLowerCase().includes(search.toLowerCase())
  })

  const linked   = notes.filter(n => n.job_id)
  const unlinked = filtered.filter(n => !n.job_id)
  const linkedFiltered = filtered.filter(n => n.job_id)

  return (
    <div>
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:16, flexWrap:'wrap', gap:10 }}>
        <h1 style={{ fontSize:20, fontWeight:800, color:'#2A3042', margin:0 }}>Notes</h1>
        <button onClick={onCreate}
          style={{ fontSize:13, fontWeight:700, padding:'8px 18px', borderRadius:9, border:'none', background:'#5B8AF0', color:'#fff', cursor:'pointer' }}>
          + New note
        </button>
      </div>

      {/* search + filter */}
      <div style={{ display:'flex', gap:10, marginBottom:16, flexWrap:'wrap' }}>
        <div style={{ position:'relative', flex:1, minWidth:180 }}>
          <span style={{ position:'absolute', left:10, top:'50%', transform:'translateY(-50%)', color:'#9CA3AF', fontSize:14, pointerEvents:'none' }}>⌕</span>
          <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search notes…"
            style={{ width:'100%', padding:'8px 10px 8px 32px', border:'1px solid #DDE3EC', borderRadius:9, fontSize:13, outline:'none' }} />
        </div>
        <select value={jobFilter} onChange={e=>setJobFilter(e.target.value)}
          style={{ padding:'8px 12px', border:'1px solid #DDE3EC', borderRadius:9, fontSize:13, outline:'none', background:'#fff', color: jobFilter?'#2A3042':'#9CA3AF', cursor:'pointer' }}>
          <option value="">All notes</option>
          {jobs.filter(j=>linked.some(n=>n.job_id===j.id)).map(j=><option key={j.id} value={j.id}>{j.name}</option>)}
        </select>
      </div>

      {filtered.length === 0 ? (
        <div style={{ textAlign:'center', padding:'60px 0', color:'#9CA3AF', fontSize:14 }}>
          {notes.length === 0 ? 'No notes yet — create one above' : 'No notes match your search'}
        </div>
      ) : (
        <div>
          {/* linked notes grouped by job */}
          {linkedFiltered.length > 0 && (
            <div style={{ marginBottom:24 }}>
              <div style={{ fontSize:11, fontWeight:700, color:'#9CA3AF', textTransform:'uppercase', letterSpacing:'.06em', marginBottom:10 }}>Linked to jobs</div>
              <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(240px,1fr))', gap:12 }}>
                {linkedFiltered.map(n => <NoteCard key={n.id} note={n} jobs={jobs} onOpen={onOpen} />)}
              </div>
            </div>
          )}
          {unlinked.length > 0 && (
            <div>
              {linkedFiltered.length > 0 && <div style={{ fontSize:11, fontWeight:700, color:'#9CA3AF', textTransform:'uppercase', letterSpacing:'.06em', marginBottom:10 }}>Standalone notes</div>}
              <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(240px,1fr))', gap:12 }}>
                {unlinked.map(n => <NoteCard key={n.id} note={n} jobs={jobs} onOpen={onOpen} />)}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function NoteCard({ note, jobs, onOpen }) {
  const job = jobs.find(j => j.job_id === note.job_id) || jobs.find(j => j.id === note.job_id)
  const preview = note.content?.blocks?.find(b => b.type==='paragraph' && b.content)?.content || ''
  const wordCount = note.content?.blocks?.reduce((a,b)=>a+(b.content?.split(' ').length||0),0)||0

  return (
    <div onClick={() => onOpen(note)} style={{ background:'#fff', borderRadius:12, border:'1px solid #E8ECF0', padding:'16px 18px', cursor:'pointer', boxShadow:'0 1px 3px rgba(0,0,0,0.04)', transition:'all .15s' }}
      onMouseEnter={e=>{e.currentTarget.style.boxShadow='0 6px 20px rgba(0,0,0,0.09)';e.currentTarget.style.transform='translateY(-1px)'}}
      onMouseLeave={e=>{e.currentTarget.style.boxShadow='0 1px 3px rgba(0,0,0,0.04)';e.currentTarget.style.transform='none'}}>
      <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', marginBottom:8, gap:8 }}>
        <div style={{ fontSize:15, fontWeight:700, color:'#2A3042', lineHeight:1.3, flex:1 }}>{note.title || 'Untitled'}</div>
        <span style={{ fontSize:10, padding:'2px 7px', borderRadius:10, background: note.is_public?'#ECFDF5':'#F3F4F6', color: note.is_public?'#065F46':'#6B7280', fontWeight:600, flexShrink:0 }}>
          {note.is_public ? '🌐 Public' : '🔒 Private'}
        </span>
      </div>
      {preview && <div style={{ fontSize:12, color:'#9CA3AF', marginBottom:10, lineHeight:1.5, overflow:'hidden', display:'-webkit-box', WebkitLineClamp:2, WebkitBoxOrient:'vertical' }}>{preview}</div>}
      <div style={{ display:'flex', items:'center', justifyContent:'space-between', gap:8 }}>
        {job && <span style={{ fontSize:11, color:'#5B8AF0', fontWeight:600 }}>🔗 {job.name}</span>}
        <span style={{ fontSize:11, color:'#C4C9D4', marginLeft:'auto' }}>{wordCount} words · {new Date(note.updated_at||note.created_at).toLocaleDateString('en-NZ',{day:'numeric',month:'short'})}</span>
      </div>
    </div>
  )
}

// ── Main export ───────────────────────────────────────────────────
export default function Notes() {
  const { noteId } = useParams()
  const [searchParams] = useSearchParams()
  const navigate   = useNavigate()
  const { profile } = useApp()
  const toast      = useToast()

  const [notes, setNotes] = useState([])
  const [jobs,  setJobs]  = useState([])
  const [active, setActive] = useState(null) // null=list, 'new'=new note, note=editing
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    Promise.all([
      supabase.from('notes').select('*').order('updated_at', { ascending:false }),
      supabase.from('jobs').select('id,name,status').order('created_at', { ascending:false }),
    ]).then(([{ data:n }, { data:j }]) => {
      setNotes(n||[])
      setJobs(j||[])
      setLoading(false)
      const preJobId = searchParams.get('job')
      if (noteId) {
        const found = (n||[]).find(x => x.id === noteId)
        if (found) setActive(found)
      } else if (preJobId) {
        setActive({ _preJobId: preJobId })
      }
    })
  }, [noteId])

  function onSaveNote(saved) {
    setNotes(prev => {
      const i = prev.findIndex(x => x.id === saved.id)
      return i>=0 ? prev.map((x,j)=>j===i?saved:x) : [saved,...prev]
    })
    setActive(saved)
  }

  async function deleteNote(note) {
    if (!confirm(`Delete "${note.title||'Untitled'}"?`)) return
    await supabase.from('notes').delete().eq('id', note.id)
    setNotes(prev => prev.filter(x => x.id !== note.id))
    setActive(null)
    navigate('/notes')
    toast('Note deleted')
  }

  if (loading) return <div style={{ display:'flex', justifyContent:'center', padding:'60px 0' }}><div className="spinner" /></div>

  if (active && active !== 'new') {
    return (
      <div>
        <NoteEditor
          note={active} allNotes={notes} jobs={jobs}
          onSave={onSaveNote}
          onBack={() => { setActive(null); navigate('/notes') }} />
        {(active.created_by===profile?.id || profile?.role==='Admin') && (
          <div style={{ maxWidth:760, margin:'12px auto 0', textAlign:'right' }}>
            <button onClick={() => deleteNote(active)}
              style={{ fontSize:12, color:'#FCA5A5', background:'none', border:'none', cursor:'pointer', fontWeight:600 }}>
              Delete note
            </button>
          </div>
        )}
      </div>
    )
  }

  if (active === 'new' || active?._preJobId) {
    return (
      <NoteEditor
        note={active?._preJobId ? { job_id: active._preJobId } : null} allNotes={notes} jobs={jobs}
        onSave={onSaveNote}
        onBack={() => { setActive(null); navigate('/notes') }} />
    )
  }

  return (
    <NotesList
      notes={notes} jobs={jobs}
      onCreate={() => setActive('new')}
      onOpen={note => { setActive(note); navigate(`/notes/${note.id}`) }} />
  )
}
