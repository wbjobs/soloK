"""
改进版特征提取模块 - 增强空化与噪声区分能力，优化叶面/叶背空化特征
"""
import numpy as np
from scipy import signal
from scipy.signal import hilbert, stft, welch
from scipy.stats import kurtosis, skew
from typing import Dict, List, Tuple
from config import SystemConfig, DEFAULT_CONFIG

class TimeDomainFeaturesEnhanced:
    def __init__(self, config: SystemConfig = DEFAULT_CONFIG):
        self.config = config
        self.sample_rate = config.hydrophone.sample_rate
    
    def extract(self, input_signal: np.ndarray) -> Dict[str, np.ndarray]:
        if input_signal.ndim == 1:
            input_signal = input_signal[np.newaxis, :]
        
        features = {}
        
        features['rms'] = np.sqrt(np.mean(input_signal ** 2, axis=-1))
        features['peak'] = np.max(np.abs(input_signal), axis=-1)
        features['peak_to_peak'] = np.max(input_signal, axis=-1) - np.min(input_signal, axis=-1)
        features['crest_factor'] = features['peak'] / (features['rms'] + 1e-10)
        features['mean'] = np.mean(input_signal, axis=-1)
        features['variance'] = np.var(input_signal, axis=-1)
        features['std'] = np.std(input_signal, axis=-1)
        features['kurtosis'] = kurtosis(input_signal, axis=-1, fisher=True)
        features['skewness'] = skew(input_signal, axis=-1)
        
        features['impulse_factor'] = features['peak'] / (np.mean(np.abs(input_signal), axis=-1) + 1e-10)
        features['margin_factor'] = features['peak'] / (np.mean(np.sqrt(np.abs(input_signal)), axis=-1) ** 2 + 1e-10)
        features['shape_factor'] = features['rms'] / (np.mean(np.abs(input_signal), axis=-1) + 1e-10)
        
        analytic = hilbert(input_signal, axis=-1)
        envelope = np.abs(analytic)
        features['envelope_rms'] = np.sqrt(np.mean(envelope ** 2, axis=-1))
        features['envelope_peak'] = np.max(envelope, axis=-1)
        features['envelope_mean'] = np.mean(envelope, axis=-1)
        features['envelope_skewness'] = skew(envelope, axis=-1)
        features['envelope_kurtosis'] = kurtosis(envelope, axis=-1, fisher=True)
        
        envelope_diff = np.diff(envelope, axis=-1)
        features['envelope_variation'] = np.mean(np.abs(envelope_diff), axis=-1) / (features['envelope_mean'] + 1e-10)
        
        pulse_features = self._extract_pulse_waveform_features(input_signal, envelope)
        features.update(pulse_features)
        
        zero_crossings = self._count_zero_crossings(input_signal)
        features['zero_crossing_rate'] = zero_crossings / input_signal.shape[-1]
        
        return features
    
    def _extract_pulse_waveform_features(self, input_signal: np.ndarray, envelope: np.ndarray) -> Dict[str, np.ndarray]:
        n_channels = input_signal.shape[0]
        features = {}
        
        all_rise_times = []
        all_fall_times = []
        all_pulse_widths = []
        all_pulse_counts = []
        
        for ch in range(n_channels):
            env = envelope[ch]
            threshold = np.mean(env) + 2.5 * np.std(env)
            
            above_threshold = env > threshold
            crossings = np.diff(above_threshold.astype(int))
            
            pulse_starts = np.where(crossings == 1)[0]
            pulse_ends = np.where(crossings == -1)[0]
            
            if len(pulse_starts) > len(pulse_ends):
                pulse_starts = pulse_starts[:-1]
            elif len(pulse_ends) > len(pulse_starts):
                pulse_ends = pulse_ends[1:]
            
            rise_times = []
            fall_times = []
            pulse_widths = []
            
            for start, end in zip(pulse_starts, pulse_ends):
                if end - start > 5:
                    pulse_env = env[start:end]
                    peak_idx = np.argmax(pulse_env)
                    
                    if peak_idx > 0 and peak_idx < len(pulse_env) - 1:
                        rise_time = peak_idx / self.sample_rate
                        fall_time = (len(pulse_env) - peak_idx) / self.sample_rate
                        pulse_width = (end - start) / self.sample_rate
                        
                        rise_times.append(rise_time)
                        fall_times.append(fall_time)
                        pulse_widths.append(pulse_width)
            
            if rise_times:
                all_rise_times.append(np.mean(rise_times))
                all_fall_times.append(np.mean(fall_times))
                all_pulse_widths.append(np.mean(pulse_widths))
            else:
                all_rise_times.append(0)
                all_fall_times.append(0)
                all_pulse_widths.append(0)
            
            all_pulse_counts.append(len(pulse_starts))
        
        features['pulse_count'] = np.array(all_pulse_counts)
        features['avg_rise_time'] = np.array(all_rise_times)
        features['avg_fall_time'] = np.array(all_fall_times)
        features['avg_pulse_width'] = np.array(all_pulse_widths)
        features['pulse_rate'] = np.array(all_pulse_counts) / (input_signal.shape[-1] / self.sample_rate)
        
        features['rise_fall_ratio'] = np.array(all_rise_times) / (np.array(all_fall_times) + 1e-10)
        
        return features
    
    def _count_zero_crossings(self, input_signal: np.ndarray) -> np.ndarray:
        crossings = np.sum(np.diff(np.sign(input_signal), axis=-1) != 0, axis=-1)
        return crossings

