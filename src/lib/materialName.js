/**
 * buildMaterialName — shared utility to auto-generate a material's display name
 * from the nameFields settings configured in the Materials screen.
 *
 * Uses the same logic as buildName() in Materials.jsx but works standalone
 * so any screen (RoomDetail, Dashboard, etc.) can call it.
 */
import { supabase } from './supabase'

// Cache settings per category to avoid redundant DB calls
const settingsCache = {}

/**
 * Load name-building settings for a category (and its ancestors).
 * Returns { nfSet, cols, ancestors } or null if no nameFields configured.
 */
async function loadCatNameSettings(catId) {
  if (settingsCache[catId]) return settingsCache[catId]

  // Load all needed data in parallel
  const [
    { data: nfData },
    { data: cfData },
    { data: allCats },
    { data: catFieldsData },
  ] = await Promise.all([
    supabase.from('app_settings').select('value').eq('key', `mat_name_fields_${catId}`).maybeSingle(),
    supabase.from('app_settings').select('value').eq('key', `mat_cat_fields_${catId}`).maybeSingle(),
    supabase.from('material_categories').select('id,name,parent_id').order('name'),
    supabase.from('category_fields').select('*').eq('category_id', catId).order('sort_order'),
  ])

  if (!nfData?.value) return null // No name fields configured — don't rename

  let nfArray = []
  try { nfArray = JSON.parse(nfData.value) } catch { return null }
  if (!nfArray.length) return null

  const nfSet = new Set(nfArray)

  // Build visible columns list (same as Materials.jsx ALL_COLS + custom fields)
  const ALL_STANDARD_COLS = [
    { key:'supplier',    label:'Supplier',       w:140 },
    { key:'panel_type',  label:'Panel type',     w:120 },
    { key:'thickness',   label:'Thickness',      w:100, type:'mm' },
    { key:'colour_code', label:'Colour code',    w:120 },
    { key:'finish',      label:'Finish',         w:120 },
    { key:'price',       label:'Price',          w:100, type:'price' },
    { key:'sku',         label:'SKU',            w:120 },
    { key:'notes',       label:'Notes',          w:180 },
    { key:'brand',       label:'Brand',          w:120 },
    { key:'colour',      label:'Colour',         w:120 },
    { key:'grade',       label:'Grade',          w:120 },
    { key:'edge_profile',label:'Edge profile',   w:120 },
    { key:'dimensions',  label:'Dimensions',     w:130 },
    { key:'weight',      label:'Weight',         w:100 },
    { key:'unit',        label:'Unit',           w:80  },
    { key:'qty',         label:'Qty',            w:80  },
    { key:'lead_time',   label:'Lead time',      w:110 },
    { key:'min_order',   label:'Min order',      w:110 },
    { key:'po_number',   label:'PO number',      w:120 },
  ]

  // Which cols are visible for this category
  let visibleKeys = null
  if (cfData?.value) {
    try { visibleKeys = new Set(JSON.parse(cfData.value)) } catch {}
  }

  const cols = ALL_STANDARD_COLS.filter(c => !visibleKeys || visibleKeys.has(c.key))

  // Append custom fields as columns
  ;(catFieldsData || []).forEach(f => {
    cols.push({
      key: `custom_${f.id}`,
      label: f.label,
      fieldId: f.id,
      type: f.field_type,
      options: f.options,
      w: 120,
    })
  })

  // Build ancestor chain for this category
  const ancestors = []
  if (allCats) {
    let cur = allCats.find(c => c.id === catId)
    while (cur) {
      ancestors.unshift({ id: cur.id, name: cur.name, key: `cat_path_${cur.id}` })
      cur = cur.parent_id ? allCats.find(c => c.id === cur.parent_id) : null
    }
  }

  const result = { nfSet, cols, ancestors }
  settingsCache[catId] = result
  // Cache expires after 60s so settings changes are picked up
  setTimeout(() => { delete settingsCache[catId] }, 60000)
  return result
}

function safeJSON(val) {
  if (!val) return {}
  if (typeof val === 'object') return val
  try { return JSON.parse(val) } catch { return {} }
}

const NON_NATIVE = new Set([
  'brand','sku','colour','grade','edge_profile','dimensions',
  'weight','unit','qty','lead_time','min_order','po_number',
])

/**
 * Build the auto-name for a single material.
 * Returns the generated name string, or null if no nameFields are configured.
 */
export async function buildMaterialName(material) {
  if (!material?.category_id) return null

  const settings = await loadCatNameSettings(material.category_id)
  if (!settings) return null

  const { nfSet, cols, ancestors } = settings
  const cf = safeJSON(material.custom_fields)
  const parts = []

  // 1. Ancestor category path segments (starred ones)
  ancestors.forEach(a => {
    if (nfSet.has(a.key)) parts.push(a.name)
  })

  // 2. Column values in order
  cols.forEach(col => {
    if (col.type === 'image' || col.key === 'name') return
    if (!nfSet.has(col.key)) return

    let val = col.fieldId
      ? (cf[col.fieldId] || '')
      : NON_NATIVE.has(col.key)
        ? (cf[col.key] || '')
        : (material[col.key] || '')

    if (!val) return
    if (col.type === 'mm' && !String(val).toLowerCase().includes('mm')) val = val + 'mm'
    parts.push(String(val).trim())
  })

  return parts.filter(Boolean).join(' ') || null
}

/**
 * Enrich a list of materials with auto-generated names.
 * Only renames materials whose category has nameFields configured.
 * Returns a new array (does not mutate input).
 */
export async function enrichMaterialNames(materials) {
  if (!materials?.length) return materials

  // Group by category to batch settings loads
  const byCat = {}
  materials.forEach(m => {
    if (m.category_id) {
      if (!byCat[m.category_id]) byCat[m.category_id] = []
      byCat[m.category_id].push(m)
    }
  })

  // Load settings for all unique categories in parallel
  await Promise.all(Object.keys(byCat).map(cid => loadCatNameSettings(cid)))

  // Now build names (settings are cached)
  return Promise.all(materials.map(async m => {
    const name = await buildMaterialName(m)
    if (!name) return m
    return { ...m, name }
  }))
}
