import numpy as np
from typing import List, Dict, Tuple
from models import NeutralGroundingType
from signal_utils import (
    extract_harmonic, compute_phase_difference, detect_fault_onset,
    first_half_wave_polarity, multi_window_polarity, wavelet_transform,
    find_wavelet_modulus_maxima, bandpass_filter, lowpass_filter
)


class SteadyStateMethod:
    def __init__(self):
        self.name = "steady_state"
        self.threshold_ratio = 0.3
        self.phase_tolerance = 30.0

    def analyze(self, feeders_data: List, zero_seq_voltage: np.ndarray,
                sampling_rate: int, fundamental_freq: float = 50.0) -> Tuple[List[int], Dict[int, float]]:
        confidence_scores = {}
        base_magnitudes = []
        
        for feeder in feeders_data:
            zero_current = np.array(feeder.zero_sequence)
            mag, phase = extract_harmonic(zero_current, sampling_rate, 1, fundamental_freq)
            base_magnitudes.append((feeder.feeder_id, mag, phase))
        
        if not base_magnitudes:
            return [], {}
            
        max_mag = max(m for _, m, _ in base_magnitudes)
        
        if max_mag < 1e-6:
            return [], {fid: 0.0 for fid, _, _ in base_magnitudes}
        
        v_mag, v_phase = extract_harmonic(zero_seq_voltage, sampling_rate, 1, fundamental_freq)
        
        for feeder_id, curr_mag, curr_phase in base_magnitudes:
            mag_ratio = curr_mag / max_mag if max_mag > 0 else 0
            phase_diff = abs((curr_phase - v_phase) % 360)
            if phase_diff > 180:
                phase_diff = 360 - phase_diff
            
            amplitude_score = min(mag_ratio, 1.0)
            phase_score = max(0, 1 - phase_diff / 90.0)
            
            confidence = 0.6 * amplitude_score + 0.4 * phase_score
            confidence_scores[feeder_id] = confidence
        
        sorted_feeders = sorted(confidence_scores.items(), key=lambda x: x[1], reverse=True)
        candidates = [fid for fid, score in sorted_feeders if score >= self.threshold_ratio]
        
        return candidates, confidence_scores


class TransientMethod:
    def __init__(self):
        self.name = "transient"
        self.wavelet = 'db4'
        self.wavelet_level = 5
        self.transient_band = (100, 1000)
        self.polarity_weight = 0.35
        self.energy_weight = 0.65

    def analyze(self, feeders_data: List, zero_seq_voltage: np.ndarray,
                sampling_rate: int, fundamental_freq: float = 50.0) -> Tuple[List[int], Dict[int, float]]:
        confidence_scores = {}
        
        fault_onset = detect_fault_onset(zero_seq_voltage)
        
        polarity_data = {}
        polarity_confidences = {}
        
        for feeder in feeders_data:
            zero_current = np.array(feeder.zero_sequence)
            
            polarity1, reliability1 = first_half_wave_polarity(zero_current, fault_onset, sampling_rate, fundamental_freq)
            
            polarity2, reliability2 = multi_window_polarity(zero_current, fault_onset, sampling_rate, fundamental_freq)
            
            combined_polarity = polarity1 if reliability1 > reliability2 else polarity2
            combined_reliability = max(reliability1, reliability2)
            
            polarity_data[feeder.feeder_id] = combined_polarity
            polarity_confidences[feeder.feeder_id] = combined_reliability
        
        wavelet_scores = {}
        for feeder in feeders_data:
            zero_current = np.array(feeder.zero_sequence)
            coeffs = wavelet_transform(zero_current, self.wavelet, self.wavelet_level)
            maxima = find_wavelet_modulus_maxima(coeffs)
            
            total_energy = 0
            for level_data in maxima:
                total_energy += np.sum(level_data['peak_values'] ** 2)
            
            wavelet_scores[feeder.feeder_id] = total_energy
        
        if wavelet_scores:
            max_energy = max(wavelet_scores.values()) if max(wavelet_scores.values()) > 0 else 1
            for fid in wavelet_scores:
                wavelet_scores[fid] = wavelet_scores[fid] / max_energy
        
        polarities = list(polarity_data.values())
        confidences = list(polarity_confidences.values())
        
        if polarities and sum(c > 0.3 for c in confidences):
            weighted_pos = sum(p * c for p, c in zip(polarities, confidences) if c > 0.3)
            weighted_sum = sum(c for c in confidences if c > 0.3)
            
            if weighted_sum > 0:
                majority_polarity = 1 if weighted_pos > 0 else -1
            else:
                majority_polarity = 1
        else:
            majority_polarity = 1
        
        for feeder in feeders_data:
            fid = feeder.feeder_id
            polarity = polarity_data[fid]
            pol_conf = polarity_confidences[fid]
            
            if polarity == majority_polarity:
                polarity_score = 0.2 + 0.8 * (1 - pol_conf)
            else:
                polarity_score = 0.2 + 0.8 * pol_conf
            
            energy_score = wavelet_scores.get(fid, 0)
            
            confidence = self.polarity_weight * polarity_score + self.energy_weight * energy_score
            confidence_scores[fid] = confidence
        
        sorted_feeders = sorted(confidence_scores.items(), key=lambda x: x[1], reverse=True)
        candidates = [fid for fid, score in sorted_feeders if score >= 0.25]
        
        return candidates, confidence_scores


