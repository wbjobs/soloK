import numpy as np
import pandas as pd
from datetime import datetime
from config import ODOR_CLASSES

class SyntheticDataGenerator:
    def __init__(self, n_sensors=16, sampling_rate=50, duration=90):
        self.n_sensors = n_sensors
        self.sampling_rate = sampling_rate
        self.duration = duration
        self.n_samples = int(sampling_rate * duration)

    def generate_response_curve(self, odor_class, noise_level=0.02, seed=None):
        if seed is not None:
            np.random.seed(seed)
        
        time = np.linspace(0, self.duration, self.n_samples)
        responses = np.zeros((self.n_samples, self.n_sensors))
        
        odor_idx = ODOR_CLASSES.index(odor_class) if odor_class in ODOR_CLASSES else 0
        
        for sensor_idx in range(self.n_sensors):
            base_amp = 0.5 + 0.5 * np.sin(odor_idx * 0.5 + sensor_idx * 0.3)
            rise_time = 10 + 5 * np.random.rand()
            peak_time = 30 + 10 * np.random.rand()
            decay_rate = 0.02 + 0.01 * np.random.rand()
            
            rise_phase = 1 - np.exp(-(time - 5) / rise_time)
            rise_phase[time < 5] = 0
            
            decay_phase = np.exp(-(time - peak_time) * decay_rate)
            decay_phase[time < peak_time] = 1
            
            response = base_amp * rise_phase * decay_phase
            
            noise = np.random.normal(0, noise_level, self.n_samples)
            response += noise
            
            baseline = 0.1 * np.random.rand()
            response += baseline
            
            responses[:, sensor_idx] = response
        
        return time, responses

    def generate_sample(self, odor_class, noise_level=0.02, drift=0.0, seed=None):
        time, responses = self.generate_response_curve(odor_class, noise_level, seed)
        
        if drift != 0:
            drift_factor = 1 + drift * np.random.randn(self.n_sensors)
            responses = responses * drift_factor
        
        return {
            'time': time,
            'responses': responses,
            'odor_class': odor_class,
            'sensor_count': self.n_sensors,
            'sampling_rate': self.sampling_rate,
            'duration': self.duration
        }

    def generate_dataset(self, n_samples_per_class=5, noise_level=0.02, 
                         add_drift=False, add_batch_effect=False, seed=42):
        np.random.seed(seed)
        
        dataset = []
        labels = []
        
        for class_idx, odor_class in enumerate(ODOR_CLASSES):
            for sample_idx in range(n_samples_per_class):
                drift = 0.1 * class_idx if add_drift else 0
                
                batch_date = None
                if add_batch_effect:
                    batch_day = sample_idx % 3 + 1
                    batch_date = f'2024-01-{batch_day:02d}'
                
                sample = self.generate_sample(
                    odor_class, 
                    noise_level=noise_level,
                    drift=drift,
                    seed=seed + class_idx * 100 + sample_idx
                )
                sample['batch_date'] = batch_date or datetime.now().strftime('%Y-%m-%d')
                sample['name'] = f'{odor_class}_{sample_idx+1}'
                
                dataset.append(sample)
                labels.append(odor_class)
        
        return dataset, labels

    def save_to_csv(self, sample, file_path):
        df = pd.DataFrame()
        df['time'] = sample['time']
        
        for i in range(sample['responses'].shape[1]):
            df[f'S{i+1}'] = sample['responses'][:, i]
        
        df.to_csv(file_path, index=False)
        return file_path

    def save_dataset_to_csv(self, dataset, output_dir):
        import os
        os.makedirs(output_dir, exist_ok=True)
        
        file_paths = []
        for i, sample in enumerate(dataset):
            file_name = f"{sample['name']}.csv"
            file_path = os.path.join(output_dir, file_name)
            self.save_to_csv(sample, file_path)
            file_paths.append(file_path)
        
        return file_paths
