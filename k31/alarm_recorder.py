"""
报警与记录模块 - 阈值检测、数据缓存与存储
"""
import numpy as np
import os
import time
from collections import deque
from typing import Dict, List, Tuple, Optional
from datetime import datetime
from config import SystemConfig, DEFAULT_CONFIG, CAVITATION_TYPES

class CircularBuffer:
    def __init__(self, max_samples: int, num_channels: int = 8):
        self.max_samples = max_samples
        self.num_channels = num_channels
        self.buffer = np.zeros((num_channels, max_samples), dtype=np.float64)
        self.timestamps = np.zeros(max_samples)
        self.write_index = 0
        self.total_written = 0
    
    def write(self, data: np.ndarray, timestamps: np.ndarray):
        if data.ndim == 1:
            data = data.reshape(1, -1)
        
        n_samples = data.shape[1]
        
        if n_samples > self.max_samples:
            data = data[:, -self.max_samples:]
            timestamps = timestamps[-self.max_samples:]
            n_samples = self.max_samples
        
        end_index = self.write_index + n_samples
        
        if end_index <= self.max_samples:
            self.buffer[:, self.write_index:end_index] = data
            self.timestamps[self.write_index:end_index] = timestamps
        else:
            first_part = self.max_samples - self.write_index
            self.buffer[:, self.write_index:] = data[:, :first_part]
            self.timestamps[self.write_index:] = timestamps[:first_part]
            
            remaining = n_samples - first_part
            self.buffer[:, :remaining] = data[:, first_part:]
            self.timestamps[:remaining] = timestamps[first_part:]
        
        self.write_index = (self.write_index + n_samples) % self.max_samples
        self.total_written += n_samples
    
    def get_last_n_samples(self, n_samples: int) -> Tuple[np.ndarray, np.ndarray]:
        if self.total_written == 0:
            return np.array([]), np.array([])
        
        n_samples = min(n_samples, self.max_samples, self.total_written)
        
        end_index = self.write_index
        start_index = (end_index - n_samples) % self.max_samples
        
        if start_index < end_index:
            data = self.buffer[:, start_index:end_index].copy()
            times = self.timestamps[start_index:end_index].copy()
        else:
            data = np.hstack([self.buffer[:, start_index:], self.buffer[:, :end_index]])
            times = np.hstack([self.timestamps[start_index:], self.timestamps[:end_index]])
        
        return data, times
    
    def get_time_range(self, start_time: float, end_time: float) -> Tuple[np.ndarray, np.ndarray]:
        if self.total_written == 0:
            return np.array([]), np.array([])
        
        valid_indices = (self.timestamps >= start_time) & (self.timestamps <= end_time)
        
        if np.any(valid_indices):
            data = self.buffer[:, valid_indices].copy()
            times = self.timestamps[valid_indices].copy()
            sort_idx = np.argsort(times)
            return data[:, sort_idx], times[sort_idx]
        
        return np.array([]), np.array([])

