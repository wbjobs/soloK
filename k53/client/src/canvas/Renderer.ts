import type { GraphNode, GraphEdge, GraphData, RenderStyle, Point, Rect } from '../types/graph'
import { DEFAULT_STYLE } from '../types/graph'
import { Viewport } from './Viewport'
import { NodeRenderer } from './Node'
import { EdgeRenderer } from './Edge'

export interface RendererOptions {
  style?: Partial<RenderStyle>
  onNodeClick?: (node: GraphNode, event: MouseEvent) => void
  onNodeDoubleClick?: (node: GraphNode, event: MouseEvent) => void
  onEdgeClick?: (edge: GraphEdge, event: MouseEvent) => void
  onEdgeDoubleClick?: (edge: GraphEdge, event: MouseEvent) => void
  onCanvasClick?: (event: MouseEvent) => void
  onSelectionChange?: (selectedIds: string[]) => void
  onViewportChange?: (viewport: Viewport) => void
  onNodeDragStart?: (node: GraphNode, event: MouseEvent) => void
  onNodeDrag?: (node: GraphNode, event: MouseEvent) => void
  onNodeDragEnd?: (node: GraphNode, event: MouseEvent) => void
}

export class Renderer {
  private canvas: HTMLCanvasElement
  private ctx: CanvasRenderingContext2D
  private viewport: Viewport
  private nodeRenderer: NodeRenderer
  private edgeRenderer: EdgeRenderer
  private style: RenderStyle

  private nodes: GraphNode[] = []
  private edges: GraphEdge[] = []
  private nodeMap: Map<string, GraphNode> = new Map()
  private edgeMap: Map<string, GraphEdge> = new Map()

  private selectedIds: Set<string> = new Set()
  private hoveredId: string | null = null
  private draggingNode: GraphNode | null = null
  private dragOffset: Point = { x: 0, y: 0 }
  private isPanning: boolean = false
  private panStart: Point = { x: 0, y: 0 }
  private viewportStart: Point = { x: 0, y: 0 }
  private lockedNodes: Map<string, { userName: string; color: string }> = new Map()

  private animationFrameId: number | null = null
  private needsRender: boolean = true
  private isRunning: boolean = false

  private options: RendererOptions

  constructor(canvas: HTMLCanvasElement, options: RendererOptions = {}) {
    this.canvas = canvas
    const ctx = canvas.getContext('2d')
    if (!ctx) {
      throw new Error('Failed to get 2d context')
    }
    this.ctx = ctx

    this.style = { ...DEFAULT_STYLE, ...options.style }
    this.viewport = new Viewport(canvas.width, canvas.height)
    this.nodeRenderer = new NodeRenderer(this.style)
    this.edgeRenderer = new EdgeRenderer(this.style)
    this.options = options

    this.setupEventListeners()
  }

  private setupEventListeners(): void {
    this.canvas.addEventListener('mousedown', this.handleMouseDown)
    this.canvas.addEventListener('mousemove', this.handleMouseMove)
    this.canvas.addEventListener('mouseup', this.handleMouseUp)
    this.canvas.addEventListener('mouseleave', this.handleMouseUp)
    this.canvas.addEventListener('wheel', this.handleWheel)
    this.canvas.addEventListener('click', this.handleClick)
    this.canvas.addEventListener('dblclick', this.handleDoubleClick)
    this.canvas.addEventListener('contextmenu', this.handleContextMenu)
  }

  private removeEventListeners(): void {
    this.canvas.removeEventListener('mousedown', this.handleMouseDown)
    this.canvas.removeEventListener('mousemove', this.handleMouseMove)
    this.canvas.removeEventListener('mouseup', this.handleMouseUp)
    this.canvas.removeEventListener('mouseleave', this.handleMouseUp)
    this.canvas.removeEventListener('wheel', this.handleWheel)
    this.canvas.removeEventListener('click', this.handleClick)
    this.canvas.removeEventListener('dblclick', this.handleDoubleClick)
    this.canvas.removeEventListener('contextmenu', this.handleContextMenu)
  }

  private handleMouseDown = (e: MouseEvent): void => {
    const rect = this.canvas.getBoundingClientRect()
    const screenX = e.clientX - rect.left
    const screenY = e.clientY - rect.top
    const worldPos = this.viewport.screenToWorld(screenX, screenY)

    const clickedNode = this.getNodeAtPoint(worldPos)

    if (e.button === 0) {
      if (clickedNode) {
        this.draggingNode = clickedNode
        this.dragOffset = {
          x: worldPos.x - clickedNode.x,
          y: worldPos.y - clickedNode.y
        }
        if (!this.selectedIds.has(clickedNode.id)) {
          if (!e.shiftKey) {
            this.selectedIds.clear()
          }
          this.selectedIds.add(clickedNode.id)
          this.notifySelectionChange()
        }
        this.options.onNodeDragStart?.(clickedNode, e)
      } else if (e.shiftKey || Number(e.button) === 1) {
        this.isPanning = true
        this.panStart = { x: screenX, y: screenY }
        this.viewportStart = { x: this.viewport.x, y: this.viewport.y }
      } else {
        this.selectedIds.clear()
        this.notifySelectionChange()
      }
    }

    this.requestRender()
  }

