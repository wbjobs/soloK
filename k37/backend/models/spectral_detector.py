import numpy as np
import librosa
from scipy import signal
from scipy.stats import kurtosis, skew

class SpectralConsistencyDetector:
    def __init__(self):
        pass
    
    def compute_phase_artifact_score(self, phase, phase_derivative):
        phase_unwrapped = np.unwrap(phase, axis=1)
        
        phase_jumps = np.abs(np.diff(phase_unwrapped, axis=1))
        large_jumps = np.sum(phase_jumps > np.pi) / phase_jumps.size
        
        phase_var = np.var(phase_derivative, axis=1)
        var_mean = np.mean(phase_var)
        
        phase_correlation = np.corrcoef(phase_unwrapped)
        correlation_score = 1 - np.mean(np.abs(phase_correlation - np.eye(phase_correlation.shape[0])))
        
        artifact_score = (large_jumps * 0.4 + (1 / (1 + var_mean)) * 0.3 + correlation_score * 0.3)
        
        return artifact_score, large_jumps, phase_var
    
    def compute_magnitude_consistency(self, mag_db):
        mag_smooth = signal.medfilt2d(mag_db, kernel_size=3)
        residual = mag_db - mag_smooth
        
        residual_std = np.std(residual)
        residual_kurtosis = kurtosis(residual.flatten())
        residual_skew = skew(residual.flatten())
        
        high_freq_noise = np.mean(mag_db[-20:, :])
        low_freq_energy = np.mean(mag_db[:20, :])
        noise_ratio = high_freq_noise / (low_freq_energy + 1e-10)
        
        consistency_score = (
            (1 / (1 + residual_std)) * 0.3 +
            (1 / (1 + abs(residual_kurtosis) / 10)) * 0.3 +
            (1 / (1 + noise_ratio)) * 0.4
        )
        
        frame_residual_std = np.std(residual, axis=0)
        
        return consistency_score, frame_residual_std
    
    def compute_harmonic_distortion(self, audio, sr):
        harmonic, percussive = librosa.effects.hpss(audio)
        
        harmonic_energy = np.sum(harmonic ** 2)
        percussive_energy = np.sum(percussive ** 2)
        total_energy = harmonic_energy + percussive_energy + 1e-10
        
        harmonic_ratio = harmonic_energy / total_energy
        percussive_ratio = percussive_energy / total_energy
        
        h_ratio = np.mean(harmonic_ratio)
        
        return h_ratio, harmonic, percussive
    
    def detect_frame_anomalies(self, mag_db, phase):
        frame_mag_var = np.var(mag_db, axis=0)
        frame_phase_var = np.var(np.unwrap(phase, axis=1), axis=0)
        
        mag_threshold = np.mean(frame_mag_var) + 2 * np.std(frame_mag_var)
        phase_threshold = np.mean(frame_phase_var) + 2 * np.std(frame_phase_var)
        
        mag_anomalies = frame_mag_var > mag_threshold
        phase_anomalies = frame_phase_var > phase_threshold
        
        combined_anomalies = mag_anomalies | phase_anomalies
        
        return combined_anomalies.astype(float), frame_mag_var, frame_phase_var
    
    def predict(self, audio, sr, mag_db, phase, phase_derivative):
        artifact_score, large_jumps, phase_var = self.compute_phase_artifact_score(phase, phase_derivative)
        consistency_score, frame_residual_std = self.compute_magnitude_consistency(mag_db)
        h_ratio, harmonic, percussive = self.compute_harmonic_distortion(audio, sr)
        frame_anomalies, frame_mag_var, frame_phase_var = self.detect_frame_anomalies(mag_db, phase)
        
        combined_score = (
            artifact_score * 0.35 +
            (1 - consistency_score) * 0.35 +
            (1 - h_ratio) * 0.3
        )
        
        fake_prob = np.clip(combined_score, 0, 1)
        
        frame_scores = (
            frame_residual_std / np.max(frame_residual_std + 1e-10) * 0.4 +
            frame_anomalies * 0.6
        )
        
        return fake_prob, frame_scores
