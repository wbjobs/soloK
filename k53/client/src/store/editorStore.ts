import { create } from 'zustand'
import { devtools, persist } from 'zustand/middleware'
import type { GraphNode, GraphEdge, GraphData, NodeType, EdgeStyle } from '../types/graph'
import type { MemberInfo, CRDTOperation, DragLockState } from '../types/crdt'
import type { CursorPosition, Selection } from '../types/api'

export type ToolMode = 'select' | 'node' | 'edge' | 'delete' | 'pan'

interface SelectionState {
  selectedNodeIds: string[]
  selectedEdgeIds: string[]
}

interface ViewState {
  scale: number
  offsetX: number
  offsetY: number
}

interface CollaborationState {
  onlineMembers: Map<string, MemberInfo>
  remoteCursors: Map<string, CursorPosition>
  remoteSelections: Map<string, Selection>
  dragLocks: Map<string, DragLockState>
}

interface HistoryState {
  past: CRDTOperation[][]
  future: CRDTOperation[][]
  maxHistorySize: number
}

interface EditorState {
  graphData: GraphData
  selection: SelectionState
  toolMode: ToolMode
  view: ViewState
  collaboration: CollaborationState
  history: HistoryState
  isDragging: boolean
  isPanning: boolean
  edgeCreationSource: string | null
  tempEdgeTarget: { x: number; y: number } | null

  setGraphData: (data: GraphData) => void
  addNode: (node: GraphNode) => void
  updateNode: (nodeId: string, updates: Partial<GraphNode>) => void
  removeNode: (nodeId: string) => void
  addEdge: (edge: GraphEdge) => void
  updateEdge: (edgeId: string, updates: Partial<GraphEdge>) => void
  removeEdge: (edgeId: string) => void

  selectNode: (nodeId: string, multiSelect?: boolean) => void
  selectEdge: (edgeId: string, multiSelect?: boolean) => void
  selectNodes: (nodeIds: string[], multiSelect?: boolean) => void
  selectEdges: (edgeIds: string[], multiSelect?: boolean) => void
  clearSelection: () => void
  deleteSelection: () => void

  setToolMode: (mode: ToolMode) => void
  setView: (view: Partial<ViewState>) => void
  resetView: () => void
  fitView: (nodes: GraphNode[]) => void

  addOnlineMember: (member: MemberInfo) => void
  removeOnlineMember: (memberId: string) => void
  updateRemoteCursor: (cursor: CursorPosition) => void
  updateRemoteSelection: (selection: Selection) => void

  acquireDragLock: (nodeId: string, userId: string, userName: string, x: number, y: number) => boolean
  releaseDragLock: (nodeId: string, userId: string, finalX: number, finalY: number) => void
  updateRemoteDragPosition: (nodeId: string, userId: string, x: number, y: number, timestamp: number) => void
  hasDragLock: (nodeId: string, userId: string) => boolean
  isNodeDragLocked: (nodeId: string) => boolean
  getDragLock: (nodeId: string) => DragLockState | undefined

  pushToHistory: (operations: CRDTOperation[]) => void
  undo: () => CRDTOperation[][] | null
  redo: () => CRDTOperation[][] | null
  clearHistory: () => void

  setDragging: (isDragging: boolean) => void
  setPanning: (isPanning: boolean) => void
  startEdgeCreation: (sourceNodeId: string) => void
  updateTempEdgeTarget: (x: number, y: number) => void
  cancelEdgeCreation: () => void
  completeEdgeCreation: (targetNodeId: string) => GraphEdge | null

  getSelectedNodes: () => GraphNode[]
  getSelectedEdges: () => GraphEdge[]
  hasSelection: () => boolean
}

const initialGraphData: GraphData = {
  nodes: {},
  edges: {},
  metadata: {
    version: 1,
    lastModified: Date.now(),
    modifiedBy: 'local'
  }
}

const initialSelection: SelectionState = {
  selectedNodeIds: [],
  selectedEdgeIds: []
}

const initialView: ViewState = {
  scale: 1,
  offsetX: 0,
  offsetY: 0
}

const initialCollaboration: CollaborationState = {
  onlineMembers: new Map(),
  remoteCursors: new Map(),
  remoteSelections: new Map(),
  dragLocks: new Map()
}

const initialHistory: HistoryState = {
  past: [],
  future: [],
  maxHistorySize: 100
}

