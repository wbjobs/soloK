import mido
import io
import json

MIDI_INSTRUMENTS = [
    "Acoustic Grand Piano", "Bright Acoustic Piano", "Electric Grand Piano", "Honky-tonk Piano",
    "Electric Piano 1", "Electric Piano 2", "Harpsichord", "Clavinet",
    "Celesta", "Glockenspiel", "Music Box", "Vibraphone",
    "Marimba", "Xylophone", "Tubular Bells", "Dulcimer",
    "Drawbar Organ", "Percussive Organ", "Rock Organ", "Church Organ",
    "Reed Organ", "Accordion", "Harmonica", "Tango Accordion",
    "Acoustic Guitar (nylon)", "Acoustic Guitar (steel)", "Electric Guitar (jazz)", "Electric Guitar (clean)",
    "Electric Guitar (muted)", "Overdriven Guitar", "Distortion Guitar", "Guitar Harmonics",
    "Acoustic Bass", "Electric Bass (finger)", "Electric Bass (pick)", "Fretless Bass",
    "Slap Bass 1", "Slap Bass 2", "Synth Bass 1", "Synth Bass 2",
    "Violin", "Viola", "Cello", "Contrabass",
    "Tremolo Strings", "Pizzicato Strings", "Orchestral Harp", "Timpani",
    "String Ensemble 1", "String Ensemble 2", "Synth Strings 1", "Synth Strings 2",
    "Choir Aahs", "Voice Oohs", "Synth Choir", "Orchestra Hit",
    "Trumpet", "Trombone", "Tuba", "Muted Trumpet",
    "French Horn", "Brass Section", "Synth Brass 1", "Synth Brass 2",
    "Soprano Sax", "Alto Sax", "Tenor Sax", "Baritone Sax",
    "Oboe", "English Horn", "Bassoon", "Clarinet",
    "Piccolo", "Flute", "Recorder", "Pan Flute",
    "Blown Bottle", "Shakuhachi", "Whistle", "Ocarina",
    "Lead 1 (square)", "Lead 2 (sawtooth)", "Lead 3 (calliope)", "Lead 4 (chiff)",
    "Lead 5 (charang)", "Lead 6 (voice)", "Lead 7 (fifths)", "Lead 8 (bass + lead)",
    "Pad 1 (new age)", "Pad 2 (warm)", "Pad 3 (polysynth)", "Pad 4 (choir)",
    "Pad 5 (bowed)", "Pad 6 (metallic)", "Pad 7 (halo)", "Pad 8 (sweep)",
    "FX 1 (rain)", "FX 2 (soundtrack)", "FX 3 (crystal)", "FX 4 (atmosphere)",
    "FX 5 (brightness)", "FX 6 (goblins)", "FX 7 (echoes)", "FX 8 (sci-fi)",
    "Sitar", "Banjo", "Shamisen", "Koto",
    "Kalimba", "Bagpipe", "Fiddle", "Shanai",
    "Tinkle Bell", "Agogo", "Steel Drums", "Woodblock",
    "Taiko Drum", "Melodic Tom", "Synth Drum", "Reverse Cymbal",
    "Guitar Fret Noise", "Breath Noise", "Seashore", "Bird Tweet",
    "Telephone Ring", "Helicopter", "Applause", "Gunshot"
]

DRUM_CHANNEL = 9

def get_instrument_name(program, channel):
    if channel == DRUM_CHANNEL:
        return "Drums"
    if 0 <= program < len(MIDI_INSTRUMENTS):
        return MIDI_INSTRUMENTS[program]
    return f"Unknown ({program})"

