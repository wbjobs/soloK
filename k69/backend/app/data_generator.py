import numpy as np
import pandas as pd
from datetime import datetime, timedelta
from typing import List, Dict
import random

class SeismicDataGenerator:
    def __init__(self, sampling_rate: int = 10000):
        self.sampling_rate = sampling_rate

    def _generate_background_noise(self, n_samples: int) -> np.ndarray:
        noise = np.random.normal(0, 0.1, n_samples)
        decay = np.exp(-np.arange(n_samples) / (n_samples * 0.3))
        return noise * (1 + 0.5 * decay)

    def _generate_seismic_wave(self, n_samples: int, magnitude: float = 1.0) -> np.ndarray:
        t = np.linspace(0, 10, n_samples)
        freq1 = 2 + np.random.normal(0, 0.5)
        freq2 = 5 + np.random.normal(0, 1)
        wave1 = np.sin(2 * np.pi * freq1 * t) * np.exp(-t / 3)
        wave2 = 0.5 * np.sin(2 * np.pi * freq2 * t) * np.exp(-t / 2)
        envelope = 1 / (1 + np.exp(-(t - 1) * 2)) * (1 - 1 / (1 + np.exp(-(t - 8) * 2)))
        return (wave1 + wave2) * envelope * magnitude

    def _add_anomalies(self, data: np.ndarray, anomaly_rate: float = 0.001) -> np.ndarray:
        n_anomalies = int(len(data) * anomaly_rate)
        anomaly_indices = np.random.choice(len(data), n_anomalies, replace=False)
        for idx in anomaly_indices:
            anomaly_type = random.choice(['spike', 'dip', 'burst'])
            if anomaly_type == 'spike':
                data[idx] = data[idx] + np.random.uniform(3, 6) * np.std(data)
            elif anomaly_type == 'dip':
                data[idx] = data[idx] - np.random.uniform(3, 6) * np.std(data)
            elif anomaly_type == 'burst':
                end_idx = min(idx + 50, len(data))
                data[idx:end_idx] = data[idx:end_idx] + np.random.uniform(2, 4) * np.std(data)
        return data

    def generate_minute_data(self, base_time: datetime, has_event: bool = False) -> List[Dict]:
        n_samples = self.sampling_rate
        timestamps = [base_time + timedelta(milliseconds=i * 60000 // n_samples) for i in range(n_samples)]
        if has_event:
            magnitude = np.random.uniform(0.8, 2.5)
            wave_data = self._generate_seismic_wave(n_samples, magnitude)
        else:
            wave_data = self._generate_background_noise(n_samples)
        wave_data = self._add_anomalies(wave_data, anomaly_rate=0.0005)
        data_points = []
        for ts, amp in zip(timestamps, wave_data):
            data_points.append({
                "timestamp": int(ts.timestamp() * 1000),
                "amplitude": float(amp)
            })
        return data_points

    def generate_month_data(self, start_date: datetime, event_probability: float = 0.15) -> List[Dict]:
        all_data = []
        end_date = start_date + timedelta(days=30)
        current_time = start_date
        total_minutes = (end_date - start_date).days * 24 * 60
        minute_count = 0
        while current_time < end_date:
            has_event = random.random() < event_probability
            minute_data = self.generate_minute_data(current_time, has_event)
            all_data.extend(minute_data)
            current_time += timedelta(minutes=1)
            minute_count += 1
            if minute_count % 100 == 0:
                print(f"Generated {minute_count}/{total_minutes} minutes of data...")
        return all_data

    def save_to_csv(self, data: List[Dict], filename: str):
        df = pd.DataFrame(data)
        df['timestamp'] = pd.to_datetime(df['timestamp'], unit='ms')
        df.to_csv(filename, index=False)
        print(f"Data saved to {filename}")
