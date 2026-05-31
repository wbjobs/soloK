import type { GraphEdge, GraphNode, RenderStyle, Point } from '../types/graph'
import { DEFAULT_STYLE } from '../types/graph'
import { NodeRenderer } from './Node'

export class EdgeRenderer {
  private style: RenderStyle
  private nodeRenderer: NodeRenderer

  constructor(style?: Partial<RenderStyle>) {
    this.style = { ...DEFAULT_STYLE, ...style }
    this.nodeRenderer = new NodeRenderer(style)
  }

  updateStyle(style: Partial<RenderStyle>): void {
    this.style = { ...this.style, ...style }
    this.nodeRenderer.updateStyle(style)
  }

  draw(ctx: CanvasRenderingContext2D, edge: GraphEdge, sourceNode: GraphNode, targetNode: GraphNode, isSelected: boolean = false, isHovered: boolean = false): void {
    const { edgeWidth, arrowSize, nodeGlowBlur } = this.style
    const { color, label, style } = edge

    const edgeColor = color || '#6b7280'

    const sourceCenter = {
      x: sourceNode.x + sourceNode.width / 2,
      y: sourceNode.y + sourceNode.height / 2
    }
    const targetCenter = {
      x: targetNode.x + targetNode.width / 2,
      y: targetNode.y + targetNode.height / 2
    }

    const startPoint = this.nodeRenderer.getConnectionPoint(sourceNode, targetCenter)
    const endPoint = this.nodeRenderer.getConnectionPoint(targetNode, sourceCenter)

    const controlPoints = this.getBezierControlPoints(startPoint, endPoint)

    ctx.save()

    const lineWidth = edgeWidth

    if (isSelected || isHovered) {
      ctx.shadowColor = edgeColor
      ctx.shadowBlur = nodeGlowBlur
    }

    ctx.beginPath()
    ctx.moveTo(startPoint.x, startPoint.y)
    ctx.bezierCurveTo(
      controlPoints.cp1.x, controlPoints.cp1.y,
      controlPoints.cp2.x, controlPoints.cp2.y,
      endPoint.x, endPoint.y
    )

    ctx.strokeStyle = edgeColor
    ctx.lineWidth = lineWidth
    ctx.lineCap = 'round'

    if (style === 'dashed') {
      ctx.setLineDash([8, 4])
    } else if (style === 'dotted') {
      ctx.setLineDash([2, 4])
    } else {
      ctx.setLineDash([])
    }

    ctx.stroke()
    ctx.setLineDash([])

    if (isSelected) {
      ctx.shadowBlur = 0
      ctx.strokeStyle = '#ffffff'
      ctx.lineWidth = lineWidth + 3
      ctx.stroke()

      ctx.strokeStyle = edgeColor
      ctx.lineWidth = lineWidth
      if (style === 'dashed') {
        ctx.setLineDash([8, 4])
      } else if (style === 'dotted') {
        ctx.setLineDash([2, 4])
      } else {
        ctx.setLineDash([5, 3])
      }
      ctx.stroke()
      ctx.setLineDash([])
    }

    ctx.shadowBlur = 0
    this.drawArrowhead(ctx, endPoint, controlPoints.cp2, edgeColor, arrowSize)

    if (label) {
      this.drawLabel(ctx, label, startPoint, endPoint, controlPoints, edgeColor)
    }

    ctx.restore()
  }

  private getBezierControlPoints(start: Point, end: Point): { cp1: Point; cp2: Point } {
    const dx = end.x - start.x
    const dy = end.y - start.y
    const distance = Math.sqrt(dx * dx + dy * dy)
    const controlOffset = distance * 0.4

    const perpX = -dy / distance * controlOffset
    const perpY = dx / distance * controlOffset

    return {
      cp1: {
        x: start.x + dx * 0.3 + perpX,
        y: start.y + dy * 0.3 + perpY
      },
      cp2: {
        x: end.x - dx * 0.3 + perpX,
        y: end.y - dy * 0.3 + perpY
      }
    }
  }

