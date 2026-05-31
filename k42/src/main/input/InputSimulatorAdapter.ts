import type { Action, KeyboardAction, MouseClickAction, MouseDragAction, MouseScrollAction } from '../../shared/index.js';
import type { InputSimulator as InputSimulatorInterface } from '../service/BackgroundService.js';
import { InputSimulator } from './InputSimulator.js';

export class InputSimulatorAdapter implements InputSimulatorInterface {
  private inputSimulator: InputSimulator;

  constructor(inputSimulator: InputSimulator) {
    this.inputSimulator = inputSimulator;
  }

  async executeAction(action: Action): Promise<void> {
    await this.inputSimulator.execute(action);
  }

  async testAction(action: Action): Promise<void> {
    await this.inputSimulator.execute(action);
  }

  async pressKeys(keys: string[]): Promise<void> {
    const action: KeyboardAction = {
      type: 'keyboard',
      keys,
    };
    await this.inputSimulator.execute(action);
  }

  async clickMouse(button: 'left' | 'right' | 'middle' = 'left', x?: number, y?: number): Promise<void> {
    const action: MouseClickAction = {
      type: 'mouseClick',
      button,
      x,
      y,
    };
    await this.inputSimulator.execute(action);
  }

  async scrollMouse(direction: 'up' | 'down' | 'left' | 'right', amount: number): Promise<void> {
    const action: MouseScrollAction = {
      type: 'mouseScroll',
      direction,
      amount,
    };
    await this.inputSimulator.execute(action);
  }

  async dragMouse(fromX: number, fromY: number, toX: number, toY: number, button: 'left' | 'right' | 'middle' = 'left'): Promise<void> {
    const action: MouseDragAction = {
      type: 'mouseDrag',
      fromX,
      fromY,
      toX,
      toY,
      button,
    };
    await this.inputSimulator.execute(action);
  }
}

export default InputSimulatorAdapter;
