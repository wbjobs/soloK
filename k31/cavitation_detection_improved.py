"""
改进版空化检测模块 - 解决低工况假阳性问题
增加：工况自适应阈值、信噪比验证、脉冲特征验证、时空一致性检查
"""
import numpy as np
from collections import deque
from typing import Dict, Tuple, List
from scipy import signal
from scipy.signal import hilbert
from config import SystemConfig, DEFAULT_CONFIG, DetectionThresholds

class OperatingConditionAwareThreshold:
    def __init__(self, config: SystemConfig = DEFAULT_CONFIG):
        self.config = config
        self.baseline_by_condition = {}
        self.min_samples_per_condition = 5
    
    def _get_condition_key(self, rpm: float, ship_speed: float) -> str:
        rpm_bin = int(rpm / 10) * 10
        speed_bin = int(ship_speed / 2) * 2
        return f"rpm_{rpm_bin}_speed_{speed_bin}"
    
    def update_baseline(self, features: Dict[str, np.ndarray], rpm: float, ship_speed: float):
        key = self._get_condition_key(rpm, ship_speed)
        
        if key not in self.baseline_by_condition:
            self.baseline_by_condition[key] = {
                'samples': 0,
                'broadband_ratio': [],
                'kurtosis': [],
                'high_band_ratio': []
            }
        
        baseline = self.baseline_by_condition[key]
        baseline['samples'] += 1
        baseline['broadband_ratio'].append(np.mean(features.get('broadband_ratio', 0)))
        baseline['kurtosis'].append(np.mean(features.get('kurtosis', 3)))
        baseline['high_band_ratio'].append(np.mean(features.get('band_10_50kHz_ratio', 0)))
    
    def get_adaptive_threshold(self, rpm: float, ship_speed: float) -> Dict[str, float]:
        key = self._get_condition_key(rpm, ship_speed)
        
        default_thresholds = {
            'broadband_ratio': self.config.thresholds.broadband_energy_ratio,
            'kurtosis': self.config.thresholds.kurtosis,
            'high_band_ratio': 0.4
        }
        
        if key not in self.baseline_by_condition:
            return default_thresholds
        
        baseline = self.baseline_by_condition[key]
        if baseline['samples'] < self.min_samples_per_condition:
            return default_thresholds
        
        adaptive = {}
        adaptive['broadband_ratio'] = np.mean(baseline['broadband_ratio']) * 2.5 + 0.5
        adaptive['kurtosis'] = max(4.0, np.mean(baseline['kurtosis']) * 1.5)
        adaptive['high_band_ratio'] = np.mean(baseline['high_band_ratio']) * 2.0 + 0.1
        
        return adaptive

