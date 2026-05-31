import { useState } from 'react'
import {
  MousePointer2,
  Square,
  ArrowRight,
  Trash2,
  Move,
  ZoomIn,
  ZoomOut,
  Maximize2,
  Grid3X3,
  Palette,
  Undo2,
  Redo2,
  Camera,
  History
} from 'lucide-react'
import { useEditorStore, useHasSelection, useCanUndo, useCanRedo, type ToolMode } from '../../store/editorStore'
import { useNavigate } from 'react-router-dom'

interface ToolbarProps {
  roomId?: string
}

const TOOLS: { mode: ToolMode; icon: typeof MousePointer2; label: string }[] = [
  { mode: 'select', icon: MousePointer2, label: '选择' },
  { mode: 'node', icon: Square, label: '添加节点' },
  { mode: 'edge', icon: ArrowRight, label: '添加连线' },
  { mode: 'delete', icon: Trash2, label: '删除' },
  { mode: 'pan', icon: Move, label: '平移' },
]

export default function Toolbar({ roomId }: ToolbarProps) {
  const navigate = useNavigate()
  const [showStylePanel, setShowStylePanel] = useState(false)
  
  const toolMode = useEditorStore((state) => state.toolMode)
  const view = useEditorStore((state) => state.view)
  const setToolMode = useEditorStore((state) => state.setToolMode)
  const setView = useEditorStore((state) => state.setView)
  const fitView = useEditorStore((state) => state.fitView)
  const deleteSelection = useEditorStore((state) => state.deleteSelection)
  const undo = useEditorStore((state) => state.undo)
  const redo = useEditorStore((state) => state.redo)
  
  const hasSelection = useHasSelection()
  const canUndo = useCanUndo()
  const canRedo = useCanRedo()

  const handleZoomIn = () => {
    setView({ scale: Math.min(5, view.scale + 0.1) })
  }

  const handleZoomOut = () => {
    setView({ scale: Math.max(0.1, view.scale - 0.1) })
  }

  const handleResetZoom = () => {
    setView({ scale: 1 })
  }

  const handleFitView = () => {
    const nodes = Object.values(useEditorStore.getState().graphData.nodes)
    fitView(nodes)
  }

  const handleSnapshot = () => {
    alert('快照功能 - 保存当前图谱状态')
  }

  const handleHistory = () => {
    if (roomId) {
      navigate(`/rooms/${roomId}/history`)
    }
  }

  const handleDelete = () => {
    if (hasSelection) {
      deleteSelection()
    }
  }

  const handleUndo = () => {
    undo()
  }

  const handleRedo = () => {
    redo()
  }

  return (
    <div className="absolute left-4 top-1/2 -translate-y-1/2 z-10 flex flex-col gap-2">
      <div className="glass-card p-2 flex flex-col gap-1 animate-slide-in">
        {TOOLS.map(({ mode, icon: Icon, label }) => (
          <button
            key={mode}
            onClick={() => setToolMode(mode)}
            className={`
              w-10 h-10 flex items-center justify-center rounded-lg
              transition-all duration-200 group relative
              ${toolMode === mode ? 'tool-active' : 'glass glass-hover text-gray-400 hover:text-white'}
            `}
            title={label}
          >
            <Icon size={20} />
            <span className="absolute left-12 px-2 py-1 bg-dark-800 rounded text-xs
              opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap
              pointer-events-none border border-white/10">
              {label}
            </span>
          </button>
        ))}

        <div className="h-px bg-white/10 my-1" />

        <button
          onClick={handleUndo}
          disabled={!canUndo}
          className={`
            w-10 h-10 flex items-center justify-center rounded-lg
            transition-all duration-200 group relative
            ${canUndo ? 'glass glass-hover text-gray-400 hover:text-white' : 'opacity-30 cursor-not-allowed text-gray-600'}
          `}
          title="撤销"
        >
          <Undo2 size={20} />
        </button>

        <button
          onClick={handleRedo}
          disabled={!canRedo}
          className={`
            w-10 h-10 flex items-center justify-center rounded-lg
            transition-all duration-200 group relative
            ${canRedo ? 'glass glass-hover text-gray-400 hover:text-white' : 'opacity-30 cursor-not-allowed text-gray-600'}
          `}
          title="重做"
        >
          <Redo2 size={20} />
        </button>

        {hasSelection && (
          <button
            onClick={handleDelete}
            className="w-10 h-10 flex items-center justify-center rounded-lg
              glass-hover text-red-400 hover:text-red-300 transition-all duration-200
              bg-red-500/10 border border-red-500/30"
            title="删除选中"
          >
            <Trash2 size={20} />
          </button>
        )}
      </div>

      <div className="glass-card p-2 flex flex-col gap-1 animate-slide-in" style={{ animationDelay: '0.1s' }}>
        <button
          onClick={handleZoomIn}
          className="w-10 h-10 flex items-center justify-center rounded-lg
            glass glass-hover text-gray-400 hover:text-white transition-all duration-200
            group relative"
          title="放大"
        >
          <ZoomIn size={20} />
        </button>

        <div className="text-center text-xs text-gray-500 py-1 font-mono">
          {Math.round(view.scale * 100)}%
        </div>

        <button
          onClick={handleZoomOut}
          className="w-10 h-10 flex items-center justify-center rounded-lg
            glass glass-hover text-gray-400 hover:text-white transition-all duration-200"
          title="缩小"
        >
          <ZoomOut size={20} />
        </button>

        <button
          onClick={handleResetZoom}
          className="w-10 h-10 flex items-center justify-center rounded-lg
            glass glass-hover text-gray-400 hover:text-white transition-all duration-200"
          title="100%"
        >
          <Grid3X3 size={20} />
        </button>

        <button
          onClick={handleFitView}
          className="w-10 h-10 flex items-center justify-center rounded-lg
            glass glass-hover text-gray-400 hover:text-white transition-all duration-200"
          title="适应视图"
        >
          <Maximize2 size={20} />
        </button>
      </div>

      <div className="glass-card p-2 flex flex-col gap-1 animate-slide-in" style={{ animationDelay: '0.2s' }}>
        <button
          onClick={handleSnapshot}
          className="w-10 h-10 flex items-center justify-center rounded-lg
            glass glass-hover text-neon-cyan hover:text-neon-blue transition-all duration-200
            group relative"
          title="创建快照"
        >
          <Camera size={20} />
        </button>

        <button
          onClick={handleHistory}
          className="w-10 h-10 flex items-center justify-center rounded-lg
            glass glass-hover text-neon-purple hover:text-neon-pink transition-all duration-200"
          title="历史回放"
        >
          <History size={20} />
        </button>

        <button
          onClick={() => setShowStylePanel(!showStylePanel)}
          className={`
            w-10 h-10 flex items-center justify-center rounded-lg
            transition-all duration-200
            ${showStylePanel ? 'tool-active' : 'glass glass-hover text-gray-400 hover:text-white'}
          `}
          title="样式切换"
        >
          <Palette size={20} />
        </button>
      </div>

      {showStylePanel && (
        <div className="glass-card p-3 animate-scale-in" style={{ animationDelay: '0s' }}>
          <h4 className="text-sm font-medium text-neon-blue mb-3">样式设置</h4>
          <div className="space-y-3">
            <div>
              <label className="text-xs text-gray-400 block mb-1">节点圆角</label>
              <input
                type="range"
                min="0"
                max="20"
                defaultValue="8"
                className="w-full accent-neon-blue"
              />
            </div>
            <div>
              <label className="text-xs text-gray-400 block mb-1">连线宽度</label>
              <input
                type="range"
                min="1"
                max="5"
                defaultValue="2"
                className="w-full accent-neon-purple"
              />
            </div>
            <div>
              <label className="text-xs text-gray-400 block mb-1">发光强度</label>
              <input
                type="range"
                min="0"
                max="30"
                defaultValue="15"
                className="w-full accent-neon-pink"
              />
            </div>
            <div className="pt-2 border-t border-white/10">
              <label className="flex items-center gap-2 text-sm text-gray-300 cursor-pointer">
                <input type="checkbox" defaultChecked className="accent-neon-blue" />
                显示网格
              </label>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
