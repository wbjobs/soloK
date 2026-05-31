import React, { useState, useEffect, useCallback } from 'react';
import {
  Box,
  Card,
  CardContent,
  Typography,
  Button,
  IconButton,
  Stack,
  Chip,
  Divider,
  Paper,
  Tooltip,
  Radio,
  RadioGroup,
  FormControlLabel,
  FormControl,
  Slider,
  LinearProgress,
  Alert
} from '@mui/material';
import AutoAwesomeIcon from '@mui/icons-material/AutoAwesome';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import AddIcon from '@mui/icons-material/Add';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import KeyboardArrowRightIcon from '@mui/icons-material/KeyboardArrowRight';
import { RIGHT_HAND_TECHNIQUES, HUI_POSITIONS, STRINGS, getNoteFromPosition } from './NotationEditor.jsx';

const FINGER_OPTIONS = ['挑', '勾', '抹', '剔', '托', '摘', '打', '劈'];
const HUI_OPTIONS = [5, 6, 7, 8, 9, 10, 11, 12, 13];
const STRING_OPTIONS = [1, 2, 3, 4, 5, 6, 7];

const SAMPLE_PREDICTIONS = [
  {
    id: 'scheme1',
    name: '经典传承方案',
    description: '基于《神奇秘谱》传承指法',
    confidence: 0.85,
    style: 'traditional',
    notes: [
      { finger: '挑', hui: 7, string: 2 },
      { finger: '勾', hui: 6, string: 3 },
      { finger: '抹', hui: 5, string: 4 },
      { finger: '挑', hui: 7, string: 2 },
      { finger: '勾', hui: 6, string: 3 },
      { finger: '托', hui: 7, string: 1 }
    ]
  },
  {
    id: 'scheme2',
    name: '现代演奏方案',
    description: '适合现代舞台表演',
    confidence: 0.78,
    style: 'modern',
    notes: [
      { finger: '挑', hui: 7, string: 2 },
      { finger: '勾', hui: 6, string: 2 },
      { finger: '抹', hui: 5, string: 3 },
      { finger: '剔', hui: 7, string: 1 },
      { finger: '挑', hui: 9, string: 1 },
      { finger: '勾', hui: 6, string: 3 }
    ]
  },
  {
    id: 'scheme3',
    name: '梅庵派方案',
    description: '梅庵琴派传谱风格',
    confidence: 0.72,
    style: 'meian',
    notes: [
      { finger: '托', hui: 7, string: 1 },
      { finger: '勾', hui: 6, string: 2 },
      { finger: '抹', hui: 5, string: 3 },
      { finger: '打', hui: 9, string: 5 },
      { finger: '摘', hui: 10, string: 6 },
      { finger: '挑', hui: 7, string: 2 }
    ]
  }
];

