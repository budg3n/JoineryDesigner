import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useToast } from '../components/Toast'
import BackButton from '../components/BackButton'

const DEFAULT_UNITS = ['sheets', 'pcs', 'm', 'm²', 'm³', 'lm', 'kg', 'boxes', 'rolls', 'litres', 'sets', 'L', 'pairs']
const SETTINGS_KEY = 'unit_types'

export default function UnitSettings() {
  const navigate = useNavigate()
  const toast = useToast()
  const [units, setUnits] = useState(DEFAULT_UNITS)
  const [loading, setLoading] = useState(true)
  const [newUnit, setNewUnit] = useState('')
  const [saving, setSaving] = useState(false)
  const [editingIdx, setEditingIdx] = useState(null)
  const [editingVal, setEditingVal] = useState('')

  useEffect(() => {
    supabase.from('app_settings').select('value').eq('key', SETTINGS_KEY).maybeSingle()
      .then(({ data }) => {
        if (data?.value) {
          try { setUnits(JSON.parse(data.value)) } catch {}
        }
        setLoading(false)
      })
  }, [])

  async function save(newList) {
    setSaving(true)
    const value = JSON.stringify(newList)
    const { error } = await supabase.from('app_settings')
      .upsert({ key: SETTINGS_KEY, value, updated_at: new Date().toISOString() }, { onConflict: 'key' })
    if (error) {
      await supabase.from('app_settings').insert({ key: SETTINGS_KEY, value })
    }
    setUnits(newList)
    setSaving(false)
    // Broadcast so Materials/RoomDetail pick up changes
    window.dispatchEvent(new CustomEvent('unit-types-updated', { detail: newList }))
  }

  function addUnit() {
    const v = newUnit.trim()
    if (!v || units.includes(v)) { toast(units.includes(v) ? 'Already exists' : 'Enter a unit name', 'error'); return }
    save([...units, v])
    setNewUnit('')
    toast(`"${v}" added ✓`)
  }

  function deleteUnit(idx) {
    const u = units[idx]
    if (!confirm(`Remove "${u}"?`)) return
    save(units.filter((_, i) => i !== idx))
    toast(`"${u}" removed`)
  }

  function startEdit(idx) {
    setEditingIdx(idx)
    setEditingVal(units[idx])
  }

  function saveEdit(idx) {
    const v = editingVal.trim()
    if (!v) { setEditingIdx(null); return }
    const next = units.map((u, i) => i === idx ? v : u)
    save(next)
    setEditingIdx(null)
    toast('Updated ✓')
  }

  function moveUp(idx) {
    if (idx === 0) return
    const next = [...units]
    ;[next[idx-1], next[idx]] = [next[idx], next[idx-1]]
    save(next)
  }

  function moveDown(idx) {
    if (idx === units.length - 1) return
    const next = [...units]
    ;[next[idx], next[idx+1]] = [next[idx+1], next[idx]]
    save(next)
  }

  function resetDefaults() {
    if (!confirm('Reset to default units? This will replace your current list.')) return
    save(DEFAULT_UNITS)
    toast('Reset to defaults ✓')
  }

  return (
    <div style={{ maxWidth:560, margin:'0 auto' }}>
      <div style={{ display:'flex', alignItems:'center', gap:12, marginBottom:20 }}>
        <BackButton onClick={() => navigate('/settings')} />
        <div>
          <h1 style={{ fontSize:18, fontWeight:800, color:'#2A3042', margin:0 }}>Unit Types</h1>
          <p style={{ fontSize:12, color:'#9CA3AF', margin:'2px 0 0' }}>
            Units available when setting materials and creating orders
          </p>
        </div>
      </div>

      <div style={{ background:'#fff', borderRadius:14, border:'1px solid #E8ECF0', overflow:'hidden', marginBottom:16 }}>
        {/* Header */}
        <div style={{ padding:'12px 16px', borderBottom:'1px solid #F3F4F6', display:'flex', alignItems:'center', justifyContent:'space-between' }}>
          <span style={{ fontSize:11, fontWeight:700, color:'#9CA3AF', textTransform:'uppercase', letterSpacing:'.06em' }}>
            {units.length} unit{units.length !== 1 ? 's' : ''} {saving ? '· saving…' : ''}
          </span>
          <button onClick={resetDefaults}
            style={{ fontSize:11, color:'#9CA3AF', background:'none', border:'1px solid #E8ECF0', borderRadius:7, padding:'3px 10px', cursor:'pointer' }}>
            Reset defaults
          </button>
        </div>

        {loading ? (
          <div style={{ padding:'20px 16px', color:'#9CA3AF', fontSize:13 }}>Loading…</div>
        ) : units.map((u, idx) => (
          <div key={u+idx} style={{ display:'flex', alignItems:'center', gap:8, padding:'10px 16px', borderBottom:'1px solid #F3F4F6' }}
            onMouseEnter={e=>e.currentTarget.style.background='#FAFAFA'}
            onMouseLeave={e=>e.currentTarget.style.background='transparent'}>
            {/* Reorder */}
            <div style={{ display:'flex', flexDirection:'column', gap:1, flexShrink:0 }}>
              <button onClick={() => moveUp(idx)} disabled={idx===0}
                style={{ background:'none', border:'none', cursor:idx===0?'default':'pointer', color:idx===0?'#E8ECF0':'#9CA3AF', fontSize:10, padding:0, lineHeight:1 }}>▲</button>
              <button onClick={() => moveDown(idx)} disabled={idx===units.length-1}
                style={{ background:'none', border:'none', cursor:idx===units.length-1?'default':'pointer', color:idx===units.length-1?'#E8ECF0':'#9CA3AF', fontSize:10, padding:0, lineHeight:1 }}>▼</button>
            </div>

            {/* Label or edit input */}
            {editingIdx === idx ? (
              <input value={editingVal} onChange={e => setEditingVal(e.target.value)}
                onBlur={() => saveEdit(idx)}
                onKeyDown={e => { if (e.key === 'Enter') saveEdit(idx); if (e.key === 'Escape') setEditingIdx(null) }}
                autoFocus
                style={{ flex:1, padding:'5px 10px', border:'1px solid #5B8AF0', borderRadius:7, fontSize:13, outline:'none' }} />
            ) : (
              <span style={{ flex:1, fontSize:13, fontWeight:500, color:'#2A3042' }}>{u}</span>
            )}

            {/* Actions */}
            {editingIdx !== idx && (
              <div style={{ display:'flex', gap:4, flexShrink:0 }}>
                <button onClick={() => startEdit(idx)}
                  style={{ background:'none', border:'1px solid #E8ECF0', borderRadius:6, cursor:'pointer', padding:'3px 8px', fontSize:11, color:'#6B7280' }}
                  onMouseEnter={e=>e.currentTarget.style.borderColor='#5B8AF0'}
                  onMouseLeave={e=>e.currentTarget.style.borderColor='#E8ECF0'}>
                  Edit
                </button>
                <button onClick={() => deleteUnit(idx)}
                  style={{ background:'none', border:'1px solid #E8ECF0', borderRadius:6, cursor:'pointer', padding:'3px 8px', fontSize:11, color:'#D1D5DB' }}
                  onMouseEnter={e=>{ e.currentTarget.style.borderColor='#E24B4A'; e.currentTarget.style.color='#E24B4A' }}
                  onMouseLeave={e=>{ e.currentTarget.style.borderColor='#E8ECF0'; e.currentTarget.style.color='#D1D5DB' }}>
                  ×
                </button>
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Add new unit */}
      <div style={{ background:'#fff', borderRadius:14, border:'1px solid #E8ECF0', padding:16, display:'flex', gap:8 }}>
        <input value={newUnit} onChange={e => setNewUnit(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && addUnit()}
          placeholder="New unit (e.g. pallets, bundles…)"
          style={{ flex:1, padding:'8px 12px', border:'1px solid #DDE3EC', borderRadius:9, fontSize:13, outline:'none' }} />
        <button onClick={addUnit}
          style={{ padding:'8px 18px', borderRadius:9, border:'none', background:'#5B8AF0', color:'#fff', fontSize:13, fontWeight:600, cursor:'pointer' }}>
          Add
        </button>
      </div>
    </div>
  )
}

// ── Shared helper — load unit types from app_settings (with cache) ──
let _cachedUnits = null
let _cacheTime = 0

export async function loadUnitTypes() {
  const now = Date.now()
  if (_cachedUnits && now - _cacheTime < 30000) return _cachedUnits
  const { data } = await supabase.from('app_settings').select('value').eq('key', SETTINGS_KEY).maybeSingle()
  let units = DEFAULT_UNITS
  if (data?.value) { try { units = JSON.parse(data.value) } catch {} }
  _cachedUnits = units
  _cacheTime = now
  // Invalidate on update
  window.addEventListener('unit-types-updated', (e) => { _cachedUnits = e.detail; _cacheTime = Date.now() }, { once: false })
  return units
}
