import numpy as np
from scipy import signal
from scipy.fft import fft, fftfreq
import pywt


def compute_fft(signal_data: np.ndarray, sampling_rate: int) -> tuple:
    n = len(signal_data)
    yf = fft(signal_data)
    xf = fftfreq(n, 1 / sampling_rate)
    magnitude = 2.0 / n * np.abs(yf[0:n // 2])
    phase = np.angle(yf[0:n // 2])
    return xf[:n // 2], magnitude, phase


def extract_harmonic(signal_data: np.ndarray, sampling_rate: int, 
                    harmonic_order: int, fundamental_freq: float = 50.0) -> tuple:
    n = len(signal_data)
    yf = fft(signal_data)
    xf = fftfreq(n, 1 / sampling_rate)
    
    target_freq = harmonic_order * fundamental_freq
    freq_indices = np.where(np.isclose(xf, target_freq, atol=fundamental_freq/2))[0]
    
    if len(freq_indices) > 0:
        idx = freq_indices[np.argmax(np.abs(yf[freq_indices]))]
        magnitude = 2.0 / n * np.abs(yf[idx])
        phase = np.angle(yf[idx])
        return magnitude, phase
    return 0.0, 0.0


def wavelet_transform(signal_data: np.ndarray, wavelet: str = 'db4', 
                     level: int = 5) -> list:
    coeffs = pywt.wavedec(signal_data, wavelet, level=level)
    return coeffs


def find_wavelet_modulus_maxima(coeffs: list) -> list:
    maxima = []
    for i, detail in enumerate(coeffs[1:], 1):
        abs_detail = np.abs(detail)
        peaks, _ = signal.find_peaks(abs_detail, height=np.std(abs_detail))
        if len(peaks) > 0:
            maxima.append({
                'level': i,
                'peak_indices': peaks,
                'peak_values': abs_detail[peaks]
            })
    return maxima


def detect_fault_onset(zero_sequence: np.ndarray, threshold: float = 2.0) -> int:
    energy = np.abs(signal.hilbert(zero_sequence))
    baseline = np.mean(energy[:len(energy) // 4])
    std_dev = np.std(energy[:len(energy) // 4])
    
    above_threshold = np.where(energy > baseline + threshold * std_dev)[0]
    if len(above_threshold) > 0:
        return above_threshold[0]
    return 0


def compute_phase_difference(signal1: np.ndarray, signal2: np.ndarray, 
                            sampling_rate: int, fundamental_freq: float = 50.0) -> float:
    _, mag1, phase1 = compute_fft(signal1, sampling_rate)
    _, mag2, phase2 = compute_fft(signal2, sampling_rate)
    
    freq_idx = np.argmin(np.abs(_ - fundamental_freq))
    return np.degrees(phase1[freq_idx] - phase2[freq_idx])


def first_half_wave_polarity(signal_data: np.ndarray, fault_onset: int, 
                            sampling_rate: int, fundamental_freq: float = 50.0,
                            amplitude_threshold: float = 0.1) -> tuple:
    half_cycle_samples = int(sampling_rate / (2 * fundamental_freq))
    full_cycle_samples = int(sampling_rate / fundamental_freq)
    
    if fault_onset >= len(signal_data):
        return 0, 0.0
    
    end_idx_half = min(fault_onset + half_cycle_samples, len(signal_data))
    first_half = signal_data[fault_onset:end_idx_half]
    
    if len(first_half) == 0:
        return 0, 0.0
    
    peak_amp_half = np.max(np.abs(first_half))
    baseline_amp = np.std(signal_data[:max(0, fault_onset - 100)]) if fault_onset > 100 else 0.01
    
    if peak_amp_half < amplitude_threshold * max(baseline_amp, 0.01):
        end_idx_full = min(fault_onset + full_cycle_samples, len(signal_data))
        first_full = signal_data[fault_onset:end_idx_full]
        
        if len(first_full) >= half_cycle_samples:
            integrated_value = np.trapz(first_full)
            polarity = np.sign(integrated_value)
            
            if polarity == 0:
                peak_idx = np.argmax(np.abs(first_full))
                polarity = np.sign(first_full[peak_idx])
            
            reliability = min(1.0, peak_amp_half / (amplitude_threshold * max(baseline_amp, 0.01)) + 0.3)
            return polarity, reliability
    
    peak_idx = np.argmax(np.abs(first_half))
    polarity = np.sign(first_half[peak_idx])
    
    if polarity == 0 and len(first_half) > 0:
        integrated_value = np.trapz(first_half)
        polarity = np.sign(integrated_value)
    
    reliability = min(1.0, peak_amp_half / max(baseline_amp, 0.01))
    
    return polarity, reliability


def multi_window_polarity(signal_data: np.ndarray, fault_onset: int,
                         sampling_rate: int, fundamental_freq: float = 50.0) -> tuple:
    windows = [0.5, 1.0, 1.5]
    polarities = []
    weights = []
    
    for w in windows:
        window_samples = int(w * sampling_rate / fundamental_freq)
        end_idx = min(fault_onset + window_samples, len(signal_data))
        
        if fault_onset < len(signal_data):
            window_data = signal_data[fault_onset:end_idx]
            if len(window_data) > 0:
                peak_amp = np.max(np.abs(window_data))
                if peak_amp > 0.01:
                    integrated = np.trapz(window_data)
                    pol = np.sign(integrated)
                    if pol != 0:
                        polarities.append(pol)
                        weights.append(peak_amp * w)
    
    if not polarities:
        return 0, 0.0
    
    weighted_sum = sum(p * w for p, w in zip(polarities, weights))
    final_polarity = 1 if weighted_sum > 0 else (-1 if weighted_sum < 0 else 0)
    confidence = abs(weighted_sum) / sum(weights) if sum(weights) > 0 else 0
    
    return final_polarity, confidence


def bandpass_filter(signal_data: np.ndarray, sampling_rate: int, 
                   low_freq: float, high_freq: float, order: int = 4) -> np.ndarray:
    nyquist = 0.5 * sampling_rate
    low = low_freq / nyquist
    high = high_freq / nyquist
    b, a = signal.butter(order, [low, high], btype='band')
    return signal.filtfilt(b, a, signal_data)


def lowpass_filter(signal_data: np.ndarray, sampling_rate: int, 
                  cutoff_freq: float, order: int = 4) -> np.ndarray:
    nyquist = 0.5 * sampling_rate
    normal_cutoff = cutoff_freq / nyquist
    b, a = signal.butter(order, normal_cutoff, btype='low')
    return signal.filtfilt(b, a, signal_data)


def estimate_ground_resistance(zero_seq_current: np.ndarray, zero_seq_voltage: np.ndarray,
                              sampling_rate: int, fundamental_freq: float = 50.0) -> float:
    curr_mag, curr_phase = extract_harmonic(zero_seq_current, sampling_rate, 1, fundamental_freq)
    volt_mag, volt_phase = extract_harmonic(zero_seq_voltage, sampling_rate, 1, fundamental_freq)
    
    if curr_mag < 1e-6:
        return 1e6
    
    resistance = volt_mag / curr_mag * np.cos(np.radians(volt_phase - curr_phase))
    return max(0.0, resistance)


def total_harmonic_distortion(signal_data: np.ndarray, sampling_rate: int,
                             fundamental_freq: float = 50.0) -> float:
    _, magnitude, _ = compute_fft(signal_data, sampling_rate)
    freq_mask = _ <= 1000
    
    fundamental_idx = np.argmin(np.abs(_[freq_mask] - fundamental_freq))
    fundamental_mag = magnitude[freq_mask][fundamental_idx]
    
    if fundamental_mag < 1e-6:
        return 0.0
    
    harmonic_mags = []
    for h in range(2, 21):
        target_freq = h * fundamental_freq
        idx = np.argmin(np.abs(_[freq_mask] - target_freq))
        harmonic_mags.append(magnitude[freq_mask][idx])
    
    thd = np.sqrt(np.sum(np.array(harmonic_mags) ** 2)) / fundamental_mag * 100
    return thd