export const useEditorStore = create<EditorState>()(
  devtools(
    persist(
      (set, get) => ({
        graphData: initialGraphData,
        selection: initialSelection,
        toolMode: 'select',
        view: initialView,
        collaboration: initialCollaboration,
        history: initialHistory,
        isDragging: false,
        isPanning: false,
        edgeCreationSource: null,
        tempEdgeTarget: null,

        setGraphData: (data) => set({ graphData: data }),

        addNode: (node) => set((state) => ({
          graphData: {
            ...state.graphData,
            nodes: {
              ...state.graphData.nodes,
              [node.id]: node
            }
          }
        })),

        updateNode: (nodeId, updates) => set((state) => {
          const node = state.graphData.nodes[nodeId]
          if (!node) return state

          return {
            graphData: {
              ...state.graphData,
              nodes: {
                ...state.graphData.nodes,
                [nodeId]: {
                  ...node,
                  ...updates,
                  updatedAt: Date.now()
                }
              }
            }
          }
        }),

        removeNode: (nodeId) => set((state) => {
          const newNodes = { ...state.graphData.nodes }
          delete newNodes[nodeId]

          const newEdges = { ...state.graphData.edges }
          Object.keys(newEdges).forEach(edgeId => {
            const edge = newEdges[edgeId]
            if (edge.source === nodeId || edge.target === nodeId) {
              delete newEdges[edgeId]
            }
          })

          return {
            graphData: {
              ...state.graphData,
              nodes: newNodes,
              edges: newEdges
            },
            selection: {
              ...state.selection,
              selectedNodeIds: state.selection.selectedNodeIds.filter(id => id !== nodeId),
              selectedEdgeIds: state.selection.selectedEdgeIds.filter(id => {
                const edge = state.graphData.edges[id]
                return edge && edge.source !== nodeId && edge.target !== nodeId
              })
            }
          }
        }),

        addEdge: (edge) => set((state) => ({
          graphData: {
            ...state.graphData,
            edges: {
              ...state.graphData.edges,
              [edge.id]: edge
            }
          }
        })),

        updateEdge: (edgeId, updates) => set((state) => {
          const edge = state.graphData.edges[edgeId]
          if (!edge) return state

          return {
            graphData: {
              ...state.graphData,
              edges: {
                ...state.graphData.edges,
                [edgeId]: {
                  ...edge,
                  ...updates,
                  updatedAt: Date.now()
                }
              }
            }
          }
        }),

        removeEdge: (edgeId) => set((state) => {
          const newEdges = { ...state.graphData.edges }
          delete newEdges[edgeId]

          return {
            graphData: {
              ...state.graphData,
              edges: newEdges
            },
            selection: {
              ...state.selection,
              selectedEdgeIds: state.selection.selectedEdgeIds.filter(id => id !== edgeId)
            }
          }
        }),

        selectNode: (nodeId, multiSelect = false) => set((state) => ({
          selection: {
            ...state.selection,
            selectedNodeIds: multiSelect
              ? state.selection.selectedNodeIds.includes(nodeId)
                ? state.selection.selectedNodeIds.filter(id => id !== nodeId)
                : [...state.selection.selectedNodeIds, nodeId]
              : [nodeId],
            selectedEdgeIds: multiSelect ? state.selection.selectedEdgeIds : []
          }
        })),

        selectEdge: (edgeId, multiSelect = false) => set((state) => ({
          selection: {
            ...state.selection,
            selectedEdgeIds: multiSelect
              ? state.selection.selectedEdgeIds.includes(edgeId)
                ? state.selection.selectedEdgeIds.filter(id => id !== edgeId)
                : [...state.selection.selectedEdgeIds, edgeId]
              : [edgeId],
            selectedNodeIds: multiSelect ? state.selection.selectedNodeIds : []
          }
        })),

        selectNodes: (nodeIds, multiSelect = false) => set((state) => ({
          selection: {
            ...state.selection,
            selectedNodeIds: multiSelect
              ? [...new Set([...state.selection.selectedNodeIds, ...nodeIds])]
              : nodeIds,
            selectedEdgeIds: multiSelect ? state.selection.selectedEdgeIds : []
          }
        })),

        selectEdges: (edgeIds, multiSelect = false) => set((state) => ({
          selection: {
            ...state.selection,
            selectedEdgeIds: multiSelect
              ? [...new Set([...state.selection.selectedEdgeIds, ...edgeIds])]
              : edgeIds,
            selectedNodeIds: multiSelect ? state.selection.selectedNodeIds : []
          }
        })),

        clearSelection: () => set({
          selection: {
            selectedNodeIds: [],
            selectedEdgeIds: []
          }
        }),

        deleteSelection: () => {
          const state = get()
          const { selectedNodeIds, selectedEdgeIds } = state.selection

          selectedNodeIds.forEach(nodeId => {
            get().removeNode(nodeId)
          })

          selectedEdgeIds.forEach(edgeId => {
            const edge = state.graphData.edges[edgeId]
            if (edge) {
              get().removeEdge(edgeId)
            }
          })
        },

        setToolMode: (mode) => set({ toolMode: mode }),

        setView: (view) => set((state) => ({
          view: { ...state.view, ...view }
        })),

        resetView: () => set({
          view: initialView
        }),

        fitView: (nodes) => {
          if (nodes.length === 0) {
            get().resetView()
            return
          }

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
          const centerX = minX + contentWidth / 2
          const centerY = minY + contentHeight / 2

          const canvasWidth = typeof window !== 'undefined' ? window.innerWidth : 1200
          const canvasHeight = typeof window !== 'undefined' ? window.innerHeight : 800

          const scaleX = (canvasWidth - padding * 2) / contentWidth
          const scaleY = (canvasHeight - padding * 2) / contentHeight
          const scale = Math.max(0.1, Math.min(5, Math.min(scaleX, scaleY)))

          set({
            view: {
              scale,
              offsetX: canvasWidth / 2 - centerX * scale,
              offsetY: canvasHeight / 2 - centerY * scale
            }
          })
        },

        addOnlineMember: (member) => set((state) => {
          const newOnlineMembers = new Map(state.collaboration.onlineMembers)
          newOnlineMembers.set(member.id, member)
          return {
            collaboration: {
              ...state.collaboration,
              onlineMembers: newOnlineMembers
            }
          }
        }),

        removeOnlineMember: (memberId) => set((state) => {
          const newOnlineMembers = new Map(state.collaboration.onlineMembers)
          newOnlineMembers.delete(memberId)

          const newRemoteCursors = new Map(state.collaboration.remoteCursors)
          newRemoteCursors.delete(memberId)

          const newRemoteSelections = new Map(state.collaboration.remoteSelections)
          newRemoteSelections.delete(memberId)

          const newDragLocks = new Map(state.collaboration.dragLocks)
          newDragLocks.forEach((lock, nodeId) => {
            if (lock.userId === memberId && lock.isLocked) {
              newDragLocks.set(nodeId, {
                ...lock,
                isLocked: false
              })
            }
          })

          return {
            collaboration: {
              ...state.collaboration,
              onlineMembers: newOnlineMembers,
              remoteCursors: newRemoteCursors,
              remoteSelections: newRemoteSelections,
              dragLocks: newDragLocks
            }
          }
        }),

        updateRemoteCursor: (cursor) => set((state) => {
          const newRemoteCursors = new Map(state.collaboration.remoteCursors)
          newRemoteCursors.set(cursor.userId, cursor)
          return {
            collaboration: {
              ...state.collaboration,
              remoteCursors: newRemoteCursors
            }
          }
        }),

        updateRemoteSelection: (selection) => set((state) => {
          const newRemoteSelections = new Map(state.collaboration.remoteSelections)
          newRemoteSelections.set(selection.userId, selection)
          return {
            collaboration: {
              ...state.collaboration,
              remoteSelections: newRemoteSelections
            }
          }
        }),

        acquireDragLock: (nodeId, userId, userName, x, y) => {
          const state = get()
          const existingLock = state.collaboration.dragLocks.get(nodeId)
          const now = Date.now()

          if (existingLock?.isLocked && existingLock.userId !== userId) {
            const lockAge = now - existingLock.lockTimestamp
            if (lockAge < 30000) {
              return false
            }
          }

          set((s) => {
            const newDragLocks = new Map(s.collaboration.dragLocks)
            newDragLocks.set(nodeId, {
              isLocked: true,
              nodeId,
              userId,
              userName,
              lockTimestamp: now,
              lastPosition: { x, y }
            })
            return {
              collaboration: {
                ...s.collaboration,
                dragLocks: newDragLocks
              }
            }
          })
          return true
        },

        releaseDragLock: (nodeId, userId, finalX, finalY) => set((state) => {
          const existingLock = state.collaboration.dragLocks.get(nodeId)
          if (existingLock?.isLocked && existingLock.userId === userId) {
            const newDragLocks = new Map(state.collaboration.dragLocks)
            newDragLocks.set(nodeId, {
              ...existingLock,
              isLocked: false,
              lastPosition: { x: finalX, y: finalY }
            })
            return {
              collaboration: {
                ...state.collaboration,
                dragLocks: newDragLocks
              }
            }
          }
          return state
        }),

        updateRemoteDragPosition: (nodeId, userId, x, y, timestamp) => set((state) => {
          const existingLock = state.collaboration.dragLocks.get(nodeId)
          if (existingLock?.isLocked && existingLock.userId === userId) {
            const newDragLocks = new Map(state.collaboration.dragLocks)
            newDragLocks.set(nodeId, {
              ...existingLock,
              lastPosition: { x, y },
              lockTimestamp: timestamp
            })
            return {
              collaboration: {
                ...state.collaboration,
                dragLocks: newDragLocks
              }
            }
          }
          return state
        }),

        hasDragLock: (nodeId, userId) => {
          const state = get()
          const lock = state.collaboration.dragLocks.get(nodeId)
          return !!(lock?.isLocked && lock.userId === userId)
        },

        isNodeDragLocked: (nodeId) => {
          const state = get()
          const lock = state.collaboration.dragLocks.get(nodeId)
          if (!lock?.isLocked) return false
          const lockAge = Date.now() - lock.lockTimestamp
          return lockAge < 30000
        },

        getDragLock: (nodeId) => {
          const state = get()
          return state.collaboration.dragLocks.get(nodeId)
        },

        pushToHistory: (operations) => set((state) => {
          const newPast = [...state.history.past, operations]
          if (newPast.length > state.history.maxHistorySize) {
            newPast.shift()
          }
          return {
            history: {
              ...state.history,
              past: newPast,
              future: []
            }
          }
        }),

        undo: () => {
          const state = get()
          if (state.history.past.length === 0) return null

          const newPast = [...state.history.past]
          const operations = newPast.pop()!

          set({
            history: {
              ...state.history,
              past: newPast,
              future: [operations, ...state.history.future]
            }
          })

          return [operations]
        },

        redo: () => {
          const state = get()
          if (state.history.future.length === 0) return null

          const newFuture = [...state.history.future]
          const operations = newFuture.shift()!

          set({
            history: {
              ...state.history,
              past: [...state.history.past, operations],
              future: newFuture
            }
          })

          return [operations]
        },

        clearHistory: () => set((state) => ({
          history: {
            ...state.history,
            past: [],
            future: []
          }
        })),

        setDragging: (isDragging) => set({ isDragging }),

        setPanning: (isPanning) => set({ isPanning }),

        startEdgeCreation: (sourceNodeId) => set({
          edgeCreationSource: sourceNodeId,
          toolMode: 'edge'
        }),

        updateTempEdgeTarget: (x, y) => set({
          tempEdgeTarget: { x, y }
        }),

        cancelEdgeCreation: () => set({
          edgeCreationSource: null,
          tempEdgeTarget: null,
          toolMode: 'select'
        }),

        completeEdgeCreation: (targetNodeId) => {
          const state = get()
          if (!state.edgeCreationSource) return null

          const sourceNode = state.graphData.nodes[state.edgeCreationSource]
          const targetNode = state.graphData.nodes[targetNodeId]

          if (!sourceNode || !targetNode) {
            get().cancelEdgeCreation()
            return null
          }

          const edgeStyles: EdgeStyle[] = ['solid', 'dashed', 'dotted']
          const randomStyle = edgeStyles[Math.floor(Math.random() * edgeStyles.length)]
          const nodeTypes: NodeType[] = ['concept', 'topic', 'note', 'resource']
          const randomType = nodeTypes[Math.floor(Math.random() * nodeTypes.length)]

          const colors: Record<string, string> = {
            concept: '#3b82f6',
            topic: '#10b981',
            note: '#f59e0b',
            resource: '#8b5cf6'
          }

          const edge: GraphEdge = {
            id: crypto.randomUUID(),
            source: state.edgeCreationSource,
            target: targetNodeId,
            style: randomStyle,
            color: colors[randomType],
            metadata: {},
            createdAt: Date.now(),
            updatedAt: Date.now()
          }

          get().addEdge(edge)
          set({
            edgeCreationSource: null,
            tempEdgeTarget: null,
            toolMode: 'select'
          })

          return edge
        },

        getSelectedNodes: () => {
          const state = get()
          return state.selection.selectedNodeIds
            .map(id => state.graphData.nodes[id])
            .filter(Boolean) as GraphNode[]
        },

        getSelectedEdges: () => {
          const state = get()
          return state.selection.selectedEdgeIds
            .map(id => state.graphData.edges[id])
            .filter(Boolean) as GraphEdge[]
        },

        hasSelection: () => {
          const state = get()
          return state.selection.selectedNodeIds.length > 0 ||
                 state.selection.selectedEdgeIds.length > 0
        }
      }),
      {
        name: 'editor-store',
        partialize: (state) => ({
          toolMode: state.toolMode,
          view: state.view
        })
      }
    )
  )
)

export const useSelectedNodeIds = () => useEditorStore((state) => state.selection.selectedNodeIds)
export const useSelectedEdgeIds = () => useEditorStore((state) => state.selection.selectedEdgeIds)
export const useToolMode = () => useEditorStore((state) => state.toolMode)
export const useView = () => useEditorStore((state) => state.view)
export const useOnlineMembers = () => useEditorStore((state) =>
  Array.from(state.collaboration.onlineMembers.values())
)
export const useRemoteCursors = () => useEditorStore((state) =>
  Array.from(state.collaboration.remoteCursors.values())
)
export const useHasSelection = () => useEditorStore((state) => state.hasSelection())
export const useCanUndo = () => useEditorStore((state) => state.history.past.length > 0)
export const useCanRedo = () => useEditorStore((state) => state.history.future.length > 0)