class AlarmManager:
    def __init__(self, config: SystemConfig = DEFAULT_CONFIG):
        self.config = config
        self.thresholds = config.thresholds
        
        self.alarm_history = []
        self.active_alarms = set()
        self.alarm_cooldown = {}
        self.cooldown_period = 10.0
        
        self.pre_alarm_duration = config.pre_alarm_duration
        self.post_alarm_duration = config.post_alarm_duration
        self.sample_rate = config.hydrophone.sample_rate
        self.num_channels = config.hydrophone.num_hydrophones
        
        buffer_duration = config.buffer_duration
        buffer_samples = int(buffer_duration * self.sample_rate)
        self.data_buffer = CircularBuffer(buffer_samples, self.num_channels)
        
        self.is_recording = False
        self.recording_start_time = None
        self.recording_end_time = None
        self.pending_alarm = None
    
    def check_thresholds(self, detection_result: dict, severity_result: dict) -> List[Dict]:
        current_time = time.time()
        triggered_alarms = []
        
        noise_level = detection_result.get('noise_level_db', 0)
        if noise_level > self.thresholds.noise_level:
            alarm_key = 'high_noise'
            if self._check_cooldown(alarm_key, current_time):
                triggered_alarms.append({
                    'type': 'high_noise',
                    'level': 'warning' if noise_level < 170 else 'critical',
                    'value': noise_level,
                    'threshold': self.thresholds.noise_level,
                    'message': f'噪声级超标: {noise_level:.1f} dB > {self.thresholds.noise_level} dB'
                })
                self._reset_cooldown(alarm_key, current_time)
        
        kurtosis = detection_result.get('kurtosis', 0)
        if kurtosis > self.thresholds.kurtosis:
            alarm_key = 'high_kurtosis'
            if self._check_cooldown(alarm_key, current_time):
                triggered_alarms.append({
                    'type': 'high_kurtosis',
                    'level': 'warning' if kurtosis < 8 else 'critical',
                    'value': kurtosis,
                    'threshold': self.thresholds.kurtosis,
                    'message': f'峰度超标: {kurtosis:.2f} > {self.thresholds.kurtosis}'
                })
                self._reset_cooldown(alarm_key, current_time)
        
        is_cavitating = detection_result.get('is_cavitating', False)
        confidence = detection_result.get('confidence', 0)
        if is_cavitating and confidence > 0.5:
            alarm_key = 'cavitation_detected'
            if self._check_cooldown(alarm_key, current_time):
                severity = severity_result.get('severity_level', '轻微')
                triggered_alarms.append({
                    'type': 'cavitation_detected',
                    'level': 'warning' if severity in ['轻微', '中等'] else 'critical',
                    'value': confidence,
                    'threshold': 0.5,
                    'message': f'检测到空化现象: {severity}, 置信度: {confidence:.2%}'
                })
                self._reset_cooldown(alarm_key, current_time)
        
        sigma_ratio = severity_result.get('sigma_ratio', 0)
        if sigma_ratio < 1.0:
            alarm_key = 'low_sigma_ratio'
            if self._check_cooldown(alarm_key, current_time):
                triggered_alarms.append({
                    'type': 'low_sigma_ratio',
                    'level': 'warning' if sigma_ratio > 0.8 else 'critical',
                    'value': sigma_ratio,
                    'threshold': 1.0,
                    'message': f'空化数比低于临界值: σ/σ_c = {sigma_ratio:.3f} < 1.0'
                })
                self._reset_cooldown(alarm_key, current_time)
        
        return triggered_alarms
    
    def _check_cooldown(self, alarm_key: str, current_time: float) -> bool:
        if alarm_key not in self.alarm_cooldown:
            return True
        return (current_time - self.alarm_cooldown[alarm_key]) > self.cooldown_period
    
    def _reset_cooldown(self, alarm_key: str, current_time: float):
        self.alarm_cooldown[alarm_key] = current_time
    
    def update_buffer(self, signals: np.ndarray, conditions: dict):
        n_samples = signals.shape[1] if signals.ndim > 1 else len(signals)
        timestamps = conditions.get('timestamp', time.time()) + np.arange(n_samples) / self.sample_rate
        
        if signals.ndim == 1:
            signals = signals.reshape(1, -1)
        
        if signals.shape[0] != self.num_channels:
            if signals.shape[0] < self.num_channels:
                padded = np.zeros((self.num_channels, signals.shape[1]))
                padded[:signals.shape[0], :] = signals
                signals = padded
            else:
                signals = signals[:self.num_channels, :]
        
        self.data_buffer.write(signals, timestamps)
    
    def trigger_recording(self, alarm_time: float) -> Dict:
        if self.is_recording:
            return {}
        
        self.is_recording = True
        self.recording_start_time = alarm_time - self.pre_alarm_duration
        self.recording_end_time = alarm_time + self.post_alarm_duration
        
        data, timestamps = self.data_buffer.get_time_range(
            self.recording_start_time, alarm_time
        )
        
        recording_info = {
            'start_time': self.recording_start_time,
            'end_time': self.recording_end_time,
            'trigger_time': alarm_time,
            'pre_alarm_duration': self.pre_alarm_duration,
            'post_alarm_duration': self.post_alarm_duration,
            'pre_alarm_data': data,
            'pre_alarm_timestamps': timestamps,
            'post_alarm_data': None,
            'post_alarm_timestamps': None,
            'is_complete': False
        }
        
        self.pending_alarm = recording_info
        
        return recording_info
    
    def update_recording(self, current_time: float) -> Optional[Dict]:
        if not self.is_recording or self.pending_alarm is None:
            return None
        
        if current_time >= self.recording_end_time:
            data, timestamps = self.data_buffer.get_time_range(
                self.pending_alarm['trigger_time'], self.recording_end_time
            )
            
            self.pending_alarm['post_alarm_data'] = data
            self.pending_alarm['post_alarm_timestamps'] = timestamps
            self.pending_alarm['is_complete'] = True
            
            complete_recording = self.pending_alarm
            self.pending_alarm = None
            self.is_recording = False
            
            return complete_recording
        
        return None

