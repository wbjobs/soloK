import React from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  Drawer,
  List,
  ListItem,
  ListItemIcon,
  ListItemText,
  ListItemButton,
  Tooltip,
  Divider,
  Box
} from '@mui/material';
import PhotoLibraryIcon from '@mui/icons-material/PhotoLibrary';
import EditNoteIcon from '@mui/icons-material/EditNote';
import CompareArrowsIcon from '@mui/icons-material/CompareArrows';
import SchoolIcon from '@mui/icons-material/School';
import SearchIcon from '@mui/icons-material/Search';
import SettingsIcon from '@mui/icons-material/Settings';
import LibraryMusicIcon from '@mui/icons-material/LibraryMusic';

const navItems = [
  { path: '/import', label: '图片导入与识别', icon: <PhotoLibraryIcon /> },
  { path: '/editor', label: '减字谱编辑器', icon: <EditNoteIcon /> },
  { path: '/comparison', label: '多谱对比', icon: <CompareArrowsIcon /> },
  { path: '/learning', label: '琴曲学习', icon: <SchoolIcon /> },
  { path: '/search', label: '向量检索', icon: <SearchIcon /> },
  { path: '/settings', label: '设置', icon: <SettingsIcon /> }
];

const DRAWER_WIDTH = 200;
const COLLAPSED_WIDTH = 56;

export default function Sidebar({ collapsed }) {
  const location = useLocation();
  const navigate = useNavigate();

  const width = collapsed ? COLLAPSED_WIDTH : DRAWER_WIDTH;

  return (
    <Drawer
      variant="permanent"
      sx={{
        width: width,
        flexShrink: 0,
        '& .MuiDrawer-paper': {
          width: width,
          boxSizing: 'border-box',
          bgcolor: 'background.paper',
          borderRight: '1px solid rgba(255,255,255,0.1)',
          overflowX: 'hidden',
          transition: 'width 0.2s'
        }
      }}
    >
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          p: 1.5,
          borderBottom: '1px solid rgba(255,255,255,0.05)'
        }}
      >
        <LibraryMusicIcon sx={{ color: 'primary.main', fontSize: 28 }} />
        {!collapsed && (
          <Box sx={{ ml: 1 }}>
            <Box
              sx={{
                fontSize: '0.75rem',
                color: 'text.secondary',
                lineHeight: 1
              }}
            >
              Guqin
            </Box>
            <Box
              sx={{
                fontSize: '0.65rem',
                color: 'text.secondary',
                mt: 0.3
              }}
            >
              Jianzipu Studio
            </Box>
          </Box>
        )}
      </Box>

      <List sx={{ flex: 1, py: 1 }}>
        {navItems.map((item) => {
          const isActive = location.pathname === item.path;

          if (collapsed) {
            return (
              <Tooltip
                key={item.path}
                title={item.label}
                placement="right"
                arrow
              >
                <ListItemButton
                  onClick={() => navigate(item.path)}
                  sx={{
                    justifyContent: 'center',
                    px: 0,
                    my: 0.5,
                    mx: 0.5,
                    borderRadius: 1,
                    bgcolor: isActive ? 'primary.main' : 'transparent',
                    color: isActive ? 'white' : 'text.primary',
                    '&:hover': {
                      bgcolor: isActive ? 'primary.light' : 'rgba(255,255,255,0.05)'
                    }
                  }}
                >
                  <ListItemIcon sx={{ minWidth: 0, justifyContent: 'center' }}>
                    {item.icon}
                  </ListItemIcon>
                </ListItemButton>
              </Tooltip>
            );
          }

          return (
            <ListItem key={item.path} disablePadding sx={{ my: 0.3, px: 1 }}>
              <ListItemButton
                onClick={() => navigate(item.path)}
                sx={{
                  borderRadius: 1,
                  pl: 1.5,
                  bgcolor: isActive ? 'rgba(139, 105, 20, 0.2)' : 'transparent',
                  borderLeft: isActive ? '3px solid #c9a227' : '3px solid transparent',
                  '&:hover': {
                    bgcolor: isActive ? 'rgba(139, 105, 20, 0.3)' : 'rgba(255,255,255,0.05)'
                  }
                }}
              >
                <ListItemIcon
                  sx={{
                    minWidth: 36,
                    color: isActive ? 'primary.light' : 'text.secondary'
                  }}
                >
                  {item.icon}
                </ListItemIcon>
                <ListItemText
                  primary={item.label}
                  sx={{
                    '& .MuiTypography-root': {
                      fontSize: '0.85rem',
                      color: isActive ? 'text.primary' : 'text.secondary',
                      fontWeight: isActive ? 500 : 400
                    }
                  }}
                />
              </ListItemButton>
            </ListItem>
          );
        })}
      </List>

      <Divider sx={{ borderColor: 'rgba(255,255,255,0.05)' }} />

      <Box sx={{ p: 1.5 }}>
        {!collapsed && (
          <Box
            sx={{
              fontSize: '0.7rem',
              color: 'text.secondary',
              textAlign: 'center',
              lineHeight: 1.5
            }}
          >
            古琴减字谱<br/>识别与打谱编辑器
            <Box sx={{ mt: 1, fontSize: '0.65rem', opacity: 0.6 }}>
              v1.0.0
            </Box>
          </Box>
        )}
      </Box>
    </Drawer>
  );
}
