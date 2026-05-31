import numpy as np
import time
from threading import Thread, Lock
from PyQt5.QtCore import QObject, pyqtSignal, QTimer
from utils.data_generator import SyntheticDataGenerator

class RealTimeAcquisition(QObject):
    data_received = pyqtSignal(np.ndarray, np.ndarray)
    acquisition_started = pyqtSignal()
    acquisition_stopped = pyqtSignal()
    prediction_result = pyqtSignal(list)

    def __init__(self, n_sensors=16, sampling_rate=50, max_display_points=500, display_fps=30):
        super().__init__()
        self.n_sensors = n_sensors
        self.sampling_rate = sampling_rate
        self.is_running = False
        self.data_lock = Lock()
        self.current_data = None
        self.time_buffer = None
        self.response_buffer = None
        self.buffer_size = sampling_rate * 120
        self.classifier = None
        self.feature_extractor = None
        self.data_generator = SyntheticDataGenerator(
            n_sensors=n_sensors,
            sampling_rate=sampling_rate,
            duration=120
        )
        self.simulated_odor = None
        self.sample_count = 0
        
        self.max_display_points = max_display_points
        self.display_fps = display_fps
        self.display_interval = 1000 // display_fps
        
        self.display_timer = QTimer(self)
        self.display_timer.timeout.connect(self._emit_display_data)
        self.last_emit_time = 0
        
        self.prediction_interval = 5000
        self.last_prediction_time = 0

    def set_classifier(self, classifier):
        self.classifier = classifier

    def set_feature_extractor(self, extractor):
        self.feature_extractor = extractor

    def set_simulated_odor(self, odor_class):
        self.simulated_odor = odor_class

    def start_acquisition(self, use_simulation=True):
        if self.is_running:
            return
        
        self.is_running = True
        self.sample_count = 0
        self.time_buffer = np.zeros(self.buffer_size)
        self.response_buffer = np.zeros((self.buffer_size, self.n_sensors))
        self.last_emit_time = 0
        self.last_prediction_time = 0
        
        self.display_timer.start(self.display_interval)
        self.acquisition_started.emit()
        
        if use_simulation:
            self.thread = Thread(target=self._simulation_loop, daemon=True)
        else:
            self.thread = Thread(target=self._hardware_loop, daemon=True)
        
        self.thread.start()

    def stop_acquisition(self):
        self.is_running = False
        self.display_timer.stop()
        if hasattr(self, 'thread'):
            self.thread.join(timeout=2.0)
        self.acquisition_stopped.emit()

    def _simulation_loop(self):
        interval = 1.0 / self.sampling_rate
        time_idx = 0
        
        odor_class = self.simulated_odor or '咖啡'
        time_full, responses_full = self.data_generator.generate_response_curve(odor_class)
        
        while self.is_running and time_idx < len(time_full):
            current_time = time_full[time_idx]
            current_responses = responses_full[time_idx, :]
            
            with self.data_lock:
                if self.sample_count < self.buffer_size:
                    self.time_buffer[self.sample_count] = current_time
                    self.response_buffer[self.sample_count, :] = current_responses
                    self.sample_count += 1
            
            current_time_ms = int(time.time() * 1000)
            if current_time_ms - self.last_prediction_time > self.prediction_interval:
                self._make_prediction()
                self.last_prediction_time = current_time_ms
            
            time_idx += 1
            time.sleep(interval * 0.05)
        
        self.stop_acquisition()

    def _hardware_loop(self):
        import serial
        try:
            ser = serial.Serial('COM3', 9600, timeout=0.01)
            
            while self.is_running:
                if ser.in_waiting:
                    line = ser.readline().decode().strip()
                    try:
                        values = list(map(float, line.split(',')))
                        if len(values) >= self.n_sensors:
                            current_time = self.sample_count / self.sampling_rate
                            current_responses = np.array(values[:self.n_sensors])
                            
                            with self.data_lock:
                                if self.sample_count < self.buffer_size:
                                    self.time_buffer[self.sample_count] = current_time
                                    self.response_buffer[self.sample_count, :] = current_responses
                                    self.sample_count += 1
                            
                            current_time_ms = int(time.time() * 1000)
                            if current_time_ms - self.last_prediction_time > self.prediction_interval:
                                self._make_prediction()
                                self.last_prediction_time = current_time_ms
                    except ValueError:
                        pass
                
                time.sleep(0.001)
            
            ser.close()
        except Exception as e:
            print(f"Hardware connection error: {e}")
            self._simulation_loop()

    def _emit_display_data(self):
        with self.data_lock:
            if self.sample_count == 0:
                return
            
            times = self.time_buffer[:self.sample_count]
            responses = self.response_buffer[:self.sample_count, :]
            
            n_points = len(times)
            if n_points > self.max_display_points:
                stride = n_points // self.max_display_points
                indices = np.arange(0, n_points, stride)
                if len(indices) > self.max_display_points:
                    indices = indices[:self.max_display_points]
                times_display = times[indices]
                responses_display = responses[indices, :]
            else:
                times_display = times.copy()
                responses_display = responses.copy()
            
            self.data_received.emit(times_display, responses_display)

    def _make_prediction(self):
        if self.classifier is None or self.feature_extractor is None:
            return
        
        with self.data_lock:
            if self.sample_count < self.sampling_rate * 10:
                return
            
            n_pred_points = min(self.sample_count, self.sampling_rate * 60)
            times = self.time_buffer[self.sample_count - n_pred_points:self.sample_count].copy()
            responses = self.response_buffer[self.sample_count - n_pred_points:self.sample_count, :].copy()
        
        try:
            features = self.feature_extractor.extract_feature_matrix(times, responses)
            top3 = self.classifier.predict_top3(features)
            self.prediction_result.emit(top3[0])
        except Exception as e:
            print(f"Prediction error: {e}")

    def get_current_data(self):
        with self.data_lock:
            if self.sample_count == 0:
                return None, None
            return (self.time_buffer[:self.sample_count].copy(),
                    self.response_buffer[:self.sample_count, :].copy())

    def is_acquiring(self):
        return self.is_running
