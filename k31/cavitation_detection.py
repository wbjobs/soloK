"""
空化检测模块 - 基于多特征融合的检测算法
"""
import numpy as np
from typing import Dict, Tuple, List
from config import SystemConfig, DEFAULT_CONFIG, DetectionThresholds

class CavitationDetector:
    def __init__(self, config: SystemConfig = DEFAULT_CONFIG):
        self.config = config
        self.thresholds = config.thresholds
        self.baseline_features = None
        self.baseline_samples = 0
        self.is_calibrated = False
    
    def calibrate(self, features: Dict[str, np.ndarray]):
        if self.baseline_features is None:
            self.baseline_features = {k: v.copy() for k, v in features.items()}
            self.baseline_samples = 1
        else:
            for k in features:
                self.baseline_features[k] = (self.baseline_features[k] * self.baseline_samples + features[k]) / (self.baseline_samples + 1)
            self.baseline_samples += 1
        self.is_calibrated = True
    
    def reset_calibration(self):
        self.baseline_features = None
        self.baseline_samples = 0
        self.is_calibrated = False
    
    def detect_time_domain(self, features: Dict[str, np.ndarray]) -> Tuple[np.ndarray, Dict[str, np.ndarray]]:
        n_channels = features['kurtosis'].shape[0]
        scores = np.zeros(n_channels)
        indicators = {}
        
        kurtosis_score = np.clip((features['kurtosis'] - 3) / (self.thresholds.kurtosis - 3), 0, 1)
        scores += kurtosis_score * 0.3
        indicators['kurtosis'] = kurtosis_score
        
        skewness_score = np.clip(np.abs(features['skewness']) / self.thresholds.skewness, 0, 1)
        scores += skewness_score * 0.2
        indicators['skewness'] = skewness_score
        
        crest_score = np.clip(features['crest_factor'] / self.thresholds.crest_factor, 0, 1)
        scores += crest_score * 0.15
        indicators['crest_factor'] = crest_score
        
        impulse_score = np.clip(features['impulse_factor'] / 10, 0, 1)
        scores += impulse_score * 0.1
        indicators['impulse_factor'] = impulse_score
        
        margin_score = np.clip(features['margin_factor'] / 20, 0, 1)
        scores += margin_score * 0.05
        indicators['margin_factor'] = margin_score
        
        peak_score = np.clip(features['envelope_peak'] / (features['envelope_rms'] * 3 + 1e-10), 0, 1)
        scores += peak_score * 0.2
        indicators['peak_envelope'] = peak_score
        
        return scores, indicators
    
    def detect_frequency_domain(self, features: Dict[str, np.ndarray]) -> Tuple[np.ndarray, Dict[str, np.ndarray]]:
        n_channels = features['broadband_ratio'].shape[0]
        scores = np.zeros(n_channels)
        indicators = {}
        
        broadband_score = np.clip(features['broadband_ratio'] / self.thresholds.broadband_energy_ratio, 0, 1)
        scores += broadband_score * 0.35
        indicators['broadband_energy'] = broadband_score
        
        high_band_ratio = features.get('band_10_50kHz_ratio', np.zeros(n_channels))
        high_band_score = np.clip(high_band_ratio / 0.4, 0, 1)
        scores += high_band_score * 0.2
        indicators['high_band_energy'] = high_band_score
        
        line_disappearance_score = np.clip(features['spectral_line_disappearance'] / 0.5, 0, 1)
        scores += line_disappearance_score * 0.25
        indicators['line_disappearance'] = line_disappearance_score
        
        bpf_ratio = features.get('bpf_energy_ratio', np.ones(n_channels))
        bpf_score = np.clip((1 - bpf_ratio) / 0.5, 0, 1)
        scores += bpf_score * 0.2
        indicators['bpf_attenuation'] = bpf_score
        
        return scores, indicators
    
    def detect_bispectrum(self, features: Dict[str, np.ndarray]) -> Tuple[np.ndarray, Dict[str, np.ndarray]]:
        n_channels = features['bispectrum_level'].shape[0]
        scores = np.zeros(n_channels)
        indicators = {}
        
        if self.is_calibrated and self.baseline_features is not None:
            baseline_bsl = self.baseline_features.get('bispectrum_level', np.ones(n_channels))
            bsl_ratio = features['bispectrum_level'] / (baseline_bsl + 1e-10)
        else:
            bsl_ratio = features['bispectrum_level'] / (np.mean(features['bispectrum_level']) + 1e-10)
        
        bsl_score = np.clip(bsl_ratio / 5, 0, 1)
        scores += bsl_score * 0.4
        indicators['bispectrum_level'] = bsl_score
        
        phase_coupling_score = np.clip(features['phase_coupling_strength'] / 0.5, 0, 1)
        scores += phase_coupling_score * 0.35
        indicators['phase_coupling'] = phase_coupling_score
        
        peak_count = features.get('bispectrum_peak_count', np.zeros(n_channels))
        peak_score = np.clip(peak_count / 50, 0, 1)
        scores += peak_score * 0.25
        indicators['bispectrum_peaks'] = peak_score
        
        return scores, indicators
    
    def detect(self, features: Dict[str, np.ndarray]) -> Dict:
        time_scores, time_indicators = self.detect_time_domain(features)
        freq_scores, freq_indicators = self.detect_frequency_domain(features)
        bsl_scores, bsl_indicators = self.detect_bispectrum(features)
        
        time_weight = 0.3
        freq_weight = 0.4
        bsl_weight = 0.3
        
        combined_scores = (time_scores * time_weight + 
                          freq_scores * freq_weight + 
                          bsl_scores * bsl_weight)
        
        overall_score = np.mean(combined_scores)
        
        is_cavitating = overall_score > 0.3
        
        rms = features.get('rms', np.zeros_like(combined_scores))
        noise_level_db = 20 * np.log10(np.mean(rms) / 1e-6 + 1e-10)
        
        return {
            'is_cavitating': is_cavitating,
            'confidence': overall_score,
            'per_channel_score': combined_scores,
            'time_domain_score': np.mean(time_scores),
            'frequency_domain_score': np.mean(freq_scores),
            'bispectrum_score': np.mean(bsl_scores),
            'time_indicators': {k: np.mean(v) for k, v in time_indicators.items()},
            'frequency_indicators': {k: np.mean(v) for k, v in freq_indicators.items()},
            'bispectrum_indicators': {k: np.mean(v) for k, v in bsl_indicators.items()},
            'noise_level_db': noise_level_db,
            'kurtosis': np.mean(features.get('kurtosis', np.zeros(1))),
            'broadband_ratio': np.mean(features.get('broadband_ratio', np.zeros(1)))
        }

