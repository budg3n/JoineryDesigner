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
import Appliances from './screens/Appliances'
import Notes from './screens/Notes'
import FileTypes from './screens/FileTypes'

function RequireAuth({ children }) {
  const { user, loading } = useApp()
  if (loading) return (
    <div style={{ minHeight:"100vh", display:"flex", alignItems:"center", justifyContent:"center", background:"#2A3042" }}>
      <div style={{ display:"flex", flexDirection:"column", alignItems:"center", gap:12 }}>
        <div className="spinner" />
        <p style={{ fontSize:13, color:"rgba(255,255,255,0.4)", margin:0 }}>Loading…</p>
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
        <Route path="settings/appliances" element={<Appliances />} />
        <Route path="notes" element={<Notes />} />
        <Route path="notes/:noteId" element={<Notes />} />
        <Route path="settings/file-types" element={<FileTypes />} />
      </Route>
    </Routes>
  )
}
