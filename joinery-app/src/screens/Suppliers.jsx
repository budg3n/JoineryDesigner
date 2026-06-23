import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { useToast } from '../components/Toast'
import BackButton from '../components/BackButton'

const COLORS = ['#185FA5','#085041','#854F0B','#534AB7','#A32D2D','#0F6E56','#3C3489']
const initials = s => ((s.name||'?')[0] + (s.name?.split(' ')[1]?.[0] || '')).toUpperCase()

function SupplierForm({ supplier, onSave, onCancel }) {
  const toast = useToast()
  const [f, setF] = useState({
    name:     supplier?.name     || '',
    contact:  supplier?.contact  || '',
    phone:    supplier?.phone    || '',
    email:    supplier?.email    || '',
    website:  supplier?.website  || '',
    address:  supplier?.address  || '',
    city:     supplier?.city     || '',
    postcode: supplier?.postcode || '',
    account_number: supplier?.account_number || '',
    notes:    supplier?.notes    || '',
  })
  const set = k => e => setF(p => ({ ...p, [k]: e.target.value }))

  async function save() {
    if (!f.name.trim()) { toast('Enter a supplier name', 'error'); return }
    const { data, error } = supplier?.id
      ? await supabase.from('suppliers').update(f).eq('id', supplier.id).select().single()
      : await supabase.from('suppliers').insert(f).select().single()
    if (error) { toast(error.message, 'error'); return }
    toast('Supplier saved ✓')
    onSave(data)
  }

  return (
    <div style={{ background:"#fff", borderRadius:12, border:"1px solid #E8ECF0", boxShadow:"0 1px 3px rgba(0,0,0,0.04)", padding:20, marginBottom:14 }}>
      <h2 className="text-base font-semibold text-[#2A3042] mb-4">{supplier?.id ? 'Edit supplier' : 'Add supplier'}</h2>
      <div className="grid grid-cols-2 gap-3 mb-3">
        <div className="col-span-2"><label className="label">Supplier name *</label><input className="input" placeholder="e.g. Laminex, Archant, Prime Panels" value={f.name} onChange={set('name')} /></div>
        {[['contact','Contact person','Rob Smith'],['phone','Phone','03 555 0000'],['email','Email','orders@supplier.co.nz'],['website','Website','www.supplier.co.nz']].map(([k,l,p]) => (
          <div key={k}><label className="label">{l}</label><input className="input" placeholder={p} value={f[k]} onChange={set(k)} /></div>
        ))}
        <div className="col-span-2"><label className="label">Account number (optional)</label><input className="input" placeholder="ACC-00123" value={f.account_number} onChange={set('account_number')} /></div>
        <div className="col-span-2 border-t border-[#F3F4F6] pt-3 mt-1">
          <div className="text-xs font-semibold text-[#9CA3AF] uppercase tracking-wider mb-2">Address</div>
        </div>
        <div className="col-span-2"><label className="label">Street address</label><input className="input" placeholder="12 Example St, Suburb" value={f.address} onChange={set('address')} /></div>
        <div><label className="label">City</label><input className="input" placeholder="Christchurch" value={f.city} onChange={set('city')} /></div>
        <div><label className="label">Postcode</label><input className="input" placeholder="8011" value={f.postcode} onChange={set('postcode')} /></div>
        <div className="col-span-2"><label className="label">Notes</label><input className="input" placeholder="Lead times, account terms, etc." value={f.notes} onChange={set('notes')} /></div>
      </div>
      <div className="flex gap-2">
        <button onClick={save} className="btn-green">Save supplier</button>
        <button onClick={onCancel} className="btn">Cancel</button>
      </div>
    </div>
  )
}

