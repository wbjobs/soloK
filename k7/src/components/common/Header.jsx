import React from 'react';
import {
  AppBar,
  Toolbar,
  Typography,
  IconButton,
  Box,
  Chip,
  Tooltip,
  Menu,
  MenuItem
} from '@mui/material';
import MenuIcon from '@mui/icons-material/Menu';
import MusicNoteIcon from '@mui/icons-material/MusicNote';
import MemoryIcon from '@mui/icons-material/Memory';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import WarningIcon from '@mui/icons-material/Warning';
import ErrorIcon from '@mui/icons-material/Error';
import HelpOutlineIcon from '@mui/icons-material/HelpOutline';

export default function Header({ pythonStatus, onToggleSidebar }) {
  const [anchorEl, setAnchorEl] = React.useState(null);
  const open = Boolean(anchorEl);

  const handleClick = (event) => {
    setAnchorEl(event.currentTarget);
  };

  const handleClose = () => {
    setAnchorEl(null);
  };

  const getStatusIcon = () => {
    switch (pythonStatus) {
      case 'ready':
        return <CheckCircleIcon fontSize="small" sx={{ color: 'success.main' }} />;
      case 'checking':
        return <MemoryIcon fontSize="small" sx={{ color: 'info.main' }} />;
      case 'not-ready':
      case 'disconnected':
        return <WarningIcon fontSize="small" sx={{ color: 'warning.main' }} />;
      case 'error':
        return <ErrorIcon fontSize="small" sx={{ color: 'error.main' }} />;
      default:
        return <MemoryIcon fontSize="small" />;
    }
  };

  const getStatusText = () => {
    switch (pythonStatus) {
      case 'ready': return 'Python 就绪';
      case 'checking': return '检测中...';
      case 'not-ready': return 'Python 未就绪';
      case 'disconnected': return '连接断开';
      case 'error': return '启动失败';
      default: return '未知状态';
    }
  };

  return (
    <AppBar
      position="static"
      elevation={0}
      sx={{
        bgcolor: 'background.paper',
        borderBottom: '1px solid rgba(255,255,255,0.1)',
        zIndex: 1100
      }}
    >
      <Toolbar variant="dense" sx={{ minHeight: 48 }}>
        <IconButton
          edge="start"
          color="inherit"
          aria-label="toggle sidebar"
          onClick={onToggleSidebar}
          sx={{ mr: 1 }}
        >
          <MenuIcon />
        </IconButton>

        <MusicNoteIcon sx={{ color: 'primary.main', mr: 1 }} />

        <Typography
          variant="h6"
          component="div"
          sx={{
            flexGrow: 0,
            fontWeight: 600,
            background: 'linear-gradient(90deg, #c9a227, #8b6914)',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
            mr: 3
          }}
        >
          古琴减字谱编辑器
        </Typography>

        <Box sx={{ flexGrow: 1 }} />

        <Tooltip title={getStatusText()}>
          <Chip
            icon={getStatusIcon()}
            label={getStatusText()}
            size="small"
            sx={{
              mr: 1,
              bgcolor: 'rgba(255,255,255,0.05)',
              '& .MuiChip-icon': { ml: 0.5 }
            }}
          />
        </Tooltip>

        <Tooltip title="使用帮助">
          <IconButton
            color="inherit"
            onClick={handleClick}
            size="small"
          >
            <HelpOutlineIcon fontSize="small" />
          </IconButton>
        </Tooltip>

        <Menu
          anchorEl={anchorEl}
          open={open}
          onClose={handleClose}
          anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
        >
          <MenuItem onClick={handleClose}>
            <Typography variant="body2">1. 导入古琴减字谱图片</Typography>
          </MenuItem>
          <MenuItem onClick={handleClose}>
            <Typography variant="body2">2. AI自动识别减字结构</Typography>
          </MenuItem>
          <MenuItem onClick={handleClose}>
            <Typography variant="body2">3. 手动校对并编辑乐谱</Typography>
          </MenuItem>
          <MenuItem onClick={handleClose}>
            <Typography variant="body2">4. 播放MIDI或导出五线谱</Typography>
          </MenuItem>
          <MenuItem onClick={handleClose}>
            <Typography variant="body2">5. 多谱对比或进入学习模式</Typography>
          </MenuItem>
        </Menu>
      </Toolbar>
    </AppBar>
  );
}
