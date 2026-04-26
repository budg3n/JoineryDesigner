import { Routes, Route, Navigate } from 'react-router-dom'
import { useApp } from './context/AppContext'
import Layout from './components/Layout'
import Login from './screens/Login'
import Dashboard from './screens/Dashboard'
import JobDetail from './screens/JobDetail'
import Sketch from './screens/Sketch'
import Calendar from './screens/Calendar'
import Settings from './screens/Settings'
import Materials from './screens/Materials'
import Customers from './screens/Customers'
import Team from './screens/Team'

function RequireAuth({ children }) {
  const { user, loading } = useApp()
  if (loading) return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-zinc-900">
      <div className="flex flex-col items-center gap-3">
        <div className="spinner" />
        <p className="text-sm text-gray-400">Loading…</p>
      </div>
    </div>
  )
  return user ? children : <Navigate to="/login" replace />
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/" element={<RequireAuth><Layout /></RequireAuth>}>
        <Route index element={<Dashboard />} />
        <Route path="job/:id" element={<JobDetail />} />
        <Route path="job/:id/sketch" element={<Sketch />} />
        <Route path="job/:id/sketch/:attId" element={<Sketch />} />
        <Route path="calendar" element={<Calendar />} />
        <Route path="settings" element={<Settings />} />
        <Route path="settings/materials" element={<Materials />} />
        <Route path="settings/customers" element={<Customers />} />
        <Route path="settings/team" element={<Team />} />
      </Route>
    </Routes>
  )
}
