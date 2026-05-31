import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { YjsProvider } from '../crdt/YjsProvider'
import * as operations from '../crdt/operations'
import { useEditorStore } from '../store/editorStore'
import { useRoomStore } from '../store/roomStore'
import type { GraphNode, GraphEdge, GraphData, NodeUpdatePayload, EdgeUpdatePayload, GraphMetadata } from '../types/graph'
import type { CRDTOperation, CRDTOperationEvent } from '../types/crdt'

interface UseCRDTOptions {
  roomId: string | null
  onOperation?: (event: CRDTOperationEvent) => void
}

interface UseCRDTResult {
  provider: YjsProvider | null
  isReady: boolean
  isLoading: boolean
  error: string | null
  graphData: GraphData

  addNode: (nodeData: Omit<GraphNode, 'id' | 'createdAt' | 'updatedAt'> & { id?: string }) => CRDTOperation | null
  updateNode: (nodeId: string, updates: NodeUpdatePayload) => CRDTOperation | null
  deleteNode: (nodeId: string) => CRDTOperation | null
  addEdge: (edgeData: Omit<GraphEdge, 'id' | 'createdAt' | 'updatedAt'> & { id?: string }) => CRDTOperation | null
  updateEdge: (edgeId: string, updates: EdgeUpdatePayload) => CRDTOperation | null
  deleteEdge: (edgeId: string) => CRDTOperation | null
  updateMetadata: (metadata: Partial<GraphMetadata>) => CRDTOperation
  batchUpdateNodes: (updates: Array<{ nodeId: string; updates: NodeUpdatePayload }>) => CRDTOperation[]

  getGraphData: () => GraphData
  getNode: (id: string) => GraphNode | undefined
  getEdge: (id: string) => GraphEdge | undefined
  hasNode: (id: string) => boolean
  hasEdge: (id: string) => boolean
  getAllNodes: () => GraphNode[]
  getAllEdges: () => GraphEdge[]
  getGraphMetadata: () => GraphMetadata | null

  applyUpdate: (update: Uint8Array, origin?: unknown) => void
  encodeStateAsUpdate: (targetStateVector?: Uint8Array) => Uint8Array | null
  subscribe: (listener: (event: CRDTOperationEvent) => void) => (() => void) | null

  pushToHistory: (ops: CRDTOperation[]) => void
  undo: () => void
  redo: () => void
  canUndo: boolean
  canRedo: boolean
}