def note_to_name(note):
    notes = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']
    octave = (note // 12) - 1
    name = notes[note % 12]
    return f"{name}{octave}"

def build_tempo_map(midi_file):
    tempo_map = []
    for track in midi_file.tracks:
        current_tick = 0
        for msg in track:
            current_tick += msg.time
            if msg.type == 'set_tempo':
                tempo_map.append((current_tick, msg.tempo))
    if not tempo_map:
        tempo_map.append((0, 500000))
    tempo_map.sort(key=lambda x: x[0])
    merged = [tempo_map[0]]
    for tick, tempo in tempo_map[1:]:
        if tick == merged[-1][0]:
            merged[-1] = (tick, tempo)
        else:
            merged.append((tick, tempo))
    return merged

def tick_to_seconds(tick, tempo_map, ticks_per_beat):
    total_seconds = 0.0
    prev_tick = 0
    current_tempo = 500000
    for map_tick, map_tempo in tempo_map:
        if map_tick >= tick:
            break
        if map_tick > prev_tick:
            delta_ticks = map_tick - prev_tick
            total_seconds += (delta_ticks * current_tempo) / (ticks_per_beat * 1_000_000)
        current_tempo = map_tempo
        prev_tick = map_tick
    delta_ticks = tick - prev_tick
    total_seconds += (delta_ticks * current_tempo) / (ticks_per_beat * 1_000_000)
    return total_seconds

def parse_midi(file_content):
    midi_file = mido.MidiFile(file=io.BytesIO(file_content))
    
    ticks_per_beat = midi_file.ticks_per_beat
    time_signature = (4, 4)
    
    tempo_map = build_tempo_map(midi_file)
    initial_tempo = tempo_map[0][1] if tempo_map else 500000
    
    tracks_data = []
    instruments_by_track = {}
    
    for track_idx, track in enumerate(midi_file.tracks):
        track_name = f"Track {track_idx}"
        current_time = 0
        notes = []
        active_notes = {}
        instruments = set()
        current_program = 0
        control_changes = []
        
        for msg in track:
            current_time += msg.time
            
            if msg.type == 'track_name':
                track_name = msg.name
            
            elif msg.type == 'time_signature':
                time_signature = (msg.numerator, msg.denominator)
            
            elif msg.type == 'program_change':
                current_program = msg.program
                channel = msg.channel if hasattr(msg, 'channel') else 0
                instruments.add((current_program, channel))
                if track_idx not in instruments_by_track:
                    instruments_by_track[track_idx] = []
                instruments_by_track[track_idx].append({
                    'program': current_program,
                    'channel': channel,
                    'time': current_time,
                    'name': get_instrument_name(current_program, channel)
                })
            
            elif msg.type == 'control_change':
                control_changes.append({
                    'time': current_time,
                    'control': msg.control,
                    'value': msg.value,
                    'channel': msg.channel
                })
            
            elif msg.type == 'note_on' and msg.velocity > 0:
                key = (msg.note, msg.channel)
                active_notes[key] = {
                    'note': msg.note,
                    'name': note_to_name(msg.note),
                    'velocity': msg.velocity,
                    'start_time': current_time,
                    'channel': msg.channel,
                    'program': current_program,
                    'is_drum': msg.channel == DRUM_CHANNEL
                }
            
            elif (msg.type == 'note_off') or (msg.type == 'note_on' and msg.velocity == 0):
                key = (msg.note, msg.channel)
                if key in active_notes:
                    note_info = active_notes.pop(key)
                    note_info['end_time'] = current_time
                    note_info['duration'] = current_time - note_info['start_time']
                    notes.append(note_info)
        
        for key, note_info in active_notes.items():
            note_info['end_time'] = current_time
            note_info['duration'] = current_time - note_info['start_time']
            notes.append(note_info)
        
        instruments_list = []
        if track_idx in instruments_by_track:
            instruments_list = instruments_by_track[track_idx]
        
        tracks_data.append({
            'track_index': track_idx,
            'name': track_name,
            'notes': notes,
            'instruments': instruments_list,
            'control_changes': control_changes,
            'note_count': len(notes)
        })
    
    total_ticks = max([track['notes'][-1]['end_time'] if track['notes'] else 0 for track in tracks_data]) if tracks_data else 0
    
    beats_per_measure = time_signature[0]
    ticks_per_measure = ticks_per_beat * beats_per_measure
    total_measures = (total_ticks // ticks_per_measure) + 1
    
    total_duration = tick_to_seconds(total_ticks, tempo_map, ticks_per_beat)
    
    all_notes = []
    for track in tracks_data:
        for note in track['notes']:
            note_copy = note.copy()
            note_copy['track'] = track['track_index']
            note_copy['instrument'] = get_instrument_name(note.get('program', 0), note.get('channel', 0))
            note_copy['measure'] = note['start_time'] // ticks_per_measure + 1
            note_copy['start_seconds'] = tick_to_seconds(note['start_time'], tempo_map, ticks_per_beat)
            note_copy['duration_seconds'] = tick_to_seconds(note['start_time'] + note['duration'], tempo_map, ticks_per_beat) - note_copy['start_seconds']
            all_notes.append(note_copy)
    
    all_notes.sort(key=lambda x: (x['start_seconds'], x['start_time']))
    
    instrument_types = set()
    for track in tracks_data:
        for inst in track['instruments']:
            instrument_types.add(inst['name'])
    has_drum_notes = any(n.get('is_drum') or n.get('channel') == DRUM_CHANNEL for n in all_notes)
    if has_drum_notes:
        instrument_types.add("Drums")
    
    tempo_changes = []
    for tick, tempo in tempo_map:
        tempo_changes.append({
            'tick': tick,
            'tempo': tempo,
            'bpm': mido.tempo2bpm(tempo),
            'seconds': tick_to_seconds(tick, tempo_map, ticks_per_beat)
        })
    
    return {
        'ticks_per_beat': ticks_per_beat,
        'ticks_per_measure': ticks_per_measure,
        'tempo': initial_tempo,
        'time_signature': f"{time_signature[0]}/{time_signature[1]}",
        'beats_per_measure': beats_per_measure,
        'total_ticks': total_ticks,
        'total_measures': total_measures,
        'total_notes': len(all_notes),
        'duration_seconds': total_duration,
        'tracks': tracks_data,
        'notes': all_notes,
        'instrument_types': sorted(list(instrument_types)),
        'tempo_bpm': mido.tempo2bpm(initial_tempo),
        'tempo_map': tempo_changes
    }

def filter_by_instrument(analysis_data, instrument_name):
    filtered_notes = [n for n in analysis_data['notes'] if n['instrument'] == instrument_name]
    filtered_tracks = []
    for track in analysis_data['tracks']:
        track_notes = [n for n in track['notes'] if get_instrument_name(n.get('program', 0), n.get('channel', 0)) == instrument_name]
        if track_notes:
            track_copy = track.copy()
            track_copy['notes'] = track_notes
            track_copy['note_count'] = len(track_notes)
            filtered_tracks.append(track_copy)
    
    return {
        **analysis_data,
        'notes': filtered_notes,
        'tracks': filtered_tracks,
        'total_notes': len(filtered_notes),
        'filtered_instrument': instrument_name
    }

def export_measures_range(analysis_data, start_measure, end_measure):
    start_tick = (start_measure - 1) * analysis_data['ticks_per_measure']
    end_tick = end_measure * analysis_data['ticks_per_measure']
    
    filtered_notes = [
        n for n in analysis_data['notes']
        if start_tick <= n['start_time'] < end_tick
    ]
    
    filtered_tracks = []
    for track in analysis_data['tracks']:
        track_notes = [
            n for n in track['notes']
            if start_tick <= n['start_time'] < end_tick
        ]
        if track_notes:
            track_copy = track.copy()
            track_copy['notes'] = track_notes
            track_copy['note_count'] = len(track_notes)
            filtered_tracks.append(track_copy)
    
    return {
        **analysis_data,
        'notes': filtered_notes,
        'tracks': filtered_tracks,
        'total_notes': len(filtered_notes),
        'export_range': {
            'start_measure': start_measure,
            'end_measure': end_measure,
            'start_tick': start_tick,
            'end_tick': end_tick
        }
    }
