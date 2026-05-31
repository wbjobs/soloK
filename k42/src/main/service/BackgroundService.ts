import type {
  MidiMessage,
  MidiDevice,
  ServiceStatus,
  Action,
  LogEntry,
  Profile,
  MappingRule,
} from '../../shared/index.js';
import { MapperEngine, type MatchResult } from './MapperEngine';
import { ProfileManager } from '../config/ProfileManager';
import { ConfigManager } from '../config/ConfigManager';
import { ScriptEngine } from '../script/ScriptEngine.js';

export interface MidiAdapter {
  getDevices(): Promise<MidiDevice[]>;
  connectDevice(deviceId: string): Promise<boolean>;
  disconnectDevice(deviceId: string): Promise<void>;
  disconnectAll(): Promise<void>;
  getConnectedDevices(): MidiDevice[];
  isDeviceConnected(deviceId: string): boolean;
  onMessage(callback: (message: MidiMessage) => void): () => void;
  start(): Promise<void>;
  stop(): Promise<void>;
  isRunning(): boolean;
  startLearn(timeoutMs?: number, deviceId?: string): void;
  stopLearn(): void;
  isInLearnMode(): boolean;
  onLearn(callback: (message: MidiMessage) => void): () => void;
}

export interface InputSimulator {
  executeAction(action: Action): Promise<void>;
  testAction(action: Action): Promise<void>;
  pressKeys(keys: string[]): Promise<void>;
  clickMouse(button?: 'left' | 'right' | 'middle', x?: number, y?: number): Promise<void>;
  scrollMouse(direction: 'up' | 'down' | 'left' | 'right', amount: number): Promise<void>;
  dragMouse(fromX: number, fromY: number, toX: number, toY: number, button?: 'left' | 'right' | 'middle'): Promise<void>;
}

export interface BackgroundServiceOptions {
  midiAdapter?: MidiAdapter;
  inputSimulator?: InputSimulator;
  profileManager?: ProfileManager;
  configManager?: ConfigManager;
}

export type ServiceEventName = keyof ServiceEventMap;

export interface ServiceEventMap {
  'service:started': ServiceStatus;
  'service:stopped': ServiceStatus;
  'service:status-changed': ServiceStatus;
  'midi:message': MidiMessage;
  'midi:action-triggered': {
    message: MidiMessage;
    match: MatchResult;
    action: Action;
  };
  'midi:device-connected': MidiDevice;
  'midi:device-disconnected': string;
  'log:entry': LogEntry;
  'error': Error;
}

export interface ServiceEventListener<K extends ServiceEventName> {
  (event: K, data: ServiceEventMap[K]): void;
}

export class BackgroundService {
  private static instance: BackgroundService | null = null;

  private readonly configManager: ConfigManager;
  private readonly profileManager: ProfileManager;
  private readonly mapperEngine: MapperEngine;
  private readonly scriptEngine: ScriptEngine;

  private midiAdapter: MidiAdapter | null = null;
  private inputSimulator: InputSimulator | null = null;

  private running: boolean = false;
  private messageHandler: (() => void) | null = null;
  private profileUnsubscribe: (() => void) | null = null;

  private lastMessage: MidiMessage | null = null;
  private listeners: Map<ServiceEventName, Set<ServiceEventListener<ServiceEventName>>> =
    new Map();

  private constructor(options: BackgroundServiceOptions = {}) {
    this.configManager = options.configManager ?? ConfigManager.getInstance();
    this.profileManager = options.profileManager ?? ProfileManager.getInstance();
    this.mapperEngine = new MapperEngine();
    this.scriptEngine = new ScriptEngine();

    if (options.midiAdapter) {
      this.midiAdapter = options.midiAdapter;
    }
    if (options.inputSimulator) {
      this.inputSimulator = options.inputSimulator;
      this.scriptEngine.setInputSimulator(this.inputSimulator);
    }
  }

  public static getInstance(options?: BackgroundServiceOptions): BackgroundService {
    if (!BackgroundService.instance) {
      BackgroundService.instance = new BackgroundService(options);
    }
    return BackgroundService.instance;
  }

  public setMidiAdapter(adapter: MidiAdapter): void {
    if (this.running) {
      throw new Error('Cannot set MIDI adapter while service is running');
    }
    this.midiAdapter = adapter;
  }

