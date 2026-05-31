import { History, RotateCcw, CheckSquare, Square, Clock, CheckCircle } from 'lucide-react'
import { useAppStore } from '../store/useAppStore'

export default function HistoryPanel() {
  const {
    history,
    selectedHistoryIds,
    isProcessing,
    toggleHistorySelection,
    selectAllHistory,
    clearHistorySelection,
  } = useAppStore()

  const handleBatchRevert = async () => {
    if (selectedHistoryIds.length === 0) return
  }

  if (history.length === 0) {
    return (
      <div className="glass rounded-xl h-full flex items-center justify-center">
        <div className="text-center text-dark-400">
          <History size={48} className="mx-auto mb-3 opacity-50" />
          <p>暂无重命名历史</p>
        </div>
      </div>
    )
  }

  return (
    <div className="glass rounded-xl h-full flex flex-col overflow-hidden">
      <div className="p-4 border-b border-primary-900/30 flex items-center justify-between">
        <h3 className="font-semibold text-dark-200 flex items-center gap-2">
          <Clock size={18} />
          重命名历史
        </h3>
        <div className="flex items-center gap-2">
          <button
            onClick={selectAllHistory}
            className="p-1.5 rounded hover:bg-dark-700/50 text-dark-400 hover:text-dark-200 transition-colors"
            title="全选可撤销项"
          >
            <CheckSquare size={18} />
          </button>
          <button
            onClick={clearHistorySelection}
            className="p-1.5 rounded hover:bg-dark-700/50 text-dark-400 hover:text-dark-200 transition-colors"
            title="取消选择"
          >
            <Square size={18} />
          </button>
        </div>
      </div>

      {selectedHistoryIds.length > 0 && (
        <div className="px-4 py-2 bg-accent-900/30 border-b border-primary-900/20 flex items-center justify-between">
          <span className="text-sm text-accent-300">
            已选择 {selectedHistoryIds.length} 项
          </span>
          <button
            onClick={handleBatchRevert}
            disabled={isProcessing}
            className="btn-accent text-white text-sm py-1 px-3 flex items-center gap-1"
          >
            <RotateCcw size={14} />
            批量撤销
          </button>
        </div>
      )}

      <div className="flex-1 overflow-y-auto p-2 space-y-2">
        {history.map((record) => (
          <div
            key={record.id}
            className={`p-3 rounded-lg border transition-all ${
              record.isReverted
                ? 'bg-dark-800/30 border-dark-700/30 opacity-60'
                : selectedHistoryIds.includes(record.id)
                ? 'bg-primary-900/30 border-primary-500/40'
                : 'bg-dark-800/50 border-dark-700/30 hover:border-dark-600/30'
            }`}
          >
            <div className="flex items-start gap-3">
              <button
                onClick={() => !record.isReverted && toggleHistorySelection(record.id)}
                className="mt-0.5 flex-shrink-0"
                disabled={record.isReverted}
              >
                {record.isReverted ? (
                  <div className="opacity-50 w-4" />
                ) : selectedHistoryIds.includes(record.id) ? (
                  <CheckSquare size={16} className="text-primary-400" />
                ) : (
                  <Square size={16} className="text-dark-500 hover:text-dark-400" />
                )}
              </button>
              
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <div className="text-xs font-mono text-dark-200 truncate flex-1">
                    {record.originalName}
                  </div>
                  <div className="text-primary-400">
                    →
                  </div>
                  <div className="text-xs font-mono text-accent-300 truncate flex-1">
                    {record.newName}
                  </div>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-xs text-dark-500">
                    {new Date(record.createdAt).toLocaleString('zh-CN')}
                  </span>
                  {record.isReverted ? (
                    <span className="text-xs text-dark-500 flex items-center gap-1">
                      <CheckCircle size={12} />
                      已撤销
                    </span>
                  ) : (
                    <button
                      onClick={() => toggleHistorySelection(record.id)}
                      className="text-xs text-accent-400 hover:text-accent-300 flex items-center gap-1 hover:underline"
                    >
                      <RotateCcw size={12} />
                      撤销
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
