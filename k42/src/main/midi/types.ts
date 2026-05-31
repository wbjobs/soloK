import type { MidiDevice, MidiMessage } from '../../shared/index.js';

export type MidiMessageType = MidiMessage['type'];

export interface DeviceInfo {
  index: number;
  name: string;
  id: string;
}

export interface DeviceManagerEvents {
  'device-added': (device: MidiDevice) => void;
  'device-removed': (deviceId: string) => void;
  'device-selected': (device: MidiDevice | null) => void;
  'error': (error: Error) => void;
}

export interface MidiListenerEvents {
  'message': (message: MidiMessage) => void;
  'learned': (message: MidiMessage) => void;
  'device-connected': (device: MidiDevice) => void;
  'device-disconnected': (deviceId: string) => void;
  'error': (error: Error) => void;
}

export type DeviceEventCallback<T extends keyof DeviceManagerEvents> =
  DeviceManagerEvents[T];

export type MidiEventCallback<T extends keyof MidiListenerEvents> =
  MidiListenerEvents[T];

export const MIDI_STATUS = {
  NOTE_OFF: 0x80,
  NOTE_ON: 0x90,
  AFTERTOUCH: 0xa0,
  CC: 0xb0,
  PROGRAM_CHANGE: 0xc0,
  CHANNEL_AFTERTOUCH: 0xd0,
  PITCH_BEND: 0xe0,
  SYSEX: 0xf0,
} as const;

export const MIDI_STATUS_MASK = 0xf0;
export const MIDI_CHANNEL_MASK = 0x0f;
