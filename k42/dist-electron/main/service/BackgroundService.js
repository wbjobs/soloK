import { MapperEngine } from './MapperEngine';
import { ProfileManager } from '../config/ProfileManager';
import { ConfigManager } from '../config/ConfigManager';
import { ScriptEngine } from '../script/ScriptEngine.js';
export class BackgroundService {
    static instance = null;
    configManager;
    profileManager;
    mapperEngine;
    scriptEngine;
    midiAdapter = null;
    inputSimulator = null;
    running = false;
    messageHandler = null;
    profileUnsubscribe = null;
    lastMessage = null;
    listeners = new Map();
    constructor(options = {}) {
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
    static getInstance(options) {
        if (!BackgroundService.instance) {
            BackgroundService.instance = new BackgroundService(options);
        }
        return BackgroundService.instance;
    }
    setMidiAdapter(adapter) {
        if (this.running) {
            throw new Error('Cannot set MIDI adapter while service is running');
        }
        this.midiAdapter = adapter;
    }
    setInputSimulator(simulator) {
        this.inputSimulator = simulator;
        this.scriptEngine.setInputSimulator(simulator);
    }
    getScriptEngine() {
        return this.scriptEngine;
    }
    async start() {
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
                }
                else {
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
                    }
                    catch (error) {
                        this.log('warn', `Failed to connect to device ${deviceId}: ${error.message}`);
                    }
                }
            }
            this.running = true;
            const status = this.getStatus();
            this.log('info', 'Background service started');
            this.emit('service:started', status);
            this.emit('service:status-changed', status);
            return status;
        }
        catch (error) {
            this.log('error', `Failed to start service: ${error.message}`);
            this.emit('error', error);
            throw error;
        }
    }
    async stop() {
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
        }
        catch (error) {
            this.log('error', `Failed to stop service: ${error.message}`);
            this.emit('error', error);
            throw error;
        }
    }
    isRunning() {
        return this.running;
    }
    getStatus() {
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
    async getMidiDevices() {
        if (!this.midiAdapter) {
            throw new Error('MIDI adapter not set');
        }
        return this.midiAdapter.getDevices();
    }
    async connectMidiDevice(deviceId) {
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
    async disconnectMidiDevice(deviceId) {
        if (!this.midiAdapter) {
            throw new Error('MIDI adapter not set');
        }
        await this.midiAdapter.disconnectDevice(deviceId);
        this.emit('service:status-changed', this.getStatus());
        this.log('info', `Disconnected MIDI device: ${deviceId}`);
    }
    getConnectedDevices() {
        return this.midiAdapter?.getConnectedDevices() ?? [];
    }
    async testAction(action) {
        if (!this.inputSimulator) {
            throw new Error('Input simulator not set');
        }
        await this.inputSimulator.testAction(action);
        this.log('info', `Tested action: ${action.type}`);
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
    loadProfileRules(profile) {
        const rules = profile.mappings.filter((m) => m.enabled);
        this.mapperEngine.setRules(rules);
        this.log('debug', `Loaded ${rules.length} rules from profile: ${profile.name}`);
    }
    handleMidiMessage(message) {
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
    async triggerAction(message, match) {
        if (!this.inputSimulator) {
            this.log('warn', 'Input simulator not set, cannot execute action');
            return;
        }
        try {
            if (match.rule.condition?.enabled) {
                const conditionResult = await this.scriptEngine.executeCondition(match.rule.condition.code, message, match.rule.midiTrigger);
                if (!conditionResult.success) {
                    this.log('warn', `Script condition error for rule "${match.rule.name}": ${conditionResult.error}`);
                    return;
                }
                if (!conditionResult.triggered) {
                    return;
                }
            }
            if (match.action.type === 'script') {
                await this.scriptEngine.executeAction(match.action.code, message, match.rule.midiTrigger);
            }
            else {
                await this.inputSimulator.executeAction(match.action);
            }
            this.emit('midi:action-triggered', {
                message,
                match,
                action: match.action,
            });
            this.log('debug', `Triggered action for rule "${match.rule.name}" (score: ${match.matchScore})`);
        }
        catch (error) {
            this.log('error', `Failed to execute action for rule "${match.rule.name}": ${error.message}`);
        }
    }
    emit(event, data) {
        const eventListeners = this.listeners.get(event);
        if (eventListeners) {
            for (const listener of eventListeners) {
                try {
                    listener(event, data);
                }
                catch (error) {
                    console.error(`Error in service event listener for ${event}:`, error);
                }
            }
        }
    }
    log(level, message, data) {
        const entry = {
            timestamp: Date.now(),
            level,
            message,
            data,
        };
        this.emit('log:entry', entry);
        const configLogLevel = this.configManager.getConfig().logLevel;
        const logLevels = ['debug', 'info', 'warn', 'error'];
        const entryLevel = logLevels.indexOf(level);
        const configLevel = logLevels.indexOf(configLogLevel);
        if (entryLevel >= configLevel) {
            const logMethod = level === 'debug' ? 'log' : level;
            const consoleFn = console[logMethod];
            consoleFn(`[${level.toUpperCase()}] ${message}`, data ?? '');
        }
    }
}
export default BackgroundService;
