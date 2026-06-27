import { useState, useEffect } from 'react'
import { supabase, pubUrl, BUCKET } from '../lib/supabase'
import { useToast } from '../components/Toast'
import BackButton from '../components/BackButton'
import ImageLibrary from '../components/ImageLibrary'

const initials = c => {
  if (c.first_name || c.last_name)
    return ((c.first_name||'')[0]||(c.last_name||'')[0]||'?').toUpperCase() +
           ((c.last_name||'')[0]||'').toUpperCase()
  return (c.company||'?')[0].toUpperCase()
}

const PRESET_COLOURS = [
  '#185FA5','#085041','#854F0B','#534AB7','#A32D2D','#0F6E56','#3C3489',
  '#C2410C','#0369A1','#047857','#7C3AED','#DB2777','#D97706','#374151',
]

function ColourPicker({ value, onChange }) {
  const [showCustom, setShowCustom] = useState(false)
  return (
    <div>
      <label style={{ fontSize:11, fontWeight:700, color:'#6B7280', display:'block', marginBottom:6 }}>Brand colour</label>
      <div style={{ display:'flex', flexWrap:'wrap', gap:6, marginBottom:6 }}>
        {PRESET_COLOURS.map(c => (
          <button key={c} type="button" onClick={() => onChange(c)}
            style={{ width:28, height:28, borderRadius:7, background:c, border: value===c ? '3px solid #2A3042' : '2px solid transparent', cursor:'pointer', boxSizing:'border-box', outline:'none' }} />
        ))}
        <button type="button" onClick={() => setShowCustom(s => !s)}
          style={{ width:28, height:28, borderRadius:7, border:'2px dashed #C4C9D4', background:'#fff', cursor:'pointer', fontSize:14, display:'flex', alignItems:'center', justifyContent:'center', color:'#6B7280' }}>+</button>
      </div>
      {showCustom && (
        <div style={{ display:'flex', alignItems:'center', gap:8 }}>
          <input type="color" value={value||'#185FA5'} onChange={e => onChange(e.target.value)}
            style={{ width:36, height:36, borderRadius:8, border:'1px solid #DDE3EC', padding:2, cursor:'pointer' }} />
          <span style={{ fontSize:12, color:'#6B7280' }}>Custom colour</span>
          {value && !PRESET_COLOURS.includes(value) && (
            <span style={{ fontSize:11, fontWeight:700, padding:'2px 8px', borderRadius:6, background:value+'22', color:value }}>
              {value}
            </span>
          )}
        </div>
      )}
      {value && (
        <div style={{ display:'flex', alignItems:'center', gap:8, marginTop:6 }}>
          <div style={{ width:20, height:20, borderRadius:5, background:value }} />
          <span style={{ fontSize:12, color:'#6B7280' }}>Selected: <strong>{value}</strong></span>
          <button type="button" onClick={() => onChange('')}
            style={{ fontSize:11, color:'#9CA3AF', background:'none', border:'none', cursor:'pointer' }}>Clear</button>
        </div>
      )}
    </div>
  )
}

