import * as Y from 'yjs'
import type { GraphNode, GraphEdge, GraphMetadata } from '../types/graph'
import type { CRDTOperationEvent, CRDTChangeListener, CRDTOperation } from '../types/crdt'

export class YjsProvider {
  private doc: Y.Doc
  private nodes: Y.Map<GraphNode>
  private edges: Y.Map<GraphEdge>
  private metadata: Y.Map<unknown>
  private listeners: Set<CRDTChangeListener> = new Set()
  private origin: string

  constructor(roomId: string, origin?: string) {
    this.doc = new Y.Doc({ guid: `room-${roomId}` })
    this.nodes = this.doc.getMap<GraphNode>('nodes')
    this.edges = this.doc.getMap<GraphEdge>('edges')
    this.metadata = this.doc.getMap<unknown>('metadata')
    this.origin = origin ?? crypto.randomUUID()
    this.setupObservers()
  }

  private setupObservers(): void {
    this.nodes.observeDeep((events, transaction) => {
      if (transaction.origin === this.origin) return
      this.handleNodeEvents(events, transaction)
    })

    this.edges.observeDeep((events, transaction) => {
      if (transaction.origin === this.origin) return
      this.handleEdgeEvents(events, transaction)
    })
  }

  private handleNodeEvents(events: Y.YEvent<Y.Map<GraphNode>>[], transaction: Y.Transaction): void {
    for (const event of events) {
      if (event instanceof Y.YMapEvent) {
        this.handleMapEvent(event, 'node', transaction)
      }
    }
  }

  private handleEdgeEvents(events: Y.YEvent<Y.Map<GraphEdge>>[], transaction: Y.Transaction): void {
    for (const event of events) {
      if (event instanceof Y.YMapEvent) {
        this.handleMapEvent(event, 'edge', transaction)
      }
    }
  }

  private handleMapEvent(
    event: Y.YMapEvent<Y.Map<GraphNode | GraphEdge>>,
    type: 'node' | 'edge',
    transaction: Y.Transaction
  ): void {
    const local = transaction.origin === this.origin

    event.keysChanged.forEach((key) => {
      const change = event.changes.keys.get(key)
      if (!change) return

      let operation: CRDTOperation | undefined

      switch (change.action) {
        case 'add': {
          const target = type === 'node' ? this.nodes : this.edges
          const value = target.get(key)
          if (value) {
            operation = {
              type: `${type}/add` as const,
              [`${type}Id`]: key,
              [type]: value,
              timestamp: Date.now(),
              origin: String(transaction.origin)
            } as CRDTOperation
          }
          break
        }
        case 'update': {
          const target = type === 'node' ? this.nodes : this.edges
          const newValue = target.get(key)
          const oldValue = change.oldValue
          if (newValue && oldValue) {
            const updates = this.computeUpdates(oldValue, newValue)
            if (Object.keys(updates).length > 0) {
              operation = {
                type: `${type}/update` as const,
                [`${type}Id`]: key,
                updates,
                timestamp: Date.now(),
                origin: String(transaction.origin)
              } as CRDTOperation
            }
          }
          break
        }
        case 'delete': {
          operation = {
            type: `${type}/delete` as const,
            [`${type}Id`]: key,
            timestamp: Date.now(),
            origin: String(transaction.origin)
          } as CRDTOperation
          break
        }
      }

      if (operation) {
        this.emit({ operation, local })
      }
    })
  }

  private computeUpdates(oldValue: unknown, newValue: unknown): Partial<unknown> {
    const updates: Record<string, unknown> = {}
    const oldObj = oldValue as Record<string, unknown>
    const newObj = newValue as Record<string, unknown>

    for (const key in newObj) {
      if (JSON.stringify(oldObj[key]) !== JSON.stringify(newObj[key])) {
        updates[key] = newObj[key]
      }
    }

    return updates
  }

  getDoc(): Y.Doc {
    return this.doc
  }

  getNodes(): Y.Map<GraphNode> {
    return this.nodes
  }

  getEdges(): Y.Map<GraphEdge> {
    return this.edges
  }

  getMetadata(): Y.Map<unknown> {
    return this.metadata
  }

  getOrigin(): string {
    return this.origin
  }

  transact(fn: () => void): void {
    this.doc.transact(fn, this.origin)
  }

  subscribe(listener: CRDTChangeListener): () => void {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }

  private emit(event: CRDTOperationEvent): void {
    this.listeners.forEach((listener) => {
      try {
        listener(event)
      } catch (error) {
        console.error('CRDT listener error:', error)
      }
    })
  }

  getNode(id: string): GraphNode | undefined {
    return this.nodes.get(id)
  }

  getEdge(id: string): GraphEdge | undefined {
    return this.edges.get(id)
  }

  getAllNodes(): GraphNode[] {
    return Array.from(this.nodes.values())
  }

  getAllEdges(): GraphEdge[] {
    return Array.from(this.edges.values())
  }

  hasNode(id: string): boolean {
    return this.nodes.has(id)
  }

  hasEdge(id: string): boolean {
    return this.edges.has(id)
  }

  getGraphMetadata(): GraphMetadata | null {
    const version = this.metadata.get('version') as number | undefined
    const lastModified = this.metadata.get('lastModified') as number | undefined
    const modifiedBy = this.metadata.get('modifiedBy') as string | undefined

    if (version === undefined || lastModified === undefined || modifiedBy === undefined) {
      return null
    }

    return { version, lastModified, modifiedBy }
  }

  setGraphMetadata(metadata: Partial<GraphMetadata>): void {
    this.transact(() => {
      Object.entries(metadata).forEach(([key, value]) => {
        if (value !== undefined) {
          this.metadata.set(key, value)
        }
      })
    })
  }

  onUpdate(callback: (update: Uint8Array, origin: unknown) => void): () => void {
    const handler = (update: Uint8Array, origin: unknown) => callback(update, origin)
    this.doc.on('update', handler)
    return () => {
      this.doc.off('update', handler)
    }
  }

  applyUpdate(update: Uint8Array, origin: unknown): void {
    Y.applyUpdate(this.doc, update, origin)
  }

  encodeStateAsUpdate(targetStateVector?: Uint8Array): Uint8Array {
    return Y.encodeStateAsUpdate(this.doc, targetStateVector)
  }

  destroy(): void {
    this.listeners.clear()
    this.doc.destroy()
  }
}
