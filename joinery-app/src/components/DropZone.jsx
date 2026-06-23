/**
 * DropZone — reusable drag-and-drop + click-to-upload component.
 * Drop files anywhere on it, or click to browse.
 * 
 * Props:
 *   onFiles(FileList|File[])  — called when files are selected/dropped
 *   accept      string        — e.g. "image/*" or ".pdf,image/*"
 *   multiple    bool          — allow multiple files (default true)
 *   uploading   bool          — show uploading state
 *   label       string        — primary label text
 *   sublabel    string        — secondary label text
 *   icon        string        — emoji icon (default 📎)
 *   compact     bool          — smaller single-line style
 *   children                 — custom content inside the zone
 */
import { useState, useRef } from 'react'

export default function DropZone({
  onFiles, accept, multiple = true, uploading = false,
  label, sublabel, icon = '📎', compact = false, children, style = {}
}) {
  const [dragging, setDragging] = useState(false)
  const [dragCount, setDragCount] = useState(0)
  const inputRef = useRef()

  function handleDragEnter(e) {
    e.preventDefault(); e.stopPropagation()
    setDragCount(c => c + 1)
    setDragging(true)
  }
  function handleDragLeave(e) {
    e.preventDefault(); e.stopPropagation()
    setDragCount(c => {
      const next = c - 1
      if (next <= 0) setDragging(false)
      return next
    })
  }
  function handleDragOver(e) {
    e.preventDefault(); e.stopPropagation()
    e.dataTransfer.dropEffect = 'copy'
  }
  function handleDrop(e) {
    e.preventDefault(); e.stopPropagation()
    setDragging(false); setDragCount(0)
    const files = Array.from(e.dataTransfer.files)
    if (!files.length) return
    const filtered = accept
      ? files.filter(f => matchesAccept(f, accept))
      : files
    if (filtered.length) onFiles(filtered)
  }
  function handleChange(e) {
    if (e.target.files?.length) onFiles(Array.from(e.target.files))
    e.target.value = ''
  }

  function matchesAccept(file, accept) {
    return accept.split(',').some(a => {
      a = a.trim()
      if (a.startsWith('.')) return file.name.toLowerCase().endsWith(a.toLowerCase())
      if (a.endsWith('/*')) return file.type.startsWith(a.slice(0,-1))
      return file.type === a
    })
  }

  if (compact) {
    return (
      <div
        onDragEnter={handleDragEnter} onDragLeave={handleDragLeave}
        onDragOver={handleDragOver} onDrop={handleDrop}
        onClick={()=>!uploading&&inputRef.current?.click()}
        style={{
          display:'flex', alignItems:'center', gap:8, padding:'8px 14px',
          border:`1.5px dashed ${dragging?'#5B8AF0':'#C4D4F8'}`,
          borderRadius:10, background:dragging?'#EEF2FF':'#F8FAFF',
          cursor:uploading?'not-allowed':'pointer', transition:'all .15s',
          ...style
        }}>
        <span style={{fontSize:16}}>{uploading?'⏳':icon}</span>
        <span style={{fontSize:12,fontWeight:600,color:dragging?'#3730A3':'#5B8AF0'}}>
          {uploading ? 'Uploading…' : dragging ? 'Drop to upload' : (label||'Upload or drag files here')}
        </span>
        <input ref={inputRef} type="file" accept={accept} multiple={multiple} style={{display:'none'}} onChange={handleChange}/>
      </div>
    )
  }

  return (
    <div
      onDragEnter={handleDragEnter} onDragLeave={handleDragLeave}
      onDragOver={handleDragOver} onDrop={handleDrop}
      onClick={()=>!uploading&&inputRef.current?.click()}
      style={{
        border:`2px dashed ${dragging?'#5B8AF0':'#C4D4F8'}`,
        borderRadius:12, padding:'28px 20px', textAlign:'center',
        background:dragging?'#EEF2FF':'#F8FAFF',
        cursor:uploading?'not-allowed':'pointer',
        transition:'all .15s',
        transform:dragging?'scale(1.01)':'scale(1)',
        boxShadow:dragging?'0 0 0 4px rgba(91,138,240,0.15)':'none',
        ...style
      }}>
      <div style={{fontSize:32,marginBottom:10}}>
        {uploading ? '⏳' : dragging ? '📥' : icon}
      </div>
      <div style={{fontSize:13,fontWeight:700,color:dragging?'#3730A3':'#2A3042',marginBottom:4}}>
        {uploading ? 'Uploading…' : dragging ? 'Drop files here' : (label||'Click or drag files here')}
      </div>
      {!uploading && !dragging && sublabel && (
        <div style={{fontSize:12,color:'#9CA3AF'}}>{sublabel}</div>
      )}
      {children}
      <input ref={inputRef} type="file" accept={accept} multiple={multiple} style={{display:'none'}} onChange={handleChange}/>
    </div>
  )
}
