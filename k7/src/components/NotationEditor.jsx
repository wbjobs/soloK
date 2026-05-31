import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  Box,
  Card,
  CardContent,
  Typography,
  Button,
  IconButton,
  TextField,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  Stack,
  Chip,
  Divider,
  Grid,
  Paper,
  Tooltip,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Slider,
  Tabs,
  Tab,
  Accordion,
  AccordionSummary,
  AccordionDetails,
  SpeedDial,
  SpeedDialAction,
  SpeedDialIcon
} from '@mui/material';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import PauseIcon from '@mui/icons-material/Pause';
import StopIcon from '@mui/icons-material/Stop';
import SaveIcon from '@mui/icons-material/Save';
import DownloadIcon from '@mui/icons-material/Download';
import MusicNoteIcon from '@mui/icons-material/MusicNote';
import EditIcon from '@mui/icons-material/Edit';
import DeleteIcon from '@mui/icons-material/Delete';
import AddIcon from '@mui/icons-material/Add';
import UndoIcon from '@mui/icons-material/Undo';
import RedoIcon from '@mui/icons-material/Redo';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import VolumeUpIcon from '@mui/icons-material/VolumeUp';
import PictureAsPdfIcon from '@mui/icons-material/PictureAsPdf';
import GraphicEqIcon from '@mui/icons-material/GraphicEq';
import AutoAwesomeIcon from '@mui/icons-material/AutoAwesome';
import TimelineIcon from '@mui/icons-material/Timeline';
import { generateMidi, exportScorePdf, saveNotation } from '../ipc/index.js';
import PredictionPanel from './PredictionPanel.jsx';
import GuqinVisualizer from './GuqinVisualizer.jsx';

const RIGHT_HAND_TECHNIQUES = [
  { name: '挑', value: 'tiao', desc: '右手指法：食指向外弹' },
  { name: '勾', value: 'gou', desc: '右手指法：中指向内弹' },
  { name: '抹', value: 'mo', desc: '右手指法：食指向内弹' },
  { name: '剔', value: 'ti', desc: '右手指法：中指向外弹' },
  { name: '打', value: 'da', desc: '右手指法：无名指向内弹' },
  { name: '摘', value: 'zhai', desc: '右手指法：无名指向外弹' },
  { name: '托', value: 'tuo', desc: '右手指法：大指向外弹' },
  { name: '劈', value: 'pi', desc: '右手指法：大指向内弹' },
  { name: '撮', value: 'cuo', desc: '右手指法：两指同时弹' },
  { name: '轮', value: 'lun', desc: '右手指法：快速轮指' }
];

const LEFT_HAND_TECHNIQUES = [
  { name: '按', value: 'an', desc: '左手指法：按弦' },
  { name: '吟', value: 'yin', desc: '左手指法：吟揉' },
  { name: '猱', value: 'nao', desc: '左手指法：猱动' },
  { name: '绰', value: 'chuo', desc: '左手指法：上滑' },
  { name: '注', value: 'zhu', desc: '左手指法：下滑' },
  { name: '撞', value: 'zhuang', desc: '左手指法：快速撞击' },
  { name: '逗', value: 'dou', desc: '左手指法：逗引' },
  { name: '唤', value: 'huan', desc: '左手指法：唤音' }
];

const STRINGS = [1, 2, 3, 4, 5, 6, 7];
const HUI_POSITIONS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13];
const STRING_NOTES = ['C', 'D', 'F', 'G', 'A', 'c', 'd'];
const STRING_PITCHES = ['C3', 'D3', 'F3', 'G3', 'A3', 'C4', 'D4'];

function getNoteFromPosition(hui, string) {
  const stringBaseFreqs = [130.81, 146.83, 174.61, 196.00, 220.00, 261.63, 293.66];
  const huiRatios = [0.9439, 0.8909, 0.8409, 0.7937, 0.7492, 0.7071, 0.6674, 0.6299, 0.5946, 0.5612, 0.5297, 0.5, 0.4719];
  if (hui < 1 || hui > 13 || string < 1 || string > 7) return { note: '?', pitch: '??', frequency: 0 };
  const ratio = huiRatios[hui - 1];
  const freq = stringBaseFreqs[string - 1] / ratio;
  const noteNames = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
  const midiNum = Math.round(69 + 12 * Math.log2(freq / 440));
  const octave = Math.floor(midiNum / 12) - 1;
  const noteIdx = midiNum % 12;
  return {
    note: noteNames[noteIdx],
    pitch: noteNames[noteIdx] + octave,
    frequency: freq,
    midi: midiNum
  };
}

