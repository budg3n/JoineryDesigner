/**
 * Simple sessionStorage cache for Supabase queries.
 * Data is fresh for the session — invalidated on page refresh.
 * Use for slow-changing data: categories, profiles, file types etc.
 */
export function getCached(key) {
  try {
    const raw = sessionStorage.getItem(`sb_cache_${key}`)
    if (!raw) return null
    const { data, ts } = JSON.parse(raw)
    // 5 minute TTL
    if (Date.now() - ts > 5 * 60 * 1000) { sessionStorage.removeItem(`sb_cache_${key}`); return null }
    return data
  } catch { return null }
}

export function setCached(key, data) {
  try { sessionStorage.setItem(`sb_cache_${key}`, JSON.stringify({ data, ts: Date.now() })) } catch {}
}

export async function cachedQuery(key, queryFn) {
  const cached = getCached(key)
  if (cached) return cached
  const { data } = await queryFn()
  if (data) setCached(key, data)
  return data || []
}