class CavitationPulseVerifier:
    def __init__(self, sample_rate: int = 200000):
        self.sample_rate = sample_rate
    
    def extract_pulse_features(self, input_signal: np.ndarray) -> Dict[str, np.ndarray]:
        if input_signal.ndim == 1:
            input_signal = input_signal[np.newaxis, :]
        
        n_channels = input_signal.shape[0]
        features = {}
        
        analytic = hilbert(input_signal, axis=-1)
        envelope = np.abs(analytic)
        
        envelope_mean = np.mean(envelope, axis=-1)
        envelope_std = np.std(envelope, axis=-1)
        threshold = envelope_mean + 3 * envelope_std
        
        pulse_counts = []
        pulse_amplitudes = []
        pulse_durations = []
        
        for ch in range(n_channels):
            above_threshold = envelope[ch] > threshold[ch]
            crossings = np.diff(above_threshold.astype(int))
            
            pulse_starts = np.where(crossings == 1)[0]
            pulse_ends = np.where(crossings == -1)[0]
            
            if len(pulse_starts) > len(pulse_ends):
                pulse_starts = pulse_starts[:-1]
            elif len(pulse_ends) > len(pulse_starts):
                pulse_ends = pulse_ends[1:]
            
            n_pulses = len(pulse_starts)
            pulse_counts.append(n_pulses)
            
            if n_pulses > 0:
                valid_pairs = [(s, e) for s, e in zip(pulse_starts, pulse_ends) if e > s]
                if valid_pairs:
                    amps = [np.max(envelope[ch, start:end]) for start, end in valid_pairs]
                    durations = [(e - s) / self.sample_rate for s, e in valid_pairs]
                    pulse_amplitudes.append(np.mean(amps))
                    pulse_durations.append(np.mean(durations))
                else:
                    pulse_amplitudes.append(0)
                    pulse_durations.append(0)
            else:
                pulse_amplitudes.append(0)
                pulse_durations.append(0)
        
        features['pulse_count'] = np.array(pulse_counts)
        features['pulse_amplitude'] = np.array(pulse_amplitudes)
        features['pulse_duration'] = np.array(pulse_durations)
        features['pulse_rate'] = np.array(pulse_counts) / (input_signal.shape[-1] / self.sample_rate)
        
        return features
    
    def verify_pulse_pattern(self, pulse_features: Dict[str, np.ndarray], 
                              rpm: float, num_blades: int = 5) -> np.ndarray:
        blade_freq = (rpm / 60.0) * num_blades
        expected_pulse_rate = blade_freq
        
        pulse_rate = pulse_features.get('pulse_rate', np.zeros(1))
        pulse_count = pulse_features.get('pulse_count', np.zeros(1))
        
        rate_match = np.abs(pulse_rate - expected_pulse_rate) / (expected_pulse_rate + 1e-10)
        rate_match_score = np.clip(1 - rate_match, 0, 1)
        
        count_score = np.clip(pulse_count / 10, 0, 1)
        
        return np.minimum(rate_match_score, count_score)

