import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import Login from './pages/Login';
import ParcelList from './pages/ParcelList';
import CreateParcel from './pages/CreateParcel';
import TraceMap from './pages/TraceMap';
import Navbar from './components/Navbar';
import ProtectedRoute from './components/ProtectedRoute';

function App() {
  return (
    <AuthProvider>
      <div className="App">
        <Navbar />
        <div className="container">
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route path="/" element={<ProtectedRoute><ParcelList /></ProtectedRoute>} />
            <Route path="/parcels" element={<ProtectedRoute><ParcelList /></ProtectedRoute>} />
            <Route path="/create-parcel" element={<ProtectedRoute><CreateParcel /></ProtectedRoute>} />
            <Route path="/trace/:trackingNumber" element={<TraceMap />} />
            <Route path="/trace" element={<TraceMap />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </div>
      </div>
    </AuthProvider>
  );
}

export default App;