class FrequencyDomainFeaturesEnhanced:
    def __init__(self, config: SystemConfig = DEFAULT_CONFIG):
        self.config = config
        self.sample_rate = config.hydrophone.sample_rate
        self.freq_bands = config.features.freq_bands
    
    def extract(self, input_signal: np.ndarray) -> Dict[str, np.ndarray]:
        if input_signal.ndim == 1:
            input_signal = input_signal[np.newaxis, :]
        
        n_samples = input_signal.shape[-1]
        n_channels = input_signal.shape[0]
        freqs = np.fft.rfftfreq(n_samples, 1 / self.sample_rate)
        spectrum = np.abs(np.fft.rfft(input_signal, axis=-1))
        power_spectrum = spectrum ** 2
        
        features = {}
        
        total_energy = np.sum(power_spectrum, axis=-1)
        features['total_energy'] = total_energy
        
        for i, (low, high) in enumerate(self.freq_bands):
            mask = (freqs >= low) & (freqs <= high)
            energy = np.sum(power_spectrum[..., mask], axis=-1)
            features[f'band_{low/1000:.0f}_{high/1000:.0f}kHz_energy'] = energy
            features[f'band_{low/1000:.0f}_{high/1000:.0f}kHz_ratio'] = energy / (total_energy + 1e-10)
        
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
        features['spectral_flatness'] = self._spectral_flatness(power_spectrum)
        features['spectral_crest'] = self._spectral_crest(power_spectrum)
        
        harmonic_features = self._extract_harmonic_features(spectrum, freqs)
        features.update(harmonic_features)
        
        modulation_features = self._extract_modulation_features(input_signal, spectrum, freqs)
        features.update(modulation_features)
        
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
    
    def _spectral_flatness(self, power_spectrum: np.ndarray) -> np.ndarray:
        geometric_mean = np.exp(np.mean(np.log(power_spectrum + 1e-10), axis=-1))
        arithmetic_mean = np.mean(power_spectrum, axis=-1)
        flatness = geometric_mean / (arithmetic_mean + 1e-10)
        return flatness
    
    def _spectral_crest(self, power_spectrum: np.ndarray) -> np.ndarray:
        peak = np.max(power_spectrum, axis=-1)
        mean = np.mean(power_spectrum, axis=-1)
        crest = peak / (mean + 1e-10)
        return crest
    
    def _extract_harmonic_features(self, spectrum: np.ndarray, freqs: np.ndarray) -> Dict[str, np.ndarray]:
        n_channels = spectrum.shape[0]
        features = {}
        
        peak_indices = []
        for ch in range(n_channels):
            peaks, _ = signal.find_peaks(spectrum[ch], distance=10, prominence=np.max(spectrum[ch]) * 0.05)
            peak_indices.append(peaks)
        
        features['num_spectral_peaks'] = np.array([len(p) for p in peak_indices])
        
        peak_freqs_list = []
        for ch in range(n_channels):
            if len(peak_indices[ch]) > 0:
                peak_freqs = freqs[peak_indices[ch]]
                peak_freqs_list.append(peak_freqs)
            else:
                peak_freqs_list.append(np.array([]))
        
        harmonic_ratios = []
        for ch in range(n_channels):
            if len(peak_freqs_list[ch]) >= 2:
                sorted_freqs = np.sort(peak_freqs_list[ch])
                if len(sorted_freqs) >= 2:
                    fundamental = sorted_freqs[0]
                    harmonics = sorted_freqs[1:]
                    harmonic_deviation = np.mean(np.abs(harmonics / fundamental - np.round(harmonics / fundamental)))
                    harmonic_ratios.append(harmonic_deviation)
                else:
                    harmonic_ratios.append(0)
            else:
                harmonic_ratios.append(0)
        
        features['harmonic_deviation'] = np.array(harmonic_ratios)
        
        peak_amplitudes = []
        for ch in range(n_channels):
            if len(peak_indices[ch]) > 0:
                amplitudes = spectrum[ch, peak_indices[ch]]
                if len(amplitudes) > 1:
                    decay = amplitudes[0] / (amplitudes[-1] + 1e-10)
                    peak_amplitudes.append(decay)
                else:
                    peak_amplitudes.append(0)
            else:
                peak_amplitudes.append(0)
        
        features['harmonic_decay_ratio'] = np.array(peak_amplitudes)
        
        return features
    
    def _extract_modulation_features(self, input_signal: np.ndarray, spectrum: np.ndarray, freqs: np.ndarray) -> Dict[str, np.ndarray]:
        n_channels = input_signal.shape[0]
        features = {}
        
        analytic = hilbert(input_signal, axis=-1)
        envelope = np.abs(analytic)
        
        envelope_spectrum = np.abs(np.fft.rfft(envelope - np.mean(envelope, axis=-1, keepdims=True), axis=-1))
        envelope_freqs = np.fft.rfftfreq(envelope.shape[-1], 1 / self.sample_rate)
        
        mod_depth = []
        for ch in range(n_channels):
            env = envelope[ch]
            env_max = np.percentile(env, 95)
            env_min = np.percentile(env, 5)
            depth = (env_max - env_min) / (env_max + env_min + 1e-10)
            mod_depth.append(depth)
        
        features['modulation_depth'] = np.array(mod_depth)
        
        mod_freq = []
        for ch in range(n_channels):
            env_spec = envelope_spectrum[ch]
            if len(env_spec) > 0:
                dominant_idx = np.argmax(env_spec)
                mod_freq.append(envelope_freqs[dominant_idx])
            else:
                mod_freq.append(0)
        
        features['dominant_modulation_freq'] = np.array(mod_freq)
        
        high_freq_mask = freqs >= 20000
        low_freq_mask = freqs <= 10000
        
        high_freq_ratio = np.sum(spectrum[..., high_freq_mask], axis=-1) / (np.sum(spectrum[..., low_freq_mask], axis=-1) + 1e-10)
        features['high_low_freq_ratio'] = high_freq_ratio
        
        return features

