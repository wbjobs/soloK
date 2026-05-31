"""
信号预处理模块 - 船速/转速归一化、滤波、几何参数配置
"""
import numpy as np
from scipy import signal
from scipy.signal import butter, filtfilt, hilbert
from typing import Tuple, Optional
from config import SystemConfig, DEFAULT_CONFIG

class SignalNormalizer:
    def __init__(self, config: SystemConfig = DEFAULT_CONFIG):
        self.config = config
        self.norm_config = config.normalization
    
    def normalize_by_ship_speed(self, signal: np.ndarray, ship_speed: float) -> np.ndarray:
        if not self.norm_config.enable_ship_speed_norm:
            return signal
        
        reference_speed = self.norm_config.reference_speed
        if reference_speed <= 0 or ship_speed <= 0:
            return signal
        
        speed_ratio = ship_speed / reference_speed
        normalization_factor = speed_ratio ** self.norm_config.speed_exponent
        
        return signal / np.sqrt(normalization_factor)
    
    def normalize_by_rpm(self, signal: np.ndarray, rpm: float) -> np.ndarray:
        if not self.norm_config.enable_rpm_norm:
            return signal
        
        reference_rpm = self.norm_config.reference_rpm
        if reference_rpm <= 0 or rpm <= 0:
            return signal
        
        rpm_ratio = rpm / reference_rpm
        normalization_factor = rpm_ratio ** self.norm_config.rpm_exponent
        
        return signal / np.sqrt(normalization_factor)
    
    def normalize(self, signal: np.ndarray, ship_speed: float, rpm: float) -> np.ndarray:
        normalized = signal.copy()
        normalized = self.normalize_by_ship_speed(normalized, ship_speed)
        normalized = self.normalize_by_rpm(normalized, rpm)
        return normalized
    
    def compute_normalization_factor(self, ship_speed: float, rpm: float) -> float:
        factor = 1.0
        
        if self.norm_config.enable_ship_speed_norm and self.norm_config.reference_speed > 0:
            speed_ratio = ship_speed / self.norm_config.reference_speed
            factor *= speed_ratio ** self.norm_config.speed_exponent
        
        if self.norm_config.enable_rpm_norm and self.norm_config.reference_rpm > 0:
            rpm_ratio = rpm / self.norm_config.reference_rpm
            factor *= rpm_ratio ** self.norm_config.rpm_exponent
        
        return factor

class DigitalFilter:
    def __init__(self, sample_rate: int = 200000):
        self.sample_rate = sample_rate
        self.nyquist = sample_rate / 2
    
    def bandpass_filter(self, signal: np.ndarray, low_freq: float, 
                        high_freq: float, order: int = 4) -> np.ndarray:
        low = low_freq / self.nyquist
        high = high_freq / self.nyquist
        
        if high >= 1.0:
            high = 0.99
        
        b, a = butter(order, [low, high], btype='band')
        return filtfilt(b, a, signal, axis=-1)
    
    def highpass_filter(self, signal: np.ndarray, cutoff_freq: float, 
                        order: int = 4) -> np.ndarray:
        cutoff = cutoff_freq / self.nyquist
        b, a = butter(order, cutoff, btype='high')
        return filtfilt(b, a, signal, axis=-1)
    
    def lowpass_filter(self, signal: np.ndarray, cutoff_freq: float, 
                       order: int = 4) -> np.ndarray:
        cutoff = cutoff_freq / self.nyquist
        b, a = butter(order, cutoff, btype='low')
        return filtfilt(b, a, signal, axis=-1)
    
    def notch_filter(self, input_signal: np.ndarray, freq: float, 
                     quality: float = 30) -> np.ndarray:
        b, a = signal.iirnotch(freq, quality, self.sample_rate)
        return filtfilt(b, a, input_signal, axis=-1)

class SignalPreprocessor:
    def __init__(self, config: SystemConfig = DEFAULT_CONFIG):
        self.config = config
        self.sample_rate = config.hydrophone.sample_rate
        self.normalizer = SignalNormalizer(config)
        self.filter = DigitalFilter(self.sample_rate)
        self.adc_max = 2 ** (config.hydrophone.adc_bits - 1) - 1
    
    def adc_to_voltage(self, adc_data: np.ndarray) -> np.ndarray:
        voltage_range = self.config.hydrophone.voltage_range
        return adc_data.astype(np.float64) * voltage_range / self.adc_max
    
    def voltage_to_pressure(self, voltage: np.ndarray) -> np.ndarray:
        sensitivity_db = self.config.hydrophone.sensitivity
        sensitivity = 10 ** (sensitivity_db / 20)
        return voltage / sensitivity
    
    def remove_dc_offset(self, signal: np.ndarray) -> np.ndarray:
        return signal - np.mean(signal, axis=-1, keepdims=True)
    
    def remove_line_noise(self, signal: np.ndarray) -> np.ndarray:
        filtered = signal.copy()
        for freq in [50, 60, 100, 120]:
            if freq < self.sample_rate / 2:
                filtered = self.filter.notch_filter(filtered, freq)
        return filtered
    
    def preprocess(self, raw_signal: np.ndarray, conditions: dict) -> Tuple[np.ndarray, dict]:
        if raw_signal.ndim == 1:
            raw_signal = raw_signal[np.newaxis, :]
        
        voltage = self.adc_to_voltage(raw_signal)
        pressure = self.voltage_to_pressure(voltage)
        pressure = self.remove_dc_offset(pressure)
        
        ship_speed = conditions.get('ship_speed', self.config.conditions.ship_speed)
        rpm = conditions.get('shaft_speed', self.config.conditions.shaft_speed)
        
        normalized_pressure = self.normalizer.normalize(pressure, ship_speed, rpm)
        
        filtered = self.remove_line_noise(normalized_pressure)
        
        filtered = self.filter.bandpass_filter(filtered, 1000, 100000)
        
        norm_factor = self.normalizer.compute_normalization_factor(ship_speed, rpm)
        
        metadata = {
            'original_rms': np.sqrt(np.mean(pressure ** 2, axis=-1)),
            'normalized_rms': np.sqrt(np.mean(filtered ** 2, axis=-1)),
            'normalization_factor': norm_factor,
            'ship_speed': ship_speed,
            'rpm': rpm
        }
        
        return filtered, metadata

