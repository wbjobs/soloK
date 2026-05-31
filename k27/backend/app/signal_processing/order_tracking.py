
import numpy as np
from scipy.signal import resample, butter, filtfilt, find_peaks, savgol_filter
from scipy.interpolate import interp1d, splrep, splev
from scipy.ndimage import median_filter
from typing import Tuple, Dict, List, Optional
import warnings
warnings.filterwarnings('ignore')


class RobustPulseExtractor:
    def __init__(self, sample_rate: int = 20000):
        self.sample_rate = sample_rate
        
    def adaptive_threshold(self, signal: np.ndarray, 
                          window_size: int = 1000) -> float:
        half_window = window_size // 2
        padded = np.pad(signal, half_window, mode='reflect')
        local_mean = np.convolve(padded, np.ones(window_size)/window_size, mode='same')
        local_var = np.convolve((padded - local_mean)**2, 
                                np.ones(window_size)/window_size, mode='same')
        local_std = np.sqrt(np.maximum(local_var, 1e-10))
        
        valid_start = half_window
        valid_end = len(local_mean) - half_window
        local_mean_valid = local_mean[valid_start:valid_end]
        local_std_valid = local_std[valid_start:valid_end]
        
        threshold = np.median(local_mean_valid + 3 * local_std_valid)
        return threshold
    
    def detect_pulses(self, signal: np.ndarray, 
                     min_distance: Optional[int] = None,
                     expected_pulse_interval: Optional[float] = None) -> Tuple[np.ndarray, Dict]:
        if min_distance is None:
            min_distance = self.sample_rate // 100
        
        signal_normalized = (signal - np.mean(signal)) / (np.std(signal) + 1e-8)
        
        threshold_factor = 0.5
        threshold = threshold_factor * np.max(np.abs(signal_normalized))
        
        peaks, properties = find_peaks(signal_normalized, 
                                      height=threshold,
                                      distance=min_distance,
                                      prominence=0.1)
        
        if len(peaks) < 2:
            for threshold_factor in [0.3, 0.2, 0.1]:
                threshold = threshold_factor * np.max(np.abs(signal_normalized))
                peaks, properties = find_peaks(signal_normalized, 
                                              height=threshold,
                                              distance=min_distance)
                if len(peaks) >= 2:
                    break
        
        if len(peaks) > 3:
            intervals = np.diff(peaks)
            median_interval = np.median(intervals)
            
            mad = np.median(np.abs(intervals - median_interval))
            outlier_threshold = max(3 * mad, median_interval * 0.3)
            
            valid_mask = np.abs(intervals - median_interval) < outlier_threshold
            
            valid_peaks = [peaks[0]]
            for i in range(len(peaks) - 1):
                if valid_mask[i]:
                    valid_peaks.append(peaks[i + 1])
            
            peaks = np.array(valid_peaks)
        
        stats = {
            'num_pulses': len(peaks),
            'mean_interval': float(np.mean(np.diff(peaks))) if len(peaks) > 1 else 0,
            'std_interval': float(np.std(np.diff(peaks))) if len(peaks) > 1 else 0,
            'threshold_used': float(threshold)
        }
        
        return peaks, stats
    
    def detect_missing_pulses(self, peaks: np.ndarray, 
                             expected_interval: float,
                             tolerance: float = 0.3) -> List[int]:
        if len(peaks) < 2:
            return []
        
        intervals = np.diff(peaks)
        missing_indices = []
        
        for i in range(len(intervals)):
            ratio = intervals[i] / expected_interval
            if ratio > 1 + tolerance:
                num_missing = int(np.round(ratio)) - 1
                missing_indices.extend([i] * num_missing)
        
        return missing_indices
    
    def interpolate_missing_pulses(self, peaks: np.ndarray, 
                                   missing_indices: List[int],
                                   method: str = 'cubic') -> np.ndarray:
        if not missing_indices:
            return peaks
        
        peak_times = peaks / self.sample_rate
        indices = np.arange(len(peaks))
        
        if method == 'linear':
            f = interp1d(indices, peak_times, kind='linear', fill_value='extrapolate')
        elif method == 'cubic':
            if len(peaks) >= 4:
                tck = splrep(indices, peak_times, s=0, k=3)
                f = lambda x: splev(x, tck)
            else:
                f = interp1d(indices, peak_times, kind='linear', fill_value='extrapolate')
        else:
            f = interp1d(indices, peak_times, kind='slinear', fill_value='extrapolate')
        
        new_peak_times = []
        peak_idx = 0
        
        for i in range(len(peaks)):
            new_peak_times.append(peak_times[i])
            
            while peak_idx < len(missing_indices) and missing_indices[peak_idx] == i:
                interp_pos = i + 0.5
                interp_time = float(f(interp_pos))
                new_peak_times.append(interp_time)
                peak_idx += 1
        
        new_peaks = np.array(new_peak_times) * self.sample_rate
        return np.sort(new_peaks).astype(int)


