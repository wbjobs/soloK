import { useEffect, useRef, useCallback } from 'react'
import { useCanvas } from '../../hooks/useCanvas'
import { useEditorStore, useRemoteCursors, useSelectedNodeIds, useSelectedEdgeIds } from '../../store/editorStore'
import type { CursorPosition } from '../../types/api'

interface CanvasProps {
  roomId?: string
}

export default function Canvas({ roomId: _roomId }: CanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const { canvasRef, isReady, setSize } = useCanvas()
  
  const remoteCursors = useRemoteCursors()
  const selectedNodeIds = useSelectedNodeIds()
  const selectedEdgeIds = useSelectedEdgeIds()
  const { graphData, edgeCreationSource, tempEdgeTarget, toolMode, view } = useEditorStore()

  const handleResize = useCallback(() => {
    if (containerRef.current) {
      const { width, height } = containerRef.current.getBoundingClientRect()
      setSize(width, height)
    }
  }, [setSize])

  useEffect(() => {
    handleResize()
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [handleResize])

  const renderRemoteCursors = () => {
    return remoteCursors.map((cursor: CursorPosition) => {
      const screenPos = {
        x: cursor.x * view.scale + view.offsetX,
        y: cursor.y * view.offsetY
      }
      
      return (
        <div
          key={cursor.userId}
          className="absolute pointer-events-none z-20"
          style={{
            left: screenPos.x,
            top: screenPos.y,
            transform: 'translate(-2px, -2px)'
          }}
        >
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
            <path
              d="M5 3L19 12L13 14L11 19L5 3Z"
              fill="#00d4ff"
              stroke="white"
              strokeWidth="1.5"
              style={{ filter: 'drop-shadow(0 0 4px #00d4ff)' }}
            />
          </svg>
        </div>
      )
    })
  }

  const renderTempEdge = () => {
    if (!edgeCreationSource || !tempEdgeTarget) return null
    
    const sourceNode = graphData.nodes[edgeCreationSource]
    if (!sourceNode) return null

    const sourceX = (sourceNode.x + sourceNode.width / 2) * view.scale + view.offsetX
    const sourceY = (sourceNode.y + sourceNode.height / 2) * view.scale + view.offsetY
    const targetX = tempEdgeTarget.x * view.scale + view.offsetX
    const targetY = tempEdgeTarget.y * view.scale + view.offsetY

    return (
      <svg
        className="absolute inset-0 pointer-events-none z-10"
        style={{ overflow: 'visible' }}
      >
        <defs>
          <linearGradient id="tempEdgeGradient" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#00d4ff" />
            <stop offset="100%" stopColor="#a855f7" />
          </linearGradient>
        </defs>
        <line
          x1={sourceX}
          y1={sourceY}
          x2={targetX}
          y2={targetY}
          stroke="url(#tempEdgeGradient)"
          strokeWidth="2"
          strokeDasharray="8,4"
          strokeLinecap="round"
          style={{
            filter: 'drop-shadow(0 0 8px #00d4ff)'
          }}
        />
        <circle
          cx={targetX}
          cy={targetY}
          r="6"
          fill="#a855f7"
          style={{
            filter: 'drop-shadow(0 0 8px #a855f7)'
          }}
        />
      </svg>
    )
  }

  const renderSelectionHighlights = () => {
    const elements: React.ReactElement[] = []

    selectedNodeIds.forEach(nodeId => {
      const node = graphData.nodes[nodeId]
      if (!node) return

      const x = node.x * view.scale + view.offsetX
      const y = node.y * view.scale + view.offsetY
      const width = node.width * view.scale
      const height = node.height * view.scale

      elements.push(
        <rect
          key={`node-highlight-${nodeId}`}
          x={x - 4}
          y={y - 4}
          width={width + 8}
          height={height + 8}
          rx="12"
          fill="none"
          stroke="#00d4ff"
          strokeWidth="2"
          strokeDasharray="4,2"
          style={{
            filter: 'drop-shadow(0 0 10px #00d4ff)'
          }}
        />
      )
    })

    selectedEdgeIds.forEach(edgeId => {
      const edge = graphData.edges[edgeId]
      if (!edge) return

      const sourceNode = graphData.nodes[edge.source]
      const targetNode = graphData.nodes[edge.target]
      if (!sourceNode || !targetNode) return

      const sourceX = (sourceNode.x + sourceNode.width / 2) * view.scale + view.offsetX
      const sourceY = (sourceNode.y + sourceNode.height / 2) * view.scale + view.offsetY
      const targetX = (targetNode.x + targetNode.width / 2) * view.scale + view.offsetX
      const targetY = (targetNode.y + targetNode.height / 2) * view.scale + view.offsetY

      elements.push(
        <line
          key={`edge-highlight-${edgeId}`}
          x1={sourceX}
          y1={sourceY}
          x2={targetX}
          y2={targetY}
          stroke="#00d4ff"
          strokeWidth="4"
          strokeLinecap="round"
          opacity="0.5"
          style={{
            filter: 'drop-shadow(0 0 8px #00d4ff)'
          }}
        />
      )
    })

    return elements
  }

  const getCursorStyle = () => {
    switch (toolMode) {
      case 'select': return 'default'
      case 'node': return 'crosshair'
      case 'edge': return 'crosshair'
      case 'delete': return 'not-allowed'
      case 'pan': return 'grab'
      default: return 'default'
    }
  }

  return (
    <div 
      ref={containerRef}
      className="relative w-full h-full overflow-hidden grid-bg"
      style={{ cursor: getCursorStyle() }}
    >
      <canvas
        ref={canvasRef}
        className="absolute inset-0"
      />
      
      <svg 
        className="absolute inset-0 pointer-events-none z-10"
        style={{ overflow: 'visible' }}
      >
        {renderSelectionHighlights()}
      </svg>

      {renderTempEdge()}
      
      {renderRemoteCursors()}

      {!isReady && (
        <div className="absolute inset-0 flex items-center justify-center bg-dark-900/80 backdrop-blur-sm">
          <div className="text-center">
            <div className="w-12 h-12 border-2 border-neon-blue border-t-transparent rounded-full animate-spin mx-auto mb-4" />
            <p className="text-gray-400">正在加载画布...</p>
          </div>
        </div>
      )}

      {isReady && Object.keys(graphData.nodes).length === 0 && toolMode === 'select' && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className="text-center animate-pulse-slow">
            <div className="w-20 h-20 mx-auto mb-4 rounded-full bg-gradient-to-br from-neon-blue/20 to-neon-purple/20 flex items-center justify-center border border-neon-blue/30">
              <svg className="w-10 h-10 text-neon-blue" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
              </svg>
            </div>
            <p className="text-gray-400 text-lg mb-2">开始创建你的知识图谱</p>
            <p className="text-gray-500 text-sm">点击左侧工具栏选择工具，或按 N 键添加节点</p>
          </div>
        </div>
      )}
    </div>
  )
}
