import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Box,
  Card,
  CardContent,
  Typography,
  Button,
  IconButton,
  Stack,
  Grid,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Slider,
  Chip,
  Paper,
  Tooltip,
  LinearProgress,
  Divider
} from '@mui/material';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import PauseIcon from '@mui/icons-material/Pause';
import StopIcon from '@mui/icons-material/Stop';
import RepeatIcon from '@mui/icons-material/Repeat';
import SkipNextIcon from '@mui/icons-material/SkipNext';
import SkipPreviousIcon from '@mui/icons-material/SkipPrevious';
import SchoolIcon from '@mui/icons-material/School';
import VolumeUpIcon from '@mui/icons-material/VolumeUp';
import MusicNoteIcon from '@mui/icons-material/MusicNote';
import { getLearningMaterial } from '../ipc/index.js';

const SAMPLE_PIECES = [
  { id: 'p1', name: '流水', difficulty: '中级', sections: ['引子', '第一段', '第二段', '尾声'] },
  { id: 'p2', name: '梅花三弄', difficulty: '初级', sections: ['引子', '梅花一弄', '梅花二弄', '梅花三弄', '尾声'] },
  { id: 'p3', name: '平沙落雁', difficulty: '高级', sections: ['引子', '第一段', '第二段', '第三段', '尾声'] }
];

const SAMPLE_LEARNING_DATA = {
  piece_id: 'p2',
  piece_name: '梅花三弄',
  section: '梅花一弄',
  tempo: 60,
  notes: [
    { row: 0, finger: '托', hui: 7, string: 1, note: 'A4', pitch: 'A4', duration: 1, midi: 69 },
    { row: 1, finger: '勾', hui: 6, string: 2, note: 'G4', pitch: 'G4', duration: 1, midi: 67 },
    { row: 2, finger: '抹', hui: 5, string: 3, note: 'F4', pitch: 'F4', duration: 1, midi: 65 },
    { row: 3, finger: '挑', hui: 7, string: 2, note: 'G4', pitch: 'G4', duration: 2, midi: 67 },
    { row: 4, finger: '托', hui: 7, string: 1, note: 'A4', pitch: 'A4', duration: 1, midi: 69 },
    { row: 5, finger: '勾', hui: 6, string: 2, note: 'G4', pitch: 'G4', duration: 1, midi: 67 },
    { row: 6, finger: '抹', hui: 5, string: 3, note: 'F4', pitch: 'F4', duration: 1, midi: 65 },
    { row: 7, finger: '挑', hui: 9, string: 1, note: 'D5', pitch: 'D5', duration: 2, midi: 74 }
  ]
};

function getFrequency(hui, string) {
  const stringBaseFreqs = [130.81, 146.83, 174.61, 196.00, 220.00, 261.63, 293.66];
  const huiRatios = [0.9439, 0.8909, 0.8409, 0.7937, 0.7492, 0.7071, 0.6674, 0.6299, 0.5946, 0.5612, 0.5297, 0.5, 0.4719];
  if (hui < 1 || hui > 13 || string < 1 || string > 7) return 0;
  return stringBaseFreqs[string - 1] / huiRatios[hui - 1];
}

