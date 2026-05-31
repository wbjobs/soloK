import numpy as np
from collections import deque
from datetime import datetime
import json
import os

class SensorDiagnostic:
    def __init__(self, n_sensors=16, history_size=100):
        self.n_sensors = n_sensors
        self.history_size = history_size
        
        self.baseline_history = [deque(maxlen=history_size) for _ in range(n_sensors)]
        self.response_history = [deque(maxlen=history_size) for _ in range(n_sensors)]
        self.noise_history = [deque(maxlen=history_size) for _ in range(n_sensors)]
        
        self.reference_baselines = None
        self.reference_response_amplitude = None
        self.reference_noise_level = None
        
        self.sensor_status = ['normal'] * n_sensors
        self.sensor_warnings = [[] for _ in range(n_sensors)]
        self.diagnosis_history = []
        
        self.thresholds = {
            'baseline_drift': 0.3,
            'response_degradation': 0.4,
            'noise_increase': 2.0,
            'no_response': 0.05,
            'saturation': 0.95
        }

    def set_reference(self, baseline_readings, response_amplitudes, noise_levels=None):
        self.reference_baselines = np.array(baseline_readings)
        self.reference_response_amplitude = np.array(response_amplitudes)
        if noise_levels is not None:
            self.reference_noise_level = np.array(noise_levels)
        else:
            self.reference_noise_level = np.ones(self.n_sensors) * 0.01

    def update(self, current_readings, is_clean_air=False):
        if is_clean_air:
            for i in range(self.n_sensors):
                self.baseline_history[i].append(current_readings[i])
        else:
            for i in range(self.n_sensors):
                self.response_history[i].append(current_readings[i])
                if len(self.response_history[i]) > 1:
                    noise = abs(self.response_history[i][-1] - self.response_history[i][-2])
                    self.noise_history[i].append(noise)
        
        self._diagnose()
        return self.get_diagnosis()

    def _diagnose(self):
        for i in range(self.n_sensors):
            warnings = []
            status = 'normal'
            
            if self.reference_baselines is not None and len(self.baseline_history[i]) > 10:
                current_baseline = np.mean(list(self.baseline_history[i])[-10:])
                baseline_ratio = abs(current_baseline - self.reference_baselines[i]) / abs(self.reference_baselines[i] + 1e-10)
                
                if baseline_ratio > self.thresholds['baseline_drift']:
                    warnings.append({
                        'type': 'baseline_drift',
                        'severity': 'warning',
                        'message': f'基线漂移 {baseline_ratio:.1%}',
                        'value': baseline_ratio
                    })
                    status = 'warning'
            
            if self.reference_response_amplitude is not None and len(self.response_history[i]) > 20:
                current_amp = np.max(list(self.response_history[i])[-50:]) - np.min(list(self.response_history[i])[-50:])
                ref_amp = self.reference_response_amplitude[i]
                
                if ref_amp > 0:
                    amp_ratio = current_amp / ref_amp
                    
                    if amp_ratio < self.thresholds['response_degradation']:
                        warnings.append({
                            'type': 'response_degradation',
                            'severity': 'error',
                            'message': f'响应衰减 {(1-amp_ratio):.1%}',
                            'value': amp_ratio
                        })
                        status = 'error'
                    
                    if current_amp < self.thresholds['no_response'] * ref_amp:
                        warnings.append({
                            'type': 'no_response',
                            'severity': 'critical',
                            'message': '传感器无响应',
                            'value': current_amp
                        })
                        status = 'critical'
            
            if self.reference_noise_level is not None and len(self.noise_history[i]) > 20:
                current_noise = np.mean(list(self.noise_history[i])[-20:])
                noise_ratio = current_noise / (self.reference_noise_level[i] + 1e-10)
                
                if noise_ratio > self.thresholds['noise_increase']:
                    warnings.append({
                        'type': 'high_noise',
                        'severity': 'warning',
                        'message': f'噪声增加 {noise_ratio:.1f}x',
                        'value': noise_ratio
                    })
                    if status == 'normal':
                        status = 'warning'
            
            self.sensor_warnings[i] = warnings
            self.sensor_status[i] = status
        
        diagnosis_record = {
            'timestamp': datetime.now().isoformat(),
            'sensor_status': self.sensor_status.copy(),
            'overall_status': self.get_overall_status()
        }
        self.diagnosis_history.append(diagnosis_record)

    def get_diagnosis(self):
        return {
            'sensor_status': self.sensor_status,
            'sensor_warnings': self.sensor_warnings,
            'overall_status': self.get_overall_status(),
            'failed_sensors': self.get_failed_sensors(),
            'warning_sensors': self.get_warning_sensors()
        }

    def get_overall_status(self):
        if 'critical' in self.sensor_status:
            return 'critical'
        elif 'error' in self.sensor_status:
            return 'error'
        elif 'warning' in self.sensor_status:
            return 'warning'
        else:
            return 'normal'

    def get_failed_sensors(self):
        return [i for i, status in enumerate(self.sensor_status) 
                if status in ['error', 'critical']]

    def get_warning_sensors(self):
        return [i for i, status in enumerate(self.sensor_status) 
                if status == 'warning']

    def get_sensor_health_score(self, sensor_idx):
        if self.sensor_status[sensor_idx] == 'normal':
            return 100
        elif self.sensor_status[sensor_idx] == 'warning':
            return 60
        elif self.sensor_status[sensor_idx] == 'error':
            return 30
        else:
            return 0

    def get_overall_health_score(self):
        scores = [self.get_sensor_health_score(i) for i in range(self.n_sensors)]
        return int(np.mean(scores))

    def get_sensor_details(self, sensor_idx):
        details = {
            'sensor_id': sensor_idx,
            'status': self.sensor_status[sensor_idx],
            'warnings': self.sensor_warnings[sensor_idx],
            'health_score': self.get_sensor_health_score(sensor_idx)
        }
        
        if len(self.baseline_history[sensor_idx]) > 0:
            details['current_baseline'] = np.mean(list(self.baseline_history[sensor_idx])[-10:])
            if self.reference_baselines is not None:
                details['reference_baseline'] = self.reference_baselines[sensor_idx]
        
        if len(self.response_history[sensor_idx]) > 0:
            details['current_response'] = np.mean(list(self.response_history[sensor_idx])[-10:])
        
        return details

    def save_diagnosis_log(self, file_path):
        log_data = {
            'thresholds': self.thresholds,
            'reference_baselines': self.reference_baselines.tolist() if self.reference_baselines is not None else None,
            'reference_response': self.reference_response_amplitude.tolist() if self.reference_response_amplitude is not None else None,
            'diagnosis_history': self.diagnosis_history
        }
        
        with open(file_path, 'w', encoding='utf-8') as f:
            json.dump(log_data, f, indent=2, ensure_ascii=False)

    def load_diagnosis_log(self, file_path):
        with open(file_path, 'r', encoding='utf-8') as f:
            log_data = json.load(f)
        
        self.thresholds = log_data.get('thresholds', self.thresholds)
        if log_data.get('reference_baselines'):
            self.reference_baselines = np.array(log_data['reference_baselines'])
        if log_data.get('reference_response'):
            self.reference_response_amplitude = np.array(log_data['reference_response'])
        self.diagnosis_history = log_data.get('diagnosis_history', [])


