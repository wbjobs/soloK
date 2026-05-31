import numpy as np
from scipy.signal import butter, filtfilt, hilbert, find_peaks
from scipy.fft import fft, fftfreq
from typing import Tuple, Dict, List
import pywt


class EnvelopeDemodulation:
    def __init__(self, sample_rate: int = 20000):
        self.sample_rate = sample_rate

    def bandpass_filter(self, signal: np.ndarray, low_freq: float, 
                        high_freq: float, order: int = 4) -> np.ndarray:
        nyquist = 0.5 * self.sample_rate
        low = low_freq / nyquist
        high = high_freq / nyquist
        b, a = butter(order, [low, high], btype='band')
        return filtfilt(b, a, signal)

    def highpass_filter(self, signal: np.ndarray, cutoff_freq: float, 
                        order: int = 4) -> np.ndarray:
        nyquist = 0.5 * self.sample_rate
        cutoff = cutoff_freq / nyquist
        b, a = butter(order, cutoff, btype='high')
        return filtfilt(b, a, signal)

    def lowpass_filter(self, signal: np.ndarray, cutoff_freq: float, 
                       order: int = 4) -> np.ndarray:
        nyquist = 0.5 * self.sample_rate
        cutoff = cutoff_freq / nyquist
        b, a = butter(order, cutoff, btype='low')
        return filtfilt(b, a, signal)

    def get_envelope(self, signal: np.ndarray) -> np.ndarray:
        analytic_signal = hilbert(signal)
        envelope = np.abs(analytic_signal)
        return envelope - np.mean(envelope)

    def wavelet_denoise(self, signal: np.ndarray, wavelet: str = 'db4', 
                        level: int = 5) -> np.ndarray:
        coeffs = pywt.wavedec(signal, wavelet, level=level)
        sigma = np.median(np.abs(coeffs[-1])) / 0.6745
        uthresh = sigma * np.sqrt(2 * np.log(len(signal)))
        coeffs[1:] = (pywt.threshold(i, value=uthresh, mode='soft') 
                      for i in coeffs[1:])
        return pywt.waverec(coeffs, wavelet)

    def compute_spectrum(self, signal: np.ndarray) -> Tuple[np.ndarray, np.ndarray]:
        n = len(signal)
        yf = fft(signal)
        xf = fftfreq(n, 1 / self.sample_rate)[:n // 2]
        amplitude = 2.0 / n * np.abs(yf[0:n // 2])
        return xf, amplitude

    def demodulate(self, signal: np.ndarray, band: Tuple[float, float] = None, 
                   denoise: bool = True) -> Dict:
        if denoise:
            signal = self.wavelet_denoise(signal)
        
        if band:
            filtered = self.bandpass_filter(signal, band[0], band[1])
        else:
            filtered = self.highpass_filter(signal, 500)
        
        envelope = self.get_envelope(filtered)
        envelope = self.lowpass_filter(envelope, 2000)
        
        freqs, spectrum = self.compute_spectrum(envelope)
        
        peaks, peak_props = find_peaks(spectrum, height=np.mean(spectrum) * 3, 
                                       distance=10)
        peak_freqs = freqs[peaks]
        peak_amplitudes = spectrum[peaks]
        
        return {
            "original_signal": signal,
            "filtered_signal": filtered,
            "envelope": envelope,
            "frequencies": freqs,
            "spectrum": spectrum,
            "peak_frequencies": peak_freqs,
            "peak_amplitudes": peak_amplitudes
        }

    def extract_bearing_features(self, signal: np.ndarray, 
                                 rotational_freq: float) -> Dict[str, float]:
        bpfi = rotational_freq * 5.43
        bpfo = rotational_freq * 3.57
        bsf = rotational_freq * 2.38
        ftf = rotational_freq * 0.38
        
        demod_result = self.demodulate(signal)
        freqs = demod_result["frequencies"]
        spectrum = demod_result["spectrum"]
        
        def get_peak_energy(target_freq: float, tolerance: float = 0.05) -> float:
            mask = np.abs(freqs - target_freq) < target_freq * tolerance
            if np.any(mask):
                return np.max(spectrum[mask])
            return 0.0
        
        features = {
            "BPFI_energy": get_peak_energy(bpfi),
            "BPFO_energy": get_peak_energy(bpfo),
            "BSF_energy": get_peak_energy(bsf),
            "FTF_energy": get_peak_energy(ftf),
            "RMS": np.sqrt(np.mean(signal ** 2)),
            "Peak_to_Peak": np.max(signal) - np.min(signal),
            "Kurtosis": np.mean((signal - np.mean(signal)) ** 4) / 
                       (np.std(signal) ** 4),
            "Crest_Factor": np.max(np.abs(signal)) / 
                           np.sqrt(np.mean(signal ** 2))
        }
        
        return features
