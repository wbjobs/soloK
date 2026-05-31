import type { MidiMessage, MidiTrigger } from '@shared/index';
import { getNoteName, triggerToString, NOTE_NAMES } from '@shared/index';

export function midiMessageToString(message: MidiMessage): string {
  switch (message.type) {
    case 'noteOn':
    case 'noteOff':
      return `${message.type === 'noteOn' ? '音符开' : '音符关'} ${getNoteName(message.note!)} 力度:${message.velocity} (通道 ${message.channel + 1})`;
    case 'cc':
      return `CC ${message.controlNumber} 值:${message.controlValue} (通道 ${message.channel + 1})`;
    case 'pitchBend':
      return `弯音轮 值:${message.pitchBendValue} (通道 ${message.channel + 1})`;
    case 'aftertouch':
      return `触后 力度:${message.velocity} (通道 ${message.channel + 1})`;
    case 'programChange':
      return `程序变更 ${message.note} (通道 ${message.channel + 1})`;
    default:
      return `未知消息 (通道 ${message.channel + 1})`;
  }
}

export function midiMessageToTrigger(message: MidiMessage): MidiTrigger | null {
  switch (message.type) {
    case 'noteOn':
    case 'noteOff':
      return {
        type: 'note',
        channel: message.channel,
        note: message.note,
        minVelocity: 0,
        maxVelocity: 127,
      };
    case 'cc':
      return {
        type: 'cc',
        channel: message.channel,
        controlNumber: message.controlNumber,
        threshold: 64,
      };
    case 'pitchBend':
      return {
        type: 'pitchBend',
        channel: message.channel,
        threshold: 0,
      };
    default:
      return null;
  }
}

export function isSameTrigger(a: MidiTrigger, b: MidiTrigger): boolean {
  if (a.type !== b.type || a.channel !== b.channel) return false;
  if (a.type === 'note' && b.type === 'note') {
    return a.note === b.note;
  }
  if (a.type === 'cc' && b.type === 'cc') {
    return a.controlNumber === b.controlNumber;
  }
  return true;
}

export function formatVelocity(velocity: number): string {
  return `${velocity} (${Math.round((velocity / 127) * 100)}%)`;
}

export function formatControlValue(value: number): string {
  return `${value} (${Math.round((value / 127) * 100)}%)`;
}

export function formatPitchBendValue(value: number): string {
  const percentage = Math.round(((value + 8192) / 16383) * 100);
  return `${value} (${percentage}%)`;
}

export function getChannelDisplay(channel: number): string {
  return `通道 ${channel + 1}`;
}

export { getNoteName, triggerToString, NOTE_NAMES };
