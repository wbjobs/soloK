import React, { useState } from 'react';
import { Routes, Route } from 'react-router-dom';
import { Box, Drawer, AppBar, Toolbar, Typography, IconButton, List, ListItem, ListItemIcon, ListItemText } from '@mui/material';
import {
  Menu as MenuIcon,
  Upload as UploadIcon,
  ShowChart as ShowChartIcon,
  Map as MapIcon,
  Search as SearchIcon,
  Timeline as TimelineIcon,
  Grass as GrassIcon,
  TrendingUp as TrendingUpIcon,
} from '@mui/icons-material';
import UploadPage from './pages/UploadPage';
import AnalysisPage from './pages/AnalysisPage';
import MapPage from './pages/MapPage';
import LibraryPage from './pages/LibraryPage';
import HistoryPage from './pages/HistoryPage';
import PrescriptionPage from './pages/PrescriptionPage';
import ForecastPage from './pages/ForecastPage';

const drawerWidth = 240;

function App() {
  const [mobileOpen, setMobileOpen] = useState(false);

  const menuItems = [
    { text: '数据上传', icon: <UploadIcon />, path: '/' },
    { text: '光谱分析', icon: <ShowChartIcon />, path: '/analysis' },
    { text: '病害分布图', icon: <MapIcon />, path: '/map' },
    { text: '病害预测', icon: <TrendingUpIcon />, path: '/forecast' },
    { text: '光谱库检索', icon: <SearchIcon />, path: '/library' },
    { text: '历史对比', icon: <TimelineIcon />, path: '/history' },
    { text: '施肥处方', icon: <GrassIcon />, path: '/prescription' },
  ];

  const drawer = (
    <div>
      <Toolbar>
        <Typography variant="h6" noWrap component="div">
          高光谱监测平台
        </Typography>
      </Toolbar>
      <List>
        {menuItems.map((item) => (
          <ListItem
            button
            component="a"
            href={item.path}
            key={item.text}
          >
            <ListItemIcon>{item.icon}</ListItemIcon>
            <ListItemText primary={item.text} />
          </ListItem>
        ))}
      </List>
    </div>
  );

  return (
    <Box sx={{ display: 'flex' }}>
      <AppBar
        position="fixed"
        sx={{
          width: { sm: `calc(100% - ${drawerWidth}px)` },
          ml: { sm: `${drawerWidth}px` },
        }}
      >
        <Toolbar>
          <IconButton
            color="inherit"
            edge="start"
            onClick={() => setMobileOpen(!mobileOpen)}
            sx={{ mr: 2, display: { sm: 'none' } }}
          >
            <MenuIcon />
          </IconButton>
          <Typography variant="h6" noWrap component="div">
            农作物病害高光谱监测平台
          </Typography>
        </Toolbar>
      </AppBar>

      <Box
        component="nav"
        sx={{ width: { sm: drawerWidth }, flexShrink: { sm: 0 } }}
      >
        <Drawer
          variant="temporary"
          open={mobileOpen}
          onClose={() => setMobileOpen(false)}
          ModalProps={{
            keepMounted: true,
          }}
          sx={{
            display: { xs: 'block', sm: 'none' },
            '& .MuiDrawer-paper': {
              boxSizing: 'border-box',
              width: drawerWidth,
            },
          }}
        >
          {drawer}
        </Drawer>
        <Drawer
          variant="permanent"
          sx={{
            display: { xs: 'none', sm: 'block' },
            '& .MuiDrawer-paper': {
              boxSizing: 'border-box',
              width: drawerWidth,
            },
          }}
          open
        >
          {drawer}
        </Drawer>
      </Box>

      <Box
        component="main"
        sx={{
          flexGrow: 1,
          p: 3,
          width: { sm: `calc(100% - ${drawerWidth}px)` },
          mt: 8,
        }}
      >
        <Routes>
          <Route path="/" element={<UploadPage />} />
          <Route path="/analysis" element={<AnalysisPage />} />
          <Route path="/map" element={<MapPage />} />
          <Route path="/forecast" element={<ForecastPage />} />
          <Route path="/library" element={<LibraryPage />} />
          <Route path="/history" element={<HistoryPage />} />
          <Route path="/prescription" element={<PrescriptionPage />} />
        </Routes>
      </Box>
    </Box>
  );
}

export default App;