export default function Suppliers() {
  const toast = useToast()
  const [suppliers, setSuppliers] = useState([])
  const [productCounts, setProductCounts] = useState({})
  const [loading, setLoading]     = useState(true)
  const [search, setSearch]       = useState('')
  const [editing, setEditing]     = useState(null) // null | 'new' | supplier object

  useEffect(() => {
    Promise.all([
      supabase.from('suppliers').select('*').order('name'),
      supabase.from('material_suppliers').select('supplier_id'),
    ]).then(([{ data: s }, { data: ms }]) => {
      setSuppliers(s || [])
      const counts = {}
      ;(ms || []).forEach(m => { counts[m.supplier_id] = (counts[m.supplier_id] || 0) + 1 })
      setProductCounts(counts)
      setLoading(false)
    })
  }, [])

  function onSaved(sup) {
    setSuppliers(prev => {
      const i = prev.findIndex(x => x.id === sup.id)
      return i >= 0 ? prev.map((x, j) => j === i ? sup : x) : [...prev, sup].sort((a,b) => (a.name||'').localeCompare(b.name||''))
    })
    setEditing(null)
  }

  async function deleteSupplier(sup) {
    const count = productCounts[sup.id] || 0
    const msg = count > 0
      ? `Delete "${sup.name}"? This will remove pricing for ${count} product${count!==1?'s':''} linked to this supplier.`
      : `Delete "${sup.name}"? This cannot be undone.`
    if (!confirm(msg)) return
    await supabase.from('material_suppliers').delete().eq('supplier_id', sup.id)
    const { error } = await supabase.from('suppliers').delete().eq('id', sup.id)
    if (error) { toast(error.message, 'error'); return }
    setSuppliers(prev => prev.filter(x => x.id !== sup.id))
    toast('Supplier deleted')
  }

  const filtered = search
    ? suppliers.filter(s => (s.name+' '+(s.contact||'')+' '+(s.city||'')).toLowerCase().includes(search.toLowerCase()))
    : suppliers

  return (
    <div>
      <BackButton to="/settings" label="Settings" />
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-xl font-bold text-[#2A3042]">Suppliers</h1>
        <button onClick={() => setEditing('new')} className="btn-green">+ Add supplier</button>
      </div>

      {editing && (
        <SupplierForm
          supplier={editing === 'new' ? null : editing}
          onSave={onSaved}
          onCancel={() => setEditing(null)}
        />
      )}

      <div className="relative mb-3">
        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[#9CA3AF] text-sm pointer-events-none">⌕</span>
        <input value={search} onChange={e => setSearch(e.target.value)}
          placeholder="Search suppliers…" className="input pl-9" />
      </div>

      {loading ? (
        <div className="flex justify-center py-12"><div className="spinner" /></div>
      ) : (
        <div style={{ background:"#fff", borderRadius:12, border:"1px solid #E8ECF0", boxShadow:"0 1px 3px rgba(0,0,0,0.04)", overflow:"hidden" }}>
          {filtered.length === 0 ? (
            <div className="p-8 text-center text-sm text-[#9CA3AF]">
              {search ? 'No suppliers match your search' : 'No suppliers yet — add one above'}
            </div>
          ) : filtered.map((s, i) => (
            <div key={s.id} className="flex items-center gap-3 px-4 py-3.5 border-b border-[#F3F4F6] last:border-0 hover:bg-[#F9FAFB]">
              <div className="w-9 h-9 rounded-full flex items-center justify-center text-xs font-bold text-white flex-shrink-0"
                style={{ background: COLORS[i % COLORS.length] }}>{initials(s)}</div>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-semibold text-[#2A3042]">{s.name}</div>
                <div className="text-xs text-[#6B7280]">
                  {[s.contact, s.phone, s.email].filter(Boolean).join(' · ')}
                </div>
                {s.address && (
                  <div className="text-xs text-[#9CA3AF] truncate">{[s.address, s.city].filter(Boolean).join(', ')}</div>
                )}
              </div>
              <div className="text-xs text-[#9CA3AF] bg-[#F3F4F6] rounded-full px-2 py-0.5 whitespace-nowrap flex-shrink-0">
                {productCounts[s.id] || 0} product{(productCounts[s.id]||0) !== 1 ? 's' : ''}
              </div>
              <div className="flex gap-1 flex-shrink-0">
                <button onClick={() => setEditing(s)} className="btn btn-sm text-xs px-2 py-1">Edit</button>
                <button onClick={() => deleteSupplier(s)} className="btn btn-sm btn-red text-xs px-2 py-1">×</button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
