import { Outlet, useNavigate, useLocation } from 'react-router-dom'
import { useApp } from '../context/AppContext'

const ROLE_STYLES = {
  'Admin':              'bg-brand-50 text-brand-800 border-blue-200',
  'Project Manager':    'bg-teal-50 text-teal-800 border-teal-200',
  'Setout':             'bg-amber-50 text-amber-600 border-amber-200',
  'Production Manager': 'bg-purple-50 text-purple-800 border-purple-200',
  'Production Team':    'bg-gray-100 text-gray-600 border-gray-200',
}

function CalIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/>
      <line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>
    </svg>
  )
}

function GearIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20 7h-9"/><path d="M14 17H5"/>
      <circle cx="17" cy="17" r="3"/><circle cx="7" cy="7" r="3"/>
    </svg>
  )
}

export default function Layout() {
  const { profile, can, signOut } = useApp()
  const navigate = useNavigate()
  const location = useLocation()
  const isDash = location.pathname === '/'
  const roleCls = ROLE_STYLES[profile?.role] || ROLE_STYLES['Production Team']

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-zinc-900">
      <div className="max-w-screen-xl mx-auto px-4 sm:px-6 lg:px-8">

        {/* role banner */}
        {profile && (
          <div className={`flex items-center justify-between px-3 py-1.5 mt-3 rounded-lg border text-xs ${roleCls}`}>
            <span>
              Signed in as <span className="font-semibold">{profile.full_name || profile.email}</span>
              {' · '}<span className="font-semibold">{profile.role}</span>
            </span>
            <button onClick={signOut} className="opacity-60 hover:opacity-100 border border-current rounded-full px-2 py-0.5 cursor-pointer bg-transparent text-inherit text-xs">
              Sign out
            </button>
          </div>
        )}

        {/* topbar — only on dashboard */}
        {isDash && (
          <div className="flex items-center justify-between py-4">
            <h1 className="text-xl font-bold text-gray-900 dark:text-white">Jobs</h1>
            <div className="flex items-center gap-2">
              <button onClick={() => navigate('/calendar')}
                className="w-9 h-9 rounded-full border border-gray-200 bg-white dark:bg-zinc-800 dark:border-zinc-700 flex items-center justify-center text-gray-500 hover:bg-gray-50 cursor-pointer">
                <CalIcon />
              </button>
              {can('settings') && (
                <button onClick={() => navigate('/settings')}
                  className="w-9 h-9 rounded-full border border-gray-200 bg-white dark:bg-zinc-800 dark:border-zinc-700 flex items-center justify-center text-gray-500 hover:bg-gray-50 cursor-pointer">
                  <GearIcon />
                </button>
              )}
            </div>
          </div>
        )}

        <main className="pb-24 page-enter">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
