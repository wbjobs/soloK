import numpy as np
from scipy import integrate
from scipy.signal import find_peaks
from config import FEATURE_CONFIG

class FeatureExtractor:
    def __init__(self, config=None):
        self.config = config or FEATURE_CONFIG
        self.feature_names = self.config['features']

    def extract_max_value(self, time, response):
        return np.max(response)

    def extract_steady_value(self, time, response, steady_ratio=0.1, window_size=20):
        if len(response) < window_size:
            return np.mean(response)
        
        end_response = response[-window_size:]
        steady_value = np.mean(end_response)
        return steady_value

    def extract_rise_time(self, time, response, start_ratio=0.1, end_ratio=0.9):
        max_val = np.max(response)
        if max_val == 0:
            return 0
        
        baseline = np.mean(response[:10]) if len(response) > 10 else response[0]
        amplitude = max_val - baseline
        
        start_thresh = baseline + start_ratio * amplitude
        end_thresh = baseline + end_ratio * amplitude
        
        start_idx = np.where(response >= start_thresh)[0]
        end_idx = np.where(response >= end_thresh)[0]
        
        if len(start_idx) == 0 or len(end_idx) == 0:
            return 0
        
        start_time = time[start_idx[0]]
        end_time = time[end_idx[0]]
        
        return end_time - start_time

    def extract_area(self, time, response):
        area = integrate.trapz(response, time)
        return area

    def extract_slope(self, time, response, window_size=10):
        if len(response) < window_size:
            window_size = len(response)
        
        max_idx = np.argmax(response)
        start_idx = max(0, max_idx - window_size)
        
        if start_idx >= max_idx:
            return 0
        
        x = time[start_idx:max_idx+1]
        y = response[start_idx:max_idx+1]
        
        if len(x) < 2:
            return 0
        
        slope = (y[-1] - y[0]) / (x[-1] - x[0]) if (x[-1] - x[0]) != 0 else 0
        return slope

    def extract_response_recovery_ratio(self, time, response, recovery_window=20):
        max_val = np.max(response)
        if max_val == 0:
            return 0
        
        if len(response) <= recovery_window:
            return 1.0
        
        recovery_val = np.mean(response[-recovery_window:])
        ratio = recovery_val / max_val
        return ratio

    def extract_all_features(self, time, response):
        features = {}
        
        if 'max_value' in self.feature_names:
            features['max_value'] = self.extract_max_value(time, response)
        
        if 'steady_value' in self.feature_names:
            features['steady_value'] = self.extract_steady_value(time, response)
        
        if 'rise_time' in self.feature_names:
            features['rise_time'] = self.extract_rise_time(time, response)
        
        if 'area' in self.feature_names:
            features['area'] = self.extract_area(time, response)
        
        if 'slope' in self.feature_names:
            features['slope'] = self.extract_slope(time, response)
        
        if 'response_recovery_ratio' in self.feature_names:
            features['response_recovery_ratio'] = self.extract_response_recovery_ratio(time, response)
        
        return features

    def extract_features_array(self, time, responses):
        n_sensors = responses.shape[1]
        feature_list = []
        
        for i in range(n_sensors):
            features = self.extract_all_features(time, responses[:, i])
            feature_list.append(features)
        
        return feature_list

    def extract_feature_matrix(self, time, responses, flatten=True):
        n_sensors = responses.shape[1]
        feature_names = self.feature_names
        
        if flatten:
            matrix = np.zeros((1, n_sensors * len(feature_names)))
            for i in range(n_sensors):
                features = self.extract_all_features(time, responses[:, i])
                for j, fname in enumerate(feature_names):
                    matrix[0, i * len(feature_names) + j] = features[fname]
            return matrix
        else:
            matrix = np.zeros((n_sensors, len(feature_names)))
            for i in range(n_sensors):
                features = self.extract_all_features(time, responses[:, i])
                for j, fname in enumerate(feature_names):
                    matrix[i, j] = features[fname]
            return matrix

    def get_feature_names_flat(self, n_sensors):
        names = []
        for i in range(n_sensors):
            for fname in self.feature_names:
                names.append(f'S{i+1}_{fname}')
        return names