class PhaseSynchronizer:
    def __init__(self, sample_rate: int = 20000):
        self.sample_rate = sample_rate
        
    def compute_phase_from_pulses(self, peaks: np.ndarray, 
                                  signal_length: int) -> np.ndarray:
        if len(peaks) < 2:
            return np.linspace(0, 2 * np.pi, signal_length)
        
        peak_phases = np.arange(len(peaks)) * 2 * np.pi
        
        full_indices = np.arange(signal_length)
        
        if len(peaks) >= 4:
            tck = splrep(peaks, peak_phases, s=0, k=3)
            full_phase = splev(full_indices, tck, ext=3)
        else:
            f = interp1d(peaks, peak_phases, kind='linear', 
                        fill_value='extrapolate', bounds_error=False)
            full_phase = f(full_indices)
        
        full_phase = np.unwrap(full_phase)
        
        return full_phase
    
    def phase_lock_loop(self, peaks: np.ndarray, signal_length: int,
                       alpha: float = 0.1, beta: float = 0.01) -> np.ndarray:
        if len(peaks) < 2:
            return self.compute_phase_from_pulses(peaks, signal_length)
        
        estimated_freq = len(peaks) / (peaks[-1] / self.sample_rate)
        phase = 0.0
        frequency = estimated_freq
        
        full_phase = np.zeros(signal_length)
        phase_error = np.zeros(signal_length)
        
        peak_set = set(peaks)
        
        for i in range(signal_length):
            full_phase[i] = phase
            
            if i in peak_set:
                ideal_phase = np.round(phase / (2 * np.pi)) * 2 * np.pi
                error = ideal_phase - phase
                
                frequency += beta * error
                phase += alpha * error
            
            phase += 2 * np.pi * frequency / self.sample_rate
        
        return full_phase
    
    def unwrap_and_calibrate_phase(self, phase: np.ndarray, 
                                   reference_peaks: np.ndarray) -> np.ndarray:
        if len(reference_peaks) < 2:
            return phase
        
        expected_phases = np.arange(len(reference_peaks)) * 2 * np.pi
        actual_phases = phase[reference_peaks]
        
        if len(reference_peaks) >= 4:
            tck = splrep(actual_phases, expected_phases - actual_phases, s=0, k=3)
            correction = splev(phase, tck, ext=3)
        else:
            f = interp1d(actual_phases, expected_phases - actual_phases, 
                        kind='linear', fill_value='extrapolate', bounds_error=False)
            correction = f(phase)
        
        corrected_phase = phase + correction
        return corrected_phase


