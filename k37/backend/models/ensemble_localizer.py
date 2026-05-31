import numpy as np
import torch
import torch.nn as nn
import torch.nn.functional as F
from scipy.ndimage import median_filter
import librosa

SILENCE_ENERGY_PERCENTILE = 15
SILENCE_RMS_DB_THRESHOLD = -40
MIN_SPEECH_ENERGY_RATIO = 0.02

class EnsembleDetector:
    def __init__(self):
        self.weights = {
            'rawnet2': 0.35,
            'lfcc_gmm': 0.25,
            'spectral': 0.25,
            'vc': 0.15
        }
    
    def ensemble_predict(self, rawnet2_score, lfcc_gmm_score, spectral_score):
        weights = np.array([0.4, 0.3, 0.3])
        scores = np.array([rawnet2_score, lfcc_gmm_score, spectral_score])
        
        weighted_score = np.sum(weights * scores)
        confidence = 1 - np.std(scores)
        
        return weighted_score, confidence
    
    def ensemble_predict_with_vc(self, rawnet2_score, lfcc_gmm_score, spectral_score, vc_score):
        weights = np.array([
            self.weights['rawnet2'],
            self.weights['lfcc_gmm'],
            self.weights['spectral'],
            self.weights['vc']
        ])
        scores = np.array([rawnet2_score, lfcc_gmm_score, spectral_score, vc_score])
        
        weighted_score = np.sum(weights * scores)
        confidence = 1 - np.std(scores)
        
        return weighted_score, confidence
    
    def adaptive_ensemble(self, rawnet2_score, lfcc_gmm_score, spectral_score, audio_duration):
        base_weights = np.array([0.35, 0.35, 0.3])
        
        if audio_duration < 5:
            base_weights = np.array([0.5, 0.25, 0.25])
        elif audio_duration < 15:
            base_weights = np.array([0.4, 0.3, 0.3])
        
        scores = np.array([rawnet2_score, lfcc_gmm_score, spectral_score])
        weighted_score = np.sum(base_weights * scores)
        
        return weighted_score, base_weights

def _compute_frame_energy(audio, sr, hop_length, n_fft):
    n_frames = 1 + (len(audio) - n_fft) // hop_length
    if n_frames <= 0:
        n_frames = 1
    
    frame_energy = np.zeros(n_frames)
    for i in range(n_frames):
        start = i * hop_length
        end = min(start + n_fft, len(audio))
        frame = audio[start:end]
        if len(frame) > 0:
            frame_energy[i] = np.sqrt(np.mean(frame ** 2))
    
    return frame_energy

def _compute_silence_mask(audio, sr, hop_length, n_fft):
    frame_energy = _compute_frame_energy(audio, sr, hop_length, n_fft)
    
    max_energy = np.max(frame_energy)
    if max_energy < 1e-10:
        return np.zeros(len(frame_energy), dtype=bool), frame_energy
    
    energy_db = 20 * np.log10(frame_energy + 1e-10)
    max_db = np.max(energy_db)
    
    if max_db > SILENCE_RMS_DB_THRESHOLD:
        absolute_threshold = SILENCE_RMS_DB_THRESHOLD
    else:
        absolute_threshold = max_db - 30
    
    relative_threshold = np.percentile(energy_db, SILENCE_ENERGY_PERCENTILE)
    silence_db_threshold = max(absolute_threshold, relative_threshold)
    
    speech_mask = energy_db > silence_db_threshold
    
    min_speech_energy = max_energy * MIN_SPEECH_ENERGY_RATIO
    speech_mask |= frame_energy > min_speech_energy
    
    from scipy.ndimage import binary_dilation, binary_erosion
    speech_mask = binary_dilation(speech_mask, iterations=2)
    speech_mask = binary_erosion(speech_mask, iterations=1)
    
    return speech_mask, frame_energy