class BladePassFeaturesEnhanced:
    def __init__(self, config: SystemConfig = DEFAULT_CONFIG):
        self.config = config
        self.sample_rate = config.hydrophone.sample_rate
        self.num_blades = config.propeller.num_blades
    
    def extract(self, input_signal: np.ndarray, rpm: float) -> Dict[str, np.ndarray]:
        if input_signal.ndim == 1:
            input_signal = input_signal[np.newaxis, :]
        
        n_samples = input_signal.shape[-1]
        freqs = np.fft.rfftfreq(n_samples, 1 / self.sample_rate)
        spectrum = np.abs(np.fft.rfft(input_signal, axis=-1))
        
        shaft_freq = rpm / 60.0
        blade_freq = shaft_freq * self.num_blades
        
        features = {}
        
        num_harmonics = 12
        harmonic_amplitudes = []
        harmonic_phases = []
        bandwidth = 50
        
        for h in range(1, num_harmonics + 1):
            target_freq = h * blade_freq
            mask = np.abs(freqs - target_freq) <= bandwidth
            
            if np.any(mask):
                peak_idx = np.argmax(spectrum[..., mask], axis=-1)
                amp = np.max(spectrum[..., mask], axis=-1)
                
                phase = np.zeros(spectrum.shape[0])
                for ch in range(spectrum.shape[0]):
                    freq_idx = np.where(mask)[0][peak_idx[ch]]
                    phase[ch] = np.angle(np.fft.rfft(input_signal[ch], axis=-1)[freq_idx])
                
            else:
                amp = np.zeros(spectrum.shape[0])
                phase = np.zeros(spectrum.shape[0])
            
            harmonic_amplitudes.append(amp)
            harmonic_phases.append(phase)
            features[f'bpf_h{h}_amplitude'] = amp
            features[f'bpf_h{h}_phase'] = phase
        
        harmonic_amplitudes = np.array(harmonic_amplitudes)
        harmonic_phases = np.array(harmonic_phases)
        
        features['bpf_fundamental'] = harmonic_amplitudes[0]
        
        if harmonic_amplitudes.shape[0] >= 3:
            decay_ratios = harmonic_amplitudes[:-1] / (harmonic_amplitudes[1:] + 1e-10)
            features['bpf_harmonic_decay'] = np.mean(decay_ratios, axis=0)
        
        features['bpf_total_energy'] = np.sum(harmonic_amplitudes ** 2, axis=0)
        
        total_spectrum_energy = np.sum(spectrum ** 2, axis=-1)
        features['bpf_energy_ratio'] = features['bpf_total_energy'] / (total_spectrum_energy + 1e-10)
        
        broadband_mask = (freqs >= 10000) & (freqs <= 50000)
        broadband_level = np.mean(spectrum[..., broadband_mask], axis=-1)
        features['broadband_to_bpf_ratio'] = broadband_level / (features['bpf_fundamental'] + 1e-10)
        
        features['spectral_line_disappearance'] = 1.0 - features['bpf_energy_ratio']
        
        even_harmonics = harmonic_amplitudes[1::2]
        odd_harmonics = harmonic_amplitudes[0::2]
        features['even_odd_harmonic_ratio'] = np.sum(even_harmonics, axis=0) / (np.sum(odd_harmonics, axis=0) + 1e-10)
        
        if harmonic_phases.shape[0] >= 2:
            phase_diff = np.diff(harmonic_phases, axis=0)
            features['bpf_phase_variation'] = np.mean(np.abs(phase_diff), axis=0)
        
        sideband_energy = self._extract_sideband_energy(spectrum, freqs, blade_freq, num_harmonics)
        features.update(sideband_energy)
        
        return features
    
    def _extract_sideband_energy(self, spectrum: np.ndarray, freqs: np.ndarray, 
                                  blade_freq: float, num_harmonics: int) -> Dict[str, np.ndarray]:
        n_channels = spectrum.shape[0]
        sideband_energies = []
        
        for h in range(1, min(num_harmonics + 1, 6)):
            center_freq = h * blade_freq
            sideband_width = blade_freq * 0.5
            
            center_mask = np.abs(freqs - center_freq) <= 20
            sideband_mask = (np.abs(freqs - center_freq) > 20) & (np.abs(freqs - center_freq) <= sideband_width)
            
            center_energy = np.sum(spectrum[..., center_mask], axis=-1)
            sideband_energy = np.sum(spectrum[..., sideband_mask], axis=-1)
            
            ratio = sideband_energy / (center_energy + 1e-10)
            sideband_energies.append(ratio)
        
        features = {}
        for i, ratio in enumerate(sideband_energies):
            features[f'bpf_h{i+1}_sideband_ratio'] = ratio
        
        features['avg_sideband_ratio'] = np.mean(sideband_energies, axis=0)
        
        return features

