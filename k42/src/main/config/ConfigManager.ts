import fs from 'node:fs';
import path from 'node:path';
import { app } from 'electron';
import type { AppConfig } from '../../shared/index';
import type {
  ConfigManagerOptions,
  ConfigEventMap,
  ConfigEventName,
  ConfigEventListener,
} from './types';

export class ConfigManager {
  private static instance: ConfigManager | null = null;

  private readonly filePath: string;
  private config: AppConfig | null = null;
  private listeners: Map<ConfigEventName, Set<ConfigEventListener<ConfigEventName>>> =
    new Map();

  private constructor(options: ConfigManagerOptions = {}) {
    const fileName = options.fileName ?? 'config.json';
    const userDataPath = options.userDataPath ?? app.getPath('userData');
    this.filePath = path.join(userDataPath, fileName);
  }

  public static getInstance(options?: ConfigManagerOptions): ConfigManager {
    if (!ConfigManager.instance) {
      ConfigManager.instance = new ConfigManager(options);
    }
    return ConfigManager.instance;
  }

  public getFilePath(): string {
    return this.filePath;
  }

  public async load(): Promise<AppConfig> {
    try {
      if (fs.existsSync(this.filePath)) {
        const rawData = await fs.promises.readFile(this.filePath, 'utf-8');
        this.config = JSON.parse(rawData) as AppConfig;
        this.validateConfig(this.config);
      } else {
        this.config = this.createDefaultConfig();
        await this.save();
      }
      this.emit('config:loaded', this.config);
      return this.config;
    } catch (error) {
      console.error('Failed to load config:', error);
      this.config = this.createDefaultConfig();
      this.emit('config:loaded', this.config);
      return this.config;
    }
  }

  public async save(): Promise<void> {
    if (!this.config) {
      throw new Error('Config not loaded');
    }

    try {
      const dir = path.dirname(this.filePath);
      if (!fs.existsSync(dir)) {
        await fs.promises.mkdir(dir, { recursive: true });
      }

      const data = JSON.stringify(this.config, null, 2);
      await fs.promises.writeFile(this.filePath, data, 'utf-8');
      this.emit('config:saved', this.config);
    } catch (error) {
      console.error('Failed to save config:', error);
      throw error;
    }
  }

  public getConfig(): AppConfig {
    if (!this.config) {
      throw new Error('Config not loaded');
    }
    return this.config;
  }

  public async updateConfig(updates: Partial<AppConfig>): Promise<AppConfig> {
    if (!this.config) {
      throw new Error('Config not loaded');
    }

    this.config = { ...this.config, ...updates };
    this.emit('config:changed', this.config);
    await this.save();
    return this.config;
  }

  public on<K extends ConfigEventName>(
    event: K,
    listener: ConfigEventListener<K>
  ): () => void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event)!.add(listener as ConfigEventListener<ConfigEventName>);

    return () => {
      this.listeners.get(event)?.delete(listener as ConfigEventListener<ConfigEventName>);
    };
  }

  public off<K extends ConfigEventName>(
    event: K,
    listener: ConfigEventListener<K>
  ): void {
    this.listeners.get(event)?.delete(listener as ConfigEventListener<ConfigEventName>);
  }

  private emit<K extends ConfigEventName>(event: K, data: ConfigEventMap[K]): void {
    const eventListeners = this.listeners.get(event);
    if (eventListeners) {
      for (const listener of eventListeners) {
        try {
          listener(event, data);
        } catch (error) {
          console.error(`Error in config event listener for ${event}:`, error);
        }
      }
    }
  }

  private createDefaultConfig(): AppConfig {
    return {
      autoStart: false,
      minimizeToTray: true,
      startServiceOnLaunch: false,
      activeProfileId: null,
      selectedDeviceId: null,
      connectedDeviceIds: [],
      logLevel: 'info',
      profiles: [],
    };
  }

  private validateConfig(config: unknown): asserts config is AppConfig {
    if (typeof config !== 'object' || config === null) {
      throw new Error('Invalid config: not an object');
    }

    const c = config as Record<string, unknown>;

    if (typeof c.autoStart !== 'boolean') c.autoStart = false;
    if (typeof c.minimizeToTray !== 'boolean') c.minimizeToTray = true;
    if (typeof c.startServiceOnLaunch !== 'boolean') c.startServiceOnLaunch = false;
    if (c.activeProfileId !== null && typeof c.activeProfileId !== 'string') {
      c.activeProfileId = null;
    }
    if (c.selectedDeviceId !== null && typeof c.selectedDeviceId !== 'string') {
      c.selectedDeviceId = null;
    }
    if (!Array.isArray(c.connectedDeviceIds)) {
      c.connectedDeviceIds = [];
    } else {
      c.connectedDeviceIds = (c.connectedDeviceIds as unknown[]).filter(id => typeof id === 'string');
    }
    if (!['debug', 'info', 'warn', 'error'].includes(c.logLevel as string)) {
      c.logLevel = 'info';
    }
    if (!Array.isArray(c.profiles)) c.profiles = [];
  }
}

export default ConfigManager;
