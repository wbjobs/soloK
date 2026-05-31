import { KeyboardSimulator } from './KeyboardSimulator';
import { MouseSimulator } from './MouseSimulator';
export class InputSimulator {
    keyboardSimulator;
    mouseSimulator;
    constructor() {
        this.keyboardSimulator = new KeyboardSimulator();
        this.mouseSimulator = new MouseSimulator();
    }
    async execute(action) {
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
                throw new Error(`Unknown action type: ${action.type}`);
        }
    }
    getKeyboardSimulator() {
        return this.keyboardSimulator;
    }
    getMouseSimulator() {
        return this.mouseSimulator;
    }
    async releaseAll() {
        await this.keyboardSimulator.releaseAllKeys();
    }
    setAutoDelay(delayMs) {
        this.keyboardSimulator.setAutoDelay(delayMs);
        this.mouseSimulator.setAutoDelay(delayMs);
    }
    setMouseSpeed(pixelsPerSecond) {
        this.mouseSimulator.setMouseSpeed(pixelsPerSecond);
    }
}
