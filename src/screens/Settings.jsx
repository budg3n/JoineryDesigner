import { useNavigate } from 'react-router-dom'
import BackButton from '../components/BackButton'

function Row({ icon, bg, label, sub, to }) {
  const navigate = useNavigate()
  return (
    <div onClick={() => navigate(to)}
      className="flex items-center justify-between px-4 py-3.5 cursor-pointer hover:bg-gray-50 dark:hover:bg-zinc-700 border-b border-gray-100 dark:border-zinc-700 last:border-0">
      <div className="flex items-center gap-3">
        <div className={`w-8 h-8 rounded-lg flex items-center justify-center text-base flex-shrink-0 ${bg}`}>{icon}</div>
        <div>
          <div className="text-sm font-medium text-gray-900 dark:text-white">{label}</div>
          <div className="text-xs text-gray-500 dark:text-zinc-400">{sub}</div>
        </div>
      </div>
      <span className="text-gray-300 dark:text-zinc-600 text-lg">›</span>
    </div>
  )
}

export default function Settings() {
  return (
    <div>
      <BackButton to="/" label="Jobs" />
      <div className="flex items-center gap-2.5 mb-5">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-gray-700 dark:text-zinc-300">
          <path d="M20 7h-9"/><path d="M14 17H5"/><circle cx="17" cy="17" r="3"/><circle cx="7" cy="7" r="3"/>
        </svg>
        <h1 className="text-xl font-bold text-gray-900 dark:text-white">Settings</h1>
      </div>
      <div className="card overflow-hidden">
        <Row icon="🪵" bg="bg-teal-50"   label="Materials library" sub="Manage panels, colours and suppliers" to="/settings/materials" />
        <Row icon="👤" bg="bg-blue-50"   label="Customers"          sub="Manage customer database"             to="/settings/customers" />
        <Row icon="👥" bg="bg-amber-50"  label="Team"               sub="Manage who has access"                to="/settings/team" />
      </div>
    </div>
  )
}