class ForgeryLocalizer:
    def __init__(self, sr=16000, hop_length=256, n_fft=1024, frame_threshold=0.5):
        self.sr = sr
        self.hop_length = hop_length
        self.n_fft = n_fft
        self.frame_threshold = frame_threshold
    
    def frame_to_time(self, frame_idx):
        return frame_idx * self.hop_length / self.sr
    
    def localize_frames(self, rawnet2_attn, lfcc_frame_scores, spectral_frame_scores, audio_length, audio=None):
        max_len = max(len(rawnet2_attn), len(lfcc_frame_scores), len(spectral_frame_scores))
        
        def resize_array(arr, target_len):
            if len(arr) == target_len:
                return arr
            return np.interp(np.linspace(0, 1, target_len), 
                           np.linspace(0, 1, len(arr)), arr)
        
        rawnet2_resized = resize_array(rawnet2_attn, max_len)
        lfcc_resized = resize_array(lfcc_frame_scores, max_len)
        spectral_resized = resize_array(spectral_frame_scores, max_len)
        
        rawnet2_norm = (rawnet2_resized - np.min(rawnet2_resized)) / (np.max(rawnet2_resized) - np.min(rawnet2_resized) + 1e-10)
        lfcc_norm = (lfcc_resized - np.min(lfcc_resized)) / (np.max(lfcc_resized) - np.min(lfcc_resized) + 1e-10)
        spectral_norm = (spectral_resized - np.min(spectral_resized)) / (np.max(spectral_resized) - np.min(spectral_resized) + 1e-10)
        
        combined = (rawnet2_norm * 0.4 + lfcc_norm * 0.3 + spectral_norm * 0.3)
        
        combined_smoothed = median_filter(combined, size=5)
        
        speech_mask = None
        if audio is not None and len(audio) > 0:
            speech_mask_raw, frame_energy = _compute_silence_mask(
                audio, self.sr, self.hop_length, self.n_fft
            )
            speech_mask = resize_array(speech_mask_raw.astype(float), max_len) > 0.5
        
        threshold = np.mean(combined_smoothed) + np.std(combined_smoothed) * 0.5
        suspicious_frames = combined_smoothed > threshold
        
        if speech_mask is not None:
            suspicious_frames &= speech_mask
            
            energy_mask_float = resize_array(
                _compute_frame_energy(audio, self.sr, self.hop_length, self.n_fft),
                max_len
            )
            max_energy = np.max(energy_mask_float)
            if max_energy > 1e-10:
                energy_weight = np.clip(energy_mask_float / max_energy, 0.1, 1.0)
                combined_smoothed = combined_smoothed * energy_weight
        
        return combined_smoothed, suspicious_frames, threshold
    
    def find_suspicious_segments(self, suspicious_frames, min_duration=0.1):
        segments = []
        in_segment = False
        start_frame = 0
        
        for i, is_suspicious in enumerate(suspicious_frames):
            if is_suspicious and not in_segment:
                in_segment = True
                start_frame = i
            elif not is_suspicious and in_segment:
                in_segment = False
                end_frame = i - 1
                duration = self.frame_to_time(end_frame - start_frame)
                if duration >= min_duration:
                    segments.append({
                        'start_time': round(self.frame_to_time(start_frame), 3),
                        'end_time': round(self.frame_to_time(end_frame), 3),
                        'duration': round(duration, 3)
                    })
        
        if in_segment:
            end_frame = len(suspicious_frames) - 1
            duration = self.frame_to_time(end_frame - start_frame)
            if duration >= min_duration:
                segments.append({
                    'start_time': round(self.frame_to_time(start_frame), 3),
                    'end_time': round(self.frame_to_time(end_frame), 3),
                    'duration': round(duration, 3)
                })
        
        if len(segments) == 0 and np.any(suspicious_frames):
            frames = np.where(suspicious_frames)[0]
            if len(frames) > 0:
                segments.append({
                    'start_time': round(self.frame_to_time(frames[0]), 3),
                    'end_time': round(self.frame_to_time(frames[-1]), 3),
                    'duration': round(self.frame_to_time(frames[-1] - frames[0]), 3)
                })
        
        return segments
    
    def generate_heatmap_data(self, frame_scores, spec_time_bins):
        heatmap = np.interp(
            np.linspace(0, 1, spec_time_bins),
            np.linspace(0, 1, len(frame_scores)),
            frame_scores
        )
        return heatmap
