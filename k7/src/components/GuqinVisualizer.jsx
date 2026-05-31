import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Box,
  Card,
  CardContent,
  Typography,
  Stack,
  Chip,
  Slider,
  IconButton,
  Tooltip,
  Paper,
  FormControlLabel,
  Switch
} from '@mui/material';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import PauseIcon from '@mui/icons-material/Pause';
import RestartAltIcon from '@mui/icons-material/RestartAlt';
import WhatshotIcon from '@mui/icons-material/Whatshot';
import TimelineIcon from '@mui/icons-material/Timeline';

const STRING_POSITIONS = [0.85, 0.72, 0.60, 0.48, 0.36, 0.24, 0.12];
const STRING_NAMES = ['一弦', '二弦', '三弦', '四弦', '五弦', '六弦', '七弦'];
const STRING_COLORS = ['#c9a227', '#e63946', '#f4a261', '#2a9d8f', '#457b9d', '#6a4c93', '#40916c'];

export default function GuqinVisualizer({ notes, isPlaying, currentNoteIndex, tempo = 60 }) {
  const canvasRef = useRef(null);
  const animationRef = useRef(null);
  const [showHeatmap, setShowHeatmap] = useState(true);
  const [showTrajectory, setShowTrajectory] = useState(true);
  const [playbackSpeed, setPlaybackSpeed] = useState(1);
  const [localPlaying, setLocalPlaying] = useState(false);
  const [localIndex, setLocalIndex] = useState(0);
  const trajectoryRef = useRef([]);
  const heatmapRef = useRef(new Array(7).fill(0));
  const lastUpdateRef = useRef(0);

  useEffect(() => {
    if (isPlaying) {
      setLocalPlaying(true);
      setLocalIndex(currentNoteIndex);
      trajectoryRef.current = [];
      heatmapRef.current = new Array(7).fill(0);
    } else {
      setLocalPlaying(false);
    }
  }, [isPlaying, currentNoteIndex]);

  useEffect(() => {
    if (notes && notes.length > 0 && currentNoteIndex >= 0) {
      const note = notes[currentNoteIndex];
      if (note) {
        const stringIndex = note.string - 1;
        trajectoryRef.current.push({
          string: stringIndex,
          finger: note.finger,
          timestamp: Date.now(),
          intensity: 1.0
        });

        heatmapRef.current[stringIndex] += 1;
      }
    }
  }, [currentNoteIndex, notes]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * window.devicePixelRatio;
    canvas.height = rect.height * window.devicePixelRatio;
    ctx.scale(window.devicePixelRatio, window.devicePixelRatio);

    const width = rect.width;
    const height = rect.height;

    const draw = () => {
      ctx.clearRect(0, 0, width, height);

      drawGuqinBody(ctx, width, height);
      drawStrings(ctx, width, height);

      if (showHeatmap) {
        drawHeatmap(ctx, width, height);
      }

      if (showTrajectory) {
        drawTrajectory(ctx, width, height);
      }

      if (localPlaying && notes && notes[localIndex]) {
        drawCurrentNote(ctx, width, height, notes[localIndex]);
      }

      drawHuiMarkers(ctx, width, height);

      animationRef.current = requestAnimationFrame(draw);
    };

    draw();

    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, [localPlaying, localIndex, notes, showHeatmap, showTrajectory]);

  const drawGuqinBody = (ctx, width, height) => {
    const padding = 20;
    const bodyHeight = height - padding * 2;
    const bodyWidth = width - padding * 2;

    ctx.fillStyle = '#5a3d1a';
    ctx.beginPath();
    ctx.roundRect(padding, padding, bodyWidth, bodyHeight, 8);
    ctx.fill();

    ctx.fillStyle = '#8b6914';
    ctx.fillRect(padding + 10, padding + 10, bodyWidth - 20, bodyHeight - 20);

    ctx.fillStyle = '#6b4f21';
    for (let i = 0; i < 13; i++) {
      const huiX = padding + 20 + (i / 13) * (bodyWidth - 40);
      ctx.beginPath();
      ctx.ellipse(huiX, height / 2, 15, 8, 0, 0, Math.PI * 2);
      ctx.fill();
    }
  };

  const drawStrings = (ctx, width, height) => {
    const padding = 40;
    const stringAreaHeight = height - padding * 2;

    STRING_POSITIONS.forEach((pos, idx) => {
      const y = padding + pos * stringAreaHeight;

      ctx.strokeStyle = 'rgba(0,0,0,0.3)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(padding, y + 2);
      ctx.lineTo(width - padding, y + 2);
      ctx.stroke();

      ctx.strokeStyle = STRING_COLORS[idx];
      ctx.lineWidth = 3 - idx * 0.2;
      ctx.beginPath();
      ctx.moveTo(padding, y);
      ctx.lineTo(width - padding, y);
      ctx.stroke();
    });
  };

  const drawHuiMarkers = (ctx, width, height) => {
    const padding = 40;
    const stringAreaHeight = height - padding * 2;
    const huiPositions = [0.95, 0.89, 0.83, 0.75, 0.67, 0.58, 0.5, 0.42, 0.33, 0.25, 0.17, 0.11, 0.05];

    huiPositions.forEach((pos, idx) => {
      const x = padding + pos * (width - padding * 2);
      const size = idx === 6 ? 8 : idx % 2 === 0 ? 6 : 4;

      ctx.fillStyle = '#c9a227';
      ctx.beginPath();
      ctx.arc(x, height / 2, size, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = '#fff';
      ctx.font = '8px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(idx + 1, x, height / 2 + 3);
    });
  };

  const drawHeatmap = (ctx, width, height) => {
    const padding = 40;
    const stringAreaHeight = height - padding * 2;
    const maxHeat = Math.max(...heatmapRef.current, 1);

    STRING_POSITIONS.forEach((pos, idx) => {
      const intensity = heatmapRef.current[idx] / maxHeat;
      if (intensity > 0) {
        const y = padding + pos * stringAreaHeight;
        const gradient = ctx.createRadialGradient(
          width / 2, y, 0,
          width / 2, y, 100
        );
        gradient.addColorStop(0, `rgba(230, 57, 70, ${intensity * 0.5})`);
        gradient.addColorStop(0.5, `rgba(244, 162, 97, ${intensity * 0.3})`);
        gradient.addColorStop(1, 'rgba(244, 162, 97, 0)');

        ctx.fillStyle = gradient;
        ctx.fillRect(padding, y - 50, width - padding * 2, 100);
      }
    });
  };

  const drawTrajectory = (ctx, width, height) => {
    if (trajectoryRef.current.length < 2) return;

    const padding = 40;
    const stringAreaHeight = height - padding * 2;
    const now = Date.now();

    ctx.strokeStyle = '#c9a227';
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    ctx.beginPath();
    trajectoryRef.current.forEach((point, idx) => {
      const x = padding + (idx / (trajectoryRef.current.length - 1 || 1)) * (width - padding * 2);
      const y = padding + STRING_POSITIONS[point.string] * stringAreaHeight;
      const age = (now - point.timestamp) / 2000;
      const alpha = Math.max(0, 1 - age);

      ctx.globalAlpha = alpha;
      if (idx === 0) {
        ctx.moveTo(x, y);
      } else {
        ctx.lineTo(x, y);
      }
    });
    ctx.stroke();
    ctx.globalAlpha = 1;

    trajectoryRef.current.forEach((point, idx) => {
      const x = padding + (idx / (trajectoryRef.current.length - 1 || 1)) * (width - padding * 2);
      const y = padding + STRING_POSITIONS[point.string] * stringAreaHeight;
      const age = (now - point.timestamp) / 2000;
      const alpha = Math.max(0, 1 - age);

      ctx.fillStyle = `rgba(201, 162, 39, ${alpha})`;
      ctx.beginPath();
      ctx.arc(x, y, 5, 0, Math.PI * 2);
      ctx.fill();
    });
  };

  const drawCurrentNote = (ctx, width, height, note) => {
    if (!note) return;

    const padding = 40;
    const stringAreaHeight = height - padding * 2;
    const stringIndex = note.string - 1;
    const y = padding + STRING_POSITIONS[stringIndex] * stringAreaHeight;
    const x = width / 2;

    const gradient = ctx.createRadialGradient(x, y, 0, x, y, 40);
    gradient.addColorStop(0, 'rgba(201, 162, 39, 0.8)');
    gradient.addColorStop(0.5, 'rgba(201, 162, 39, 0.3)');
    gradient.addColorStop(1, 'rgba(201, 162, 39, 0)');

    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.arc(x, y, 40, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = STRING_COLORS[stringIndex];
    ctx.lineWidth = 6;
    ctx.shadowColor = STRING_COLORS[stringIndex];
    ctx.shadowBlur = 15;
    ctx.beginPath();
    ctx.moveTo(padding, y);
    ctx.lineTo(width - padding, y);
    ctx.stroke();
    ctx.shadowBlur = 0;

    ctx.fillStyle = '#fff';
    ctx.font = 'bold 16px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(note.finger, x, y + 5);
  };

  const handleReset = useCallback(() => {
    trajectoryRef.current = [];
    heatmapRef.current = new Array(7).fill(0);
    setLocalIndex(0);
  }, []);

  return (
    <Card sx={{ mb: 2 }}>
      <CardContent>
        <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 2 }}>
          <Typography variant="h6">
            <TimelineIcon sx={{ fontSize: 20, mr: 1, verticalAlign: 'middle', color: 'secondary.main' }} />
            右手运指可视化
          </Typography>
          <Stack direction="row" spacing={1}>
            <Tooltip title="重置轨迹">
              <IconButton size="small" onClick={handleReset}>
                <RestartAltIcon fontSize="small" />
              </IconButton>
            </Tooltip>
          </Stack>
        </Stack>

        <Stack direction="row" spacing={2} flexWrap="wrap" sx={{ mb: 2 }}>
          <FormControlLabel
            control={
              <Switch
                checked={showTrajectory}
                onChange={(e) => setShowTrajectory(e.target.checked)}
                size="small"
              />
            }
            label="轨迹线"
          />
          <FormControlLabel
            control={
              <Switch
                checked={showHeatmap}
                onChange={(e) => setShowHeatmap(e.target.checked)}
                size="small"
              />
            }
            label={
              <Box sx={{ display: 'flex', alignItems: 'center' }}>
                <WhatshotIcon sx={{ fontSize: 16, mr: 0.5, color: '#e63946' }} />
                热力图
              </Box>
            }
          />
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, ml: 2 }}>
            <Typography variant="caption">速度:</Typography>
            <Slider
              value={playbackSpeed}
              onChange={(_, v) => setPlaybackSpeed(v)}
              min={0.5}
              max={2}
              step={0.1}
              sx={{ width: 80 }}
            />
            <Typography variant="caption">{playbackSpeed.toFixed(1)}x</Typography>
          </Box>
        </Stack>

        <Paper
          ref={canvasRef}
          sx={{
            width: '100%',
            height: 180,
            bgcolor: '#2a1f14',
            borderRadius: 2,
            overflow: 'hidden',
            position: 'relative'
          }}
        />

        <Stack direction="row" spacing={0.5} sx={{ mt: 1 }}>
          {STRING_NAMES.map((name, idx) => (
            <Chip
              key={idx}
              label={name}
              size="small"
              sx={{
                flex: 1,
                bgcolor: `${STRING_COLORS[idx]}30`,
                color: STRING_COLORS[idx],
                borderColor: STRING_COLORS[idx],
                '& .MuiChip-label': { px: 0.5 }
              }}
              variant="outlined"
            />
          ))}
        </Stack>

        {notes && notes.length > 0 && (
          <Box sx={{ mt: 2, pt: 2, borderTop: '1px solid rgba(255,255,255,0.1)' }}>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
              当前序列:
            </Typography>
            <Stack direction="row" spacing={0.5} flexWrap="wrap" useFlexGap>
              {notes.map((note, idx) => (
                <span
                  key={idx}
                  className={idx === localIndex ? 'notation-char highlight' : 'notation-char'}
                  style={{ minWidth: 40, fontSize: '0.8rem' }}
                >
                  {note.finger}{note.string}
                </span>
              ))}
            </Stack>
          </Box>
        )}
      </CardContent>
    </Card>
  );
}
