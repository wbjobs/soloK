import librosa
import numpy as np
import soundfile as sf
from pathlib import Path
from pydub import AudioSegment
import io

def load_audio(file_path, target_sr=16000, max_duration=60):
    try:
        if file_path.endswith('.mp3'):
            audio = AudioSegment.from_mp3(file_path)
            audio = audio.set_frame_rate(target_sr).set_channels(1)
            samples = np.array(audio.get_array_of_samples()).astype(np.float32) / 32768.0
            sr = target_sr
        elif file_path.endswith('.flac'):
            audio = AudioSegment.from_file(file_path, format="flac")
            audio = audio.set_frame_rate(target_sr).set_channels(1)
            samples = np.array(audio.get_array_of_samples()).astype(np.float32) / 32768.0
            sr = target_sr
        else:
            samples, sr = librosa.load(file_path, sr=target_sr, mono=True)
        
        duration = len(samples) / sr
        if duration > max_duration:
            samples = samples[:int(max_duration * sr)]
            duration = max_duration
        
        return samples, sr, duration
    except Exception as e:
        raise Exception(f"音频加载失败: {str(e)}")

def compute_lfcc(audio, sr, n_mfcc=20, n_fft=512, hop_length=160):
    S = np.abs(librosa.stft(audio, n_fft=n_fft, hop_length=hop_length)) ** 2
    S = librosa.power_to_db(S, ref=np.max)
    lfcc = librosa.feature.mfcc(S=S, n_mfcc=n_mfcc)
    lfcc_delta = librosa.feature.delta(lfcc)
    lfcc_delta2 = librosa.feature.delta(lfcc, order=2)
    features = np.vstack([lfcc, lfcc_delta, lfcc_delta2])
    return features

def compute_spectrogram(audio, sr, n_fft=1024, hop_length=256):
    D = librosa.stft(audio, n_fft=n_fft, hop_length=hop_length)
    mag = np.abs(D)
    phase = np.angle(D)
    mag_db = librosa.amplitude_to_db(mag, ref=np.max)
    return mag_db, phase, D

def compute_phase_spectrum(audio, sr, n_fft=1024, hop_length=256):
    D = librosa.stft(audio, n_fft=n_fft, hop_length=hop_length)
    phase = np.angle(D)
    phase_unwrapped = np.unwrap(phase, axis=1)
    phase_derivative = np.diff(phase_unwrapped, axis=1)
    return phase, phase_derivative

def extract_melspectrogram(audio, sr, n_mels=80, n_fft=1024, hop_length=256):
    mel_spec = librosa.feature.melspectrogram(
        y=audio, sr=sr, n_mels=n_mels, n_fft=n_fft, hop_length=hop_length
    )
    mel_spec_db = librosa.power_to_db(mel_spec, ref=np.max)
    return mel_spec_db

def normalize_audio(audio):
    max_val = np.max(np.abs(audio))
    if max_val > 0:
        audio = audio / max_val
    return audio

def frame_to_time(frame_idx, hop_length, sr):
    return frame_idx * hop_length / sr

def time_to_frame(time_sec, hop_length, sr):
    return int(time_sec * sr / hop_length)
