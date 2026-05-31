import fs from 'node:fs';
import path from 'node:path';
import { app } from 'electron';
export class ConfigManager {
    static instance = null;
    filePath;
    config = null;
    listeners = new Map();
    constructor(options = {}) {
        const fileName = options.fileName ?? 'config.json';
        const userDataPath = options.userDataPath ?? app.getPath('userData');
        this.filePath = path.join(userDataPath, fileName);
    }
    static getInstance(options) {
        if (!ConfigManager.instance) {
            ConfigManager.instance = new ConfigManager(options);
        }
        return ConfigManager.instance;
    }
    getFilePath() {
        return this.filePath;
    }
    async load() {
        try {
            if (fs.existsSync(this.filePath)) {
                const rawData = await fs.promises.readFile(this.filePath, 'utf-8');
                this.config = JSON.parse(rawData);
                this.validateConfig(this.config);
            }
            else {
                this.config = this.createDefaultConfig();
                await this.save();
            }
            this.emit('config:loaded', this.config);
            return this.config;
        }
        catch (error) {
            console.error('Failed to load config:', error);
            this.config = this.createDefaultConfig();
            this.emit('config:loaded', this.config);
            return this.config;
        }
    }
    async save() {
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
        }
        catch (error) {
            console.error('Failed to save config:', error);
            throw error;
        }
    }
    getConfig() {
        if (!this.config) {
            throw new Error('Config not loaded');
        }
        return this.config;
    }
    async updateConfig(updates) {
        if (!this.config) {
            throw new Error('Config not loaded');
        }
        this.config = { ...this.config, ...updates };
        this.emit('config:changed', this.config);
        await this.save();
        return this.config;
    }
    on(event, listener) {
        if (!this.listeners.has(event)) {
            this.listeners.set(event, new Set());
        }
        this.listeners.get(event).add(listener);
        return () => {
            this.listeners.get(event)?.delete(listener);
        };
    }
    off(event, listener) {
        this.listeners.get(event)?.delete(listener);
    }
    emit(event, data) {
        const eventListeners = this.listeners.get(event);
        if (eventListeners) {
            for (const listener of eventListeners) {
                try {
                    listener(event, data);
                }
                catch (error) {
                    console.error(`Error in config event listener for ${event}:`, error);
                }
            }
        }
    }
    createDefaultConfig() {
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
    validateConfig(config) {
        if (typeof config !== 'object' || config === null) {
            throw new Error('Invalid config: not an object');
        }
        const c = config;
        if (typeof c.autoStart !== 'boolean')
            c.autoStart = false;
        if (typeof c.minimizeToTray !== 'boolean')
            c.minimizeToTray = true;
        if (typeof c.startServiceOnLaunch !== 'boolean')
            c.startServiceOnLaunch = false;
        if (c.activeProfileId !== null && typeof c.activeProfileId !== 'string') {
            c.activeProfileId = null;
        }
        if (c.selectedDeviceId !== null && typeof c.selectedDeviceId !== 'string') {
            c.selectedDeviceId = null;
        }
        if (!Array.isArray(c.connectedDeviceIds)) {
            c.connectedDeviceIds = [];
        }
        else {
            c.connectedDeviceIds = c.connectedDeviceIds.filter(id => typeof id === 'string');
        }
        if (!['debug', 'info', 'warn', 'error'].includes(c.logLevel)) {
            c.logLevel = 'info';
        }
        if (!Array.isArray(c.profiles))
            c.profiles = [];
    }
}
export default ConfigManager;
