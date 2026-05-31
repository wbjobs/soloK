import { mouse, Button, Point, straightTo } from '@nut-tree/nut-js';
import type { MouseClickAction, MouseDragAction, MouseScrollAction } from '../../shared/index';
import {
  type MouseButton,
  type ScrollDirection,
  type Point as PointType,
  type MouseClickOptions,
  type MouseDragOptions,
  MOUSE_BUTTON_MAP,
} from './types';

export class MouseSimulator {
  constructor() {
    mouse.config.autoDelayMs = 10;
    mouse.config.mouseSpeed = 1000;
  }

  async simulateClick(action: MouseClickAction): Promise<void> {
    const { button, x, y, doubleClick = false } = action;
    await this.click(button, { doubleClick }, x, y);
  }

  async simulateDrag(action: MouseDragAction): Promise<void> {
    const { fromX, fromY, toX, toY, button, duration = 300 } = action;
    await this.drag({ x: fromX, y: fromY }, { x: toX, y: toY }, button, { duration });
  }

  async simulateScroll(action: MouseScrollAction): Promise<void> {
    const { direction, amount } = action;
    await this.scroll(direction, amount);
  }

  async click(
    button: MouseButton,
    options: MouseClickOptions = {},
    x?: number,
    y?: number,
  ): Promise<void> {
    const { doubleClick = false } = options;

    if (x !== undefined && y !== undefined) {
      await this.moveTo(x, y);
    }

    const nutButton = this.buttonToEnum(button);

    if (doubleClick) {
      await mouse.doubleClick(nutButton);
    } else {
      await mouse.click(nutButton);
    }
  }

  async moveTo(x: number, y: number): Promise<void> {
    const target = new Point(x, y);
    await mouse.move(straightTo(target));
  }

  async setPosition(x: number, y: number): Promise<void> {
    const target = new Point(x, y);
    await mouse.setPosition(target);
  }

  async getPosition(): Promise<PointType> {
    const pos = await mouse.getPosition();
    return { x: pos.x, y: pos.y };
  }

  async drag(
    from: PointType,
    to: PointType,
    button: MouseButton,
    options: MouseDragOptions = {},
  ): Promise<void> {
    const { duration } = options;
    const nutButton = this.buttonToEnum(button);

    const fromPoint = new Point(from.x, from.y);
    const toPoint = new Point(to.x, to.y);

    const originalSpeed = mouse.config.mouseSpeed;

    if (duration !== undefined && duration > 0) {
      const distance = Math.sqrt(
        Math.pow(to.x - from.x, 2) + Math.pow(to.y - from.y, 2),
      );
      const speed = Math.max(100, (distance / duration) * 1000);
      mouse.config.mouseSpeed = speed;
    }

    await mouse.setPosition(fromPoint);
    await mouse.pressButton(nutButton);
    await mouse.move(straightTo(toPoint));
    await mouse.releaseButton(nutButton);

    mouse.config.mouseSpeed = originalSpeed;
  }

  async scroll(direction: ScrollDirection, amount: number): Promise<void> {
    switch (direction) {
      case 'up':
        await mouse.scrollUp(amount);
        break;
      case 'down':
        await mouse.scrollDown(amount);
        break;
      case 'left':
        await mouse.scrollLeft(amount);
        break;
      case 'right':
        await mouse.scrollRight(amount);
        break;
    }
  }

  async pressButton(button: MouseButton): Promise<void> {
    const nutButton = this.buttonToEnum(button);
    await mouse.pressButton(nutButton);
  }

  async releaseButton(button: MouseButton): Promise<void> {
    const nutButton = this.buttonToEnum(button);
    await mouse.releaseButton(nutButton);
  }

  private buttonToEnum(button: MouseButton): Button {
    const mapped = MOUSE_BUTTON_MAP[button];
    switch (mapped) {
      case 'left':
        return Button.LEFT;
      case 'right':
        return Button.RIGHT;
      case 'middle':
        return Button.MIDDLE;
      default:
        return Button.LEFT;
    }
  }

  setAutoDelay(delayMs: number): void {
    mouse.config.autoDelayMs = delayMs;
  }

  setMouseSpeed(pixelsPerSecond: number): void {
    mouse.config.mouseSpeed = pixelsPerSecond;
  }
}