class BladePassFilter:
    def __init__(self, num_blades: int = 5, sample_rate: int = 200000):
        self.num_blades = num_blades
        self.sample_rate = sample_rate
    
    def get_blade_pass_frequencies(self, rpm: float, num_harmonics: int = 10) -> np.ndarray:
        shaft_freq = rpm / 60.0
        blade_freq = shaft_freq * self.num_blades
        harmonics = np.arange(1, num_harmonics + 1) * blade_freq
        return harmonics
    
    def extract_blade_pass_components(self, signal: np.ndarray, rpm: float, 
                                       bandwidth: float = 50) -> Tuple[np.ndarray, np.ndarray]:
        n_samples = signal.shape[-1]
        freqs = np.fft.rfftfreq(n_samples, 1 / self.sample_rate)
        spectrum = np.fft.rfft(signal, axis=-1)
        
        blade_harmonics = self.get_blade_pass_frequencies(rpm)
        amplitudes = []
        phases = []
        
        for harmonic_freq in blade_harmonics:
            idx = np.argmin(np.abs(freqs - harmonic_freq))
            window = np.where(np.abs(freqs - harmonic_freq) <= bandwidth)[0]
            
            if len(window) > 0:
                peak_idx = window[np.argmax(np.abs(spectrum[..., window]), axis=-1)]
                amplitude = np.abs(spectrum[..., peak_idx])
                phase = np.angle(spectrum[..., peak_idx])
            else:
                amplitude = np.zeros(spectrum.shape[:-1])
                phase = np.zeros(spectrum.shape[:-1])
            
            amplitudes.append(amplitude)
            phases.append(phase)
        
        return np.array(amplitudes), np.array(phases)
    
    def remove_blade_pass_components(self, signal: np.ndarray, rpm: float, 
                                      bandwidth: float = 50) -> np.ndarray:
        n_samples = signal.shape[-1]
        freqs = np.fft.rfftfreq(n_samples, 1 / self.sample_rate)
        spectrum = np.fft.rfft(signal, axis=-1)
        
        blade_harmonics = self.get_blade_pass_frequencies(rpm)
        
        mask = np.ones_like(freqs, dtype=bool)
        for harmonic_freq in blade_harmonics:
            mask &= np.abs(freqs - harmonic_freq) > bandwidth
        
        spectrum_filtered = spectrum * mask[np.newaxis, :]
        return np.fft.irfft(spectrum_filtered, n=n_samples, axis=-1)

class GeometryCorrection:
    def __init__(self, config: SystemConfig = DEFAULT_CONFIG):
        self.config = config
        self.propeller = config.propeller
    
    def compute_tip_speed(self, rpm: float) -> float:
        radius = self.propeller.diameter / 2
        angular_velocity = rpm * np.pi / 30
        return radius * angular_velocity
    
    def compute_advance_ratio(self, ship_speed: float, rpm: float) -> float:
        tip_speed = self.compute_tip_speed(rpm)
        if tip_speed == 0:
            return 0
        return ship_speed / tip_speed
    
    def compute_geometric_correction_factor(self, rpm: float, ship_speed: float) -> float:
        J = self.compute_advance_ratio(ship_speed, rpm)
        skew_factor = 1 / np.cos(np.radians(self.propeller.skew_angle))
        rake_factor = 1 / np.cos(np.radians(self.propeller.rake_angle))
        area_factor = self.propeller.blade_area_ratio / 0.55
        
        base_factor = skew_factor * rake_factor * area_factor
        advance_correction = 1 + 0.5 * np.exp(-(J - 0.7) ** 2 / 0.2)
        
        return base_factor * advance_correction
    
    def correct_for_geometry(self, signal: np.ndarray, rpm: float, ship_speed: float) -> np.ndarray:
        correction_factor = self.compute_geometric_correction_factor(rpm, ship_speed)
        return signal / correction_factor
