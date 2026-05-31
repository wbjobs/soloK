import React, { useEffect, useRef } from 'react';
import { Box, Typography } from '@mui/material';

interface SmallLesion {
  id: number;
  center: [number, number];
  area_pixels: number;
  area_ratio: number;
  mean_severity: number;
  max_severity: number;
  dominant_class: number;
  bbox: [number, number, number, number];
}

interface HeatmapProps {
  data: number[][];
  title?: string;
  colormap?: string;
  minValue?: number;
  maxValue?: number;
  showColorbar?: boolean;
  onClick?: (x: number, y: number, value: number) => void;
  smallLesions?: SmallLesion[];
  showLesionMarkers?: boolean;
}

const Heatmap: React.FC<HeatmapProps> = ({
  data,
  title,
  colormap = 'viridis',
  minValue,
  maxValue,
  showColorbar = true,
  onClick,
  smallLesions = [],
  showLesionMarkers = true,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || data.length === 0) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const height = data.length;
    const width = data[0].length;

    canvas.width = width;
    canvas.height = height;

    ctx.imageSmoothingEnabled = false;

    const min = minValue ?? Math.min(...data.flat());
    const max = maxValue ?? Math.max(...data.flat());

    const imageData = ctx.createImageData(width, height);

    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const value = data[y][x];
        const normalized = max === min ? 0 : (value - min) / (max - min);
        const [r, g, b] = getColorFromColormap(normalized, colormap);

        const idx = (y * width + x) * 4;
        imageData.data[idx] = r;
        imageData.data[idx + 1] = g;
        imageData.data[idx + 2] = b;
        imageData.data[idx + 3] = 255;
      }
    }

    ctx.putImageData(imageData, 0, 0);

    if (showLesionMarkers && smallLesions.length > 0) {
      ctx.strokeStyle = '#ff0000';
      ctx.lineWidth = 2;
      
      smallLesions.forEach((lesion) => {
        const [x1, y1, x2, y2] = lesion.bbox;
        const rectWidth = x2 - x1;
        const rectHeight = y2 - y1;
        
        ctx.strokeRect(x1, y1, rectWidth, rectHeight);
        
        ctx.fillStyle = '#ff0000';
        ctx.beginPath();
        ctx.arc(lesion.center[0], lesion.center[1], 3, 0, Math.PI * 2);
        ctx.fill();
      });
    }
  }, [data, colormap, minValue, maxValue, smallLesions, showLesionMarkers]);

  const handleCanvasClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!onClick || !canvasRef.current) return;

    const rect = canvasRef.current.getBoundingClientRect();
    const scaleX = canvasRef.current.width / rect.width;
    const scaleY = canvasRef.current.height / rect.height;

    const x = Math.floor((e.clientX - rect.left) * scaleX);
    const y = Math.floor((e.clientY - rect.top) * scaleY);

    if (y >= 0 && y < data.length && x >= 0 && x < data[0].length) {
      onClick(x, y, data[y][x]);
    }
  };

  return (
    <Box>
      {title && (
        <Typography variant="h6" gutterBottom>
          {title}
        </Typography>
      )}
      <Box sx={{ display: 'flex', gap: 2 }}>
        <canvas
          ref={canvasRef}
          onClick={handleCanvasClick}
          style={{
            width: '100%',
            maxWidth: '500px',
            height: 'auto',
            cursor: onClick ? 'crosshair' : 'default',
            border: '1px solid #ccc',
          }}
        />
        {showColorbar && (
          <Colorbar
            min={minValue ?? Math.min(...data.flat())}
            max={maxValue ?? Math.max(...data.flat())}
            colormap={colormap}
          />
        )}
      </Box>
    </Box>
  );
};

const Colorbar: React.FC<{
  min: number;
  max: number;
  colormap: string;
}> = ({ min, max, colormap }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const height = 200;
    const width = 30;

    canvas.width = width;
    canvas.height = height;

    for (let i = 0; i < height; i++) {
      const normalized = 1 - i / height;
      const [r, g, b] = getColorFromColormap(normalized, colormap);
      ctx.fillStyle = `rgb(${r}, ${g}, ${b})`;
      ctx.fillRect(0, i, width, 1);
    }
  }, [min, max, colormap]);

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
      <Typography variant="caption">{max.toFixed(2)}</Typography>
      <canvas
        ref={canvasRef}
        style={{ width: '30px', height: '200px', border: '1px solid #ccc' }}
      />
      <Typography variant="caption">{min.toFixed(2)}</Typography>
    </Box>
  );
};

function getColorFromColormap(value: number, colormap: string): [number, number, number] {
  value = Math.max(0, Math.min(1, value));

  switch (colormap) {
    case 'viridis':
      return viridis(value);
    case 'plasma':
      return plasma(value);
    case 'jet':
      return jet(value);
    case 'red':
      return [Math.floor(255 * value), Math.floor(100 * (1 - value)), Math.floor(100 * (1 - value))];
    case 'green':
      return [Math.floor(100 * (1 - value)), Math.floor(255 * value), Math.floor(100 * (1 - value))];
    default:
      return viridis(value);
  }
}

function viridis(t: number): [number, number, number] {
  const colors = [
    [68, 1, 84],
    [72, 40, 120],
    [62, 74, 137],
    [49, 104, 142],
    [38, 130, 142],
    [31, 158, 137],
    [53, 183, 121],
    [109, 205, 89],
    [180, 222, 44],
    [253, 231, 37],
  ];
  const idx = Math.min(Math.floor(t * (colors.length - 1)), colors.length - 2);
  const frac = t * (colors.length - 1) - idx;
  return [
    Math.floor(colors[idx][0] + (colors[idx + 1][0] - colors[idx][0]) * frac),
    Math.floor(colors[idx][1] + (colors[idx + 1][1] - colors[idx][1]) * frac),
    Math.floor(colors[idx][2] + (colors[idx + 1][2] - colors[idx][2]) * frac),
  ];
}

function plasma(t: number): [number, number, number] {
  const colors = [
    [13, 8, 135],
    [75, 3, 161],
    [127, 0, 166],
    [172, 27, 148],
    [207, 64, 117],
    [232, 107, 86],
    [247, 152, 58],
    [253, 198, 39],
    [240, 249, 33],
  ];
  const idx = Math.min(Math.floor(t * (colors.length - 1)), colors.length - 2);
  const frac = t * (colors.length - 1) - idx;
  return [
    Math.floor(colors[idx][0] + (colors[idx + 1][0] - colors[idx][0]) * frac),
    Math.floor(colors[idx][1] + (colors[idx + 1][1] - colors[idx][1]) * frac),
    Math.floor(colors[idx][2] + (colors[idx + 1][2] - colors[idx][2]) * frac),
  ];
}

function jet(t: number): [number, number, number] {
  if (t < 0.125) return [0, 0, Math.floor(255 * (4 * t + 0.5))];
  if (t < 0.375) return [0, Math.floor(255 * (4 * t - 0.5)), 255];
  if (t < 0.625) return [Math.floor(255 * (4 * t - 1.5)), 255, Math.floor(255 * (1.5 - 4 * t))];
  if (t < 0.875) return [255, Math.floor(255 * (3.5 - 4 * t)), 0];
  return [Math.floor(255 * (4.5 - 4 * t)), 0, 0];
}

export default Heatmap;
