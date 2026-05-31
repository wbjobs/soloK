"""
空化强度评估模块 - 空化数计算与噪声级增量
"""
import numpy as np
from typing import Dict, Tuple
from config import SystemConfig, DEFAULT_CONFIG

class CavitationNumberCalculator:
    def __init__(self, config: SystemConfig = DEFAULT_CONFIG):
        self.config = config
        self.propeller = config.propeller
        self.conditions = config.conditions
        self.g = 9.81
        self.rho = config.conditions.water_density
        self.p_atm = 101325
        self.p_vapor = 2339
    
    def compute_static_pressure(self, depth: float) -> float:
        return self.p_atm + self.rho * self.g * depth
    
    def compute_dynamic_pressure(self, ship_speed: float) -> float:
        return 0.5 * self.rho * ship_speed ** 2
    
    def compute_cavitation_number(self, ship_speed: float, depth: float = None, 
                                  rpm: float = None) -> float:
        if depth is None:
            depth = self.conditions.water_depth
        
        p_static = self.compute_static_pressure(depth)
        
        if rpm is not None:
            tip_speed = self.compute_tip_speed(rpm)
            advance_speed = ship_speed * 0.7
            reference_speed = np.sqrt(tip_speed ** 2 + advance_speed ** 2)
        else:
            reference_speed = ship_speed
        
        p_dynamic = 0.5 * self.rho * reference_speed ** 2
        
        sigma = (p_static - self.p_vapor) / p_dynamic
        
        return sigma
    
    def compute_tip_speed(self, rpm: float) -> float:
        radius = self.propeller.diameter / 2
        angular_velocity = rpm * np.pi / 30
        return radius * angular_velocity
    
    def compute_advance_ratio(self, ship_speed: float, rpm: float) -> float:
        tip_speed = self.compute_tip_speed(rpm)
        if tip_speed == 0:
            return 0
        return ship_speed / tip_speed
    
    def compute_critical_cavitation_number(self, rpm: float = None, 
                                           ship_speed: float = None,
                                           thrust_coefficient: float = 0.2) -> float:
        if rpm is not None and ship_speed is not None:
            J = self.compute_advance_ratio(ship_speed, rpm)
        else:
            J = 0.7
        
        skew_factor = np.cos(np.radians(self.propeller.skew_angle))
        area_factor = self.propeller.blade_area_ratio
        
        sigma_c = 0.5 * thrust_coefficient * (1 / area_factor) * (1 + 0.5 * J) * skew_factor
        
        return sigma_c
    
    def compute_cavitation_margin(self, sigma: float, sigma_c: float) -> float:
        return sigma - sigma_c
    
    def compute_sigma_ratio(self, sigma: float, sigma_c: float) -> float:
        if sigma_c <= 0:
            return float('inf')
        return sigma / sigma_c

class NoiseLevelAnalyzer:
    def __init__(self, config: SystemConfig = DEFAULT_CONFIG):
        self.config = config
        self.reference_pressure = 1e-6
        self.baseline_noise_level = None
        self.is_calibrated = False
    
    def calibrate(self, signal: np.ndarray):
        rms = np.sqrt(np.mean(signal ** 2, axis=-1))
        self.baseline_noise_level = np.mean(rms)
        self.is_calibrated = True
    
    def compute_sound_pressure_level(self, signal: np.ndarray) -> np.ndarray:
        rms = np.sqrt(np.mean(signal ** 2, axis=-1))
        spl = 20 * np.log10(rms / self.reference_pressure + 1e-10)
        return spl
    
    def compute_band_spl(self, signal: np.ndarray, low_freq: float, 
                         high_freq: float) -> np.ndarray:
        from scipy.signal import butter, filtfilt
        
        nyquist = self.config.hydrophone.sample_rate / 2
        low = low_freq / nyquist
        high = high_freq / nyquist
        
        if high >= 1.0:
            high = 0.99
        
        b, a = butter(4, [low, high], btype='band')
        filtered = filtfilt(b, a, signal, axis=-1)
        
        return self.compute_sound_pressure_level(filtered)
    
    def compute_noise_increment(self, signal: np.ndarray) -> np.ndarray:
        current_spl = self.compute_sound_pressure_level(signal)
        
        if self.baseline_noise_level is not None:
            baseline_spl = 20 * np.log10(self.baseline_noise_level / self.reference_pressure + 1e-10)
            increment = current_spl - baseline_spl
        else:
            increment = np.zeros_like(current_spl)
        
        return increment
    
    def compute_third_octave_bands(self, signal: np.ndarray) -> Dict[str, float]:
        center_freqs = [
            1000, 1250, 1600, 2000, 2500, 3150, 4000, 5000,
            6300, 8000, 10000, 12500, 16000, 20000, 25000,
            31500, 40000, 50000, 63000, 80000, 100000
        ]
        
        band_levels = {}
        for fc in center_freqs:
            low = fc / np.sqrt(2)
            high = fc * np.sqrt(2)
            if high < self.config.hydrophone.sample_rate / 2:
                spl = self.compute_band_spl(signal, low, high)
                band_levels[f'{fc/1000:.1f}kHz'] = float(np.mean(spl))
        
        return band_levels

