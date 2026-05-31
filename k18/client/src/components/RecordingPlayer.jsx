import React, { useRef, useEffect, useState, useCallback } from 'react';
import { Play, Pause, SkipBack, SkipForward, Volume2, VolumeX } from 'lucide-react';

export default function RecordingPlayer({
  videoUrl,
  sessionData,
  width = 1280,
  height = 720,
}) {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const containerRef = useRef(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [isMuted, setIsMuted] = useState(false);
  const [activeAnnotations, setActiveAnnotations] = useState([]);
  const [activeMeasurements, setActiveMeasurements] = useState([]);
  const [canvasSize, setCanvasSize] = useState({ width, height });

  const annotations = sessionData?.annotations || [];
  const measurements = sessionData?.measurements || [];
  const events = sessionData?.events || [];

  useEffect(() => {
    if (containerRef.current) {
      const updateSize = () => {
        const rect = containerRef.current.getBoundingClientRect();
        setCanvasSize({ width: rect.width, height: rect.height });
      };
      updateSize();
      const observer = new ResizeObserver(updateSize);
      observer.observe(containerRef.current);
      return () => observer.disconnect();
    }
  }, []);

  const getActiveAnnotations = useCallback((timeMs) => {
    const added = new Map();

    annotations
      .filter((ann) => ann.relativeTime !== undefined && ann.relativeTime <= timeMs)
      .sort((a, b) => a.relativeTime - b.relativeTime)
      .forEach((ann) => {
        if (ann.action === 'remove') {
          added.delete(ann.id);
        } else {
          added.set(ann.id, ann);
        }
      });

    return Array.from(added.values());
  }, [annotations]);

  const getActiveMeasurements = useCallback((timeMs) => {
    const added = new Map();

    measurements
      .filter((m) => m.relativeTime !== undefined && m.relativeTime <= timeMs)
      .sort((a, b) => a.relativeTime - b.relativeTime)
      .forEach((m) => {
        if (m.action === 'remove') {
          added.delete(m.id);
        } else {
          added.set(m.id, m);
        }
      });

    return Array.from(added.values());
  }, [measurements]);

  const drawArrow = (ctx, ann, scaleX, scaleY) => {
    if (!ann.points || ann.points.length < 2) return;

    const start = {
      x: ann.points[0].x * scaleX,
      y: ann.points[0].y * scaleY,
    };
    const end = {
      x: ann.points[ann.points.length - 1].x * scaleX,
      y: ann.points[ann.points.length - 1].y * scaleY,
    };

    const headLen = 15;
    const angle = Math.atan2(end.y - start.y, end.x - start.x);

    ctx.strokeStyle = ann.color || '#FF6B6B';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(start.x, start.y);
    ctx.lineTo(end.x, end.y);
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(end.x, end.y);
    ctx.lineTo(
      end.x - headLen * Math.cos(angle - Math.PI / 6),
      end.y - headLen * Math.sin(angle - Math.PI / 6)
    );
    ctx.moveTo(end.x, end.y);
    ctx.lineTo(
      end.x - headLen * Math.cos(angle + Math.PI / 6),
      end.y - headLen * Math.sin(angle + Math.PI / 6)
    );
    ctx.stroke();
  };

  const drawRectangle = (ctx, ann, scaleX, scaleY) => {
    if (!ann.points || ann.points.length < 2) return;

    const start = {
      x: ann.points[0].x * scaleX,
      y: ann.points[0].y * scaleY,
    };
    const end = {
      x: ann.points[1].x * scaleX,
      y: ann.points[1].y * scaleY,
    };

    ctx.strokeStyle = ann.color || '#FF6B6B';
    ctx.lineWidth = 2;
    ctx.strokeRect(
      Math.min(start.x, end.x),
      Math.min(start.y, end.y),
      Math.abs(end.x - start.x),
      Math.abs(end.y - start.y)
    );
  };

  const drawEllipse = (ctx, ann, scaleX, scaleY) => {
    if (!ann.points || ann.points.length < 2) return;

    const start = ann.points[0];
    const end = ann.points[1];

    const cx = (start.x + end.x) / 2 * scaleX;
    const cy = (start.y + end.y) / 2 * scaleY;
    const rx = Math.abs(end.x - start.x) / 2 * scaleX;
    const ry = Math.abs(end.y - start.y) / 2 * scaleY;

    ctx.strokeStyle = ann.color || '#FF6B6B';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.ellipse(cx, cy, rx, ry, 0, 0, 2 * Math.PI);
    ctx.stroke();
  };

  const drawFreehand = (ctx, ann, scaleX, scaleY) => {
    if (!ann.points || ann.points.length < 2) return;

    ctx.strokeStyle = ann.color || '#FF6B6B';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(ann.points[0].x * scaleX, ann.points[0].y * scaleY);
    for (let i = 1; i < ann.points.length; i++) {
      ctx.lineTo(ann.points[i].x * scaleX, ann.points[i].y * scaleY);
    }
    ctx.stroke();
  };

  const drawDistance = (ctx, ann, scaleX, scaleY) => {
    if (!ann.points || ann.points.length < 2) return;

    const start = {
      x: ann.points[0].x * scaleX,
      y: ann.points[0].y * scaleY,
    };
    const end = {
      x: ann.points[ann.points.length - 1].x * scaleX,
      y: ann.points[ann.points.length - 1].y * scaleY,
    };

    const dist = Math.hypot(
      (end.x - start.x) / scaleX * 1280,
      (end.y - start.y) / scaleY * 720
    );

    ctx.strokeStyle = ann.color || '#FF6B6B';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(start.x, start.y);
    ctx.lineTo(end.x, end.y);
    ctx.stroke();

    const midX = (start.x + end.x) / 2;
    const midY = (start.y + end.y) / 2;
    ctx.fillStyle = ann.color || '#FF6B6B';
    ctx.font = '14px Arial';
    ctx.fillText(`${dist.toFixed(1)}px`, midX, midY - 10);
  };

  const drawArea = (ctx, ann, scaleX, scaleY) => {
    if (!ann.points || ann.points.length < 3) return;

    ctx.strokeStyle = ann.color || '#FF6B6B';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(ann.points[0].x * scaleX, ann.points[0].y * scaleY);
    for (let i = 1; i < ann.points.length; i++) {
      ctx.lineTo(ann.points[i].x * scaleX, ann.points[i].y * scaleY);
    }
    ctx.closePath();
    ctx.stroke();

    let area = 0;
    for (let i = 0; i < ann.points.length; i++) {
      const j = (i + 1) % ann.points.length;
      area += ann.points[i].x * ann.points[j].y;
      area -= ann.points[j].x * ann.points[i].y;
    }
    area = Math.abs(area) / 2;

    const cx = ann.points.reduce((s, p) => s + p.x, 0) / ann.points.length * scaleX;
    const cy = ann.points.reduce((s, p) => s + p.y, 0) / ann.points.length * scaleY;

    ctx.fillStyle = ann.color || '#FF6B6B';
    ctx.font = '14px Arial';
    ctx.fillText(`${area.toFixed(1)}px²`, cx, cy);
  };

  const drawAngle = (ctx, ann, scaleX, scaleY) => {
    if (!ann.points || ann.points.length < 3) return;

    const p1 = { x: ann.points[0].x * scaleX, y: ann.points[0].y * scaleY };
    const p2 = { x: ann.points[1].x * scaleX, y: ann.points[1].y * scaleY };
    const p3 = { x: ann.points[2].x * scaleX, y: ann.points[2].y * scaleY };

    ctx.strokeStyle = ann.color || '#FF6B6B';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(p1.x, p1.y);
    ctx.lineTo(p2.x, p2.y);
    ctx.lineTo(p3.x, p3.y);
    ctx.stroke();

    const v1 = { x: p1.x - p2.x, y: p1.y - p2.y };
    const v2 = { x: p3.x - p2.x, y: p3.y - p2.y };
    const dot = v1.x * v2.x + v1.y * v2.y;
    const mag1 = Math.hypot(v1.x, v1.y);
    const mag2 = Math.hypot(v2.x, v2.y);
    const cosAngle = Math.min(1, Math.max(-1, dot / (mag1 * mag2)));
    const angle = Math.acos(cosAngle);
    const angleDeg = (angle * 180) / Math.PI;

    ctx.fillStyle = ann.color || '#FF6B6B';
    ctx.font = '14px Arial';
    ctx.fillText(`${angleDeg.toFixed(1)}°`, p2.x + 15, p2.y);
  };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvasSize.width, canvasSize.height);

    const scaleX = canvasSize.width / width;
    const scaleY = canvasSize.height / height;

    activeAnnotations.forEach((ann) => {
      const color = ann.color || '#FF6B6B';

      if (ann.type === 'arrow') {
        drawArrow(ctx, ann, scaleX, scaleY);
      } else if (ann.type === 'rectangle') {
        drawRectangle(ctx, ann, scaleX, scaleY);
      } else if (ann.type === 'ellipse') {
        drawEllipse(ctx, ann, scaleX, scaleY);
      } else if (ann.type === 'freehand') {
        drawFreehand(ctx, ann, scaleX, scaleY);
      } else if (ann.type === 'distance') {
        drawDistance(ctx, ann, scaleX, scaleY);
      } else if (ann.type === 'area') {
        drawArea(ctx, ann, scaleX, scaleY);
      } else if (ann.type === 'angle') {
        drawAngle(ctx, ann, scaleX, scaleY);
      }

      if (ann.expertName && ann.points && ann.points.length > 0) {
        ctx.fillStyle = color;
        ctx.font = 'bold 12px Arial';
        const labelX = ann.points[0].x * scaleX;
        const labelY = ann.points[0].y * scaleY - 8;
        ctx.fillText(ann.expertName, labelX, labelY);
      }
    });
  }, [activeAnnotations, canvasSize, width, height]);

  useEffect(() => {
    const timeMs = currentTime * 1000;
    setActiveAnnotations(getActiveAnnotations(timeMs));
    setActiveMeasurements(getActiveMeasurements(timeMs));
  }, [currentTime, getActiveAnnotations, getActiveMeasurements]);

  const handleTimeUpdate = () => {
    if (videoRef.current) {
      setCurrentTime(videoRef.current.currentTime);
    }
  };

  const handleLoadedMetadata = () => {
    if (videoRef.current) {
      setDuration(videoRef.current.duration);
    }
  };

  const togglePlay = () => {
    if (videoRef.current) {
      if (isPlaying) {
        videoRef.current.pause();
      } else {
        videoRef.current.play();
      }
      setIsPlaying(!isPlaying);
    }
  };

  const handleSeek = (e) => {
    const newTime = parseFloat(e.target.value);
    if (videoRef.current) {
      videoRef.current.currentTime = newTime;
      setCurrentTime(newTime);
    }
  };

  const skipBack = () => {
    if (videoRef.current) {
      videoRef.current.currentTime = Math.max(0, videoRef.current.currentTime - 5);
    }
  };

  const skipForward = () => {
    if (videoRef.current) {
      videoRef.current.currentTime = Math.min(duration, videoRef.current.currentTime + 5);
    }
  };

  const toggleMute = () => {
    if (videoRef.current) {
      videoRef.current.muted = !isMuted;
      setIsMuted(!isMuted);
    }
  };

  const formatTime = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <div ref={containerRef} className="relative bg-black rounded-lg overflow-hidden" style={{ width: '100%', maxWidth: width }}>
      <div className="relative" style={{ aspectRatio: `${width}/${height}` }}>
        <video
          ref={videoRef}
          src={videoUrl}
          className="w-full h-full object-contain"
          onTimeUpdate={handleTimeUpdate}
          onLoadedMetadata={handleLoadedMetadata}
          onPlay={() => setIsPlaying(true)}
          onPause={() => setIsPlaying(false)}
          onEnded={() => setIsPlaying(false)}
        />

        <canvas
          ref={canvasRef}
          width={canvasSize.width}
          height={canvasSize.height}
          className="absolute inset-0 pointer-events-none"
          style={{ zIndex: 10 }}
        />
      </div>

      <div className="bg-gray-900 px-4 py-3">
        <div className="flex items-center gap-3 mb-2">
          <button
            onClick={skipBack}
            className="p-2 text-gray-400 hover:text-white transition-colors"
            title="后退5秒"
          >
            <SkipBack size={18} />
          </button>

          <button
            onClick={togglePlay}
            className="p-2 bg-blue-600 hover:bg-blue-700 text-white rounded transition-colors"
          >
            {isPlaying ? <Pause size={20} /> : <Play size={20} />}
          </button>

          <button
            onClick={skipForward}
            className="p-2 text-gray-400 hover:text-white transition-colors"
            title="前进5秒"
          >
            <SkipForward size={18} />
          </button>

          <div className="flex-1 mx-3">
            <input
              type="range"
              min={0}
              max={duration || 100}
              value={currentTime}
              onChange={handleSeek}
              className="w-full h-1 bg-gray-600 rounded-lg appearance-none cursor-pointer"
              style={{
                background: `linear-gradient(to right, #3b82f6 0%, #3b82f6 ${(currentTime / (duration || 1)) * 100}%, #4b5563 ${(currentTime / (duration || 1)) * 100}%, #4b5563 100%)`,
              }}
            />
          </div>

          <span className="text-gray-400 text-sm font-mono min-w-[100px] text-center">
            {formatTime(currentTime)} / {formatTime(duration)}
          </span>

          <button
            onClick={toggleMute}
            className="p-2 text-gray-400 hover:text-white transition-colors"
          >
            {isMuted ? <VolumeX size={18} /> : <Volume2 size={18} />}
          </button>
        </div>

        <div className="flex items-center justify-between text-xs text-gray-500">
          <div>
            <span>当前标注: {activeAnnotations.length}</span>
            <span className="mx-2">|</span>
            <span>当前测量: {activeMeasurements.length}</span>
          </div>
          <div>
            {events.length > 0 && (
              <span>事件数: {events.length}</span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
