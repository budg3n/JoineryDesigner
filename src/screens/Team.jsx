import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { useToast } from '../components/Toast'
import { ROLES } from '../context/AppContext'
import BackButton from '../components/BackButton'

const ROLE_COLORS = {
  'Admin':              'bg-blue-100 text-blue-800',
  'Project Manager':    'bg-teal-100 text-teal-800',
  'Setout':             'bg-amber-100 text-amber-800',
  'Production Manager': 'bg-purple-100 text-purple-800',
  'Production Team':    'bg-[#F3F4F6] text-[#6B7280]',
}
const AVATAR_BG = ['#185FA5','#085041','#854F0B','#534AB7','#A32D2D','#0F6E56','#3C3489']
const initials = m => ((m.full_name||m.email||'?').split(' ').map(w=>w[0]).slice(0,2).join('') || '?').toUpperCase()

export default function Team() {
  const toast = useToast()
  const [members, setMembers]   = useState([])
  const [loading, setLoading]   = useState(true)
  const [showInvite, setShowInvite] = useState(false)
  const [inv, setInv] = useState({ name:'', email:'', role:'Production Team', pw:'' })
  const [invErr, setInvErr]     = useState('')
  const [invSaving, setInvSaving] = useState(false)
  const setI = k => e => setInv(p => ({ ...p, [k]: e.target.value }))

  useEffect(() => {
    supabase.from('profiles').select('*').order('full_name').then(({ data }) => {
      setMembers(data || [])
      setLoading(false)
    })
  }, [])

  async function updateRole(id, role) {
    const { error } = await supabase.from('profiles').update({ role }).eq('id', id)
    if (error) { toast(error.message, 'error'); return }
    setMembers(prev => prev.map(m => m.id === id ? { ...m, role } : m))
    toast('Role updated ✓')
  }

  async function removeMember(m) {
    if (!confirm(`Remove ${m.full_name || m.email}?`)) return
    await supabase.from('profiles').delete().eq('id', m.id)
    setMembers(prev => prev.filter(x => x.id !== m.id))
    toast('Member removed')
  }

  async function inviteUser() {
    setInvErr('')
    if (!inv.name || !inv.email || !inv.pw) { setInvErr('Please fill in all fields.'); return }
    if (inv.pw.length < 6) { setInvErr('Password must be at least 6 characters.'); return }
    setInvSaving(true)
    const { data, error } = await supabase.auth.signUp({
      email: inv.email, password: inv.pw,
      options: { data: { full_name: inv.name, role: inv.role } }
    })
    if (error) { setInvErr(error.message); setInvSaving(false); return }
    if (data.user) {
      await supabase.from('profiles').upsert({ id: data.user.id, email: inv.email, full_name: inv.name, role: inv.role })
      setMembers(prev => [...prev, { id: data.user.id, email: inv.email, full_name: inv.name, role: inv.role }])
    }
    setInvSaving(false)
    setShowInvite(false)
    setInv({ name:'', email:'', role:'Production Team', pw:'' })
    toast('User created ✓')
  }

  return (
    <div>
      <BackButton to="/settings" label="Settings" />
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-xl font-bold text-[#2A3042]">Team</h1>
        <button onClick={() => setShowInvite(v => !v)} className="btn-green">
          {showInvite ? 'Cancel' : '+ Invite user'}
        </button>
      </div>

      {/* invite form */}
      {showInvite && (
        <div style={{ background:"#fff", borderRadius:12, border:"1px solid #E8ECF0", boxShadow:"0 1px 3px rgba(0,0,0,0.04)", padding:20, marginBottom:14 }}>
          <h2 className="text-sm font-semibold text-[#4B5563] mb-3">Invite new user</h2>
          {invErr && <div className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2 mb-3">{invErr}</div>}
          <div className="grid grid-cols-2 gap-3 mb-3">
            <div className="col-span-2"><label className="label">Full name</label><input className="input" placeholder="Jake Smith" value={inv.name} onChange={setI('name')} /></div>
            <div className="col-span-2"><label className="label">Email</label><input className="input" type="email" placeholder="jake@company.com" value={inv.email} onChange={setI('email')} /></div>
            <div><label className="label">Role</label>
              <select className="input" value={inv.role} onChange={setI('role')}>
                {ROLES.map(r => <option key={r}>{r}</option>)}
              </select>
            </div>
            <div><label className="label">Temp password</label><input className="input" type="password" placeholder="Min 6 chars" value={inv.pw} onChange={setI('pw')} /></div>
          </div>
          <button onClick={inviteUser} disabled={invSaving} className="btn-green disabled:opacity-50">
            {invSaving ? 'Creating…' : 'Create account'}
          </button>
        </div>
      )}

      {/* role legend */}
      <div className="flex flex-wrap gap-2 mb-4">
        {ROLES.map(r => (
          <span key={r} className={`text-xs px-2.5 py-1 rounded-full font-medium ${ROLE_COLORS[r]}`}>{r}</span>
        ))}
      </div>

      {loading ? (
        <div className="flex justify-center py-12"><div className="spinner" /></div>
      ) : (
        <div style={{ background:"#fff", borderRadius:12, border:"1px solid #E8ECF0", boxShadow:"0 1px 3px rgba(0,0,0,0.04)", overflow:"hidden" }}>
          {members.length === 0 ? (
            <div className="p-8 text-center text-sm text-[#9CA3AF]">No team members yet</div>
          ) : members.map((m, i) => (
            <div key={m.id} className="flex items-center gap-3 px-4 py-3.5 border-b border-[#F3F4F6] last:border-0">
              <div className="w-9 h-9 rounded-full flex items-center justify-center text-xs font-bold text-white flex-shrink-0"
                style={{ background: AVATAR_BG[i % AVATAR_BG.length] }}>{initials(m)}</div>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-semibold text-[#2A3042]">{m.full_name || '—'}</div>
                <div className="text-xs text-[#9CA3AF] truncate">{m.email}</div>
              </div>
              <select value={m.role || 'Production Team'}
                onChange={e => updateRole(m.id, e.target.value)}
                className="text-xs border border-[#E8ECF0] rounded-lg px-2 py-1 bg-white text-[#4B5563] cursor-pointer max-w-[150px]">
                {ROLES.map(r => <option key={r}>{r}</option>)}
              </select>
              <button onClick={() => removeMember(m)} className="text-[#D1D5DB] hover:text-red-500 text-lg leading-none bg-transparent border-none cursor-pointer">×</button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
