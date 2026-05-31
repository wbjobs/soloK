import { Input } from '@julusian/midi';
import type { MidiMessage, MidiDevice } from '../../shared/index.js';
import {
  MIDI_STATUS,
  MIDI_STATUS_MASK,
  MIDI_CHANNEL_MASK,
} from './types.js';
import type {
  MidiListenerEvents,
  MidiEventCallback,
} from './types.js';

interface ConnectedDevice {
  device: MidiDevice;
  input: Input;
}

export class MidiListener {
  private connectedDevices: Map<string, ConnectedDevice> = new Map();
  private isLearning: boolean = false;
  private learnTimeout: NodeJS.Timeout | null = null;
  private learnDeviceId: string | null = null;
  private eventListeners: Map<
    keyof MidiListenerEvents,
    Set<MidiEventCallback<keyof MidiListenerEvents>>
  > = new Map();

  on<T extends keyof MidiListenerEvents>(
    event: T,
    callback: MidiEventCallback<T>
  ): () => void {
    if (!this.eventListeners.has(event)) {
      this.eventListeners.set(event, new Set());
    }
    this.eventListeners.get(event)!.add(callback);
    return () => this.off(event, callback);
  }

  off<T extends keyof MidiListenerEvents>(
    event: T,
    callback: MidiEventCallback<T>
  ): void {
    const listeners = this.eventListeners.get(event);
    if (listeners) {
      listeners.delete(callback);
    }
  }

  private emit<T extends keyof MidiListenerEvents>(
    event: T,
    ...args: Parameters<MidiEventCallback<T>>
  ): void {
    const listeners = this.eventListeners.get(event);
    if (listeners) {
      for (const callback of listeners) {
        try {
          (callback as (...args: unknown[]) => void)(...args);
        } catch (error) {
          this.emit('error', error instanceof Error ? error : new Error(String(error)));
        }
      }
    }
  }

  connect(device: MidiDevice, input: Input): boolean {
    try {
      if (this.connectedDevices.has(device.id)) {
        this.disconnectDevice(device.id);
      }

      input.ignoreTypes(false, false, false);
      input.on('message', this.createMidiMessageHandler(device));

      this.connectedDevices.set(device.id, { device, input });
      this.emit('device-connected', device);
      return true;
    } catch (error) {
      this.emit('error', error instanceof Error ? error : new Error(String(error)));
      return false;
    }
  }

  disconnectDevice(deviceId: string): void {
    const connected = this.connectedDevices.get(deviceId);
    if (connected) {
      try {
        connected.input.removeAllListeners('message');
        connected.input.closePort();
      } catch {
        // Ignore close errors
      }
      this.connectedDevices.delete(deviceId);
      this.emit('device-disconnected', deviceId);

      if (this.learnDeviceId === deviceId) {
        this.stopLearn();
      }
    }
  }

  disconnect(): void {
    this.stopLearn();
    for (const deviceId of this.connectedDevices.keys()) {
      this.disconnectDevice(deviceId);
    }
  }

  getConnectedDevices(): MidiDevice[] {
    return Array.from(this.connectedDevices.values()).map(cd => cd.device);
  }

  isDeviceConnected(deviceId: string): boolean {
    return this.connectedDevices.has(deviceId);
  }

  startLearn(timeoutMs: number = 5000, deviceId?: string): void {
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

  stopLearn(): void {
    this.isLearning = false;
    this.learnDeviceId = null;

    if (this.learnTimeout) {
      clearTimeout(this.learnTimeout);
      this.learnTimeout = null;
    }
  }

  isInLearnMode(): boolean {
    return this.isLearning;
  }

  getLearnDeviceId(): string | null {
    return this.learnDeviceId;
  }

  destroy(): void {
    this.disconnect();
    this.eventListeners.clear();
  }

  private createMidiMessageHandler(device: MidiDevice) {
    return (deltaTime: number, message: number[]): void => {
      try {
        if (message.length < 1) return;

        const midiMessage = this.parseMidiMessage(message, deltaTime, device);
        if (!midiMessage) return;

        this.emit('message', midiMessage);

        if (this.isLearning && (!this.learnDeviceId || this.learnDeviceId === device.id)) {
          this.emit('learned', midiMessage);
          this.stopLearn();
        }
      } catch (error) {
        this.emit('error', error instanceof Error ? error : new Error(String(error)));
      }
    };
  }

  private parseMidiMessage(
    data: number[],
    deltaTime: number,
    device: MidiDevice
  ): MidiMessage | null {
    const statusByte = data[0];
    const status = statusByte & MIDI_STATUS_MASK;
    const channel = statusByte & MIDI_CHANNEL_MASK;

    const timestamp = Date.now();

    switch (status) {
      case MIDI_STATUS.NOTE_ON: {
        if (data.length < 3) return null;
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
        if (data.length < 3) return null;
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
        if (data.length < 3) return null;
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
        if (data.length < 3) return null;
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
        if (data.length < 3) return null;
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
        if (data.length < 2) return null;
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
