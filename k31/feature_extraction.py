"""
特征提取模块 - 时域特征、频域特征、双谱分析
"""
import numpy as np
from scipy import signal
from scipy.signal import hilbert, stft
from scipy.stats import kurtosis, skew
from typing import Dict, List, Tuple
from config import SystemConfig, DEFAULT_CONFIG

class TimeDomainFeatures:
    def __init__(self, config: SystemConfig = DEFAULT_CONFIG):
        self.config = config
    
    def extract(self, signal: np.ndarray) -> Dict[str, np.ndarray]:
        if signal.ndim == 1:
            signal = signal[np.newaxis, :]
        
        features = {}
        
        features['rms'] = np.sqrt(np.mean(signal ** 2, axis=-1))
        features['peak'] = np.max(np.abs(signal), axis=-1)
        features['peak_to_peak'] = np.max(signal, axis=-1) - np.min(signal, axis=-1)
        features['crest_factor'] = features['peak'] / (features['rms'] + 1e-10)
        features['mean'] = np.mean(signal, axis=-1)
        features['variance'] = np.var(signal, axis=-1)
        features['std'] = np.std(signal, axis=-1)
        features['kurtosis'] = kurtosis(signal, axis=-1, fisher=True)
        features['skewness'] = skew(signal, axis=-1)
        
        features['impulse_factor'] = features['peak'] / (np.mean(np.abs(signal), axis=-1) + 1e-10)
        features['margin_factor'] = features['peak'] / (np.mean(np.sqrt(np.abs(signal)), axis=-1) ** 2 + 1e-10)
        features['shape_factor'] = features['rms'] / (np.mean(np.abs(signal), axis=-1) + 1e-10)
        
        analytic = hilbert(signal, axis=-1)
        envelope = np.abs(analytic)
        features['envelope_rms'] = np.sqrt(np.mean(envelope ** 2, axis=-1))
        features['envelope_peak'] = np.max(envelope, axis=-1)
        
        return features

class FrequencyDomainFeatures:
    def __init__(self, config: SystemConfig = DEFAULT_CONFIG):
        self.config = config
        self.sample_rate = config.hydrophone.sample_rate
        self.freq_bands = config.features.freq_bands
    
    def extract(self, signal: np.ndarray) -> Dict[str, np.ndarray]:
        if signal.ndim == 1:
            signal = signal[np.newaxis, :]
        
        n_samples = signal.shape[-1]
        freqs = np.fft.rfftfreq(n_samples, 1 / self.sample_rate)
        spectrum = np.abs(np.fft.rfft(signal, axis=-1))
        power_spectrum = spectrum ** 2
        
        features = {}
        
        total_energy = np.sum(power_spectrum, axis=-1)
        features['total_energy'] = total_energy
        
        band_energies = []
        for i, (low, high) in enumerate(self.freq_bands):
            mask = (freqs >= low) & (freqs <= high)
            energy = np.sum(power_spectrum[..., mask], axis=-1)
            features[f'band_{low/1000:.0f}_{high/1000:.0f}kHz_energy'] = energy
            features[f'band_{low/1000:.0f}_{high/1000:.0f}kHz_ratio'] = energy / (total_energy + 1e-10)
            band_energies.append(energy)
        
        broadband_mask = (freqs >= 10000) & (freqs <= 50000)
        broadband_energy = np.sum(power_spectrum[..., broadband_mask], axis=-1)
        lowband_mask = (freqs >= 1000) & (freqs <= 10000)
        lowband_energy = np.sum(power_spectrum[..., lowband_mask], axis=-1)
        features['broadband_ratio'] = broadband_energy / (lowband_energy + 1e-10)
        
        features['spectral_centroid'] = np.sum(freqs[np.newaxis, :] * power_spectrum, axis=-1) / (total_energy + 1e-10)
        features['spectral_spread'] = np.sqrt(
            np.sum(((freqs[np.newaxis, :] - features['spectral_centroid'][..., np.newaxis]) ** 2) * power_spectrum, axis=-1) / (total_energy + 1e-10)
        )
        features['spectral_skewness'] = np.sum(
            ((freqs[np.newaxis, :] - features['spectral_centroid'][..., np.newaxis]) ** 3) * power_spectrum, axis=-1
        ) / (total_energy * features['spectral_spread'] ** 3 + 1e-10)
        features['spectral_kurtosis'] = np.sum(
            ((freqs[np.newaxis, :] - features['spectral_centroid'][..., np.newaxis]) ** 4) * power_spectrum, axis=-1
        ) / (total_energy * features['spectral_spread'] ** 4 + 1e-10)
        
        features['spectral_entropy'] = self._spectral_entropy(power_spectrum)
        
        features['spectral_rolloff'] = self._spectral_rolloff(power_spectrum, freqs)
        
        noise_level_db = 20 * np.log10(features['rms'] / 1e-6 + 1e-10) if 'rms' in features else 0
        
        return features
    
    def _spectral_entropy(self, power_spectrum: np.ndarray) -> np.ndarray:
        ps_norm = power_spectrum / (np.sum(power_spectrum, axis=-1, keepdims=True) + 1e-10)
        ps_norm = np.clip(ps_norm, 1e-10, 1)
        entropy = -np.sum(ps_norm * np.log2(ps_norm), axis=-1)
        max_entropy = np.log2(ps_norm.shape[-1])
        return entropy / max_entropy
    
    def _spectral_rolloff(self, power_spectrum: np.ndarray, freqs: np.ndarray, percentile: float = 0.85) -> np.ndarray:
        cumulative = np.cumsum(power_spectrum, axis=-1)
        total = cumulative[..., -1:]
        threshold = total * percentile
        
        rolloff_idx = np.argmax(cumulative >= threshold, axis=-1)
        rolloff_freq = freqs[rolloff_idx]
        
        return rolloff_freq

