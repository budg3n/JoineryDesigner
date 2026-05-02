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
import JobFeedback from './screens/JobFeedback'

function RequireAuth({ children }) {
  const { user, loading, profile } = useApp()
  // Never unmount children — show overlay so app state is preserved
  if (!user && !loading) return <Navigate to="/login" replace />
  return (
    <>
      {children}
      {loading && (
        <div style={{ position:'fixed', inset:0, zIndex:9999, display:'flex', alignItems:'center', justifyContent:'center', background:'#2A3042' }}>
          <div style={{ display:'flex', flexDirection:'column', alignItems:'center', gap:12 }}>
            <div className="spinner" />
            <p style={{ fontSize:13, color:'rgba(255,255,255,0.4)', margin:0 }}>Loading…</p>
          </div>
        </div>
      )}
    </>
  )
}

function RoleRouter() {
  const { profile } = useApp()
  if (profile?.role === 'Production Team') return <ProductionDashboard />
  return <Dashboard />
}

function AppInner() {
  useRestoreOnLoad()
  usePageRestore()
  return null
}

export default function App() {
  return (
    <>
      <AppInner />
      <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/" element={<RequireAuth><Layout /></RequireAuth>}>
        <Route index element={<RoleRouter />} />
        <Route path="job/:id" element={<JobDetail />} />
        <Route path="job/:id/sketch" element={<Sketch />} />
        <Route path="job/:id/sketch/:attId" element={<Sketch />} />
        <Route path="calendar" element={<Calendar />} />
        <Route path="settings" element={<Settings />} />
        <Route path="settings/materials" element={<Materials />} />
        <Route path="settings/customers" element={<Customers />} />
        <Route path="settings/team" element={<Team />} />
        <Route path="settings/appliances" element={<Appliances />} />
        <Route path="notes" element={<Notes />} />
        <Route path="notes/:noteId" element={<Notes />} />
        <Route path="settings/file-types" element={<FileTypes />} />
        <Route path="settings/processes" element={<ProcessTemplates />} />
        <Route path="settings/copy-format" element={<CopyFormat />} />
        <Route path="formula-writer" element={<FormulaWriter />} />
        <Route path="job/:id/orders" element={<OrderSheet />} />
        <Route path="job/:id/feedback" element={<JobFeedback />} />
      </Route>
    </Routes>
    </>
  )
}