  private drawArrowhead(ctx: CanvasRenderingContext2D, end: Point, control: Point, color: string, size: number): void {
    const angle = Math.atan2(end.y - control.y, end.x - control.x)

    ctx.beginPath()
    ctx.moveTo(end.x, end.y)
    ctx.lineTo(
      end.x - size * Math.cos(angle - Math.PI / 6),
      end.y - size * Math.sin(angle - Math.PI / 6)
    )
    ctx.lineTo(
      end.x - size * Math.cos(angle + Math.PI / 6),
      end.y - size * Math.sin(angle + Math.PI / 6)
    )
    ctx.closePath()

    ctx.fillStyle = color
    ctx.fill()
    ctx.strokeStyle = color
    ctx.lineWidth = 1
    ctx.stroke()
  }

  private drawLabel(ctx: CanvasRenderingContext2D, label: string, start: Point, end: Point, controlPoints: { cp1: Point; cp2: Point }, color: string): void {
    const t = 0.5
    const mt = 1 - t

    const x = mt * mt * mt * start.x + 3 * mt * mt * t * controlPoints.cp1.x + 3 * mt * t * t * controlPoints.cp2.x + t * t * t * end.x
    const y = mt * mt * mt * start.y + 3 * mt * mt * t * controlPoints.cp1.y + 3 * mt * t * t * controlPoints.cp2.y + t * t * t * end.y

    ctx.font = '12px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'

    const padding = 6
    const textMetrics = ctx.measureText(label)
    const textWidth = textMetrics.width
    const textHeight = 16

    const bgX = x - textWidth / 2 - padding
    const bgY = y - textHeight / 2
    const bgWidth = textWidth + padding * 2
    const bgHeight = textHeight

    ctx.fillStyle = 'rgba(255, 255, 255, 0.95)'
    ctx.beginPath()
    this.drawRoundedRect(ctx, bgX, bgY, bgWidth, bgHeight, 4)
    ctx.fill()

    ctx.strokeStyle = color
    ctx.lineWidth = 1
    ctx.stroke()

    ctx.fillStyle = '#374151'
    ctx.fillText(label, x, y)
  }

  private drawRoundedRect(ctx: CanvasRenderingContext2D, x: number, y: number, width: number, height: number, radius: number): void {
    ctx.beginPath()
    ctx.moveTo(x + radius, y)
    ctx.lineTo(x + width - radius, y)
    ctx.quadraticCurveTo(x + width, y, x + width, y + radius)
    ctx.lineTo(x + width, y + height - radius)
    ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height)
    ctx.lineTo(x + radius, y + height)
    ctx.quadraticCurveTo(x, y + height, x, y + height - radius)
    ctx.lineTo(x, y + radius)
    ctx.quadraticCurveTo(x, y, x + radius, y)
    ctx.closePath()
  }

  getDistanceToPoint(_edge: GraphEdge, sourceNode: GraphNode, targetNode: GraphNode, point: Point): number {
    const sourceCenter = {
      x: sourceNode.x + sourceNode.width / 2,
      y: sourceNode.y + sourceNode.height / 2
    }
    const targetCenter = {
      x: targetNode.x + targetNode.width / 2,
      y: targetNode.y + targetNode.height / 2
    }

    const startPoint = this.nodeRenderer.getConnectionPoint(sourceNode, targetCenter)
    const endPoint = this.nodeRenderer.getConnectionPoint(targetNode, sourceCenter)

    const controlPoints = this.getBezierControlPoints(startPoint, endPoint)

    return this.getDistanceToBezier(point, startPoint, controlPoints.cp1, controlPoints.cp2, endPoint)
  }

  private getDistanceToBezier(p: Point, p0: Point, p1: Point, p2: Point, p3: Point): number {
    let minDistance = Infinity
    const steps = 20

    for (let i = 0; i <= steps; i++) {
      const t = i / steps
      const mt = 1 - t

      const x = mt * mt * mt * p0.x + 3 * mt * mt * t * p1.x + 3 * mt * t * t * p2.x + t * t * t * p3.x
      const y = mt * mt * mt * p0.y + 3 * mt * mt * t * p1.y + 3 * mt * t * t * p2.y + t * t * t * p3.y

      const dx = p.x - x
      const dy = p.y - y
      const distance = Math.sqrt(dx * dx + dy * dy)

      if (distance < minDistance) {
        minDistance = distance
      }
    }

    return minDistance
  }

  hitTest(edge: GraphEdge, sourceNode: GraphNode, targetNode: GraphNode, point: Point, threshold: number = 8): boolean {
    const distance = this.getDistanceToPoint(edge, sourceNode, targetNode, point)
    return distance <= threshold
  }
}
