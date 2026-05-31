import { Input } from '@julusian/midi';
export class DeviceManager {
    input;
    devices = new Map();
    selectedDeviceId = null;
    pollingInterval = null;
    eventListeners = new Map();
    constructor() {
        this.input = new Input();
        this.refreshDevices();
    }
    on(event, callback) {
        if (!this.eventListeners.has(event)) {
            this.eventListeners.set(event, new Set());
        }
        this.eventListeners.get(event).add(callback);
        return () => this.off(event, callback);
    }
    off(event, callback) {
        const listeners = this.eventListeners.get(event);
        if (listeners) {
            listeners.delete(callback);
        }
    }
    emit(event, ...args) {
        const listeners = this.eventListeners.get(event);
        if (listeners) {
            for (const callback of listeners) {
                try {
                    callback(...args);
                }
                catch (error) {
                    this.emit('error', error instanceof Error ? error : new Error(String(error)));
                }
            }
        }
    }
    refreshDevices() {
        try {
            const currentDevices = this.getInputDevices();
            const currentIds = new Set(currentDevices.map(d => d.id));
            for (const device of currentDevices) {
                if (!this.devices.has(device.id)) {
                    this.devices.set(device.id, { ...device, connected: true });
                    this.emit('device-added', this.devices.get(device.id));
                }
                else {
                    const existing = this.devices.get(device.id);
                    if (!existing.connected) {
                        existing.connected = true;
                        this.emit('device-added', existing);
                    }
                }
            }
            for (const [id, device] of this.devices) {
                if (!currentIds.has(id) && device.connected) {
                    device.connected = false;
                    this.emit('device-removed', id);
                    if (this.selectedDeviceId === id) {
                        this.selectedDeviceId = null;
                        this.emit('device-selected', null);
                    }
                }
            }
            return this.getDevices();
        }
        catch (error) {
            this.emit('error', error instanceof Error ? error : new Error(String(error)));
            return this.getDevices();
        }
    }
    getDevices() {
        return Array.from(this.devices.values());
    }
    getDeviceById(deviceId) {
        return this.devices.get(deviceId);
    }
    getSelectedDevice() {
        if (!this.selectedDeviceId)
            return null;
        return this.devices.get(this.selectedDeviceId) ?? null;
    }
    selectDevice(deviceId) {
        if (deviceId === null) {
            this.selectedDeviceId = null;
            this.emit('device-selected', null);
            return true;
        }
        const device = this.devices.get(deviceId);
        if (!device || !device.connected) {
            this.emit('error', new Error(`Device not found or not connected: ${deviceId}`));
            return false;
        }
        this.selectedDeviceId = deviceId;
        this.emit('device-selected', device);
        return true;
    }
    getDeviceInput(deviceId) {
        const deviceInfo = this.getDeviceInfoById(deviceId);
        if (!deviceInfo)
            return null;
        try {
            const newInput = new Input();
            newInput.openPort(deviceInfo.index);
            return newInput;
        }
        catch (error) {
            this.emit('error', error instanceof Error ? error : new Error(String(error)));
            return null;
        }
    }
    startMonitoring(intervalMs = 2000) {
        this.stopMonitoring();
        this.pollingInterval = setInterval(() => {
            this.refreshDevices();
        }, intervalMs);
    }
    stopMonitoring() {
        if (this.pollingInterval) {
            clearInterval(this.pollingInterval);
            this.pollingInterval = null;
        }
    }
    destroy() {
        this.stopMonitoring();
        this.eventListeners.clear();
        this.devices.clear();
        this.selectedDeviceId = null;
    }
    getInputDevices() {
        const count = this.input.getPortCount();
        const devices = [];
        for (let i = 0; i < count; i++) {
            try {
                const name = this.input.getPortName(i);
                const id = this.generateDeviceId(i, name);
                devices.push({ index: i, name, id });
            }
            catch {
                continue;
            }
        }
        return devices;
    }
    getDeviceInfoById(deviceId) {
        const devices = this.getInputDevices();
        return devices.find(d => d.id === deviceId) ?? null;
    }
    generateDeviceId(index, name) {
        return `midi-input-${index}-${name.replace(/[^a-zA-Z0-9]/g, '-')}`;
    }
}