  private handleMouseMove = (e: MouseEvent): void => {
    const rect = this.canvas.getBoundingClientRect()
    const screenX = e.clientX - rect.left
    const screenY = e.clientY - rect.top
    const worldPos = this.viewport.screenToWorld(screenX, screenY)

    if (this.draggingNode) {
      const newX = worldPos.x - this.dragOffset.x
      const newY = worldPos.y - this.dragOffset.y

      this.draggingNode.x = newX
      this.draggingNode.y = newY

      this.options.onNodeDrag?.(this.draggingNode, e)
      this.requestRender()
    } else if (this.isPanning) {
      const dx = screenX - this.panStart.x
      const dy = screenY - this.panStart.y
      this.viewport.x = this.viewportStart.x + dx
      this.viewport.y = this.viewportStart.y + dy
      this.options.onViewportChange?.(this.viewport)
      this.requestRender()
    } else {
      const hoveredNode = this.getNodeAtPoint(worldPos)
      const hoveredEdge = hoveredNode ? null : this.getEdgeAtPoint(worldPos)
      const newHoveredId = hoveredNode?.id || hoveredEdge?.id || null

      if (newHoveredId !== this.hoveredId) {
        this.hoveredId = newHoveredId
        this.canvas.style.cursor = this.hoveredId ? 'pointer' : this.isPanning ? 'grabbing' : 'grab'
        this.requestRender()
      }
    }
  }

  private handleMouseUp = (e: MouseEvent): void => {
    if (this.draggingNode) {
      this.options.onNodeDragEnd?.(this.draggingNode, e)
      this.draggingNode = null
    }
    this.isPanning = false
    this.requestRender()
  }

  private handleWheel = (e: WheelEvent): void => {
    e.preventDefault()
    const rect = this.canvas.getBoundingClientRect()
    const screenX = e.clientX - rect.left
    const screenY = e.clientY - rect.top

    const delta = e.deltaY > 0 ? 0.9 : 1.1
    this.viewport.zoom(delta, screenX, screenY)

    this.options.onViewportChange?.(this.viewport)
    this.requestRender()
  }

  private handleClick = (e: MouseEvent): void => {
    const rect = this.canvas.getBoundingClientRect()
    const screenX = e.clientX - rect.left
    const screenY = e.clientY - rect.top
    const worldPos = this.viewport.screenToWorld(screenX, screenY)

    const clickedNode = this.getNodeAtPoint(worldPos)
    const clickedEdge = clickedNode ? null : this.getEdgeAtPoint(worldPos)

    if (clickedNode) {
      this.options.onNodeClick?.(clickedNode, e)
    } else if (clickedEdge) {
      if (!e.shiftKey) {
        this.selectedIds.clear()
      }
      this.selectedIds.add(clickedEdge.id)
      this.notifySelectionChange()
      this.options.onEdgeClick?.(clickedEdge, e)
    } else {
      this.options.onCanvasClick?.(e)
    }
  }

  private handleDoubleClick = (e: MouseEvent): void => {
    const rect = this.canvas.getBoundingClientRect()
    const screenX = e.clientX - rect.left
    const screenY = e.clientY - rect.top
    const worldPos = this.viewport.screenToWorld(screenX, screenY)

    const clickedNode = this.getNodeAtPoint(worldPos)
    const clickedEdge = clickedNode ? null : this.getEdgeAtPoint(worldPos)

    if (clickedNode) {
      this.options.onNodeDoubleClick?.(clickedNode, e)
    } else if (clickedEdge) {
      this.options.onEdgeDoubleClick?.(clickedEdge, e)
    }
  }

  private handleContextMenu = (e: Event): void => {
    e.preventDefault()
  }

  private notifySelectionChange(): void {
    this.options.onSelectionChange?.(Array.from(this.selectedIds))
  }

  private getNodeAtPoint(point: Point): GraphNode | null {
    for (let i = this.nodes.length - 1; i >= 0; i--) {
      const node = this.nodes[i]
      if (this.nodeRenderer.containsPoint(node, point)) {
        return node
      }
    }
    return null
  }

