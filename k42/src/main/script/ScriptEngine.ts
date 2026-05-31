import { createContext, runInContext } from 'node:vm';
import type {
  MidiMessage,
  MidiTrigger,
  ScriptContext,
  ScriptAPI,
} from '../../shared/index.js';
import { getNoteName } from '../../shared/index.js';
import type {
  ScriptExecutionResult,
  ScriptEngineOptions,
  ScriptState,
} from './types.js';

type InputSimulator = {
  pressKeys: (keys: string[]) => Promise<void>;
  clickMouse: (button: 'left' | 'right' | 'middle', x?: number, y?: number) => Promise<void>;
  scrollMouse: (direction: 'up' | 'down' | 'left' | 'right', amount: number) => Promise<void>;
  dragMouse: (fromX: number, fromY: number, toX: number, toY: number, button: 'left' | 'right' | 'middle') => Promise<void>;
};

const DEFAULT_OPTIONS: Required<ScriptEngineOptions> = {
  timeout: 5000,
  maxMemory: 1024 * 1024 * 10,
  allowAsync: true,
};

export class ScriptEngine {
  private options: Required<ScriptEngineOptions>;
  private state: ScriptState;
  private inputSimulator: InputSimulator | null = null;

  constructor(options?: ScriptEngineOptions) {
    this.options = { ...DEFAULT_OPTIONS, ...options };
    this.state = {
      globalState: new Map(),
      counters: new Map(),
      lastTriggerTimes: new Map(),
    };
  }

  setInputSimulator(simulator: InputSimulator): void {
    this.inputSimulator = simulator;
  }

  getState(): ScriptState {
    return this.state;
  }

  resetState(): void {
    this.state.globalState.clear();
    this.state.counters.clear();
    this.state.lastTriggerTimes.clear();
  }

  async executeCondition(
    code: string,
    message: MidiMessage,
    trigger: MidiTrigger
  ): Promise<ScriptExecutionResult> {
    const startTime = performance.now();
    const logs: unknown[][] = [];

    try {
      const { context, resultPromise } = this.createSandbox(
        code,
        message,
        trigger,
        logs
      );

      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => {
          reject(new Error('Script execution timeout'));
        }, this.options.timeout);
      });

      const result = await Promise.race([resultPromise, timeoutPromise]) as unknown;
      const triggered = this.isTruthy(result);

      return {
        success: true,
        triggered,
        logs,
        duration: performance.now() - startTime,
      };
    } catch (error) {
      return {
        success: false,
        triggered: false,
        error: error instanceof Error ? error.message : String(error),
        logs,
        duration: performance.now() - startTime,
      };
    }
  }

  async executeAction(
    code: string,
    message: MidiMessage,
    trigger: MidiTrigger
  ): Promise<ScriptExecutionResult> {
    const startTime = performance.now();
    const logs: unknown[][] = [];

    try {
      const { context, resultPromise } = this.createSandbox(
        code,
        message,
        trigger,
        logs
      );

      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => {
          reject(new Error('Script execution timeout'));
        }, this.options.timeout);
      });

      const result = await Promise.race([resultPromise, timeoutPromise]) as unknown;

      return {
        success: true,
        triggered: this.isTruthy(result) || result === undefined,
        logs,
        duration: performance.now() - startTime,
      };
    } catch (error) {
      return {
        success: false,
        triggered: false,
        error: error instanceof Error ? error.message : String(error),
        logs,
        duration: performance.now() - startTime,
      };
    }
  }

  private createSandbox(
    code: string,
    message: MidiMessage,
    trigger: MidiTrigger,
    logs: unknown[][]
  ): { context: object; resultPromise: Promise<unknown> } {
    const state = this.state;
    const inputSimulator = this.inputSimulator;

    const api: ScriptAPI = {
      log: (...args: unknown[]) => {
        logs.push(args);
      },

      getNoteName,

      delay: async (ms: number) => {
        if (ms < 0 || ms > this.options.timeout) {
          throw new Error(`Invalid delay: ${ms}ms`);
        }
        return new Promise((resolve) => setTimeout(resolve, ms));
      },

      press: async (keys: string | string[]) => {
        if (!inputSimulator) throw new Error('Input simulator not available');
        const keyArray = Array.isArray(keys) ? keys : [keys];
        await inputSimulator.pressKeys(keyArray);
      },

      click: async (button: 'left' | 'right' | 'middle' = 'left', x?: number, y?: number) => {
        if (!inputSimulator) throw new Error('Input simulator not available');
        await inputSimulator.clickMouse(button, x, y);
      },

      scroll: async (direction: 'up' | 'down' | 'left' | 'right', amount: number) => {
        if (!inputSimulator) throw new Error('Input simulator not available');
        await inputSimulator.scrollMouse(direction, amount);
      },

      drag: async (fromX: number, fromY: number, toX: number, toY: number, button: 'left' | 'right' | 'middle' = 'left') => {
        if (!inputSimulator) throw new Error('Input simulator not available');
        await inputSimulator.dragMouse(fromX, fromY, toX, toY, button);
      },

      getState: (key: string) => {
        return state.globalState.get(key);
      },

      setState: (key: string, value: unknown) => {
        state.globalState.set(key, value);
      },

      getCounter: (key: string) => {
        return state.counters.get(key) || 0;
      },

      setCounter: (key: string, value: number) => {
        state.counters.set(key, value);
      },

      increment: (key: string, amount: number = 1) => {
        const current = state.counters.get(key) || 0;
        const newValue = current + amount;
        state.counters.set(key, newValue);
        state.lastTriggerTimes.set(key, Date.now());
        return newValue;
      },

      decrement: (key: string, amount: number = 1) => {
        const current = state.counters.get(key) || 0;
        const newValue = current - amount;
        state.counters.set(key, newValue);
        return newValue;
      },

      resetCounter: (key: string) => {
        state.counters.delete(key);
        state.lastTriggerTimes.delete(key);
      },

      getTimeSinceLast: (key: string = 'default') => {
        const lastTime = state.lastTriggerTimes.get(key);
        if (!lastTime) return Infinity;
        return Date.now() - lastTime;
      },
    };

    const context: ScriptContext & ScriptAPI = {
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

    let resultPromise: Promise<unknown>;

    try {
      const execResult = runInContext(wrappedCode, sandbox, {
        timeout: this.options.timeout,
        displayErrors: true,
      });

      if (execResult && typeof execResult === 'object' && 'then' in execResult) {
        resultPromise = execResult as Promise<unknown>;
      } else {
        resultPromise = Promise.resolve(execResult);
      }
    } catch (error) {
      resultPromise = Promise.reject(error);
    }

    return { context, resultPromise };
  }

  private wrapCode(code: string): string {
    return `
(async function() {
  "use strict";
  ${code}
})();
    `.trim();
  }

  private isTruthy(value: unknown): boolean {
    if (value === undefined || value === null) return false;
    if (typeof value === 'boolean') return value;
    return Boolean(value);
  }

  validateScript(code: string): { valid: boolean; error?: string } {
    try {
      const wrapped = this.wrapCode(code);
      new Function(wrapped);
      return { valid: true };
    } catch (error) {
      return {
        valid: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }
}

export default ScriptEngine;
