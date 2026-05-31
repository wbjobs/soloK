import { useRef, useEffect, useCallback, useMemo } from 'react'
import { Renderer } from '../canvas/Renderer'
import type { RendererOptions } from '../canvas/Renderer'
import { Viewport } from '../canvas/Viewport'
import { useEditorStore, type ToolMode } from '../store/editorStore'
import { useUserStore } from '../store/userStore'
import { NODE_COLORS, type GraphNode, type GraphEdge, type GraphData, type NodeType, type NodeUpdatePayload, type EdgeUpdatePayload } from '../types/graph'

interface UseCanvasOptions extends Partial<RendererOptions> {
  crdt?: {
    addNode: (nodeData: Omit<GraphNode, 'id' | 'createdAt' | 'updatedAt'> & { id?: string }) => unknown
    updateNode: (nodeId: string, updates: NodeUpdatePayload) => unknown
    deleteNode: (nodeId: string) => unknown
    addEdge: (edgeData: Omit<GraphEdge, 'id' | 'createdAt' | 'updatedAt'> & { id?: string }) => unknown
    updateEdge: (edgeId: string, updates: EdgeUpdatePayload) => unknown
    deleteEdge: (edgeId: string) => unknown
    isReady: boolean
  }
  webrtc?: {
    sendCursor: (cursor: { userId: string; x: number; y: number; timestamp: number }) => void
    sendSelection: (selection: { userId: string; selectedNodeIds: string[]; selectedEdgeIds: string[]; timestamp: number }) => void
    sendDragLock: (payload: { nodeId: string; userId: string; userName: string; timestamp: number; x: number; y: number }) => void
    sendDragUnlock: (payload: { nodeId: string; userId: string; timestamp: number; finalX: number; finalY: number }) => void
    sendDragPosition: (payload: { nodeId: string; userId: string; timestamp: number; x: number; y: number }) => void
    isConnected: boolean
  }
}

interface UseCanvasResult {
  canvasRef: React.RefObject<HTMLCanvasElement | null>
  renderer: Renderer | null
  viewport: Viewport | null

  isReady: boolean
  toolMode: ToolMode

  setData: (data: GraphData) => void
  addNode: (node: GraphNode) => void
  updateNode: (nodeId: string, updates: Partial<GraphNode>) => void
  removeNode: (nodeId: string) => void
  addEdge: (edge: GraphEdge) => void
  updateEdge: (edgeId: string, updates: Partial<GraphEdge>) => void
  removeEdge: (edgeId: string) => void

  select: (ids: string[]) => void
  clearSelection: () => void
  deleteSelection: () => void

  fitView: () => void
  resetView: () => void
  setSize: (width: number, height: number) => void
  getRenderer: () => Renderer | null

  createNodeAt: (worldX: number, worldY: number, type?: NodeType) => GraphNode | null
  startEdgeCreation: (sourceNodeId: string) => void
  cancelEdgeCreation: () => void
  completeEdgeCreation: (targetNodeId: string) => GraphEdge | null

  undo: () => void
  redo: () => void
  canUndo: boolean
  canRedo: boolean
}

function throttle<T extends (...args: any[]) => void>(fn: T, delay: number): T {
  let lastCall = 0
  let timeoutId: ReturnType<typeof setTimeout> | null = null
  let lastArgs: any[] | null = null

  const throttled = function (this: any, ...args: any[]) {
    const now = Date.now()
    const remaining = delay - (now - lastCall)

    if (remaining <= 0) {
      if (timeoutId) {
        clearTimeout(timeoutId)
        timeoutId = null
      }
      lastCall = now
      fn.apply(this, args)
    } else {
      lastArgs = args
      if (!timeoutId) {
        timeoutId = setTimeout(() => {
          lastCall = Date.now()
          timeoutId = null
          if (lastArgs) {
            fn.apply(this, lastArgs)
          }
        }, remaining)
      }
    }
  } as T

  return throttled
}

