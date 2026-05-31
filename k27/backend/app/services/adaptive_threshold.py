import numpy as np
from typing import Dict, List, Tuple, Optional
from collections import deque
from datetime import datetime, timedelta


class AdaptiveThreshold:
    def __init__(self, window_size: int = 1000, confidence_level: float = 0.997):
        self.window_size = window_size
        self.confidence_level = confidence_level
        self.data_windows: Dict[str, deque] = {}
        self.thresholds: Dict[str, Dict] = {}
        self.z_score = {0.90: 1.645, 0.95: 1.96, 0.99: 2.576, 0.997: 3.0}

    def update_data(self, key: str, value: float):
        if key not in self.data_windows:
            self.data_windows[key] = deque(maxlen=self.window_size)
        
        self.data_windows[key].append(value)
        
        if len(self.data_windows[key]) >= 30:
            self._calculate_threshold(key)

    def _calculate_threshold(self, key: str):
        data = np.array(list(self.data_windows[key]))
        
        mean = np.mean(data)
        std = np.std(data)
        
        z = self.z_score.get(self.confidence_level, 3.0)
        
        ucl = mean + z * std
        lcl = mean - z * std
        
        iqr = np.percentile(data, 75) - np.percentile(data, 25)
        median = np.median(data)
        
        self.thresholds[key] = {
            "mean": float(mean),
            "std": float(std),
            "ucl": float(ucl),
            "lcl": float(lcl),
            "median": float(median),
            "iqr": float(iqr),
            "sample_size": len(data),
            "last_updated": datetime.now().isoformat()
        }

    def check_threshold(self, key: str, value: float) -> Dict:
        if key not in self.thresholds:
            return {
                "status": "normal",
                "deviation": 0.0,
                "thresholds": None
            }
        
        th = self.thresholds[key]
        deviation = 0.0
        
        if value > th["ucl"]:
            status = "high"
            deviation = (value - th["ucl"]) / th["std"] if th["std"] > 0 else 0
        elif value < th["lcl"]:
            status = "low"
            deviation = (th["lcl"] - value) / th["std"] if th["std"] > 0 else 0
        else:
            status = "normal"
        
        return {
            "status": status,
            "deviation": float(deviation),
            "thresholds": th
        }

    def get_threshold(self, key: str) -> Optional[Dict]:
        return self.thresholds.get(key)

    def get_all_thresholds(self) -> Dict[str, Dict]:
        return self.thresholds


class FaultFrequencyMarker:
    def __init__(self, rotational_freq: float = 25.0, supply_freq: float = 50.0):
        self.rotational_freq = rotational_freq
        self.supply_freq = supply_freq
        self.tolerance = 0.05

    def calculate_bearing_frequencies(self, rolling_elements: int = 10,
                                       contact_angle: float = 0.0,
                                       pitch_diameter: float = 100.0,
                                       rolling_diameter: float = 20.0) -> Dict:
        n = rolling_elements
        beta = contact_angle
        D = pitch_diameter
        d = rolling_diameter
        
        cos_beta = np.cos(beta)
        
        bpfo = n / 2 * self.rotational_freq * (1 - d / D * cos_beta)
        bpfi = n / 2 * self.rotational_freq * (1 + d / D * cos_beta)
        bsf = D / (2 * d) * self.rotational_freq * (1 - (d / D) ** 2 * cos_beta ** 2)
        ftf = 1 / 2 * self.rotational_freq * (1 - d / D * cos_beta)
        
        return {
            "BPFO": float(bpfo),
            "BPFI": float(bpfi),
            "BSF": float(bsf),
            "FTF": float(ftf)
        }

    def calculate_rotor_frequencies(self, slip: float = 0.02) -> Dict:
        fr = self.rotational_freq * (1 - slip)
        sidebands = []
        for k in range(1, 4):
            sidebands.append(self.supply_freq - 2 * k * slip * self.supply_freq)
            sidebands.append(self.supply_freq + 2 * k * slip * self.supply_freq)
        
        return {
            "rotational_freq": float(fr),
            "slip_frequency": float(slip * self.supply_freq),
            "sideband_frequencies": [float(f) for f in sidebands]
        }

    def calculate_eccentricity_frequencies(self) -> Dict:
        fr = self.rotational_freq
        frequencies = [
            self.supply_freq - fr,
            self.supply_freq + fr,
            self.supply_freq - 2 * fr,
            self.supply_freq + 2 * fr
        ]
        return {
            "eccentricity_frequencies": [float(f) for f in frequencies]
        }

    def get_all_fault_frequencies(self) -> Dict:
        bearing = self.calculate_bearing_frequencies()
        rotor = self.calculate_rotor_frequencies()
        eccentricity = self.calculate_eccentricity_frequencies()
        
        return {
            "bearing": bearing,
            "rotor": rotor,
            "eccentricity": eccentricity,
            "supply_frequency": self.supply_freq,
            "rotational_frequency": self.rotational_freq
        }

    def mark_frequencies(self, freqs: np.ndarray, spectrum: np.ndarray) -> List[Dict]:
        fault_freqs = self.get_all_fault_frequencies()
        marked = []
        
        for freq_type, freq_value in fault_freqs["bearing"].items():
            tolerance = freq_value * self.tolerance
            mask = np.abs(freqs - freq_value) < tolerance
            
            if np.any(mask):
                idx = np.argmax(spectrum[mask])
                actual_idx = np.where(mask)[0][idx]
                marked.append({
                    "type": "bearing",
                    "name": freq_type,
                    "theoretical_freq": float(freq_value),
                    "actual_freq": float(freqs[actual_idx]),
                    "amplitude": float(spectrum[actual_idx]),
                    "tolerance": float(tolerance)
                })
        
        for freq in fault_freqs["rotor"]["sideband_frequencies"]:
            tolerance = freq * self.tolerance
            mask = np.abs(freqs - freq) < tolerance
            
            if np.any(mask):
                idx = np.argmax(spectrum[mask])
                actual_idx = np.where(mask)[0][idx]
                marked.append({
                    "type": "rotor",
                    "name": "sideband",
                    "theoretical_freq": float(freq),
                    "actual_freq": float(freqs[actual_idx]),
                    "amplitude": float(spectrum[actual_idx]),
                    "tolerance": float(tolerance)
                })
        
        for freq in fault_freqs["eccentricity"]["eccentricity_frequencies"]:
            tolerance = freq * self.tolerance
            mask = np.abs(freqs - freq) < tolerance
            
            if np.any(mask):
                idx = np.argmax(spectrum[mask])
                actual_idx = np.where(mask)[0][idx]
                marked.append({
                    "type": "eccentricity",
                    "name": "eccentricity",
                    "theoretical_freq": float(freq),
                    "actual_freq": float(freqs[actual_idx]),
                    "amplitude": float(spectrum[actual_idx]),
                    "tolerance": float(tolerance)
                })
        
        return marked
