import { useState, useEffect, useRef } from 'react'
import { supabase, pubUrl, BUCKET } from '../lib/supabase'
import { useToast } from './Toast'

export default function ImageLibrary({ onSelect, onClose }) {
  const toast = useToast()
  const fileRef = useRef()
  const [images, setImages]         = useState([])
  const [loading, setLoading]       = useState(true)
  const [search, setSearch]         = useState('')
  const [activeCat, setActiveCat]   = useState('All')
  const [uploading, setUploading]   = useState(false)
  const [showUpload, setShowUpload] = useState(false)
  const [newName, setNewName]       = useState('')
  const [newCat, setNewCat]         = useState('')
  const [newFile, setNewFile]       = useState(null)
  const [newPreview, setNewPreview] = useState(null)
  const [hoveredId, setHoveredId]   = useState(null)

  useEffect(() => { loadImages() }, [])

  async function loadImages() {
    setLoading(true)
    const { data, error } = await supabase.from('image_library').select('*').order('created_at', { ascending: false })
    if (error) toast(error.message, 'error')
    setImages(data || [])
    setLoading(false)
  }

  const categories = ['All', ...Array.from(new Set((images||[]).map(i => i.category).filter(Boolean))).sort()]

  const filtered = images.filter(img => {
    const matchCat = activeCat === 'All' || img.category === activeCat
    const q = search.toLowerCase()
    const matchSearch = !q || (img.name||'').toLowerCase().includes(q) || (img.category||'').toLowerCase().includes(q)
    return matchCat && matchSearch
  })

  function handleFileChange(e) {
    const f = e.target.files[0]; if (!f) return
    setNewFile(f)
    setNewName(f.name.replace(/\.[^.]+$/, ''))
    const reader = new FileReader()
    reader.onload = ev => setNewPreview(ev.target.result)
    reader.readAsDataURL(f)
    setShowUpload(true)
  }

  async function handleUpload() {
    if (!newFile) return
    setUploading(true)
    const path = `image-library/${Date.now()}_${newFile.name.replace(/\s+/g,'_')}`
    const { error: upErr } = await supabase.storage.from(BUCKET).upload(path, newFile, { contentType: newFile.type, upsert: false })
    if (upErr) { toast(upErr.message, 'error'); setUploading(false); return }
    const { data, error: dbErr } = await supabase.from('image_library').insert({
      name: newName.trim() || newFile.name,
      category: newCat.trim() || 'Uncategorised',
      path,
    }).select().single()
    if (dbErr) { toast(dbErr.message, 'error'); setUploading(false); return }
    setImages(prev => [data, ...prev])
    setNewFile(null); setNewPreview(null); setNewName(''); setNewCat(''); setShowUpload(false)
    setUploading(false)
    toast('Image added to library ✓')
  }

  async function handleDelete(img, e) {
    e.stopPropagation()
    if (!confirm(`Remove "${img.name}" from library?`)) return
    await supabase.storage.from(BUCKET).remove([img.path])
    await supabase.from('image_library').delete().eq('id', img.id)
    setImages(prev => prev.filter(i => i.id !== img.id))
    toast('Removed from library')
  }

  return (
    <div style={{ position:'fixed', inset:0, zIndex:1000, background:'rgba(0,0,0,0.45)', display:'flex', alignItems:'center', justifyContent:'center', padding:20 }}>
      <div style={{ background:'#fff', borderRadius:16, width:'100%', maxWidth:860, maxHeight:'88vh', display:'flex', flexDirection:'column', boxShadow:'0 20px 60px rgba(0,0,0,0.25)', overflow:'hidden' }}>

        {/* Header */}
        <div style={{ padding:'16px 20px', borderBottom:'1px solid #E8ECF0', display:'flex', alignItems:'center', justifyContent:'space-between', flexShrink:0 }}>
          <div>
            <div style={{ fontSize:16, fontWeight:700, color:'#2A3042' }}>Image Library</div>
            <div style={{ fontSize:12, color:'#9CA3AF', marginTop:2 }}>Select an image or upload a new one</div>
          </div>
          <div style={{ display:'flex', gap:8 }}>
            <button onClick={() => fileRef.current?.click()}
              style={{ padding:'7px 14px', borderRadius:8, border:'none', background:'#5B8AF0', color:'#fff', fontSize:13, fontWeight:600, cursor:'pointer', display:'flex', alignItems:'center', gap:6 }}>
              <span style={{ fontSize:16, lineHeight:1 }}>+</span> Upload image
            </button>
            <input ref={fileRef} type="file" accept="image/*" onChange={handleFileChange} style={{ display:'none' }} />
            <button onClick={onClose} style={{ padding:'7px 10px', borderRadius:8, border:'1px solid #E8ECF0', background:'#fff', color:'#6B7280', fontSize:18, cursor:'pointer', lineHeight:1 }}>×</button>
          </div>
        </div>

        {/* Upload form */}
        {showUpload && (
          <div style={{ padding:'14px 20px', background:'#F8FAFF', borderBottom:'1px solid #E8ECF0', display:'flex', gap:16, alignItems:'flex-end', flexShrink:0 }}>
            {newPreview && <img src={newPreview} style={{ width:64, height:64, objectFit:'cover', borderRadius:8, border:'1px solid #E8ECF0', flexShrink:0 }} alt="" />}
            <div style={{ flex:1, display:'flex', gap:10, flexWrap:'wrap' }}>
              <div style={{ flex:1, minWidth:160 }}>
                <div style={{ fontSize:11, fontWeight:600, color:'#6B7280', marginBottom:4 }}>Image name</div>
                <input value={newName} onChange={e=>setNewName(e.target.value)} placeholder="e.g. Company Logo"
                  style={{ width:'100%', padding:'7px 10px', border:'1px solid #DDE3EC', borderRadius:8, fontSize:13, outline:'none', boxSizing:'border-box' }} />
              </div>
              <div style={{ flex:1, minWidth:160 }}>
                <div style={{ fontSize:11, fontWeight:600, color:'#6B7280', marginBottom:4 }}>Category</div>
                <input value={newCat} onChange={e=>setNewCat(e.target.value)}
                  placeholder="e.g. Logos, Hardware…"
                  list="lib-cats"
                  style={{ width:'100%', padding:'7px 10px', border:'1px solid #DDE3EC', borderRadius:8, fontSize:13, outline:'none', boxSizing:'border-box' }} />
                <datalist id="lib-cats">
                  {categories.filter(c=>c!=='All').map(c=><option key={c} value={c}/>)}
                </datalist>
              </div>
            </div>
            <div style={{ display:'flex', gap:8, flexShrink:0 }}>
              <button onClick={()=>{setShowUpload(false);setNewFile(null);setNewPreview(null)}}
                style={{ padding:'7px 12px', borderRadius:8, border:'1px solid #E8ECF0', background:'#fff', color:'#6B7280', fontSize:13, cursor:'pointer' }}>Cancel</button>
              <button onClick={handleUpload} disabled={uploading || !newFile}
                style={{ padding:'7px 14px', borderRadius:8, border:'none', background: uploading ? '#9CA3AF' : '#22C55E', color:'#fff', fontSize:13, fontWeight:600, cursor: uploading ? 'default' : 'pointer' }}>
                {uploading ? 'Uploading…' : 'Save to library'}
              </button>
            </div>
          </div>
        )}

        {/* Category tabs + search */}
        <div style={{ padding:'12px 20px 0', borderBottom:'1px solid #E8ECF0', flexShrink:0 }}>
          <div style={{ display:'flex', gap:8, alignItems:'center', marginBottom:10, flexWrap:'wrap' }}>
            <div style={{ position:'relative', flex:1, minWidth:180, maxWidth:260 }}>
              <span style={{ position:'absolute', left:9, top:'50%', transform:'translateY(-50%)', color:'#9CA3AF', fontSize:13, pointerEvents:'none' }}>⌕</span>
              <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search images…"
                style={{ width:'100%', padding:'6px 10px 6px 28px', border:'1px solid #DDE3EC', borderRadius:8, fontSize:13, outline:'none', boxSizing:'border-box' }} />
            </div>
            <div style={{ fontSize:12, color:'#9CA3AF' }}>{filtered.length} image{filtered.length!==1?'s':''}</div>
          </div>
          <div style={{ display:'flex', gap:4, overflowX:'auto', paddingBottom:1 }}>
            {categories.map(cat => (
              <button key={cat} onClick={() => setActiveCat(cat)}
                style={{ padding:'5px 14px', borderRadius:'8px 8px 0 0', border:'none', cursor:'pointer', fontSize:12, fontWeight:600, whiteSpace:'nowrap', flexShrink:0, transition:'all .1s',
                  background: activeCat===cat ? '#fff' : 'transparent',
                  color: activeCat===cat ? '#5B8AF0' : '#9CA3AF',
                  borderBottom: activeCat===cat ? '2px solid #5B8AF0' : '2px solid transparent',
                }}>
                {cat}
              </button>
            ))}
          </div>
        </div>

        {/* Image grid */}
        <div style={{ flex:1, overflowY:'auto', padding:20 }}>
          {loading ? (
            <div style={{ display:'flex', justifyContent:'center', padding:'40px 0' }}><div className="spinner" /></div>
          ) : filtered.length === 0 ? (
            <div style={{ textAlign:'center', color:'#9CA3AF', padding:'40px 0', fontSize:14 }}>
              {images.length === 0 ? 'No images yet — upload your first image above' : 'No images match your search'}
            </div>
          ) : (
            <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(130px, 1fr))', gap:12 }}>
              {filtered.map(img => (
                <div key={img.id}
                  onClick={() => onSelect(img)}
                  onMouseEnter={() => setHoveredId(img.id)}
                  onMouseLeave={() => setHoveredId(null)}
                  style={{ borderRadius:10, border: hoveredId===img.id ? '2px solid #5B8AF0' : '2px solid #E8ECF0',
                    cursor:'pointer', overflow:'hidden', transition:'all .12s', background:'#F9FAFB',
                    boxShadow: hoveredId===img.id ? '0 4px 12px rgba(91,138,240,0.2)' : 'none',
                    transform: hoveredId===img.id ? 'translateY(-2px)' : 'none',
                    position:'relative' }}>
                  <div style={{ height:100, overflow:'hidden', background:'#F3F4F6', display:'flex', alignItems:'center', justifyContent:'center' }}>
                    <img src={pubUrl(img.path)} alt={img.name}
                      style={{ width:'100%', height:'100%', objectFit:'cover' }} />
                  </div>
                  <div style={{ padding:'7px 8px' }}>
                    <div style={{ fontSize:11, fontWeight:600, color:'#2A3042', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{img.name}</div>
                    {img.category && <div style={{ fontSize:10, color:'#9CA3AF', marginTop:2, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{img.category}</div>}
                  </div>
                  {hoveredId===img.id && (
                    <button onClick={e=>handleDelete(img,e)}
                      style={{ position:'absolute', top:6, right:6, width:22, height:22, borderRadius:6, border:'none', background:'rgba(0,0,0,0.5)', color:'#fff', fontSize:13, cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', lineHeight:1 }}>
                      ×
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
