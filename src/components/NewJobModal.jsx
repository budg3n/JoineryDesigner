import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { useToast } from './Toast'
import Modal from './Modal'

const CUST_COLORS = ['#185FA5','#085041','#854F0B','#534AB7','#A32D2D','#0F6E56','#3C3489']
function custInitials(c) { return ((c.first_name||'?')[0] + (c.last_name||'?')[0]).toUpperCase() }
function custColor(c, i) { return CUST_COLORS[i % CUST_COLORS.length] }

function CustomerPicker({ customers, onSelect, onAddNew }) {
  const [q, setQ] = useState('')
  const filtered = q ? customers.filter(c =>
    (c.first_name + ' ' + c.last_name + (c.company||'') + (c.email||'')).toLowerCase().includes(q.toLowerCase())
  ) : customers

  return (
    <div>
      <div className="relative mb-2">
        <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[#9CA3AF] text-sm pointer-events-none">⌕</span>
        <input value={q} onChange={e => setQ(e.target.value)}
          placeholder="Search customers…" className="input pl-8 text-sm" />
      </div>
      <div className="border border-[#E8ECF0] rounded-lg overflow-hidden max-h-48 overflow-y-auto mb-2">
        {filtered.length === 0 ? (
          <div className="p-3 text-sm text-[#9CA3AF] text-center">No customers found</div>
        ) : filtered.map((c, i) => (
          <div key={c.id} onClick={() => onSelect(c)}
            className="flex items-center gap-2.5 px-3 py-2 cursor-pointer hover:bg-[#F9FAFB] border-b border-[#F3F4F6] last:border-0">
            <div className="w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-bold text-white flex-shrink-0"
              style={{ background: custColor(c, i) }}>{custInitials(c)}</div>
            <div>
              <div className="text-sm font-medium text-[#2A3042]">
                {c.first_name} {c.last_name}{c.company ? ` · ${c.company}` : ''}
              </div>
              <div className="text-xs text-[#9CA3AF]">{c.phone}{c.phone && c.email ? ' · ' : ''}{c.email}</div>
            </div>
          </div>
        ))}
      </div>
      <button onClick={onAddNew} className="text-xs text-blue-600 hover:text-blue-800 cursor-pointer bg-transparent border-none flex items-center gap-1">
        + Add new customer
      </button>
    </div>
  )
}

function NewCustomerForm({ onSaved, onCancel }) {
  const toast = useToast()
  const [f, setF] = useState({ first_name:'', last_name:'', phone:'', email:'', company:'', address:'', city:'', postcode:'' })
  const set = k => e => setF(p => ({ ...p, [k]: e.target.value }))

  async function save() {
    if (!f.first_name || !f.last_name) { toast('Enter first and last name', 'error'); return }
    const { data, error } = await supabase.from('customers').insert(f).select().single()
    if (error) { toast(error.message, 'error'); return }
    toast('Customer saved ✓')
    onSaved(data)
  }

  return (
    <div className="border border-[#E8ECF0] rounded-xl p-4 mb-3 bg-[#F9FAFB]">
      <div className="text-xs font-semibold text-[#6B7280] uppercase tracking-wider mb-3">New customer</div>
      <div className="grid grid-cols-2 gap-3 mb-3">
        {[['first_name','First name','Sam'],['last_name','Last name','Mitchell'],['phone','Phone','027 555 0000'],['email','Email','sam@email.com']].map(([k,l,p]) => (
          <div key={k}><label className="label">{l}</label><input className="input text-sm" placeholder={p} value={f[k]} onChange={set(k)} /></div>
        ))}
        <div className="col-span-2"><label className="label">Company (optional)</label><input className="input text-sm" placeholder="Mitchell Constructions" value={f.company} onChange={set('company')} /></div>
        <div className="col-span-2"><label className="label">Default delivery address</label><input className="input text-sm" placeholder="12 Example St, Suburb" value={f.address} onChange={set('address')} /></div>
        <div><label className="label">City</label><input className="input text-sm" placeholder="Christchurch" value={f.city} onChange={set('city')} /></div>
        <div><label className="label">Postcode</label><input className="input text-sm" placeholder="8011" value={f.postcode} onChange={set('postcode')} /></div>
      </div>
      <div className="flex gap-2">
        <button onClick={save} className="btn-green btn-sm">Save customer</button>
        <button onClick={onCancel} className="btn btn-sm">Cancel</button>
      </div>
    </div>
  )
}

export default function NewJobModal({ show, onClose, onCreated, nextId }) {
  const toast = useToast()
  const [customers, setCustomers] = useState([])
  const [profiles, setProfiles]   = useState([])
  const [selCust, setSelCust]     = useState(null)
  const [showNewCust, setShowNewCust] = useState(false)
  const [saving, setSaving]       = useState(false)
  const [form, setForm] = useState({
    name:'', type:'Kitchen', mvnum:'', budget_hours:'',
    order_date: new Date().toISOString().slice(0,10),
    due_date:'', addr:'', city:'', postcode:'',
    pm:'', notes:''
  })
  const set = k => e => setForm(p => ({ ...p, [k]: e.target.value }))

  useEffect(() => {
    if (!show) return
    setSelCust(null); setShowNewCust(false)
    setForm({ name:'', type:'Kitchen', mvnum:'', budget_hours:'',
      order_date: new Date().toISOString().slice(0,10),
      due_date:'', addr:'', city:'', postcode:'', pm:'', notes:'' })
    Promise.all([
      supabase.from('customers').select('*').order('last_name'),
      supabase.from('profiles').select('*').in('role', ['Admin','Project Manager'])
    ]).then(([{ data: c }, { data: p }]) => {
      setCustomers(c || [])
      setProfiles(p || [])
    })
  }, [show])

  function selectCustomer(c) {
    setSelCust(c)
    setShowNewCust(false)
    setForm(f => ({
      ...f,
      name: f.name || `${c.first_name} ${c.last_name} — `,
      addr: c.address || f.addr,
      city: c.city    || f.city,
      postcode: c.postcode || f.postcode,
    }))
  }

  function newCustSaved(c) {
    setCustomers(prev => [...prev, c])
    selectCustomer(c)
    setShowNewCust(false)
  }

  async function handleCreate() {
    if (!form.name.trim()) { toast('Please enter a job name', 'error'); return }
    setSaving(true)
    const deliveryAddr = [form.addr, form.city, form.postcode].filter(Boolean).join(', ')
    const job = {
      id: nextId,
      name: form.name.trim(),
      client: selCust ? `${selCust.first_name} ${selCust.last_name}` : '',
      customer_id: selCust?.id || null,
      type: form.type,
      status: 'In progress',
      notes: form.notes,
      mvnum: form.mvnum,
      start_date: form.order_date,
      due_date: form.due_date,
      delivery_address: deliveryAddr,
      budget_hours: parseFloat(form.budget_hours) || 0,
      time_logged: 0,
      assigned_pm: form.pm || null,
      tasks: '[]',
    }
    const { data, error } = await supabase.from('jobs').insert(job).select().single()
    setSaving(false)
    if (error) { toast(error.message, 'error'); return }
    toast('Job created ✓')
    onClose()
    onCreated(data || job)
  }

  return (
    <Modal show={show} onClose={onClose} title="New job" maxWidth="max-w-xl"
      footer={<>
        <button onClick={onClose} className="btn">Cancel</button>
        <button onClick={handleCreate} disabled={saving} className="btn-green disabled:opacity-50">
          {saving ? 'Creating…' : 'Create job'}
        </button>
      </>}>

      <div className="text-xs text-[#9CA3AF] font-mono bg-[#F9FAFB] rounded-lg px-2 py-1 inline-block mb-4">{nextId}</div>

      {/* customer */}
      <div className="text-[10px] font-semibold text-[#9CA3AF] uppercase tracking-wider mb-2 mt-1 pb-1 border-b border-[#F3F4F6]">Customer</div>
      {selCust ? (
        <div className="flex items-center gap-2.5 px-3 py-2 bg-blue-50 border border-blue-200 rounded-lg mb-3">
          <div className="w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-bold text-white flex-shrink-0"
            style={{ background: CUST_COLORS[customers.indexOf(selCust) % CUST_COLORS.length] }}>{custInitials(selCust)}</div>
          <div className="flex-1">
            <div className="text-sm font-medium text-blue-900">{selCust.first_name} {selCust.last_name}{selCust.company ? ` — ${selCust.company}` : ''}</div>
            <div className="text-xs text-blue-600">{selCust.phone}{selCust.phone && selCust.email ? ' · ' : ''}{selCust.email}</div>
          </div>
          <button onClick={() => setSelCust(null)} className="text-xs text-blue-600 hover:text-blue-800 bg-transparent border-none cursor-pointer">Change</button>
        </div>
      ) : showNewCust ? (
        <NewCustomerForm onSaved={newCustSaved} onCancel={() => setShowNewCust(false)} />
      ) : (
        <CustomerPicker customers={customers} onSelect={selectCustomer} onAddNew={() => setShowNewCust(true)} />
      )}

      {/* delivery address */}
      <div className="text-[10px] font-semibold text-[#9CA3AF] uppercase tracking-wider mb-2 mt-4 pb-1 border-b border-[#F3F4F6]">Delivery address</div>
      <div className="grid grid-cols-2 gap-3 mb-1">
        <div className="col-span-2"><label className="label">Street address</label><input className="input text-sm" placeholder="12 Example St, Suburb" value={form.addr} onChange={set('addr')} /></div>
        <div><label className="label">City</label><input className="input text-sm" placeholder="Christchurch" value={form.city} onChange={set('city')} /></div>
        <div><label className="label">Postcode</label><input className="input text-sm" placeholder="8011" value={form.postcode} onChange={set('postcode')} /></div>
      </div>

      {/* job details */}
      <div className="text-[10px] font-semibold text-[#9CA3AF] uppercase tracking-wider mb-2 mt-4 pb-1 border-b border-[#F3F4F6]">Job details</div>
      <div className="grid grid-cols-2 gap-3">
        <div className="col-span-2"><label className="label">Job name *</label><input className="input text-sm" placeholder="e.g. Hampden Kitchen" value={form.name} onChange={set('name')} /></div>
        <div><label className="label">Job type</label>
          <select className="input text-sm" value={form.type} onChange={set('type')}>
            {['Kitchen','Joinery','Laundry','Wardrobe','Other'].map(t => <option key={t}>{t}</option>)}
          </select>
        </div>
        <div><label className="label">Microvellum #</label><input className="input text-sm" placeholder="MV-2026-…" value={form.mvnum} onChange={set('mvnum')} /></div>
        <div><label className="label">Order date</label><input className="input text-sm" type="date" value={form.order_date} onChange={set('order_date')} /></div>
        <div><label className="label">Required by</label><input className="input text-sm" type="date" value={form.due_date} onChange={set('due_date')} /></div>
        <div><label className="label">Budget hours</label><input className="input text-sm" type="number" placeholder="e.g. 24" min="0" value={form.budget_hours} onChange={set('budget_hours')} /></div>
        <div><label className="label">Assign to PM</label>
          <select className="input text-sm" value={form.pm} onChange={set('pm')}>
            <option value="">— Unassigned —</option>
            {profiles.map(p => <option key={p.id} value={p.id}>{p.full_name || p.email}</option>)}
          </select>
        </div>
        <div className="col-span-2"><label className="label">Notes</label>
          <textarea className="input text-sm min-h-[60px] resize-y" placeholder="Site access, special requirements, client preferences…" value={form.notes} onChange={set('notes')} />
        </div>
      </div>
    </Modal>
  )
}
