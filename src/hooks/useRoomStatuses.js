import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'

const DEFAULT_ROOM_STATUSES = [
  { label:'Pending',                color:'#9CA3AF' },
  { label:'In progress',            color:'#5B8AF0' },
  { label:'Submitted for approval', color:'#F97316' },
  { label:'Review',                 color:'#EF9F27' },
  { label:'On hold',                color:'#E24B4A' },
  { label:'Nested',                 color:'#8B5CF6' },
  { label:'Complete',               color:'#1D9E75' },
]

const CACHE_KEY = 'joinery_room_statuses'

function getCached() {
  try {
    const raw = sessionStorage.getItem(CACHE_KEY)
    if (raw) return JSON.parse(raw)
  } catch {}
  return null
}

export function useRoomStatuses() {
  const [statuses, setStatuses] = useState(() => getCached() || DEFAULT_ROOM_STATUSES)

  useEffect(() => {
    supabase.from('app_settings').select('value').eq('key','room_statuses').maybeSingle()
      .then(({ data }) => {
        if (data?.value) {
          try {
            const v = typeof data.value === 'string' ? JSON.parse(data.value) : data.value
            if (Array.isArray(v) && v.length) {
              setStatuses(v)
              try { sessionStorage.setItem(CACHE_KEY, JSON.stringify(v)) } catch {}
            }
          } catch {}
        }
      })

    const handler = () => {
      supabase.from('app_settings').select('value').eq('key','room_statuses').maybeSingle()
        .then(({ data }) => {
          if (data?.value) {
            try {
              const v = typeof data.value === 'string' ? JSON.parse(data.value) : data.value
              if (Array.isArray(v) && v.length) {
                setStatuses(v)
                try { sessionStorage.setItem(CACHE_KEY, JSON.stringify(v)) } catch {}
              }
            } catch {}
          }
        })
    }
    window.addEventListener('room-statuses-updated', handler)
    return () => window.removeEventListener('room-statuses-updated', handler)
  }, [])

  return statuses
}

export { DEFAULT_ROOM_STATUSES }
