import { useEffect, useRef, useCallback, useState } from 'react';
import { ZoomIn, ZoomOut, Move, SplitSquareHorizontal, Image as ImageIcon, RotateCcw, AlertTriangle, Loader2 } from 'lucide-react';
import { useAppStore } from '@/store/useAppStore';
import { ALGORITHM_INFO } from '@/types';
import { WebGLRenderer } from '@/webgl/WebGLRenderer';
import { createThumbnail } from '@/utils/exportWebP';

export default function PreviewCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const rendererRef = useRef<WebGLRenderer | null>(null);
  const animationRef = useRef<number>(0);
  const fpsFrameCountRef = useRef<number>(0);
  const fpsTimeRef = useRef<number>(0);
  const zoomRef = useRef(1);
  const panRef = useRef({ x: 0, y: 0 });
  const isDraggingRef = useRef(false);
  const dragStartRef = useRef({ x: 0, y: 0 });
  const [isLoading, setIsLoading] = useState(false);
  const loadingProgress = useRef(0);
  const [isDownsampled, setIsDownsampled] = useState(false);
  const [downsampleScale, setDownsampleScale] = useState(1);
  const [loadError, setLoadError] = useState<string | null>(null);

  const {
    params,
    compareMode,
    comparePosition,
    originalImage,
    performance: perfMetrics,
    updatePerformance,
    setComparePosition,
    setProcessedThumbnail,
  } = useAppStore();

  const handleWheel = useCallback((e: WheelEvent) => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? 0.9 : 1.1;
    zoomRef.current = Math.min(Math.max(zoomRef.current * delta, 0.1), 5);
    updateTransform();
  }, []);

  const handleMouseDown = useCallback((e: MouseEvent) => {
    if (e.button === 0) {
      isDraggingRef.current = true;
      dragStartRef.current = { x: e.clientX - panRef.current.x, y: e.clientY - panRef.current.y };
    }
  }, []);

  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (isDraggingRef.current) {
      panRef.current = { x: e.clientX - dragStartRef.current.x, y: e.clientY - dragStartRef.current.y };
      updateTransform();
    }
  }, []);

  const handleMouseUp = useCallback(() => {
    isDraggingRef.current = false;
  }, []);

  const updateTransform = () => {
    const wrapper = document.getElementById('canvas-wrapper');
    if (wrapper) {
      wrapper.style.transform = `translate(${panRef.current.x}px, ${panRef.current.y}px) scale(${zoomRef.current})`;
    }
  };

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    container.addEventListener('wheel', handleWheel, { passive: false });
    container.addEventListener('mousedown', handleMouseDown);
    container.addEventListener('mousemove', handleMouseMove);
    container.addEventListener('mouseup', handleMouseUp);
    container.addEventListener('mouseleave', handleMouseUp);

    return () => {
      container.removeEventListener('wheel', handleWheel);
      container.removeEventListener('mousedown', handleMouseDown);
      container.removeEventListener('mousemove', handleMouseMove);
      container.removeEventListener('mouseup', handleMouseUp);
      container.removeEventListener('mouseleave', handleMouseUp);
    };
  }, [handleWheel, handleMouseDown, handleMouseMove, handleMouseUp]);

  useEffect(() => {
    if (!canvasRef.current) return;

    const renderer = new WebGLRenderer();
    if (!renderer.init(canvasRef.current)) {
      setLoadError('WebGL2 不可用，请使用现代浏览器。');
      return;
    }
    rendererRef.current = renderer;

    return () => {
      cancelAnimationFrame(animationRef.current);
      renderer.dispose();
      rendererRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (!rendererRef.current || !originalImage) return;

    let cancelled = false;
    const loadImageAsync = async () => {
      setIsLoading(true);
      setLoadError(null);
      loadingProgress.current = 0;

      try {
        await new Promise(resolve => setTimeout(resolve, 50));
        loadingProgress.current = 30;

        const success = await rendererRef.current!.loadImage(originalImage);
        if (cancelled) return;

        loadingProgress.current = 80;

        if (!success) {
          setLoadError('图像加载失败。');
          return;
        }

        setIsDownsampled(rendererRef.current!.getIsDownsampled());
        setDownsampleScale(rendererRef.current!.getDownsampleScale());
      } catch (e) {
        if (!cancelled) {
          setLoadError('图像处理失败。');
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    };

    loadImageAsync();

    return () => {
      cancelled = true;
    };
  }, [originalImage]);

  useEffect(() => {
    if (!rendererRef.current || !originalImage || isLoading || loadError) return;

    cancelAnimationFrame(animationRef.current);
    fpsFrameCountRef.current = 0;
    fpsTimeRef.current = performance.now();

    const renderLoop = () => {
      if (!rendererRef.current) return;

      fpsFrameCountRef.current++;
      const now = performance.now();
      if (now - fpsTimeRef.current >= 1000) {
        const fps = Math.round((fpsFrameCountRef.current * 1000) / (now - fpsTimeRef.current));
        fpsFrameCountRef.current = 0;
        fpsTimeRef.current = now;
        const stats = rendererRef.current.getGPUStats();
        updatePerformance({ fps, gpuMemoryMB: stats.memoryMB });
      }

      const processTime = rendererRef.current.render(params);
      updatePerformance({
        currentProcessTime: processTime,
        processTime: {
          sobel: params.algorithm === 'sobel' ? processTime : perfMetrics.processTime.sobel,
          canny: params.algorithm === 'canny' ? processTime : perfMetrics.processTime.canny,
          laplacian: params.algorithm === 'laplacian' ? processTime : perfMetrics.processTime.laplacian,
        },
      });

      if (processTime > 0 && rendererRef.current) {
        const canvas = canvasRef.current;
        if (canvas) {
          const thumb = createThumbnail(canvas, 200);
          if (thumb) setProcessedThumbnail(thumb);
        }
      }

      animationRef.current = requestAnimationFrame(renderLoop);
    };

    animationRef.current = requestAnimationFrame(renderLoop);

    return () => {
      cancelAnimationFrame(animationRef.current);
    };
  }, [originalImage, params, isLoading, loadError]);

  const handleSliderMouseDown = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    const handleMove = (moveEvent: MouseEvent) => {
      if (!containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      const pos = (moveEvent.clientX - rect.left) / rect.width;
      setComparePosition(Math.min(Math.max(pos, 0), 1));
    };
    const handleUp = () => {
      document.removeEventListener('mousemove', handleMove);
      document.removeEventListener('mouseup', handleUp);
    };
    document.addEventListener('mousemove', handleMove);
    document.addEventListener('mouseup', handleUp);
  }, [setComparePosition]);

  const resetView = useCallback(() => {
    zoomRef.current = 1;
    panRef.current = { x: 0, y: 0 };
    updateTransform();
  }, []);

  if (loadError) {
    return (
      <div className="relative flex h-full w-full flex-col items-center justify-center rounded-xl border border-red-500/30 bg-slate-800/50 p-8">
        <AlertTriangle className="mb-4 h-16 w-16 text-red-400" />
        <h3 className="mb-2 text-lg font-medium text-slate-200">加载失败</h3>
        <p className="text-center text-sm text-slate-400">{loadError}</p>
      </div>
    );
  }

  if (!originalImage) {
    return (
      <div className="relative flex h-full w-full flex-col items-center justify-center rounded-xl border border-cyan-500/20 bg-slate-800/50 p-8">
        <ImageIcon className="mb-4 h-16 w-16 text-slate-500" />
        <h3 className="mb-2 text-lg font-medium text-slate-300">暂无图像</h3>
        <p className="text-center text-sm text-slate-500">上传图像以开始边缘检测处理</p>
      </div>
    );
  }

  const btnClass = 'rounded-lg bg-slate-900/80 p-2 text-slate-300 backdrop-blur-sm transition-colors hover:bg-cyan-500/20 hover:text-cyan-400';

  return (
    <div ref={containerRef} className="relative h-full w-full overflow-hidden rounded-xl">
      <div
        className="scanlines relative h-full w-full overflow-hidden rounded-xl border border-cyan-500/30 bg-slate-900"
        style={{ cursor: isDraggingRef.current ? 'grabbing' : 'grab' }}
      >
        {isLoading && (
          <div className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-slate-900/90 backdrop-blur-sm">
          <Loader2 className="mb-4 h-12 w-12 animate-spin text-cyan-400" />
          <p className="text-sm text-slate-300">
            {isDownsampled ? '降采样处理中...' : '加载图像中...'}
          </p>
          <div className="mt-3 h-1 w-48 overflow-hidden rounded-full bg-slate-700">
            <div
              className="h-full bg-gradient-to-r from-cyan-500 to-purple-500 transition-all duration-300"
              style={{ width: `${loadingProgress.current}%` }}
            />
          </div>
        </div>
      )}

        <div id="canvas-wrapper" className="absolute inset-0 flex items-center justify-center" style={{ transform: `translate(${panRef.current.x}px, ${panRef.current.y}px) scale(${zoomRef.current})` }}>
          <canvas ref={canvasRef} className="max-w-full max-h-full object-contain" />
        </div>

        {compareMode && (
          <>
            <div className="absolute left-0 top-0 h-full overflow-hidden" style={{ width: `${comparePosition * 100}%` }}>
              <img src={originalImage.src} alt="Original" className="absolute h-full w-full object-contain" />
            </div>
            <div
              className="compare-slider"
              style={{ left: `calc(${comparePosition * 100}% - 2px)` }}
              onMouseDown={handleSliderMouseDown}
            />
          </>
        )}

        <div className="absolute left-3 top-3 rounded-lg bg-slate-900/80 px-3 py-2 text-xs backdrop-blur-sm">
          <div className="flex items-center gap-2 font-mono text-cyan-400">
            <SplitSquareHorizontal className="h-3 w-3" />
            <span>{ALGORITHM_INFO[params.algorithm].name}</span>
          </div>
          <div className="mt-1 text-slate-400">处理时间: {perfMetrics.currentProcessTime.toFixed(2)}ms</div>
          {isDownsampled && (
            <div className="mt-1 flex items-center gap-1 text-yellow-400">
              <AlertTriangle className="h-3 w-3" />
              <span>已降采样至 {(100 * downsampleScale).toFixed(0)}%</span>
            </div>
          )}
        </div>

        <div className="absolute right-3 top-3 flex gap-1">
          <button onClick={() => { zoomRef.current = Math.min(zoomRef.current * 1.2, 5); updateTransform(); }} className={btnClass}>
            <ZoomIn className="h-4 w-4" />
          </button>
          <button onClick={() => { zoomRef.current = Math.max(zoomRef.current / 1.2, 0.1); updateTransform(); }} className={btnClass}>
            <ZoomOut className="h-4 w-4" />
          </button>
          <button onClick={resetView} className={btnClass}>
            <RotateCcw className="h-4 w-4" />
          </button>
          <button onClick={resetView} className={btnClass}>
            <Move className="h-4 w-4" />
          </button>
        </div>

        <div className="absolute bottom-3 left-3 rounded-lg bg-slate-900/80 px-3 py-1 text-xs text-slate-400 backdrop-blur-sm">
          缩放: {(zoomRef.current * 100).toFixed(0)}%
        </div>
        <div className="absolute bottom-3 right-3 rounded-lg bg-slate-900/80 px-3 py-1 text-xs font-mono text-slate-400 backdrop-blur-sm">
          {originalImage.naturalWidth} × {originalImage.naturalHeight}
          {isDownsampled && (
            <span className="ml-1 text-yellow-400">
              → {Math.round(originalImage.naturalWidth * downsampleScale)} × {Math.round(originalImage.naturalHeight * downsampleScale)}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
