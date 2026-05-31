import { useEffect } from 'react'
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom'
import HomePage from './pages/HomePage'
import RoomsPage from './pages/RoomsPage'
import EditorPage from './pages/EditorPage'
import HistoryPage from './pages/HistoryPage'
import { initializeUser } from './store/userStore'

function App() {
  useEffect(() => {
    initializeUser()
  }, [])

  return (
    <Router>
      <div className="min-h-screen bg-dark-900 text-white">
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/rooms" element={<RoomsPage />} />
          <Route path="/rooms/:roomId" element={<EditorPage />} />
          <Route path="/rooms/:roomId/history" element={<HistoryPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </div>
    </Router>
  )
}

export default App
