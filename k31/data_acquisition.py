"""
数据采集模块 - 水听器阵列信号模拟与工况数据接口
"""
import numpy as np
from collections import deque
from typing import Optional, Tuple
from config import SystemConfig, DEFAULT_CONFIG

class HydrophoneSimulator:
    def __init__(self, config: SystemConfig = DEFAULT_CONFIG):
        self.config = config
        self.sample_rate = config.hydrophone.sample_rate
        self.num_hydrophones = config.hydrophone.num_hydrophones
        self.time = 0.0
        
        self._cavitation_state = 0
        self._cavitation_intensity = 0.0
        self._transition_timer = 0.0
        self._next_transition = np.random.uniform(10, 30)
    
    def set_cavitation_state(self, state: int, intensity: float = 0.5):
        self._cavitation_state = state
        self._cavitation_intensity = intensity
    
    def _generate_background_noise(self, n_samples: int) -> np.ndarray:
        noise = np.random.randn(self.num_hydrophones, n_samples)
        noise *= 0.3
        return noise
    
    def _generate_shaft_signal(self, n_samples: int, rpm: float) -> np.ndarray:
        fs = self.sample_rate
        t = np.arange(n_samples) / fs + self.time
        
        shaft_freq = rpm / 60.0
        blade_freq = shaft_freq * self.config.propeller.num_blades
        
        signal = np.zeros((self.num_hydrophones, n_samples))
        
        for i in range(self.num_hydrophones):
            phase_shift = i * 0.1
            s = np.zeros(n_samples)
            for harmonic in range(1, 8):
                amplitude = 1.0 / (harmonic ** 1.5)
                s += amplitude * np.sin(2 * np.pi * harmonic * blade_freq * t + phase_shift * harmonic)
            signal[i] = s * 0.5
        
        return signal
    
    def _generate_cavitation_noise(self, n_samples: int, cavitation_type: int, 
                                    intensity: float, rpm: float) -> np.ndarray:
        fs = self.sample_rate
        t = np.arange(n_samples) / fs + self.time
        
        signal = np.zeros((self.num_hydrophones, n_samples))
        blade_freq = (rpm / 60.0) * self.config.propeller.num_blades
        
        for i in range(self.num_hydrophones):
            s = np.zeros(n_samples)
            
            if cavitation_type == 1:
                n_impulses = int(intensity * n_samples * blade_freq / fs * 2)
                impulse_times = np.random.choice(n_samples, n_impulses, replace=False)
                for idx in impulse_times:
                    start = max(0, idx - 20)
                    end = min(n_samples, idx + 20)
                    impulse = np.sin(2 * np.pi * 30000 * (t[start:end] - t[idx])) * np.exp(-(t[start:end] - t[idx])**2 * 1e8)
                    s[start:end] += impulse * intensity * 2
                s += intensity * np.random.randn(n_samples) * np.sqrt(2) * np.exp(-((np.fft.rfftfreq(n_samples, 1/fs) - 25000)**2) / (15000**2))[:, np.newaxis].T.sum(axis=0) / 10
            
            elif cavitation_type == 2:
                envelope = (1 + np.sin(2 * np.pi * blade_freq * t)) * 0.5
                s = intensity * envelope * np.random.randn(n_samples) * 2
                for harmonic in range(2, 5):
                    s += intensity * 0.3 * np.sin(2 * np.pi * harmonic * blade_freq * t + np.random.uniform(0, 2*np.pi))
            
            elif cavitation_type == 3:
                s = intensity * np.random.randn(n_samples) * 1.5
                spec = np.fft.rfft(s)
                freqs = np.fft.rfftfreq(n_samples, 1/fs)
                spec *= 1 + 2 * np.exp(-((freqs - 40000)**2) / (20000**2))
                s = np.fft.irfft(spec)
            
            elif cavitation_type == 4:
                n_impulses = int(intensity * n_samples * 3)
                impulse_times = np.random.choice(n_samples, n_impulses, replace=False)
                for idx in impulse_times:
                    start = max(0, idx - 50)
                    end = min(n_samples, idx + 50)
                    freq = np.random.uniform(5000, 15000)
                    impulse = np.sin(2 * np.pi * freq * (t[start:end] - t[idx])) * np.exp(-(t[start:end] - t[idx])**2 * 1e7)
                    s[start:end] += impulse * intensity * 1.5
            
            signal[i] = s
        
        return signal
    
    def get_samples(self, n_samples: int, rpm: float = 120.0, 
                    ship_speed: float = 15.0) -> Tuple[np.ndarray, dict]:
        fs = self.sample_rate
        
        background = self._generate_background_noise(n_samples)
        shaft_signal = self._generate_shaft_signal(n_samples, rpm)
        
        if self._cavitation_state > 0:
            cavitation_noise = self._generate_cavitation_noise(
                n_samples, self._cavitation_state, self._cavitation_intensity, rpm
            )
        else:
            cavitation_noise = np.zeros((self.num_hydrophones, n_samples))
        
        speed_factor = (ship_speed / 15.0) ** 0.5
        rpm_factor = (rpm / 120.0) ** 0.5
        total_noise_scale = 0.3 * speed_factor * rpm_factor
        
        raw_signal = background + shaft_signal * 0.4 + cavitation_noise * 0.6
        raw_signal *= total_noise_scale
        
        adc_max = 2 ** (self.config.hydrophone.adc_bits - 1) - 1
        quantized = np.clip(raw_signal, -1, 1) * adc_max
        quantized = quantized.astype(np.int32)
        
        self.time += n_samples / fs
        
        self._transition_timer += n_samples / fs
        if self._transition_timer >= self._next_transition:
            self._transition_timer = 0.0
            self._next_transition = np.random.uniform(5, 15)
            if np.random.random() < 0.3:
                self._cavitation_state = np.random.choice([0, 1, 2, 3, 4])
                self._cavitation_intensity = np.random.uniform(0.3, 0.9) if self._cavitation_state > 0 else 0.0
        
        conditions = {
            'timestamp': self.time,
            'shaft_speed': rpm,
            'ship_speed': ship_speed,
            'shaft_power': 8000 * (rpm / 120) ** 3 * (ship_speed / 15) ** 0.5,
            'cavitation_state': self._cavitation_state,
            'cavitation_intensity': self._cavitation_intensity
        }
        
        return quantized, conditions