class BispectrumAnalyzer:
    def __init__(self, config: SystemConfig = DEFAULT_CONFIG):
        self.config = config
        self.sample_rate = config.hydrophone.sample_rate
        self.bsl_fmin = config.features.bsl_fmin
        self.bsl_fmax = config.features.bsl_fmax
    
    def compute_bispectrum(self, signal: np.ndarray, nperseg: int = 1024, 
                           noverlap: int = 512) -> Tuple[np.ndarray, np.ndarray, np.ndarray]:
        if signal.ndim == 1:
            signal = signal[np.newaxis, :]
        
        n_channels = signal.shape[0]
        n_samples = signal.shape[-1]
        
        f, t, Zxx = stft(signal, fs=self.sample_rate, nperseg=nperseg, 
                         noverlap=noverlap, axis=-1)
        
        n_freqs = len(f)
        n_times = len(t)
        
        B = np.zeros((n_channels, n_freqs, n_freqs), dtype=np.complex128)
        
        for ch in range(n_channels):
            for i in range(n_times):
                X = Zxx[ch, :, i]
                B[ch] += np.outer(X, X) * np.conj(X[:, np.newaxis])
            
            B[ch] /= n_times
        
        return f, t, B
    
    def extract_bispectrum_features(self, signal: np.ndarray) -> Dict[str, np.ndarray]:
        f, t, B = self.compute_bispectrum(signal)
        
        freq_mask = (f >= self.bsl_fmin) & (f <= self.bsl_fmax)
        f_sub = f[freq_mask]
        B_sub = B[:, freq_mask, :][:, :, freq_mask]
        
        features = {}
        
        bsl = np.sum(np.abs(B_sub) ** 2, axis=(-1, -2))
        features['bispectrum_level'] = bsl
        
        B_phase = np.angle(B_sub)
        phase_coupling = np.abs(np.mean(np.exp(1j * B_phase), axis=(-1, -2)))
        features['phase_coupling_strength'] = phase_coupling
        
        n_peaks = []
        for ch in range(B_sub.shape[0]):
            B_mag = np.abs(B_sub[ch])
            threshold = np.mean(B_mag) + 3 * np.std(B_mag)
            peaks = np.sum(B_mag > threshold)
            n_peaks.append(peaks)
        features['bispectrum_peak_count'] = np.array(n_peaks)
        
        features['bispectrum_entropy'] = self._bispectrum_entropy(B_sub)
        
        diagonal = np.abs(np.diagonal(B_sub, axis1=1, axis2=2))
        features['diagonal_bispectrum_energy'] = np.sum(diagonal ** 2, axis=-1)
        
        return features
    
    def _bispectrum_entropy(self, B: np.ndarray) -> np.ndarray:
        B_mag = np.abs(B)
        B_norm = B_mag / (np.sum(B_mag, axis=(-1, -2), keepdims=True) + 1e-10)
        B_norm = np.clip(B_norm, 1e-10, 1)
        entropy = -np.sum(B_norm * np.log2(B_norm), axis=(-1, -2))
        max_entropy = np.log2(B_norm.shape[-1] * B_norm.shape[-2])
        return entropy / max_entropy

