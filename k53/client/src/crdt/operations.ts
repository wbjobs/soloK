import type { YjsProvider } from './YjsProvider'
import type { GraphNode, GraphEdge, NodeUpdatePayload, EdgeUpdatePayload, GraphMetadata } from '../types/graph'
import type {
  CRDTAddNodeOperation,
  CRDTUpdateNodeOperation,
  CRDTDeleteNodeOperation,
  CRDTAddEdgeOperation,
  CRDTUpdateEdgeOperation,
  CRDTDeleteEdgeOperation,
  CRDTUpdateMetadataOperation
} from '../types/crdt'

function generateId(): string {
  return crypto.randomUUID()
}

export function addNode(
  provider: YjsProvider,
  nodeData: Omit<GraphNode, 'id' | 'createdAt' | 'updatedAt'> & { id?: string }
): CRDTAddNodeOperation {
  const now = Date.now()
  const node: GraphNode = {
    id: nodeData.id ?? generateId(),
    x: nodeData.x,
    y: nodeData.y,
    width: nodeData.width,
    height: nodeData.height,
    type: nodeData.type,
    label: nodeData.label,
    color: nodeData.color,
    metadata: nodeData.metadata,
    createdAt: now,
    updatedAt: now
  }

  provider.transact(() => {
    provider.getNodes().set(node.id, node)
  })

  return {
    type: 'node/add',
    nodeId: node.id,
    node,
    timestamp: now,
    origin: provider.getOrigin()
  }
}

export function updateNode(
  provider: YjsProvider,
  nodeId: string,
  updates: NodeUpdatePayload
): CRDTUpdateNodeOperation | null {
  const existingNode = provider.getNode(nodeId)
  if (!existingNode) {
    console.warn(`Node ${nodeId} not found, cannot update`)
    return null
  }

  const now = Date.now()
  const updatedNode: GraphNode = {
    ...existingNode,
    ...updates,
    updatedAt: now
  }

  provider.transact(() => {
    provider.getNodes().set(nodeId, updatedNode)
  })

  return {
    type: 'node/update',
    nodeId,
    updates: { ...updates },
    timestamp: now,
    origin: provider.getOrigin()
  }
}

export function deleteNode(provider: YjsProvider, nodeId: string): CRDTDeleteNodeOperation | null {
  if (!provider.hasNode(nodeId)) {
    console.warn(`Node ${nodeId} not found, cannot delete`)
    return null
  }

  const now = Date.now()
  const edgesToDelete: string[] = []

  provider.getAllEdges().forEach((edge) => {
    if (edge.source === nodeId || edge.target === nodeId) {
      edgesToDelete.push(edge.id)
    }
  })

  provider.transact(() => {
    edgesToDelete.forEach((edgeId) => {
      provider.getEdges().delete(edgeId)
    })
    provider.getNodes().delete(nodeId)
  })

  return {
    type: 'node/delete',
    nodeId,
    timestamp: now,
    origin: provider.getOrigin()
  }
}

export function addEdge(
  provider: YjsProvider,
  edgeData: Omit<GraphEdge, 'id' | 'createdAt' | 'updatedAt'> & { id?: string }
): CRDTAddEdgeOperation | null {
  if (!provider.hasNode(edgeData.source)) {
    console.warn(`Source node ${edgeData.source} not found, cannot add edge`)
    return null
  }

  if (!provider.hasNode(edgeData.target)) {
    console.warn(`Target node ${edgeData.target} not found, cannot add edge`)
    return null
  }

  const now = Date.now()
  const edge: GraphEdge = {
    id: edgeData.id ?? generateId(),
    source: edgeData.source,
    target: edgeData.target,
    label: edgeData.label,
    color: edgeData.color,
    style: edgeData.style,
    metadata: edgeData.metadata,
    createdAt: now,
    updatedAt: now
  }

  provider.transact(() => {
    provider.getEdges().set(edge.id, edge)
  })

  return {
    type: 'edge/add',
    edgeId: edge.id,
    edge,
    timestamp: now,
    origin: provider.getOrigin()
  }
}

export function updateEdge(
  provider: YjsProvider,
  edgeId: string,
  updates: EdgeUpdatePayload
): CRDTUpdateEdgeOperation | null {
  const existingEdge = provider.getEdge(edgeId)
  if (!existingEdge) {
    console.warn(`Edge ${edgeId} not found, cannot update`)
    return null
  }

  const now = Date.now()
  const updatedEdge: GraphEdge = {
    ...existingEdge,
    ...updates,
    updatedAt: now
  }

  provider.transact(() => {
    provider.getEdges().set(edgeId, updatedEdge)
  })

  return {
    type: 'edge/update',
    edgeId,
    updates: { ...updates },
    timestamp: now,
    origin: provider.getOrigin()
  }
}

export function deleteEdge(provider: YjsProvider, edgeId: string): CRDTDeleteEdgeOperation | null {
  if (!provider.hasEdge(edgeId)) {
    console.warn(`Edge ${edgeId} not found, cannot delete`)
    return null
  }

  const now = Date.now()

  provider.transact(() => {
    provider.getEdges().delete(edgeId)
  })

  return {
    type: 'edge/delete',
    edgeId,
    timestamp: now,
    origin: provider.getOrigin()
  }
}

export function updateMetadata(
  provider: YjsProvider,
  metadata: Partial<GraphMetadata>
): CRDTUpdateMetadataOperation {
  const now = Date.now()

  provider.transact(() => {
    provider.setGraphMetadata(metadata)
  })

  return {
    type: 'graph/metadata',
    metadata,
    timestamp: now,
    origin: provider.getOrigin()
  }
}

export function batchUpdateNodes(
  provider: YjsProvider,
  updates: Array<{ nodeId: string; updates: NodeUpdatePayload }>
): CRDTUpdateNodeOperation[] {
  const results: CRDTUpdateNodeOperation[] = []
  const now = Date.now()

  provider.transact(() => {
    for (const { nodeId, updates: nodeUpdates } of updates) {
      const existingNode = provider.getNode(nodeId)
      if (!existingNode) continue

      const updatedNode: GraphNode = {
        ...existingNode,
        ...nodeUpdates,
        updatedAt: now
      }

      provider.getNodes().set(nodeId, updatedNode)

      results.push({
        type: 'node/update',
        nodeId,
        updates: { ...nodeUpdates },
        timestamp: now,
        origin: provider.getOrigin()
      })
    }
  })

  return results
}

export function getGraphData(provider: YjsProvider): {
  nodes: Record<string, GraphNode>
  edges: Record<string, GraphEdge>
  metadata: GraphMetadata
} {
  const nodes: Record<string, GraphNode> = {}
  const edges: Record<string, GraphEdge> = {}

  provider.getAllNodes().forEach((node) => {
    nodes[node.id] = node
  })

  provider.getAllEdges().forEach((edge) => {
    edges[edge.id] = edge
  })

  const defaultMetadata: GraphMetadata = {
    version: 1,
    lastModified: Date.now(),
    modifiedBy: provider.getOrigin()
  }

  return {
    nodes,
    edges,
    metadata: provider.getGraphMetadata() ?? defaultMetadata
  }
}
