import numpy as np
from scipy import signal
from typing import Tuple, Optional, Dict, List
from dataclasses import dataclass


@dataclass
class TravelingWaveResult:
    fault_distance: float
    method: str
    arrival_times: List[float]
    confidence: float
    wave_velocity: float
    reflection_count: int


class TravelingWaveLocator:
    def __init__(self):
        self.wave_velocity = 2.98e5
        self.sampling_rate = 12800
        self.detection_threshold = 3.0
        self.wavelet_name = 'db4'
        
    def detect_wave_arrival(self, signal_data: np.ndarray, 
                           threshold: Optional[float] = None) -> List[int]:
        if threshold is None:
            threshold = self.detection_threshold
        
        normalized = (signal_data - np.mean(signal_data)) / (np.std(signal_data) + 1e-10)
        
        derivative = np.gradient(normalized)
        
        energy = np.abs(signal.hilbert(derivative))
        
        pre_fault_energy = energy[:len(energy) // 4]
        baseline = np.mean(pre_fault_energy)
        std_dev = np.std(pre_fault_energy)
        
        if std_dev < 1e-10:
            std_dev = 1e-10
        
        adaptive_threshold = baseline + threshold * std_dev
        
        peaks, properties = signal.find_peaks(
            energy, 
            height=adaptive_threshold,
            distance=int(self.sampling_rate / 5000)
        )
        
        if len(peaks) == 0:
            peaks, properties = signal.find_peaks(
                energy,
                height=np.max(energy) * 0.2,
                distance=int(self.sampling_rate / 5000)
            )
        
        if len(peaks) >= 2:
            return sorted(peaks)[:4]
        elif len(peaks) == 1:
            return [peaks[0], peaks[0] + int(self.sampling_rate / 1000)]
        else:
            max_idx = np.argmax(energy)
            return [max_idx, max_idx + int(self.sampling_rate / 1000)]
    
    def detect_wavelet_modulus_max(self, signal_data: np.ndarray, 
                                    level: int = 6) -> List[int]:
        import pywt
        
        coeffs = pywt.wavedec(signal_data, self.wavelet_name, level=level)
        
        detail_coeffs = coeffs[1:]
        
        arrival_candidates = []
        for i, detail in enumerate(detail_coeffs, 1):
            abs_detail = np.abs(detail)
            
            upsample_factor = 2 ** (level - i)
            peaks, _ = signal.find_peaks(
                abs_detail, 
                height=np.std(abs_detail) * 2,
                distance=5
            )
            
            for peak in peaks:
                original_peak = peak * upsample_factor
                arrival_candidates.append(original_peak)
        
        if not arrival_candidates:
            return []
        
        arrival_candidates = sorted(arrival_candidates)
        
        clustered = []
        current_cluster = [arrival_candidates[0]]
        
        for candidate in arrival_candidates[1:]:
            if candidate - current_cluster[-1] < int(self.sampling_rate / 5000):
                current_cluster.append(candidate)
            else:
                clustered.append(int(np.mean(current_cluster)))
                current_cluster = [candidate]
        
        if current_cluster:
            clustered.append(int(np.mean(current_cluster)))
        
        return clustered
    
    def single_end_locate(self, zero_seq_current: np.ndarray,
                          zero_seq_voltage: np.ndarray,
                          line_length: float = 10.0,
                          sampling_rate: int = 12800) -> TravelingWaveResult:
        self.sampling_rate = sampling_rate
        
        arrival_times_samples = self.detect_wave_arrival(zero_seq_current)
        
        if len(arrival_times_samples) < 2:
            wavelet_arrivals = self.detect_wavelet_modulus_max(zero_seq_current)
            if len(wavelet_arrivals) >= 2:
                arrival_times_samples = wavelet_arrivals
        
        if len(arrival_times_samples) < 2:
            voltage_arrivals = self.detect_wave_arrival(zero_seq_voltage)
            if len(voltage_arrivals) >= 1 and len(arrival_times_samples) >= 1:
                arrival_times_samples = list(set(arrival_times_samples + voltage_arrivals))
                arrival_times_samples = sorted(arrival_times_samples)
        
        if len(arrival_times_samples) < 2:
            return TravelingWaveResult(
                fault_distance=-1.0,
                method="single_end",
                arrival_times=[],
                confidence=0.0,
                wave_velocity=self.wave_velocity,
                reflection_count=0
            )
        
        t1 = arrival_times_samples[0]
        t2 = arrival_times_samples[1]
        
        time_diff_samples = t2 - t1
        time_diff_seconds = time_diff_samples / sampling_rate
        
        fault_distance = (self.wave_velocity * time_diff_seconds) / 2
        
        fault_distance = min(fault_distance, line_length)
        fault_distance = max(fault_distance, 0)
        
        confidence = self._calculate_confidence(
            arrival_times_samples, 
            zero_seq_current,
            sampling_rate
        )
        
        arrival_times_ms = [t / sampling_rate * 1000 for t in arrival_times_samples]
        
        return TravelingWaveResult(
            fault_distance=round(fault_distance, 3),
            method="single_end",
            arrival_times=arrival_times_ms,
            confidence=round(confidence, 4),
            wave_velocity=self.wave_velocity,
            reflection_count=len(arrival_times_samples) - 1
        )
    
    def double_end_locate(self, local_current: np.ndarray,
                          remote_current: np.ndarray,
                          line_length: float,
                          local_sampling_rate: int,
                          remote_sampling_rate: int = None,
                          time_sync_offset: float = 0.0) -> TravelingWaveResult:
        if remote_sampling_rate is None:
            remote_sampling_rate = local_sampling_rate
            
        self.sampling_rate = local_sampling_rate
        
        local_arrivals = self.detect_wave_arrival(local_current)
        remote_arrivals = self.detect_wave_arrival(remote_current)
        
        if not local_arrivals or not remote_arrivals:
            local_arrivals = self.detect_wavelet_modulus_max(local_current)
            remote_arrivals = self.detect_wavelet_modulus_max(remote_current)
        
        if not local_arrivals or not remote_arrivals:
            return TravelingWaveResult(
                fault_distance=-1.0,
                method="double_end",
                arrival_times=[],
                confidence=0.0,
                wave_velocity=self.wave_velocity,
                reflection_count=0
            )
        
        t_local = local_arrivals[0] / local_sampling_rate + time_sync_offset
        t_remote = remote_arrivals[0] / remote_sampling_rate
        
        time_diff = t_local - t_remote
        
        total_travel_time = line_length / self.wave_velocity
        
        fault_distance = (total_travel_time + time_diff) * self.wave_velocity / 2
        
        fault_distance = min(max(fault_distance, 0), line_length)
        
        confidence = self._calculate_confidence(
            local_arrivals + remote_arrivals,
            np.concatenate([local_current, remote_current]),
            local_sampling_rate
        )
        
        arrival_times_ms = [
            t_local * 1000,
            t_remote * 1000
        ]
        
        return TravelingWaveResult(
            fault_distance=round(fault_distance, 3),
            method="double_end",
            arrival_times=arrival_times_ms,
            confidence=round(confidence, 4),
            wave_velocity=self.wave_velocity,
            reflection_count=0
        )
    
    def _calculate_confidence(self, arrival_times: List[int],
                              signal_data: np.ndarray,
                              sampling_rate: int) -> float:
        if len(arrival_times) < 2:
            return 0.3
        
        peak_amplitudes = []
        for arrival in arrival_times:
            if arrival < len(signal_data):
                window_start = max(0, arrival - 5)
                window_end = min(len(signal_data), arrival + 5)
                peak_amp = np.max(np.abs(signal_data[window_start:window_end]))
                peak_amplitudes.append(peak_amp)
        
        if not peak_amplitudes:
            return 0.5
        
        amplitude_ratio = peak_amplitudes[0] / (peak_amplitudes[1] + 1e-10)
        
        if 1.5 < amplitude_ratio < 10:
            amplitude_confidence = 0.8
        elif 1.0 < amplitude_ratio <= 1.5 or 10 <= amplitude_ratio < 20:
            amplitude_confidence = 0.6
        else:
            amplitude_confidence = 0.4
        
        time_diff = arrival_times[1] - arrival_times[0]
        expected_diff_min = int(sampling_rate / 10000)
        expected_diff_max = int(sampling_rate / 1000)
        
        if expected_diff_min < time_diff < expected_diff_max:
            time_confidence = 0.9
        else:
            time_confidence = 0.5
        
        arrival_count_confidence = min(len(arrival_times) / 4, 1.0) * 0.3 + 0.7
        
        confidence = 0.4 * amplitude_confidence + 0.3 * time_confidence + 0.3 * arrival_count_confidence
        
        return confidence


def generate_gis_coordinates(fault_distance: float,
                             start_lat: float = 39.9042,
                             start_lon: float = 116.4074,
                             line_azimuth: float = 45.0) -> Tuple[float, float]:
    if fault_distance < 0:
        return start_lat, start_lon
    
    km_per_degree_lat = 111.0
    km_per_degree_lon = 111.0 * np.cos(np.radians(start_lat))
    
    azimuth_rad = np.radians(line_azimuth)
    
    delta_lat = fault_distance / km_per_degree_lat * np.cos(azimuth_rad)
    delta_lon = fault_distance / km_per_degree_lon * np.sin(azimuth_rad)
    
    end_lat = start_lat + delta_lat
    end_lon = start_lon + delta_lon
    
    return round(end_lat, 6), round(end_lon, 6)