class FifthHarmonicMethod:
    def __init__(self):
        self.name = "fifth_harmonic"
        self.threshold_ratio = 0.2
        self.compensation_degree = 0.1
        self.harmonic_orders = [3, 5, 7]
        self.harmonic_weights = {3: 0.2, 5: 0.6, 7: 0.2}

    def analyze(self, feeders_data: List, zero_seq_voltage: np.ndarray,
                sampling_rate: int, fundamental_freq: float = 50.0) -> Tuple[List[int], Dict[int, float]]:
        confidence_scores = {}
        harmonic_data = {}
        
        v_harmonics = {}
        for h in self.harmonic_orders:
            v_mag, v_phase = extract_harmonic(zero_seq_voltage, sampling_rate, h, fundamental_freq)
            v_harmonics[h] = (v_mag, v_phase)
        
        for feeder in feeders_data:
            zero_current = np.array(feeder.zero_sequence)
            feeder_harmonics = {}
            
            for h in self.harmonic_orders:
                mag, phase = extract_harmonic(zero_current, sampling_rate, h, fundamental_freq)
                feeder_harmonics[h] = (mag, phase)
            
            harmonic_data[feeder.feeder_id] = feeder_harmonics
        
        if not harmonic_data:
            return [], {}
        
        harmonic_scores = {h: {} for h in self.harmonic_orders}
        
        for h in self.harmonic_orders:
            mags = [harmonic_data[fid][h][0] for fid in harmonic_data]
            max_mag = max(mags) if mags else 0
            
            if max_mag < 1e-6:
                for fid in harmonic_data:
                    harmonic_scores[h][fid] = 0.0
                continue
            
            v_mag, v_phase = v_harmonics[h]
            
            for fid in harmonic_data:
                mag, phase = harmonic_data[fid][h]
                mag_ratio = mag / max_mag if max_mag > 0 else 0
                
                phase_diff = abs((phase - v_phase) % (2 * np.pi))
                if phase_diff > np.pi:
                    phase_diff = 2 * np.pi - phase_diff
                
                amplitude_score = min(mag_ratio * (1 + self.compensation_degree), 1.0)
                phase_score = max(0, 1 - phase_diff / np.pi * 1.5)
                
                if h == 5:
                    combined = 0.7 * amplitude_score + 0.3 * phase_score
                else:
                    combined = 0.8 * amplitude_score + 0.2 * phase_score
                
                harmonic_scores[h][fid] = combined
        
        for fid in harmonic_data:
            total_score = 0.0
            total_weight = 0.0
            
            for h in self.harmonic_orders:
                weight = self.harmonic_weights[h]
                v_mag = v_harmonics[h][0]
                
                if v_mag > 1e-6:
                    adjusted_weight = weight * (1 + min(2.0, v_mag * 10))
                    total_score += harmonic_scores[h][fid] * adjusted_weight
                    total_weight += adjusted_weight
                else:
                    total_score += harmonic_scores[h][fid] * weight * 0.3
                    total_weight += weight * 0.3
            
            if total_weight > 0:
                confidence_scores[fid] = total_score / total_weight
            else:
                confidence_scores[fid] = 0.0
        
        sorted_feeders = sorted(confidence_scores.items(), key=lambda x: x[1], reverse=True)
        candidates = [fid for fid, score in sorted_feeders if score >= self.threshold_ratio]
        
        return candidates, confidence_scores


class InjectionSignalMethod:
    def __init__(self):
        self.name = "injection"
        self.injection_freq = 220.0
        self.bandwidth = 20.0

    def analyze(self, feeders_data: List, zero_seq_voltage: np.ndarray,
                sampling_rate: int, fundamental_freq: float = 50.0) -> Tuple[List[int], Dict[int, float]]:
        confidence_scores = {}
        signal_strengths = {}
        
        low_freq = self.injection_freq - self.bandwidth
        high_freq = self.injection_freq + self.bandwidth
        
        for feeder in feeders_data:
            zero_current = np.array(feeder.zero_sequence)
            filtered = bandpass_filter(zero_current, sampling_rate, low_freq, high_freq)
            signal_energy = np.sum(filtered ** 2)
            signal_strengths[feeder.feeder_id] = signal_energy
        
        if not signal_strengths:
            return [], {}
        
        max_energy = max(signal_strengths.values()) if max(signal_strengths.values()) > 0 else 1
        
        for fid, energy in signal_strengths.items():
            normalized_energy = energy / max_energy if max_energy > 0 else 0
            confidence_scores[fid] = normalized_energy
        
        sorted_feeders = sorted(confidence_scores.items(), key=lambda x: x[1], reverse=True)
        candidates = [fid for fid, score in sorted_feeders if score >= 0.2]
        
        return candidates, confidence_scores


def get_algorithm_weights(grounding_type: NeutralGroundingType) -> Dict[str, float]:
    if grounding_type == NeutralGroundingType.UNGROUNDED:
        return {
            "steady_state": 0.35,
            "transient": 0.25,
            "fifth_harmonic": 0.20,
            "injection": 0.20
        }
    elif grounding_type == NeutralGroundingType.ARC_SUPPRESSION_COIL:
        return {
            "steady_state": 0.15,
            "transient": 0.40,
            "fifth_harmonic": 0.25,
            "injection": 0.20
        }
    elif grounding_type == NeutralGroundingType.LOW_RESISTANCE:
        return {
            "steady_state": 0.40,
            "transient": 0.20,
            "fifth_harmonic": 0.15,
            "injection": 0.25
        }
    else:
        return {
            "steady_state": 0.25,
            "transient": 0.30,
            "fifth_harmonic": 0.25,
            "injection": 0.20
        }