export function useCRDT({ roomId, onOperation }: UseCRDTOptions): UseCRDTResult {
  const providerRef = useRef<YjsProvider | null>(null)
  const [isReady, setIsReady] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [graphData, setGraphData] = useState<GraphData>({
    nodes: {},
    edges: {},
    metadata: {
      version: 1,
      lastModified: Date.now(),
      modifiedBy: 'local'
    }
  })

  const unsubscribeRef = useRef<(() => void) | null>(null)

  const setGraphDataInStore = useEditorStore((state) => state.setGraphData)
  const addNodeInStore = useEditorStore((state) => state.addNode)
  const updateNodeInStore = useEditorStore((state) => state.updateNode)
  const removeNodeInStore = useEditorStore((state) => state.removeNode)
  const addEdgeInStore = useEditorStore((state) => state.addEdge)
  const updateEdgeInStore = useEditorStore((state) => state.updateEdge)
  const removeEdgeInStore = useEditorStore((state) => state.removeEdge)
  const pushToHistory = useEditorStore((state) => state.pushToHistory)
  const undoFromStore = useEditorStore((state) => state.undo)
  const redoFromStore = useEditorStore((state) => state.redo)
  const canUndo = useEditorStore((state) => state.history.past.length > 0)
  const canRedo = useEditorStore((state) => state.history.future.length > 0)

  const updateRoomGraphData = useRoomStore((state) => state.updateGraphData)

  const refreshGraphData = useCallback(() => {
    if (!providerRef.current) return
    const data = operations.getGraphData(providerRef.current)
    setGraphData(data)
    setGraphDataInStore(data)
    updateRoomGraphData(data)
  }, [setGraphDataInStore, updateRoomGraphData])

  const handleOperation = useCallback((event: CRDTOperationEvent) => {
    refreshGraphData()
    onOperation?.(event)
  }, [refreshGraphData, onOperation])

  useEffect(() => {
    if (!roomId) {
      setIsReady(false)
      setIsLoading(false)
      return
    }

    setIsLoading(true)
    setError(null)

    try {
      const provider = new YjsProvider(roomId)
      providerRef.current = provider

      unsubscribeRef.current = provider.subscribe(handleOperation)

      refreshGraphData()

      setIsReady(true)
      setIsLoading(false)
    } catch (err) {
      console.error('Failed to initialize CRDT provider:', err)
      setError(err instanceof Error ? err.message : 'Failed to initialize CRDT')
      setIsLoading(false)
    }

    return () => {
      if (unsubscribeRef.current) {
        unsubscribeRef.current()
        unsubscribeRef.current = null
      }
      if (providerRef.current) {
        providerRef.current.destroy()
        providerRef.current = null
      }
      setIsReady(false)
      setIsLoading(false)
    }
  }, [roomId, handleOperation, refreshGraphData])

  const addNode = useCallback((nodeData: Omit<GraphNode, 'id' | 'createdAt' | 'updatedAt'> & { id?: string }): CRDTOperation | null => {
    if (!providerRef.current) return null

    const op = operations.addNode(providerRef.current, nodeData)
    addNodeInStore(op.node)
    pushToHistory([op])
    refreshGraphData()
    return op
  }, [addNodeInStore, pushToHistory, refreshGraphData])

  const updateNode = useCallback((nodeId: string, updates: NodeUpdatePayload): CRDTOperation | null => {
    if (!providerRef.current) return null

    const op = operations.updateNode(providerRef.current, nodeId, updates)
    if (op) {
      updateNodeInStore(nodeId, updates)
      pushToHistory([op])
      refreshGraphData()
    }
    return op
  }, [updateNodeInStore, pushToHistory, refreshGraphData])

  const deleteNode = useCallback((nodeId: string): CRDTOperation | null => {
    if (!providerRef.current) return null

    const op = operations.deleteNode(providerRef.current, nodeId)
    if (op) {
      removeNodeInStore(nodeId)
      pushToHistory([op])
      refreshGraphData()
    }
    return op
  }, [removeNodeInStore, pushToHistory, refreshGraphData])

  const addEdge = useCallback((edgeData: Omit<GraphEdge, 'id' | 'createdAt' | 'updatedAt'> & { id?: string }): CRDTOperation | null => {
    if (!providerRef.current) return null

    const op = operations.addEdge(providerRef.current, edgeData)
    if (op) {
      addEdgeInStore(op.edge)
      pushToHistory([op])
      refreshGraphData()
    }
    return op
  }, [addEdgeInStore, pushToHistory, refreshGraphData])

  const updateEdge = useCallback((edgeId: string, updates: EdgeUpdatePayload): CRDTOperation | null => {
    if (!providerRef.current) return null

    const op = operations.updateEdge(providerRef.current, edgeId, updates)
    if (op) {
      updateEdgeInStore(edgeId, updates)
      pushToHistory([op])
      refreshGraphData()
    }
    return op
  }, [updateEdgeInStore, pushToHistory, refreshGraphData])

  const deleteEdge = useCallback((edgeId: string): CRDTOperation | null => {
    if (!providerRef.current) return null

    const op = operations.deleteEdge(providerRef.current, edgeId)
    if (op) {
      removeEdgeInStore(edgeId)
      pushToHistory([op])
      refreshGraphData()
    }
    return op
  }, [removeEdgeInStore, pushToHistory, refreshGraphData])

  const updateMetadata = useCallback((metadata: Partial<GraphMetadata>): CRDTOperation => {
    if (!providerRef.current) {
      throw new Error('CRDT provider not initialized')
    }

    const op = operations.updateMetadata(providerRef.current, metadata)
    refreshGraphData()
    return op
  }, [refreshGraphData])

  const batchUpdateNodes = useCallback((updates: Array<{ nodeId: string; updates: NodeUpdatePayload }>): CRDTOperation[] => {
    if (!providerRef.current) return []

    const ops = operations.batchUpdateNodes(providerRef.current, updates)
    ops.forEach((op) => {
      updateNodeInStore(op.nodeId, op.updates as NodeUpdatePayload)
    })
    if (ops.length > 0) {
      pushToHistory(ops)
    }
    refreshGraphData()
    return ops
  }, [updateNodeInStore, pushToHistory, refreshGraphData])

  const getGraphData = useCallback((): GraphData => {
    if (!providerRef.current) {
      return graphData
    }
    return operations.getGraphData(providerRef.current)
  }, [graphData])

  const getNode = useCallback((id: string): GraphNode | undefined => {
    return providerRef.current?.getNode(id)
  }, [])

  const getEdge = useCallback((id: string): GraphEdge | undefined => {
    return providerRef.current?.getEdge(id)
  }, [])

  const hasNode = useCallback((id: string): boolean => {
    return providerRef.current?.hasNode(id) ?? false
  }, [])

  const hasEdge = useCallback((id: string): boolean => {
    return providerRef.current?.hasEdge(id) ?? false
  }, [])

  const getAllNodes = useCallback((): GraphNode[] => {
    return providerRef.current?.getAllNodes() ?? []
  }, [])

  const getAllEdges = useCallback((): GraphEdge[] => {
    return providerRef.current?.getAllEdges() ?? []
  }, [])

  const getGraphMetadata = useCallback((): GraphMetadata | null => {
    return providerRef.current?.getGraphMetadata() ?? null
  }, [])

  const applyUpdate = useCallback((update: Uint8Array, origin?: unknown): void => {
    if (!providerRef.current) return
    providerRef.current.applyUpdate(update, origin ?? 'remote')
    refreshGraphData()
  }, [refreshGraphData])

  const encodeStateAsUpdate = useCallback((targetStateVector?: Uint8Array): Uint8Array | null => {
    if (!providerRef.current) return null
    return providerRef.current.encodeStateAsUpdate(targetStateVector)
  }, [])

  const subscribe = useCallback((listener: (event: CRDTOperationEvent) => void): (() => void) | null => {
    if (!providerRef.current) return null
    return providerRef.current.subscribe(listener)
  }, [])

  const undo = useCallback((): void => {
    const operationsToUndo = undoFromStore()
    if (!operationsToUndo) return

    operationsToUndo.forEach((ops) => {
      ops.forEach((op) => {
        if (!providerRef.current) return

        switch (op.type) {
          case 'node/add':
            operations.deleteNode(providerRef.current!, op.nodeId)
            removeNodeInStore(op.nodeId)
            break
          case 'node/delete': {
            const nodeData = getNode(op.nodeId)
            if (nodeData) {
              operations.addNode(providerRef.current!, { ...nodeData, id: op.nodeId })
              addNodeInStore(nodeData)
            }
            break
          }
          case 'node/update': {
            const node = getNode(op.nodeId)
            if (node) {
              const reverseUpdates: NodeUpdatePayload = {}
              Object.keys(op.updates).forEach((key) => {
                const k = key as keyof NodeUpdatePayload
                reverseUpdates[k] = node[k] as never
              })
              operations.updateNode(providerRef.current!, op.nodeId, reverseUpdates)
              updateNodeInStore(op.nodeId, reverseUpdates)
            }
            break
          }
          case 'edge/add':
            operations.deleteEdge(providerRef.current!, op.edgeId)
            removeEdgeInStore(op.edgeId)
            break
          case 'edge/delete': {
            const edgeData = getEdge(op.edgeId)
            if (edgeData) {
              operations.addEdge(providerRef.current!, { ...edgeData, id: op.edgeId })
              addEdgeInStore(edgeData)
            }
            break
          }
          case 'edge/update': {
            const edge = getEdge(op.edgeId)
            if (edge) {
              const reverseUpdates: EdgeUpdatePayload = {}
              Object.keys(op.updates).forEach((key) => {
                const k = key as keyof EdgeUpdatePayload
                reverseUpdates[k] = edge[k] as never
              })
              operations.updateEdge(providerRef.current!, op.edgeId, reverseUpdates)
              updateEdgeInStore(op.edgeId, reverseUpdates)
            }
            break
          }
        }
      })
    })

    refreshGraphData()
  }, [undoFromStore, removeNodeInStore, addNodeInStore, updateNodeInStore, removeEdgeInStore, addEdgeInStore, updateEdgeInStore, refreshGraphData, getNode, getEdge])

  const redo = useCallback((): void => {
    const operationsToRedo = redoFromStore()
    if (!operationsToRedo) return

    operationsToRedo.forEach((ops) => {
      ops.forEach((op) => {
        if (!providerRef.current) return

        switch (op.type) {
          case 'node/add':
            operations.addNode(providerRef.current!, { ...op.node, id: op.nodeId })
            addNodeInStore(op.node)
            break
          case 'node/delete':
            operations.deleteNode(providerRef.current!, op.nodeId)
            removeNodeInStore(op.nodeId)
            break
          case 'node/update':
            operations.updateNode(providerRef.current!, op.nodeId, op.updates as NodeUpdatePayload)
            updateNodeInStore(op.nodeId, op.updates as NodeUpdatePayload)
            break
          case 'edge/add':
            operations.addEdge(providerRef.current!, { ...op.edge, id: op.edgeId })
            addEdgeInStore(op.edge)
            break
          case 'edge/delete':
            operations.deleteEdge(providerRef.current!, op.edgeId)
            removeEdgeInStore(op.edgeId)
            break
          case 'edge/update':
            operations.updateEdge(providerRef.current!, op.edgeId, op.updates as EdgeUpdatePayload)
            updateEdgeInStore(op.edgeId, op.updates as EdgeUpdatePayload)
            break
        }
      })
    })

    refreshGraphData()
  }, [redoFromStore, addNodeInStore, removeNodeInStore, updateNodeInStore, addEdgeInStore, removeEdgeInStore, updateEdgeInStore, refreshGraphData])

  const result = useMemo<UseCRDTResult>(() => ({
    provider: providerRef.current,
    isReady,
    isLoading,
    error,
    graphData,

    addNode,
    updateNode,
    deleteNode,
    addEdge,
    updateEdge,
    deleteEdge,
    updateMetadata,
    batchUpdateNodes,

    getGraphData,
    getNode,
    getEdge,
    hasNode,
    hasEdge,
    getAllNodes,
    getAllEdges,
    getGraphMetadata,

    applyUpdate,
    encodeStateAsUpdate,
    subscribe,

    pushToHistory,
    undo,
    redo,
    canUndo,
    canRedo
  }), [
    isReady, isLoading, error, graphData,
    addNode, updateNode, deleteNode, addEdge, updateEdge, deleteEdge,
    updateMetadata, batchUpdateNodes,
    getGraphData, getNode, getEdge, hasNode, hasEdge, getAllNodes, getAllEdges, getGraphMetadata,
    applyUpdate, encodeStateAsUpdate, subscribe,
    pushToHistory, undo, redo, canUndo, canRedo
  ])

  return result
}
