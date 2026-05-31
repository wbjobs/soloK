import React, { useState, useEffect } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { Box, LinearProgress, Snackbar, Alert } from '@mui/material';
import Header from './components/common/Header.jsx';
import Sidebar from './components/common/Sidebar.jsx';
import ImageImporter from './components/ImageImporter.jsx';
import NotationEditor from './components/NotationEditor.jsx';
import ScoreComparison from './components/ScoreComparison.jsx';
import LearningMode from './components/LearningMode.jsx';
import VectorSearch from './components/VectorSearch.jsx';
import SettingsPage from './components/SettingsPage.jsx';
import { checkPythonStatus } from './ipc/index.js';

export default function App() {
  const [pythonReady, setPythonReady] = useState(false);
  const [pythonStatus, setPythonStatus] = useState('checking');
  const [notification, setNotification] = useState(null);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  useEffect(() => {
    const checkStatus = async () => {
      try {
        const result = await checkPythonStatus();
        setPythonReady(result.ready);
        setPythonStatus(result.ready ? 'ready' : 'not-ready');
      } catch (err) {
        setPythonStatus('error');
      }
    };

    checkStatus();

    if (window.electronAPI) {
      const removeReady = window.electronAPI.onPythonReady(() => {
        setPythonReady(true);
        setPythonStatus('ready');
        showNotification('Python 后端已就绪', 'success');
      });

      const removeDisconnected = window.electronAPI.onPythonDisconnected(() => {
        setPythonReady(false);
        setPythonStatus('disconnected');
        showNotification('Python 后端连接断开', 'warning');
      });

      const removeError = window.electronAPI.onPythonError((msg) => {
        setPythonReady(false);
        setPythonStatus('error');
        showNotification('Python 后端启动失败: ' + msg, 'error');
      });

      return () => {
        removeReady?.();
        removeDisconnected?.();
        removeError?.();
      };
    }
  }, []);

  const showNotification = (message, severity = 'info') => {
    setNotification({ message, severity });
  };

  const handleCloseNotification = () => {
    setNotification(null);
  };

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100vh', bgcolor: 'background.default' }}>
      <Header
        pythonStatus={pythonStatus}
        onToggleSidebar={() => setSidebarCollapsed(!sidebarCollapsed)}
      />

      {pythonStatus === 'checking' && (
        <LinearProgress sx={{ bgcolor: 'primary.dark' }} />
      )}

      <Box sx={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
        <Sidebar collapsed={sidebarCollapsed} />

        <Box
          component="main"
          sx={{
            flex: 1,
            overflow: 'auto',
            p: 2,
            bgcolor: 'background.default'
          }}
        >
          <Routes>
            <Route path="/" element={<Navigate to="/import" replace />} />
            <Route path="/import" element={
              <ImageImporter
                pythonReady={pythonReady}
                showNotification={showNotification}
              />
            } />
            <Route path="/editor" element={
              <NotationEditor
                pythonReady={pythonReady}
                showNotification={showNotification}
              />
            } />
            <Route path="/comparison" element={
              <ScoreComparison
                pythonReady={pythonReady}
                showNotification={showNotification}
              />
            } />
            <Route path="/learning" element={
              <LearningMode
                pythonReady={pythonReady}
                showNotification={showNotification}
              />
            } />
            <Route path="/search" element={
              <VectorSearch
                pythonReady={pythonReady}
                showNotification={showNotification}
              />
            } />
            <Route path="/settings" element={<SettingsPage />} />
            <Route path="*" element={<Navigate to="/import" replace />} />
          </Routes>
        </Box>
      </Box>

      <Snackbar
        open={notification !== null}
        autoHideDuration={4000}
        onClose={handleCloseNotification}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
      >
        {notification && (
          <Alert
            onClose={handleCloseNotification}
            severity={notification.severity}
            variant="filled"
            sx={{ width: '100%' }}
          >
            {notification.message}
          </Alert>
        )}
      </Snackbar>
    </Box>
  );
}
