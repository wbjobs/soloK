import React, { useState, useEffect } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import Sidebar from './components/Sidebar.jsx'
import Header from './components/Header.jsx'
import Dashboard from './pages/Dashboard.jsx'
import Upload from './pages/Upload.jsx'
import Detection from './pages/Detection.jsx'
import Missions from './pages/Missions.jsx'
import Report from './pages/Report.jsx'
import { healthAPI } from './services/api.js'

export default function App() {
  const [backendStatus, setBackendStatus] = useState('checking')

  useEffect(() => {
    const checkBackend = async () => {
      try {
        await healthAPI.check()
        setBackendStatus('online')
      } catch {
        setBackendStatus('offline')
      }
    }
    checkBackend()
    const interval = setInterval(checkBackend, 30000)
    return () => clearInterval(interval)
  }, [])

  return (
    <div className="flex h-screen bg-sonar-bg">
      <Sidebar />
      <div className="flex-1 flex flex-col overflow-hidden">
        <Header backendStatus={backendStatus} />
        <main className="flex-1 overflow-auto p-6">
          <Routes>
            <Route path="/" element={<Navigate to="/dashboard" replace />} />
            <Route path="/dashboard" element={<Dashboard />} />
            <Route path="/upload" element={<Upload />} />
            <Route path="/detection" element={<Detection />} />
            <Route path="/missions" element={<Missions />} />
            <Route path="/report" element={<Report />} />
            <Route path="*" element={<Navigate to="/dashboard" replace />} />
          </Routes>
        </main>
      </div>
    </div>
  )
}
