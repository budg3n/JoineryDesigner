/**
 * NotionNotes — drop-in Notion-style block editor for any context.
 * Loads/creates a note from the DB keyed by (job_id, room_id, context).
 * Replaces plain <textarea> notes throughout the app.
 */
import { useState, useEffect, useRef } from 'react'
import { supabase } from '../lib/supabase'
import { useApp } from '../context/AppContext'
import { useToast } from './Toast'
import { NoteEditor } from '../screens/Notes'

export default function NotionNotes({ jobId, roomId, context = 'general', placeholder, minHeight = 120 }) {
  const { profile } = useApp()
  const toast  = useToast()
  const [note, setNote]       = useState(null)
  const [allNotes, setAllNotes] = useState([])
  const [allJobs, setAllJobs]   = useState([])
  const [loading, setLoading]   = useState(true)

  useEffect(() => {
    // Load all notes + jobs for linking in the editor
    Promise.all([
      supabase.from('notes').select('id,title,job_id').order('updated_at', { ascending:false }),
      supabase.from('jobs').select('id,name').order('name'),
    ]).then(([{data:n},{data:j}]) => {
      setAllNotes(n||[])
      setAllJobs(j||[])
    })
  }, [])

  useEffect(() => {
    if (!jobId && !roomId) { setLoading(false); return }
    // Find existing note for this context
    let q = supabase.from('notes').select('*')
    if (roomId)  q = q.eq('room_id', roomId).eq('context', context)
    else         q = q.eq('job_id', jobId).eq('context', context)
    q.maybeSingle().then(({ data }) => {
      if (data) {
        setNote({ ...data, content: typeof data.content === 'string' ? JSON.parse(data.content) : data.content })
      }
      setLoading(false)
    })
  }, [jobId, roomId, context])

  function handleSave(saved) {
    setNote(saved)
  }

  if (loading) return <div style={{ padding:'12px 0', color:'#9CA3AF', fontSize:12 }}>Loading…</div>

  // Build a stub note for new contexts
  const noteForEditor = note || {
    id: null,
    title: '',
    job_id: jobId || null,
    room_id: roomId || null,
    context,
    is_public: false,
    content: { blocks: [] },
  }

  return (
    <div style={{ minHeight }}>
      <NoteEditor
        key={`${jobId}-${roomId}-${context}-${note?.id || 'new'}`}
        note={noteForEditor}
        allNotes={allNotes}
        jobs={allJobs}
        floating={true}
        onSave={handleSave}
        onClose={()=>{}}
        onBack={()=>{}}
      />
    </div>
  )
}
