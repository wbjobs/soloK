import { useRef, useState, useCallback, useEffect } from 'react';
import {
  Upload,
  X,
  Play,
  Square,
  Download,
  Trash2,
  FileImage,
  CheckCircle2,
  XCircle,
  Loader2,
  AlertTriangle,
  Clock,
  Layers,
  FileSpreadsheet,
} from 'lucide-react';
import { useAppStore } from '@/store/useAppStore';
import { BATCH_MAX_IMAGES, ALGORITHM_INFO, type Algorithm, type BatchImageItem, type BatchResult } from '@/types';
import { WebGLRenderer } from '@/webgl/WebGLRenderer';
import { generateCSVReport, generateSummaryCSV, downloadCSV } from '@/utils/csvExport';
import { exportToWebP } from '@/utils/exportWebP';

const ALGORITHMS: Algorithm[] = ['sobel', 'canny', 'laplacian'];

export default function BatchProcessor() {
  const hiddenInputRef = useRef<HTMLInputElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rendererRef = useRef<WebGLRenderer | null>(null);
  const abortRef = useRef(false);
  const [rendererReady, setRendererReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const {
    batch,
    params,
    addBatchImages,
    removeBatchImage,
    clearBatchImages,
    updateBatchImage,
    setBatchProcessing,
    setBatchCurrentIndex,
    addBatchResult,
    incrementBatchCompleted,
    setBatchMode,
    resetBatch,
    setBatchParams,
  } = useAppStore();

  useEffect(() => {
    if (!canvasRef.current) return;

    const renderer = new WebGLRenderer();
    if (!renderer.init(canvasRef.current)) {
      setError('WebGL2 不可用，请使用现代浏览器。');
      return;
    }

    rendererRef.current = renderer;
    setRendererReady(true);

    return () => {
      renderer.dispose();
      rendererRef.current = null;
    };
  }, []);

  const loadImage = (file: File): Promise<HTMLImageElement> => {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error('图片加载失败'));
      img.src = URL.createObjectURL(file);
    });
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;

    const remainingSlots = BATCH_MAX_IMAGES - batch.images.length;
    const filesToProcess = files.slice(0, remainingSlots);

    setError(null);
    const newImages: BatchImageItem[] = [];

    for (const file of filesToProcess) {
      if (!file.type.startsWith('image/')) continue;

      try {
        const img = await loadImage(file);
        newImages.push({
          id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
          file,
          name: file.name,
          image: img,
          width: img.naturalWidth,
          height: img.naturalHeight,
          status: 'pending',
          results: {},
        });
      } catch (err) {
        console.error(`Failed to load ${file.name}`, err);
      }
    }

    if (newImages.length > 0) {
      addBatchImages(newImages);
    }

    if (files.length > remainingSlots) {
      setError(`最多只能选择 ${BATCH_MAX_IMAGES} 张图片，已自动截取前 ${remainingSlots} 张。`);
    }

    if (hiddenInputRef.current) {
      hiddenInputRef.current.value = '';
    }
  };

  const processImage = async (
    imageItem: BatchImageItem,
    algorithm: Algorithm
  ): Promise<{ processTime: number; outputDataUrl: string } | null> => {
    if (!rendererRef.current || !imageItem.image) return null;

    try {
      await rendererRef.current.loadImage(imageItem.image);

      const renderParams = {
        ...batch.params,
        algorithm,
      };

      const processTime = rendererRef.current.render(renderParams);
      await new Promise(resolve => setTimeout(resolve, 50));

      const glCanvas = canvasRef.current;
      if (!glCanvas) return null;

      const outputDataUrl = exportToWebP(glCanvas, 0.9);

      return { processTime, outputDataUrl };
    } catch (err) {
      console.error(`Failed to process ${imageItem.name} with ${algorithm}`, err);
      return null;
    }
  };

  const startBatch = useCallback(async () => {
    if (batch.images.length === 0 || !rendererReady || batch.isProcessing) return;

    abortRef.current = false;
    setError(null);
    setBatchProcessing(true);
    setBatchParams(params);

    for (let imgIndex = 0; imgIndex < batch.images.length; imgIndex++) {
      if (abortRef.current) break;

      const imageItem = batch.images[imgIndex];
      setBatchCurrentIndex(imgIndex);
      updateBatchImage(imageItem.id, { status: 'processing' });

      let allSuccess = true;
      const newResults = { ...imageItem.results };

      for (const algorithm of ALGORITHMS) {
        if (abortRef.current) break;

        const result = await processImage(imageItem, algorithm);
        if (result) {
          newResults[algorithm] = result;

          const batchResult: BatchResult = {
            imageName: imageItem.name,
            imageWidth: imageItem.width,
            imageHeight: imageItem.height,
            algorithm,
            processTimeMs: result.processTime,
            parameters: { ...batch.params, algorithm },
            timestamp: Date.now(),
          };
          addBatchResult(batchResult);
        } else {
          allSuccess = false;
        }
      }

      updateBatchImage(imageItem.id, {
        status: allSuccess ? 'completed' : 'error',
        results: newResults,
        errorMessage: allSuccess ? undefined : '部分算法处理失败',
      });

      incrementBatchCompleted();
      await new Promise(resolve => setTimeout(resolve, 200));
    }

    setBatchProcessing(false);
    setBatchCurrentIndex(0);
  }, [batch.images, batch.isProcessing, batch.params, rendererReady, params, setBatchProcessing, setBatchCurrentIndex, updateBatchImage, addBatchResult, incrementBatchCompleted, setBatchParams]);

  const stopBatch = useCallback(() => {
    abortRef.current = true;
    setBatchProcessing(false);
  }, [setBatchProcessing]);

  const handleExportCSV = () => {
    if (batch.results.length === 0) {
      setError('暂无数据可导出。');
      return;
    }

    const csv = generateCSVReport(batch.results);
    const timestamp = new Date().toISOString().slice(0, 10);
    downloadCSV(csv, `边缘检测_对比报告_${timestamp}.csv`);
  };

  const handleExportSummaryCSV = () => {
    if (batch.results.length === 0) {
      setError('暂无数据可导出。');
      return;
    }

    const csv = generateSummaryCSV(batch.results);
    const timestamp = new Date().toISOString().slice(0, 10);
    downloadCSV(csv, `边缘检测_统计汇总_${timestamp}.csv`);
  };

  const handleExportAllResults = () => {
    const completedImages = batch.images.filter(img => img.status === 'completed');
    if (completedImages.length === 0) {
      setError('暂无处理结果可导出。');
      return;
    }

    for (const imageItem of completedImages) {
      for (const algorithm of ALGORITHMS) {
        const result = imageItem.results[algorithm];
        if (result?.outputDataUrl) {
          const link = document.createElement('a');
          link.href = result.outputDataUrl;
          link.download = `${imageItem.name.replace(/\.[^/.]+$/, '')}_${algorithm}.webp`;
          link.click();
        }
      }
    }
  };

  const getStatusIcon = (status: BatchImageItem['status']) => {
    switch (status) {
      case 'pending':
        return <Clock className="h-4 w-4 text-slate-400" />;
      case 'processing':
        return <Loader2 className="h-4 w-4 animate-spin text-cyan-400" />;
      case 'completed':
        return <CheckCircle2 className="h-4 w-4 text-green-400" />;
      case 'error':
        return <XCircle className="h-4 w-4 text-red-400" />;
    }
  };

  const progressPercent = batch.totalFiles > 0
    ? Math.round((batch.completedFiles / batch.totalFiles) * 100)
    : 0;

  return (
    <div className="flex h-full flex-col gap-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Layers className="h-5 w-5 text-purple-400" />
          <h3 className="text-lg font-medium text-slate-200">批处理模式</h3>
        </div>
        <button
          onClick={() => {
            resetBatch();
            setBatchMode(false);
          }}
          className="rounded-lg px-3 py-1.5 text-sm text-slate-400 transition-colors hover:bg-slate-700/50 hover:text-slate-300"
        >
          返回单图模式
        </button>
      </div>

      <canvas ref={canvasRef} className="hidden" width={512} height={512} />

      <input
        ref={hiddenInputRef}
        type="file"
        accept="image/*"
        multiple
        onChange={handleFileSelect}
        className="hidden"
      />

      {error && (
        <div className="flex items-center gap-2 rounded-lg bg-yellow-500/20 p-3 text-sm text-yellow-300">
          <AlertTriangle className="h-4 w-4" />
          {error}
          <button onClick={() => setError(null)} className="ml-auto">
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {batch.isProcessing && (
        <div className="rounded-xl border border-cyan-500/30 bg-cyan-500/10 p-4">
          <div className="mb-2 flex items-center justify-between text-sm">
            <span className="text-cyan-400">
              正在处理第 {batch.currentIndex + 1} / {batch.totalFiles} 张图片
            </span>
            <span className="font-mono text-cyan-300">{progressPercent}%</span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-slate-700">
            <div
              className="h-full bg-gradient-to-r from-cyan-500 to-purple-500 transition-all duration-300"
              style={{ width: `${progressPercent}%` }}
            />
          </div>
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        <button
          onClick={() => hiddenInputRef.current?.click()}
          disabled={batch.isProcessing || batch.images.length >= BATCH_MAX_IMAGES}
          className="flex items-center gap-2 rounded-lg border border-cyan-500/30 bg-cyan-500/10 px-4 py-2 text-sm text-cyan-400 transition-all hover:bg-cyan-500/20 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Upload className="h-4 w-4" />
          添加图片 ({batch.images.length}/{BATCH_MAX_IMAGES})
        </button>

        <button
          onClick={batch.isProcessing ? stopBatch : startBatch}
          disabled={batch.images.length === 0 || (!batch.isProcessing && !rendererReady)}
          className={`flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-all disabled:cursor-not-allowed disabled:opacity-50 ${
            batch.isProcessing
              ? 'bg-red-500/20 text-red-400 hover:bg-red-500/30'
              : 'bg-gradient-to-r from-cyan-500 to-purple-500 text-white hover:from-cyan-600 hover:to-purple-600'
          }`}
        >
          {batch.isProcessing ? (
            <>
              <Square className="h-4 w-4" />
              停止处理
            </>
          ) : (
            <>
              <Play className="h-4 w-4" />
              开始批处理
            </>
          )}
        </button>

        <button
          onClick={clearBatchImages}
          disabled={batch.isProcessing || batch.images.length === 0}
          className="flex items-center gap-2 rounded-lg border border-slate-600 px-4 py-2 text-sm text-slate-400 transition-all hover:bg-slate-700/50 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Trash2 className="h-4 w-4" />
          清空
        </button>

        {batch.results.length > 0 && (
          <>
            <button
              onClick={handleExportCSV}
              className="flex items-center gap-2 rounded-lg border border-purple-500/30 bg-purple-500/10 px-4 py-2 text-sm text-purple-400 transition-all hover:bg-purple-500/20"
            >
              <FileSpreadsheet className="h-4 w-4" />
              导出详细CSV
            </button>
            <button
              onClick={handleExportSummaryCSV}
              className="flex items-center gap-2 rounded-lg border border-purple-500/30 bg-purple-500/10 px-4 py-2 text-sm text-purple-400 transition-all hover:bg-purple-500/20"
            >
              <FileSpreadsheet className="h-4 w-4" />
              导出统计CSV
            </button>
            <button
              onClick={handleExportAllResults}
              className="flex items-center gap-2 rounded-lg border border-green-500/30 bg-green-500/10 px-4 py-2 text-sm text-green-400 transition-all hover:bg-green-500/20"
            >
              <Download className="h-4 w-4" />
              导出全部WebP
            </button>
          </>
        )}
      </div>

      <div className="flex-1 overflow-y-auto rounded-xl border border-slate-700/50 bg-slate-800/30">
        {batch.images.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center p-8 text-center">
            <FileImage className="mb-4 h-16 w-16 text-slate-500" />
            <h4 className="mb-2 text-lg font-medium text-slate-300">暂无图片</h4>
            <p className="text-sm text-slate-500">
              点击"添加图片"按钮选择最多 {BATCH_MAX_IMAGES} 张图片进行批处理
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-3 p-3">
            {batch.images.map((imageItem, idx) => (
              <div
                key={imageItem.id}
                className="group flex items-center gap-3 rounded-lg border border-slate-600/50 bg-slate-900/50 p-3 transition-colors hover:border-slate-500"
              >
                {imageItem.image && (
                  <img
                    src={imageItem.image.src}
                    alt={imageItem.name}
                    className="h-16 w-16 rounded object-cover"
                  />
                )}
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="truncate text-sm font-medium text-slate-200">
                      {idx + 1}. {imageItem.name}
                    </span>
                    {getStatusIcon(imageItem.status)}
                  </div>
                  <div className="mt-1 text-xs text-slate-500">
                    {imageItem.width} × {imageItem.height}
                  </div>
                  <div className="mt-1 flex gap-3">
                    {ALGORITHMS.map(algo => {
                      const result = imageItem.results[algo];
                      return (
                        <div key={algo} className="flex items-center gap-1 text-xs">
                          <span className="text-slate-500">{ALGORITHM_INFO[algo].name}:</span>
                          {result ? (
                            <span className="font-mono text-cyan-400">
                              {result.processTime.toFixed(1)}ms
                            </span>
                          ) : (
                            <span className="text-slate-600">—</span>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
                {!batch.isProcessing && (
                  <button
                    onClick={() => removeBatchImage(imageItem.id)}
                    className="rounded p-1 text-slate-500 opacity-0 transition-all hover:bg-red-500/20 hover:text-red-400 group-hover:opacity-100"
                  >
                    <X className="h-4 w-4" />
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {batch.results.length > 0 && (
        <div className="rounded-xl border border-purple-500/20 bg-purple-500/5 p-4">
          <h4 className="mb-3 text-sm font-medium text-purple-300">处理统计</h4>
          <div className="grid grid-cols-3 gap-3">
            {ALGORITHMS.map(algo => {
              const algoResults = batch.results.filter(r => r.algorithm === algo);
              if (algoResults.length === 0) return null;
              const times = algoResults.map(r => r.processTimeMs);
              const avg = times.reduce((a, b) => a + b, 0) / times.length;
              const total = times.reduce((a, b) => a + b, 0);
              return (
                <div key={algo} className="rounded-lg bg-slate-900/50 p-3">
                  <div className="text-xs text-slate-400">{ALGORITHM_INFO[algo].name}</div>
                  <div className="mt-1 font-mono text-lg text-cyan-400">
                    {avg.toFixed(1)}<span className="text-xs text-slate-500">ms avg</span>
                  </div>
                  <div className="text-xs text-slate-500">
                    {times.length}张, 总计 {total.toFixed(0)}ms
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
