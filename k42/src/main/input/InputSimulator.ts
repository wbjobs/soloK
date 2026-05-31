import type { Action } from '../../shared/index';
import { KeyboardSimulator } from './KeyboardSimulator';
import { MouseSimulator } from './MouseSimulator';

export class InputSimulator {
  private keyboardSimulator: KeyboardSimulator;
  private mouseSimulator: MouseSimulator;

  constructor() {
    this.keyboardSimulator = new KeyboardSimulator();
    this.mouseSimulator = new MouseSimulator();
  }

  async execute(action: Action): Promise<void> {
    switch (action.type) {
      case 'keyboard':
        await this.keyboardSimulator.simulate(action);
        break;
      case 'mouseClick':
        await this.mouseSimulator.simulateClick(action);
        break;
      case 'mouseDrag':
        await this.mouseSimulator.simulateDrag(action);
        break;
      case 'mouseScroll':
        await this.mouseSimulator.simulateScroll(action);
        break;
      default:
        throw new Error(`Unknown action type: ${(action as Action).type}`);
    }
  }

  getKeyboardSimulator(): KeyboardSimulator {
    return this.keyboardSimulator;
  }

  getMouseSimulator(): MouseSimulator {
    return this.mouseSimulator;
  }

  async releaseAll(): Promise<void> {
    await this.keyboardSimulator.releaseAllKeys();
  }

  setAutoDelay(delayMs: number): void {
    this.keyboardSimulator.setAutoDelay(delayMs);
    this.mouseSimulator.setAutoDelay(delayMs);
  }

  setMouseSpeed(pixelsPerSecond: number): void {
    this.mouseSimulator.setMouseSpeed(pixelsPerSecond);
  }
}
