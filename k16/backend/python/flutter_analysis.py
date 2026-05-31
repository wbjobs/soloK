import numpy as np
from scipy import signal, linalg, optimize
from scipy.signal import find_peaks
from dataclasses import dataclass
from typing import Tuple, List, Optional
import warnings

warnings.filterwarnings('ignore')


@dataclass
class FlutterResult:
    flutter_speed: float
    damping_ratio: float
    natural_frequency: float
    confidence: float
    velocity_history: List[float]
    damping_history: List[float]
    flutter_margin: float


class FlutterAnalyzer:
    def __init__(self, 
                 sample_rate: float = 2000,
                 ar_order: int = 20,
                 ma_order: int = 5):
        self.sample_rate = sample_rate
        self.ar_order = ar_order
        self.ma_order = ma_order
        self._velocity_data = []
        self._damping_data = []
        self._pressure_history = {}
        self._initialized = False
    
    def reset(self):
        self._velocity_data = []
        self._damping_data = []
        self._pressure_history = {}
        self._initialized = False
    
    def fit_arma_model(self, signal_data: np.ndarray, 
                       ar_order: int = None, 
                       ma_order: int = None) -> Tuple[np.ndarray, np.ndarray]:
        if ar_order is None:
            ar_order = self.ar_order
        if ma_order is None:
            ma_order = self.ma_order
        
        n = len(signal_data)
        
        autocorr = np.correlate(signal_data, signal_data, mode='full')[n-1:]
        autocorr /= autocorr[0]
        
        R = linalg.toeplitz(autocorr[:ar_order])
        r = autocorr[1:ar_order+1]
        
        try:
            ar_coeffs = -linalg.solve(R, r)
        except linalg.LinAlgError:
            ar_coeffs = -linalg.lstsq(R, r)[0]
        
        ar_coeffs = np.concatenate([[1.0], ar_coeffs])
        
        residual = np.convolve(signal_data, ar_coeffs, mode='same')
        
        ma_coeffs = np.array([1.0])
        if ma_order > 0:
            residual_corr = np.correlate(residual, residual, mode='full')
            residual_corr = residual_corr[len(residual_corr)//2:]
            residual_corr /= residual_corr[0]
            
            if len(residual_corr) > ma_order:
                R_ma = linalg.toeplitz(residual_corr[:ma_order])
                r_ma = residual_corr[1:ma_order+1]
                try:
                    ma_coeffs = -linalg.solve(R_ma, r_ma)
                except linalg.LinAlgError:
                    ma_coeffs = -linalg.lstsq(R_ma, r_ma)[0]
                ma_coeffs = np.concatenate([[1.0], ma_coeffs])
        
        return ar_coeffs, ma_coeffs
    
    def estimate_modal_params(self, ar_coeffs: np.ndarray) -> Tuple[np.ndarray, np.ndarray]:
        char_poly = ar_coeffs.copy()
        
        roots = np.roots(char_poly)
        
        roots = roots[np.abs(roots) > 0.1]
        
        s = np.log(roots * np.exp(1j * np.angle(roots))) / (1.0 / self.sample_rate)
        s = s[np.imag(s) > 0]
        
        damping = -np.real(s)
        frequency = np.imag(s) / (2 * np.pi)
        
        positive_mask = (damping < 0.5) & (frequency > 0.1) & (frequency < self.sample_rate / 2)
        
        return damping[positive_mask], frequency[positive_mask]
    
    def analyze_damping_decay(self, pressure_data: np.ndarray, 
                              velocity: float) -> Tuple[float, float]:
        pressure_data = np.array(pressure_data, dtype=float)
        
        if len(pressure_data) < 100:
            return 0.05, 50.0
        
        pressure_data = signal.detrend(pressure_data)
        
        ar_coeffs, ma_coeffs = self.fit_arma_model(pressure_data)
        
        damping_ratios, frequencies = self.estimate_modal_params(ar_coeffs)
        
        if len(damping_ratios) > 0:
            dominant_idx = np.argmin(np.abs(damping_ratios))
            damping_ratio = damping_ratios[dominant_idx]
            natural_freq = frequencies[dominant_idx]
        else:
            damping_ratio = 0.05
            natural_freq = 50.0
        
        self._velocity_data.append(velocity)
        self._damping_data.append(damping_ratio)
        
        return damping_ratio, natural_freq
    
    def predict_flutter_speed(self) -> FlutterResult:
        if len(self._velocity_data) < 3:
            return FlutterResult(
                flutter_speed=0.0,
                damping_ratio=0.0,
                natural_frequency=0.0,
                confidence=0.0,
                velocity_history=self._velocity_data.copy(),
                damping_history=self._damping_data.copy(),
                flutter_margin=100.0
            )
        
        velocities = np.array(self._velocity_data)
        dampings = np.array(self._damping_data)
        
        valid_mask = dampings < 0.3
        if np.sum(valid_mask) < 2:
            valid_mask = np.ones_like(dampings, dtype=bool)
        
        v_filtered = velocities[valid_mask]
        d_filtered = dampings[valid_mask]
        
        try:
            z = np.polyfit(v_filtered, d_filtered, 2)
            p = np.poly1d(z)
            
            damping_at_zero = p(0)
            
            v_flutter = optimize.brentq(p, 0, np.max(velocities) * 3, 
                                         maxiter=100) if p(np.max(velocities) * 3) < 0 else np.max(velocities) * 1.5
            
            current_v = velocities[-1]
            margin = ((v_flutter - current_v) / v_flutter) * 100 if v_flutter > 0 else 100.0
            
            confidence = min(0.95, 0.5 + len(velocities) * 0.1)
            
        except Exception:
            v_flutter = 0.0
            margin = 100.0
            confidence = 0.0
        
        return FlutterResult(
            flutter_speed=float(v_flutter),
            damping_ratio=float(dampings[-1]) if len(dampings) > 0 else 0.0,
            natural_frequency=float(np.mean(d_filtered)) if len(d_filtered) > 0 else 0.0,
            confidence=float(confidence),
            velocity_history=self._velocity_data.copy(),
            damping_history=self._damping_data.copy(),
            flutter_margin=float(margin)
        )
    
    def process_pressure_signal(self, pressure_data: np.ndarray, 
                                 velocity: float) -> dict:
        damping_ratio, natural_freq = self.analyze_damping_decay(pressure_data, velocity)
        
        flutter_result = self.predict_flutter_speed()
        
        return {
            'damping_ratio': damping_ratio,
            'natural_frequency': natural_freq,
            'flutter_speed': flutter_result.flutter_speed,
            'flutter_margin': flutter_result.flutter_margin,
            'confidence': flutter_result.confidence,
            'velocity_history': flutter_result.velocity_history,
            'damping_history': flutter_result.damping_history,
            'is_stable': damping_ratio > 0,
            'warning_level': 'safe' if flutter_result.flutter_margin > 20 
                           else ('caution' if flutter_result.flutter_margin > 10 
                           else ('warning' if flutter_result.flutter_margin > 5 
                           else 'danger'))
        }
