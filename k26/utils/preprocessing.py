import numpy as np
import pandas as pd
from scipy import signal
from scipy.signal import savgol_filter
from config import PREPROCESSING_CONFIG

class DataImporter:
    @staticmethod
    def from_csv(file_path, sensor_count=None, sampling_rate=None):
        df = pd.read_csv(file_path)
        return DataImporter._parse_dataframe(df, sensor_count, sampling_rate)

    @staticmethod
    def from_excel(file_path, sheet_name=0, sensor_count=None, sampling_rate=None):
        df = pd.read_excel(file_path, sheet_name=sheet_name)
        return DataImporter._parse_dataframe(df, sensor_count, sampling_rate)

    @staticmethod
    def from_numpy(file_path):
        data = np.load(file_path, allow_pickle=True)
        if isinstance(data, np.ndarray):
            if data.ndim == 2:
                n_samples, n_cols = data.shape
                if n_cols > 1:
                    time = data[:, 0]
                    responses = data[:, 1:]
                    return {
                        'time': time,
                        'responses': responses,
                        'sensor_count': responses.shape[1],
                        'sampling_rate': 1.0 / np.mean(np.diff(time)) if len(time) > 1 else 10
                    }
        return None

    @staticmethod
    def _parse_dataframe(df, sensor_count=None, sampling_rate=None):
        if 'time' in df.columns:
            time = df['time'].values
        elif df.columns[0].lower() in ['t', 'time', 'timestamp']:
            time = df.iloc[:, 0].values
        else:
            if sampling_rate is None:
                sampling_rate = 10
            time = np.arange(len(df)) / sampling_rate

        response_cols = [col for col in df.columns if col != 'time' and 
                        not col.lower() in ['t', 'time', 'timestamp']]
        
        if sensor_count is not None:
            response_cols = response_cols[:sensor_count]
        
        responses = df[response_cols].values

        return {
            'time': time,
            'responses': responses,
            'sensor_count': len(response_cols),
            'sampling_rate': sampling_rate or (1.0 / np.mean(np.diff(time)) if len(time) > 1 else 10)
        }


class SignalPreprocessor:
    def __init__(self, config=None):
        self.config = config or PREPROCESSING_CONFIG

    def baseline_correction(self, time, response, baseline_samples=None):
        if baseline_samples is None:
            baseline_samples = self.config['baseline_samples']
        
        baseline = np.mean(response[:baseline_samples])
        corrected = response - baseline
        return corrected

    def baseline_correction_all(self, time, responses):
        corrected = np.zeros_like(responses)
        for i in range(responses.shape[1]):
            corrected[:, i] = self.baseline_correction(time, responses[:, i])
        return corrected

    def moving_average(self, response, window_size=None):
        if window_size is None:
            window_size = self.config['smooth_window']
        
        kernel = np.ones(window_size) / window_size
        smoothed = np.convolve(response, kernel, mode='same')
        return smoothed

    def savgol_smooth(self, response, window_size=None, polyorder=None):
        if window_size is None:
            window_size = self.config['smooth_window']
        if polyorder is None:
            polyorder = self.config['savgol_polyorder']
        
        if window_size % 2 == 0:
            window_size += 1
        
        smoothed = savgol_filter(response, window_size, polyorder)
        return smoothed

    def smooth(self, response, method=None):
        if method is None:
            method = self.config['smooth_method']
        
        if method == 'moving_average':
            return self.moving_average(response)
        elif method == 'savgol':
            return self.savgol_smooth(response)
        else:
            return response

    def smooth_all(self, responses, method=None):
        smoothed = np.zeros_like(responses)
        for i in range(responses.shape[1]):
            smoothed[:, i] = self.smooth(responses[:, i], method)
        return smoothed

    def normalize(self, response, method='minmax'):
        if method == 'minmax':
            min_val = np.min(response)
            max_val = np.max(response)
            if max_val != min_val:
                return (response - min_val) / (max_val - min_val)
            return response
        elif method == 'zscore':
            mean_val = np.mean(response)
            std_val = np.std(response)
            if std_val != 0:
                return (response - mean_val) / std_val
            return response
        return response

    def normalize_all(self, responses, method='minmax'):
        normalized = np.zeros_like(responses, dtype=float)
        for i in range(responses.shape[1]):
            normalized[:, i] = self.normalize(responses[:, i], method)
        return normalized

    def preprocess_pipeline(self, time, responses, do_baseline=True, do_smooth=True, do_normalize=False):
        result = responses.copy()
        
        if do_baseline:
            result = self.baseline_correction_all(time, result)
        
        if do_smooth:
            result = self.smooth_all(result)
        
        if do_normalize:
            result = self.normalize_all(result)
        
        return result

    def detect_outliers(self, response, threshold=3.0):
        mean_val = np.mean(response)
        std_val = np.std(response)
        z_scores = np.abs((response - mean_val) / std_val) if std_val > 0 else np.zeros_like(response)
        return z_scores > threshold

    def remove_outliers(self, response, threshold=3.0, method='interpolate'):
        outliers = self.detect_outliers(response, threshold)
        cleaned = response.copy()
        
        if method == 'interpolate':
            cleaned[outliers] = np.nan
            cleaned = pd.Series(cleaned).interpolate().values
        elif method == 'mean':
            cleaned[outliers] = np.mean(response[~outliers])
        
        return cleaned