  private getEdgeAtPoint(point: Point): GraphEdge | null {
    for (let i = this.edges.length - 1; i >= 0; i--) {
      const edge = this.edges[i]
      const sourceNode = this.nodeMap.get(edge.source)
      const targetNode = this.nodeMap.get(edge.target)
      if (sourceNode && targetNode) {
        if (this.edgeRenderer.hitTest(edge, sourceNode, targetNode, point)) {
          return edge
        }
      }
    }
    return null
  }

  setData(data: GraphData): void {
    this.nodes = Object.values(data.nodes)
    this.edges = Object.values(data.edges)
    this.nodeMap.clear()
    this.edgeMap.clear()
    this.nodes.forEach(node => {
      this.nodeMap.set(node.id, node)
    })
    this.edges.forEach(edge => {
      this.edgeMap.set(edge.id, edge)
    })
    this.requestRender()
  }

  addNode(node: GraphNode): void {
    this.nodes.push(node)
    this.nodeMap.set(node.id, node)
    this.requestRender()
  }

  updateNode(nodeId: string, updates: Partial<GraphNode>): void {
    const node = this.nodeMap.get(nodeId)
    if (node) {
      Object.assign(node, updates)
      this.requestRender()
    }
  }

  removeNode(nodeId: string): void {
    this.nodes = this.nodes.filter(n => n.id !== nodeId)
    this.nodeMap.delete(nodeId)
    this.edges = this.edges.filter(e => e.source !== nodeId && e.target !== nodeId)
    this.edges.forEach(e => {
      if (e.source === nodeId || e.target === nodeId) {
        this.edgeMap.delete(e.id)
      }
    })
    this.selectedIds.delete(nodeId)
    this.requestRender()
  }

  addEdge(edge: GraphEdge): void {
    this.edges.push(edge)
    this.edgeMap.set(edge.id, edge)
    this.requestRender()
  }

  updateEdge(edgeId: string, updates: Partial<GraphEdge>): void {
    const edge = this.edgeMap.get(edgeId)
    if (edge) {
      Object.assign(edge, updates)
      this.requestRender()
    }
  }

  removeEdge(edgeId: string): void {
    this.edges = this.edges.filter(e => e.id !== edgeId)
    this.edgeMap.delete(edgeId)
    this.selectedIds.delete(edgeId)
    this.requestRender()
  }

  select(ids: string[]): void {
    this.selectedIds = new Set(ids)
    this.notifySelectionChange()
    this.requestRender()
  }

  setNodeLocked(nodeId: string, isLocked: boolean, userName: string = '', color: string = '#f59e0b'): void {
    if (isLocked) {
      this.lockedNodes.set(nodeId, { userName, color })
    } else {
      this.lockedNodes.delete(nodeId)
    }
    this.requestRender()
  }

  isNodeLocked(nodeId: string): boolean {
    return this.lockedNodes.has(nodeId)
  }

  clearLockedNodes(): void {
    this.lockedNodes.clear()
    this.requestRender()
  }

  clearSelection(): void {
    this.selectedIds.clear()
    this.notifySelectionChange()
    this.requestRender()
  }

  getSelection(): string[] {
    return Array.from(this.selectedIds)
  }

  getViewport(): Viewport {
    return this.viewport
  }

  setSize(width: number, height: number): void {
    this.canvas.width = width
    this.canvas.height = height
    this.viewport.setSize(width, height)
    this.requestRender()
  }

  updateStyle(style: Partial<RenderStyle>): void {
    this.style = { ...this.style, ...style }
    this.nodeRenderer.updateStyle(style)
    this.edgeRenderer.updateStyle(style)
    this.requestRender()
  }

  fitView(): void {
    if (this.nodes.length === 0) return

    let minX = Infinity, minY = Infinity
    let maxX = -Infinity, maxY = -Infinity

    this.nodes.forEach(node => {
      minX = Math.min(minX, node.x)
      minY = Math.min(minY, node.y)
      maxX = Math.max(maxX, node.x + node.width)
      maxY = Math.max(maxY, node.y + node.height)
    })

    const contentRect: Rect = {
      x: minX,
      y: minY,
      width: maxX - minX,
      height: maxY - minY
    }

    this.viewport.fitToContent(contentRect)
    this.options.onViewportChange?.(this.viewport)
    this.requestRender()
  }

  resetView(): void {
    this.viewport.reset()
    this.options.onViewportChange?.(this.viewport)
    this.requestRender()
  }

  start(): void {
    if (this.isRunning) return
    this.isRunning = true
    this.animationLoop()
  }

  stop(): void {
    this.isRunning = false
    if (this.animationFrameId !== null) {
      cancelAnimationFrame(this.animationFrameId)
      this.animationFrameId = null
    }
  }

  destroy(): void {
    this.stop()
    this.removeEventListeners()
  }

  requestRender(): void {
    this.needsRender = true
  }