  public setInputSimulator(simulator: InputSimulator): void {
    this.inputSimulator = simulator;
    this.scriptEngine.setInputSimulator(simulator);
  }

  public getScriptEngine(): ScriptEngine {
    return this.scriptEngine;
  }

  public async start(): Promise<ServiceStatus> {
    if (this.running) {
      return this.getStatus();
    }

    try {
      this.log('info', 'Starting background service...');

      if (!this.midiAdapter) {
        throw new Error('MIDI adapter not set');
      }

      const activeProfile = this.profileManager.getActiveProfile();
      if (activeProfile) {
        this.loadProfileRules(activeProfile);
      }

      this.messageHandler = this.midiAdapter.onMessage((message) => {
        this.handleMidiMessage(message);
      });

      this.profileUnsubscribe = this.profileManager.on('profile:switched', (_, profile) => {
        if (profile) {
          this.loadProfileRules(profile);
          this.log('info', `Switched to profile: ${profile.name}`);
        } else {
          this.mapperEngine.setRules([]);
          this.log('info', 'No active profile');
        }
        this.emit('service:status-changed', this.getStatus());
      });

      await this.midiAdapter.start();

      const config = this.configManager.getConfig();
      if (config.connectedDeviceIds && config.connectedDeviceIds.length > 0) {
        for (const deviceId of config.connectedDeviceIds) {
          try {
            const connected = await this.midiAdapter.connectDevice(deviceId);
            if (connected) {
              this.log('info', `Successfully connected to device: ${deviceId}`);
            }
          } catch (error) {
            this.log('warn', `Failed to connect to device ${deviceId}: ${(error as Error).message}`);
          }
        }
      }
      this.running = true;

      const status = this.getStatus();
      this.log('info', 'Background service started');
      this.emit('service:started', status);
      this.emit('service:status-changed', status);

      return status;
    } catch (error) {
      this.log('error', `Failed to start service: ${(error as Error).message}`);
      this.emit('error', error as Error);
      throw error;
    }
  }

  public async stop(): Promise<ServiceStatus> {
    if (!this.running) {
      return this.getStatus();
    }

    try {
      this.log('info', 'Stopping background service...');

      if (this.messageHandler) {
        this.messageHandler();
        this.messageHandler = null;
      }

      if (this.profileUnsubscribe) {
        this.profileUnsubscribe();
        this.profileUnsubscribe = null;
      }

      if (this.midiAdapter) {
        await this.midiAdapter.stop();
      }

      this.running = false;
      this.lastMessage = null;

      const status = this.getStatus();
      this.log('info', 'Background service stopped');
      this.emit('service:stopped', status);
      this.emit('service:status-changed', status);

      return status;
    } catch (error) {
      this.log('error', `Failed to stop service: ${(error as Error).message}`);
      this.emit('error', error as Error);
      throw error;
    }
  }

  public isRunning(): boolean {
    return this.running;
  }

  public getStatus(): ServiceStatus {
    const activeProfile = this.profileManager.getActiveProfile();
    const activeMappings = this.mapperEngine.getRules().filter((r) => r.enabled).length;
    const totalMappings = activeProfile?.mappings.length ?? 0;
    const connectedDevices = this.midiAdapter?.getConnectedDevices() ?? [];
    const deviceConnected = connectedDevices.length > 0;

    return {
      running: this.running,
      deviceConnected,
      activeMappings,
      totalMappings,
      lastMessage: this.lastMessage ?? undefined,
      connectedDevices: connectedDevices,
    };
  }

  public async getMidiDevices(): Promise<MidiDevice[]> {
    if (!this.midiAdapter) {
      throw new Error('MIDI adapter not set');
    }
    return this.midiAdapter.getDevices();
  }

  public async connectMidiDevice(deviceId: string): Promise<boolean> {
    if (!this.midiAdapter) {
      throw new Error('MIDI adapter not set');
    }

    const connected = await this.midiAdapter.connectDevice(deviceId);
    this.emit('service:status-changed', this.getStatus());

    if (connected) {
      this.log('info', `Connected MIDI device: ${deviceId}`);
    }

    return connected;
  }

