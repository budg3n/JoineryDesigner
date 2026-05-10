import { useState, useEffect, useRef } from 'react'
import DropZone from '../components/DropZone'
import { supabase, pubUrl } from '../lib/supabase'
import { useApp } from '../context/AppContext'
import { useToast } from '../components/Toast'

// ── Helpers ───────────────────────────────────────────────────────
function isHeic(file) {
  return file.type === 'image/heic' || file.type === 'image/heif' ||
    file.name.toLowerCase().endsWith('.heic') || file.name.toLowerCase().endsWith('.heif')
}

function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2) }
function fmtTime(d) {
  if (!d) return ''
  const s = String(d).endsWith('Z') || String(d).includes('+') ? d : d + 'Z'
  const date = new Date(s)
  if (isNaN(date.getTime())) return ''
  return date.toLocaleString('en-NZ', { day:'numeric', month:'short', year:'numeric', hour:'2-digit', minute:'2-digit', hour12:true })
}

// ── Measurement groups (reuse from spec builder concept) ──────────
const MEAS_COLORS = ['#5B8AF0','#1D9E75','#EF9F27','#E24B4A','#7F77DD','#EC4899','#06B6D4','#374151']
const UNITS = ['mm','m','cm','inch','°','kg','L','pcs']

function SiteMeasures({ jobId }) {
  const toast = useToast()
  const [groups, setGroups]   = useState([])
  const [loading, setLoading] = useState(true)
  const [showAdd, setShowAdd] = useState(false)
  const [groupName, setGroupName] = useState('')
  const [groupColor, setGroupColor] = useState(MEAS_COLORS[0])
  const [addingTo, setAddingTo] = useState(null)
  const [newLabel, setNewLabel] = useState('')
  const [newUnit, setNewUnit]   = useState('mm')

  useEffect(() => {
    supabase.from('app_settings').select('value').eq('key', `site_measures_${jobId}`).maybeSingle()
      .then(({ data }) => {
        if (data?.value) setGroups(JSON.parse(data.value))
        setLoading(false)
      })
  }, [jobId])

  async function save(updated) {
    setGroups(updated)
    await supabase.from('app_settings').upsert({ key:`site_measures_${jobId}`, value:JSON.stringify(updated) }, { onConflict:'key' })
  }

  function addGroup() {
    if (!groupName.trim()) return
    const g = { id:uid(), name:groupName.trim(), color:groupColor, fields:[] }
    save([...groups, g])
    setGroupName(''); setGroupColor(MEAS_COLORS[0]); setShowAdd(false); setAddingTo(g.id)
  }

  function addField(gid) {
    if (!newLabel.trim()) return
    save(groups.map(g => g.id!==gid ? g : { ...g, fields:[...g.fields, {id:uid(),label:newLabel.trim(),unit:newUnit,value:''}] }))
    setNewLabel(''); setNewUnit('mm'); setAddingTo(null)
  }

  function setVal(gid, fid, value) {
    save(groups.map(g => g.id!==gid ? g : { ...g, fields:g.fields.map(f=>f.id!==fid?f:{...f,value}) }))
  }

  function removeField(gid, fid) {
    if (!confirm('Remove this measurement?')) return
    save(groups.map(g => g.id!==gid ? g : { ...g, fields:g.fields.filter(f=>f.id!==fid) }))
  }

  function removeGroup(gid) {
    if (!confirm('Remove this group?')) return
    save(groups.filter(g=>g.id!==gid))
  }

  async function linkToRoom(imgId, newRoomId) {
    await supabase.from('site_images').update({ room_id: newRoomId||null }).eq('id', imgId)
    setImages(p => p.map(img => img.id===imgId ? {...img, room_id:newRoomId||null} : img))
  }

  if (loading) return <div style={{padding:'24px 0',display:'flex',justifyContent:'center'}}><div className="spinner"/></div>

  return (
    <div>
      {groups.map(g => (
        <div key={g.id} style={{borderRadius:10,border:'1px solid #E8ECF0',overflow:'hidden',marginBottom:10}}>
          <div style={{padding:'8px 14px',background:g.color+'18',display:'flex',alignItems:'center',gap:8}}>
            <div style={{width:10,height:10,borderRadius:3,background:g.color,flexShrink:0}}/>
            <span style={{fontSize:12,fontWeight:700,color:g.color,flex:1}}>{g.name}</span>
            <button onClick={()=>removeGroup(g.id)} style={{background:'none',border:'none',cursor:'pointer',color:'rgba(0,0,0,0.2)',fontSize:15}}
              onMouseEnter={e=>e.currentTarget.style.color='#E24B4A'} onMouseLeave={e=>e.currentTarget.style.color='rgba(0,0,0,0.2)'}>×</button>
          </div>
          <div style={{padding:'12px 14px',background:'#fff'}}>
            {g.fields.length > 0 && (
              <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(130px,1fr))',gap:10,marginBottom:10}}>
                {g.fields.map(f => (
                  <div key={f.id} style={{position:'relative'}}>
                    <label style={{fontSize:11,fontWeight:600,color:'#6B7280',display:'block',marginBottom:4}}>{f.label}</label>
                    <div style={{position:'relative'}}>
                      <input type="number" value={f.value||''} onChange={e=>setVal(g.id,f.id,e.target.value)}
                        placeholder="0"
                        style={{width:'100%',padding:`7px ${f.unit?'30px':'10px'} 7px 10px`,border:'1px solid #DDE3EC',borderRadius:8,fontSize:13,outline:'none',boxSizing:'border-box'}}/>
                      {f.unit && <span style={{position:'absolute',right:9,top:'50%',transform:'translateY(-50%)',fontSize:11,color:'#9CA3AF',pointerEvents:'none'}}>{f.unit}</span>}
                    </div>
                    <button onClick={()=>removeField(g.id,f.id)}
                      style={{position:'absolute',top:-2,right:-4,background:'#fff',border:'1px solid #E8ECF0',borderRadius:'50%',width:16,height:16,display:'flex',alignItems:'center',justifyContent:'center',cursor:'pointer',fontSize:9,color:'#9CA3AF',padding:0}}
                      onMouseEnter={e=>{e.currentTarget.style.background='#FEF2F2';e.currentTarget.style.color='#E24B4A'}}
                      onMouseLeave={e=>{e.currentTarget.style.background='#fff';e.currentTarget.style.color='#9CA3AF'}}>×</button>
                  </div>
                ))}
              </div>
            )}
            {addingTo===g.id ? (
              <div style={{display:'flex',gap:6,padding:'10px 12px',background:'#F9FAFB',borderRadius:8,border:`1px dashed ${g.color}44`,alignItems:'flex-end',flexWrap:'wrap'}}>
                <div style={{flex:1,minWidth:140}}>
                  <div style={{fontSize:10,fontWeight:600,color:'#9CA3AF',marginBottom:3}}>Measurement name</div>
                  <input autoFocus value={newLabel} onChange={e=>setNewLabel(e.target.value)} onKeyDown={e=>e.key==='Enter'&&addField(g.id)}
                    placeholder="e.g. Wall width, Ceiling height…"
                    style={{width:'100%',padding:'6px 10px',border:'1px solid #DDE3EC',borderRadius:7,fontSize:12,outline:'none',boxSizing:'border-box'}}/>
                </div>
                <div style={{width:80}}>
                  <div style={{fontSize:10,fontWeight:600,color:'#9CA3AF',marginBottom:3}}>Unit</div>
                  <select value={newUnit} onChange={e=>setNewUnit(e.target.value)}
                    style={{width:'100%',padding:'6px 8px',border:'1px solid #DDE3EC',borderRadius:7,fontSize:12,outline:'none',background:'#fff'}}>
                    {UNITS.map(u=><option key={u}>{u}</option>)}
                  </select>
                </div>
                <button onClick={()=>addField(g.id)} disabled={!newLabel.trim()}
                  style={{padding:'6px 12px',borderRadius:7,border:'none',background:newLabel.trim()?g.color:'#E8ECF0',color:newLabel.trim()?'#fff':'#9CA3AF',fontSize:12,fontWeight:700,cursor:newLabel.trim()?'pointer':'not-allowed'}}>Add</button>
                <button onClick={()=>{setAddingTo(null);setNewLabel('');setNewUnit('mm')}}
                  style={{padding:'6px 10px',borderRadius:7,border:'1px solid #E8ECF0',background:'#fff',fontSize:12,cursor:'pointer',color:'#6B7280'}}>Cancel</button>
              </div>
            ) : (
              <button onClick={()=>{setAddingTo(g.id);setNewLabel('');setNewUnit('mm')}}
                style={{fontSize:11,fontWeight:700,padding:'5px 10px',borderRadius:7,border:`1px dashed ${g.color}66`,background:'transparent',color:g.color,cursor:'pointer',display:'flex',alignItems:'center',gap:4}}
                onMouseEnter={e=>e.currentTarget.style.background=g.color+'11'} onMouseLeave={e=>e.currentTarget.style.background='transparent'}>
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                Add measurement
              </button>
            )}
          </div>
        </div>
      ))}

      {!showAdd ? (
        <button onClick={()=>setShowAdd(true)}
          style={{width:'100%',padding:'9px 0',borderRadius:9,border:'1.5px dashed #C4D4F8',background:'transparent',color:'#5B8AF0',fontSize:12,fontWeight:700,cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center',gap:5}}
          onMouseEnter={e=>e.currentTarget.style.background='#EEF2FF'} onMouseLeave={e=>e.currentTarget.style.background='transparent'}>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
          Add measurement group
        </button>
      ) : (
        <div style={{padding:'14px 16px',background:'#F8FAFF',borderRadius:10,border:'1px solid #C4D4F8'}}>
          <div style={{fontSize:12,fontWeight:700,color:'#2A3042',marginBottom:10}}>New measurement group</div>
          <input autoFocus value={groupName} onChange={e=>setGroupName(e.target.value)} onKeyDown={e=>e.key==='Enter'&&addGroup()}
            placeholder="e.g. Kitchen dimensions, Living room, Hallway"
            style={{width:'100%',padding:'8px 12px',border:'1px solid #DDE3EC',borderRadius:8,fontSize:13,outline:'none',boxSizing:'border-box',marginBottom:10}}/>
          <div style={{marginBottom:10}}>
            <div style={{fontSize:11,fontWeight:600,color:'#6B7280',marginBottom:6}}>Colour</div>
            <div style={{display:'flex',gap:7,flexWrap:'wrap'}}>
              {MEAS_COLORS.map(mc=>(
                <button key={mc} onClick={()=>setGroupColor(mc)}
                  style={{width:28,height:28,borderRadius:'50%',background:mc,border:`3px solid ${groupColor===mc?'#2A3042':'transparent'}`,cursor:'pointer',padding:0}}/>
              ))}
            </div>
          </div>
          <div style={{display:'flex',gap:7}}>
            <button onClick={addGroup} disabled={!groupName.trim()}
              style={{fontSize:12,fontWeight:700,padding:'7px 16px',borderRadius:8,border:'none',background:groupName.trim()?'#5B8AF0':'#E8ECF0',color:groupName.trim()?'#fff':'#9CA3AF',cursor:groupName.trim()?'pointer':'not-allowed'}}>
              Create group
            </button>
            <button onClick={()=>{setShowAdd(false);setGroupName('');setGroupColor(MEAS_COLORS[0])}}
              style={{fontSize:12,fontWeight:600,padding:'7px 12px',borderRadius:8,border:'1px solid #E8ECF0',background:'#fff',cursor:'pointer',color:'#6B7280'}}>Cancel</button>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Image lightbox ────────────────────────────────────────────────
function Lightbox({ image, jobId, profiles, profile, onClose, onDeleted }) {
  const toast = useToast()
  const [comments, setComments] = useState([])
  const [newComment, setNewComment] = useState('')
  const [saving, setSaving] = useState(false)
  const [mentionQ, setMentionQ] = useState(null)
  const [mentionSel, setMentionSel] = useState(0)
  const inputRef = useRef()

  // Escape key closes
  useEffect(() => {
    const h = e => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [onClose])

  useEffect(() => {
    supabase.from('site_image_comments')
      .select('*, profiles(id,full_name,email)')
      .eq('image_id', image.id)
      .order('created_at', { ascending:true })
      .then(({ data }) => setComments(data||[]))
  }, [image.id])

  // @ detection
  function handleCommentChange(val) {
    setNewComment(val)
    const lastAt = val.lastIndexOf('@')
    if (lastAt >= 0 && !val.slice(lastAt+1).includes(' ')) {
      setMentionQ(val.slice(lastAt+1)); setMentionSel(0)
    } else setMentionQ(null)
  }

  function insertMention(p) {
    const lastAt = newComment.lastIndexOf('@')
    setNewComment(newComment.slice(0,lastAt) + `@${p.full_name||p.email} `)
    setMentionQ(null)
    inputRef.current?.focus()
    // notify
    if (p.id !== profile?.id) {
      supabase.from('notifications').insert({ user_id:p.id, type:'mention', title:`${profile?.full_name||'Someone'} mentioned you`, body:`on a site image`, job_id:jobId, read:false })
    }
  }

  async function addComment() {
    if (!newComment.trim() || saving) return
    setSaving(true)
    const { data, error } = await supabase.from('site_image_comments').insert({
      image_id: image.id, job_id: jobId,
      user_id: profile?.id, content: newComment.trim(),
    }).select('*, profiles(id,full_name,email)').single()
    if (!error) { setComments(p=>[...p,data]); setNewComment('') }
    setSaving(false)
  }

  async function deleteComment(id) {
    if (!confirm('Delete this comment?')) return
    await supabase.from('site_image_comments').delete().eq('id', id)
    setComments(p=>p.filter(c=>c.id!==id))
  }

  async function deleteImage() {
    if (!confirm('Delete this image? This cannot be undone.')) return
    await supabase.storage.from('job-files').remove([image.storage_path])
    await supabase.from('site_images').delete().eq('id', image.id)
    toast('Image deleted')
    onDeleted(image.id)
    onClose()
  }

  const filteredProfiles = (profiles||[]).filter(p => mentionQ ? (p.full_name||p.email||'').toLowerCase().includes(mentionQ.toLowerCase()) : true).slice(0,5)

  return (
    <div style={{position:'fixed',inset:0,zIndex:800,background:'rgba(0,0,0,0.92)',display:'flex',alignItems:'stretch'}}>
      {/* Close button — always on top, outside the flex children */}
      <button onClick={onClose}
        style={{position:'absolute',top:16,right:356,background:'rgba(255,255,255,0.2)',border:'none',borderRadius:'50%',width:40,height:40,display:'flex',alignItems:'center',justifyContent:'center',cursor:'pointer',color:'#fff',fontSize:22,zIndex:20,backdropFilter:'blur(4px)'}}
        onMouseEnter={e=>e.currentTarget.style.background='rgba(255,255,255,0.35)'}
        onMouseLeave={e=>e.currentTarget.style.background='rgba(255,255,255,0.2)'}>×</button>

      {/* Image area — click to close */}
      <div onClick={onClose} style={{flex:1,display:'flex',alignItems:'center',justifyContent:'center',padding:24,minWidth:0,cursor:'pointer'}}>
        {(() => {
          const imgUrl = supabase.storage.from('job-files').getPublicUrl(image.storage_path).data.publicUrl
          const looksHeic = image.storage_path?.toLowerCase().includes('.heic') || image.storage_path?.toLowerCase().includes('.heif')
          return looksHeic ? (
            <div style={{textAlign:'center',color:'#fff'}} onClick={e=>e.stopPropagation()}>
              <div style={{fontSize:48,marginBottom:16}}>🖼</div>
              <div style={{fontSize:15,fontWeight:700,marginBottom:8}}>HEIC Image</div>
              <div style={{fontSize:13,color:'rgba(255,255,255,0.7)',marginBottom:20}}>This format may not display in all browsers</div>
              <a href={imgUrl} download target="_blank" rel="noreferrer"
                style={{fontSize:13,fontWeight:700,padding:'10px 20px',borderRadius:10,background:'#5B8AF0',color:'#fff',textDecoration:'none',display:'inline-block'}}>
                ↓ Download to view
              </a>
            </div>
          ) : (
            <img src={imgUrl} alt={image.caption||'Site photo'}
              onClick={e=>e.stopPropagation()}
              style={{maxWidth:'100%',maxHeight:'calc(100vh - 48px)',objectFit:'contain',borderRadius:8,cursor:'default'}}/>
          )
        })()}
      </div>

      {/* Sidebar */}
      <div style={{width:340,background:'#fff',display:'flex',flexDirection:'column',flexShrink:0}}>
        {/* Header */}
        <div style={{padding:'14px 16px',borderBottom:'1px solid #F3F4F6',display:'flex',alignItems:'center',gap:10}}>
          <div style={{width:32,height:32,borderRadius:'50%',background:'#EEF2FF',display:'flex',alignItems:'center',justifyContent:'center',fontSize:12,fontWeight:700,color:'#5B8AF0',flexShrink:0}}>
            {(image.profiles?.full_name||'?')[0].toUpperCase()}
          </div>
          <div style={{flex:1,minWidth:0}}>
            <div style={{fontSize:13,fontWeight:700,color:'#2A3042'}}>{image.profiles?.full_name||'Unknown'}</div>
            <div style={{fontSize:11,color:'#9CA3AF'}}>{fmtTime(image.created_at)}</div>
          </div>
          {profile?.id === image.user_id && (
            <button onClick={deleteImage} style={{background:'none',border:'none',cursor:'pointer',color:'#9CA3AF',fontSize:11,fontWeight:600}}
              onMouseEnter={e=>e.currentTarget.style.color='#E24B4A'} onMouseLeave={e=>e.currentTarget.style.color='#9CA3AF'}>Delete</button>
          )}
        </div>

        {/* Caption */}
        {image.caption && (
          <div style={{padding:'12px 16px',borderBottom:'1px solid #F3F4F6',fontSize:13,color:'#374151',lineHeight:1.6}}>{image.caption}</div>
        )}

        {/* Comments */}
        <div style={{flex:1,overflowY:'auto',padding:'10px 16px'}}>
          {comments.length === 0 && <div style={{fontSize:12,color:'#9CA3AF',textAlign:'center',padding:'20px 0'}}>No comments yet</div>}
          {comments.map(c => (
            <div key={c.id} style={{display:'flex',gap:8,marginBottom:12,alignItems:'flex-start'}}>
              <div style={{width:28,height:28,borderRadius:'50%',background:'#EEF2FF',display:'flex',alignItems:'center',justifyContent:'center',fontSize:10,fontWeight:700,color:'#5B8AF0',flexShrink:0}}>
                {(c.profiles?.full_name||'?')[0].toUpperCase()}
              </div>
              <div style={{flex:1,minWidth:0}}>
                <div style={{fontSize:12,lineHeight:1.6}}>
                  <span style={{fontWeight:700,color:'#2A3042',marginRight:6}}>{c.profiles?.full_name||'Unknown'}</span>
                  <span style={{color:'#374151'}} dangerouslySetInnerHTML={{__html: c.content.replace(/@(\w[\w\s]*)/g,'<span style="color:#5B8AF0;font-weight:600">@$1</span>')}}/>
                </div>
                <div style={{display:'flex',alignItems:'center',gap:8,marginTop:2}}>
                  <span style={{fontSize:10,color:'#9CA3AF'}}>{fmtTime(c.created_at)}</span>
                  {c.user_id===profile?.id && (
                    <button onClick={()=>deleteComment(c.id)} style={{fontSize:10,color:'#9CA3AF',background:'none',border:'none',cursor:'pointer',padding:0}}
                      onMouseEnter={e=>e.currentTarget.style.color='#E24B4A'} onMouseLeave={e=>e.currentTarget.style.color='#9CA3AF'}>Delete</button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Comment input */}
        <div style={{padding:'12px 16px',borderTop:'1px solid #F3F4F6',position:'relative'}}>
          {/* Mention picker */}
          {mentionQ !== null && filteredProfiles.length > 0 && (
            <div style={{position:'absolute',bottom:'calc(100% + 4px)',left:16,right:16,background:'#fff',border:'1px solid #E8ECF0',borderRadius:10,boxShadow:'0 8px 24px rgba(0,0,0,0.12)',overflow:'hidden',zIndex:10}}>
              <div style={{padding:'4px 10px',fontSize:9,fontWeight:700,color:'#5B8AF0',textTransform:'uppercase',letterSpacing:'.06em',background:'#F8FAFF',borderBottom:'1px solid #F3F4F6'}}>Mention</div>
              {filteredProfiles.map((p,i)=>(
                <div key={p.id} onClick={()=>insertMention(p)}
                  style={{display:'flex',alignItems:'center',gap:8,padding:'8px 12px',cursor:'pointer',background:i===mentionSel?'#EEF2FF':'transparent'}}
                  onMouseEnter={()=>setMentionSel(i)}>
                  <div style={{width:24,height:24,borderRadius:'50%',background:'#EEF2FF',display:'flex',alignItems:'center',justifyContent:'center',fontSize:9,fontWeight:700,color:'#5B8AF0',flexShrink:0}}>
                    {(p.full_name||'?')[0].toUpperCase()}
                  </div>
                  <div>
                    <div style={{fontSize:12,fontWeight:600,color:'#2A3042'}}>{p.full_name||'—'}</div>
                    <div style={{fontSize:10,color:'#9CA3AF'}}>{p.email}</div>
                  </div>
                </div>
              ))}
            </div>
          )}
          <div style={{display:'flex',gap:8,alignItems:'flex-end'}}>
            <textarea ref={inputRef} value={newComment} onChange={e=>handleCommentChange(e.target.value)}
              onKeyDown={e=>{
                if(mentionQ!==null&&filteredProfiles.length){
                  if(e.key==='ArrowDown'){e.preventDefault();setMentionSel(s=>Math.min(s+1,filteredProfiles.length-1))}
                  if(e.key==='ArrowUp'){e.preventDefault();setMentionSel(s=>Math.max(s-1,0))}
                  if(e.key==='Enter'){e.preventDefault();insertMention(filteredProfiles[mentionSel]);return}
                }
                if(e.key==='Enter'&&!e.shiftKey&&mentionQ===null){e.preventDefault();addComment()}
              }}
              placeholder="Add a comment… @ to mention"
              rows={2}
              style={{flex:1,padding:'8px 10px',border:'1px solid #DDE3EC',borderRadius:9,fontSize:13,outline:'none',resize:'none',fontFamily:'inherit',lineHeight:1.5}}/>
            <button onClick={addComment} disabled={!newComment.trim()||saving}
              style={{padding:'8px 14px',borderRadius:9,border:'none',background:newComment.trim()?'#5B8AF0':'#E8ECF0',color:newComment.trim()?'#fff':'#9CA3AF',fontSize:12,fontWeight:700,cursor:newComment.trim()?'pointer':'not-allowed',flexShrink:0}}>
              Post
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Site Images feed ──────────────────────────────────────────────
function SiteImages({ jobId, profile, profiles, roomId=null, rooms=[] }) {
  const toast = useToast()
  const [images, setImages]       = useState([])
  const [loading, setLoading]     = useState(true)
  const [uploading, setUploading] = useState(false)
  const [lightbox, setLightbox]   = useState(null)
  const [caption, setCaption]     = useState('')
  const [pendingFiles, setPendingFiles] = useState([])   // File objects
  const [previews, setPreviews]   = useState([])         // blob URLs
  useEffect(() => {
    let q = supabase.from('site_images')
      .select('*, profiles(id,full_name,email)')
      .eq('job_id', jobId)
      .order('created_at', { ascending:false })
    if (roomId) q = q.eq('room_id', roomId)
    q.then(({ data }) => { setImages(data||[]); setLoading(false) })
  }, [jobId])

  async function upload() {
    if (!pendingFiles.length) return
    setUploading(true)
    for (const file of pendingFiles) {
      const path = `site-images/${jobId}/${Date.now()}-${file.name.replace(/\s+/g,'-')}`
      const { error: upErr } = await supabase.storage.from('job-files').upload(path, file, { contentType: file.type })
      if (upErr) { toast(upErr.message,'error'); continue }
      const { data, error } = await supabase.from('site_images').insert({
        job_id: jobId, user_id: profile?.id,
        storage_path: path, caption: caption.trim() || null,
        room_id: roomId || null,
      }).select('*, profiles(id,full_name,email)').single()
      if (!error) setImages(p=>[data,...p])
    }
    previews.forEach(p => p && p.startsWith('blob:') && URL.revokeObjectURL(p))
    setPendingFiles([]); setPreviews([]); setCaption(''); setUploading(false)
    toast(`${pendingFiles.length} photo${pendingFiles.length!==1?'s':''} uploaded ✓`)
  }

  function handleFiles(e) {
    const files = Array.from(e.target.files||[]).filter(f=>f.type.startsWith('image/'))
    if (!files.length) return
    // Revoke old previews first
    setPreviews(prev => { prev.forEach(p => p && p.startsWith('blob:') && URL.revokeObjectURL(p)); return [] })
    const urls = files.map(f => isHeic(f) ? '__heic__' : URL.createObjectURL(f))
    setPendingFiles(files)
    setPreviews(urls)
    e.target.value = ''
  }

  async function linkToRoom(imgId, newRoomId) {
    await supabase.from('site_images').update({ room_id: newRoomId||null }).eq('id', imgId)
    setImages(p => p.map(img => img.id===imgId ? {...img, room_id:newRoomId||null} : img))
  }

  if (loading) return <div style={{padding:'24px 0',display:'flex',justifyContent:'center'}}><div className="spinner"/></div>

  return (
    <div>
      {/* Upload area */}
      <div style={{background:'#fff',borderRadius:12,border:'1px solid #E8ECF0',padding:16,marginBottom:16}}>
        {pendingFiles.length === 0 ? (
          <DropZone
            onFiles={files=>{
              setPreviews(prev => { prev.forEach(p => p && p.startsWith('blob:') && URL.revokeObjectURL(p)); return [] })
              setPendingFiles(files)
              setPreviews(files.map(f => isHeic(f) ? '__heic__' : URL.createObjectURL(f)))
            }}
            accept="image/*" multiple icon="📸"
            label="Upload site photos"
            sublabel="Drag photos here or click to select — multiple supported"
            uploading={uploading}
          />
        ) : (
          <div>
            {/* Preview thumbnails */}
            <div style={{display:'flex',gap:8,flexWrap:'wrap',marginBottom:12}}>
              {pendingFiles.map((f,i) => (
                <div key={i} style={{position:'relative'}}>
                  {previews[i]==='__heic__' ? (
                    <div style={{width:72,height:72,borderRadius:8,border:'1px solid #E8ECF0',background:'#F3F4F6',display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',gap:2}}>
                      <span style={{fontSize:18}}>🖼</span>
                      <span style={{fontSize:9,fontWeight:700,color:'#9CA3AF'}}>HEIC</span>
                    </div>
                  ) : (
                    <img src={previews[i]||''} alt="" style={{width:72,height:72,objectFit:'cover',borderRadius:8,border:'1px solid #E8ECF0'}}/>
                  )}
                  <button onClick={()=>{
                    if (previews[i] && previews[i].startsWith('blob:')) URL.revokeObjectURL(previews[i])
                    setPendingFiles(p=>p.filter((_,j)=>j!==i))
                    setPreviews(p=>p.filter((_,j)=>j!==i))
                  }}
                    style={{position:'absolute',top:-4,right:-4,background:'#E24B4A',border:'none',borderRadius:'50%',width:18,height:18,display:'flex',alignItems:'center',justifyContent:'center',cursor:'pointer',color:'#fff',fontSize:11,padding:0}}>×</button>
                </div>
              ))}
              <label style={{width:72,height:72,borderRadius:8,border:'2px dashed #C4D4F8',display:'flex',alignItems:'center',justifyContent:'center',cursor:'pointer',color:'#5B8AF0',fontSize:24,flexShrink:0}}
                onMouseEnter={e=>e.currentTarget.style.background='#EEF2FF'} onMouseLeave={e=>e.currentTarget.style.background='transparent'}>
                +
                <input type="file" accept="image/*" multiple style={{display:'none'}} onChange={e=>{
                  const newFiles = Array.from(e.target.files||[])
                  if (!newFiles.length) return
                  const newUrls = newFiles.map(f => isHeic(f) ? '__heic__' : URL.createObjectURL(f))
                  setPendingFiles(p=>[...p,...newFiles])
                  setPreviews(p=>[...p,...newUrls])
                  e.target.value=''
                }}/>
              </label>
            </div>
            <input value={caption} onChange={e=>setCaption(e.target.value)}
              placeholder="Add a caption (optional)…"
              style={{width:'100%',padding:'8px 12px',border:'1px solid #DDE3EC',borderRadius:8,fontSize:13,outline:'none',boxSizing:'border-box',marginBottom:10}}/>
            <div style={{display:'flex',gap:8}}>
              <button onClick={upload} disabled={uploading}
                style={{fontSize:13,fontWeight:700,padding:'8px 18px',borderRadius:9,border:'none',background:'#5B8AF0',color:'#fff',cursor:'pointer',opacity:uploading?0.6:1,boxShadow:'0 2px 8px rgba(91,138,240,0.25)'}}>
                {uploading?'Uploading…':`Upload ${pendingFiles.length} photo${pendingFiles.length!==1?'s':''}`}
              </button>
              <button onClick={()=>{previews.forEach(p => p && p.startsWith('blob:') && URL.revokeObjectURL(p));setPendingFiles([]);setPreviews([]);setCaption('')}}
                style={{fontSize:12,fontWeight:600,padding:'8px 14px',borderRadius:9,border:'1px solid #E8ECF0',background:'#fff',cursor:'pointer',color:'#6B7280'}}>Cancel</button>
            </div>
          </div>
        )}

      </div>

      {/* Image grid */}
      {images.length === 0 ? (
        <div style={{textAlign:'center',padding:'40px 0',color:'#9CA3AF'}}>
          <div style={{fontSize:28,marginBottom:8}}>🏗</div>
          <div style={{fontSize:14,fontWeight:600,color:'#374151',marginBottom:4}}>No site photos yet</div>
          <div style={{fontSize:13}}>Upload photos from site visits, measurements and progress</div>
        </div>
      ) : (
        <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(150px,1fr))',gap:8}}>
          {images.map(img => {
            const url = supabase.storage.from('job-files').getPublicUrl(img.storage_path).data.publicUrl
            return (
              <div key={img.id} style={{position:'relative',aspectRatio:'1',borderRadius:10,overflow:'hidden',background:'#F3F4F6'}}
                onMouseEnter={e=>{ e.currentTarget.querySelector('.overlay').style.opacity='1'; e.currentTarget.querySelector('.link-btn')&&(e.currentTarget.querySelector('.link-btn').style.opacity='1') }}
                onMouseLeave={e=>{ e.currentTarget.querySelector('.overlay').style.opacity='0'; e.currentTarget.querySelector('.link-btn')&&(e.currentTarget.querySelector('.link-btn').style.opacity='0') }}>
                <img src={url} alt={img.caption||''}
                  style={{width:'100%',height:'100%',objectFit:'cover',cursor:'pointer'}}
                  onClick={()=>setLightbox(img)}
                  onError={e=>{
                    // HEIC can't display in Chrome — show placeholder
                    e.target.style.display='none'
                    e.target.nextSibling?.style && (e.target.nextSibling.style.display='flex')
                  }}/>
                <div style={{display:'none',width:'100%',height:'100%',alignItems:'center',justifyContent:'center',flexDirection:'column',gap:4,background:'#F3F4F6',cursor:'pointer'}} onClick={()=>setLightbox(img)}>
                  <span style={{fontSize:28}}>🖼</span>
                  <span style={{fontSize:10,fontWeight:700,color:'#9CA3AF'}}>HEIC photo</span>
                  <span style={{fontSize:9,color:'#C4C9D4'}}>Tap to view</span>
                </div>
                <div className="overlay" style={{position:'absolute',inset:0,background:'rgba(0,0,0,0.35)',opacity:0,transition:'opacity .2s',display:'flex',flexDirection:'column',justifyContent:'flex-end',padding:8,pointerEvents:'none'}}>
                  {img.caption && <div style={{fontSize:11,fontWeight:600,color:'#fff',lineHeight:1.3,overflow:'hidden',display:'-webkit-box',WebkitLineClamp:2,WebkitBoxOrient:'vertical'}}>{img.caption}</div>}
                  <div style={{fontSize:10,color:'rgba(255,255,255,0.75)',marginTop:2}}>{img.profiles?.full_name} · {fmtTime(img.created_at)}</div>
                </div>
                {/* Room badge */}
                {img.room_id && !roomId && (
                  <div style={{position:'absolute',top:5,left:5,fontSize:9,fontWeight:700,padding:'2px 6px',borderRadius:8,background:'rgba(91,138,240,0.9)',color:'#fff'}}>
                    {rooms.find(r=>r.id===img.room_id)?.name||'Room'}
                  </div>
                )}
                {/* Link to room — shown on hover, only in main job view */}
                {!roomId && rooms.length > 0 && (
                  <div className="link-btn" onClick={e=>e.stopPropagation()} style={{position:'absolute',bottom:5,right:5,opacity:0,transition:'opacity .2s'}}>
                    <select value={img.room_id||''} onChange={e=>linkToRoom(img.id,e.target.value||null)}
                      style={{fontSize:10,fontWeight:600,padding:'2px 4px',borderRadius:6,border:'none',background:'rgba(0,0,0,0.7)',color:'#fff',cursor:'pointer',outline:'none',maxWidth:90}}>
                      <option value="">No room</option>
                      {rooms.map(r=><option key={r.id} value={r.id}>{r.name}</option>)}
                    </select>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* Lightbox */}
      {lightbox && (
        <Lightbox
          image={lightbox}
          jobId={jobId}
          profiles={profiles}
          profile={profile}
          onClose={()=>setLightbox(null)}
          onDeleted={id=>setImages(p=>p.filter(i=>i.id!==id))}
        />
      )}
    </div>
  )
}

// ── Main OnSite component ─────────────────────────────────────────
export default function OnSite({ jobId, roomId=null }) {
  const { profile } = useApp()
  const [tab, setTab] = useState('images')
  const [profiles, setProfiles] = useState([])
  const [rooms, setRooms] = useState([])

  useEffect(() => {
    supabase.from('profiles').select('id,full_name,email').order('full_name').then(({data})=>setProfiles(data||[]))
    if (!roomId) {
      supabase.from('rooms').select('id,name').eq('job_id', jobId).order('sort_order').then(({data})=>setRooms(data||[]))
    }
  }, [jobId, roomId])

  return (
    <div>
      {/* Sub-tabs */}
      <div style={{display:'flex',gap:2,background:'#F3F4F6',borderRadius:10,padding:3,marginBottom:16}}>
        {[{key:'images',label:'📸 Site photos'},{key:'measures',label:'📐 Site measures'}].map(t=>(
          <button key={t.key} onClick={()=>setTab(t.key)}
            style={{flex:1,padding:'8px 12px',borderRadius:8,border:'none',cursor:'pointer',fontSize:13,fontWeight:tab===t.key?700:500,
              background:tab===t.key?'#fff':'transparent',color:tab===t.key?'#2A3042':'#6B7280',
              boxShadow:tab===t.key?'0 1px 3px rgba(0,0,0,0.1)':'none'}}>
            {t.label}
          </button>
        ))}
      </div>

      {tab==='images'   && <SiteImages jobId={jobId} profile={profile} profiles={profiles} roomId={roomId} rooms={rooms}/>}
      {tab==='measures' && <SiteMeasures jobId={jobId}/>}
    </div>
  )
}