function CustomerForm({ customer, onSave, onCancel }) {
  const toast = useToast()
  const [f, setF] = useState({
    first_name:   customer?.first_name   || '',
    last_name:    customer?.last_name    || '',
    phone:        customer?.phone        || '',
    email:        customer?.email        || '',
    company:      customer?.company      || '',
    address:      customer?.address      || '',
    city:         customer?.city         || '',
    postcode:     customer?.postcode     || '',
    brand_colour: customer?.brand_colour || '',
    logo_path:    customer?.logo_path    || '',
  })
  const set = k => e => setF(p => ({ ...p, [k]: e.target.value }))
  const [logoPreview, setLogoPreview] = useState(() => customer?.logo_path ? pubUrl(customer.logo_path) : null)
  const [showLib, setShowLib] = useState(false)
  const [saving, setSaving] = useState(false)

  function handleLibrarySelect(img) {
    setF(p => ({ ...p, logo_path: img.path }))
    setLogoPreview(pubUrl(img.path))
    setShowLib(false)
  }

  async function save() {
    if (!f.first_name && !f.company) { toast('Enter a name or company', 'error'); return }
    setSaving(true)
    const { data, error } = customer?.id
      ? await supabase.from('customers').update(f).eq('id', customer.id).select().single()
      : await supabase.from('customers').insert(f).select().single()
    if (error) { toast(error.message, 'error'); setSaving(false); return }
    toast('Customer saved ✓')
    setSaving(false)
    onSave(data)
  }

  return (
    <div style={{ background:'#fff', borderRadius:12, border:'1px solid #E8ECF0', boxShadow:'0 1px 3px rgba(0,0,0,0.04)', padding:20, marginBottom:14 }}>
      <h2 style={{ fontSize:15, fontWeight:700, color:'#2A3042', marginBottom:14 }}>{customer?.id ? 'Edit customer' : 'Add customer'}</h2>

      {/* Logo + name row */}
      <div style={{ display:'flex', gap:14, marginBottom:14 }}>
        <div style={{ flexShrink:0, display:'flex', flexDirection:'column', alignItems:'center', gap:6 }}>
          <div onClick={() => setShowLib(true)}
            style={{ width:72, height:72, borderRadius:12, overflow:'hidden', border:'2px dashed #C4D4F8', background:'#F8FAFF', display:'flex', alignItems:'center', justifyContent:'center', cursor:'pointer' }}
            title="Click to pick logo from image library">
            {logoPreview
              ? <img src={logoPreview} alt="logo" style={{ width:'100%', height:'100%', objectFit:'contain', padding:4 }} />
              : <div style={{ textAlign:'center' }}>
                  <div style={{ fontSize:20 }}>🖼</div>
                  <div style={{ fontSize:10, color:'#9CA3AF', marginTop:2 }}>Add logo</div>
                </div>
            }
          </div>
          {logoPreview && (
            <button type="button" onClick={() => { setLogoPreview(null); setF(p => ({...p, logo_path:''})) }}
              style={{ fontSize:10, color:'#9CA3AF', background:'none', border:'none', cursor:'pointer', padding:0 }}>
              Remove
            </button>
          )}
          <button type="button" onClick={() => setShowLib(true)}
            style={{ fontSize:10, fontWeight:600, padding:'3px 8px', borderRadius:6, border:'1px solid #C4D4F8', background:'#F0F4FF', color:'#3730A3', cursor:'pointer', whiteSpace:'nowrap' }}>
            📚 Library
          </button>
        </div>
        <div style={{ flex:1, display:'grid', gridTemplateColumns:'1fr 1fr', gap:8 }}>
          {[['first_name','First name (optional)','Sam'],['last_name','Last name (optional)','Mitchell']].map(([k,l,p]) => (
            <div key={k}>
              <label style={{ fontSize:11, fontWeight:700, color:'#6B7280', display:'block', marginBottom:3 }}>{l}</label>
              <input style={{ width:'100%', padding:'8px 10px', border:'1px solid #DDE3EC', borderRadius:8, fontSize:13, outline:'none', boxSizing:'border-box' }}
                placeholder={p} value={f[k]} onChange={set(k)} />
            </div>
          ))}
          <div style={{ gridColumn:'span 2' }}>
            <label style={{ fontSize:11, fontWeight:700, color:'#6B7280', display:'block', marginBottom:3 }}>Company</label>
            <input style={{ width:'100%', padding:'8px 10px', border:'1px solid #DDE3EC', borderRadius:8, fontSize:13, outline:'none', boxSizing:'border-box' }}
              placeholder="Mitchell Constructions" value={f.company} onChange={set('company')} />
          </div>
        </div>
      </div>

      {/* Contact */}
      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8, marginBottom:14 }}>
        {[['phone','Phone','027 555 0000'],['email','Email','sam@email.com']].map(([k,l,p]) => (
          <div key={k}>
            <label style={{ fontSize:11, fontWeight:700, color:'#6B7280', display:'block', marginBottom:3 }}>{l}</label>
            <input style={{ width:'100%', padding:'8px 10px', border:'1px solid #DDE3EC', borderRadius:8, fontSize:13, outline:'none', boxSizing:'border-box' }}
              placeholder={p} value={f[k]} onChange={set(k)} />
          </div>
        ))}
      </div>

      {/* Brand colour */}
      <div style={{ marginBottom:14, padding:14, background:'#F8FAFF', borderRadius:10, border:'1px solid #E0E7FF' }}>
        <ColourPicker value={f.brand_colour} onChange={v => setF(p => ({...p, brand_colour: v}))} />
      </div>

      {/* Address */}
      <div style={{ borderTop:'1px solid #F3F4F6', paddingTop:12, marginBottom:14 }}>
        <div style={{ fontSize:11, fontWeight:700, color:'#9CA3AF', textTransform:'uppercase', letterSpacing:'.05em', marginBottom:8 }}>Delivery address</div>
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8 }}>
          <div style={{ gridColumn:'span 2' }}>
            <label style={{ fontSize:11, fontWeight:700, color:'#6B7280', display:'block', marginBottom:3 }}>Street address</label>
            <input style={{ width:'100%', padding:'8px 10px', border:'1px solid #DDE3EC', borderRadius:8, fontSize:13, outline:'none', boxSizing:'border-box' }}
              placeholder="12 Example St, Suburb" value={f.address} onChange={set('address')} />
          </div>
          <div>
            <label style={{ fontSize:11, fontWeight:700, color:'#6B7280', display:'block', marginBottom:3 }}>City</label>
            <input style={{ width:'100%', padding:'8px 10px', border:'1px solid #DDE3EC', borderRadius:8, fontSize:13, outline:'none', boxSizing:'border-box' }}
              placeholder="Christchurch" value={f.city} onChange={set('city')} />
          </div>
          <div>
            <label style={{ fontSize:11, fontWeight:700, color:'#6B7280', display:'block', marginBottom:3 }}>Postcode</label>
            <input style={{ width:'100%', padding:'8px 10px', border:'1px solid #DDE3EC', borderRadius:8, fontSize:13, outline:'none', boxSizing:'border-box' }}
              placeholder="8011" value={f.postcode} onChange={set('postcode')} />
          </div>
        </div>
      </div>

      <div style={{ display:'flex', gap:8 }}>
        <button onClick={save} disabled={saving}
          style={{ padding:'9px 20px', borderRadius:9, border:'none', background: saving ? '#E8ECF0' : '#1D9E75', color: saving ? '#9CA3AF' : '#fff', fontSize:13, fontWeight:700, cursor: saving ? 'default' : 'pointer' }}>
          {saving ? 'Saving…' : 'Save customer'}
        </button>
        <button onClick={onCancel}
          style={{ padding:'9px 16px', borderRadius:9, border:'1px solid #E8ECF0', background:'#fff', color:'#6B7280', fontSize:13, cursor:'pointer' }}>
          Cancel
        </button>
      </div>

      {showLib && <ImageLibrary onSelect={handleLibrarySelect} onClose={() => setShowLib(false)} />}
    </div>
  )
}

