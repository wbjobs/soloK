import React from 'react';
import { createRoot } from 'react-dom/client';
import { HashRouter } from 'react-router-dom';
import CssBaseline from '@mui/material/CssBaseline';
import { ThemeProvider, createTheme } from '@mui/material/styles';
import App from './App.jsx';
import './styles/index.css';

const theme = createTheme({
  palette: {
    mode: 'dark',
    primary: {
      main: '#8b6914',
      light: '#c9a227',
      dark: '#5a4510'
    },
    secondary: {
      main: '#2d6a4f',
      light: '#40916c',
      dark: '#1b4332'
    },
    background: {
      default: '#1a1a2e',
      paper: '#16213e'
    },
    text: {
      primary: '#e8e8e8',
      secondary: '#a0a0a0'
    },
    error: {
      main: '#e63946'
    },
    warning: {
      main: '#f4a261'
    },
    info: {
      main: '#457b9d'
    },
    success: {
      main: '#2a9d8f'
    }
  },
  typography: {
    fontFamily: "'Segoe UI', 'Microsoft YaHei', 'PingFang SC', 'Noto Sans CJK SC', sans-serif",
    h1: { fontSize: '2rem', fontWeight: 600 },
    h2: { fontSize: '1.5rem', fontWeight: 600 },
    h3: { fontSize: '1.25rem', fontWeight: 500 },
    h4: { fontSize: '1.1rem', fontWeight: 500 },
    body1: { fontSize: '0.9rem' },
    body2: { fontSize: '0.8rem' }
  },
  components: {
    MuiButton: {
      styleOverrides: {
        root: {
          textTransform: 'none',
          borderRadius: 6
        }
      }
    },
    MuiCard: {
      styleOverrides: {
        root: {
          borderRadius: 8,
          background: 'linear-gradient(145deg, #1e2a4a, #16213e)'
        }
      }
    }
  }
});

const container = document.getElementById('root');
const root = createRoot(container);

root.render(
  <React.StrictMode>
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <HashRouter>
        <App />
      </HashRouter>
    </ThemeProvider>
  </React.StrictMode>
);