export default function LearningMode({ pythonReady, showNotification }) {
  const [selectedPiece, setSelectedPiece] = useState('');
  const [selectedSection, setSelectedSection] = useState('');
  const [learningData, setLearningData] = useState(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isLooping, setIsLooping] = useState(false);
  const [currentNoteIndex, setCurrentNoteIndex] = useState(-1);
  const [loopStart, setLoopStart] = useState(0);
  const [loopEnd, setLoopEnd] = useState(0);
  const [tempo, setTempo] = useState(60);
  const [volume, setVolume] = useState(70);
  const [progress, setProgress] = useState(0);
  const audioContextRef = useRef(null);
  const masterGainRef = useRef(null);
  const oscillatorPoolRef = useRef([]);
  const schedulerRef = useRef(null);
  const playbackStartTimeRef = useRef(0);
  const loopIterationRef = useRef(0);
  const progressRef = useRef(null);

  const handleLoadMaterial = async () => {
    if (!selectedPiece || !selectedSection) {
      showNotification('请选择琴曲和段落', 'warning');
      return;
    }

    try {
      const result = await getLearningMaterial(selectedPiece, selectedSection);
      setLearningData(result);
      setLoopEnd((result.notes?.length || SAMPLE_LEARNING_DATA.notes.length) - 1);
    } catch (err) {
      setLearningData(SAMPLE_LEARNING_DATA);
      setLoopEnd(SAMPLE_LEARNING_DATA.notes.length - 1);
    }

    showNotification('学习材料已加载', 'success');
  };

  const scheduleNote = useCallback((ctx, note, startTime, endTime) => {
    const oscType = 'triangle';
    const freq = getFrequency(note.hui, note.string);

    let oscillator = oscillatorPoolRef.current.find(o => !o.inUse && o.type === oscType);

    if (!oscillator) {
      oscillator = {
        osc: ctx.createOscillator(),
        gain: ctx.createGain(),
        type: oscType,
        inUse: false
      };
      oscillator.osc.connect(oscillator.gain);
      oscillator.gain.connect(masterGainRef.current);
      oscillatorPoolRef.current.push(oscillator);
    }

    oscillator.inUse = true;
    oscillator.osc.type = oscType;
    oscillator.osc.frequency.setValueAtTime(freq, startTime);
    oscillator.gain.gain.setValueAtTime(0, startTime);

    const duration = endTime - startTime;
    oscillator.gain.gain.setValueAtTime(0, startTime);
    oscillator.gain.gain.linearRampToValueAtTime(volume / 100 * 0.3, startTime + 0.005);
    oscillator.gain.gain.setValueAtTime(volume / 100 * 0.3, startTime + duration * 0.8);
    oscillator.gain.gain.exponentialRampToValueAtTime(0.001, endTime - 0.005);

    oscillator.osc.start(startTime);
    oscillator.osc.stop(endTime);

    setTimeout(() => {
      if (oscillator) {
        oscillator.inUse = false;
      }
    }, (endTime - startTime) * 1000 + 50);
  }, [volume]);

  const startPlayback = useCallback((startIndex) => {
    if (!learningData || !learningData.notes) return;

    if (!audioContextRef.current) {
      audioContextRef.current = new (window.AudioContext || window.webkitAudioContext)();
      masterGainRef.current = audioContextRef.current.createGain();
      masterGainRef.current.connect(audioContextRef.current.destination);
    }

    const ctx = audioContextRef.current;
    if (ctx.state === 'suspended') {
      ctx.resume();
    }

    const notes = learningData.notes;
    const noteDuration = 60 / tempo;
    const scheduleAheadTime = 0.2;

    setIsPlaying(true);
    playbackStartTimeRef.current = ctx.currentTime + 0.05;
    loopIterationRef.current = 0;

    let nextNoteIndex = startIndex;
    let lastScheduledTime = playbackStartTimeRef.current + (startIndex - loopStart) * noteDuration;

    const scheduler = () => {
      while (lastScheduledTime < ctx.currentTime + scheduleAheadTime) {
        if (nextNoteIndex > loopEnd) {
          if (isLooping) {
            nextNoteIndex = loopStart;
            loopIterationRef.current++;
            lastScheduledTime = playbackStartTimeRef.current +
              loopIterationRef.current * (loopEnd - loopStart + 1) * noteDuration +
              (loopStart) * noteDuration;
          } else {
            break;
          }
        }

        if (nextNoteIndex < loopStart) {
          nextNoteIndex = loopStart;
        }

        const note = notes[nextNoteIndex];
        const startTime = lastScheduledTime;
        const endTime = startTime + noteDuration;

        scheduleNote(ctx, note, startTime, endTime);

        lastScheduledTime = endTime;
        nextNoteIndex++;
      }

      const elapsedTime = ctx.currentTime - playbackStartTimeRef.current;
      const loopDuration = (loopEnd - loopStart + 1) * noteDuration;
      const positionInLoop = ((elapsedTime % loopDuration) / noteDuration);
      const currentIdx = Math.floor(positionInLoop) + loopStart;

      if (currentIdx !== currentNoteIndex && currentIdx >= loopStart && currentIdx <= loopEnd) {
        setCurrentNoteIndex(currentIdx);
        setProgress(((currentIdx - loopStart + 1) / (loopEnd - loopStart + 1)) * 100);
      }

      if (!isLooping && nextNoteIndex > loopEnd) {
        const remainingTime = lastScheduledTime - ctx.currentTime;
        if (remainingTime <= 0) {
          stopPlayback();
          return;
        }
      }

      if (isPlaying) {
        schedulerRef.current = requestAnimationFrame(scheduler);
      }
    };

    scheduler();
  }, [learningData, isLooping, loopStart, loopEnd, tempo, scheduleNote, isPlaying, currentNoteIndex]);

  const stopPlayback = useCallback(() => {
    if (schedulerRef.current) {
      cancelAnimationFrame(schedulerRef.current);
      schedulerRef.current = null;
    }

    if (audioContextRef.current) {
      try {
        audioContextRef.current.close();
      } catch (e) {}
      audioContextRef.current = null;
      masterGainRef.current = null;
    }

    oscillatorPoolRef.current = [];
    loopIterationRef.current = 0;

    setIsPlaying(false);
    setCurrentNoteIndex(-1);
    setProgress(0);
  }, []);

  const handlePlayPause = () => {
    if (isPlaying) {
      stopPlayback();
    } else {
      const startIdx = currentNoteIndex >= 0 && currentNoteIndex >= loopStart ? currentNoteIndex : loopStart;
      startPlayback(startIdx);
    }
  };

  const handleStop = () => {
    stopPlayback();
  };

  const handlePrevious = () => {
    if (currentNoteIndex > loopStart) {
      setCurrentNoteIndex(currentNoteIndex - 1);
    }
  };

  const handleNext = () => {
    if (learningData && currentNoteIndex < (learningData.notes?.length || 0) - 1) {
      setCurrentNoteIndex(currentNoteIndex + 1);
    }
  };

  useEffect(() => {
    return () => {
      if (schedulerRef.current) {
        cancelAnimationFrame(schedulerRef.current);
      }
      if (audioContextRef.current) {
        try {
          audioContextRef.current.close();
        } catch (e) {}
      }
    };
  }, []);

  const currentNote = learningData?.notes?.[currentNoteIndex];
  const currentPiece = SAMPLE_PIECES.find((p) => p.id === selectedPiece);

  return (
    <Box sx={{ height: '100%', overflow: 'auto' }}>
      <Card sx={{ mb: 2 }}>
        <CardContent>
          <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 2 }}>
            <Typography variant="h4" sx={{ color: 'primary.light' }}>
              琴曲学习模式
            </Typography>
            <Chip icon={<SchoolIcon />} label="学习模式" color="secondary" size="small" />
          </Stack>

          <Grid container spacing={2}>
            <Grid item xs={12} md={4}>
              <FormControl fullWidth size="small">
                <InputLabel>选择琴曲</InputLabel>
                <Select
                  value={selectedPiece}
                  label="选择琴曲"
                  onChange={(e) => {
                    setSelectedPiece(e.target.value);
                    setSelectedSection('');
                    setLearningData(null);
                  }}
                >
                  {SAMPLE_PIECES.map((p) => (
                    <MenuItem key={p.id} value={p.id}>
                      {p.name}（{p.difficulty}）
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
            </Grid>

            <Grid item xs={12} md={4}>
              <FormControl fullWidth size="small">
                <InputLabel>选择段落</InputLabel>
                <Select
                  value={selectedSection}
                  label="选择段落"
                  onChange={(e) => setSelectedSection(e.target.value)}
                  disabled={!selectedPiece}
                >
                  {currentPiece?.sections.map((s) => (
                    <MenuItem key={s} value={s}>{s}</MenuItem>
                  ))}
                </Select>
              </FormControl>
            </Grid>

            <Grid item xs={12} md={4}>
              <Button
                variant="contained"
                onClick={handleLoadMaterial}
                disabled={!selectedPiece || !selectedSection}
                fullWidth
              >
                加载学习材料
              </Button>
            </Grid>
          </Grid>
        </CardContent>
      </Card>

      {learningData && (
        <>
          <Card sx={{ mb: 2 }}>
            <CardContent>
              <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 2 }}>
                <Box>
                  <Typography variant="h6">
                    {learningData.piece_name} - {learningData.section}
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    共 {learningData.notes.length} 个音符
                  </Typography>
                </Box>

                <Stack direction="row" spacing={1}>
                  <Tooltip title="上一个">
                    <IconButton onClick={handlePrevious} disabled={!learningData}>
                      <SkipPreviousIcon />
                    </IconButton>
                  </Tooltip>
                  <Tooltip title={isPlaying ? '暂停' : '播放'}>
                    <IconButton onClick={handlePlayPause} color="primary" size="large">
                      {isPlaying ? <PauseIcon /> : <PlayArrowIcon />}
                    </IconButton>
                  </Tooltip>
                  <Tooltip title="停止">
                    <IconButton onClick={handleStop}>
                      <StopIcon />
                    </IconButton>
                  </Tooltip>
                  <Tooltip title="下一个">
                    <IconButton onClick={handleNext} disabled={!learningData}>
                      <SkipNextIcon />
                    </IconButton>
                  </Tooltip>
                  <Tooltip title={isLooping ? '取消循环' : '循环播放'}>
                    <IconButton
                      onClick={() => setIsLooping(!isLooping)}
                      color={isLooping ? 'primary' : 'default'}
                    >
                      <RepeatIcon />
                    </IconButton>
                  </Tooltip>
                </Stack>
              </Stack>

              <Stack direction="row" spacing={2} alignItems="center" sx={{ mb: 2 }}>
                <Typography variant="caption" sx={{ minWidth: 60 }}>速度</Typography>
                <Slider
                  value={tempo}
                  onChange={(_, v) => setTempo(v)}
                  min={30}
                  max={120}
                  sx={{ width: 150 }}
                />
                <Typography variant="caption">{tempo} BPM</Typography>

                <Divider orientation="vertical" flexItem sx={{ mx: 1 }} />

                <VolumeUpIcon fontSize="small" />
                <Slider
                  value={volume}
                  onChange={(_, v) => setVolume(v)}
                  min={0}
                  max={100}
                  sx={{ width: 100 }}
                />
              </Stack>

              <Box className="learning-progress-bar" sx={{ mb: 2 }}>
                <Box className="progress" sx={{ width: `${progress}%` }} />
              </Box>

              <Stack direction="row" spacing={2}>
                <Box sx={{ flex: 1 }}>
                  <Typography variant="caption" color="text.secondary">循环起始</Typography>
                  <Slider
                    value={loopStart}
                    onChange={(_, v) => {
                      setLoopStart(v);
                      if (v > loopEnd) setLoopEnd(v);
                    }}
                    min={0}
                    max={(learningData.notes?.length || 1) - 1}
                    marks
                  />
                </Box>
                <Box sx={{ flex: 1 }}>
                  <Typography variant="caption" color="text.secondary">循环结束</Typography>
                  <Slider
                    value={loopEnd}
                    onChange={(_, v) => {
                      setLoopEnd(v);
                      if (v < loopStart) setLoopStart(v);
                    }}
                    min={0}
                    max={(learningData.notes?.length || 1) - 1}
                    marks
                  />
                </Box>
              </Stack>
            </CardContent>
          </Card>

          <Card sx={{ mb: 2 }}>
            <CardContent>
              <Typography variant="h6" sx={{ mb: 2 }}>
                减字谱序列
              </Typography>

              <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                {learningData.notes.map((note, idx) => (
                  <Stack
                    key={idx}
                    direction="column"
                    alignItems="center"
                    className={currentNoteIndex === idx ? 'notation-char highlight' : 'notation-char'}
                    onClick={() => setCurrentNoteIndex(idx)}
                    sx={{ minWidth: 60, p: 0.5 }}
                  >
                    <Typography variant="caption" color="text.secondary">
                      {idx + 1}
                    </Typography>
                    <Stack direction="row" spacing={0.5}>
                      <Typography variant="body2" sx={{ color: 'primary.light', fontWeight: 600 }}>
                        {note.finger}
                      </Typography>
                    </Stack>
                    <Typography variant="caption" color="text.secondary">
                      {note.hui}徽{note.string}弦
                    </Typography>
                    <Chip
                      label={note.pitch}
                      size="small"
                      sx={{ height: 18, fontSize: '0.65rem', mt: 0.25 }}
                    />
                  </Stack>
                ))}
              </Stack>
            </CardContent>
          </Card>

          <Card>
            <CardContent>
              <Typography variant="h6" sx={{ mb: 2 }}>
                当前指法动画
              </Typography>

              <Grid container spacing={2}>
                <Grid item xs={12} md={6}>
                  <Paper
                    sx={{
                      p: 3,
                      textAlign: 'center',
                      bgcolor: 'rgba(255,255,255,0.03)',
                      minHeight: 200,
                      display: 'flex',
                      flexDirection: 'column',
                      justifyContent: 'center'
                    }}
                  >
                    {currentNote ? (
                      <>
                        <Typography variant="h3" sx={{ color: 'primary.light', mb: 1 }}>
                          {currentNote.finger}
                        </Typography>
                        <Typography variant="body1" sx={{ mb: 2 }}>
                          {currentNote.hui}徽 {currentNote.string}弦
                        </Typography>
                        <Typography variant="h4" sx={{ color: 'secondary.light' }}>
                          {currentNote.pitch}
                        </Typography>
                        <Box
                          sx={{
                            mt: 2,
                            width: 80,
                            height: 80,
                            borderRadius: '50%',
                            border: '3px solid',
                            borderColor: 'primary.main',
                            mx: 'auto',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            animation: isPlaying ? 'pulse 0.5s infinite' : 'none'
                          }}
                        >
                          <MusicNoteIcon sx={{ fontSize: 40, color: 'primary.main' }} />
                        </Box>
                      </>
                    ) : (
                      <Typography color="text.secondary">
                        点击播放或选择音符查看指法
                      </Typography>
                    )}
                  </Paper>
                </Grid>

                <Grid item xs={12} md={6}>
                  <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                    指法说明
                  </Typography>

                  {currentNote && (
                    <Stack spacing={1}>
                      <Paper sx={{ p: 2, bgcolor: 'rgba(139, 105, 20, 0.1)' }}>
                        <Typography variant="subtitle2" sx={{ color: 'primary.light' }}>
                          {currentNote.finger}
                        </Typography>
                        <Typography variant="body2">
                          {getFingerDescription(currentNote.finger)}
                        </Typography>
                      </Paper>

                      <Paper sx={{ p: 2, bgcolor: 'rgba(45, 106, 79, 0.1)' }}>
                        <Typography variant="subtitle2" sx={{ color: 'secondary.light' }}>
                          {currentNote.hui}徽
                        </Typography>
                        <Typography variant="body2">
                          左手按于第{currentNote.hui}徽位置，{currentNote.string}弦
                        </Typography>
                      </Paper>

                      <Paper sx={{ p: 2, bgcolor: 'rgba(69, 123, 157, 0.1)' }}>
                        <Typography variant="subtitle2" sx={{ color: 'info.main' }}>
                          音高: {currentNote.pitch}
                        </Typography>
                        <Typography variant="body2">
                          频率: {getFrequency(currentNote.hui, currentNote.string).toFixed(2)} Hz
                        </Typography>
                      </Paper>
                    </Stack>
                  )}
                </Grid>
              </Grid>
            </CardContent>
          </Card>
        </>
      )}

      {!learningData && (
        <Card>
          <CardContent sx={{ textAlign: 'center', py: 4 }}>
            <SchoolIcon sx={{ fontSize: 64, color: 'text.secondary', mb: 2 }} />
            <Typography color="text.secondary">
              选择琴曲和段落开始学习
            </Typography>
          </CardContent>
        </Card>
      )}
    </Box>
  );
}

function getFingerDescription(finger) {
  const descriptions = {
    '挑': '右手食指向外弹弦',
    '勾': '右手中指向内弹弦',
    '抹': '右手食指向内弹弦',
    '剔': '右手中指向外弹弦',
    '打': '右手无名指向内弹弦',
    '摘': '右手无名指向外弹弦',
    '托': '右手大指向外弹弦',
    '劈': '右手大指向内弹弦'
  };
  return descriptions[finger] || '古琴右手指法';
}
