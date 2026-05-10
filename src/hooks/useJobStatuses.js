import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'

const DEFAULT_STATUSES = [
  { label:'Pending',                color:'#9CA3AF' },
  { label:'In progress',            color:'#5B8AF0' },
  { label:'Submitted for approval', color:'#F97316' },
  { label:'Review',                 color:'#EF9F27' },
  { label:'On hold',                color:'#E24B4A' },
  { label:'Complete',               color:'#1D9E75' },
]

const CACHE_KEY = 'joinery_job_statuses'

function getCached() {
  try {
    const raw = sessionStorage.getItem(CACHE_KEY)
    if (raw) return JSON.parse(raw)
  } catch {}
  return null
}

export function useJobStatuses() {
  const [statuses, setStatuses] = useState(() => getCached() || DEFAULT_STATUSES)

  useEffect(() => {
    supabase.from('app_settings').select('value').eq('key','job_statuses').maybeSingle()
      .then(({ data }) => {
        if (data?.value) {
          const v = typeof data.value === 'string' ? JSON.parse(data.value) : data.value
          if (Array.isArray(v) && v.length) {
            setStatuses(v)
            try { sessionStorage.setItem(CACHE_KEY, JSON.stringify(v)) } catch {}
          }
        }
      })
  }, [])
  return statuses
}

export { DEFAULT_STATUSES }
