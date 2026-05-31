import numpy as np
from scipy import signal
from scipy.interpolate import griddata
from config import Config

class DataProcessor:
    @staticmethod
    def calculate_aero_coefficients(balance_data, velocity, 
                                      air_density=Config.AIR_DENSITY,
                                      reference_area=Config.REFERENCE_AREA,
                                      chord_length=Config.CHORD_LENGTH):
        dynamic_pressure = 0.5 * air_density * velocity ** 2
        
        Fx = balance_data[0]
        Fy = balance_data[1]
        Fz = balance_data[2]
        My = balance_data[4]
        
        Cl = 2.0 * Fz / (dynamic_pressure * reference_area)
        Cd = 2.0 * Fx / (dynamic_pressure * reference_area)
        Cm = 2.0 * My / (dynamic_pressure * reference_area * chord_length)
        L_over_D = Cl / Cd if Cd != 0 else 0.0
        
        return {
            'Cl': Cl,
            'Cd': Cd,
            'Cm': Cm,
            'L_over_D': L_over_D
        }
    
    @staticmethod
    def generate_window(nperseg, window_type='hann'):
        if window_type == 'hann':
            return np.hanning(nperseg)
        elif window_type == 'hamming':
            return np.hamming(nperseg)
        elif window_type == 'blackman':
            return np.blackman(nperseg)
        elif window_type == 'rectangular':
            return np.ones(nperseg)
        else:
            return np.hanning(nperseg)
    
    @staticmethod
    def detrend_signal(signal_data, method='linear'):
        if method == 'linear':
            return signal.detrend(signal_data, type='linear')
        elif method == 'constant':
            return signal.detrend(signal_data, type='constant')
        return signal_data - np.mean(signal_data)
    
    @staticmethod
    def compute_windowed_fft(signal_data, sample_rate=Config.SAMPLE_RATE, 
                           window_type='hann', detrend=True):
        n = len(signal_data)
        
        processed = signal_data
        if detrend:
            processed = DataProcessor.detrend_signal(processed)
        
        window = DataProcessor.generate_window(n, window_type)
        windowed_signal = processed * window
        
        fft_vals = np.fft.fft(windowed_signal)
        fft_freqs = np.fft.fftfreq(n, 1.0 / sample_rate)
        
        positive_idx = fft_freqs >= 0
        amplitudes = np.abs(fft_vals[positive_idx])
        
        window_power = np.sum(window ** 2)
        amplitudes *= np.sqrt(2.0 / (sample_rate * window_power))
        
        return {
            'frequencies': fft_freqs[positive_idx].tolist(),
            'amplitudes': amplitudes.tolist()
        }
    
    @staticmethod
    def compute_welch_psd(signal_data, sample_rate=Config.SAMPLE_RATE, 
                          nperseg=1024, noverlap=None, 
                          window_type='hann', detrend=True):
        if noverlap is None:
            noverlap = nperseg // 2
        
        processed = signal_data
        if detrend:
            processed = DataProcessor.detrend_signal(processed)
        
        window = DataProcessor.generate_window(nperseg, window_type)
        
        freqs, psd = signal.welch(
            processed, 
            fs=sample_rate,
            window=window,
            nperseg=nperseg,
            noverlap=noverlap,
            detrend=False,
            scaling='density'
        )
        
        return {
            'frequencies': freqs.tolist(),
            'psd': psd.tolist(),
            'window_type': window_type,
            'nperseg': int(nperseg),
            'noverlap': int(noverlap)
        }
    
    @staticmethod
    def compute_stft(signal_data, sample_rate=Config.SAMPLE_RATE,
                    nperseg=1024, noverlap=None, window_type='hann'):
        if noverlap is None:
            noverlap = nperseg // 2
        
        window = DataProcessor.generate_window(nperseg, window_type)
        
        f, t, Zxx = signal.stft(
            signal_data,
            fs=sample_rate,
            window=window,
            nperseg=nperseg,
            noverlap=noverlap
        )
        
        magnitude = np.abs(Zxx)
        
        return {
            'frequencies': f.tolist(),
            'times': t.tolist(),
            'magnitude': magnitude.tolist(),
            'window_type': window_type,
            'nperseg': int(nperseg),
            'noverlap': int(noverlap)
        }
    
    @staticmethod
    def find_vortex_shedding_freq(freqs, psd, min_freq=10, max_freq=1000,
                                  min_peak_height_ratio=0.1, smooth_window=5):
        freqs = np.asarray(freqs)
        psd = np.asarray(psd)
        
        if len(freqs) != len(psd) or len(psd) == 0:
            return 0.0
        
        mask = (freqs >= min_freq) & (freqs <= max_freq)
        if not np.any(mask):
            return 0.0
        
        if smooth_window > 1 and smooth_window < len(psd):
            kernel = np.ones(smooth_window) / smooth_window
            psd_smoothed = np.convolve(psd, kernel, mode='same')
        else:
            psd_smoothed = psd
        
        masked_psd = np.where(mask, psd_smoothed, 0)
        if np.max(masked_psd) <= 0:
            return 0.0
        
        peak_idx = int(np.argmax(masked_psd))
        
        if peak_idx > 0 and peak_idx < len(psd) - 1:
            y1 = psd_smoothed[peak_idx - 1]
            y2 = psd_smoothed[peak_idx]
            y3 = psd_smoothed[peak_idx + 1]
            
            denom = 2.0 * (y1 - 2.0 * y2 + y3)
            if abs(denom) > 1e-10:
                d = (y1 - y3) / denom
                freq_step = freqs[1] - freqs[0] if len(freqs) > 1 else 0
                return float(freqs[peak_idx] + d * freq_step)
        
        return float(freqs[peak_idx])
    
    @staticmethod
    def find_multiple_peaks(freqs, psd, min_freq=10, max_freq=1000, 
                            num_peaks=3, min_distance=5):
        freqs = np.asarray(freqs)
        psd = np.asarray(psd)
        
        mask = (freqs >= min_freq) & (freqs <= max_freq)
        masked_psd = np.where(mask, psd, 0)
        
        peak_indices, _ = signal.find_peaks(
            masked_psd,
            height=np.max(masked_psd) * 0.1,
            distance=min_distance
        )
        
        peak_indices = sorted(peak_indices, key=lambda i: psd[i], reverse=True)[:num_peaks]
        
        peaks = []
        for idx in peak_indices:
            peaks.append({
                'frequency': float(freqs[idx]),
                'magnitude': float(psd[idx])
            })
        
        return peaks
    
    @staticmethod
    def compute_pressure_statistics(pressure_data):
        mean_pressure = np.mean(pressure_data, axis=0)
        std_pressure = np.std(pressure_data, axis=0)
        rms_pressure = np.sqrt(np.mean(pressure_data ** 2, axis=0))
        
        return {
            'mean': mean_pressure.tolist(),
            'std': std_pressure.tolist(),
            'rms': rms_pressure.tolist()
        }
    
    @staticmethod
    def generate_airfoil_coords(n_points=100):
        x = np.linspace(0, 1, n_points)
        y_upper = 0.12 * (0.2969 * np.sqrt(x) - 0.1260 * x - 
                          0.3516 * x**2 + 0.2843 * x**3 - 0.1015 * x**4)
        y_lower = -y_upper
        return x, y_upper, y_lower
    
    @staticmethod
    def interpolate_pressure_distribution(channels_values, grid_size=50):
        n_channels = len(channels_values)
        x_channels = np.linspace(0.02, 0.98, n_channels)
        y_channels = np.zeros_like(x_channels)
        
        points = np.column_stack((x_channels, y_channels))
        values = np.array(channels_values)
        
        grid_x, grid_y = np.mgrid[0:1:complex(0, grid_size), -0.2:0.2:complex(0, grid_size)]
        
        grid_z = griddata(points, values, (grid_x, grid_y), method='cubic', fill_value=0)
        
        return {
            'grid_x': grid_x.tolist(),
            'grid_y': grid_y.tolist(),
            'grid_z': grid_z.tolist()
        }
    
    @staticmethod
    def quality_control(data, window_size=100, sigma_threshold=3.0):
        mean = np.mean(data, axis=0)
        std = np.std(data, axis=0)
        
        valid_mask = np.abs(data - mean) <= sigma_threshold * std
        
        cleaned_data = np.where(valid_mask, data, mean)
        
        return {
            'cleaned_data': cleaned_data.tolist(),
            'valid_mask': valid_mask.tolist(),
            'outlier_count': int(np.sum(~valid_mask))
        }