  private animationLoop = (): void => {
    if (!this.isRunning) return

    if (this.needsRender) {
      this.render()
      this.needsRender = false
    }

    this.animationFrameId = requestAnimationFrame(this.animationLoop)
  }

  private render(): void {
    const { width, height } = this.canvas
    const ctx = this.ctx

    ctx.clearRect(0, 0, width, height)

    this.drawBackground(ctx)
    this.drawGrid(ctx)

    ctx.save()
    this.viewport.applyTransform(ctx)

    const visibleEdges = this.edges.filter(edge => {
      const sourceNode = this.nodeMap.get(edge.source)
      const targetNode = this.nodeMap.get(edge.target)
      if (!sourceNode || !targetNode) return false

      const edgeBounds = this.getEdgeBounds(sourceNode, targetNode)
      return this.viewport.isRectVisible(edgeBounds)
    })

    const visibleNodes = this.nodes.filter(node => {
      const nodeRect = this.nodeRenderer.getNodeRect(node)
      return this.viewport.isRectVisible(nodeRect)
    })

    visibleEdges.forEach(edge => {
      const sourceNode = this.nodeMap.get(edge.source)
      const targetNode = this.nodeMap.get(edge.target)
      if (sourceNode && targetNode) {
        const isSelected = this.selectedIds.has(edge.id)
        const isHovered = this.hoveredId === edge.id
        this.edgeRenderer.draw(ctx, edge, sourceNode, targetNode, isSelected, isHovered)
      }
    })

    visibleNodes.forEach(node => {
      const isSelected = this.selectedIds.has(node.id)
      const isHovered = this.hoveredId === node.id
      const lockInfo = this.lockedNodes.get(node.id)
      this.nodeRenderer.draw(ctx, node, isSelected, isHovered, lockInfo)
    })

    ctx.restore()
  }

  private getEdgeBounds(sourceNode: GraphNode, targetNode: GraphNode): Rect {
    const minX = Math.min(sourceNode.x, targetNode.x)
    const minY = Math.min(sourceNode.y, targetNode.y)
    const maxX = Math.max(sourceNode.x + sourceNode.width, targetNode.x + targetNode.width)
    const maxY = Math.max(sourceNode.y + sourceNode.height, targetNode.y + targetNode.height)
    return {
      x: minX,
      y: minY,
      width: maxX - minX,
      height: maxY - minY
    }
  }

  private drawBackground(ctx: CanvasRenderingContext2D): void {
    ctx.fillStyle = this.style.backgroundColor
    ctx.fillRect(0, 0, this.canvas.width, this.canvas.height)
  }

  private drawGrid(ctx: CanvasRenderingContext2D): void {
    const { gridSize, gridColor } = this.style
    const { x, y, scale, width, height } = this.viewport

    if (scale < 0.3) return

    const scaledGridSize = gridSize * scale

    const startX = -((x % scaledGridSize) + scaledGridSize) % scaledGridSize
    const startY = -((y % scaledGridSize) + scaledGridSize) % scaledGridSize

    ctx.strokeStyle = gridColor
    ctx.lineWidth = 1

    ctx.beginPath()
    for (let sx = startX; sx < width; sx += scaledGridSize) {
      ctx.moveTo(sx, 0)
      ctx.lineTo(sx, height)
    }
    for (let sy = startY; sy < height; sy += scaledGridSize) {
      ctx.moveTo(0, sy)
      ctx.lineTo(width, sy)
    }
    ctx.stroke()

    if (scale >= 0.8) {
      const majorGridSize = scaledGridSize * 5
      const majorStartX = -((x % majorGridSize) + majorGridSize) % majorGridSize
      const majorStartY = -((y % majorGridSize) + majorGridSize) % majorGridSize

      ctx.strokeStyle = this.darkenColor(gridColor, 10)
      ctx.lineWidth = 1.5

      ctx.beginPath()
      for (let sx = majorStartX; sx < width; sx += majorGridSize) {
        ctx.moveTo(sx, 0)
        ctx.lineTo(sx, height)
      }
      for (let sy = majorStartY; sy < height; sy += majorGridSize) {
        ctx.moveTo(0, sy)
        ctx.lineTo(width, sy)
      }
      ctx.stroke()
    }
  }

  private darkenColor(color: string, percent: number): string {
    const num = parseInt(color.replace('#', ''), 16)
    const amt = Math.round(2.55 * percent)
    const R = Math.max(0, (num >> 16) - amt)
    const G = Math.max(0, ((num >> 8) & 0x00ff) - amt)
    const B = Math.max(0, (num & 0x0000ff) - amt)
    return `#${((1 << 24) + (R << 16) + (G << 8) + B).toString(16).slice(1)}`
  }
}