class ImprovedCavitationDetector:
    def __init__(self, config: SystemConfig = DEFAULT_CONFIG):
        self.config = config
        self.thresholds = config.thresholds
        self.baseline_features = None
        self.baseline_samples = 0
        self.is_calibrated = False
        
        self.condition_threshold = OperatingConditionAwareThreshold(config)
        self.pulse_verifier = CavitationPulseVerifier(config.hydrophone.sample_rate)
        
        self.history_scores = deque(maxlen=10)
        self.history_decisions = deque(maxlen=10)
        
        self.condition_baseline = {}
    
    def calibrate(self, features: Dict[str, np.ndarray], rpm: float = 120, ship_speed: float = 15):
        if self.baseline_features is None:
            self.baseline_features = {k: v.copy() for k, v in features.items()}
            self.baseline_samples = 1
        else:
            for k in features:
                self.baseline_features[k] = (self.baseline_features[k] * self.baseline_samples + features[k]) / (self.baseline_samples + 1)
            self.baseline_samples += 1
        self.is_calibrated = True
        
        self.condition_threshold.update_baseline(features, rpm, ship_speed)
    
    def reset_calibration(self):
        self.baseline_features = None
        self.baseline_samples = 0
        self.is_calibrated = False
        self.history_scores.clear()
        self.history_decisions.clear()
    
    def compute_snr_score(self, features: Dict[str, np.ndarray]) -> np.ndarray:
        n_channels = features.get('rms', np.zeros(1)).shape[0]
        
        signal_energy = features.get('band_10_50kHz_energy', np.zeros(n_channels))
        noise_energy = features.get('band_1_5kHz_energy', np.ones(n_channels))
        
        snr = signal_energy / (noise_energy + 1e-10)
        snr_score = np.clip(snr / 5.0, 0, 1)
        
        return snr_score
    
    def detect_time_domain_improved(self, features: Dict[str, np.ndarray], 
                                     rpm: float, ship_speed: float) -> Tuple[np.ndarray, Dict[str, np.ndarray]]:
        n_channels = features['kurtosis'].shape[0]
        scores = np.zeros(n_channels)
        indicators = {}
        
        adaptive_thresh = self.condition_threshold.get_adaptive_threshold(rpm, ship_speed)
        
        kurtosis_thresh = adaptive_thresh['kurtosis']
        kurtosis_score = np.clip((features['kurtosis'] - 3) / (kurtosis_thresh - 3), 0, 1)
        kurtosis_score = np.where(features['kurtosis'] < 3.5, 0, kurtosis_score)
        scores += kurtosis_score * 0.25
        indicators['kurtosis'] = kurtosis_score
        
        skewness_score = np.clip(np.abs(features['skewness']) / self.thresholds.skewness, 0, 1)
        skewness_score = np.where(np.abs(features['skewness']) < 0.5, 0, skewness_score)
        scores += skewness_score * 0.15
        indicators['skewness'] = skewness_score
        
        crest_score = np.clip(features['crest_factor'] / self.thresholds.crest_factor, 0, 1)
        crest_score = np.where(features['crest_factor'] < 4, 0, crest_score)
        scores += crest_score * 0.15
        indicators['crest_factor'] = crest_score
        
        pulse_count = features.get('pulse_count', np.zeros(n_channels))
        pulse_score = np.clip(pulse_count / 20, 0, 1)
        scores += pulse_score * 0.25
        indicators['pulse_activity'] = pulse_score
        
        envelope_peak = features.get('envelope_peak', np.zeros(n_channels))
        envelope_rms = features.get('envelope_rms', np.ones(n_channels))
        peak_ratio = envelope_peak / (envelope_rms * 5 + 1e-10)
        peak_score = np.clip(peak_ratio, 0, 1)
        peak_score = np.where(peak_ratio < 2, 0, peak_score)
        scores += peak_score * 0.2
        indicators['peak_envelope'] = peak_score
        
        return scores, indicators
    
    def detect_frequency_domain_improved(self, features: Dict[str, np.ndarray],
                                          rpm: float, ship_speed: float) -> Tuple[np.ndarray, Dict[str, np.ndarray]]:
        n_channels = features['broadband_ratio'].shape[0]
        scores = np.zeros(n_channels)
        indicators = {}
        
        adaptive_thresh = self.condition_threshold.get_adaptive_threshold(rpm, ship_speed)
        broadband_thresh = adaptive_thresh['broadband_ratio']
        
        broadband_ratio = features['broadband_ratio']
        normalized_broadband = broadband_ratio / (broadband_thresh + 1e-10)
        broadband_score = np.clip(normalized_broadband, 0, 1)
        broadband_score = np.where(broadband_ratio < 0.8, 0, broadband_score)
        scores += broadband_score * 0.25
        indicators['broadband_energy'] = broadband_score
        
        high_band_ratio = features.get('band_10_50kHz_ratio', np.zeros(n_channels))
        high_band_thresh = adaptive_thresh['high_band_ratio']
        high_band_score = np.clip(high_band_ratio / high_band_thresh, 0, 1)
        high_band_score = np.where(high_band_ratio < 0.15, 0, high_band_score)
        scores += high_band_score * 0.2
        indicators['high_band_energy'] = high_band_score
        
        snr = self.compute_snr_score(features)
        scores += snr * 0.2
        indicators['snr'] = snr
        
        line_disappearance = features.get('spectral_line_disappearance', np.zeros(n_channels))
        line_score = np.clip(line_disappearance / 0.3, 0, 1)
        line_score = np.where(line_disappearance < 0.2, 0, line_score)
        scores += line_score * 0.2
        indicators['line_disappearance'] = line_score
        
        bpf_ratio = features.get('bpf_energy_ratio', np.ones(n_channels))
        bpf_score = np.clip((1 - bpf_ratio) / 0.4, 0, 1)
        bpf_score = np.where(bpf_ratio > 0.7, 0, bpf_score)
        scores += bpf_score * 0.15
        indicators['bpf_attenuation'] = bpf_score
        
        return scores, indicators
    
    def detect_bispectrum_improved(self, features: Dict[str, np.ndarray]) -> Tuple[np.ndarray, Dict[str, np.ndarray]]:
        n_channels = features['bispectrum_level'].shape[0]
        scores = np.zeros(n_channels)
        indicators = {}
        
        if self.is_calibrated and self.baseline_features is not None:
            baseline_bsl = self.baseline_features.get('bispectrum_level', np.ones(n_channels))
            bsl_ratio = features['bispectrum_level'] / (baseline_bsl * 2 + 1e-10)
        else:
            bsl_ratio = features['bispectrum_level'] / (np.mean(features['bispectrum_level']) * 3 + 1e-10)
        
        bsl_score = np.clip(bsl_ratio, 0, 1)
        bsl_score = np.where(bsl_ratio < 0.3, 0, bsl_score)
        scores += bsl_score * 0.35
        indicators['bispectrum_level'] = bsl_score
        
        phase_coupling = features.get('phase_coupling_strength', np.zeros(n_channels))
        phase_score = np.clip(phase_coupling / 0.4, 0, 1)
        phase_score = np.where(phase_coupling < 0.2, 0, phase_score)
        scores += phase_score * 0.35
        indicators['phase_coupling'] = phase_score
        
        diagonal_energy = features.get('diagonal_bispectrum_energy', np.zeros(n_channels))
        diagonal_score = np.clip(diagonal_energy / (np.mean(diagonal_energy) * 2 + 1e-10), 0, 1)
        scores += diagonal_score * 0.3
        indicators['diagonal_bispectrum'] = diagonal_score
        
        return scores, indicators
    
    def verify_temporal_consistency(self, current_score: float, is_cavitating: bool) -> Tuple[float, bool]:
        self.history_scores.append(current_score)
        self.history_decisions.append(is_cavitating)
        
        if len(self.history_scores) < 3:
            return current_score, is_cavitating
        
        smoothed_score = np.mean(list(self.history_scores)[-5:])
        
        recent_decisions = list(self.history_decisions)[-3:]
        consensus = sum(recent_decisions) >= 2
        
        if is_cavitating and not consensus:
            smoothed_score *= 0.7
            is_cavitating = smoothed_score > 0.35
        
        return smoothed_score, is_cavitating
    
    def detect(self, features: Dict[str, np.ndarray], rpm: float = 120, 
               ship_speed: float = 15, raw_signal: np.ndarray = None) -> Dict:
        if raw_signal is not None:
            pulse_features = self.pulse_verifier.extract_pulse_features(raw_signal)
            features = {**features, **pulse_features}
        
        time_scores, time_indicators = self.detect_time_domain_improved(features, rpm, ship_speed)
        freq_scores, freq_indicators = self.detect_frequency_domain_improved(features, rpm, ship_speed)
        bsl_scores, bsl_indicators = self.detect_bispectrum_improved(features)
        
        time_weight = 0.3
        freq_weight = 0.4
        bsl_weight = 0.3
        
        combined_scores = (time_scores * time_weight + 
                          freq_scores * freq_weight + 
                          bsl_scores * bsl_weight)
        
        overall_score = float(np.mean(combined_scores))
        
        is_cavitating = overall_score > 0.35
        
        overall_score, is_cavitating = self.verify_temporal_consistency(overall_score, is_cavitating)
        
        if rpm < 40 or ship_speed < 5:
            overall_score *= 0.6
            is_cavitating = overall_score > 0.35
        
        rms = features.get('rms', np.zeros_like(combined_scores))
        noise_level_db = 20 * np.log10(np.mean(rms) / 1e-6 + 1e-10)
        
        self.condition_threshold.update_baseline(features, rpm, ship_speed)
        
        return {
            'is_cavitating': is_cavitating,
            'confidence': overall_score,
            'per_channel_score': combined_scores,
            'time_domain_score': float(np.mean(time_scores)),
            'frequency_domain_score': float(np.mean(freq_scores)),
            'bispectrum_score': float(np.mean(bsl_scores)),
            'time_indicators': {k: float(np.mean(v)) for k, v in time_indicators.items()},
            'frequency_indicators': {k: float(np.mean(v)) for k, v in freq_indicators.items()},
            'bispectrum_indicators': {k: float(np.mean(v)) for k, v in bsl_indicators.items()},
            'noise_level_db': noise_level_db,
            'kurtosis': float(np.mean(features.get('kurtosis', np.zeros(1)))),
            'broadband_ratio': float(np.mean(features.get('broadband_ratio', np.zeros(1)))),
            'adaptive_thresholds': self.condition_threshold.get_adaptive_threshold(rpm, ship_speed),
            'temporal_smoothing_applied': len(self.history_scores) >= 3
        }
