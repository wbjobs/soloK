import type { Point, Rect } from '../types/graph'

export class Viewport {
  x: number = 0
  y: number = 0
  scale: number = 1
  width: number = 0
  height: number = 0

  private minScale: number = 0.1
  private maxScale: number = 5

  constructor(width: number = 0, height: number = 0) {
    this.width = width
    this.height = height
  }

  setSize(width: number, height: number): void {
    this.width = width
    this.height = height
  }

  pan(dx: number, dy: number): void {
    this.x += dx
    this.y += dy
  }

  setPosition(x: number, y: number): void {
    this.x = x
    this.y = y
  }

  zoom(factor: number, centerX: number = this.width / 2, centerY: number = this.height / 2): void {
    const worldX = (centerX - this.x) / this.scale
    const worldY = (centerY - this.y) / this.scale

    const newScale = Math.max(this.minScale, Math.min(this.maxScale, this.scale * factor))
    const actualFactor = newScale / this.scale

    this.scale = newScale
    this.x = centerX - worldX * this.scale
    this.y = centerY - worldY * this.scale

    void actualFactor
  }

  setScale(scale: number, centerX: number = this.width / 2, centerY: number = this.height / 2): void {
    const clampedScale = Math.max(this.minScale, Math.min(this.maxScale, scale))
    const worldX = (centerX - this.x) / this.scale
    const worldY = (centerY - this.y) / this.scale

    this.scale = clampedScale
    this.x = centerX - worldX * this.scale
    this.y = centerY - worldY * this.scale
  }

  screenToWorld(screenX: number, screenY: number): Point {
    return {
      x: (screenX - this.x) / this.scale,
      y: (screenY - this.y) / this.scale
    }
  }

  worldToScreen(worldX: number, worldY: number): Point {
    return {
      x: worldX * this.scale + this.x,
      y: worldY * this.scale + this.y
    }
  }

  getVisibleRect(): Rect {
    const topLeft = this.screenToWorld(0, 0)
    const bottomRight = this.screenToWorld(this.width, this.height)
    return {
      x: topLeft.x,
      y: topLeft.y,
      width: bottomRight.x - topLeft.x,
      height: bottomRight.y - topLeft.y
    }
  }

  isRectVisible(rect: Rect, padding: number = 50): boolean {
    const visible = this.getVisibleRect()
    const paddedX = rect.x - padding
    const paddedY = rect.y - padding
    const paddedWidth = rect.width + padding * 2
    const paddedHeight = rect.height + padding * 2

    return (
      paddedX < visible.x + visible.width &&
      paddedX + paddedWidth > visible.x &&
      paddedY < visible.y + visible.height &&
      paddedY + paddedHeight > visible.y
    )
  }

  fitToContent(contentRect: Rect, padding: number = 100): void {
    const scaleX = (this.width - padding * 2) / contentRect.width
    const scaleY = (this.height - padding * 2) / contentRect.height
    this.scale = Math.max(this.minScale, Math.min(this.maxScale, Math.min(scaleX, scaleY)))

    const centerX = contentRect.x + contentRect.width / 2
    const centerY = contentRect.y + contentRect.height / 2
    this.x = this.width / 2 - centerX * this.scale
    this.y = this.height / 2 - centerY * this.scale
  }

  reset(): void {
    this.x = 0
    this.y = 0
    this.scale = 1
  }

  clone(): Viewport {
    const viewport = new Viewport(this.width, this.height)
    viewport.x = this.x
    viewport.y = this.y
    viewport.scale = this.scale
    return viewport
  }

  applyTransform(ctx: CanvasRenderingContext2D): void {
    ctx.translate(this.x, this.y)
    ctx.scale(this.scale, this.scale)
  }
}
