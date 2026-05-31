export const MIDI_STATUS = {
    NOTE_OFF: 0x80,
    NOTE_ON: 0x90,
    AFTERTOUCH: 0xa0,
    CC: 0xb0,
    PROGRAM_CHANGE: 0xc0,
    CHANNEL_AFTERTOUCH: 0xd0,
    PITCH_BEND: 0xe0,
    SYSEX: 0xf0,
};
export const MIDI_STATUS_MASK = 0xf0;
export const MIDI_CHANNEL_MASK = 0x0f;