class DataRecorder:
    def __init__(self, config: SystemConfig = DEFAULT_CONFIG, output_dir: str = 'records'):
        self.config = config
        self.output_dir = output_dir
        self._ensure_output_dir()
        
        self.session_id = datetime.now().strftime('%Y%m%d_%H%M%S')
        self.alarm_records_dir = os.path.join(output_dir, f'alarm_{self.session_id}')
        self._ensure_dir(self.alarm_records_dir)
        
        self.event_log_file = os.path.join(output_dir, f'event_log_{self.session_id}.csv')
        self._init_event_log()
    
    def _ensure_output_dir(self):
        if not os.path.exists(self.output_dir):
            os.makedirs(self.output_dir)
    
    def _ensure_dir(self, dir_path: str):
        if not os.path.exists(dir_path):
            os.makedirs(dir_path)
    
    def _init_event_log(self):
        if not os.path.exists(self.event_log_file):
            with open(self.event_log_file, 'w', encoding='utf-8') as f:
                f.write('时间,报警类型,级别,数值,阈值,消息\n')
    
    def log_event(self, alarm: Dict):
        timestamp = datetime.now().strftime('%Y-%m-%d %H:%M:%S')
        with open(self.event_log_file, 'a', encoding='utf-8') as f:
            f.write(f"{timestamp},{alarm['type']},{alarm['level']},{alarm['value']:.2f},{alarm['threshold']},\"{alarm['message']}\"\n")
    
    def save_recording(self, recording: Dict, detection_result: Dict = None, 
                       classification_result: Dict = None, severity_result: Dict = None) -> str:
        alarm_id = datetime.now().strftime('%Y%m%d_%H%M%S')
        alarm_dir = os.path.join(self.alarm_records_dir, alarm_id)
        self._ensure_dir(alarm_dir)
        
        data_file = os.path.join(alarm_dir, 'cavitation_data.npz')
        
        pre_data = recording.get('pre_alarm_data', np.array([]))
        pre_times = recording.get('pre_alarm_timestamps', np.array([]))
        post_data = recording.get('post_alarm_data', np.array([]))
        post_times = recording.get('post_alarm_timestamps', np.array([]))
        
        np.savez(
            data_file,
            pre_alarm_data=pre_data,
            pre_alarm_timestamps=pre_times,
            post_alarm_data=post_data,
            post_alarm_timestamps=post_times,
            trigger_time=recording['trigger_time'],
            config=self.config_to_dict()
        )
        
        info_file = os.path.join(alarm_dir, 'alarm_info.txt')
        with open(info_file, 'w', encoding='utf-8') as f:
            f.write(f"空化报警记录 - {alarm_id}\n")
            f.write("=" * 50 + "\n\n")
            f.write(f"触发时间: {datetime.fromtimestamp(recording['trigger_time'])}\n")
            f.write(f"预录时长: {recording['pre_alarm_duration']} 秒\n")
            f.write(f"后录时长: {recording['post_alarm_duration']} 秒\n\n")
            
            if detection_result:
                f.write("检测结果:\n")
                f.write(f"  是否空化: {detection_result.get('is_cavitating', False)}\n")
                f.write(f"  置信度: {detection_result.get('confidence', 0):.2%}\n")
                f.write(f"  噪声级: {detection_result.get('noise_level_db', 0):.1f} dB\n")
                f.write(f"  峰度: {detection_result.get('kurtosis', 0):.2f}\n\n")
            
            if classification_result:
                f.write("类型识别:\n")
                f.write(f"  空化类型: {classification_result.get('class_name', '未知')}\n")
                f.write(f"  类型置信度: {classification_result.get('confidence', 0):.2%}\n\n")
            
            if severity_result:
                f.write("强度评估:\n")
                f.write(f"  严重程度: {severity_result.get('severity_level', '未知')}\n")
                f.write(f"  严重度分数: {severity_result.get('severity_score', 0):.3f}\n")
                f.write(f"  空化数 σ: {severity_result.get('cavitation_number', 0):.3f}\n")
                f.write(f"  临界空化数 σ_c: {severity_result.get('critical_cavitation_number', 0):.3f}\n")
                f.write(f"  σ/σ_c: {severity_result.get('sigma_ratio', 0):.3f}\n")
                f.write(f"  噪声增量: {severity_result.get('noise_increment_db', 0):.1f} dB\n")
                f.write(f"  建议: {severity_result.get('recommendation', '')}\n")
        
        return alarm_dir
    
    def config_to_dict(self) -> Dict:
        return {
            'sample_rate': self.config.hydrophone.sample_rate,
            'num_hydrophones': self.config.hydrophone.num_hydrophones,
            'adc_bits': self.config.hydrophone.adc_bits,
            'propeller_diameter': self.config.propeller.diameter,
            'num_blades': self.config.propeller.num_blades,
            'skew_angle': self.config.propeller.skew_angle,
            'rake_angle': self.config.propeller.rake_angle
        }
    
    def get_event_log(self) -> str:
        return self.event_log_file
    
    def get_alarm_records_dir(self) -> str:
        return self.alarm_records_dir