export default function Customers() {
  const toast = useToast()
  const [customers, setCustomers] = useState([])
  const [jobs, setJobs]           = useState([])
  const [loading, setLoading]     = useState(true)
  const [search, setSearch]       = useState('')
  const [editing, setEditing]     = useState(null)

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
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:16 }}>
        <h1 style={{ fontSize:20, fontWeight:700, color:'#2A3042' }}>Customers</h1>
        <button onClick={() => setEditing('new')}
          style={{ padding:'8px 16px', borderRadius:9, border:'none', background:'#1D9E75', color:'#fff', fontSize:13, fontWeight:700, cursor:'pointer' }}>
          + Add customer
        </button>
      </div>

      {editing && (
        <CustomerForm
          customer={editing === 'new' ? null : editing}
          onSave={onSaved}
          onCancel={() => setEditing(null)}
        />
      )}

      <div style={{ position:'relative', marginBottom:12 }}>
        <span style={{ position:'absolute', left:12, top:'50%', transform:'translateY(-50%)', color:'#9CA3AF', fontSize:14, pointerEvents:'none' }}>⌕</span>
        <input value={search} onChange={e => setSearch(e.target.value)}
          placeholder="Search customers…"
          style={{ width:'100%', padding:'9px 10px 9px 32px', border:'1px solid #DDE3EC', borderRadius:9, fontSize:13, outline:'none', boxSizing:'border-box' }} />
      </div>

      {loading ? (
        <div style={{ display:'flex', justifyContent:'center', padding:'48px 0' }}><div className="spinner" /></div>
      ) : (
        <div style={{ background:'#fff', borderRadius:12, border:'1px solid #E8ECF0', overflow:'hidden' }}>
          {filtered.length === 0 ? (
            <div style={{ padding:32, textAlign:'center', fontSize:13, color:'#9CA3AF' }}>
              {search ? 'No customers match your search' : 'No customers yet — add one above'}
            </div>
          ) : filtered.map(c => (
            <div key={c.id} style={{ display:'flex', alignItems:'center', gap:12, padding:'12px 16px', borderBottom:'1px solid #F3F4F6' }}
              className="hover:bg-[#F9FAFB]">
              {/* Logo or coloured initials */}
              {c.logo_path ? (
                <img src={pubUrl(c.logo_path)} alt=""
                  style={{ width:40, height:40, borderRadius:9, objectFit:'contain', flexShrink:0, border:'1px solid #E8ECF0', background:'#fff', padding:2 }} />
              ) : (
                <div style={{ width:40, height:40, borderRadius:9, background: c.brand_colour || '#E8ECF0', display:'flex', alignItems:'center', justifyContent:'center', fontSize:13, fontWeight:700, color: c.brand_colour ? '#fff' : '#9CA3AF', flexShrink:0 }}>
                  {initials(c)}
                </div>
              )}
              <div style={{ flex:1, minWidth:0 }}>
                <div style={{ fontSize:13, fontWeight:700, color:'#2A3042' }}>
                  {c.first_name || c.last_name
                    ? <>{c.first_name} {c.last_name}{c.company && <span style={{ fontWeight:400, color:'#6B7280' }}> · {c.company}</span>}</>
                    : c.company || '—'
                  }
                </div>
                <div style={{ fontSize:12, color:'#6B7280', marginTop:1 }}>
                  {[c.phone, c.email].filter(Boolean).join(' · ')}
                </div>
                {c.address && <div style={{ fontSize:11, color:'#9CA3AF', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{[c.address,c.city].filter(Boolean).join(', ')}</div>}
              </div>
              {c.brand_colour && (
                <div style={{ width:16, height:16, borderRadius:4, background:c.brand_colour, flexShrink:0, border:'1px solid rgba(0,0,0,0.1)' }} />
              )}
              <div style={{ fontSize:11, color:'#9CA3AF', background:'#F3F4F6', borderRadius:20, padding:'2px 8px', whiteSpace:'nowrap', flexShrink:0 }}>
                {jobCount(c.id)} job{jobCount(c.id) !== 1 ? 's' : ''}
              </div>
              <div style={{ display:'flex', gap:4, flexShrink:0 }}>
                <button onClick={() => setEditing(c)}
                  style={{ padding:'4px 10px', borderRadius:7, border:'1px solid #E8ECF0', background:'#fff', color:'#374151', fontSize:12, cursor:'pointer' }}>Edit</button>
                <button onClick={() => deleteCustomer(c)}
                  style={{ padding:'4px 8px', borderRadius:7, border:'1px solid #FCA5A5', background:'#FEF2F2', color:'#DC2626', fontSize:12, cursor:'pointer' }}>×</button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