class CavitationSeverityAssessor:
    def __init__(self, config: SystemConfig = DEFAULT_CONFIG):
        self.config = config
        self.sigma_calculator = CavitationNumberCalculator(config)
        self.noise_analyzer = NoiseLevelAnalyzer(config)
        self.history = []
    
    def assess(self, signal: np.ndarray, conditions: dict, 
               detection_result: dict, classification_result: dict) -> Dict:
        ship_speed = conditions.get('ship_speed', self.config.conditions.ship_speed)
        rpm = conditions.get('shaft_speed', self.config.conditions.shaft_speed)
        depth = conditions.get('water_depth', self.config.conditions.water_depth)
        
        sigma = self.sigma_calculator.compute_cavitation_number(ship_speed, depth, rpm)
        sigma_c = self.sigma_calculator.compute_critical_cavitation_number(rpm, ship_speed)
        sigma_ratio = self.sigma_calculator.compute_sigma_ratio(sigma, sigma_c)
        cavitation_margin = self.sigma_calculator.compute_cavitation_margin(sigma, sigma_c)
        
        noise_level_db = detection_result.get('noise_level_db', 0)
        noise_increment = self.noise_analyzer.compute_noise_increment(signal)
        avg_noise_increment = float(np.mean(noise_increment))
        
        broadband_energy = detection_result.get('broadband_ratio', 0)
        kurtosis_value = detection_result.get('kurtosis', 0)
        
        detection_confidence = detection_result.get('confidence', 0)
        classification_confidence = classification_result.get('confidence', 0)
        class_idx = classification_result.get('class_index', 0)
        
        severity_score = self._compute_severity_score(
            sigma_ratio, avg_noise_increment, broadband_energy, 
            kurtosis_value, detection_confidence, class_idx
        )
        
        severity_level = self._get_severity_level(severity_score)
        
        band_levels = self.noise_analyzer.compute_third_octave_bands(signal)
        
        assessment = {
            'cavitation_number': sigma,
            'critical_cavitation_number': sigma_c,
            'sigma_ratio': sigma_ratio,
            'cavitation_margin': cavitation_margin,
            'noise_level_db': noise_level_db,
            'noise_increment_db': avg_noise_increment,
            'broadband_energy_ratio': broadband_energy,
            'kurtosis': kurtosis_value,
            'severity_score': severity_score,
            'severity_level': severity_level,
            'third_octave_bands': band_levels,
            'recommendation': self._get_recommendation(severity_level, sigma_ratio, class_idx)
        }
        
        self.history.append({
            'timestamp': conditions.get('timestamp', 0),
            **assessment
        })
        
        return assessment
    
    def _compute_severity_score(self, sigma_ratio: float, noise_increment: float,
                                broadband_energy: float, kurtosis: float,
                                confidence: float, class_idx: int) -> float:
        score = 0.0
        
        if sigma_ratio > 1.5:
            score += 0.0
        elif sigma_ratio > 1.2:
            score += 0.1
        elif sigma_ratio > 1.0:
            score += 0.25
        elif sigma_ratio > 0.8:
            score += 0.45
        else:
            score += 0.7
        
        if noise_increment < 3:
            score += 0.0
        elif noise_increment < 6:
            score += 0.1
        elif noise_increment < 10:
            score += 0.25
        else:
            score += 0.4
        
        if broadband_energy < 1:
            score += 0.0
        elif broadband_energy < 2:
            score += 0.1
        elif broadband_energy < 4:
            score += 0.2
        else:
            score += 0.35
        
        if kurtosis < 3:
            score += 0.0
        elif kurtosis < 5:
            score += 0.05
        elif kurtosis < 8:
            score += 0.15
        else:
            score += 0.25
        
        if class_idx == 0:
            score *= 0.5
        elif class_idx == 1:
            score *= 0.8
        elif class_idx == 4:
            score *= 1.2
        
        score *= confidence
        
        return min(1.0, score)
    
    def _get_severity_level(self, score: float) -> str:
        if score < 0.1:
            return '无空化'
        elif score < 0.3:
            return '轻微'
        elif score < 0.5:
            return '中等'
        elif score < 0.75:
            return '严重'
        else:
            return '极严重'
    
    def _get_recommendation(self, severity: str, sigma_ratio: float, class_idx: int) -> str:
        if severity == '无空化':
            return '螺旋桨运行正常，继续监测'
        elif severity == '轻微':
            return '检测到轻微空化迹象，建议密切关注运行参数变化'
        elif severity == '中等':
            return '检测到中等程度空化，建议适当降低航速或调整工况'
        elif severity == '严重':
            return '空化现象严重，建议立即降低航速并检查螺旋桨状态'
        else:
            return '极端空化警告！立即采取措施，必要时停航检修'
    
    def get_history(self) -> list:
        return self.history
    
    def clear_history(self):
        self.history = []
