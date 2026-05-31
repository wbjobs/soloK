import numpy as np
from scipy.signal import hilbert, butter, filtfilt
from scipy.fft import fft, fftfreq
from typing import Tuple, Dict, List


class CurrentAnalysis:
    def __init__(self, sample_rate: int = 10000):
        self.sample_rate = sample_rate

    def notch_filter(self, signal: np.ndarray, center_freq: float = 50, 
                     bandwidth: float = 2.0, order: int = 4) -> np.ndarray:
        nyquist = 0.5 * self.sample_rate
        low = (center_freq - bandwidth / 2) / nyquist
        high = (center_freq + bandwidth / 2) / nyquist
        b, a = butter(order, [low, high], btype='bandstop')
        return filtfilt(b, a, signal)

    def bandpass_filter(self, signal: np.ndarray, low_freq: float, 
                        high_freq: float, order: int = 4) -> np.ndarray:
        nyquist = 0.5 * self.sample_rate
        low = low_freq / nyquist
        high = high_freq / nyquist
        b, a = butter(order, [low, high], btype='band')
        return filtfilt(b, a, signal)

    def hilbert_transform(self, signal: np.ndarray) -> Tuple[np.ndarray, np.ndarray]:
        analytic = hilbert(signal)
        amplitude = np.abs(analytic)
        phase = np.unwrap(np.angle(analytic))
        return amplitude, phase

    def compute_spectrum(self, signal: np.ndarray) -> Tuple[np.ndarray, np.ndarray]:
        n = len(signal)
        yf = fft(signal)
        xf = fftfreq(n, 1 / self.sample_rate)[:n // 2]
        amplitude = 2.0 / n * np.abs(yf[0:n // 2])
        return xf, amplitude

    def detect_broken_rotor_bars(self, signal: np.ndarray, 
                                 supply_freq: float = 50,
                                 slip: float = 0.02) -> Dict:
        filtered = self.notch_filter(signal, supply_freq)
        
        amplitude_envelope, phase = self.hilbert_transform(filtered)
        
        envelope_demod = amplitude_envelope - np.mean(amplitude_envelope)
        
        freqs, spectrum = self.compute_spectrum(envelope_demod)
        
        fault_freq_low = supply_freq * (1 - 2 * slip)
        fault_freq_high = supply_freq * (1 + 2 * slip)
        
        sideband_energies = []
        for k in range(1, 4):
            freq_left = supply_freq - 2 * k * slip * supply_freq
            freq_right = supply_freq + 2 * k * slip * supply_freq
            
            mask_left = np.abs(freqs - freq_left) < 1.0
            mask_right = np.abs(freqs - freq_right) < 1.0
            
            energy_left = np.max(spectrum[mask_left]) if np.any(mask_left) else 0
            energy_right = np.max(spectrum[mask_right]) if np.any(mask_right) else 0
            
            sideband_energies.append((energy_left + energy_right) / 2)
        
        main_freq_mask = np.abs(freqs - supply_freq) < 2.0
        main_energy = np.max(spectrum[main_freq_mask]) if np.any(main_freq_mask) else 1
        
        severity_ratio = np.mean(sideband_energies) / main_energy if main_energy > 0 else 0
        
        return {
            "original_signal": signal,
            "filtered_signal": filtered,
            "amplitude_envelope": amplitude_envelope,
            "phase": phase,
            "frequencies": freqs,
            "spectrum": spectrum,
            "fault_frequencies": [fault_freq_low, fault_freq_high],
            "sideband_energies": sideband_energies,
            "severity_ratio": severity_ratio,
            "severity_percentage": min(100, severity_ratio * 500)
        }

    def extract_stator_features(self, phase_a: np.ndarray, 
                                phase_b: np.ndarray, 
                                phase_c: np.ndarray) -> Dict:
        def compute_fft(signal):
            freqs, spec = self.compute_spectrum(signal)
            return freqs, spec
        
        freqs_a, spec_a = compute_fft(phase_a)
        freqs_b, spec_b = compute_fft(phase_b)
        freqs_c, spec_c = compute_fft(phase_c)
        
        def get_harmonic_energy(freqs, spec, harmonic, supply_freq=50, tol=2.0):
            target = harmonic * supply_freq
            mask = np.abs(freqs - target) < tol
            return np.max(spec[mask]) if np.any(mask) else 0
        
        features = {
            "RMS_A": np.sqrt(np.mean(phase_a ** 2)),
            "RMS_B": np.sqrt(np.mean(phase_b ** 2)),
            "RMS_C": np.sqrt(np.mean(phase_c ** 2)),
            "Current_Unbalance": np.std([np.sqrt(np.mean(phase_a ** 2)),
                                         np.sqrt(np.mean(phase_b ** 2)),
                                         np.sqrt(np.mean(phase_c ** 2))]) / 
                                np.mean([np.sqrt(np.mean(phase_a ** 2)),
                                         np.sqrt(np.mean(phase_b ** 2)),
                                         np.sqrt(np.mean(phase_c ** 2))]),
            "THD_A": np.sqrt(np.sum([get_harmonic_energy(freqs_a, spec_a, h) ** 2 
                                     for h in range(2, 11)])) / 
                    get_harmonic_energy(freqs_a, spec_a, 1) * 100,
            "THD_B": np.sqrt(np.sum([get_harmonic_energy(freqs_b, spec_b, h) ** 2 
                                     for h in range(2, 11)])) / 
                    get_harmonic_energy(freqs_b, spec_b, 1) * 100,
            "THD_C": np.sqrt(np.sum([get_harmonic_energy(freqs_c, spec_c, h) ** 2 
                                     for h in range(2, 11)])) / 
                    get_harmonic_energy(freqs_c, spec_c, 1) * 100,
        }
        
        features["Average_THD"] = np.mean([features["THD_A"], 
                                           features["THD_B"], 
                                           features["THD_C"]])
        
        return features

    def detect_eccentricity(self, signal: np.ndarray, 
                            rotational_freq: float,
                            supply_freq: float = 50) -> Dict:
        freqs, spectrum = self.compute_spectrum(signal)
        
        ecc_freqs = [
            supply_freq + rotational_freq,
            supply_freq - rotational_freq,
            supply_freq + 2 * rotational_freq,
            supply_freq - 2 * rotational_freq
        ]
        
        ecc_energies = []
        for f in ecc_freqs:
            mask = np.abs(freqs - f) < 2.0
            energy = np.max(spectrum[mask]) if np.any(mask) else 0
            ecc_energies.append(energy)
        
        main_mask = np.abs(freqs - supply_freq) < 2.0
        main_energy = np.max(spectrum[main_mask]) if np.any(main_mask) else 1
        
        severity_ratio = np.mean(ecc_energies) / main_energy if main_energy > 0 else 0
        
        return {
            "frequencies": freqs,
            "spectrum": spectrum,
            "eccentricity_frequencies": ecc_freqs,
            "eccentricity_energies": ecc_energies,
            "severity_ratio": severity_ratio,
            "severity_percentage": min(100, severity_ratio * 300)
        }
