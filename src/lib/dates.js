/**
 * Consistent date formatting across the app — always dd/mm/yy NZ format
 */

// Format: 14/05/25
export function fmtDate(d) {
  if (!d) return ''
  const date = typeof d === 'string' ? new Date(d.includes('T') ? d : d + 'T00:00:00') : d
  if (isNaN(date.getTime())) return ''
  return date.toLocaleDateString('en-NZ', { day:'2-digit', month:'2-digit', year:'2-digit' })
}

// Format: 14 May 2025
export function fmtDateLong(d) {
  if (!d) return ''
  const date = typeof d === 'string' ? new Date(d.includes('T') ? d : d + 'T00:00:00') : d
  if (isNaN(date.getTime())) return ''
  return date.toLocaleDateString('en-NZ', { day:'numeric', month:'short', year:'numeric' })
}

// Format: 14/05/25 11:20 am
export function fmtDateTime(d) {
  if (!d) return ''
  const s = String(d).endsWith('Z') || String(d).includes('+') ? d : d + 'Z'
  const date = new Date(s)
  if (isNaN(date.getTime())) return ''
  return date.toLocaleString('en-NZ', { day:'2-digit', month:'2-digit', year:'2-digit', hour:'2-digit', minute:'2-digit', hour12:true })
}

// Format: 11:20 am
export function fmtTime(d) {
  if (!d) return ''
  const s = String(d).endsWith('Z') || String(d).includes('+') ? d : d + 'Z'
  const date = new Date(s)
  if (isNaN(date.getTime())) return ''
  return date.toLocaleTimeString('en-NZ', { hour:'2-digit', minute:'2-digit', hour12:true })
}

// Format: 14 May (no year, for calendar display)
export function fmtDateShort(d) {
  if (!d) return ''
  const date = typeof d === 'string' ? new Date(d.includes('T') ? d : d + 'T00:00:00') : d
  if (isNaN(date.getTime())) return ''
  return date.toLocaleDateString('en-NZ', { day:'numeric', month:'short' })
}

// Days until a date (negative = overdue)
export function daysUntil(dateStr) {
  if (!dateStr) return null
  const d = new Date(dateStr + 'T00:00:00')
  const today = new Date(); today.setHours(0,0,0,0)
  return Math.round((d - today) / 86400000)
}
