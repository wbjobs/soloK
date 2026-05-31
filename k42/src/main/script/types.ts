import type {
  MidiMessage,
  MidiTrigger,
  ScriptContext,
  ScriptAPI,
} from '../../shared/index.js';

export interface ScriptExecutionResult {
  success: boolean;
  triggered: boolean;
  error?: string;
  logs: unknown[][];
  duration: number;
}

export interface ScriptEngineOptions {
  timeout?: number;
  maxMemory?: number;
  allowAsync?: boolean;
}

export interface ScriptState {
  globalState: Map<string, unknown>;
  counters: Map<string, number>;
  lastTriggerTimes: Map<string, number>;
}