class AdaptiveThreshold:
    def __init__(self, alpha: float = 0.01, initial_threshold: float = 0.3):
        self.alpha = alpha
        self.threshold = initial_threshold
        self.mean_score = 0.0
        self.std_score = 1.0
        self.samples = 0
    
    def update(self, score: float):
        self.samples += 1
        self.mean_score = self.mean_score * (1 - self.alpha) + score * self.alpha
        self.std_score = self.std_score * (1 - self.alpha) + np.abs(score - self.mean_score) * self.alpha
        self.threshold = self.mean_score + 3 * self.std_score
        self.threshold = max(0.2, min(0.8, self.threshold))
    
    def is_anomaly(self, score: float) -> bool:
        return score > self.threshold

class MultiChannelFusion:
    def __init__(self, num_channels: int = 8):
        self.num_channels = num_channels
        self.channel_weights = np.ones(num_channels) / num_channels
        self.reliability = np.ones(num_channels)
    
    def update_reliability(self, signal_quality: np.ndarray):
        self.reliability = signal_quality / (np.sum(signal_quality) + 1e-10)
        self.channel_weights = self.reliability / (np.sum(self.reliability) + 1e-10)
    
    def fuse_scores(self, channel_scores: np.ndarray) -> float:
        if len(channel_scores) != self.num_channels:
            return np.mean(channel_scores)
        return np.sum(channel_scores * self.channel_weights)
    
    def get_consensus(self, channel_decisions: np.ndarray) -> bool:
        weighted_votes = np.sum(channel_decisions.astype(float) * self.channel_weights)
        return weighted_votes > 0.5