class BispectrumAnalyzerEnhanced:
    def __init__(self, config: SystemConfig = DEFAULT_CONFIG):
        self.config = config
        self.sample_rate = config.hydrophone.sample_rate
        self.bsl_fmin = config.features.bsl_fmin
        self.bsl_fmax = config.features.bsl_fmax
    
    def compute_bispectrum(self, input_signal: np.ndarray, nperseg: int = 1024, 
                           noverlap: int = 512) -> Tuple[np.ndarray, np.ndarray, np.ndarray]:
        if input_signal.ndim == 1:
            input_signal = input_signal[np.newaxis, :]
        
        n_channels = input_signal.shape[0]
        
        f, t, Zxx = stft(input_signal, fs=self.sample_rate, nperseg=nperseg, 
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
    
    def extract_bispectrum_features(self, input_signal: np.ndarray) -> Dict[str, np.ndarray]:
        f, t, B = self.compute_bispectrum(input_signal)
        
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
        
        off_diagonal_mask = ~np.eye(B_sub.shape[1], dtype=bool)
        off_diagonal_energy = np.sum(np.abs(B_sub[:, off_diagonal_mask]) ** 2, axis=-1)
        features['off_diagonal_bispectrum_energy'] = off_diagonal_energy
        
        features['diagonal_offdiagonal_ratio'] = features['diagonal_bispectrum_energy'] / (off_diagonal_energy + 1e-10)
        
        return features
    
    def _bispectrum_entropy(self, B: np.ndarray) -> np.ndarray:
        B_mag = np.abs(B)
        B_norm = B_mag / (np.sum(B_mag, axis=(-1, -2), keepdims=True) + 1e-10)
        B_norm = np.clip(B_norm, 1e-10, 1)
        entropy = -np.sum(B_norm * np.log2(B_norm), axis=(-1, -2))
        max_entropy = np.log2(B_norm.shape[-1] * B_norm.shape[-2])
        return entropy / max_entropy

class FeatureExtractorEnhanced:
    def __init__(self, config: SystemConfig = DEFAULT_CONFIG):
        self.config = config
        self.time_domain = TimeDomainFeaturesEnhanced(config)
        self.freq_domain = FrequencyDomainFeaturesEnhanced(config)
        self.bispectrum = BispectrumAnalyzerEnhanced(config)
        self.blade_pass = BladePassFeaturesEnhanced(config)
    
    def extract_all(self, input_signal: np.ndarray, rpm: float = 120.0) -> Dict[str, np.ndarray]:
        time_features = self.time_domain.extract(input_signal)
        freq_features = self.freq_domain.extract(input_signal)
        bsl_features = self.bispectrum.extract_bispectrum_features(input_signal)
        bpf_features = self.blade_pass.extract(input_signal, rpm)
        
        all_features = {**time_features, **freq_features, **bsl_features, **bpf_features}
        
        return all_features
    
    def compute_spectrogram(self, input_signal: np.ndarray, nperseg: int = 1024, 
                            noverlap: int = 512) -> Tuple[np.ndarray, np.ndarray, np.ndarray]:
        f, t, Zxx = stft(input_signal, fs=self.sample_rate, nperseg=nperseg, 
                         noverlap=noverlap, axis=-1)
        return f, t, np.abs(Zxx)