class EnhancedOrderTracking:
    def __init__(self, sample_rate: int = 20000):
        self.sample_rate = sample_rate
        self.pulse_extractor = RobustPulseExtractor(sample_rate)
        self.phase_synchronizer = PhaseSynchronizer(sample_rate)
        
    def extract_speed_profile(self, tacho_signal: np.ndarray, 
                              pulses_per_rev: int = 1,
                              use_pll: bool = True) -> Tuple[np.ndarray, np.ndarray, Dict]:
        peaks, pulse_stats = self.pulse_extractor.detect_pulses(tacho_signal)
        
        quality_metrics = {
            'pulse_stats': pulse_stats,
            'is_valid': True,
            'missing_pulses': 0,
            'correction_applied': False
        }
        
        if len(peaks) >= 2:
            expected_interval = np.median(np.diff(peaks))
            missing_indices = self.pulse_extractor.detect_missing_pulses(
                peaks, expected_interval)
            
            if missing_indices:
                peaks = self.pulse_extractor.interpolate_missing_pulses(
                    peaks, missing_indices, method='cubic')
                quality_metrics['missing_pulses'] = len(missing_indices)
                quality_metrics['correction_applied'] = True
        
        if len(peaks) < 2:
            time = np.arange(len(tacho_signal)) / self.sample_rate
            default_speed = 1800 / 60
            quality_metrics['is_valid'] = False
            quality_metrics['warning'] = 'Insufficient pulses detected'
            return time, np.ones_like(time) * default_speed * 60, quality_metrics
        
        peak_times = peaks / self.sample_rate
        instantaneous_freq = 1 / np.diff(peak_times)
        instantaneous_speed = instantaneous_freq * 60 / pulses_per_rev
        
        if len(instantaneous_speed) > 5:
            instantaneous_speed = savgol_filter(instantaneous_speed, 
                                               window_length=5, polyorder=2)
        
        speed_times = peak_times[:-1] + np.diff(peak_times) / 2
        
        if len(speed_times) >= 4:
            tck = splrep(speed_times, instantaneous_speed, s=0, k=3)
            full_time = np.arange(len(tacho_signal)) / self.sample_rate
            full_speed = splev(full_time, tck, ext=3)
        else:
            f = interp1d(speed_times, instantaneous_speed, kind='linear', 
                        fill_value='extrapolate', bounds_error=False)
            full_time = np.arange(len(tacho_signal)) / self.sample_rate
            full_speed = f(full_time)
        
        full_speed = median_filter(full_speed, size=5)
        
        return full_time, full_speed, quality_metrics
    
    def compute_angular_position(self, speed_profile: np.ndarray, 
                                 time: np.ndarray,
                                 tacho_signal: Optional[np.ndarray] = None) -> Tuple[np.ndarray, Dict]:
        phase_metrics = {
            'method': 'integration',
            'pll_locked': False
        }
        
        if tacho_signal is not None:
            peaks, _ = self.pulse_extractor.detect_pulses(tacho_signal)
            if len(peaks) >= 4:
                phase = self.phase_synchronizer.phase_lock_loop(
                    peaks, len(speed_profile))
                phase_metrics['method'] = 'pll'
                phase_metrics['pll_locked'] = True
                phase_metrics['num_reference_peaks'] = len(peaks)
                return phase, phase_metrics
        
        dt = np.diff(time)
        dt = np.insert(dt, 0, dt[0] if len(dt) > 0 else 1 / self.sample_rate)
        angular_velocity = speed_profile * 2 * np.pi / 60
        angular_position = np.cumsum(angular_velocity * dt)
        
        phase_metrics['method'] = 'integration'
        return angular_position, phase_metrics
    
    def sinc_interpolation(self, signal: np.ndarray, 
                          old_positions: np.ndarray,
                          new_positions: np.ndarray,
                          kernel_size: int = 8) -> np.ndarray:
        result = np.zeros_like(new_positions)
        
        for i, new_pos in enumerate(new_positions):
            idx = np.searchsorted(old_positions, new_pos)
            start = max(0, idx - kernel_size)
            end = min(len(old_positions), idx + kernel_size)
            
            if start >= end:
                if idx < len(old_positions):
                    result[i] = signal[idx]
                continue
            
            x = (new_pos - old_positions[start:end]) * self.sample_rate
            sinc_kernel = np.sinc(x)
            sinc_kernel /= np.sum(sinc_kernel) + 1e-10
            
            result[i] = np.sum(signal[start:end] * sinc_kernel)
        
        return result
    
    def resample_to_angle_domain(self, signal: np.ndarray, 
                                 angular_position: np.ndarray,
                                 orders_per_rev: int = 256,
                                 method: str = 'sinc') -> Tuple[np.ndarray, np.ndarray, Dict]:
        resample_metrics = {
            'method': method,
            'total_rotations': angular_position[-1] / (2 * np.pi),
            'phase_unwrapped': True
        }
        
        if angular_position[-1] < 2 * np.pi:
            resample_metrics['warning'] = 'Less than one rotation sampled'
        
        total_orders = angular_position[-1] / (2 * np.pi)
        num_samples = max(int(total_orders * orders_per_rev), orders_per_rev)
        
        uniform_angle = np.linspace(angular_position[0], angular_position[-1], num_samples)
        
        if method == 'sinc' and self.sample_rate > 1000:
            resampled_signal = self.sinc_interpolation(
                signal, angular_position, uniform_angle, kernel_size=16)
        elif method == 'cubic' and len(angular_position) >= 4:
            tck = splrep(angular_position, signal, s=0, k=3)
            resampled_signal = splev(uniform_angle, tck, ext=3)
        else:
            f = interp1d(angular_position, signal, kind='linear', 
                        fill_value='extrapolate', bounds_error=False)
            resampled_signal = f(uniform_angle)
        
        order_axis = np.fft.fftfreq(num_samples, d=1.0 / orders_per_rev)[:num_samples // 2]
        order_axis = np.abs(order_axis)
        
        resample_metrics['num_samples'] = num_samples
        resample_metrics['orders_per_rev'] = orders_per_rev
        
        return resampled_signal, order_axis, resample_metrics
    
    def compute_order_spectrum(self, angle_signal: np.ndarray, 
                               orders_per_rev: int,
                               window: str = 'hann') -> Tuple[np.ndarray, np.ndarray]:
        n = len(angle_signal)
        
        if window == 'hann':
            window_func = np.hanning(n)
        elif window == 'hamming':
            window_func = np.hamming(n)
        elif window == 'blackman':
            window_func = np.blackman(n)
        else:
            window_func = np.ones(n)
        
        windowed_signal = angle_signal * window_func
        window_correction = 1 / np.mean(window_func)
        
        yf = np.fft.fft(windowed_signal)
        orders = np.fft.fftfreq(n, d=1.0 / orders_per_rev)[:n // 2]
        orders = np.abs(orders)
        amplitude = 2.0 / n * np.abs(yf[0:n // 2]) * window_correction
        
        return orders, amplitude
    
    def track_orders(self, signal: np.ndarray, tacho_signal: np.ndarray,
                     pulses_per_rev: int = 1,
                     target_orders: List[float] = None,
                     orders_per_rev: int = 256) -> Dict:
        if target_orders is None:
            target_orders = [0.5, 1.0, 2.0, 3.0, 5.43, 3.57, 2.38, 0.38]
        
        time, speed_profile, speed_quality = self.extract_speed_profile(
            tacho_signal, pulses_per_rev)
        
        if len(speed_profile) < len(signal):
            signal = signal[:len(speed_profile)]
        elif len(speed_profile) > len(signal):
            speed_profile = speed_profile[:len(signal)]
            time = time[:len(signal)]
        
        angular_position, phase_metrics = self.compute_angular_position(
            speed_profile, time, tacho_signal)
        
        angle_signal, order_axis, resample_metrics = self.resample_to_angle_domain(
            signal, angular_position, orders_per_rev, method='sinc')
        
        orders, order_spectrum = self.compute_order_spectrum(
            angle_signal, orders_per_rev, window='hann')
        
        order_amplitudes = {}
        for target_order in target_orders:
            mask = np.abs(orders - target_order) < 0.05
            if np.any(mask):
                order_amplitudes[f"order_{target_order}"] = float(np.max(order_spectrum[mask]))
            else:
                order_amplitudes[f"order_{target_order}"] = 0.0
        
        return {
            "time": time,
            "speed_profile": speed_profile,
            "speed_quality": speed_quality,
            "angular_position": angular_position,
            "phase_metrics": phase_metrics,
            "resampled_signal": angle_signal,
            "resample_metrics": resample_metrics,
            "orders": orders,
            "order_spectrum": order_spectrum,
            "order_amplitudes": order_amplitudes,
            "mean_speed": float(np.mean(speed_profile)),
            "speed_variation": float(np.std(speed_profile))
        }
    
    def extract_features(self, signal: np.ndarray, 
                         tacho_signal: np.ndarray) -> Dict[str, float]:
        result = self.track_orders(signal, tacho_signal)
        
        spectrum = result["order_spectrum"]
        
        features = {
            "order_1x_amp": result["order_amplitudes"].get("order_1.0", 0),
            "order_2x_amp": result["order_amplitudes"].get("order_2.0", 0),
            "order_3x_amp": result["order_amplitudes"].get("order_3.0", 0),
            "order_half_amp": result["order_amplitudes"].get("order_0.5", 0),
            "BPFI_order_amp": result["order_amplitudes"].get("order_5.43", 0),
            "BPFO_order_amp": result["order_amplitudes"].get("order_3.57", 0),
            "BSF_order_amp": result["order_amplitudes"].get("order_2.38", 0),
            "FTF_order_amp": result["order_amplitudes"].get("order_0.38", 0),
            "mean_speed": result["mean_speed"],
            "speed_variation": result["speed_variation"],
            "speed_quality_valid": 1.0 if result["speed_quality"]["is_valid"] else 0.0,
            "missing_pulses_count": result["speed_quality"]["missing_pulses"]
        }
        
        features["unbalance_index"] = features["order_1x_amp"]
        features["misalignment_index"] = features["order_2x_amp"]
        
        return features


OrderTracking = EnhancedOrderTracking
