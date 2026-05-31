import React, { useState } from 'react';
import {
  Box,
  Card,
  CardContent,
  Typography,
  Stack,
  TextField,
  Switch,
  FormControlLabel,
  Divider,
  Slider,
  Button,
  Chip,
  Alert,
  Grid,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Accordion,
  AccordionSummary,
  AccordionDetails
} from '@mui/material';
import SettingsIcon from '@mui/icons-material/Settings';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import SaveIcon from '@mui/icons-material/Save';

export default function SettingsPage() {
  const [settings, setSettings] = useState({
    pythonPath: 'python',
    pythonBackendPort: 8000,
    autoStartPython: true,
    defaultTempo: 60,
    defaultVolume: 70,
    defaultSoundType: 'anxian',
    theme: 'dark',
    language: 'zh-CN',
    autoSave: true,
    autoSaveInterval: 5,
    imagePreprocess: {
      binarization: true,
      denoise: true,
      rowSegmentation: true,
      characterLocalization: true,
      threshold: 128
    },
    ocrSettings: {
      useGPU: false,
      modelPath: '',
      confidenceThreshold: 0.7,
      enableFallback: true
    },
    midiSettings: {
      defaultTempo: 60,
      defaultVolume: 100,
      soundFontPath: '',
      exportFormat: 'mid'
    },
    vectorSearch: {
      indexPath: '',
      embeddingModel: 'default',
      topK: 10,
      useApproximate: true
    }
  });

  const handleChange = (key, value) => {
    setSettings((prev) => ({
      ...prev,
      [key]: value
    }));
  };

  const handleNestedChange = (parent, key, value) => {
    setSettings((prev) => ({
      ...prev,
      [parent]: {
        ...prev[parent],
        [key]: value
      }
    }));
  };

  const handleSave = () => {
    localStorage.setItem('guqinSettings', JSON.stringify(settings));
    alert('设置已保存');
  };

  return (
    <Box sx={{ height: '100%', overflow: 'auto' }}>
      <Card sx={{ mb: 2 }}>
        <CardContent>
          <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 2 }}>
            <Typography variant="h4" sx={{ color: 'primary.light' }}>
              设置
            </Typography>
            <Button
              variant="contained"
              startIcon={<SaveIcon />}
              onClick={handleSave}
            >
              保存设置
            </Button>
          </Stack>

          <Accordion defaultExpanded sx={{ bgcolor: 'rgba(255,255,255,0.02)', mb: 1 }}>
            <AccordionSummary expandIcon={<ExpandMoreIcon />}>
              <Typography>Python 后端设置</Typography>
            </AccordionSummary>
            <AccordionDetails>
              <Grid container spacing={2}>
                <Grid item xs={12} md={6}>
                  <TextField
                    fullWidth
                    size="small"
                    label="Python 路径"
                    value={settings.pythonPath}
                    onChange={(e) => handleChange('pythonPath', e.target.value)}
                    helperText="Python 解释器的路径，默认为 python"
                  />
                </Grid>
                <Grid item xs={12} md={6}>
                  <TextField
                    fullWidth
                    size="small"
                    type="number"
                    label="后端端口"
                    value={settings.pythonBackendPort}
                    onChange={(e) => handleChange('pythonBackendPort', parseInt(e.target.value))}
                  />
                </Grid>
                <Grid item xs={12}>
                  <FormControlLabel
                    control={
                      <Switch
                        checked={settings.autoStartPython}
                        onChange={(e) => handleChange('autoStartPython', e.target.checked)}
                      />
                    }
                    label="启动应用时自动启动 Python 后端"
                  />
                </Grid>
              </Grid>
            </AccordionDetails>
          </Accordion>

          <Accordion defaultExpanded sx={{ bgcolor: 'rgba(255,255,255,0.02)', mb: 1 }}>
            <AccordionSummary expandIcon={<ExpandMoreIcon />}>
              <Typography>图像预处理设置</Typography>
            </AccordionSummary>
            <AccordionDetails>
              <Grid container spacing={2}>
                <Grid item xs={12} md={6}>
                  <FormControlLabel
                    control={
                      <Switch
                        checked={settings.imagePreprocess.binarization}
                        onChange={(e) => handleNestedChange('imagePreprocess', 'binarization', e.target.checked)}
                      />
                    }
                    label="启用二值化"
                  />
                </Grid>
                <Grid item xs={12} md={6}>
                  <FormControlLabel
                    control={
                      <Switch
                        checked={settings.imagePreprocess.denoise}
                        onChange={(e) => handleNestedChange('imagePreprocess', 'denoise', e.target.checked)}
                      />
                    }
                    label="启用去噪"
                  />
                </Grid>
                <Grid item xs={12} md={6}>
                  <FormControlLabel
                    control={
                      <Switch
                        checked={settings.imagePreprocess.rowSegmentation}
                        onChange={(e) => handleNestedChange('imagePreprocess', 'rowSegmentation', e.target.checked)}
                      />
                    }
                    label="谱行分割"
                  />
                </Grid>
                <Grid item xs={12} md={6}>
                  <FormControlLabel
                    control={
                      <Switch
                        checked={settings.imagePreprocess.characterLocalization}
                        onChange={(e) => handleNestedChange('imagePreprocess', 'characterLocalization', e.target.checked)}
                      />
                    }
                    label="字符定位"
                  />
                </Grid>
                <Grid item xs={12}>
                  <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
                    二值化阈值: {settings.imagePreprocess.threshold}
                  </Typography>
                  <Slider
                    value={settings.imagePreprocess.threshold}
                    onChange={(_, v) => handleNestedChange('imagePreprocess', 'threshold', v)}
                    min={0}
                    max={255}
                  />
                </Grid>
              </Grid>
            </AccordionDetails>
          </Accordion>

          <Accordion sx={{ bgcolor: 'rgba(255,255,255,0.02)', mb: 1 }}>
            <AccordionSummary expandIcon={<ExpandMoreIcon />}>
              <Typography>OCR 识别设置</Typography>
            </AccordionSummary>
            <AccordionDetails>
              <Grid container spacing={2}>
                <Grid item xs={12} md={6}>
                  <FormControlLabel
                    control={
                      <Switch
                        checked={settings.ocrSettings.useGPU}
                        onChange={(e) => handleNestedChange('ocrSettings', 'useGPU', e.target.checked)}
                      />
                    }
                    label="使用 GPU 加速"
                  />
                </Grid>
                <Grid item xs={12} md={6}>
                  <FormControlLabel
                    control={
                      <Switch
                        checked={settings.ocrSettings.enableFallback}
                        onChange={(e) => handleNestedChange('ocrSettings', 'enableFallback', e.target.checked)}
                      />
                    }
                    label="启用回退机制"
                  />
                </Grid>
                <Grid item xs={12}>
                  <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
                    置信度阈值: {(settings.ocrSettings.confidenceThreshold * 100).toFixed(0)}%
                  </Typography>
                  <Slider
                    value={settings.ocrSettings.confidenceThreshold}
                    onChange={(_, v) => handleNestedChange('ocrSettings', 'confidenceThreshold', v)}
                    min={0}
                    max={1}
                    step={0.05}
                  />
                </Grid>
              </Grid>
            </AccordionDetails>
          </Accordion>

          <Accordion sx={{ bgcolor: 'rgba(255,255,255,0.02)', mb: 1 }}>
            <AccordionSummary expandIcon={<ExpandMoreIcon />}>
              <Typography>MIDI 导出设置</Typography>
            </AccordionSummary>
            <AccordionDetails>
              <Grid container spacing={2}>
                <Grid item xs={12} md={6}>
                  <TextField
                    fullWidth
                    size="small"
                    type="number"
                    label="默认速度 (BPM)"
                    value={settings.midiSettings.defaultTempo}
                    onChange={(e) => handleNestedChange('midiSettings', 'defaultTempo', parseInt(e.target.value))}
                  />
                </Grid>
                <Grid item xs={12} md={6}>
                  <FormControl fullWidth size="small">
                    <InputLabel>导出格式</InputLabel>
                    <Select
                      value={settings.midiSettings.exportFormat}
                      label="导出格式"
                      onChange={(e) => handleNestedChange('midiSettings', 'exportFormat', e.target.value)}
                    >
                      <MenuItem value="mid">MIDI (.mid)</MenuItem>
                      <MenuItem value="midi">MIDI (.midi)</MenuItem>
                    </Select>
                  </FormControl>
                </Grid>
              </Grid>
            </AccordionDetails>
          </Accordion>

          <Accordion sx={{ bgcolor: 'rgba(255,255,255,0.02)', mb: 1 }}>
            <AccordionSummary expandIcon={<ExpandMoreIcon />}>
              <Typography>向量检索设置</Typography>
            </AccordionSummary>
            <AccordionDetails>
              <Grid container spacing={2}>
                <Grid item xs={12} md={6}>
                  <TextField
                    fullWidth
                    size="small"
                    type="number"
                    label="默认返回数量"
                    value={settings.vectorSearch.topK}
                    onChange={(e) => handleNestedChange('vectorSearch', 'topK', parseInt(e.target.value))}
                  />
                </Grid>
                <Grid item xs={12} md={6}>
                  <FormControlLabel
                    control={
                      <Switch
                        checked={settings.vectorSearch.useApproximate}
                        onChange={(e) => handleNestedChange('vectorSearch', 'useApproximate', e.target.checked)}
                      />
                    }
                    label="使用近似搜索"
                  />
                </Grid>
              </Grid>
            </AccordionDetails>
          </Accordion>

          <Accordion sx={{ bgcolor: 'rgba(255,255,255,0.02)' }}>
            <AccordionSummary expandIcon={<ExpandMoreIcon />}>
              <Typography>通用设置</Typography>
            </AccordionSummary>
            <AccordionDetails>
              <Grid container spacing={2}>
                <Grid item xs={12} md={6}>
                  <FormControl fullWidth size="small">
                    <InputLabel>界面语言</InputLabel>
                    <Select
                      value={settings.language}
                      label="界面语言"
                      onChange={(e) => handleChange('language', e.target.value)}
                    >
                      <MenuItem value="zh-CN">简体中文</MenuItem>
                      <MenuItem value="zh-TW">繁體中文</MenuItem>
                      <MenuItem value="en-US">English</MenuItem>
                    </Select>
                  </FormControl>
                </Grid>
                <Grid item xs={12} md={6}>
                  <FormControlLabel
                    control={
                      <Switch
                        checked={settings.autoSave}
                        onChange={(e) => handleChange('autoSave', e.target.checked)}
                      />
                    }
                    label="自动保存"
                  />
                </Grid>
                <Grid item xs={12} md={6}>
                  <TextField
                    fullWidth
                    size="small"
                    type="number"
                    label="自动保存间隔 (分钟)"
                    value={settings.autoSaveInterval}
                    onChange={(e) => handleChange('autoSaveInterval', parseInt(e.target.value))}
                    disabled={!settings.autoSave}
                  />
                </Grid>
              </Grid>
            </AccordionDetails>
          </Accordion>
        </CardContent>
      </Card>

      <Card>
        <CardContent>
          <Typography variant="h6" sx={{ mb: 2 }}>关于</Typography>
          <Stack spacing={1}>
            <Typography variant="body2">
              古琴减字谱识别与打谱编辑器 v1.0.0
            </Typography>
            <Typography variant="body2" color="text.secondary">
              基于 Electron + React + Python 构建的古琴乐谱数字化工具
            </Typography>
            <Typography variant="body2" color="text.secondary">
              支持古琴减字谱图像识别、打谱编辑、MIDI播放、多谱对比和琴曲学习
            </Typography>
          </Stack>
        </CardContent>
      </Card>
    </Box>
  );
}