class OperatingConditionsSource:
    def __init__(self, config: SystemConfig = DEFAULT_CONFIG):
        self.config = config
        self.time = 0.0
    
    def get_conditions(self, timestamp: float) -> dict:
        base_rpm = self.config.conditions.shaft_speed
        base_speed = self.config.conditions.ship_speed
        base_power = self.config.conditions.shaft_power
        
        rpm_variation = np.sin(timestamp * 0.1) * 5 + np.random.normal(0, 2)
        speed_variation = np.sin(timestamp * 0.05) * 1 + np.random.normal(0, 0.5)
        
        rpm = base_rpm + rpm_variation
        ship_speed = base_speed + speed_variation
        shaft_power = base_power * (rpm / base_rpm) ** 3 * (ship_speed / base_speed) ** 0.8
        
        return {
            'timestamp': timestamp,
            'shaft_speed': rpm,
            'ship_speed': ship_speed,
            'shaft_power': shaft_power,
            'water_temperature': self.config.conditions.water_temperature + np.random.normal(0, 0.5),
            'water_depth': self.config.conditions.water_depth
        }

class DataBuffer:
    def __init__(self, config: SystemConfig = DEFAULT_CONFIG):
        self.config = config
        self.sample_rate = config.hydrophone.sample_rate
        self.buffer_size = int(config.buffer_duration * self.sample_rate)
        self.data_buffer = deque(maxlen=self.buffer_size)
        self.condition_buffer = deque(maxlen=int(config.buffer_duration * 100))
    
    def add_data(self, signals: np.ndarray, conditions: dict):
        self.data_buffer.append((conditions['timestamp'], signals))
        self.condition_buffer.append(conditions)
    
    def get_data_window(self, start_time: float, end_time: float) -> Tuple[np.ndarray, list]:
        signals = []
        conditions = []
        
        for t, sig in self.data_buffer:
            if start_time <= t <= end_time:
                signals.append(sig)
                conditions.append([c for c in self.condition_buffer if abs(c['timestamp'] - t) < 0.01])
        
        if signals:
            return np.concatenate(signals, axis=1), conditions
        return np.array([]), []
    
    def get_latest_samples(self, n_samples: int) -> Tuple[np.ndarray, dict]:
        if len(self.data_buffer) == 0:
            return np.array([]), {}
        
        total_samples = 0
        collected = []
        
        for t, sig in reversed(self.data_buffer):
            collected.append((t, sig))
            total_samples += sig.shape[1]
            if total_samples >= n_samples:
                break
        
        collected.reverse()
        if collected:
            signals = np.concatenate([sig for _, sig in collected], axis=1)
            if signals.shape[1] > n_samples:
                signals = signals[:, -n_samples:]
            latest_conditions = self.condition_buffer[-1] if self.condition_buffer else {}
            return signals, latest_conditions
        
        return np.array([]), {}
