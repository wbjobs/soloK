import numpy as np
from typing import List, Dict, Optional
import struct
import io


STRING_BASE_FREQS = [130.81, 146.83, 174.61, 196.00, 220.00, 261.63, 293.66]
HUI_RATIOS = [0.9439, 0.8909, 0.8409, 0.7937, 0.7492, 0.7071, 0.6674, 0.6299, 0.5946, 0.5612, 0.5297, 0.5, 0.4719]

NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']


class MidiGenerator:
    def __init__(self):
        self.tick_rate = 480
        self.default_tempo = 60

    def generate(self, notation_data: Dict, options: Dict = None) -> bytes:
        options = options or {}
        tempo = options.get('tempo', self.default_tempo)
        sound_type = options.get('sound_type', 'anxian')

        notes = notation_data.get('extracted_notes', [])
        if not notes:
            return self._create_empty_midi()

        midi_data = bytearray()

        midi_data.extend(self._write_header())

        track_data = bytearray()
        track_data.extend(self._write_tempo_event(tempo))
        track_data.extend(self._write_track_name('Guqin Score'))

        for note in notes:
            midi_note = note.get('midi', 60)
            duration = int((note.get('duration', 1) * self.tick_rate))
            velocity = self._get_velocity(sound_type)

            track_data.extend(self._write_note_on(0, midi_note, velocity))
            track_data.extend(self._write_note_off(duration, midi_note, 40))

        track_data.extend(self._write_end_of_track())

        midi_data.extend(self._write_track(track_data))

        return bytes(midi_data)

    def _create_empty_midi(self) -> bytes:
        midi_data = bytearray()
        midi_data.extend(self._write_header())
        track_data = bytearray()
        track_data.extend(self._write_tempo_event(60))
        track_data.extend(self._write_track_name('Empty'))
        track_data.extend(self._write_end_of_track())
        midi_data.extend(self._write_track(track_data))
        return bytes(midi_data)

    def _write_header(self) -> bytes:
        header = bytearray()
        header.extend(b'MThd')
        header.extend(struct.pack('>I', 6))
        header.extend(struct.pack('>H', 0))
        header.extend(struct.pack('>H', 1))
        header.extend(struct.pack('>H', self.tick_rate))
        return bytes(header)

    def _write_track(self, track_data: bytearray) -> bytes:
        track = bytearray()
        track.extend(b'MTrk')
        track.extend(struct.pack('>I', len(track_data)))
        track.extend(track_data)
        return bytes(track)

    def _write_tempo_event(self, tempo: int) -> bytes:
        event = bytearray()
        event.extend(b'\x00')
        event.extend(b'\xff\x51\x03')
        microseconds = int(60000000 / tempo)
        event.extend(struct.pack('>I', microseconds)[1:])
        return bytes(event)

    def _write_track_name(self, name: str) -> bytes:
        name_bytes = name.encode('utf-8')
        event = bytearray()
        event.extend(b'\x00')
        event.extend(b'\xff\x03')
        event.extend(struct.pack('B', len(name_bytes)))
        event.extend(name_bytes)
        return bytes(event)

    def _write_note_on(self, delta_time: int, note: int, velocity: int) -> bytes:
        event = bytearray()
        event.extend(self._encode_variable_length(delta_time))
        event.extend(b'\x90')
        event.extend(struct.pack('B', note & 0x7F))
        event.extend(struct.pack('B', velocity & 0x7F))
        return bytes(event)

    def _write_note_off(self, delta_time: int, note: int, velocity: int) -> bytes:
        event = bytearray()
        event.extend(self._encode_variable_length(delta_time))
        event.extend(b'\x80')
        event.extend(struct.pack('B', note & 0x7F))
        event.extend(struct.pack('B', velocity & 0x7F))
        return bytes(event)

    def _write_end_of_track(self) -> bytes:
        return b'\x00\xff\x2f\x00'

    def _encode_variable_length(self, value: int) -> bytes:
        buffer = bytearray()
        buffer.append(value & 0x7F)
        value >>= 7
        while value:
            buffer.insert(0, (value & 0x7F) | 0x80)
            value >>= 7
        return bytes(buffer)

    def _get_velocity(self, sound_type: str) -> int:
        velocities = {
            'anxian': 80,
            'fanyin': 60,
            'sanyin': 100
        }
        return velocities.get(sound_type, 80)

    def calculate_note(self, hui: int, string: int) -> Dict:
        if hui < 1 or hui > 13 or string < 1 or string > 7:
            return {'note': '?', 'pitch': '??', 'midi': 0, 'frequency': 0}

        ratio = HUI_RATIOS[hui - 1]
        freq = STRING_BASE_FREQS[string - 1] / ratio

        midi_num = round(69 + 12 * np.log2(freq / 440))
        octave = (midi_num // 12) - 1
        note_idx = midi_num % 12

        return {
            'note': NOTE_NAMES[note_idx],
            'pitch': NOTE_NAMES[note_idx] + str(octave),
            'midi': midi_num,
            'frequency': freq
        }

    def generate_simple_wave(self, frequency: float, duration: float, sample_rate: int = 44100) -> np.ndarray:
        t = np.linspace(0, duration, int(sample_rate * duration), False)
        wave = 0.3 * np.sin(2 * np.pi * frequency * t)
        envelope = np.exp(-t * 3)
        wave *= envelope
        wave = wave.astype(np.float32)
        return wave


midi_generator = MidiGenerator()
