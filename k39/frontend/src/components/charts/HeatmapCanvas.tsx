import { useRef, useEffect, useCallback } from 'react';
import type { HeatmapCell } from '../../types';

interface PitchDimensions {
  width: number;
  height: number;
}

interface HeatmapCanvasProps {
  data: HeatmapCell[];
  gridSize: number;
  pitchDimensions: PitchDimensions;
  opacity?: number;
  filterPlayerId?: string;
  filterTeamId?: 'home' | 'away';
  canvasWidth?: number;
  canvasHeight?: number;
}

const COLOR_STOPS = [
  { pos: 0, r: 0, g: 0, b: 255 },
  { pos: 0.25, r: 0, g: 255, b: 0 },
  { pos: 0.5, r: 255, g: 255, b: 0 },
  { pos: 0.75, r: 255, g: 128, b: 0 },
  { pos: 1, r: 255, g: 0, b: 0 },
];

function getHeatColor(value: number): string {
  const clamped = Math.max(0, Math.min(1, value));
  let lower = COLOR_STOPS[0];
  let upper = COLOR_STOPS[COLOR_STOPS.length - 1];

  for (let i = 0; i < COLOR_STOPS.length - 1; i++) {
    if (clamped >= COLOR_STOPS[i].pos && clamped <= COLOR_STOPS[i + 1].pos) {
      lower = COLOR_STOPS[i];
      upper = COLOR_STOPS[i + 1];
      break;
    }
  }

  const range = upper.pos - lower.pos;
  const t = range === 0 ? 0 : (clamped - lower.pos) / range;
  const r = Math.round(lower.r + t * (upper.r - lower.r));
  const g = Math.round(lower.g + t * (upper.g - lower.g));
  const b = Math.round(lower.b + t * (upper.b - lower.b));

  return `rgb(${r},${g},${b})`;
}

const HeatmapCanvas = ({
  data,
  gridSize,
  pitchDimensions,
  opacity = 0.7,
  canvasWidth = 700,
  canvasHeight = 500,
}: HeatmapCanvasProps) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const heatmapCanvasRef = useRef<HTMLCanvasElement | null>(null);

  const padding = 30;

  const drawPitchBackground = useCallback(
    (ctx: CanvasRenderingContext2D) => {
      ctx.fillStyle = '#1a7a3a';
      ctx.fillRect(0, 0, canvasWidth, canvasHeight);

      const p = padding;
      const pw = canvasWidth - p * 2;
      const ph = canvasHeight - p * 2;

      ctx.strokeStyle = 'rgba(255,255,255,0.5)';
      ctx.lineWidth = 2;
      ctx.strokeRect(p, p, pw, ph);

      ctx.beginPath();
      ctx.moveTo(canvasWidth / 2, p);
      ctx.lineTo(canvasWidth / 2, p + ph);
      ctx.stroke();

      ctx.beginPath();
      ctx.arc(canvasWidth / 2, canvasHeight / 2, Math.min(pw, ph) * 0.12, 0, Math.PI * 2);
      ctx.stroke();

      ctx.beginPath();
      ctx.arc(canvasWidth / 2, canvasHeight / 2, 3, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(255,255,255,0.6)';
      ctx.fill();

      const penW = pw * 0.17;
      const penH = ph * 0.35;
      ctx.strokeStyle = 'rgba(255,255,255,0.5)';
      ctx.strokeRect(p, canvasHeight / 2 - penH / 2, penW, penH);
      ctx.strokeRect(p + pw - penW, canvasHeight / 2 - penH / 2, penW, penH);

      const goalW = pw * 0.06;
      const goalH = ph * 0.18;
      ctx.strokeRect(p, canvasHeight / 2 - goalH / 2, goalW, goalH);
      ctx.strokeRect(p + pw - goalW, canvasHeight / 2 - goalH / 2, goalW, goalH);
    },
    [canvasWidth, canvasHeight]
  );

  const buildHeatmap = useCallback(() => {
    const offscreen = document.createElement('canvas');
    offscreen.width = canvasWidth;
    offscreen.height = canvasHeight;
    const offCtx = offscreen.getContext('2d');
    if (!offCtx) return offscreen;

    const drawWidth = canvasWidth - padding * 2;
    const drawHeight = canvasHeight - padding * 2;
    const cellW = drawWidth / gridSize;
    const cellH = drawHeight / gridSize;

    const grid = new Float32Array(gridSize * gridSize);
    let maxVal = 0;

    data.forEach((cell) => {
      const col = Math.floor(cell.x * gridSize);
      const row = Math.floor(cell.y * gridSize);
      if (col >= 0 && col < gridSize && row >= 0 && row < gridSize) {
        const idx = row * gridSize + col;
        grid[idx] += cell.value;
        if (grid[idx] > maxVal) maxVal = grid[idx];
      }
    });

    if (maxVal === 0) return offscreen;

    for (let row = 0; row < gridSize; row++) {
      for (let col = 0; col < gridSize; col++) {
        const val = grid[row * gridSize + col] / maxVal;
        if (val < 0.01) continue;

        const x = padding + col * cellW;
        const y = padding + row * cellH;

        const gradient = offCtx.createRadialGradient(
          x + cellW / 2,
          y + cellH / 2,
          0,
          x + cellW / 2,
          y + cellH / 2,
          Math.max(cellW, cellH) * 0.8
        );

        const color = getHeatColor(val);
        gradient.addColorStop(0, color);
        gradient.addColorStop(1, 'transparent');

        offCtx.globalAlpha = opacity * val;
        offCtx.fillStyle = gradient;
        offCtx.fillRect(x - cellW * 0.3, y - cellH * 0.3, cellW * 1.6, cellH * 1.6);
      }
    }

    offCtx.globalAlpha = 1;
    return offscreen;
  }, [data, gridSize, canvasWidth, canvasHeight, opacity]);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    canvas.width = canvasWidth * dpr;
    canvas.height = canvasHeight * dpr;
    canvas.style.width = `${canvasWidth}px`;
    canvas.style.height = `${canvasHeight}px`;
    ctx.scale(dpr, dpr);

    drawPitchBackground(ctx);

    heatmapCanvasRef.current = buildHeatmap();
    if (heatmapCanvasRef.current) {
      ctx.drawImage(heatmapCanvasRef.current, 0, 0, canvasWidth, canvasHeight);
    }
  }, [canvasWidth, canvasHeight, drawPitchBackground, buildHeatmap]);

  useEffect(() => {
    draw();
  }, [draw]);

  return (
    <div className="bg-white rounded-xl shadow-sm p-6">
      <h3 className="text-lg font-semibold text-gray-800 mb-4">活动热力图</h3>
      <canvas ref={canvasRef} />

      <div className="flex justify-center mt-4">
        <div className="flex items-center space-x-1">
          <span className="text-xs text-gray-500">低</span>
          <div className="flex">
            {COLOR_STOPS.map((stop, i) => (
              <div
                key={i}
                className="w-6 h-3"
                style={{ backgroundColor: `rgb(${stop.r},${stop.g},${stop.b})` }}
              />
            ))}
          </div>
          <span className="text-xs text-gray-500">高</span>
        </div>
      </div>
    </div>
  );
};

export default HeatmapCanvas;