class RealTimeSensorDiagnostic(SensorDiagnostic):
    def __init__(self, n_sensors=16, history_size=200):
        super().__init__(n_sensors, history_size)
        self.window_size = 50
        self.clean_air_detected = False

    def process_realtime_data(self, time, responses):
        if len(responses.shape) == 1:
            responses = responses.reshape(1, -1)
        
        n_samples = responses.shape[0]
        
        if n_samples < self.window_size:
            for i in range(self.n_sensors):
                self.response_history[i].extend(responses[:, i])
        else:
            for i in range(self.n_sensors):
                std = np.std(responses[:, i])
                mean = np.mean(responses[:, i])
                
                if std < 0.01 * abs(mean + 1e-10):
                    self.clean_air_detected = True
                    self.baseline_history[i].append(mean)
                else:
                    self.clean_air_detected = False
                    self.response_history[i].append(mean)
        
        self._diagnose()
        return self.get_diagnosis()

    def auto_calibrate_baseline(self, current_readings):
        self.reference_baselines = np.array(current_readings)
        return True

    def check_sensor_poisoning(self):
        poisoning_sensors = []
        for i in range(self.n_sensors):
            if len(self.baseline_history[i]) > 50:
                baseline_trend = np.polyfit(
                    range(len(self.baseline_history[i])),
                    list(self.baseline_history[i]),
                    1
                )[0]
                
                if abs(baseline_trend) > 0.001 and self.sensor_status[i] == 'normal':
                    poisoning_sensors.append({
                        'sensor_id': i,
                        'trend': baseline_trend,
                        'risk': 'high' if abs(baseline_trend) > 0.01 else 'medium'
                    })
        
        return poisoning_sensors