export function useCanvas(options: UseCanvasOptions = {}): UseCanvasResult {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const rendererRef = useRef<Renderer | null>(null)
  const viewportRef = useRef<Viewport | null>(null)

  const dragStateRef = useRef<{
    isDragging: boolean
    nodeId: string | null
    hasLock: boolean
    throttledUpdate: ((nodeId: string, x: number, y: number) => void) | null
    throttledPosition: ((nodeId: string, x: number, y: number) => void) | null
  }>({
    isDragging: false,
    nodeId: null,
    hasLock: false,
    throttledUpdate: null,
    throttledPosition: null
  })

  const { crdt, webrtc, ...rendererOptions } = options

  const {
    graphData,
    selection,
    toolMode,
    view,
    edgeCreationSource,
    history,

    setGraphData,
    addNode: addNodeToStore,
    updateNode: updateNodeInStore,
    removeNode: removeNodeFromStore,
    addEdge: addEdgeToStore,
    updateEdge: updateEdgeInStore,
    removeEdge: removeEdgeFromStore,
    selectNode,
    clearSelection: clearSelectionInStore,
    deleteSelection: deleteSelectionInStore,
    setToolMode,
    setView,
    setDragging,
    startEdgeCreation: startEdgeCreationInStore,
    updateTempEdgeTarget,
    cancelEdgeCreation: cancelEdgeCreationInStore,
    completeEdgeCreation: completeEdgeCreationInStore,
    undo: undoFromStore,
    redo: redoFromStore
  } = useEditorStore()

  const user = useUserStore((state) => state.user)
  const preferences = useUserStore((state) => state.preferences)

  const canUndo = history.past.length > 0
  const canRedo = history.future.length > 0

  const userId = user?.id || 'local'

  const getNodeAtPoint = useCallback((worldX: number, worldY: number): GraphNode | null => {
    if (!rendererRef.current || !viewportRef.current) return null

    for (const node of Object.values(graphData.nodes)) {
      if (
        worldX >= node.x &&
        worldX <= node.x + node.width &&
        worldY >= node.y &&
        worldY <= node.y + node.height
      ) {
        return node
      }
    }
    return null
  }, [graphData.nodes])

  const createNodeAt = useCallback((worldX: number, worldY: number, type: NodeType = preferences.defaultNodeType): GraphNode | null => {
    const nodeColors: Record<NodeType, string> = {
      concept: '#3b82f6',
      topic: '#10b981',
      note: '#f59e0b',
      resource: '#8b5cf6'
    }

    const nodeData = {
      x: worldX - 75,
      y: worldY - 30,
      width: 150,
      height: 60,
      label: '新节点',
      color: nodeColors[type] || NODE_COLORS.concept,
      type,
      metadata: {}
    }

    if (crdt?.isReady && crdt.addNode) {
      crdt.addNode(nodeData)
      const id = crypto.randomUUID()
      return {
        ...nodeData,
        id,
        createdAt: Date.now(),
        updatedAt: Date.now()
      }
    }

    const node: GraphNode = {
      ...nodeData,
      id: crypto.randomUUID(),
      createdAt: Date.now(),
      updatedAt: Date.now()
    }

    addNodeToStore(node)
    rendererRef.current?.addNode(node)

    return node
  }, [crdt, preferences.defaultNodeType, addNodeToStore])

  const handleCanvasClick = useCallback((e: MouseEvent) => {
    if (!canvasRef.current || !viewportRef.current) return

    const rect = canvasRef.current.getBoundingClientRect()
    const screenX = e.clientX - rect.left
    const screenY = e.clientY - rect.top
    const worldPos = viewportRef.current.screenToWorld(screenX, screenY)

    const clickedNode = getNodeAtPoint(worldPos.x, worldPos.y)

    if (toolMode === 'node' && !clickedNode) {
      createNodeAt(worldPos.x, worldPos.y)
      setToolMode('select')
      return
    }

    if (toolMode === 'edge' && clickedNode && edgeCreationSource) {
      if (clickedNode.id !== edgeCreationSource) {
        completeEdgeCreationInStore(clickedNode.id)
      } else {
        cancelEdgeCreationInStore()
      }
      return
    }

    if (toolMode === 'edge' && clickedNode && !edgeCreationSource) {
      startEdgeCreationInStore(clickedNode.id)
      return
    }

    if (toolMode === 'edge' && !clickedNode) {
      cancelEdgeCreationInStore()
      return
    }

    if (toolMode === 'delete') {
      if (clickedNode) {
        if (crdt?.isReady && crdt.deleteNode) {
          crdt.deleteNode(clickedNode.id)
        } else {
          removeNodeFromStore(clickedNode.id)
          rendererRef.current?.removeNode(clickedNode.id)
        }
      }
      return
    }

    if (toolMode === 'select' && !clickedNode) {
      clearSelectionInStore()
      rendererRef.current?.clearSelection()

      if (webrtc?.isConnected && webrtc.sendSelection) {
        webrtc.sendSelection({
          userId,
          selectedNodeIds: [],
          selectedEdgeIds: [],
          timestamp: Date.now()
        })
      }
    }
  }, [toolMode, edgeCreationSource, getNodeAtPoint, createNodeAt, setToolMode,
      startEdgeCreationInStore, completeEdgeCreationInStore, cancelEdgeCreationInStore,
      clearSelectionInStore, removeNodeFromStore, crdt, webrtc, userId])

  const handleNodeClick = useCallback((node: GraphNode, e: MouseEvent) => {
    if (toolMode === 'delete') {
      if (crdt?.isReady && crdt.deleteNode) {
        crdt.deleteNode(node.id)
      } else {
        removeNodeFromStore(node.id)
        rendererRef.current?.removeNode(node.id)
      }
      return
    }

    if (toolMode === 'edge' && !edgeCreationSource) {
      startEdgeCreationInStore(node.id)
      return
    }

    if (toolMode === 'edge' && edgeCreationSource) {
      if (node.id !== edgeCreationSource) {
        const edge = completeEdgeCreationInStore(node.id)
        if (edge && crdt?.isReady && crdt.addEdge) {
          crdt.addEdge({
            source: edge.source,
            target: edge.target,
            style: edge.style,
            color: edge.color,
            label: edge.label,
            metadata: edge.metadata
          })
        }
      } else {
        cancelEdgeCreationInStore()
      }
      return
    }

    selectNode(node.id, e.shiftKey)
    rendererRef.current?.select([
      ...useEditorStore.getState().selection.selectedNodeIds,
      ...useEditorStore.getState().selection.selectedEdgeIds
    ])

    if (webrtc?.isConnected && webrtc.sendSelection) {
      const state = useEditorStore.getState()
      webrtc.sendSelection({
        userId,
        selectedNodeIds: state.selection.selectedNodeIds,
        selectedEdgeIds: state.selection.selectedEdgeIds,
        timestamp: Date.now()
      })
    }
  }, [toolMode, edgeCreationSource, selectNode, startEdgeCreationInStore,
      completeEdgeCreationInStore, cancelEdgeCreationInStore,
      removeNodeFromStore, crdt, webrtc, userId])

  const performNodeUpdate = useCallback((nodeId: string, x: number, y: number) => {
    if (crdt?.isReady && crdt.updateNode) {
      crdt.updateNode(nodeId, { x, y })
    } else {
      updateNodeInStore(nodeId, { x, y })
      rendererRef.current?.updateNode(nodeId, { x, y })
    }
  }, [crdt, updateNodeInStore])

  const sendDragPosition = useCallback((nodeId: string, x: number, y: number) => {
    if (webrtc?.isConnected && webrtc.sendDragPosition && dragStateRef.current.hasLock) {
      webrtc.sendDragPosition({
        nodeId,
        userId,
        x,
        y,
        timestamp: Date.now()
      })
    }
  }, [webrtc, userId])

  const handleNodeDragStart = useCallback((node: GraphNode, _e: MouseEvent) => {
    dragStateRef.current.isDragging = true
    dragStateRef.current.nodeId = node.id

    const hasLock = useEditorStore.getState().acquireDragLock(
      node.id,
      userId,
      user?.name || 'Unknown',
      node.x,
      node.y
    )

    dragStateRef.current.hasLock = hasLock

    if (hasLock) {
      if (webrtc?.isConnected && webrtc.sendDragLock) {
        webrtc.sendDragLock({
          nodeId: node.id,
          userId,
          userName: user?.name || 'Unknown',
          timestamp: Date.now(),
          x: node.x,
          y: node.y
        })
      }

      if (!dragStateRef.current.throttledUpdate) {
        dragStateRef.current.throttledUpdate = throttle(performNodeUpdate, 50)
      }
      if (!dragStateRef.current.throttledPosition) {
        dragStateRef.current.throttledPosition = throttle(sendDragPosition, 50)
      }
    }
  }, [userId, user?.name, webrtc, performNodeUpdate, sendDragPosition])

  const handleNodeDrag = useCallback((node: GraphNode, _e: MouseEvent) => {
    if (!dragStateRef.current.hasLock) {
      const isLocked = useEditorStore.getState().isNodeDragLocked(node.id)
      if (isLocked) {
        return
      }

      const hasLock = useEditorStore.getState().acquireDragLock(
        node.id,
        userId,
        user?.name || 'Unknown',
        node.x,
        node.y
      )

      dragStateRef.current.hasLock = hasLock

      if (!hasLock) {
        return
      }

      if (webrtc?.isConnected && webrtc.sendDragLock) {
        webrtc.sendDragLock({
          nodeId: node.id,
          userId,
          userName: user?.name || 'Unknown',
          timestamp: Date.now(),
          x: node.x,
          y: node.y
        })
      }

      if (!dragStateRef.current.throttledUpdate) {
        dragStateRef.current.throttledUpdate = throttle(performNodeUpdate, 50)
      }
      if (!dragStateRef.current.throttledPosition) {
        dragStateRef.current.throttledPosition = throttle(sendDragPosition, 50)
      }
    }

    dragStateRef.current.throttledUpdate?.(node.id, node.x, node.y)
    dragStateRef.current.throttledPosition?.(node.id, node.x, node.y)
  }, [userId, user?.name, webrtc, performNodeUpdate, sendDragPosition])

  const handleNodeDragEnd = useCallback((node: GraphNode, _e: MouseEvent) => {
    if (dragStateRef.current.hasLock) {
      performNodeUpdate(node.id, node.x, node.y)

      if (webrtc?.isConnected && webrtc.sendDragUnlock) {
        webrtc.sendDragUnlock({
          nodeId: node.id,
          userId,
          timestamp: Date.now(),
          finalX: node.x,
          finalY: node.y
        })
      }

      useEditorStore.getState().releaseDragLock(node.id, userId, node.x, node.y)
    }

    dragStateRef.current.isDragging = false
    dragStateRef.current.nodeId = null
    dragStateRef.current.hasLock = false
    dragStateRef.current.throttledUpdate = null
    dragStateRef.current.throttledPosition = null
  }, [userId, webrtc, performNodeUpdate])

  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (!canvasRef.current || !viewportRef.current) return

    const rect = canvasRef.current.getBoundingClientRect()
    const screenX = e.clientX - rect.left
    const screenY = e.clientY - rect.top
    const worldPos = viewportRef.current.screenToWorld(screenX, screenY)

    if (edgeCreationSource) {
      updateTempEdgeTarget(worldPos.x, worldPos.y)
    }

    if (webrtc?.isConnected && webrtc.sendCursor) {
      webrtc.sendCursor({
        userId,
        x: worldPos.x,
        y: worldPos.y,
        timestamp: Date.now()
      })
    }

    if (rendererRef.current) {
      const mouseEvent = new MouseEvent('mousemove', e)
      Object.defineProperty(mouseEvent, 'clientX', { value: e.clientX })
      Object.defineProperty(mouseEvent, 'clientY', { value: e.clientY })
    }
  }, [edgeCreationSource, updateTempEdgeTarget, webrtc, userId])

  const handleViewportChange = useCallback((viewport: Viewport) => {
    viewportRef.current = viewport
    setView({
      scale: viewport.scale,
      offsetX: viewport.x,
      offsetY: viewport.y
    })
  }, [setView])

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
      return
    }

    if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) {
      e.preventDefault()
      undoFromStore()
      return
    }

    if ((e.ctrlKey || e.metaKey) && (e.key === 'y' || (e.key === 'z' && e.shiftKey))) {
      e.preventDefault()
      redoFromStore()
      return
    }

    if ((e.key === 'Delete' || e.key === 'Backspace') && selection.selectedNodeIds.length + selection.selectedEdgeIds.length > 0) {
      e.preventDefault()
      if (crdt?.isReady) {
        selection.selectedNodeIds.forEach(id => crdt.deleteNode?.(id))
        selection.selectedEdgeIds.forEach(id => crdt.deleteEdge?.(id))
      } else {
        deleteSelectionInStore()
      }
      return
    }

    if (e.key === 'Escape') {
      e.preventDefault()
      if (edgeCreationSource) {
        cancelEdgeCreationInStore()
      } else {
        clearSelectionInStore()
        rendererRef.current?.clearSelection()
      }
      return
    }

    switch (e.key) {
      case 'v':
      case 'V':
        setToolMode('select')
        break
      case 'n':
      case 'N':
        setToolMode('node')
        break
      case 'e':
      case 'E':
        setToolMode('edge')
        break
      case 'd':
      case 'D':
        setToolMode('delete')
        break
      case 'h':
      case 'H':
        setToolMode('pan')
        break
      case '1':
        setToolMode('select')
        break
      case '2':
        setToolMode('node')
        break
      case '3':
        setToolMode('edge')
        break
      case '4':
        setToolMode('delete')
        break
      case '5':
        setToolMode('pan')
        break
    }
  }, [selection, edgeCreationSource, crdt, deleteSelectionInStore,
      clearSelectionInStore, cancelEdgeCreationInStore,
      undoFromStore, redoFromStore, setToolMode])

  const initRenderer = useCallback(() => {
    if (!canvasRef.current || rendererRef.current) return

    try {
      const renderer = new Renderer(canvasRef.current, {
        ...rendererOptions,
        onNodeClick: handleNodeClick,
        onNodeDrag: handleNodeDrag,
        onNodeDragEnd: handleNodeDragEnd,
        onNodeDragStart: (node, e) => {
          setDragging(true)
          handleNodeDragStart(node, e)
        },
        onCanvasClick: handleCanvasClick,
        onViewportChange: handleViewportChange,
        onSelectionChange: (selectedIds) => {
          rendererOptions.onSelectionChange?.(selectedIds)
        }
      })

      rendererRef.current = renderer
      viewportRef.current = renderer.getViewport()
      renderer.start()
      renderer.setData(graphData)

      if (view.scale !== 1 || view.offsetX !== 0 || view.offsetY !== 0) {
        const vp = renderer.getViewport()
        vp.setScale(view.scale)
        vp.setPosition(view.offsetX, view.offsetY)
        renderer.requestRender()
      }
    } catch (error) {
      console.error('Failed to initialize renderer:', error)
    }
  }, [rendererOptions, handleNodeClick, handleNodeDrag, handleNodeDragEnd,
      handleNodeDragStart, handleCanvasClick, handleViewportChange, setDragging, graphData, view])

  const destroyRenderer = useCallback(() => {
    if (rendererRef.current) {
      try {
        rendererRef.current.destroy()
      } catch (e) {
        console.error('Error destroying renderer:', e)
      }
      rendererRef.current = null
      viewportRef.current = null
    }
  }, [])

  const setData = useCallback((data: GraphData) => {
    setGraphData(data)
    rendererRef.current?.setData(data)
  }, [setGraphData])

  const addNode = useCallback((node: GraphNode) => {
    addNodeToStore(node)
    rendererRef.current?.addNode(node)
  }, [addNodeToStore])

  const updateNode = useCallback((nodeId: string, updates: Partial<GraphNode>) => {
    updateNodeInStore(nodeId, updates)
    rendererRef.current?.updateNode(nodeId, updates)
  }, [updateNodeInStore])

  const removeNode = useCallback((nodeId: string) => {
    removeNodeFromStore(nodeId)
    rendererRef.current?.removeNode(nodeId)
  }, [removeNodeFromStore])

  const addEdge = useCallback((edge: GraphEdge) => {
    addEdgeToStore(edge)
    rendererRef.current?.addEdge(edge)
  }, [addEdgeToStore])

  const updateEdge = useCallback((edgeId: string, updates: Partial<GraphEdge>) => {
    updateEdgeInStore(edgeId, updates)
    rendererRef.current?.updateEdge(edgeId, updates)
  }, [updateEdgeInStore])

  const removeEdge = useCallback((edgeId: string) => {
    removeEdgeFromStore(edgeId)
    rendererRef.current?.removeEdge(edgeId)
  }, [removeEdgeFromStore])

  const select = useCallback((ids: string[]) => {
    const nodeIds: string[] = []
    const edgeIds: string[] = []

    ids.forEach(id => {
      if (graphData.nodes[id]) {
        nodeIds.push(id)
      } else if (graphData.edges[id]) {
        edgeIds.push(id)
      }
    })

    if (nodeIds.length > 0) {
      useEditorStore.getState().selectNodes(nodeIds, false)
    }
    if (edgeIds.length > 0) {
      useEditorStore.getState().selectEdges(edgeIds, nodeIds.length > 0)
    }

    rendererRef.current?.select(ids)
  }, [graphData])

  const clearSelection = useCallback(() => {
    clearSelectionInStore()
    rendererRef.current?.clearSelection()
  }, [clearSelectionInStore])

  const deleteSelection = useCallback(() => {
    if (crdt?.isReady) {
      selection.selectedNodeIds.forEach(id => crdt.deleteNode?.(id))
      selection.selectedEdgeIds.forEach(id => crdt.deleteEdge?.(id))
    } else {
      deleteSelectionInStore()
    }
  }, [crdt, selection, deleteSelectionInStore])

  const fitView = useCallback(() => {
    rendererRef.current?.fitView()
  }, [])

  const resetView = useCallback(() => {
    rendererRef.current?.resetView()
  }, [])

  const setSize = useCallback((width: number, height: number) => {
    rendererRef.current?.setSize(width, height)
  }, [])

  const getRenderer = useCallback(() => {
    return rendererRef.current
  }, [])

  const startEdgeCreation = useCallback((sourceNodeId: string) => {
    startEdgeCreationInStore(sourceNodeId)
  }, [startEdgeCreationInStore])

  const cancelEdgeCreation = useCallback(() => {
    cancelEdgeCreationInStore()
  }, [cancelEdgeCreationInStore])

  const completeEdgeCreation = useCallback((targetNodeId: string): GraphEdge | null => {
    const edge = completeEdgeCreationInStore(targetNodeId)
    if (edge && crdt?.isReady && crdt.addEdge) {
      crdt.addEdge({
        source: edge.source,
        target: edge.target,
        style: edge.style,
        color: edge.color,
        label: edge.label,
        metadata: edge.metadata
      })
    }
    return edge
  }, [completeEdgeCreationInStore, crdt])

  const undo = useCallback(() => {
    if (crdt?.isReady) {
      const crdtAny = crdt as unknown as { undo?: () => void }
      crdtAny.undo?.()
    } else {
      undoFromStore()
    }
  }, [crdt, undoFromStore])

  const redo = useCallback(() => {
    if (crdt?.isReady) {
      const crdtAny = crdt as unknown as { redo?: () => void }
      crdtAny.redo?.()
    } else {
      redoFromStore()
    }
  }, [crdt, redoFromStore])

  useEffect(() => {
    initRenderer()
    return () => {
      destroyRenderer()
    }
  }, [initRenderer, destroyRenderer])

  useEffect(() => {
    if (rendererRef.current) {
      rendererRef.current.setData(graphData)
    }
  }, [graphData])

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown)
    return () => {
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [handleKeyDown])

  useEffect(() => {
    const canvas = canvasRef.current
    if (canvas) {
      canvas.addEventListener('mousemove', handleMouseMove)
      return () => {
        canvas.removeEventListener('mousemove', handleMouseMove)
      }
    }
  }, [handleMouseMove])

  const isReady = useMemo(() => rendererRef.current !== null, [rendererRef.current])

  const result = useMemo<UseCanvasResult>(() => ({
    canvasRef,
    renderer: rendererRef.current,
    viewport: viewportRef.current,

    isReady,
    toolMode,

    setData,
    addNode,
    updateNode,
    removeNode,
    addEdge,
    updateEdge,
    removeEdge,

    select,
    clearSelection,
    deleteSelection,

    fitView,
    resetView,
    setSize,
    getRenderer,

    createNodeAt,
    startEdgeCreation,
    cancelEdgeCreation,
    completeEdgeCreation,

    undo,
    redo,
    canUndo,
    canRedo
  }), [
    isReady, toolMode,
    setData, addNode, updateNode, removeNode, addEdge, updateEdge, removeEdge,
    select, clearSelection, deleteSelection,
    fitView, resetView, setSize, getRenderer,
    createNodeAt, startEdgeCreation, cancelEdgeCreation, completeEdgeCreation,
    undo, redo, canUndo, canRedo
  ])

  return result
}
