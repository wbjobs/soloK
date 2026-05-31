import { MIDI_STATUS, MIDI_STATUS_MASK, MIDI_CHANNEL_MASK, } from './types.js';
export class MidiListener {
    connectedDevices = new Map();
    isLearning = false;
    learnTimeout = null;
    learnDeviceId = null;
    eventListeners = new Map();
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
    connect(device, input) {
        try {
            if (this.connectedDevices.has(device.id)) {
                this.disconnectDevice(device.id);
            }
            input.ignoreTypes(false, false, false);
            input.on('message', this.createMidiMessageHandler(device));
            this.connectedDevices.set(device.id, { device, input });
            this.emit('device-connected', device);
            return true;
        }
        catch (error) {
            this.emit('error', error instanceof Error ? error : new Error(String(error)));
            return false;
        }
    }
    disconnectDevice(deviceId) {
        const connected = this.connectedDevices.get(deviceId);
        if (connected) {
            try {
                connected.input.removeAllListeners('message');
                connected.input.closePort();
            }
            catch {
                // Ignore close errors
            }
            this.connectedDevices.delete(deviceId);
            this.emit('device-disconnected', deviceId);
            if (this.learnDeviceId === deviceId) {
                this.stopLearn();
            }
        }
    }
    disconnect() {
        this.stopLearn();
        for (const deviceId of this.connectedDevices.keys()) {
            this.disconnectDevice(deviceId);
        }
    }
    getConnectedDevices() {
        return Array.from(this.connectedDevices.values()).map(cd => cd.device);
    }
    isDeviceConnected(deviceId) {
        return this.connectedDevices.has(deviceId);
    }
    startLearn(timeoutMs = 5000, deviceId) {
        if (this.isLearning) {
            this.stopLearn();
        }
        this.isLearning = true;
        this.learnDeviceId = deviceId || null;
        if (timeoutMs > 0) {
            this.learnTimeout = setTimeout(() => {
                this.stopLearn();
            }, timeoutMs);
        }
    }
    stopLearn() {
        this.isLearning = false;
        this.learnDeviceId = null;
        if (this.learnTimeout) {
            clearTimeout(this.learnTimeout);
            this.learnTimeout = null;
        }
    }
    isInLearnMode() {
        return this.isLearning;
    }
    getLearnDeviceId() {
        return this.learnDeviceId;
    }
    destroy() {
        this.disconnect();
        this.eventListeners.clear();
    }
    createMidiMessageHandler(device) {
        return (deltaTime, message) => {
            try {
                if (message.length < 1)
                    return;
                const midiMessage = this.parseMidiMessage(message, deltaTime, device);
                if (!midiMessage)
                    return;
                this.emit('message', midiMessage);
                if (this.isLearning && (!this.learnDeviceId || this.learnDeviceId === device.id)) {
                    this.emit('learned', midiMessage);
                    this.stopLearn();
                }
            }
            catch (error) {
                this.emit('error', error instanceof Error ? error : new Error(String(error)));
            }
        };
    }
    parseMidiMessage(data, deltaTime, device) {
        const statusByte = data[0];
        const status = statusByte & MIDI_STATUS_MASK;
        const channel = statusByte & MIDI_CHANNEL_MASK;
        const timestamp = Date.now();
        switch (status) {
            case MIDI_STATUS.NOTE_ON: {
                if (data.length < 3)
                    return null;
                const note = data[1];
                const velocity = data[2];
                if (velocity === 0) {
                    return {
                        status: statusByte,
                        channel,
                        type: 'noteOff',
                        note,
                        velocity: 0,
                        timestamp,
                        deviceId: device.id,
                        deviceName: device.name,
                    };
                }
                return {
                    status: statusByte,
                    channel,
                    type: 'noteOn',
                    note,
                    velocity,
                    timestamp,
                    deviceId: device.id,
                    deviceName: device.name,
                };
            }
            case MIDI_STATUS.NOTE_OFF: {
                if (data.length < 3)
                    return null;
                return {
                    status: statusByte,
                    channel,
                    type: 'noteOff',
                    note: data[1],
                    velocity: data[2],
                    timestamp,
                    deviceId: device.id,
                    deviceName: device.name,
                };
            }
            case MIDI_STATUS.CC: {
                if (data.length < 3)
                    return null;
                return {
                    status: statusByte,
                    channel,
                    type: 'cc',
                    controlNumber: data[1],
                    controlValue: data[2],
                    timestamp,
                    deviceId: device.id,
                    deviceName: device.name,
                };
            }
            case MIDI_STATUS.PITCH_BEND: {
                if (data.length < 3)
                    return null;
                const pitchBendValue = (data[2] << 7) | data[1];
                return {
                    status: statusByte,
                    channel,
                    type: 'pitchBend',
                    pitchBendValue,
                    timestamp,
                    deviceId: device.id,
                    deviceName: device.name,
                };
            }
            case MIDI_STATUS.AFTERTOUCH: {
                if (data.length < 3)
                    return null;
                return {
                    status: statusByte,
                    channel,
                    type: 'aftertouch',
                    note: data[1],
                    velocity: data[2],
                    timestamp,
                    deviceId: device.id,
                    deviceName: device.name,
                };
            }
            case MIDI_STATUS.PROGRAM_CHANGE: {
                if (data.length < 2)
                    return null;
                return {
                    status: statusByte,
                    channel,
                    type: 'programChange',
                    controlNumber: data[1],
                    timestamp,
                    deviceId: device.id,
                    deviceName: device.name,
                };
            }
            default:
                return null;
        }
    }
}
