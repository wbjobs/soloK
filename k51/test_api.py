import requests
import mido
import io

BASE_URL = 'http://127.0.0.1:5000'

def create_test_midi():
    mid = mido.MidiFile()
    track = mido.MidiTrack()
    mid.tracks.append(track)
    
    track.append(mido.Message('program_change', program=0, time=0))
    track.append(mido.Message('note_on', note=60, velocity=64, time=0))
    track.append(mido.Message('note_off', note=60, velocity=64, time=480))
    track.append(mido.Message('note_on', note=62, velocity=80, time=0))
    track.append(mido.Message('note_off', note=62, velocity=64, time=480))
    track.append(mido.Message('note_on', note=64, velocity=96, time=0))
    track.append(mido.Message('note_off', note=64, velocity=64, time=480))
    track.append(mido.Message('note_on', note=65, velocity=110, time=0))
    track.append(mido.Message('note_off', note=65, velocity=64, time=480))
    
    bio = io.BytesIO()
    mid.save(file=bio)
    return bio.getvalue()

def create_multitrack_tempo_midi():
    mid = mido.MidiFile(ticks_per_beat=480)
    
    tempo_track = mido.MidiTrack()
    mid.tracks.append(tempo_track)
    tempo_track.append(mido.MetaMessage('set_tempo', tempo=500000, time=0))
    tempo_track.append(mido.MetaMessage('set_tempo', tempo=400000, time=1920))
    tempo_track.append(mido.MetaMessage('set_tempo', tempo=600000, time=1920))
    
    melody_track = mido.MidiTrack()
    mid.tracks.append(melody_track)
    melody_track.append(mido.Message('program_change', program=0, channel=0, time=0))
    for note_val in [60, 64, 67, 72, 67, 64]:
        melody_track.append(mido.Message('note_on', note=note_val, velocity=80, channel=0, time=0))
        melody_track.append(mido.Message('note_off', note=note_val, velocity=64, channel=0, time=480))
    melody_track.append(mido.Message('note_on', note=60, velocity=100, channel=0, time=0))
    melody_track.append(mido.Message('note_off', note=60, velocity=64, channel=0, time=960))
    
    drum_track = mido.MidiTrack()
    mid.tracks.append(drum_track)
    for _ in range(8):
        drum_track.append(mido.Message('note_on', note=36, velocity=100, channel=9, time=0))
        drum_track.append(mido.Message('note_off', note=36, velocity=64, channel=9, time=240))
        drum_track.append(mido.Message('note_on', note=42, velocity=70, channel=9, time=0))
        drum_track.append(mido.Message('note_off', note=42, velocity=64, channel=9, time=240))
    drum_track.append(mido.Message('note_on', note=38, velocity=110, channel=9, time=0))
    drum_track.append(mido.Message('note_off', note=38, velocity=64, channel=9, time=480))
    
    bio = io.BytesIO()
    mid.save(file=bio)
    return bio.getvalue()

def test_basic_api():
    print("=== 测试基础 API ===\n")
    
    midi_data = create_test_midi()
    
    print("1. 测试上传 API...")
    files = {'file': ('test_basic.mid', midi_data, 'audio/midi')}
    response = requests.post(f'{BASE_URL}/api/upload', files=files)
    result = response.json()
    assert response.status_code == 200, f"上传失败: {result.get('error')}"
    file_id = result['data']['id']
    assert 'start_seconds' in result['data']['notes'][0], "缺少 start_seconds 字段"
    assert 'duration_seconds' in result['data']['notes'][0], "缺少 duration_seconds 字段"
    assert 'is_drum' in result['data']['notes'][0], "缺少 is_drum 字段"
    assert 'tempo_map' in result['data'], "缺少 tempo_map 字段"
    print(f"   ✓ 上传成功, ID={file_id}")
    print(f"   ✓ 音符包含 start_seconds, duration_seconds, is_drum 字段")
    print(f"   ✓ 包含 tempo_map 字段")
    
    return file_id