class BladePassFeatures:
    def __init__(self, config: SystemConfig = DEFAULT_CONFIG):
        self.config = config
        self.sample_rate = config.hydrophone.sample_rate
        self.num_blades = config.propeller.num_blades
    
    def extract(self, signal: np.ndarray, rpm: float) -> Dict[str, np.ndarray]:
        if signal.ndim == 1:
            signal = signal[np.newaxis, :]
        
        shaft_freq = rpm / 60.0
        blade_freq = shaft_freq * self.num_blades
        
        n_samples = signal.shape[-1]
        freqs = np.fft.rfftfreq(n_samples, 1 / self.sample_rate)
        spectrum = np.abs(np.fft.rfft(signal, axis=-1))
        
        features = {}
        
        num_harmonics = 10
        harmonic_amplitudes = []
        bandwidth = 50
        
        for h in range(1, num_harmonics + 1):
            target_freq = h * blade_freq
            mask = np.abs(freqs - target_freq) <= bandwidth
            
            if np.any(mask):
                amp = np.max(spectrum[..., mask], axis=-1)
            else:
                amp = np.zeros(signal.shape[0])
            
            harmonic_amplitudes.append(amp)
            features[f'bpf_h{h}_amplitude'] = amp
        
        harmonic_amplitudes = np.array(harmonic_amplitudes)
        
        features['bpf_fundamental'] = harmonic_amplitudes[0]
        features['bpf_harmonic_decay'] = harmonic_amplitudes[0] / (harmonic_amplitudes[-1] + 1e-10)
        features['bpf_total_energy'] = np.sum(harmonic_amplitudes ** 2, axis=0)
        
        total_spectrum_energy = np.sum(spectrum ** 2, axis=-1)
        features['bpf_energy_ratio'] = features['bpf_total_energy'] / (total_spectrum_energy + 1e-10)
        
        broadband_mask = (freqs >= 10000) & (freqs <= 50000)
        broadband_level = np.mean(spectrum[..., broadband_mask], axis=-1)
        features['broadband_to_bpf_ratio'] = broadband_level / (features['bpf_fundamental'] + 1e-10)
        
        features['spectral_line_disappearance'] = 1.0 - features['bpf_energy_ratio']
        
        return features

class FeatureExtractor:
    def __init__(self, config: SystemConfig = DEFAULT_CONFIG):
        self.config = config
        self.time_domain = TimeDomainFeatures(config)
        self.freq_domain = FrequencyDomainFeatures(config)
        self.bispectrum = BispectrumAnalyzer(config)
        self.blade_pass = BladePassFeatures(config)
    
    def extract_all(self, signal: np.ndarray, rpm: float = 120.0) -> Dict[str, np.ndarray]:
        time_features = self.time_domain.extract(signal)
        freq_features = self.freq_domain.extract(signal)
        bsl_features = self.bispectrum.extract_bispectrum_features(signal)
        bpf_features = self.blade_pass.extract(signal, rpm)
        
        all_features = {**time_features, **freq_features, **bsl_features, **bpf_features}
        
        return all_features
    
    def get_feature_vector(self, features: Dict[str, np.ndarray]) -> np.ndarray:
        feature_list = []
        for key in sorted(features.keys()):
            feature_list.append(features[key])
        return np.array(feature_list)
    
    def compute_spectrogram(self, signal: np.ndarray, nperseg: int = 1024, 
                            noverlap: int = 512) -> Tuple[np.ndarray, np.ndarray, np.ndarray]:
        f, t, Zxx = stft(signal, fs=self.sample_rate, nperseg=nperseg, 
                         noverlap=noverlap, axis=-1)
        return f, t, np.abs(Zxx)
