import numpy as np
from scipy import signal
from typing import Tuple, List, Dict, Optional
from dataclasses import dataclass
from enum import Enum


class ArcFaultType(str, Enum):
    NO_ARC = "no_arc"
    STABLE_GROUND = "stable_ground"
    INTERMITTENT_ARC = "intermittent_arc"
    SERIES_ARC = "series_arc"


@dataclass
class ArcDetectionResult:
    arc_type: ArcFaultType
    is_arc_fault: bool
    arc_count: int
    average_arc_duration: float
    average_extinguish_duration: float
    high_frequency_energy: float
    zero_crossing_deviation: float
    confidence: float
    arc_intervals: List[Tuple[int, int]]


class ArcFaultDetector:
    def __init__(self):
        self.sampling_rate = 12800
        self.arc_current_threshold = 0.1
        self.min_arc_duration = 0.001
        self.min_extinguish_duration = 0.001
        self.hf_band = (1000, 5000)
        
    def detect_zero_crossings(self, signal_data: np.ndarray) -> np.ndarray:
        zero_crossings = np.where(np.diff(np.signbit(signal_data)))[0]
        return zero_crossings
    
    def analyze_zero_crossing_deviation(self, signal_data: np.ndarray,
                                         fundamental_freq: float = 50.0) -> float:
        zero_crossings = self.detect_zero_crossings(signal_data)
        
        if len(zero_crossings) < 4:
            return 0.0
        
        intervals = np.diff(zero_crossings) / self.sampling_rate
        expected_interval = 1 / (2 * fundamental_freq)
        
        deviation = np.std(intervals - expected_interval) / expected_interval
        
        return min(deviation, 2.0)
    
    def calculate_high_frequency_energy(self, signal_data: np.ndarray,
                                        sampling_rate: int) -> float:
        self.sampling_rate = sampling_rate
        
        nyquist = 0.5 * sampling_rate
        low = self.hf_band[0] / nyquist
        high = self.hf_band[1] / nyquist
        
        try:
            b, a = signal.butter(4, [low, high], btype='band')
            filtered = signal.filtfilt(b, a, signal_data)
            hf_energy = np.sum(filtered ** 2)
            
            b_low, a_low = signal.butter(4, 100 / nyquist, btype='low')
            filtered_low = signal.filtfilt(b_low, a_low, signal_data)
            lf_energy = np.sum(filtered_low ** 2)
            
            if lf_energy < 1e-10:
                return 0.0
                
            hf_ratio = hf_energy / lf_energy
            return min(hf_ratio, 10.0)
            
        except:
            return 0.0
    
    def detect_current_chop(self, signal_data: np.ndarray,
                            sampling_rate: int,
                            window_size: int = None) -> List[Tuple[int, int]]:
        self.sampling_rate = sampling_rate
        
        if window_size is None:
            window_size = int(sampling_rate / 1000)
        
        amplitude_envelope = np.abs(signal.hilbert(signal_data))
        
        baseline = np.median(amplitude_envelope[:len(amplitude_envelope) // 4])
        threshold = baseline * 0.3
        
        below_threshold = amplitude_envelope < threshold
        
        arc_intervals = []
        in_extinguish = False
        start_idx = 0
        
        for i, below in enumerate(below_threshold):
            if below and not in_extinguish:
                start_idx = i
                in_extinguish = True
            elif not below and in_extinguish:
                duration = (i - start_idx) / sampling_rate
                if duration >= self.min_extinguish_duration:
                    arc_intervals.append((start_idx, i))
                in_extinguish = False
        
        return arc_intervals
    
    def analyze_intermittent_characteristics(self, zero_seq_current: np.ndarray,
                                              sampling_rate: int,
                                              fundamental_freq: float = 50.0) -> Dict:
        self.sampling_rate = sampling_rate
        
        cycle_samples = int(sampling_rate / fundamental_freq)
        num_cycles = len(zero_seq_current) // cycle_samples
        
        cycle_energies = []
        for i in range(num_cycles):
            start = i * cycle_samples
            end = start + cycle_samples
            cycle_energy = np.sum(zero_seq_current[start:end] ** 2)
            cycle_energies.append(cycle_energy)
        
        if len(cycle_energies) < 2:
            return {
                "cycle_variation": 0.0,
                "energy_fluctuation": 0.0,
                "extinguish_count": 0
            }
        
        cycle_variation = np.std(cycle_energies) / (np.mean(cycle_energies) + 1e-10)
        
        energy_diff = np.abs(np.diff(cycle_energies))
        large_changes = np.sum(energy_diff > np.mean(energy_diff) * 2)
        energy_fluctuation = large_changes / len(energy_diff) if len(energy_diff) > 0 else 0
        
        extinguish_intervals = self.detect_current_chop(zero_seq_current, sampling_rate)
        
        return {
            "cycle_variation": min(cycle_variation, 5.0),
            "energy_fluctuation": energy_fluctuation,
            "extinguish_count": len(extinguish_intervals),
            "extinguish_intervals": extinguish_intervals
        }
    
    def detect_arc_fault(self, zero_seq_current: np.ndarray,
                         zero_seq_voltage: np.ndarray,
                         sampling_rate: int = 12800,
                         fundamental_freq: float = 50.0) -> ArcDetectionResult:
        self.sampling_rate = sampling_rate
        
        hf_energy = self.calculate_high_frequency_energy(zero_seq_current, sampling_rate)
        
        zc_deviation = self.analyze_zero_crossing_deviation(zero_seq_current, fundamental_freq)
        
        intermittent_data = self.analyze_intermittent_characteristics(
            zero_seq_current, sampling_rate, fundamental_freq
        )
        
        extinguish_intervals = intermittent_data["extinguish_intervals"]
        arc_count = intermittent_data["extinguish_count"]
        
        avg_arc_duration = 0.0
        avg_extinguish_duration = 0.0
        
        if len(extinguish_intervals) > 0:
            durations = [(end - start) / sampling_rate for start, end in extinguish_intervals]
            avg_extinguish_duration = np.mean(durations)
            
            if len(extinguish_intervals) > 1:
                arc_durations = []
                for i in range(len(extinguish_intervals) - 1):
                    arc_duration = (extinguish_intervals[i+1][0] - extinguish_intervals[i][1]) / sampling_rate
                    if arc_duration > 0:
                        arc_durations.append(arc_duration)
                if arc_durations:
                    avg_arc_duration = np.mean(arc_durations)
        
        scores = {
            "hf_energy": min(hf_energy / 2.0, 1.0) if hf_energy > 0.1 else 0.0,
            "zc_deviation": min(zc_deviation / 0.5, 1.0) if zc_deviation > 0.1 else 0.0,
            "cycle_variation": min(intermittent_data["cycle_variation"] / 1.0, 1.0),
            "extinguish_rate": min(arc_count / 5.0, 1.0) if arc_count > 0 else 0.0,
            "energy_fluctuation": intermittent_data["energy_fluctuation"]
        }
        
        weights = {
            "hf_energy": 0.30,
            "zc_deviation": 0.20,
            "cycle_variation": 0.25,
            "extinguish_rate": 0.15,
            "energy_fluctuation": 0.10
        }
        
        arc_score = sum(scores[key] * weights[key] for key in scores)
        
        v_rms = np.sqrt(np.mean(zero_seq_voltage ** 2))
        is_fault = v_rms > 0.05
        
        arc_threshold = 0.3
        stable_threshold = 0.15
        
        if not is_fault:
            arc_type = ArcFaultType.NO_ARC
            is_arc_fault = False
            confidence = 0.9
        elif arc_score >= arc_threshold:
            arc_type = ArcFaultType.INTERMITTENT_ARC
            is_arc_fault = True
            confidence = min(arc_score + 0.2, 0.95)
        elif arc_score >= stable_threshold:
            arc_type = ArcFaultType.STABLE_GROUND
            is_arc_fault = False
            confidence = 0.7 + (0.3 * (1 - (arc_score - stable_threshold) / (arc_threshold - stable_threshold)))
        else:
            arc_type = ArcFaultType.STABLE_GROUND
            is_arc_fault = False
            confidence = 0.8
        
        return ArcDetectionResult(
            arc_type=arc_type,
            is_arc_fault=is_arc_fault,
            arc_count=arc_count,
            average_arc_duration=round(avg_arc_duration * 1000, 2),
            average_extinguish_duration=round(avg_extinguish_duration * 1000, 2),
            high_frequency_energy=round(hf_energy, 4),
            zero_crossing_deviation=round(zc_deviation, 4),
            confidence=round(confidence, 4),
            arc_intervals=extinguish_intervals
        )


def generate_arc_fault_signal(sampling_rate: int = 12800,
                               duration_cycles: int = 4,
                               fundamental_freq: float = 50.0,
                               arc_frequency: float = 2.0,
                               fault_feeder: bool = True) -> np.ndarray:
    n_samples = int(sampling_rate * duration_cycles / fundamental_freq)
    t = np.arange(n_samples) / sampling_rate
    
    fault_start = int(n_samples * 0.25)
    
    base_current = np.zeros(n_samples)
    
    if fault_feeder:
        base_amp = 5.0
        base_current[fault_start:] = base_amp * np.sin(2 * np.pi * fundamental_freq * t[fault_start:])
        
        arc_period = int(sampling_rate / arc_frequency)
        for i in range(fault_start, n_samples, arc_period):
            arc_end = min(i + int(arc_period * 0.6), n_samples)
            base_current[i:arc_end] *= 0.1 + 0.9 * np.random.rand()
            
            chop_start = i + int(arc_period * 0.3)
            chop_end = min(chop_start + int(sampling_rate / 2000), n_samples)
            base_current[chop_start:chop_end] *= 0.05
        
        noise_amp = 0.3
        base_current[fault_start:] += noise_amp * np.random.randn(len(base_current) - fault_start)
        
        hf_noise = np.zeros_like(base_current)
        hf_noise[fault_start:] = 0.5 * np.sin(2 * np.pi * 2500 * t[fault_start:])
        hf_noise[fault_start:] *= np.random.randint(0, 2, size=len(hf_noise) - fault_start) * 2 - 1
        base_current += hf_noise
    else:
        base_amp = 0.5
        base_current[fault_start:] = base_amp * np.sin(2 * np.pi * fundamental_freq * t[fault_start:] - np.pi/2)
    
    return base_current