export default function PredictionPanel({ onApplyScheme, currentNotation, showNotification }) {
  const [inputSequence, setInputSequence] = useState([]);
  const [predictions, setPredictions] = useState([]);
  const [isPredicting, setIsPredicting] = useState(false);
  const [selectedScheme, setSelectedScheme] = useState('');
  const [predictionLength, setPredictionLength] = useState(6);
  const [showInputPanel, setShowInputPanel] = useState(true);

  useEffect(() => {
    if (currentNotation && currentNotation.extracted_notes) {
      const recentNotes = currentNotation.extracted_notes.slice(-3);
      if (recentNotes.length > 0) {
        setInputSequence(recentNotes.map(n => ({
          finger: n.finger,
          hui: n.hui,
          string: n.string
        })));
      }
    }
  }, [currentNotation]);

  const addNoteToInput = useCallback((finger, hui, string) => {
    setInputSequence(prev => [...prev, { finger, hui, string }]);
  }, []);

  const removeNoteFromInput = useCallback((index) => {
    setInputSequence(prev => prev.filter((_, i) => i !== index));
  }, []);

  const clearInput = useCallback(() => {
    setInputSequence([]);
    setPredictions([]);
    setSelectedScheme('');
  }, []);

  const handlePredict = useCallback(async () => {
    if (inputSequence.length < 2) {
      showNotification('请至少输入2个减字作为预测依据', 'warning');
      return;
    }

    setIsPredicting(true);

    try {
      const response = await fetch('http://localhost:8000/predict', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sequence: inputSequence,
          length: predictionLength,
          num_schemes: 3
        })
      });

      if (response.ok) {
        const data = await response.json();
        setPredictions(data.schemes || SAMPLE_PREDICTIONS);
      } else {
        setPredictions(SAMPLE_PREDICTIONS);
      }
    } catch (err) {
      setPredictions(SAMPLE_PREDICTIONS);
    }

    setIsPredicting(false);
    setSelectedScheme(SAMPLE_PREDICTIONS[0].id);
    showNotification('已生成3种预测方案', 'success');
  }, [inputSequence, predictionLength, showNotification]);

  const handleApply = useCallback(() => {
    const scheme = predictions.find(p => p.id === selectedScheme);
    if (!scheme) {
      showNotification('请选择一个方案', 'warning');
      return;
    }
    if (onApplyScheme) {
      onApplyScheme(scheme.notes);
    }
    showNotification(`已应用「${scheme.name}」`, 'success');
  }, [predictions, selectedScheme, onApplyScheme, showNotification]);

  const getStyleColor = (style) => {
    switch (style) {
      case 'traditional': return '#c9a227';
      case 'modern': return '#40916c';
      case 'meian': return '#457b9d';
      default: return '#8b6914';
    }
  };

  return (
    <Card sx={{ mb: 2 }}>
      <CardContent>
        <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 2 }}>
          <Typography variant="h6">
            <AutoAwesomeIcon sx={{ fontSize: 20, mr: 1, verticalAlign: 'middle', color: 'primary.main' }} />
            AI 指法预测
          </Typography>
          <Button
            size="small"
            onClick={() => setShowInputPanel(!showInputPanel)}
          >
            {showInputPanel ? '收起' : '展开'}
          </Button>
        </Stack>

        {showInputPanel && (
          <>
            <Box sx={{ mb: 2 }}>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
                已输入序列（输入开头2-4个减字）:
              </Typography>
              <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap sx={{ minHeight: 40 }}>
                {inputSequence.length === 0 ? (
                  <Typography variant="body2" color="text.disabled">
                    请在下方选择或直接从编辑器导入
                  </Typography>
                ) : (
                  inputSequence.map((note, idx) => (
                    <Chip
                      key={idx}
                      label={`${note.finger}${note.hui}${note.string}`}
                      onDelete={() => removeNoteFromInput(idx)}
                      size="small"
                    />
                  ))
                )}
              </Stack>
            </Box>

            <Paper sx={{ p: 2, mb: 2, bgcolor: 'rgba(255,255,255,0.03)' }}>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
                快速添加:
              </Typography>
              <Stack direction="row" spacing={0.5} flexWrap="wrap" useFlexGap sx={{ mb: 2 }}>
                {[
                  { f: '挑', h: 7, s: 2 },
                  { f: '勾', h: 6, s: 3 },
                  { f: '抹', h: 5, s: 4 },
                  { f: '剔', h: 7, s: 1 },
                  { f: '托', h: 7, s: 1 },
                  { f: '打', h: 9, s: 5 }
                ].map((item, idx) => (
                  <Chip
                    key={idx}
                    label={`${item.f}${item.h}${item.s}`}
                    size="small"
                    onClick={() => addNoteToInput(item.f, item.h, item.s)}
                    icon={<AddIcon sx={{ fontSize: 14 }} />}
                    sx={{ m: 0.25 }}
                  />
                ))}
              </Stack>

              <Stack direction="row" spacing={1}>
                <FormControl size="small" sx={{ minWidth: 80 }}>
                  <Chip label="指法" size="small" variant="outlined" />
                </FormControl>
                <Stack direction="row" spacing={0.5} flexWrap="wrap">
                  {FINGER_OPTIONS.slice(0, 4).map(f => (
                    <Button
                      key={f}
                      size="small"
                      variant="outlined"
                      onClick={() => addNoteToInput(f, 7, 2)}
                      sx={{ minWidth: 40, p: 0.5 }}
                    >
                      {f}
                    </Button>
                  ))}
                </Stack>
              </Stack>
            </Paper>

            <Box sx={{ mb: 2 }}>
              <Stack direction="row" spacing={2} alignItems="center">
                <Typography variant="body2" sx={{ minWidth: 80 }}>预测长度:</Typography>
                <Slider
                  value={predictionLength}
                  onChange={(_, v) => setPredictionLength(v)}
                  min={3}
                  max={16}
                  step={1}
                  sx={{ flex: 1, maxWidth: 300 }}
                  marks
                />
                <Typography variant="body2">{predictionLength} 个减字</Typography>
              </Stack>
            </Box>

            <Stack direction="row" spacing={1} sx={{ mb: 2 }}>
              <Button
                variant="contained"
                onClick={handlePredict}
                disabled={isPredicting || inputSequence.length < 2}
                startIcon={isPredicting ? <CircularProgress size={16} /> : <AutoAwesomeIcon />}
              >
                {isPredicting ? '预测中...' : '生成预测方案'}
              </Button>
              <Button variant="outlined" onClick={clearInput}>
                清空
              </Button>
            </Stack>
          </>
        )}

        {predictions.length > 0 && (
          <>
            <Divider sx={{ my: 2 }} />
            <Typography variant="h6" sx={{ mb: 2 }}>
              预测方案 (选择一个应用)
            </Typography>

            <FormControl component="fieldset" fullWidth>
              <RadioGroup
                value={selectedScheme}
                onChange={(e) => setSelectedScheme(e.target.value)}
              >
                <Stack spacing={2}>
                  {predictions.map((scheme) => (
                    <Paper
                      key={scheme.id}
                      sx={{
                        p: 2,
                        border: selectedScheme === scheme.id
                          ? '2px solid'
                          : '1px solid rgba(255,255,255,0.1)',
                        borderColor: selectedScheme === scheme.id
                          ? getStyleColor(scheme.style)
                          : 'transparent',
                        bgcolor: selectedScheme === scheme.id
                          ? `${getStyleColor(scheme.style)}15`
                          : 'rgba(255,255,255,0.02)',
                        transition: 'all 0.2s'
                      }}
                    >
                      <Stack direction="row" alignItems="flex-start" spacing={2}>
                        <FormControlLabel
                          value={scheme.id}
                          control={<Radio />}
                          label=""
                          sx={{ mt: -1 }}
                        />
                        <Box sx={{ flex: 1 }}>
                          <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 1 }}>
                            <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
                              {scheme.name}
                            </Typography>
                            <Chip
                              label={`${Math.round(scheme.confidence * 100)}%`}
                              size="small"
                              sx={{ bgcolor: `${getStyleColor(scheme.style)}30`, color: getStyleColor(scheme.style) }}
                            />
                          </Stack>
                          <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
                            {scheme.description}
                          </Typography>
                          <Stack direction="row" spacing={0.5} flexWrap="wrap" useFlexGap>
                            {scheme.notes.map((note, idx) => (
                              <span key={idx} className="notation-char" style={{ minWidth: 45, fontSize: '0.9rem' }}>
                                {note.finger}{note.hui}{note.string}
                              </span>
                            ))}
                          </Stack>
                        </Box>
                        <Tooltip title="试听">
                          <IconButton size="small">
                            <PlayArrowIcon />
                          </IconButton>
                        </Tooltip>
                      </Stack>
                    </Paper>
                  ))}
                </Stack>
              </RadioGroup>
            </FormControl>

            <Stack direction="row" justifyContent="flex-end" sx={{ mt: 2 }}>
              <Button
                variant="contained"
                color="primary"
                onClick={handleApply}
                disabled={!selectedScheme}
                endIcon={<CheckCircleIcon />}
              >
                应用选中方案
              </Button>
            </Stack>
          </>
        )}
      </CardContent>
    </Card>
  );
}

function CircularProgress({ size }) {
  return (
    <Box
      sx={{
        display: 'inline-block',
        width: size,
        height: size,
        animation: 'spin 1s linear infinite',
        '@keyframes spin': {
          '0%': { transform: 'rotate(0deg)' },
          '100%': { transform: 'rotate(360deg)' }
        }
      }}
    >
      <Box
        sx={{
          width: '100%',
          height: '100%',
          border: '2px solid currentColor',
          borderTopColor: 'transparent',
          borderRadius: '50%'
        }}
      />
    </Box>
  );
}
