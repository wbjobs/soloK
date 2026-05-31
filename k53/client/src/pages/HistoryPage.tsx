import { useState, useEffect, useRef, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { 
  ArrowLeft, Play, Pause, SkipBack, SkipForward, 
  Clock, Users, GitBranch, Download, RotateCcw,
  ChevronLeft, ChevronRight, Loader2
} from 'lucide-react'
import { apiClient } from '../api/client'
import type { ReplayFrame, Operation } from '../types/api'
import type { GraphData } from '../types/graph'
import dayjs from 'dayjs'

export default function HistoryPage() {
  const { roomId } = useParams<{ roomId: string }>()
  const navigate = useNavigate()
  const canvasRef = useRef<HTMLCanvasElement>(null)
  
  const [isLoading, setIsLoading] = useState(true)
  const [frames, setFrames] = useState<ReplayFrame[]>([])
  const [currentFrameIndex, setCurrentFrameIndex] = useState(0)
  const [isPlaying, setIsPlaying] = useState(false)
  const [playbackSpeed, setPlaybackSpeed] = useState(1)
  const [error, setError] = useState<string | null>(null)
  const [currentGraphData, setCurrentGraphData] = useState<GraphData | null>(null)
  const [selectedOperation, setSelectedOperation] = useState<Operation | null>(null)
  
  const animationRef = useRef<number | null>(null)
  const lastTimeRef = useRef<number>(0)

  useEffect(() => {
    if (!roomId) return
    loadReplayData()
    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current)
      }
    }
  }, [roomId])

  useEffect(() => {
    if (frames.length > 0) {
      const frame = frames[currentFrameIndex]
      if (frame) {
        setCurrentGraphData(frame.state)
        setSelectedOperation(frame.operation)
      }
    }
  }, [currentFrameIndex, frames])

  useEffect(() => {
    if (currentGraphData && canvasRef.current) {
      renderGraph(currentGraphData)
    }
  }, [currentGraphData])

  const loadReplayData = async () => {
    try {
      setIsLoading(true)
      setError(null)
      
      const response = await apiClient.replayOperations(roomId!)
      
      if (response.success && response.data) {
        setFrames(response.data.frames)
        if (response.data.frames.length > 0) {
          setCurrentFrameIndex(0)
          setCurrentGraphData(response.data.frames[0].state)
          setSelectedOperation(response.data.frames[0].operation)
        }
      } else {
        setError(response.error?.message || '加载历史数据失败')
      }
    } catch (err) {
      setError('网络错误，请稍后重试')
    } finally {
      setIsLoading(false)
    }
  }

  const renderGraph = useCallback((data: GraphData) => {
    const canvas = canvasRef.current
    if (!canvas) return

    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const { width, height } = canvas
    ctx.clearRect(0, 0, width, height)

    ctx.fillStyle = '#0a0a0f'
    ctx.fillRect(0, 0, width, height)

    const gridSize = 20
    ctx.strokeStyle = 'rgba(0, 212, 255, 0.05)'
    ctx.lineWidth = 1
    ctx.beginPath()
    for (let x = 0; x < width; x += gridSize) {
      ctx.moveTo(x, 0)
      ctx.lineTo(x, height)
    }
    for (let y = 0; y < height; y += gridSize) {
      ctx.moveTo(0, y)
      ctx.lineTo(width, y)
    }
    ctx.stroke()

    const nodes = Object.values(data.nodes)
    const edges = Object.values(data.edges)

    if (nodes.length === 0) return

    let minX = Infinity, minY = Infinity
    let maxX = -Infinity, maxY = -Infinity
    nodes.forEach(node => {
      minX = Math.min(minX, node.x)
      minY = Math.min(minY, node.y)
      maxX = Math.max(maxX, node.x + node.width)
      maxY = Math.max(maxY, node.y + node.height)
    })

    const padding = 100
    const contentWidth = maxX - minX
    const contentHeight = maxY - minY
    const scaleX = (width - padding * 2) / contentWidth
    const scaleY = (height - padding * 2) / contentHeight
    const scale = Math.min(scaleX, scaleY, 1)

    const offsetX = width / 2 - (minX + contentWidth / 2) * scale
    const offsetY = height / 2 - (minY + contentHeight / 2) * scale

    const toScreen = (x: number, y: number) => ({
      x: x * scale + offsetX,
      y: y * scale + offsetY
    })

    edges.forEach(edge => {
      const sourceNode = data.nodes[edge.source]
      const targetNode = data.nodes[edge.target]
      if (!sourceNode || !targetNode) return

      const source = toScreen(
        sourceNode.x + sourceNode.width / 2,
        sourceNode.y + sourceNode.height / 2
      )
      const target = toScreen(
        targetNode.x + targetNode.width / 2,
        targetNode.y + targetNode.height / 2
      )

      const gradient = ctx.createLinearGradient(source.x, source.y, target.x, target.y)
      gradient.addColorStop(0, edge.color || '#00d4ff')
      gradient.addColorStop(1, '#a855f7')

      ctx.strokeStyle = gradient
      ctx.lineWidth = 2 * scale
      ctx.lineCap = 'round'
      
      if (edge.style === 'dashed') {
        ctx.setLineDash([8 * scale, 4 * scale])
      } else if (edge.style === 'dotted') {
        ctx.setLineDash([2 * scale, 4 * scale])
      } else {
        ctx.setLineDash([])
      }

      ctx.beginPath()
      ctx.moveTo(source.x, source.y)
      ctx.lineTo(target.x, target.y)
      ctx.stroke()

      const angle = Math.atan2(target.y - source.y, target.x - source.x)
      const arrowSize = 10 * scale
      
      ctx.fillStyle = edge.color || '#00d4ff'
      ctx.beginPath()
      ctx.moveTo(target.x, target.y)
      ctx.lineTo(
        target.x - arrowSize * Math.cos(angle - Math.PI / 6),
        target.y - arrowSize * Math.sin(angle - Math.PI / 6)
      )
      ctx.lineTo(
        target.x - arrowSize * Math.cos(angle + Math.PI / 6),
        target.y - arrowSize * Math.sin(angle + Math.PI / 6)
      )
      ctx.closePath()
      ctx.fill()

      if (edge.label) {
        const midX = (source.x + target.x) / 2
        const midY = (source.y + target.y) / 2
        
        ctx.save()
        ctx.fillStyle = 'rgba(15, 15, 26, 0.9)'
        const textWidth = ctx.measureText(edge.label).width
        ctx.fillRect(midX - textWidth / 2 - 8, midY - 10, textWidth + 16, 20)
        ctx.strokeStyle = 'rgba(0, 212, 255, 0.3)'
        ctx.lineWidth = 1
        ctx.strokeRect(midX - textWidth / 2 - 8, midY - 10, textWidth + 16, 20)
        
        ctx.fillStyle = '#ffffff'
        ctx.font = `${12 * scale}px sans-serif`
        ctx.textAlign = 'center'
        ctx.textBaseline = 'middle'
        ctx.fillText(edge.label, midX, midY)
        ctx.restore()
      }
    })

    ctx.setLineDash([])

    nodes.forEach(node => {
      const pos = toScreen(node.x, node.y)
      const w = node.width * scale
      const h = node.height * scale

      ctx.shadowColor = node.color
      ctx.shadowBlur = 15 * scale

      const gradient = ctx.createLinearGradient(pos.x, pos.y, pos.x + w, pos.y + h)
      gradient.addColorStop(0, node.color + '33')
      gradient.addColorStop(1, node.color + '11')
      ctx.fillStyle = gradient

      ctx.beginPath()
      const radius = 8 * scale
      ctx.roundRect(pos.x, pos.y, w, h, radius)
      ctx.fill()

      ctx.strokeStyle = node.color
      ctx.lineWidth = 2 * scale
      ctx.stroke()

      ctx.shadowBlur = 0

      ctx.fillStyle = '#ffffff'
      ctx.font = `${Math.max(12, 14 * scale)}px sans-serif`
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillText(node.label, pos.x + w / 2, pos.y + h / 2)
    })
  }, [])

  const play = useCallback(() => {
    if (currentFrameIndex >= frames.length - 1) {
      setCurrentFrameIndex(0)
    }
    setIsPlaying(true)
    lastTimeRef.current = performance.now()
  }, [currentFrameIndex, frames.length])

  const pause = useCallback(() => {
    setIsPlaying(false)
    if (animationRef.current) {
      cancelAnimationFrame(animationRef.current)
    }
  }, [])

  useEffect(() => {
    if (!isPlaying) return

    const animate = (currentTime: number) => {
      const delta = currentTime - lastTimeRef.current
      const frameInterval = 500 / playbackSpeed

      if (delta >= frameInterval) {
        setCurrentFrameIndex(prev => {
          if (prev >= frames.length - 1) {
            setIsPlaying(false)
            return prev
          }
          return prev + 1
        })
        lastTimeRef.current = currentTime
      }

      animationRef.current = requestAnimationFrame(animate)
    }

    animationRef.current = requestAnimationFrame(animate)

    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current)
      }
    }
  }, [isPlaying, playbackSpeed, frames.length])

  const handleResize = useCallback(() => {
    const canvas = canvasRef.current
    const container = canvas?.parentElement
    if (canvas && container) {
      canvas.width = container.clientWidth
      canvas.height = container.clientHeight
      if (currentGraphData) {
        renderGraph(currentGraphData)
      }
    }
  }, [currentGraphData, renderGraph])

  useEffect(() => {
    handleResize()
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [handleResize])

  const getOperationLabel = (op: Operation) => {
    const typeMap: Record<string, string> = {
      'node:add': '添加节点',
      'node:update': '更新节点',
      'node:remove': '删除节点',
      'edge:add': '添加连线',
      'edge:update': '更新连线',
      'edge:remove': '删除连线',
    }
    return typeMap[op.operationType] || op.operationType
  }

  const handleExport = () => {
    if (frames.length === 0) return
    const data = JSON.stringify(frames, null, 2)
    const blob = new Blob([data], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `history-${roomId}-${dayjs().format('YYYY-MM-DD')}.json`
    a.click()
    URL.revokeObjectURL(url)
  }

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-dark-900">
        <div className="text-center">
          <Loader2 className="w-12 h-12 text-neon-blue animate-spin mx-auto mb-4" />
          <p className="text-gray-400">正在加载历史数据...</p>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-dark-900">
        <div className="text-center glass-card p-8 max-w-md">
          <RotateCcw className="w-16 h-16 text-red-400 mx-auto mb-4" />
          <h2 className="text-xl font-bold text-white mb-2">加载失败</h2>
          <p className="text-gray-400 mb-6">{error}</p>
          <div className="flex gap-3 justify-center">
            <button
              onClick={() => navigate(`/rooms/${roomId}`)}
              className="btn-secondary"
            >
              返回编辑器
            </button>
            <button
              onClick={loadReplayData}
              className="btn-primary"
            >
              重新加载
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="h-screen flex flex-col bg-dark-900 overflow-hidden">
      <header className="h-14 px-4 flex items-center justify-between border-b border-white/10 bg-dark-800/80 backdrop-blur-sm z-20">
        <div className="flex items-center gap-4">
          <button
            onClick={() => navigate(`/rooms/${roomId}`)}
            className="w-9 h-9 flex items-center justify-center rounded-lg text-gray-400 hover:text-white hover:bg-white/10 transition-all"
          >
            <ArrowLeft size={20} />
          </button>
          
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-neon-purple to-neon-pink flex items-center justify-center">
              <Clock className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="font-semibold text-white text-sm leading-tight">历史回放</h1>
              <p className="text-xs text-gray-400">
                共 {frames.length} 条操作记录
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg glass">
            <GitBranch className="w-4 h-4 text-neon-blue" />
            <span className="text-xs text-gray-300">
              房间: {roomId?.slice(0, 8)}...
            </span>
          </div>

          <button
            onClick={handleExport}
            className="btn-secondary px-3 py-1.5 text-sm flex items-center gap-2"
            disabled={frames.length === 0}
          >
            <Download size={14} />
            导出
          </button>
        </div>
      </header>

      <div className="flex-1 flex overflow-hidden">
        <div className="flex-1 relative">
          <canvas
            ref={canvasRef}
            className="absolute inset-0"
          />

          {frames.length === 0 && (
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="text-center">
                <Clock className="w-16 h-16 text-gray-600 mx-auto mb-4" />
                <p className="text-gray-400 text-lg">暂无操作记录</p>
                <p className="text-gray-500 text-sm mt-2">在编辑器中进行操作后会生成历史记录</p>
              </div>
            </div>
          )}

          {selectedOperation && (
            <div className="absolute top-4 left-4 right-4 glass-card p-4">
              <div className="flex items-start justify-between">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <span className="px-2 py-0.5 rounded text-xs font-medium bg-neon-blue/20 text-neon-blue">
                      {getOperationLabel(selectedOperation)}
                    </span>
                    <span className="text-xs text-gray-400">
                      版本 {selectedOperation.version}
                    </span>
                  </div>
                  <p className="text-sm text-gray-300">
                    成员: {selectedOperation.memberId.slice(0, 8)}
                  </p>
                </div>
                <div className="text-xs text-gray-500">
                  {dayjs(selectedOperation.createdAt).format('YYYY-MM-DD HH:mm:ss')}
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="w-80 border-l border-white/10 flex flex-col bg-dark-800/50">
          <div className="p-4 border-b border-white/10">
            <h3 className="font-semibold text-white mb-2 flex items-center gap-2">
              <Users size={16} className="text-neon-cyan" />
              操作时间线
            </h3>
            <p className="text-xs text-gray-400">
              进度: {currentFrameIndex + 1} / {frames.length}
            </p>
          </div>

          <div className="flex-1 overflow-y-auto scrollbar-thin p-2">
            <div className="space-y-1">
              {frames.map((frame, index) => (
                <button
                  key={index}
                  onClick={() => setCurrentFrameIndex(index)}
                  className={`
                    w-full p-3 rounded-lg text-left transition-all duration-200
                    ${currentFrameIndex === index 
                      ? 'bg-neon-blue/20 border border-neon-blue/50' 
                      : 'hover:bg-white/5 border border-transparent'}
                  `}
                >
                  <div className="flex items-center gap-3">
                    <div className={`
                      w-6 h-6 rounded-full flex items-center justify-center text-xs font-medium flex-shrink-0
                      ${currentFrameIndex === index 
                        ? 'bg-neon-blue text-white' 
                        : currentFrameIndex > index 
                          ? 'bg-neon-green/20 text-neon-green'
                          : 'bg-white/10 text-gray-400'}
                    `}>
                      {index + 1}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium text-white truncate">
                        {getOperationLabel(frame.operation)}
                      </div>
                      <div className="text-xs text-gray-500">
                        {dayjs(frame.operation.createdAt).format('HH:mm:ss')}
                      </div>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      <footer className="h-20 px-6 border-t border-white/10 bg-dark-800/80 backdrop-blur-sm flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button
            onClick={() => setCurrentFrameIndex(0)}
            className="w-10 h-10 flex items-center justify-center rounded-lg text-gray-400 hover:text-white hover:bg-white/10 transition-all"
            disabled={frames.length === 0}
          >
            <SkipBack size={20} />
          </button>

          <button
            onClick={() => setCurrentFrameIndex(prev => Math.max(0, prev - 1))}
            className="w-10 h-10 flex items-center justify-center rounded-lg text-gray-400 hover:text-white hover:bg-white/10 transition-all"
            disabled={currentFrameIndex === 0 || frames.length === 0}
          >
            <ChevronLeft size={20} />
          </button>

          <button
            onClick={isPlaying ? pause : play}
            className="w-14 h-14 flex items-center justify-center rounded-full bg-gradient-to-br from-neon-blue to-neon-purple text-white hover:scale-105 transition-transform disabled:opacity-50 disabled:cursor-not-allowed"
            disabled={frames.length === 0}
          >
            {isPlaying ? <Pause size={24} /> : <Play size={24} className="ml-1" />}
          </button>

          <button
            onClick={() => setCurrentFrameIndex(prev => Math.min(frames.length - 1, prev + 1))}
            className="w-10 h-10 flex items-center justify-center rounded-lg text-gray-400 hover:text-white hover:bg-white/10 transition-all"
            disabled={currentFrameIndex >= frames.length - 1 || frames.length === 0}
          >
            <ChevronRight size={20} />
          </button>

          <button
            onClick={() => setCurrentFrameIndex(frames.length - 1)}
            className="w-10 h-10 flex items-center justify-center rounded-lg text-gray-400 hover:text-white hover:bg-white/10 transition-all"
            disabled={frames.length === 0}
          >
            <SkipForward size={20} />
          </button>
        </div>

        <div className="flex-1 mx-8">
          <div className="relative">
            <input
              type="range"
              min="0"
              max={Math.max(0, frames.length - 1)}
              value={currentFrameIndex}
              onChange={(e) => setCurrentFrameIndex(Number(e.target.value))}
              className="w-full accent-neon-blue"
              disabled={frames.length === 0}
            />
          </div>
          <div className="flex justify-between mt-1 text-xs text-gray-500">
            <span>开始</span>
            <span>{dayjs(frames[0]?.operation.createdAt).format('HH:mm:ss')}</span>
            <span>{dayjs(frames[frames.length - 1]?.operation.createdAt).format('HH:mm:ss')}</span>
            <span>结束</span>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <span className="text-sm text-gray-400">速度:</span>
          <div className="flex gap-1">
            {[0.5, 1, 2, 4].map(speed => (
              <button
                key={speed}
                onClick={() => setPlaybackSpeed(speed)}
                className={`
                  px-3 py-1 rounded text-sm transition-all
                  ${playbackSpeed === speed 
                    ? 'bg-neon-blue/20 text-neon-blue border border-neon-blue/50' 
                    : 'text-gray-400 hover:text-white hover:bg-white/10'}
                `}
              >
                {speed}x
              </button>
            ))}
          </div>
        </div>
      </footer>
    </div>
  )
}
