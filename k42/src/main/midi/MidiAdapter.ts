import type { MidiMessage, MidiDevice } from '../../shared/index.js';
import type { MidiAdapter as MidiAdapterInterface } from '../service/BackgroundService.js';
import { DeviceManager } from './DeviceManager.js';
import { MidiListener } from './MidiListener.js';

export class MidiAdapter implements MidiAdapterInterface {
  private deviceManager: DeviceManager;
  private midiListener: MidiListener;
  private messageUnsubscribe: (() => void) | null = null;
  private learnUnsubscribe: (() => void) | null = null;

  constructor(deviceManager: DeviceManager, midiListener: MidiListener) {
    this.deviceManager = deviceManager;
    this.midiListener = midiListener;
  }

  async getDevices(): Promise<MidiDevice[]> {
    return this.deviceManager.getDevices();
  }

  async connectDevice(deviceId: string): Promise<boolean> {
    const device = this.deviceManager.getDeviceById(deviceId);
    if (!device) {
      return false;
    }

    const input = this.deviceManager.getDeviceInput(deviceId);
    if (!input) {
      return false;
    }

    return this.midiListener.connect(device, input);
  }

  async disconnectDevice(deviceId: string): Promise<void> {
    this.midiListener.disconnectDevice(deviceId);
  }

  async disconnectAll(): Promise<void> {
    this.midiListener.disconnect();
  }

  getConnectedDevices(): MidiDevice[] {
    return this.midiListener.getConnectedDevices();
  }

  isDeviceConnected(deviceId: string): boolean {
    return this.midiListener.isDeviceConnected(deviceId);
  }

  onMessage(callback: (message: MidiMessage) => void): () => void {
    return this.midiListener.on('message', callback);
  }

  async start(): Promise<void> {
    this.deviceManager.startMonitoring();
  }

  async stop(): Promise<void> {
    this.midiListener.disconnect();
    this.deviceManager.stopMonitoring();
  }

  isRunning(): boolean {
    return this.midiListener.getConnectedDevices().length > 0;
  }

  startLearn(timeoutMs: number = 5000, deviceId?: string): void {
    this.midiListener.startLearn(timeoutMs, deviceId);
  }

  stopLearn(): void {
    this.midiListener.stopLearn();
  }

  isInLearnMode(): boolean {
    return this.midiListener.isInLearnMode();
  }

  onLearn(callback: (message: MidiMessage) => void): () => void {
    return this.midiListener.on('learned', callback);
  }
}

export default MidiAdapter;
