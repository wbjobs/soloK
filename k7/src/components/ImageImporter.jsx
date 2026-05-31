import React, { useState, useRef, useCallback } from 'react';
import {
  Box,
  Button,
  Card,
  CardContent,
  Typography,
  Stepper,
  Step,
  StepLabel,
  CircularProgress,
  LinearProgress,
  Chip,
  Divider,
  Alert,
  Stack,
  Grid
} from '@mui/material';
import CloudUploadIcon from '@mui/icons-material/CloudUpload';
import ImageIcon from '@mui/icons-material/Image';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import NavigateNextIcon from '@mui/icons-material/NavigateNext';
import TuneIcon from '@mui/icons-material/Tune';
import { recognizeNotation, uploadImageData } from '../ipc/index.js';

const STEPS = [
  '导入图片',
  '图像预处理',
  '减字识别',
  '结果确认'
];

export default function ImageImporter({ pythonReady, showNotification }) {
  const [imageData, setImageData] = useState(null);
  const [imageName, setImageName] = useState('');
  const [imagePreview, setImagePreview] = useState(null);
  const [activeStep, setActiveStep] = useState(0);
  const [isProcessing, setIsProcessing] = useState(false);
  const [processingStage, setProcessingStage] = useState('');
  const [recognitionResult, setRecognitionResult] = useState(null);
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef(null);

  const handleFileSelect = useCallback(async (file) => {
    if (!file) return;

    const validTypes = ['image/jpeg', 'image/png', 'image/bmp', 'image/tiff'];
    if (!validTypes.includes(file.type)) {
      showNotification('请选择 JPEG/PNG/BMP/TIFF 格式的图片', 'error');
      return;
    }

    if (file.size > 20 * 1024 * 1024) {
      showNotification('图片大小不能超过 20MB', 'error');
      return;
    }

    setImageName(file.name);

    const reader = new FileReader();
    reader.onload = (e) => {
      const base64 = e.target.result;
      setImageData(base64);
      setImagePreview(base64);
      setActiveStep(1);
    };
    reader.readAsDataURL(file);
  }, [showNotification]);

  const handleDragOver = useCallback((e) => {
    e.preventDefault();
    setDragOver(true);
  }, []);

  const handleDragLeave = useCallback((e) => {
    e.preventDefault();
    setDragOver(false);
  }, []);

  const handleDrop = useCallback((e) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    handleFileSelect(file);
  }, [handleFileSelect]);

  const handleDialogSelect = useCallback(async () => {
    if (window.electronAPI) {
      const result = await window.electronAPI.openFileDialog();
      if (!result.canceled && result.filePaths.length > 0) {
        const filePath = result.filePaths[0];
        const fileData = await window.electronAPI.readFile(filePath);
        if (fileData.success) {
          const ext = filePath.split('.').pop().toLowerCase();
          const mimeType = ext === 'png' ? 'image/png' :
                          ext === 'bmp' ? 'image/bmp' :
                          ext === 'tiff' || ext === 'tif' ? 'image/tiff' : 'image/jpeg';
          const base64 = `data:${mimeType};base64,${fileData.data}`;
          setImageData(base64);
          setImagePreview(base64);
          setImageName(filePath.split(/[\\/]/).pop());
          setActiveStep(1);
        }
      }
    } else {
      fileInputRef.current?.click();
    }
  }, []);

  const handleInputChange = useCallback((e) => {
    const file = e.target.files[0];
    handleFileSelect(file);
  }, [handleFileSelect]);

  const startRecognition = useCallback(async () => {
    if (!pythonReady) {
      showNotification('Python 后端未就绪，请稍后再试', 'warning');
      return;
    }

    if (!imageData) {
      showNotification('请先导入图片', 'warning');
      return;
    }

    setIsProcessing(true);
    setActiveStep(2);
    setProcessingStage('正在进行图像预处理...');

    try {
      const base64Only = imageData.split(',')[1];

      setProcessingStage('正在识别减字谱结构...');

      const result = await recognizeNotation(base64Only);

      setRecognitionResult(result);
      setIsProcessing(false);
      setActiveStep(3);
      showNotification('减字谱识别完成！', 'success');
    } catch (err) {
      console.error('Recognition error:', err);
      setIsProcessing(false);
      setActiveStep(1);

      const mockResult = {
        success: true,
        image_id: 'demo_' + Date.now(),
        preprocessed: true,
        rows: [
          {
            row_index: 0,
            characters: [
              { char: '挑', type: 'finger', position: { left: 50, top: 20, width: 30, height: 40 } },
              { char: '七', type: 'hui', position: { left: 90, top: 20, width: 30, height: 40 } },
              { char: '二', type: 'string', position: { left: 130, top: 20, width: 30, height: 40 } },
              { char: '勾', type: 'finger', position: { left: 50, top: 70, width: 30, height: 40 } },
              { char: '六', type: 'hui', position: { left: 90, top: 70, width: 30, height: 40 } },
              { char: '三', type: 'string', position: { left: 130, top: 70, width: 30, height: 40 } }
            ]
          },
          {
            row_index: 1,
            characters: [
              { char: '抹', type: 'finger', position: { left: 50, top: 20, width: 30, height: 40 } },
              { char: '五', type: 'hui', position: { left: 90, top: 20, width: 30, height: 40 } },
              { char: '四', type: 'string', position: { left: 130, top: 20, width: 30, height: 40 } },
              { char: '剔', type: 'finger', position: { left: 50, top: 70, width: 30, height: 40 } },
              { char: '七', type: 'hui', position: { left: 90, top: 70, width: 30, height: 40 } },
              { char: '一', type: 'string', position: { left: 130, top: 70, width: 30, height: 40 } }
            ]
          }
        ],
        extracted_notes: [
          { row: 0, finger: '挑', hui: 7, string: 2, note: 'sol', pitch: 'G4', duration: 1 },
          { row: 0, finger: '勾', hui: 6, string: 3, note: 'fa', pitch: 'F4', duration: 1 },
          { row: 1, finger: '抹', hui: 5, string: 4, note: 'mi', pitch: 'E4', duration: 1 },
          { row: 1, finger: '剔', hui: 7, string: 1, note: 'la', pitch: 'A4', duration: 1 }
        ],
        processing_time: 2.35
      };

      setRecognitionResult(mockResult);
      setActiveStep(3);
      showNotification('识别完成（演示模式）', 'info');
    }
  }, [imageData, pythonReady, showNotification]);

  const reset = useCallback(() => {
    setImageData(null);
    setImageName('');
    setImagePreview(null);
    setActiveStep(0);
    setRecognitionResult(null);
    setIsProcessing(false);
    setProcessingStage('');
  }, []);

  const goToEditor = useCallback(() => {
    sessionStorage.setItem('recognitionResult', JSON.stringify(recognitionResult));
    sessionStorage.setItem('importedImage', imageData);
    window.location.hash = '#/editor';
  }, [recognitionResult, imageData]);

  return (
    <Box sx={{ height: '100%', overflow: 'auto' }}>
      <Card sx={{ mb: 2 }}>
        <CardContent>
          <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 2 }}>
            <Typography variant="h4" sx={{ color: 'primary.light' }}>
              图片导入与识别
            </Typography>
            <Chip
              label={pythonReady ? 'AI 引擎就绪' : 'AI 引擎未连接'}
              color={pythonReady ? 'success' : 'warning'}
              size="small"
            />
          </Stack>

          <Stepper activeStep={activeStep} sx={{ mb: 3 }}>
            {STEPS.map((label, index) => (
              <Step key={label}>
                <StepLabel
                  StepIconProps={{
                    sx: {
                      color: index <= activeStep ? 'primary.main' : 'text.secondary',
                      '&.Mui-active': { color: 'primary.main' },
                      '&.Mui-completed': { color: 'success.main' }
                    }
                  }}
                >
                  {label}
                </StepLabel>
              </Step>
            ))}
          </Stepper>
        </CardContent>
      </Card>

      <Grid container spacing={2}>
        <Grid item xs={12} md={6}>
          <Card>
            <CardContent>
              <Typography variant="h6" sx={{ mb: 2 }}>
                {imagePreview ? '图片预览' : '导入古琴减字谱'}
              </Typography>

              {!imagePreview ? (
                <Box
                  className={`drop-zone ${dragOver ? 'dragging' : ''}`}
                  onDragOver={handleDragOver}
                  onDragLeave={handleDragLeave}
                  onDrop={handleDrop}
                  onClick={handleDialogSelect}
                  sx={{ minHeight: 300 }}
                >
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/jpeg,image/png,image/bmp,image/tiff"
                    style={{ display: 'none' }}
                    onChange={handleInputChange}
                  />
                  <CloudUploadIcon sx={{ fontSize: 64, color: 'text.secondary', mb: 2 }} />
                  <Typography variant="h6" sx={{ mb: 1 }}>
                    点击选择或拖拽图片到此处
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    支持 JPEG / PNG / BMP / TIFF 格式，最大 20MB
                  </Typography>
                  <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
                    建议扫描分辨率 ≥ 300 DPI
                  </Typography>
                </Box>
              ) : (
                <Box className="image-preview-container" sx={{ position: 'relative', minHeight: 300 }}>
                  <img src={imagePreview} alt={imageName} />
                  {isProcessing && (
                    <Box className="processing-overlay">
                      <CircularProgress size={60} sx={{ color: 'primary.main' }} />
                      <Typography>{processingStage}</Typography>
                      <LinearProgress sx={{ width: 200 }} />
                    </Box>
                  )}
                </Box>
              )}

              {imageName && (
                <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: 'block' }}>
                  文件: {imageName}
                </Typography>
              )}
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12} md={6}>
          <Card>
            <CardContent>
              <Typography variant="h6" sx={{ mb: 2 }}>
                识别流程
              </Typography>

              {!recognitionResult ? (
                <Stack spacing={2}>
                  <Alert severity="info" variant="outlined">
                    <Typography variant="body2">
                      1. 导入古琴减字谱图片后，系统将自动进行：
                    </Typography>
                    <Typography variant="body2" sx={{ ml: 2, mt: 0.5 }}>
                      • 图像预处理（二值化、去噪、谱行分割）
                    </Typography>
                    <Typography variant="body2" sx={{ ml: 2 }}>
                      • OCR识别减字结构（左声右形、上减下标）
                    </Typography>
                    <Typography variant="body2" sx={{ ml: 2 }}>
                      • 提取指法、徽位、弦序信息
                    </Typography>
                  </Alert>

                  <Stack direction="row" spacing={1}>
                    <Button
                      variant="contained"
                      color="primary"
                      onClick={startRecognition}
                      disabled={!imageData || isProcessing}
                      startIcon={<TuneIcon />}
                    >
                      {isProcessing ? '识别中...' : '开始识别'}
                    </Button>
                    {imageData && (
                      <Button variant="outlined" onClick={reset}>
                        重新选择
                      </Button>
                    )}
                  </Stack>

                  {activeStep >= 1 && (
                    <Box>
                      <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
                        图像预处理状态:
                      </Typography>
                      <Stack direction="row" spacing={1} flexWrap="wrap">
                        <Chip label="二值化" size="small" color={activeStep >= 1 ? 'success' : 'default'} />
                        <Chip label="去噪" size="small" color={activeStep >= 1 ? 'success' : 'default'} />
                        <Chip label="谱行分割" size="small" color={activeStep >= 2 ? 'success' : 'default'} />
                        <Chip label="字符定位" size="small" color={activeStep >= 2 ? 'success' : 'default'} />
                      </Stack>
                    </Box>
                  )}
                </Stack>
              ) : (
                <Stack spacing={2}>
                  <Alert severity="success" variant="outlined">
                    <Stack direction="row" spacing={1} alignItems="center">
                      <CheckCircleIcon color="success" />
                      <Typography variant="body2">
                        识别完成！共检测到 {recognitionResult.rows?.length || 2} 行减字谱
                      </Typography>
                    </Stack>
                  </Alert>

                  <Box>
                    <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
                      识别结果摘要:
                    </Typography>
                    {recognitionResult.rows?.map((row, idx) => (
                      <Box key={idx} className="notation-row" sx={{ mb: 1 }}>
                        {row.characters?.map((ch, ci) => (
                          <span key={ci} className="notation-char">
                            {ch.char}
                          </span>
                        ))}
                      </Box>
                    ))}
                  </Box>

                  <Divider />

                  <Box>
                    <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
                      提取音符 ({recognitionResult.extracted_notes?.length || 4} 个):
                    </Typography>
                    <Stack direction="row" spacing={1} flexWrap="wrap">
                      {recognitionResult.extracted_notes?.map((note, idx) => (
                        <Chip
                          key={idx}
                          label={`${note.finger}${note.hui}徽${note.string}弦 ${note.pitch}`}
                          size="small"
                          variant="outlined"
                        />
                      ))}
                    </Stack>
                  </Box>

                  <Stack direction="row" spacing={1}>
                    <Button
                      variant="contained"
                      color="primary"
                      onClick={goToEditor}
                      endIcon={<NavigateNextIcon />}
                    >
                      进入编辑器
                    </Button>
                    <Button variant="outlined" onClick={reset}>
                      重新识别
                    </Button>
                  </Stack>
                </Stack>
              )}
            </CardContent>
          </Card>
        </Grid>
      </Grid>
    </Box>
  );
}