class AlarmAndRecordingManager:
    def __init__(self, config: SystemConfig = DEFAULT_CONFIG, output_dir: str = 'records'):
        self.config = config
        self.alarm_manager = AlarmManager(config)
        self.data_recorder = DataRecorder(config, output_dir)
    
    def process(self, signals: np.ndarray, conditions: dict, 
                detection_result: dict, classification_result: dict,
                severity_result: dict) -> Dict:
        current_time = conditions.get('timestamp', time.time())
        
        self.alarm_manager.update_buffer(signals, conditions)
        
        alarms = self.alarm_manager.check_thresholds(detection_result, severity_result)
        
        result = {
            'alarms': alarms,
            'recording_saved': None,
            'is_recording': self.alarm_manager.is_recording
        }
        
        if alarms and not self.alarm_manager.is_recording:
            for alarm in alarms:
                if alarm['level'] == 'critical':
                    recording_info = self.alarm_manager.trigger_recording(current_time)
                    result['recording_started'] = recording_info
                    break
        
        if self.alarm_manager.is_recording:
            complete_recording = self.alarm_manager.update_recording(current_time)
            if complete_recording and complete_recording['is_complete']:
                save_path = self.data_recorder.save_recording(
                    complete_recording, detection_result, 
                    classification_result, severity_result
                )
                result['recording_saved'] = save_path
        
        for alarm in alarms:
            self.data_recorder.log_event(alarm)
        
        return result
