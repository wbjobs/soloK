import { useState, useMemo } from 'react';
import { Download, Save, ImageDown, CheckCircle, AlertCircle } from 'lucide-react';
import { useAppStore } from '@/store/useAppStore';
import { ALGORITHM_INFO, type HistoryRecord } from '@/types';
import { addRecord } from '@/utils/indexedDB';
import { exportToWebP, downloadDataURL, createThumbnail } from '@/utils/exportWebP';
import { cn } from '@/lib/utils';

export default function ExportPanel() {
  const { params, originalImage, processedThumbnail, addHistory } = useAppStore();
  const [quality, setQuality] = useState(0.8);
  const [fileName, setFileName] = useState('edge-detection');
  const [exporting, setExporting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const estimatedSize = useMemo(() => {
    if (!originalImage) return '0 KB';
    const pixels = originalImage.naturalWidth * originalImage.naturalHeight;
    const bytesPerPixel = quality * 0.5 + 0.1;
    const sizeKB = (pixels * bytesPerPixel) / 1024;
    return sizeKB > 1024 ? `${(sizeKB / 1024).toFixed(1)} MB` : `${sizeKB.toFixed(0)} KB`;
  }, [originalImage, quality]);

  const showSuccess = (msg: string) => {
    setSuccessMessage(msg);
    setTimeout(() => setSuccessMessage(null), 2000);
  };

  const getWebGLCanvas = (): HTMLCanvasElement | null => {
    return document.querySelector('#canvas-wrapper canvas') as HTMLCanvasElement | null;
  };

  const handleExport = async () => {
    if (!originalImage) {
      setError('请先上传图像。');
      return;
    }

    try {
      setExporting(true);
      setError(null);

      const webglCanvas = getWebGLCanvas();
      if (!webglCanvas) {
        setError('无法获取渲染结果。');
        return;
      }

      const dataUrl = exportToWebP(webglCanvas, quality);
      downloadDataURL(dataUrl, `${fileName}.webp`);
      showSuccess('导出成功！');
    } catch (e) {
      setError('导出失败，请重试。');
    } finally {
      setExporting(false);
    }
  };

  const handleSaveToHistory = async () => {
    if (!originalImage || !processedThumbnail) {
      setError('请先处理图像。');
      return;
    }

    try {
      setSaving(true);
      setError(null);

      const record: Omit<HistoryRecord, 'id'> = {
        algorithm: params.algorithm,
        thumbnail: processedThumbnail,
        parameters: { ...params },
        timestamp: Date.now(),
        imageWidth: originalImage.naturalWidth,
        imageHeight: originalImage.naturalHeight,
      };

      const id = await addRecord(record);
      addHistory({ ...record, id });
      showSuccess('已保存到历史记录！');
    } catch (e) {
      setError('保存失败，请重试。');
    } finally {
      setSaving(false);
    }
  };

  if (!originalImage) {
    return (
      <div className="rounded-xl border border-cyan-500/20 bg-slate-800/50 p-6">
        <div className="flex items-center gap-2 text-slate-400">
          <ImageDown className="h-5 w-5" />
          <span>上传图像后可使用导出功能</span>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5 rounded-xl border border-cyan-500/20 bg-slate-800/50 p-5">
      <div className="flex items-center gap-2">
        <Download className="h-5 w-5 text-cyan-400" />
        <h3 className="text-lg font-medium text-slate-200">导出设置</h3>
      </div>

      {error && (
        <div className="flex items-center gap-2 rounded-lg bg-red-500/20 p-3 text-sm text-red-300">
          <AlertCircle className="h-4 w-4" />
          {error}
        </div>
      )}

      {successMessage && (
        <div className="flex items-center gap-2 rounded-lg bg-green-500/20 p-3 text-sm text-green-300">
          <CheckCircle className="h-4 w-4" />
          {successMessage}
        </div>
      )}

      <div className="space-y-2">
        <label className="text-sm font-medium text-slate-300">文件名</label>
        <input
          type="text"
          value={fileName}
          onChange={(e) => setFileName(e.target.value)}
          className="w-full rounded-lg border border-slate-600 bg-slate-900 px-3 py-2 text-sm text-slate-200 transition-colors focus:border-cyan-500 focus:outline-none"
          placeholder="输入文件名"
        />
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <label className="text-sm font-medium text-slate-300">WebP 质量</label>
          <span className="font-mono text-sm text-cyan-400">{(quality * 100).toFixed(0)}%</span>
        </div>
        <input
          type="range"
          min="0.1"
          max="1.0"
          step="0.1"
          value={quality}
          onChange={(e) => setQuality(parseFloat(e.target.value))}
          className="w-full"
        />
        <div className="flex justify-between text-xs text-slate-500">
          <span>小文件</span>
          <span>高质量</span>
        </div>
      </div>

      <div className="rounded-lg bg-slate-900/50 p-3">
        <div className="flex items-center justify-between text-sm">
          <span className="text-slate-400">预估文件大小</span>
          <span className="font-mono text-cyan-400">~ {estimatedSize}</span>
        </div>
        <div className="mt-1 text-xs text-slate-500">
          算法: {ALGORITHM_INFO[params.algorithm].name}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3">
        <button
          onClick={handleExport}
          disabled={exporting}
          className={cn(
            'flex items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-medium transition-all',
            'bg-cyan-500 text-white hover:bg-cyan-600',
            'disabled:cursor-not-allowed disabled:opacity-50'
          )}
        >
          {exporting ? (
            <div className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
          ) : (
            <Download className="h-4 w-4" />
          )}
          导出 WebP
        </button>

        <button
          onClick={handleSaveToHistory}
          disabled={saving || !processedThumbnail}
          className={cn(
            'flex items-center justify-center gap-2 rounded-lg border px-4 py-2.5 text-sm font-medium transition-all',
            'border-cyan-500/30 text-cyan-400 hover:bg-cyan-500/10',
            'disabled:cursor-not-allowed disabled:opacity-50'
          )}
        >
          {saving ? (
            <div className="h-4 w-4 animate-spin rounded-full border-2 border-cyan-400/30 border-t-cyan-400" />
          ) : (
            <Save className="h-4 w-4" />
          )}
          保存到历史记录
        </button>
      </div>
    </div>
  );
}
