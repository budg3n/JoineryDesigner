import { Routes, Route, Navigate } from 'react-router-dom'
import { usePageRestore, useRestoreOnLoad } from './hooks/usePageRestore'
import { useApp } from './context/AppContext'
import Layout from './components/Layout'
import Login from './screens/Login'
import Dashboard from './screens/Dashboard'
import JobDetail from './screens/JobDetail'
import Sketch from './screens/Sketch'
import Calendar from './screens/Calendar'
import Settings from './screens/Settings'
import Materials from './screens/Materials'
import MaterialSettings from './screens/MaterialSettings'
import Customers from './screens/Customers'
import Team from './screens/Team'
import Appliances from './screens/Appliances'
import Notes from './screens/Notes'
import FileTypes from './screens/FileTypes'
import OrderSheet from './screens/OrderSheet'
import ProcessTemplates from './screens/ProcessTemplates'
import CopyFormat from './screens/CopyFormat'
import FormulaWriter from './screens/FormulaWriter'
import ProductionDashboard from './screens/ProductionDashboard'
import Reports from './screens/Reports'
import SpecList from './screens/SpecList'
import SpecBuilder from './screens/SpecBuilder'
import JobStatuses from './screens/JobStatuses'
import RoomTypeSettings from './screens/RoomTypeSettings'
import ApplianceSettings from './screens/ApplianceSettings'
import UnitSettings from './screens/UnitSettings'

function RoleRedirect() {
  const { profile, previewRole } = useApp()
  // Only redirect to production dashboard for actual Production Team users
  // Preview role should not cause a permanent redirect on page reload
  const actualRole = profile?.role
  const effectiveRole = previewRole || actualRole
  if (effectiveRole === 'Production Team' && actualRole === 'Production Team') {
    return <Navigate to="/production" replace />
  }
  if (previewRole === 'Production Team') {
    return <Navigate to="/production" replace />
  }
  return <Dashboard />
}

function RequireAuth({ children }) {
  const { user, loading } = useApp()
  if (loading) return null
  if (!user) return <Navigate to="/login" replace />
  return children
}

export default function App() {
  useRestoreOnLoad()
  usePageRestore()

  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/" element={<RequireAuth><Layout /></RequireAuth>}>
        <Route index element={<RoleRedirect />} />
        <Route path="job/:id" element={<JobDetail />} />
        <Route path="job/:id/sketch" element={<Sketch />} />
        <Route path="job/:id/sketch/:attId" element={<Sketch />} />
        <Route path="job/:id/orders" element={<OrderSheet />} />
        <Route path="calendar" element={<Calendar />} />
        <Route path="notes" element={<Notes />} />
        <Route path="notes/:noteId" element={<Notes />} />
        <Route path="formula-writer" element={<FormulaWriter />} />
        <Route path="production" element={<ProductionDashboard />} />
        <Route path="reports" element={<Reports />} />
        <Route path="spec-builder" element={<SpecList />} />
        <Route path="spec-builder/:id" element={<SpecBuilder />} />
        <Route path="materials" element={<Materials />} />
        <Route path="appliances" element={<Appliances />} />
        <Route path="settings" element={<Settings />} />
        <Route path="settings/materials" element={<MaterialSettings />} />
        <Route path="settings/appliances" element={<ApplianceSettings />} />
        <Route path="settings/customers" element={<Customers />} />
        <Route path="settings/team" element={<Team />} />
        <Route path="settings/file-types" element={<FileTypes />} />
        <Route path="settings/processes" element={<ProcessTemplates />} />
        <Route path="settings/copy-format" element={<CopyFormat />} />
        <Route path="settings/job-statuses" element={<JobStatuses />} />
        <Route path="settings/room-types" element={<RoomTypeSettings />} />
        <Route path="settings/unit-types" element={<UnitSettings />} />
      </Route>
    </Routes>
  )
}