export default function NotationEditor({ pythonReady, showNotification }) {
  const [notationData, setNotationData] = useState(null);
  const [selectedRow, setSelectedRow] = useState(null);
  const [selectedChar, setSelectedChar] = useState(null);
  const [history, setHistory] = useState([]);
  const [historyIndex, setHistoryIndex] = useState(-1);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentNoteIndex, setCurrentNoteIndex] = useState(-1);
  const [tempo, setTempo] = useState(60);
  const [volume, setVolume] = useState(70);
  const [soundType, setSoundType] = useState('anxian');
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [tabValue, setTabValue] = useState(0);
  const [showPrediction, setShowPrediction] = useState(false);
  const [showVisualizer, setShowVisualizer] = useState(false);
  const audioContextRef = useRef(null);
  const masterGainRef = useRef(null);
  const oscillatorPoolRef = useRef([]);
  const schedulerRef = useRef(null);
  const playbackStartTimeRef = useRef(0);
  const scheduledNotesRef = useRef([]);

  useEffect(() => {
    const saved = sessionStorage.getItem('recognitionResult');
    const savedImage = sessionStorage.getItem('importedImage');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        setNotationData(parsed);
        if (parsed.rows && parsed.rows.length > 0) {
          setSelectedRow(0);
        }
      } catch (e) {
        console.error('Failed to parse saved data:', e);
      }
    }
  }, []);

  useEffect(() => {
    if (notationData) {
      const newHistory = [...history.slice(0, historyIndex + 1), JSON.stringify(notationData)];
      setHistory(newHistory);
      setHistoryIndex(newHistory.length - 1);
    }
  }, [notationData]);

  const undo = useCallback(() => {
    if (historyIndex > 0) {
      setHistoryIndex(historyIndex - 1);
      setNotationData(JSON.parse(history[historyIndex - 1]));
    }
  }, [history, historyIndex]);

  const redo = useCallback(() => {
    if (historyIndex < history.length - 1) {
      setHistoryIndex(historyIndex + 1);
      setNotationData(JSON.parse(history[historyIndex + 1]));
    }
  }, [history, historyIndex]);

  const updateCharacter = useCallback((rowIdx, charIdx, newChar) => {
    if (!notationData || !notationData.rows) return;

    const newData = { ...notationData };
    newData.rows = notationData.rows.map((row, ri) => {
      if (ri !== rowIdx) return row;
      return {
        ...row,
        characters: row.characters.map((ch, ci) => {
          if (ci !== charIdx) return ch;
          return { ...ch, char: newChar };
        })
      };
    });

    if (newData.extracted_notes) {
      newData.extracted_notes = newData.extracted_notes.map((note) => {
        if (note.row === rowIdx) {
          if (newData.rows[rowIdx].characters[0]?.char) note.finger = newData.rows[rowIdx].characters[0].char;
          if (newData.rows[rowIdx].characters[1]?.char && isNaN(parseInt(newData.rows[rowIdx].characters[1].char)) === false) {
            note.hui = parseInt(newData.rows[rowIdx].characters[1].char);
          }
          if (newData.rows[rowIdx].characters[2]?.char && isNaN(parseInt(newData.rows[rowIdx].characters[2].char)) === false) {
            note.string = parseInt(newData.rows[rowIdx].characters[2].char);
          }
          const noteInfo = getNoteFromPosition(note.hui, note.string);
          note.note = noteInfo.note;
          note.pitch = noteInfo.pitch;
        }
        return note;
      });
    }

    setNotationData(newData);
    showNotification('已更新减字', 'success');
  }, [notationData, showNotification]);

  const addNote = useCallback((finger, hui, string) => {
    if (!notationData) {
      setNotationData({
        rows: [],
        extracted_notes: []
      });
    }

    const newData = { ...notationData };
    const rowIdx = newData.rows.length;

    const newRow = {
      row_index: rowIdx,
      characters: [
        { char: finger, type: 'finger', position: { left: 50, top: 20, width: 30, height: 40 } },
        { char: hui.toString(), type: 'hui', position: { left: 90, top: 20, width: 30, height: 40 } },
        { char: string.toString(), type: 'string', position: { left: 130, top: 20, width: 30, height: 40 } }
      ]
    };

    newData.rows = [...(newData.rows || []), newRow];

    const noteInfo = getNoteFromPosition(hui, string);
    const newNote = {
      row: rowIdx,
      finger: finger,
      hui: hui,
      string: string,
      note: noteInfo.note,
      pitch: noteInfo.pitch,
      duration: 1,
      midi: noteInfo.midi
    };

    newData.extracted_notes = [...(newData.extracted_notes || []), newNote];
    setNotationData(newData);
    setShowAddDialog(false);
    showNotification('已添加音符', 'success');
  }, [notationData, showNotification]);

  const applyPredictionScheme = useCallback((notes) => {
    if (!notes || notes.length === 0) return;

    const newData = { ...notationData };
    let startRow = newData.rows ? newData.rows.length : 0;

    notes.forEach((note, idx) => {
      const rowIdx = startRow + idx;
      const newRow = {
        row_index: rowIdx,
        characters: [
          { char: note.finger, type: 'finger', position: { left: 50, top: 20, width: 30, height: 40 } },
          { char: note.hui.toString(), type: 'hui', position: { left: 90, top: 20, width: 30, height: 40 } },
          { char: note.string.toString(), type: 'string', position: { left: 130, top: 20, width: 30, height: 40 } }
        ]
      };
      newData.rows = [...(newData.rows || []), newRow];

      const noteInfo = getNoteFromPosition(note.hui, note.string);
      const newNote = {
        row: rowIdx,
        finger: note.finger,
        hui: note.hui,
        string: note.string,
        note: noteInfo.note,
        pitch: noteInfo.pitch,
        duration: 1,
        midi: noteInfo.midi
      };
      newData.extracted_notes = [...(newData.extracted_notes || []), newNote];
    });

    setNotationData(newData);
    showNotification(`已应用 ${notes.length} 个预测减字`, 'success');
  }, [notationData, showNotification]);

  const deleteNote = useCallback((rowIdx) => {
    if (!notationData || !notationData.rows) return;

    const newData = { ...notationData };
    newData.rows = notationData.rows.filter((_, idx) => idx !== rowIdx);
    newData.extracted_notes = (notationData.extracted_notes || []).filter(
      (note) => note.row !== rowIdx
    ).map((note, idx) => ({ ...note, row: idx }));

    setNotationData(newData);
    setSelectedRow(null);
    setSelectedChar(null);
    showNotification('已删除音符', 'success');
  }, [notationData, showNotification]);

  const handlePlay = useCallback(() => {
    if (!notationData || !notationData.extracted_notes) return;

    if (isPlaying) {
      stopPlayback();
      return;
    }

    if (!audioContextRef.current) {
      audioContextRef.current = new (window.AudioContext || window.webkitAudioContext)();
      masterGainRef.current = audioContextRef.current.createGain();
      masterGainRef.current.connect(audioContextRef.current.destination);
    }

    const ctx = audioContextRef.current;
    if (ctx.state === 'suspended') {
      ctx.resume();
    }

    const notes = notationData.extracted_notes;
    const noteDuration = 60 / tempo;
    const lookahead = 0.1;
    const scheduleAheadTime = 0.2;

    setIsPlaying(true);
    setCurrentNoteIndex(0);
    playbackStartTimeRef.current = ctx.currentTime + 0.05;
    scheduledNotesRef.current = [];

    let nextNoteIndex = 0;
    let lastScheduledTime = playbackStartTimeRef.current;

    const scheduler = () => {
      while (nextNoteIndex < notes.length &&
             lastScheduledTime < ctx.currentTime + scheduleAheadTime) {

        const note = notes[nextNoteIndex];
        const startTime = lastScheduledTime;
        const endTime = startTime + noteDuration;

        scheduleNote(ctx, note, startTime, endTime, soundType, volume);

        scheduledNotesRef.current.push({
          index: nextNoteIndex,
          startTime,
          endTime
        });

        lastScheduledTime = endTime;
        nextNoteIndex++;
      }

      updateCurrentNoteIndex(ctx.currentTime, noteDuration);

      if (nextNoteIndex < notes.length) {
        schedulerRef.current = requestAnimationFrame(scheduler);
      } else {
        const totalDuration = lastScheduledTime - playbackStartTimeRef.current;
        setTimeout(() => {
          if (isPlaying) {
            setIsPlaying(false);
            setCurrentNoteIndex(-1);
          }
        }, totalDuration * 1000 + 100);
      }
    };

    scheduler();
  }, [notationData, isPlaying, tempo, volume, soundType]);

  const scheduleNote = useCallback((ctx, note, startTime, endTime, soundType, volume) => {
    const oscType = soundType === 'fanyin' ? 'sine' : soundType === 'sanyin' ? 'triangle' : 'sawtooth';
    const noteInfo = getNoteFromPosition(note.hui, note.string);

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
    oscillator.osc.frequency.setValueAtTime(noteInfo.frequency, startTime);
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
  }, []);

  const updateCurrentNoteIndex = useCallback((currentTime, noteDuration) => {
    const noteIndex = Math.floor((currentTime - playbackStartTimeRef.current) / noteDuration);
    setCurrentNoteIndex(prev => {
      if (noteIndex !== prev && noteIndex >= 0) {
        return noteIndex;
      }
      return prev;
    });
  }, []);

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
    scheduledNotesRef.current = [];

    setIsPlaying(false);
    setCurrentNoteIndex(-1);
  }, []);

  const handleExportMidi = useCallback(async () => {
    if (!notationData) {
      showNotification('没有可导出的内容', 'warning');
      return;
    }

    try {
      const result = await generateMidi(notationData, { tempo, soundType });
      if (result && result.file_path) {
        showNotification('MIDI 文件已生成', 'success');
      } else {
        const midiData = generateMidiData(notationData, tempo);
        const blob = new Blob([midiData], { type: 'audio/midi' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `guqin_${Date.now()}.mid`;
        a.click();
        URL.revokeObjectURL(url);
        showNotification('MIDI 已导出', 'success');
      }
    } catch (err) {
      const midiData = generateMidiData(notationData, tempo);
      const blob = new Blob([midiData], { type: 'audio/midi' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `guqin_${Date.now()}.mid`;
      a.click();
      URL.revokeObjectURL(url);
      showNotification('MIDI 已导出（本地生成）', 'success');
    }
  }, [notationData, tempo, soundType, showNotification]);

  const handleExportPdf = useCallback(async () => {
    if (!notationData) {
      showNotification('没有可导出的内容', 'warning');
      return;
    }

    try {
      const result = await exportScorePdf(notationData, { title: '古琴谱' });
      if (result && result.file_path) {
        showNotification('PDF 已生成', 'success');
      } else {
        generateSimplePdf(notationData);
        showNotification('PDF 已导出', 'success');
      }
    } catch (err) {
      generateSimplePdf(notationData);
      showNotification('PDF 已导出', 'success');
    }
  }, [notationData, showNotification]);

  const handleSave = useCallback(async () => {
    if (!notationData) {
      showNotification('没有可保存的内容', 'warning');
      return;
    }

    try {
      const result = await saveNotation(notationData);
      showNotification('已保存到数据库', 'success');
    } catch (err) {
      const blob = new Blob([JSON.stringify(notationData, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `guqin_score_${Date.now()}.json`;
      a.click();
      URL.revokeObjectURL(url);
      showNotification('已保存为 JSON 文件', 'success');
    }
  }, [notationData, showNotification]);

  const generateSimplePdf = (data) => {
    const content = `古琴减字谱\n\n` +
      (data.rows || []).map((row, idx) =>
        `第${idx + 1}行: ${row.characters?.map(c => c.char).join(' ')}`
      ).join('\n') +
      `\n\n提取音符:\n` +
      (data.extracted_notes || []).map(n =>
        `${n.finger} ${n.hui}徽${n.string}弦 -> ${n.pitch}`
      ).join('\n');

    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `guqin_score_${Date.now()}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const generateMidiData = (data, bpm) => {
    const notes = data.extracted_notes || [];
    const tickRate = 480;
    const microsecondsPerBeat = Math.round(60000000 / bpm);

    let midiBytes = [];

    midiBytes.push(...[0x4D, 0x54, 0x68, 0x64]);
    midiBytes.push(...[0x00, 0x00, 0x00, 0x06]);
    midiBytes.push(...[0x00, 0x00]);
    midiBytes.push(...[0x00, 0x01]);
    midiBytes.push(...[(tickRate >> 8) & 0xFF, tickRate & 0xFF]);

    let trackBytes = [];
    trackBytes.push(...[0x00, 0xFF, 0x51, 0x03]);
    trackBytes.push(...[(microsecondsPerBeat >> 16) & 0xFF, (microsecondsPerBeat >> 8) & 0xFF, microsecondsPerBeat & 0xFF]);
    trackBytes.push(...[0x00, 0xFF, 0x03, 0x0B]);
    trackBytes.push(...[0x47, 0x75, 0x71, 0x69, 0x6E, 0x20, 0x53, 0x63, 0x6F, 0x72, 0x65]);

    let currentTick = 0;
    notes.forEach((note) => {
      const midiNote = getNoteFromPosition(note.hui, note.string).midi;
      const duration = (note.duration || 1) * tickRate;

      trackBytes.push(0x00);
      trackBytes.push(...[0x90, midiNote & 0x7F, 0x64]);

      trackBytes.push(duration >> 8 & 0xFF || 0x81);
      trackBytes.push(duration & 0x7F);
      trackBytes.push(...[0x80, midiNote & 0x7F, 0x40]);

      currentTick += duration;
    });

    trackBytes.push(...[0x00, 0xFF, 0x2F, 0x00]);

    midiBytes.push(...[0x4D, 0x54, 0x72, 0x6B]);
    const trackLength = trackBytes.length;
    midiBytes.push(...[(trackLength >> 24) & 0xFF, (trackLength >> 16) & 0xFF, (trackLength >> 8) & 0xFF, trackLength & 0xFF]);
    midiBytes.push(...trackBytes);

    return new Uint8Array(midiBytes);
  };

  return (
    <Box sx={{ height: '100%', overflow: 'auto' }}>
      <Card sx={{ mb: 2 }}>
        <CardContent>
          <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 2 }}>
            <Typography variant="h4" sx={{ color: 'primary.light' }}>
              减字谱编辑器
            </Typography>
            <Stack direction="row" spacing={1}>
              <Tooltip title="撤销">
                <IconButton onClick={undo} disabled={historyIndex <= 0} size="small">
                  <UndoIcon />
                </IconButton>
              </Tooltip>
              <Tooltip title="重做">
                <IconButton onClick={redo} disabled={historyIndex >= history.length - 1} size="small">
                  <RedoIcon />
                </IconButton>
              </Tooltip>
              <Tooltip title="保存">
                <IconButton onClick={handleSave} size="small">
                  <SaveIcon />
                </IconButton>
              </Tooltip>
            </Stack>
          </Stack>

          <Stack direction="row" spacing={2} alignItems="center" flexWrap="wrap">
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <IconButton onClick={handlePlay} color="primary" size="large">
                {isPlaying ? <PauseIcon /> : <PlayArrowIcon />}
              </IconButton>
              <IconButton onClick={stopPlayback}>
                <StopIcon />
              </IconButton>
            </Box>

            <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, minWidth: 200 }}>
              <Typography variant="caption">速度</Typography>
              <Slider
                value={tempo}
                onChange={(_, v) => setTempo(v)}
                min={30}
                max={180}
                sx={{ width: 100 }}
              />
              <Typography variant="caption">{tempo} BPM</Typography>
            </Box>

            <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
              <VolumeUpIcon fontSize="small" />
              <Slider
                value={volume}
                onChange={(_, v) => setVolume(v)}
                min={0}
                max={100}
                sx={{ width: 80 }}
              />
            </Box>

            <FormControl size="small" sx={{ minWidth: 100 }}>
              <InputLabel>音色</InputLabel>
              <Select value={soundType} label="音色" onChange={(e) => setSoundType(e.target.value)}>
                <MenuItem value="anxian">按弦式</MenuItem>
                <MenuItem value="fanyin">泛音</MenuItem>
                <MenuItem value="sanyin">散音</MenuItem>
              </Select>
            </FormControl>

            <Button
              variant="contained"
              startIcon={<DownloadIcon />}
              onClick={handleExportMidi}
              size="small"
            >
              导出 MIDI
            </Button>
            <Button
              variant="contained"
              startIcon={<PictureAsPdfIcon />}
              onClick={handleExportPdf}
              size="small"
            >
              导出 PDF
            </Button>
            <Tooltip title={showPrediction ? '隐藏预测' : 'AI 指法预测'}>
              <IconButton
                color={showPrediction ? 'primary' : 'default'}
                onClick={() => {
                  setShowPrediction(!showPrediction);
                  setShowVisualizer(false);
                }}
                size="small"
              >
                <AutoAwesomeIcon />
              </IconButton>
            </Tooltip>
            <Tooltip title={showVisualizer ? '隐藏可视化' : '右手运指可视化'}>
              <IconButton
                color={showVisualizer ? 'secondary' : 'default'}
                onClick={() => {
                  setShowVisualizer(!showVisualizer);
                  setShowPrediction(false);
                }}
                size="small"
              >
                <TimelineIcon />
              </IconButton>
            </Tooltip>
          </Stack>
        </CardContent>
      </Card>

      <Grid container spacing={2}>
        <Grid item xs={12} md={8}>
      <Card sx={{ mb: 2 }}>
        <CardContent>
          <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 2 }}>
            <Typography variant="h6">减字谱编辑区</Typography>
            <Button
              variant="outlined"
              size="small"
              startIcon={<AddIcon />}
              onClick={() => setShowAddDialog(true)}
            >
              添加音符
            </Button>
          </Stack>

          {!notationData || (notationData.rows && notationData.rows.length === 0) ? (
            <Box sx={{ textAlign: 'center', py: 4 }}>
              <MusicNoteIcon sx={{ fontSize: 64, color: 'text.secondary', mb: 2 }} />
              <Typography color="text.secondary">
                暂无减字谱数据，请先导入图片识别或手动添加音符
              </Typography>
              <Button
                variant="outlined"
                sx={{ mt: 2 }}
                onClick={() => window.location.hash = '#/import'}
              >
                前往导入
              </Button>
            </Box>
          ) : (
            notationData.rows?.map((row, rowIdx) => (
              <Accordion
                key={rowIdx}
                expanded={selectedRow === rowIdx}
                onChange={() => setSelectedRow(selectedRow === rowIdx ? null : rowIdx)}
                sx={{ mb: 1, bgcolor: 'rgba(255,255,255,0.02)' }}
              >
                <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                  <Stack direction="row" spacing={1} alignItems="center">
                    <Typography variant="body2" color="text.secondary">
                      第{rowIdx + 1}行
                    </Typography>
                    {row.characters?.map((ch, ci) => (
                      <span
                        key={ci}
                        className={`notation-char ${selectedRow === rowIdx && selectedChar === ci ? 'selected' : ''} ${currentNoteIndex === rowIdx ? 'highlight' : ''}`}
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedRow(rowIdx);
                          setSelectedChar(ci);
                        }}
                      >
                        {ch.char}
                      </span>
                    ))}
                    {notationData.extracted_notes?.[rowIdx] && (
                      <Chip
                        label={notationData.extracted_notes[rowIdx].pitch}
                        size="small"
                        color="primary"
                        variant="outlined"
                        sx={{ ml: 1 }}
                      />
                    )}
                  </Stack>
                </AccordionSummary>
                <AccordionDetails>
                  <Stack direction="row" spacing={2} alignItems="center">
                    <Stack direction="row" spacing={1}>
                      {RIGHT_HAND_TECHNIQUES.slice(0, 4).map((tech) => (
                        <Tooltip key={tech.value} title={tech.desc}>
                          <Chip
                            label={tech.name}
                            size="small"
                            className="finger-technique right-hand"
                            onClick={() => updateCharacter(rowIdx, 0, tech.name)}
                          />
                        </Tooltip>
                      ))}
                    </Stack>
                    <Typography variant="body2" color="text.secondary">徽位:</Typography>
                    <Stack direction="row" spacing={0.5}>
                      {HUI_POSITIONS.map((h) => (
                        <Chip
                          key={h}
                          label={h}
                          size="small"
                          variant={notationData.extracted_notes?.[rowIdx]?.hui === h ? 'filled' : 'outlined'}
                          onClick={() => updateCharacter(rowIdx, 1, h.toString())}
                          sx={{ minWidth: 32 }}
                        />
                      ))}
                    </Stack>
                    <Typography variant="body2" color="text.secondary">弦序:</Typography>
                    <Stack direction="row" spacing={0.5}>
                      {STRINGS.map((s) => (
                        <Chip
                          key={s}
                          label={s}
                          size="small"
                          variant={notationData.extracted_notes?.[rowIdx]?.string === s ? 'filled' : 'outlined'}
                          onClick={() => updateCharacter(rowIdx, 2, s.toString())}
                          sx={{ minWidth: 32 }}
                        />
                      ))}
                    </Stack>
                    <IconButton
                      size="small"
                      color="error"
                      onClick={() => deleteNote(rowIdx)}
                    >
                      <DeleteIcon />
                    </IconButton>
                  </Stack>
                </AccordionDetails>
              </Accordion>
            ))
          )}
        </CardContent>
      </Card>

      <Card>
        <CardContent>
          <Tabs value={tabValue} onChange={(_, v) => setTabValue(v)}>
            <Tab label="五线谱对照" />
            <Tab label="简谱对照" />
          </Tabs>

          {tabValue === 0 && (
            <Box sx={{ mt: 2, p: 2, bgcolor: '#fafafa', borderRadius: 1 }}>
              <Box
                ref={(el) => {
                  if (el && notationData?.extracted_notes) {
                    renderStaffNotation(el, notationData.extracted_notes);
                  }
                }}
                sx={{ minHeight: 120 }}
              />
            </Box>
          )}

          {tabValue === 1 && (
            <Box sx={{ mt: 2 }}>
              <Stack direction="row" spacing={1} flexWrap="wrap">
                {notationData?.extracted_notes?.map((note, idx) => (
                  <Box
                    key={idx}
                    className={currentNoteIndex === idx ? 'notation-char highlight' : 'notation-char'}
                    sx={{ minWidth: 50 }}
                  >
                    {note.note}
                  </Box>
                ))}
              </Stack>
            </Box>
          )}
        </CardContent>
      </Card>
    </Grid>

        <Grid item xs={12} md={4}>
          {showPrediction && (
            <PredictionPanel
              onApplyScheme={applyPredictionScheme}
              currentNotation={notationData}
              showNotification={showNotification}
            />
          )}

          {showVisualizer && (
            <GuqinVisualizer
              notes={notationData?.extracted_notes}
              isPlaying={isPlaying}
              currentNoteIndex={currentNoteIndex}
              tempo={tempo}
            />
          )}

          {!showPrediction && !showVisualizer && (
            <>
              <Card sx={{ mb: 2 }}>
                <CardContent>
                  <Typography variant="h6" sx={{ mb: 2 }}>
                    指法说明
                  </Typography>

                  <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
                    右手技法
                  </Typography>
                  <Stack direction="row" spacing={0.5} flexWrap="wrap" sx={{ mb: 2 }}>
                    {RIGHT_HAND_TECHNIQUES.map((tech) => (
                      <Tooltip key={tech.value} title={tech.desc}>
                        <Chip
                          label={tech.name}
                          size="small"
                          className="finger-technique right-hand"
                          sx={{ m: 0.25 }}
                        />
                      </Tooltip>
                    ))}
                  </Stack>

                  <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
                    左手技法
                  </Typography>
                  <Stack direction="row" spacing={0.5} flexWrap="wrap">
                    {LEFT_HAND_TECHNIQUES.map((tech) => (
                      <Tooltip key={tech.value} title={tech.desc}>
                        <Chip
                          label={tech.name}
                          size="small"
                          className="finger-technique left-hand"
                          sx={{ m: 0.25 }}
                        />
                      </Tooltip>
                    ))}
                  </Stack>
                </CardContent>
              </Card>

              <Card>
                <CardContent>
                  <Typography variant="h6" sx={{ mb: 2 }}>
                    弦序音高对照
                  </Typography>

                  <Box sx={{ overflowX: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                      <thead>
                        <tr>
                          <th style={tableHeaderStyle}>弦序</th>
                          {STRINGS.map((s) => (
                            <th key={s} style={tableHeaderStyle}>{s}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        <tr>
                          <td style={tableCellStyle}>音高</td>
                          {STRING_PITCHES.map((p, i) => (
                            <td key={i} style={tableCellStyle}>{p}</td>
                          ))}
                        </tr>
                        <tr>
                          <td style={tableCellStyle}>音名</td>
                          {STRING_NOTES.map((n, i) => (
                            <td key={i} style={tableCellStyle}>{n}</td>
                          ))}
                        </tr>
                      </tbody>
                    </table>
                  </Box>
                </CardContent>
              </Card>
            </>
          )}
        </Grid>
      </Grid>

      <Dialog open={showAddDialog} onClose={() => setShowAddDialog(false)}>
        <DialogTitle>添加音符</DialogTitle>
        <DialogContent>
          <AddNoteDialogContent onAdd={addNote} onCancel={() => setShowAddDialog(false)} />
        </DialogContent>
      </Dialog>
    </Box>
  );
}

function AddNoteDialogContent({ onAdd, onCancel }) {
  const [finger, setFinger] = useState('挑');
  const [hui, setHui] = useState(7);
  const [string, setString] = useState(2);

  return (
    <Stack spacing={2} sx={{ mt: 1, minWidth: 300 }}>
      <FormControl size="small">
        <InputLabel>右手指法</InputLabel>
        <Select value={finger} label="右手指法" onChange={(e) => setFinger(e.target.value)}>
          {RIGHT_HAND_TECHNIQUES.map((t) => (
            <MenuItem key={t.value} value={t.name}>{t.name}</MenuItem>
          ))}
        </Select>
      </FormControl>

      <FormControl size="small">
        <InputLabel>徽位</InputLabel>
        <Select value={hui} label="徽位" onChange={(e) => setHui(e.target.value)}>
          {HUI_POSITIONS.map((h) => (
            <MenuItem key={h} value={h}>{h}徽</MenuItem>
          ))}
        </Select>
      </FormControl>

      <FormControl size="small">
        <InputLabel>弦序</InputLabel>
        <Select value={string} label="弦序" onChange={(e) => setString(e.target.value)}>
          {STRINGS.map((s) => (
            <MenuItem key={s} value={s}>{s}弦</MenuItem>
          ))}
        </Select>
      </FormControl>

      <Box sx={{ textAlign: 'center', py: 2 }}>
        <Typography variant="h5">
          {finger} {hui}徽 {string}弦
        </Typography>
        <Typography variant="body2" color="text.secondary">
          -> {getNoteFromPosition(hui, string).pitch}
        </Typography>
      </Box>

      <DialogActions>
        <Button onClick={onCancel}>取消</Button>
        <Button variant="contained" onClick={() => onAdd(finger, hui, string)}>
          添加
        </Button>
      </DialogActions>
    </Stack>
  );
}

const tableHeaderStyle = {
  padding: '8px 12px',
  textAlign: 'center',
  fontWeight: 500,
  fontSize: '0.8rem',
  color: '#a0a0a0',
  borderBottom: '1px solid rgba(255,255,255,0.1)'
};

const tableCellStyle = {
  padding: '8px 12px',
  textAlign: 'center',
  fontSize: '0.85rem',
  borderBottom: '1px solid rgba(255,255,255,0.05)'
};

function renderStaffNotation(container, notes) {
  container.innerHTML = '';

  const staff = document.createElement('div');
  staff.style.cssText = 'position:relative;height:100px;padding:10px 20px;';

  for (let i = 0; i < 5; i++) {
    const line = document.createElement('div');
    line.style.cssText = `
      position:absolute;
      left:20px;
      right:20px;
      height:1px;
      background:#333;
      top:${20 + i * 15}px;
    `;
    staff.appendChild(line);
  }

  notes.forEach((note, idx) => {
    const noteEl = document.createElement('div');
    noteEl.style.cssText = `
      position:absolute;
      left:${60 + idx * 50}px;
      top:${50 - (note.midi - 60) * 2}px;
      width:12px;
      height:12px;
      background:#1a1a2e;
      border-radius:50%;
      border:2px solid #333;
    `;
    staff.appendChild(noteEl);

    const label = document.createElement('div');
    label.style.cssText = `
      position:absolute;
      left:${55 + idx * 50}px;
      top:90px;
      font-size:10px;
      color:#666;
      text-align:center;
      width:30px;
    `;
    label.textContent = note.pitch;
    staff.appendChild(label);
  });

  container.appendChild(staff);
}

export { getNoteFromPosition, RIGHT_HAND_TECHNIQUES, LEFT_HAND_TECHNIQUES, STRINGS, HUI_POSITIONS };
