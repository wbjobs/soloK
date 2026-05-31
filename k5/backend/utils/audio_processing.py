import io
import numpy as np
import librosa
import soundfile as sf
from scipy.signal import spectrogram
from typing import List, Dict, Tuple, Optional


def load_audio(file_bytes: bytes, sr: int = 16000) -> Tuple[np.ndarray, int]:
    audio, sample_rate = librosa.load(io.BytesIO(file_bytes), sr=sr, mono=True)
    return audio, sample_rate


def get_audio_duration(file_bytes: bytes) -> float:
    audio, sr = load_audio(file_bytes)
    return len(audio) / sr


def validate_audio(file_bytes: bytes, min_duration: float = 5.0, max_duration: float = 15.0) -> Tuple[bool, str]:
    try:
        duration = get_audio_duration(file_bytes)
        if duration < min_duration:
            return False, f"Audio duration {duration:.2f}s is too short (minimum {min_duration}s)"
        if duration > max_duration:
            return False, f"Audio duration {duration:.2f}s is too long (maximum {max_duration}s)"
        return True, f"Audio duration: {duration:.2f}s"
    except Exception as e:
        return False, f"Invalid audio file: {str(e)}"


def detect_phoneme_boundaries(audio: np.ndarray, sr: int) -> List[Dict]:
    energy = librosa.feature.rms(y=audio)[0]
    times = librosa.times_like(energy, sr=sr)
    threshold = np.mean(energy) * 0.3

    boundaries = []
    in_phoneme = False
    start_time = 0.0

    for i, (t, e) in enumerate(zip(times, energy)):
        if e > threshold and not in_phoneme:
            start_time = t
            in_phoneme = True
        elif e < threshold and in_phoneme:
            boundaries.append({
                'start_time': round(start_time, 4),
                'end_time': round(t, 4),
                'phoneme': '',
                'tone': None,
                'confidence': 0.5
            })
            in_phoneme = False

    if in_phoneme:
        boundaries.append({
            'start_time': round(start_time, 4),
            'end_time': round(times[-1], 4),
            'phoneme': '',
            'tone': None,
            'confidence': 0.5
        })

    if not boundaries:
        boundaries = [{
            'start_time': 0.0,
            'end_time': round(len(audio) / sr, 4),
            'phoneme': '',
            'tone': None,
            'confidence': 0.3
        }]

    return boundaries


def generate_waveform_data(audio: np.ndarray, sr: int, num_points: int = 1000) -> Dict:
    duration = len(audio) / sr
    step = max(1, len(audio) // num_points)
    samples = audio[::step]
    times = np.linspace(0, duration, len(samples))

    return {
        'times': times.tolist(),
        'values': samples.tolist(),
        'duration': duration,
        'sample_rate': sr
    }


def generate_spectrogram_data(audio: np.ndarray, sr: int) -> Dict:
    f, t, Sxx = spectrogram(audio, fs=sr, nperseg=512, noverlap=256)
    Sxx_db = 10 * np.log10(Sxx + 1e-10)
    Sxx_db = (Sxx_db - Sxx_db.min()) / (Sxx_db.max() - Sxx_db.min() + 1e-10)

    return {
        'frequencies': f.tolist(),
        'times': t.tolist(),
        'spectrogram': Sxx_db.tolist()
    }


def generate_initial_annotation(audio: np.ndarray, sr: int) -> Dict:
    phonemes = detect_phoneme_boundaries(audio, sr)
    waveform = generate_waveform_data(audio, sr)
    spectrogram = generate_spectrogram_data(audio, sr)

    return {
        'phonemes': phonemes,
        'waveform': waveform,
        'spectrogram': spectrogram,
        'duration': len(audio) / sr
    }
