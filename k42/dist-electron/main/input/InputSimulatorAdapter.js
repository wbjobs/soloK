export class InputSimulatorAdapter {
    inputSimulator;
    constructor(inputSimulator) {
        this.inputSimulator = inputSimulator;
    }
    async executeAction(action) {
        await this.inputSimulator.execute(action);
    }
    async testAction(action) {
        await this.inputSimulator.execute(action);
    }
    async pressKeys(keys) {
        const action = {
            type: 'keyboard',
            keys,
        };
        await this.inputSimulator.execute(action);
    }
    async clickMouse(button = 'left', x, y) {
        const action = {
            type: 'mouseClick',
            button,
            x,
            y,
        };
        await this.inputSimulator.execute(action);
    }
    async scrollMouse(direction, amount) {
        const action = {
            type: 'mouseScroll',
            direction,
            amount,
        };
        await this.inputSimulator.execute(action);
    }
    async dragMouse(fromX, fromY, toX, toY, button = 'left') {
        const action = {
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
