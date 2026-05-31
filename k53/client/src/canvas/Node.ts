import type { GraphNode, RenderStyle, Point, Rect } from '../types/graph'
import { DEFAULT_STYLE, NODE_COLORS } from '../types/graph'

export class NodeRenderer {
  private style: RenderStyle

  constructor(style?: Partial<RenderStyle>) {
    this.style = { ...DEFAULT_STYLE, ...style }
  }

  updateStyle(style: Partial<RenderStyle>): void {
    this.style = { ...this.style, ...style }
  }

  draw(
    ctx: CanvasRenderingContext2D,
    node: GraphNode,
    isSelected: boolean = false,
    isHovered: boolean = false,
    lockInfo?: { userName: string; color: string }
  ): void {
    const { x, y, width, height, color, label, type } = node
    const { nodeCornerRadius, nodeBorderWidth, nodeGlowBlur } = this.style
    const nodeColor = color || NODE_COLORS[type]

    ctx.save()

    if (isSelected || isHovered) {
      ctx.shadowColor = nodeColor
      ctx.shadowBlur = nodeGlowBlur
    }

    if (lockInfo) {
      ctx.shadowBlur = 8
      ctx.shadowColor = lockInfo.color
    }

    this.drawRoundedRect(ctx, x, y, width, height, nodeCornerRadius)

    const gradient = ctx.createLinearGradient(x, y, x, y + height)
    gradient.addColorStop(0, this.lightenColor(nodeColor, 20))
    gradient.addColorStop(1, nodeColor)
    ctx.fillStyle = gradient
    ctx.fill()

    if (lockInfo) {
      ctx.shadowBlur = 0
      ctx.strokeStyle = lockInfo.color
      ctx.lineWidth = nodeBorderWidth + 3
      ctx.stroke()
    } else if (isSelected) {
      ctx.shadowBlur = 0
      ctx.strokeStyle = '#ffffff'
      ctx.lineWidth = nodeBorderWidth + 2
      ctx.stroke()

      ctx.strokeStyle = nodeColor
      ctx.lineWidth = nodeBorderWidth
      ctx.setLineDash([5, 3])
      ctx.stroke()
      ctx.setLineDash([])
    } else if (isHovered) {
      ctx.shadowBlur = 0
      ctx.strokeStyle = '#ffffff'
      ctx.lineWidth = nodeBorderWidth + 1
      ctx.stroke()

      ctx.strokeStyle = nodeColor
      ctx.lineWidth = nodeBorderWidth
      ctx.stroke()
    } else {
      ctx.shadowBlur = 0
      ctx.strokeStyle = this.darkenColor(nodeColor, 15)
      ctx.lineWidth = nodeBorderWidth
      ctx.stroke()
    }

    ctx.fillStyle = '#ffffff'
    ctx.font = '14px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'

    const maxTextWidth = width - 20
    const displayLabel = this.truncateText(ctx, label, maxTextWidth)
    ctx.fillText(displayLabel, x + width / 2, y + height / 2)

    if (lockInfo && lockInfo.userName) {
      ctx.shadowBlur = 0
      ctx.fillStyle = lockInfo.color
      const badgeRadius = 8
      const badgeX = x + width
      const badgeY = y

      ctx.beginPath()
      ctx.arc(badgeX, badgeY, badgeRadius, 0, Math.PI * 2)
      ctx.fill()

      ctx.strokeStyle = '#ffffff'
      ctx.lineWidth = 2
      ctx.stroke()

      ctx.fillStyle = '#ffffff'
      ctx.font = 'bold 10px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillText(lockInfo.userName.charAt(0).toUpperCase(), badgeX, badgeY)
    }

    ctx.restore()
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

  containsPoint(node: GraphNode, point: Point): boolean {
    return (
      point.x >= node.x &&
      point.x <= node.x + node.width &&
      point.y >= node.y &&
      point.y <= node.y + node.height
    )
  }

  intersectsRect(node: GraphNode, rect: Rect): boolean {
    return (
      node.x < rect.x + rect.width &&
      node.x + node.width > rect.x &&
      node.y < rect.y + rect.height &&
      node.y + node.height > rect.y
    )
  }

  getNodeRect(node: GraphNode): Rect {
    return {
      x: node.x,
      y: node.y,
      width: node.width,
      height: node.height
    }
  }

  getConnectionPoint(node: GraphNode, targetPoint: Point): Point {
    const centerX = node.x + node.width / 2
    const centerY = node.y + node.height / 2

    const dx = targetPoint.x - centerX
    const dy = targetPoint.y - centerY

    if (dx === 0 && dy === 0) {
      return { x: centerX, y: centerY }
    }

    const halfWidth = node.width / 2
    const halfHeight = node.height / 2

    const scale = Math.min(halfWidth / Math.abs(dx || 1), halfHeight / Math.abs(dy || 1))

    return {
      x: centerX + dx * scale,
      y: centerY + dy * scale
    }
  }

  private lightenColor(color: string, percent: number): string {
    const num = parseInt(color.replace('#', ''), 16)
    const amt = Math.round(2.55 * percent)
    const R = Math.min(255, (num >> 16) + amt)
    const G = Math.min(255, ((num >> 8) & 0x00ff) + amt)
    const B = Math.min(255, (num & 0x0000ff) + amt)
    return `#${((1 << 24) + (R << 16) + (G << 8) + B).toString(16).slice(1)}`
  }

  private darkenColor(color: string, percent: number): string {
    const num = parseInt(color.replace('#', ''), 16)
    const amt = Math.round(2.55 * percent)
    const R = Math.max(0, (num >> 16) - amt)
    const G = Math.max(0, ((num >> 8) & 0x00ff) - amt)
    const B = Math.max(0, (num & 0x0000ff) - amt)
    return `#${((1 << 24) + (R << 16) + (G << 8) + B).toString(16).slice(1)}`
  }

  private truncateText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string {
    if (ctx.measureText(text).width <= maxWidth) {
      return text
    }

    let truncated = text
    while (truncated.length > 1 && ctx.measureText(truncated + '...').width > maxWidth) {
      truncated = truncated.slice(0, -1)
    }
    return truncated + '...'
  }
}
