import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useToast } from '../components/Toast'
import BackButton from '../components/BackButton'

const COLORS = ['#185FA5','#085041','#854F0B','#534AB7','#A32D2D','#0F6E56','#3C3489']
const initials = c => ((c.first_name||'?')[0]+(c.last_name||'?')[0]).toUpperCase()

function CustomerForm({ customer, onSave, onCancel }) {
  const toast = useToast()
  const [f, setF] = useState({
    first_name: customer?.first_name || '',
    last_name:  customer?.last_name  || '',
    phone:      customer?.phone      || '',
    email:      customer?.email      || '',
    company:    customer?.company    || '',
    address:    customer?.address    || '',
    city:       customer?.city       || '',
    postcode:   customer?.postcode   || '',
  })
  const set = k => e => setF(p => ({ ...p, [k]: e.target.value }))

  async function save() {
    if (!f.first_name || !f.last_name) { toast('Enter first and last name', 'error'); return }
    const { data, error } = customer?.id
      ? await supabase.from('customers').update(f).eq('id', customer.id).select().single()
      : await supabase.from('customers').insert(f).select().single()
    if (error) { toast(error.message, 'error'); return }
    toast('Customer saved ✓')
    onSave(data)
  }

  return (
    <div style={{ background:"#fff", borderRadius:12, border:"1px solid #E8ECF0", boxShadow:"0 1px 3px rgba(0,0,0,0.04)", padding:20, marginBottom:14 }}>
      <h2 className="text-base font-semibold text-[#2A3042] mb-4">{customer?.id ? 'Edit customer' : 'Add customer'}</h2>
      <div className="grid grid-cols-2 gap-3 mb-3">
        {[['first_name','First name','Sam'],['last_name','Last name','Mitchell'],['phone','Phone','027 555 0000'],['email','Email','sam@email.com']].map(([k,l,p]) => (
          <div key={k}><label className="label">{l}</label><input className="input" placeholder={p} value={f[k]} onChange={set(k)} /></div>
        ))}
        <div className="col-span-2"><label className="label">Company (optional)</label><input className="input" placeholder="Mitchell Constructions" value={f.company} onChange={set('company')} /></div>
        <div className="col-span-2 border-t border-[#F3F4F6] pt-3 mt-1">
          <div className="text-xs font-semibold text-[#9CA3AF] uppercase tracking-wider mb-2">Default delivery address</div>
        </div>
        <div className="col-span-2"><label className="label">Street address</label><input className="input" placeholder="12 Example St, Suburb" value={f.address} onChange={set('address')} /></div>
        <div><label className="label">City</label><input className="input" placeholder="Christchurch" value={f.city} onChange={set('city')} /></div>
        <div><label className="label">Postcode</label><input className="input" placeholder="8011" value={f.postcode} onChange={set('postcode')} /></div>
      </div>
      <div className="flex gap-2">
        <button onClick={save} className="btn-green">Save customer</button>
        <button onClick={onCancel} className="btn">Cancel</button>
      </div>
    </div>
  )
}

export default function Customers() {
  const toast = useToast()
  const [customers, setCustomers] = useState([])
  const [jobs, setJobs]           = useState([])
  const [loading, setLoading]     = useState(true)
  const [search, setSearch]       = useState('')
  const [editing, setEditing]     = useState(null) // null | 'new' | customer object

  useEffect(() => {
    Promise.all([
      supabase.from('customers').select('*').order('last_name'),
      supabase.from('jobs').select('id,customer_id'),
    ]).then(([{ data: c }, { data: j }]) => {
      setCustomers(c || [])
      setJobs(j || [])
      setLoading(false)
    })
  }, [])

  function jobCount(custId) { return jobs.filter(j => j.customer_id === custId).length }

  function onSaved(cust) {
    setCustomers(prev => {
      const i = prev.findIndex(x => x.id === cust.id)
      return i >= 0 ? prev.map((x, j) => j === i ? cust : x) : [...prev, cust]
    })
    setEditing(null)
  }

  async function deleteCustomer(cust) {
    if (!confirm(`Delete ${cust.first_name} ${cust.last_name}? This cannot be undone.`)) return
    const { error } = await supabase.from('customers').delete().eq('id', cust.id)
    if (error) { toast(error.message, 'error'); return }
    setCustomers(prev => prev.filter(x => x.id !== cust.id))
    toast('Customer deleted')
  }

  const filtered = search
    ? customers.filter(c => (c.first_name+' '+c.last_name+(c.company||'')+c.email).toLowerCase().includes(search.toLowerCase()))
    : customers

  return (
    <div>
      <BackButton to="/settings" label="Settings" />
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-xl font-bold text-[#2A3042]">Customers</h1>
        <button onClick={() => setEditing('new')} className="btn-green">+ Add customer</button>
      </div>

      {editing && (
        <CustomerForm
          customer={editing === 'new' ? null : editing}
          onSave={onSaved}
          onCancel={() => setEditing(null)}
        />
      )}

      <div className="relative mb-3">
        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[#9CA3AF] text-sm pointer-events-none">⌕</span>
        <input value={search} onChange={e => setSearch(e.target.value)}
          placeholder="Search customers…" className="input pl-9" />
      </div>

      {loading ? (
        <div className="flex justify-center py-12"><div className="spinner" /></div>
      ) : (
        <div style={{ background:"#fff", borderRadius:12, border:"1px solid #E8ECF0", boxShadow:"0 1px 3px rgba(0,0,0,0.04)", overflow:"hidden" }}>
          {filtered.length === 0 ? (
            <div className="p-8 text-center text-sm text-[#9CA3AF]">
              {search ? 'No customers match your search' : 'No customers yet — add one above'}
            </div>
          ) : filtered.map((c, i) => (
            <div key={c.id} className="flex items-center gap-3 px-4 py-3.5 border-b border-[#F3F4F6] last:border-0 hover:bg-[#F9FAFB]">
              <div className="w-9 h-9 rounded-full flex items-center justify-center text-xs font-bold text-white flex-shrink-0"
                style={{ background: COLORS[i % COLORS.length] }}>{initials(c)}</div>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-semibold text-[#2A3042]">
                  {c.first_name} {c.last_name}
                  {c.company && <span className="font-normal text-[#6B7280]"> · {c.company}</span>}
                </div>
                <div className="text-xs text-[#6B7280]">
                  {[c.phone, c.email].filter(Boolean).join(' · ')}
                </div>
                {c.address && (
                  <div className="text-xs text-[#9CA3AF] truncate">{[c.address, c.city].filter(Boolean).join(', ')}</div>
                )}
              </div>
              <div className="text-xs text-[#9CA3AF] bg-[#F3F4F6] rounded-full px-2 py-0.5 whitespace-nowrap flex-shrink-0">
                {jobCount(c.id)} job{jobCount(c.id) !== 1 ? 's' : ''}
              </div>
              <div className="flex gap-1 flex-shrink-0">
                <button onClick={() => setEditing(c)} className="btn btn-sm text-xs px-2 py-1">Edit</button>
                <button onClick={() => deleteCustomer(c)} className="btn btn-sm btn-red text-xs px-2 py-1">×</button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