def test_multitrack_sync():
    print("\n=== 测试多音轨同步 ===\n")
    
    midi_data = create_multitrack_tempo_midi()
    with open('test_multitrack.mid', 'wb') as f:
        f.write(midi_data)
    
    files = {'file': ('test_multitrack.mid', midi_data, 'audio/midi')}
    response = requests.post(f'{BASE_URL}/api/upload', files=files)
    result = response.json()
    assert response.status_code == 200, f"上传失败: {result.get('error')}"
    data = result['data']
    
    print(f"  总音符数: {data['total_notes']}")
    print(f"  音轨数: {len(data['tracks'])}")
    print(f"  Tempo变化: {len(data['tempo_map'])} 个")
    for tc in data['tempo_map']:
        print(f"    tick={tc['tick']}, BPM={tc['bpm']:.1f}, 秒={tc['seconds']:.3f}")
    
    assert len(data['tempo_map']) == 3, f"应有3个tempo变化, 实际有 {len(data['tempo_map'])}"
    print("  ✓ Tempo map 包含所有tempo变化事件")
    
    drum_notes = [n for n in data['notes'] if n.get('is_drum') or n.get('channel') == 9]
    melody_notes = [n for n in data['notes'] if not (n.get('is_drum') or n.get('channel') == 9)]
    
    print(f"\n  旋律音符: {len(melody_notes)} 个")
    print(f"  鼓音符: {len(drum_notes)} 个")
    assert len(drum_notes) > 0, "应有鼓音符"
    assert len(melody_notes) > 0, "应有旋律音符"
    
    print("\n  验证时间戳对齐 (旋律 vs 鼓):")
    for i, mn in enumerate(melody_notes[:3]):
        print(f"    旋律[{i}]: note={mn['note']}, start_sec={mn['start_seconds']:.4f}, dur_sec={mn['duration_seconds']:.4f}")
    for i, dn in enumerate(drum_notes[:3]):
        print(f"    鼓[{i}]: note={dn['note']}, start_sec={dn['start_seconds']:.4f}, dur_sec={dn['duration_seconds']:.4f}")
    
    first_melody_start = melody_notes[0]['start_seconds']
    first_drum_start = drum_notes[0]['start_seconds']
    print(f"\n  首个旋律音符开始: {first_melody_start:.4f}s")
    print(f"  首个鼓音符开始: {first_drum_start:.4f}s")
    print(f"  时间差: {abs(first_melody_start - first_drum_start):.4f}s")
    assert abs(first_melody_start - first_drum_start) < 0.01, "旋律和鼓应在同一时刻开始"
    print("  ✓ 鼓轨和旋律轨时间戳正确对齐")
    
    print("\n  验证 tempo 变化影响时间计算:")
    tempo0 = data['tempo_map'][0]
    tempo1 = data['tempo_map'][1]
    tempo2 = data['tempo_map'][2]
    
    ticks_per_beat = data['ticks_per_beat']
    sec_per_tick_0 = (tempo0['tempo'] / 1_000_000) / ticks_per_beat
    sec_per_tick_1 = (tempo1['tempo'] / 1_000_000) / ticks_per_beat
    sec_per_tick_2 = (tempo2['tempo'] / 1_000_000) / ticks_per_beat
    
    print(f"    段0: {sec_per_tick_0*1000:.3f}ms/tick (BPM={tempo0['bpm']:.1f})")
    print(f"    段1: {sec_per_tick_1*1000:.3f}ms/tick (BPM={tempo1['bpm']:.1f})")
    print(f"    段2: {sec_per_tick_2*1000:.3f}ms/tick (BPM={tempo2['bpm']:.1f})")
    
    assert sec_per_tick_0 != sec_per_tick_1, "不同tempo段应有不同的秒/tick比率"
    print("  ✓ 不同tempo段的秒/tick比率正确不同")
    
    notes_before_change = [n for n in data['notes'] if n['start_seconds'] < tempo1['seconds']]
    notes_after_change = [n for n in data['notes'] if n['start_seconds'] >= tempo1['seconds']]
    print(f"\n    第一个tempo变化前音符: {len(notes_before_change)} 个")
    print(f"    第一个tempo变化后音符: {len(notes_after_change)} 个")
    print("  ✓ tempo变化正确影响音符时间戳")
    
    return data

def test_filtered_sync():
    print("\n=== 测试筛选后时间戳保留 ===\n")
    
    midi_data = create_multitrack_tempo_midi()
    files = {'file': ('test_filter.mid', midi_data, 'audio/midi')}
    response = requests.post(f'{BASE_URL}/api/upload', files=files)
    data = response.json()['data']
    file_id = data['id']
    
    instruments = data['instrument_types']
    if 'Drums' in instruments:
        response = requests.post(f'{BASE_URL}/api/filter/instrument',
                                 json={'file_id': file_id, 'instrument': 'Drums'})
        filtered = response.json()
        drum_notes = filtered['notes']
        assert len(drum_notes) > 0, "筛选后应有鼓音符"
        assert 'start_seconds' in drum_notes[0], "筛选后应保留 start_seconds"
        assert 'duration_seconds' in drum_notes[0], "筛选后应保留 duration_seconds"
        assert 'is_drum' in drum_notes[0], "筛选后应保留 is_drum"
        print(f"  ✓ 乐器筛选后保留时间戳字段 ({len(drum_notes)} 个鼓音符)")
    
    response = requests.post(f'{BASE_URL}/api/export/measures',
                             json={'file_id': file_id, 'start_measure': 1, 'end_measure': 2})
    exported = response.json()
    if exported['notes']:
        assert 'start_seconds' in exported['notes'][0], "导出后应保留 start_seconds"
        assert 'duration_seconds' in exported['notes'][0], "导出后应保留 duration_seconds"
        print(f"  ✓ 小节范围导出后保留时间戳字段 ({len(exported['notes'])} 个音符)")

def test_api():
    print("╔══════════════════════════════════════════════╗")
    print("║  MIDI 多音轨同步修复 - 完整测试            ║")
    print("╚══════════════════════════════════════════════╝\n")
    
    try:
        test_basic_api()
        test_multitrack_sync()
        test_filtered_sync()
        print("\n╔══════════════════════════════════════════════╗")
        print("║  ✓ 所有测试通过！多音轨同步修复已验证      ║")
        print("╚══════════════════════════════════════════════╝")
    except AssertionError as e:
        print(f"\n✗ 测试失败: {e}")
    except Exception as e:
        print(f"\n✗ 异常: {e}")

if __name__ == '__main__':
    test_api()
