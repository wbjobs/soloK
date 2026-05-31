import { useEffect, useState } from 'react';
import { History, Trash2, RotateCcw, Clock, AlertCircle } from 'lucide-react';
import { useAppStore } from '@/store/useAppStore';
import { ALGORITHM_INFO } from '@/types';
import { getRecords, deleteRecord, clearRecords } from '@/utils/indexedDB';
import { cn } from '@/lib/utils';

export default function HistoryPanel() {
  const { history, setHistory, addHistory, deleteHistory, clearHistory, setParams } =
    useAppStore();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  useEffect(() => {
    loadHistory();
  }, []);

  const loadHistory = async () => {
    try {
      setLoading(true);
      setError(null);
      const records = await getRecords();
      setHistory(records);
      records.forEach((record) => addHistory(record));
    } catch (e) {
      setError('加载历史记录失败。');
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id: number) => {
    try {
      await deleteRecord(id);
      deleteHistory(id);
      showSuccess('记录已删除');
    } catch (e) {
      setError('删除记录失败。');
    }
  };

  const handleClearAll = async () => {
    try {
      await clearRecords();
      clearHistory();
      setShowClearConfirm(false);
      showSuccess('所有记录已清除');
    } catch (e) {
      setError('清除记录失败。');
    }
  };

  const handleRestore = (record: { parameters: any }) => {
    setParams(record.parameters);
    showSuccess('参数已恢复');
  };

  const showSuccess = (msg: string) => {
    setSuccessMessage(msg);
    setTimeout(() => setSuccessMessage(null), 2000);
  };

  const formatTime = (timestamp: number) => {
    const date = new Date(timestamp);
    return date.toLocaleString('zh-CN', {
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const formatParams = (params: { kernelSize: any; lowThreshold: any; highThreshold: any; intensity: any }) => {
    return `核:${params.kernelSize} 低:${params.lowThreshold} 高:${params.highThreshold} 强度:${params.intensity}`;
  };

  if (loading) {
    return (
      <div className="flex h-48 items-center justify-center">
        <div className="text-slate-400">加载中...</div>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <History className="h-5 w-5 text-cyan-400" />
          <h3 className="text-lg font-medium text-slate-200">历史记录</h3>
        </div>
        {history.length > 0 && (
          <button
            onClick={() => setShowClearConfirm(true)}
            className="flex items-center gap-1 rounded-lg px-3 py-1.5 text-sm text-red-400 transition-colors hover:bg-red-500/10"
          >
            <Trash2 className="h-4 w-4" />
            清除全部
          </button>
        )}
      </div>

      {error && (
        <div className="mb-4 flex items-center gap-2 rounded-lg bg-red-500/20 p-3 text-sm text-red-300">
          <AlertCircle className="h-4 w-4" />
          {error}
        </div>
      )}

      {successMessage && (
        <div className="mb-4 rounded-lg bg-green-500/20 p-3 text-sm text-green-300">
          {successMessage}
        </div>
      )}

      {history.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center rounded-xl border border-dashed border-slate-600 p-8">
          <Clock className="mb-3 h-12 w-12 text-slate-500" />
          <p className="text-slate-400">暂无历史记录</p>
          <p className="mt-1 text-xs text-slate-500">保存处理结果后将显示在这里</p>
        </div>
      ) : (
        <div className="flex-1 space-y-3 overflow-y-auto pr-1">
          {history.map((record) => (
            <div
              key={record.id}
              className={cn(
                'group relative overflow-hidden rounded-xl border border-slate-700 bg-slate-800/50 p-3',
                'transition-all duration-200 hover:border-cyan-500/40 hover:bg-slate-800'
              )}
            >
              <div className="flex gap-3">
                <div className="relative h-20 w-20 flex-shrink-0 overflow-hidden rounded-lg bg-slate-900">
                  {record.thumbnail && (
                    <img
                      src={record.thumbnail}
                      alt="Thumbnail"
                      className="h-full w-full object-cover"
                    />
                  )}
                </div>
                <div className="flex min-w-0 flex-1 flex-col">
                  <div className="flex items-start justify-between">
                    <div>
                      <h4 className="font-medium text-cyan-400">
                        {ALGORITHM_INFO[record.algorithm].name}
                      </h4>
                      <div className="mt-0.5 flex items-center gap-1 text-xs text-slate-500">
                        <Clock className="h-3 w-3" />
                        {formatTime(record.timestamp)}
                      </div>
                    </div>
                    <div className="flex gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                      <button
                        onClick={() => handleRestore(record)}
                        className="tooltip rounded p-1.5 text-slate-400 transition-colors hover:bg-cyan-500/20 hover:text-cyan-400"
                        data-tip="恢复参数"
                      >
                        <RotateCcw className="h-4 w-4" />
                      </button>
                      <button
                        onClick={() => record.id && handleDelete(record.id)}
                        className="tooltip rounded p-1.5 text-slate-400 transition-colors hover:bg-red-500/20 hover:text-red-400"
                        data-tip="删除"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                  <p className="mt-1 truncate font-mono text-xs text-slate-400">
                    {formatParams(record.parameters)}
                  </p>
                  <p className="mt-1 text-xs text-slate-500">
                    {record.imageWidth} × {record.imageHeight}
                  </p>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {showClearConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="w-80 rounded-xl border border-slate-600 bg-slate-800 p-6 shadow-2xl">
            <h4 className="mb-2 text-lg font-medium text-slate-200">确认清除</h4>
            <p className="mb-6 text-sm text-slate-400">
              此操作将删除所有历史记录，无法恢复。确定继续吗？
            </p>
            <div className="flex justify-end gap-3">
              <button
                onClick={() => setShowClearConfirm(false)}
                className="rounded-lg px-4 py-2 text-sm text-slate-300 transition-colors hover:bg-slate-700"
              >
                取消
              </button>
              <button
                onClick={handleClearAll}
                className="rounded-lg bg-red-500 px-4 py-2 text-sm text-white transition-colors hover:bg-red-600"
              >
                确认清除
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
