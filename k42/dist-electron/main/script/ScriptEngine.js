import { createContext, runInContext } from 'node:vm';
import { getNoteName } from '../../shared/index.js';
const DEFAULT_OPTIONS = {
    timeout: 5000,
    maxMemory: 1024 * 1024 * 10,
    allowAsync: true,
};
export class ScriptEngine {
    options;
    state;
    inputSimulator = null;
    constructor(options) {
        this.options = { ...DEFAULT_OPTIONS, ...options };
        this.state = {
            globalState: new Map(),
            counters: new Map(),
            lastTriggerTimes: new Map(),
        };
    }
    setInputSimulator(simulator) {
        this.inputSimulator = simulator;
    }
    getState() {
        return this.state;
    }
    resetState() {
        this.state.globalState.clear();
        this.state.counters.clear();
        this.state.lastTriggerTimes.clear();
    }
    async executeCondition(code, message, trigger) {
        const startTime = performance.now();
        const logs = [];
        try {
            const { context, resultPromise } = this.createSandbox(code, message, trigger, logs);
            const timeoutPromise = new Promise((_, reject) => {
                setTimeout(() => {
                    reject(new Error('Script execution timeout'));
                }, this.options.timeout);
            });
            const result = await Promise.race([resultPromise, timeoutPromise]);
            const triggered = this.isTruthy(result);
            return {
                success: true,
                triggered,
                logs,
                duration: performance.now() - startTime,
            };
        }
        catch (error) {
            return {
                success: false,
                triggered: false,
                error: error instanceof Error ? error.message : String(error),
                logs,
                duration: performance.now() - startTime,
            };
        }
    }
    async executeAction(code, message, trigger) {
        const startTime = performance.now();
        const logs = [];
        try {
            const { context, resultPromise } = this.createSandbox(code, message, trigger, logs);
            const timeoutPromise = new Promise((_, reject) => {
                setTimeout(() => {
                    reject(new Error('Script execution timeout'));
                }, this.options.timeout);
            });
            const result = await Promise.race([resultPromise, timeoutPromise]);
            return {
                success: true,
                triggered: this.isTruthy(result) || result === undefined,
                logs,
                duration: performance.now() - startTime,
            };
        }
        catch (error) {
            return {
                success: false,
                triggered: false,
                error: error instanceof Error ? error.message : String(error),
                logs,
                duration: performance.now() - startTime,
            };
        }
    }
    createSandbox(code, message, trigger, logs) {
        const state = this.state;
        const inputSimulator = this.inputSimulator;
        const api = {
            log: (...args) => {
                logs.push(args);
            },
            getNoteName,
            delay: async (ms) => {
                if (ms < 0 || ms > this.options.timeout) {
                    throw new Error(`Invalid delay: ${ms}ms`);
                }
                return new Promise((resolve) => setTimeout(resolve, ms));
            },
            press: async (keys) => {
                if (!inputSimulator)
                    throw new Error('Input simulator not available');
                const keyArray = Array.isArray(keys) ? keys : [keys];
                await inputSimulator.pressKeys(keyArray);
            },
            click: async (button = 'left', x, y) => {
                if (!inputSimulator)
                    throw new Error('Input simulator not available');
                await inputSimulator.clickMouse(button, x, y);
            },
            scroll: async (direction, amount) => {
                if (!inputSimulator)
                    throw new Error('Input simulator not available');
                await inputSimulator.scrollMouse(direction, amount);
            },
            drag: async (fromX, fromY, toX, toY, button = 'left') => {
                if (!inputSimulator)
                    throw new Error('Input simulator not available');
                await inputSimulator.dragMouse(fromX, fromY, toX, toY, button);
            },
            getState: (key) => {
                return state.globalState.get(key);
            },
            setState: (key, value) => {
                state.globalState.set(key, value);
            },
            getCounter: (key) => {
                return state.counters.get(key) || 0;
            },
            setCounter: (key, value) => {
                state.counters.set(key, value);
            },
            increment: (key, amount = 1) => {
                const current = state.counters.get(key) || 0;
                const newValue = current + amount;
                state.counters.set(key, newValue);
                state.lastTriggerTimes.set(key, Date.now());
                return newValue;
            },
            decrement: (key, amount = 1) => {
                const current = state.counters.get(key) || 0;
                const newValue = current - amount;
                state.counters.set(key, newValue);
                return newValue;
            },
            resetCounter: (key) => {
                state.counters.delete(key);
                state.lastTriggerTimes.delete(key);
            },
            getTimeSinceLast: (key = 'default') => {
                const lastTime = state.lastTriggerTimes.get(key);
                if (!lastTime)
                    return Infinity;
                return Date.now() - lastTime;
            },
        };
        const context = {
            message,
            trigger,
            state: Object.fromEntries(state.globalState),
            counter: Object.fromEntries(state.counters),
            lastTrigger: Object.fromEntries(state.lastTriggerTimes),
            ...api,
        };
        const sandbox = createContext({
            ...context,
            console: {
                log: api.log,
                warn: api.log,
                error: api.log,
            },
        });
        const wrappedCode = this.wrapCode(code);
        let resultPromise;
        try {
            const execResult = runInContext(wrappedCode, sandbox, {
                timeout: this.options.timeout,
                displayErrors: true,
            });
            if (execResult && typeof execResult === 'object' && 'then' in execResult) {
                resultPromise = execResult;
            }
            else {
                resultPromise = Promise.resolve(execResult);
            }
        }
        catch (error) {
            resultPromise = Promise.reject(error);
        }
        return { context, resultPromise };
    }
    wrapCode(code) {
        return `
(async function() {
  "use strict";
  ${code}
})();
    `.trim();
    }
    isTruthy(value) {
        if (value === undefined || value === null)
            return false;
        if (typeof value === 'boolean')
            return value;
        return Boolean(value);
    }
    validateScript(code) {
        try {
            const wrapped = this.wrapCode(code);
            new Function(wrapped);
            return { valid: true };
        }
        catch (error) {
            return {
                valid: false,
                error: error instanceof Error ? error.message : String(error),
            };
        }
    }
}
export default ScriptEngine;
