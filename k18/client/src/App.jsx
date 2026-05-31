import React, { useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import LoginPage from './pages/LoginPage';
import ExpertPage from './pages/ExpertPage';
import DevicePage from './pages/DevicePage';
import useRoomStore from './store/roomStore';

function PrivateRoute({ children, allowedRoles }) {
  const user = useRoomStore((s) => s.user);
  const token = localStorage.getItem('token');

  if (!token && !user) {
    return <Navigate to="/login" replace />;
  }

  if (allowedRoles && user && !allowedRoles.includes(user.role)) {
    return <Navigate to="/login" replace />;
  }

  return children;
}

export default function App() {
  const setUser = useRoomStore((s) => s.setUser);

  useEffect(() => {
    const token = localStorage.getItem('token');
    if (token) {
      try {
        const payload = JSON.parse(atob(token.split('.')[1]));
        setUser(
          { id: payload.userId, username: payload.name, role: payload.role },
          token,
          payload.role
        );
      } catch (err) {
        localStorage.removeItem('token');
      }
    }
  }, []);

  return (
    <BrowserRouter>
      <Toaster
        position="top-right"
        toastOptions={{
          style: {
            background: '#374151',
            color: '#fff',
            border: '1px solid #4B5563',
          },
        }}
      />
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route
          path="/expert"
          element={
            <PrivateRoute allowedRoles={['expert', 'admin']}>
              <ExpertPage />
            </PrivateRoute>
          }
        />
        <Route
          path="/device"
          element={
            <PrivateRoute allowedRoles={['device', 'admin']}>
              <DevicePage />
            </PrivateRoute>
          }
        />
        <Route path="/" element={<Navigate to="/login" replace />} />
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