  public async disconnectMidiDevice(deviceId: string): Promise<void> {
    if (!this.midiAdapter) {
      throw new Error('MIDI adapter not set');
    }

    await this.midiAdapter.disconnectDevice(deviceId);
    this.emit('service:status-changed', this.getStatus());
    this.log('info', `Disconnected MIDI device: ${deviceId}`);
  }

  public getConnectedDevices(): MidiDevice[] {
    return this.midiAdapter?.getConnectedDevices() ?? [];
  }

  public async testAction(action: Action): Promise<void> {
    if (!this.inputSimulator) {
      throw new Error('Input simulator not set');
    }
    await this.inputSimulator.testAction(action);
    this.log('info', `Tested action: ${action.type}`);
  }

  public on<K extends ServiceEventName>(
    event: K,
    listener: ServiceEventListener<K>
  ): () => void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event)!.add(listener as ServiceEventListener<ServiceEventName>);

    return () => {
      this.listeners.get(event)?.delete(listener as ServiceEventListener<ServiceEventName>);
    };
  }

  public off<K extends ServiceEventName>(
    event: K,
    listener: ServiceEventListener<K>
  ): void {
    this.listeners.get(event)?.delete(listener as ServiceEventListener<ServiceEventName>);
  }

  private loadProfileRules(profile: Profile): void {
    const rules = profile.mappings.filter((m) => m.enabled);
    this.mapperEngine.setRules(rules);
    this.log('debug', `Loaded ${rules.length} rules from profile: ${profile.name}`);
  }

  private handleMidiMessage(message: MidiMessage): void {
    this.lastMessage = message;
    this.emit('midi:message', message);

    const matches = this.mapperEngine.match(message);
    if (matches.length === 0) {
      return;
    }

    for (const match of matches) {
      this.triggerAction(message, match);
    }

    this.emit('service:status-changed', this.getStatus());
  }

  private async triggerAction(message: MidiMessage, match: MatchResult): Promise<void> {
    if (!this.inputSimulator) {
      this.log('warn', 'Input simulator not set, cannot execute action');
      return;
    }

    try {
      if (match.rule.condition?.enabled) {
        const conditionResult = await this.scriptEngine.executeCondition(
          match.rule.condition.code,
          message,
          match.rule.midiTrigger
        );

        if (!conditionResult.success) {
          this.log(
            'warn',
            `Script condition error for rule "${match.rule.name}": ${conditionResult.error}`
          );
          return;
        }

        if (!conditionResult.triggered) {
          return;
        }
      }

      if (match.action.type === 'script') {
        await this.scriptEngine.executeAction(
          match.action.code,
          message,
          match.rule.midiTrigger
        );
      } else {
        await this.inputSimulator.executeAction(match.action);
      }

      this.emit('midi:action-triggered', {
        message,
        match,
        action: match.action,
      });
      this.log(
        'debug',
        `Triggered action for rule "${match.rule.name}" (score: ${match.matchScore})`
      );
    } catch (error) {
      this.log(
        'error',
        `Failed to execute action for rule "${match.rule.name}": ${(error as Error).message}`
      );
    }
  }

  private emit<K extends ServiceEventName>(event: K, data: ServiceEventMap[K]): void {
    const eventListeners = this.listeners.get(event);
    if (eventListeners) {
      for (const listener of eventListeners) {
        try {
          listener(event, data);
        } catch (error) {
          console.error(`Error in service event listener for ${event}:`, error);
        }
      }
    }
  }

  private log(level: LogEntry['level'], message: string, data?: unknown): void {
    const entry: LogEntry = {
      timestamp: Date.now(),
      level,
      message,
      data,
    };
    this.emit('log:entry', entry);

    const configLogLevel = this.configManager.getConfig().logLevel;
    const logLevels: LogEntry['level'][] = ['debug', 'info', 'warn', 'error'];
    const entryLevel = logLevels.indexOf(level);
    const configLevel = logLevels.indexOf(configLogLevel);

    if (entryLevel >= configLevel) {
      const logMethod = level === 'debug' ? 'log' : level;
      const consoleFn = console[logMethod as 'log' | 'info' | 'warn' | 'error'];
      consoleFn(`[${level.toUpperCase()}] ${message}`, data ?? '');
    }
  }
}

export default BackgroundService;
