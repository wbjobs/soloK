import numpy as np
import librosa
from scipy.signal import lfilter
from scipy.stats import kurtosis

NATURAL_HF_RATIO_BENCHMARK = 0.25
NATURAL_SPECTRAL_CENTROID_BENCHMARK = 2500.0
NATURAL_RESIDUAL_KURTOSIS_BENCHMARK = 5.0
HF_CUTOFF_HZ = 3000


class InversePhonemeTransformer:
    def __init__(self, sr=16000, lpc_order=16):
        self.sr = sr
        self.lpc_order = lpc_order
    
    def _levinson_durbin(self, frame, order):
        N = len(frame)
        if N <= order + 1:
            return np.array([1.0]), 0.0
        
        r = np.zeros(order + 1)
        for k in range(order + 1):
            r[k] = np.dot(frame[:N - k], frame[k:])
        
        if r[0] < 1e-10:
            return np.array([1.0]), 0.0
        
        a = np.zeros(order + 1)
        a[0] = 1.0
        e = r[0]
        
        for i in range(1, order + 1):
            if e < 1e-10:
                break
            
            acc = 0.0
            for j in range(1, i):
                acc += a[j] * r[i - j]
            lam = (r[i] - acc) / e
            
            a_new = a.copy()
            for j in range(1, i):
                a_new[j] = a[j] - lam * a[i - j]
            a_new[i] = -lam
            
            e = e * (1.0 - lam * lam)
            a = a_new
        
        return a, e
    
    def compute_residual(self, audio):
        frame_length = int(0.025 * self.sr)
        hop_length = int(0.01 * self.sr)
        
        n_frames = max(1, (len(audio) - frame_length) // hop_length + 1)
        
        residual_frames = []
        original_frames = []
        
        for i in range(n_frames):
            start = i * hop_length
            end = min(start + frame_length, len(audio))
            frame = audio[start:end]
            
            if len(frame) < frame_length:
                frame = np.pad(frame, (0, frame_length - len(frame)))
            
            windowed = frame * np.hanning(len(frame))
            
            lpc_coeffs, _ = self._levinson_durbin(windowed, self.lpc_order)
            
            if len(lpc_coeffs) <= 1:
                residual_frames.append(windowed.copy())
                original_frames.append(windowed.copy())
                continue
            
            residual = lfilter(lpc_coeffs, [1.0], windowed)
            
            residual_frames.append(residual)
            original_frames.append(windowed)
        
        return residual_frames, original_frames, hop_length


class VCDetector:
    def __init__(self, sr=16000):
        self.sr = sr
        self.transformer = InversePhonemeTransformer(sr=sr)
    
    def _compute_residual_hf_ratio(self, residual_frames):
        hf_ratios = []
        
        for residual in residual_frames:
            if np.max(np.abs(residual)) < 1e-10:
                continue
            
            stft = np.abs(np.fft.rfft(residual))
            freqs = np.fft.rfftfreq(len(residual), 1 / self.sr)
            
            total_energy = np.sum(stft ** 2)
            if total_energy < 1e-20:
                continue
            
            hf_mask = freqs > HF_CUTOFF_HZ
            lf_mask = freqs <= HF_CUTOFF_HZ
            
            hf_energy = np.sum(stft[hf_mask] ** 2) if hf_mask.sum() > 0 else 0.0
            lf_energy = np.sum(stft[lf_mask] ** 2) if lf_mask.sum() > 0 else 1e-20
            
            ratio = hf_energy / (lf_energy + hf_energy + 1e-10)
            hf_ratios.append(ratio)
        
        if len(hf_ratios) == 0:
            return 0.15
        
        return np.mean(hf_ratios)
    
    def _compute_residual_spectral_centroid(self, residual_frames):
        centroids = []
        
        for residual in residual_frames:
            if np.max(np.abs(residual)) < 1e-10:
                continue
            
            stft = np.abs(np.fft.rfft(residual))
            freqs = np.fft.rfftfreq(len(residual), 1 / self.sr)
            
            magnitude = np.abs(stft)
            total_mag = np.sum(magnitude)
            if total_mag < 1e-10:
                continue
            
            centroid = np.sum(freqs * magnitude) / total_mag
            centroids.append(centroid)
        
        if len(centroids) == 0:
            return 1500.0
        
        return np.mean(centroids)
    
    def _compute_residual_kurtosis(self, residual_frames):
        all_residuals = np.concatenate(residual_frames)
        
        if np.max(np.abs(all_residuals)) < 1e-10:
            return 3.0
        
        k = kurtosis(all_residuals)
        return k
    
    def _compute_residual_flatness(self, residual_frames):
        flatnesses = []
        
        for residual in residual_frames:
            if np.max(np.abs(residual)) < 1e-10:
                continue
            
            stft = np.abs(np.fft.rfft(residual)) + 1e-10
            
            geo_mean = np.exp(np.mean(np.log(stft)))
            arith_mean = np.mean(stft)
            
            flatness = geo_mean / (arith_mean + 1e-10)
            flatnesses.append(flatness)
        
        if len(flatnesses) == 0:
            return 0.5
        
        return np.mean(flatnesses)
    
    def _compute_residual_energy_ratio(self, residual_frames, original_frames):
        residual_energies = []
        original_energies = []
        
        for res, orig in zip(residual_frames, original_frames):
            res_e = np.sum(res ** 2)
            orig_e = np.sum(orig ** 2)
            
            if orig_e > 1e-10:
                residual_energies.append(res_e)
                original_energies.append(orig_e)
        
        if len(residual_energies) == 0:
            return 0.5
        
        ratios = np.array(residual_energies) / (np.array(original_energies) + 1e-10)
        return np.mean(ratios)
    
    def detect_vc(self, audio):
        residual_frames, original_frames, hop_length = self.transformer.compute_residual(audio)
        
        hf_ratio = self._compute_residual_hf_ratio(residual_frames)
        spectral_centroid = self._compute_residual_spectral_centroid(residual_frames)
        residual_kurtosis = self._compute_residual_kurtosis(residual_frames)
        flatness = self._compute_residual_flatness(residual_frames)
        energy_ratio = self._compute_residual_energy_ratio(residual_frames, original_frames)
        
        hf_deviation = max(0, (NATURAL_HF_RATIO_BENCHMARK - hf_ratio) / NATURAL_HF_RATIO_BENCHMARK)
        centroid_deviation = max(0, (NATURAL_SPECTRAL_CENTROID_BENCHMARK - spectral_centroid) / NATURAL_SPECTRAL_CENTROID_BENCHMARK)
        kurtosis_deviation = max(0, (NATURAL_RESIDUAL_KURTOSIS_BENCHMARK - residual_kurtosis) / NATURAL_RESIDUAL_KURTOSIS_BENCHMARK)
        
        flatness_score = min(1.0, flatness * 2)
        energy_score = min(1.0, max(0, (energy_ratio - 0.3) * 2))
        
        vc_score = (
            hf_deviation * 0.30 +
            centroid_deviation * 0.20 +
            kurtosis_deviation * 0.15 +
            flatness_score * 0.15 +
            energy_score * 0.20
        )
        
        vc_score = np.clip(vc_score, 0, 1)
        
        is_vc = vc_score > 0.5
        
        frame_scores = self._compute_frame_vc_scores(residual_frames, original_frames, hop_length)
        
        return {
            'vc_probability': round(float(vc_score), 4),
            'is_voice_converted': is_vc,
            'identity_replaced': is_vc,
            'metrics': {
                'hf_ratio': round(float(hf_ratio), 6),
                'spectral_centroid': round(float(spectral_centroid), 2),
                'residual_kurtosis': round(float(residual_kurtosis), 4),
                'spectral_flatness': round(float(flatness), 6),
                'energy_ratio': round(float(energy_ratio), 6)
            },
            'interpretation': {
                'hf_ratio_status': 'normal' if hf_ratio >= NATURAL_HF_RATIO_BENCHMARK * 0.7 else 'depleted',
                'centroid_status': 'normal' if spectral_centroid >= NATURAL_SPECTRAL_CENTROID_BENCHMARK * 0.7 else 'shifted_low',
                'kurtosis_status': 'natural' if residual_kurtosis >= 3.0 else 'vc_like',
            },
            'frame_scores': frame_scores.tolist() if isinstance(frame_scores, np.ndarray) else frame_scores
        }
    
    def _compute_frame_vc_scores(self, residual_frames, original_frames, hop_length):
        scores = []
        
        for res, orig in zip(residual_frames, original_frames):
            orig_e = np.sum(orig ** 2)
            if orig_e < 1e-10:
                scores.append(0.0)
                continue
            
            res_e = np.sum(res ** 2)
            energy_ratio = res_e / (orig_e + 1e-10)
            
            if np.max(np.abs(res)) < 1e-10:
                scores.append(0.8)
                continue
            
            stft = np.abs(np.fft.rfft(res))
            freqs = np.fft.rfftfreq(len(res), 1 / self.sr)
            
            total_e = np.sum(stft ** 2)
            if total_e < 1e-20:
                scores.append(0.5)
                continue
            
            hf_mask = freqs > HF_CUTOFF_HZ
            lf_mask = freqs <= HF_CUTOFF_HZ
            hf_e = np.sum(stft[hf_mask] ** 2) if hf_mask.sum() > 0 else 0
            lf_e = np.sum(stft[lf_mask] ** 2) if lf_mask.sum() > 0 else 1e-10
            
            hf_ratio = hf_e / (lf_e + hf_e + 1e-10)
            
            score = (1 - hf_ratio) * 0.6 + min(1, max(0, (energy_ratio - 0.3) * 2)) * 0.4
            scores.append(float(score))
        
        return np.array(scores)
