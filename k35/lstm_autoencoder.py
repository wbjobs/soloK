import numpy as np
import torch
import torch.nn as nn
from torch.utils.data import DataLoader, TensorDataset
from typing import List, Dict, Optional, Tuple
from dataclasses import dataclass
import logging
from sklearn.preprocessing import StandardScaler
from collections import deque

from schemas import MeasurementData, AttackNode

logger = logging.getLogger(__name__)


@dataclass
class LSTMDetectionResult:
    is_attack: bool
    reconstruction_error: float
    threshold: float
    confidence: float
    suspicious_nodes: List[AttackNode]
    node_errors: Dict[int, float]


class LSTMEncoder(nn.Module):
    def __init__(self, input_size: int, hidden_size: int, latent_dim: int, num_layers: int = 2):
        super(LSTMEncoder, self).__init__()
        self.hidden_size = hidden_size
        self.num_layers = num_layers
        
        self.lstm = nn.LSTM(
            input_size=input_size,
            hidden_size=hidden_size,
            num_layers=num_layers,
            batch_first=True,
            dropout=0.2
        )
        
        self.fc = nn.Linear(hidden_size, latent_dim)
        
    def forward(self, x):
        batch_size = x.size(0)
        
        h0 = torch.zeros(self.num_layers, batch_size, self.hidden_size).to(x.device)
        c0 = torch.zeros(self.num_layers, batch_size, self.hidden_size).to(x.device)
        
        out, (hn, _) = self.lstm(x, (h0, c0))
        
        latent = self.fc(out[:, -1, :])
        
        return latent


class LSTMDecoder(nn.Module):
    def __init__(self, latent_dim: int, hidden_size: int, output_size: int, 
                 sequence_length: int, num_layers: int = 2):
        super(LSTMDecoder, self).__init__()
        self.hidden_size = hidden_size
        self.num_layers = num_layers
        self.sequence_length = sequence_length
        
        self.fc_latent = nn.Linear(latent_dim, hidden_size)
        
        self.lstm = nn.LSTM(
            input_size=hidden_size,
            hidden_size=hidden_size,
            num_layers=num_layers,
            batch_first=True,
            dropout=0.2
        )
        
        self.fc_out = nn.Linear(hidden_size, output_size)
        
    def forward(self, z):
        batch_size = z.size(0)
        
        h0 = torch.zeros(self.num_layers, batch_size, self.hidden_size).to(z.device)
        c0 = torch.zeros(self.num_layers, batch_size, self.hidden_size).to(z.device)
        
        z_expanded = self.fc_latent(z).unsqueeze(1)
        z_repeated = z_expanded.repeat(1, self.sequence_length, 1)
        
        out, _ = self.lstm(z_repeated, (h0, c0))
        
        output = self.fc_out(out)
        
        return output


class LSTMAutoencoder(nn.Module):
    def __init__(self, input_size: int, hidden_size: int, latent_dim: int, 
                 sequence_length: int, num_layers: int = 2):
        super(LSTMAutoencoder, self).__init__()
        self.encoder = LSTMEncoder(input_size, hidden_size, latent_dim, num_layers)
        self.decoder = LSTMDecoder(latent_dim, hidden_size, input_size, sequence_length, num_layers)
        
    def forward(self, x):
        z = self.encoder(x)
        x_reconstructed = self.decoder(z)
        return x_reconstructed


class _EWMATracker:
    def __init__(self, alpha: float = 0.05, min_samples: int = 50):
        self.alpha = alpha
        self.min_samples = min_samples
        self.mean = None
        self.var = None
        self.n = 0

    def update(self, value: float):
        self.n += 1
        if self.mean is None:
            self.mean = value
            self.var = 0.0
        else:
            diff = value - self.mean
            self.mean = self.mean + self.alpha * diff
            self.var = (1 - self.alpha) * (self.var + self.alpha * diff * diff)

    @property
    def std(self) -> float:
        return max(np.sqrt(self.var) if self.var is not None else 1e-6, 1e-10)

    @property
    def is_ready(self) -> bool:
        return self.n >= self.min_samples


class LSTMAnomalyDetector:
    def __init__(self, n_nodes: int, sequence_length: int = 20, 
                 hidden_size: int = 64, latent_dim: int = 32,
                 threshold_std: float = 3.0, device: str = "cpu",
                 detrend_window: int = 12, ewma_alpha: float = 0.05,
                 relative_error: bool = True):
        self.n_nodes = n_nodes
        self.sequence_length = sequence_length
        self.hidden_size = hidden_size
        self.latent_dim = latent_dim
        self.threshold_std = threshold_std
        self.device = torch.device(device if torch.cuda.is_available() else "cpu")
        self.detrend_window = detrend_window
        self.ewma_alpha = ewma_alpha
        self.relative_error = relative_error
        
        self.input_size = 4
        self.model = LSTMAutoencoder(
            input_size=self.input_size,
            hidden_size=hidden_size,
            latent_dim=latent_dim,
            sequence_length=sequence_length
        ).to(self.device)
        
        self.scaler = StandardScaler()
        self.threshold = None
        self.baseline_errors = []
        self.is_trained = False
        
        self.measurement_types = ['voltage_magnitude', 'voltage_angle', 
                                  'active_power', 'reactive_power']
        
        self._ewma_tracker = _EWMATracker(alpha=ewma_alpha)
        self._node_ewma: Dict[int, _EWMATracker] = {}
        self._running_node_stats: Dict[str, deque] = {}
        
    def _detrend_data(self, data: np.ndarray, window: Optional[int] = None) -> np.ndarray:
        if window is None:
            window = self.detrend_window
        
        if data.ndim == 2:
            n_samples, n_features = data.shape
            detrended = np.zeros_like(data)
            
            for f in range(n_features):
                series = data[:, f]
                if n_samples < window:
                    detrended[:, f] = series - np.mean(series)
                else:
                    kernel = np.ones(window) / window
                    trend = np.convolve(series, kernel, mode='same')
                    edge_half = window // 2
                    if edge_half > 0:
                        trend[:edge_half] = np.mean(series[:window])
                        trend[-edge_half:] = np.mean(series[-window:])
                    detrended[:, f] = series - trend
            
            return detrended
        
        elif data.ndim == 3:
            result = np.zeros_like(data)
            for node_idx in range(data.shape[1]):
                result[:, node_idx, :] = self._detrend_data(data[:, node_idx, :], window)
            return result
        
        return data
    
    def _sliding_window_normalize(self, data: np.ndarray, window: Optional[int] = None) -> np.ndarray:
        if window is None:
            window = self.detrend_window
        
        if data.ndim == 2:
            n_samples, n_features = data.shape
            normalized = np.zeros_like(data)
            
            for f in range(n_features):
                series = data[:, f]
                if n_samples < window:
                    w_mean = np.mean(series)
                    w_std = np.std(series) if np.std(series) > 1e-10 else 1.0
                else:
                    w_mean = np.mean(series[-window:])
                    w_std = np.std(series[-window:])
                    w_std = w_std if w_std > 1e-10 else 1.0
                normalized[:, f] = (series - w_mean) / w_std
            
            return normalized
        
        elif data.ndim == 3:
            result = np.zeros_like(data)
            for node_idx in range(data.shape[1]):
                result[:, node_idx, :] = self._sliding_window_normalize(
                    data[:, node_idx, :], window)
            return result
        
        return data

    def _preprocess_measurements(self, measurements: List[MeasurementData]) -> np.ndarray:
        n_nodes = len(measurements)
        features = np.zeros((n_nodes, 4))
        
        for i, m in enumerate(measurements):
            features[i] = [m.voltage_magnitude, m.voltage_angle, 
                          m.active_power, m.reactive_power]
        
        return features
    
    def _build_sequences(self, data_history: List[np.ndarray]) -> np.ndarray:
        if len(data_history) < self.sequence_length:
            padding = [data_history[0]] * (self.sequence_length - len(data_history))
            data_history = padding + data_history
        
        sequences = []
        for i in range(len(data_history) - self.sequence_length + 1):
            seq = data_history[i:i + self.sequence_length]
            sequences.append(seq)
        
        return np.array(sequences)
    
    def _compute_relative_error(self, reconstructed: torch.Tensor, 
                                 original: torch.Tensor,
                                 measurements: Optional[List[MeasurementData]] = None) -> torch.Tensor:
        abs_error = (reconstructed - original) ** 2
        
        if measurements is not None:
            scales = []
            for m in measurements:
                scale = max(abs(m.voltage_magnitude), abs(m.active_power), 
                           abs(m.reactive_power), 1e-6)
                scales.append(scale)
            scale_tensor = torch.tensor(scales, dtype=torch.float32).to(original.device)
            scale_tensor = scale_tensor.unsqueeze(0).unsqueeze(2)
            scaled_error = abs_error / (scale_tensor ** 2 + 1e-10)
        else:
            signal_energy = original ** 2
            signal_energy = torch.clamp(signal_energy, min=1e-6)
            scaled_error = abs_error / signal_energy
        
        return scaled_error
    
    def fit(self, data_history: List[List[MeasurementData]], 
            epochs: int = 50, batch_size: int = 32, learning_rate: float = 1e-3):
        
        processed_data = []
        for measurements in data_history:
            features = self._preprocess_measurements(measurements)
            processed_data.append(features)
        
        processed_data = np.array(processed_data)
        n_samples, n_nodes, n_features = processed_data.shape
        
        detrended_data = self._detrend_data(processed_data)
        normalized_data = self._sliding_window_normalize(detrended_data)
        
        flattened = normalized_data.reshape(-1, n_features)
        self.scaler.fit(flattened)
        
        scaled_data = self.scaler.transform(flattened).reshape(n_samples, n_nodes, n_features)
        
        sequences = []
        for node_idx in range(n_nodes):
            node_data = scaled_data[:, node_idx, :]
            for i in range(len(node_data) - self.sequence_length + 1):
                seq = node_data[i:i + self.sequence_length]
                sequences.append(seq)
        
        sequences = np.array(sequences)
        
        X = torch.tensor(sequences, dtype=torch.float32).to(self.device)
        dataset = TensorDataset(X, X)
        dataloader = DataLoader(dataset, batch_size=batch_size, shuffle=True)
        
        optimizer = torch.optim.Adam(self.model.parameters(), lr=learning_rate)
        criterion = nn.MSELoss()
        
        self.model.train()
        for epoch in range(epochs):
            total_loss = 0
            for batch_X, _ in dataloader:
                optimizer.zero_grad()
                outputs = self.model(batch_X)
                loss = criterion(outputs, batch_X)
                loss.backward()
                optimizer.step()
                total_loss += loss.item()
            
            avg_loss = total_loss / len(dataloader)
            if (epoch + 1) % 10 == 0:
                logger.info(f"Epoch {epoch+1}/{epochs}, Loss: {avg_loss:.6f}")
        
        self.model.eval()
        with torch.no_grad():
            outputs = self.model(X)
            if self.relative_error:
                errors = torch.mean(
                    self._compute_relative_error(outputs, X), dim=(1, 2)
                ).cpu().numpy()
            else:
                errors = torch.mean((outputs - X) ** 2, dim=(1, 2)).cpu().numpy()
        
        self.baseline_errors = errors.tolist()
        mean_error = np.mean(errors)
        std_error = np.std(errors)
        self.threshold = mean_error + self.threshold_std * std_error
        self.is_trained = True
        
        self._ewma_tracker = _EWMATracker(alpha=self.ewma_alpha)
        for err in self.baseline_errors:
            self._ewma_tracker.update(err)
        
        logger.info(f"Training complete. Threshold: {self.threshold:.6f}")
        
        return {
            'mean_error': float(mean_error),
            'std_error': float(std_error),
            'threshold': float(self.threshold)
        }
    
    def _get_adaptive_threshold(self) -> float:
        if self._ewma_tracker.is_ready:
            ewma_threshold = self._ewma_tracker.mean + self.threshold_std * self._ewma_tracker.std
            if self.threshold is not None and self.threshold > 0:
                return max(self.threshold, ewma_threshold)
            return ewma_threshold
        return self.threshold if self.threshold is not None else 0.1
    
    def detect(self, measurements: List[MeasurementData],
               data_history: Optional[List[List[MeasurementData]]] = None) -> LSTMDetectionResult:
        
        if data_history is None:
            data_history = []
        
        current_features = self._preprocess_measurements(measurements)
        n_nodes = current_features.shape[0]
        
        if self.threshold is None:
            self.threshold = 0.1
        
        processed_history = []
        for hist in data_history:
            features = self._preprocess_measurements(hist)
            processed_history.append(features)
        processed_history.append(current_features)
        
        history_array = np.array(processed_history)
        detrended = self._detrend_data(history_array)
        normalized = self._sliding_window_normalize(detrended)
        
        scaled_data = []
        for i in range(normalized.shape[0]):
            data = normalized[i]
            flattened = data.reshape(-1, 4)
            if self.is_trained:
                scaled = self.scaler.transform(flattened)
            else:
                scaled = flattened
            scaled_data.append(scaled.reshape(data.shape))
        
        scaled_data = np.array(scaled_data)
        
        effective_threshold = self._get_adaptive_threshold()
        
        self.model.eval()
        node_errors = {}
        all_sequence_errors = []
        
        with torch.no_grad():
            for node_idx in range(n_nodes):
                node_data = scaled_data[:, node_idx, :]
                
                if len(node_data) >= self.sequence_length:
                    seq = node_data[-self.sequence_length:]
                else:
                    padding = np.zeros((self.sequence_length - len(node_data), 4))
                    seq = np.vstack([padding, node_data])
                
                X = torch.tensor(seq[np.newaxis, :, :], dtype=torch.float32).to(self.device)
                X_reconstructed = self.model(X)
                
                if self.relative_error:
                    node_meas = [measurements[node_idx]] if node_idx < len(measurements) else None
                    error = torch.mean(
                        self._compute_relative_error(X_reconstructed, X, node_meas),
                        dim=(1, 2)
                    ).cpu().numpy()[0]
                else:
                    error = torch.mean((X_reconstructed - X) ** 2, dim=(1, 2)).cpu().numpy()[0]
                
                node_errors[measurements[node_idx].node_id] = float(error)
                all_sequence_errors.append(error)
        
        avg_reconstruction_error = np.mean(all_sequence_errors) if all_sequence_errors else 0.0
        
        self._ewma_tracker.update(avg_reconstruction_error)
        for node_id, err in node_errors.items():
            if node_id not in self._node_ewma:
                self._node_ewma[node_id] = _EWMATracker(alpha=self.ewma_alpha, min_samples=20)
            self._node_ewma[node_id].update(err)
        
        if effective_threshold is not None and effective_threshold > 0:
            is_attack = avg_reconstruction_error > effective_threshold
            if is_attack:
                ratio = avg_reconstruction_error / effective_threshold
                confidence = min(1.0, 0.5 + 0.5 * (ratio - 1.0) / max(ratio, 1.0))
            else:
                ratio = avg_reconstruction_error / effective_threshold
                confidence = 1.0 - min(1.0, ratio * 0.5)
        else:
            is_attack = avg_reconstruction_error > 0.1
            confidence = 0.5 + min(0.5, avg_reconstruction_error)
        
        suspicious_nodes = self._locate_suspicious_nodes(node_errors, measurements, effective_threshold)
        
        return LSTMDetectionResult(
            is_attack=is_attack,
            reconstruction_error=float(avg_reconstruction_error),
            threshold=float(effective_threshold) if effective_threshold is not None else 0.1,
            confidence=float(confidence),
            suspicious_nodes=suspicious_nodes,
            node_errors=node_errors
        )
    
    def _locate_suspicious_nodes(self, node_errors: Dict[int, float],
                                  measurements: List[MeasurementData],
                                  effective_threshold: Optional[float] = None) -> List[AttackNode]:
        suspicious_nodes = []
        
        if not node_errors:
            return suspicious_nodes
        
        errors = np.array(list(node_errors.values()))
        mean_err = np.mean(errors)
        std_err = np.std(errors) if len(errors) > 1 else 1.0
        
        threshold_for_compare = effective_threshold if effective_threshold is not None else self.threshold
        
        for m in measurements:
            node_id = m.node_id
            error = node_errors.get(node_id, 0.0)
            
            z_score = (error - mean_err) / max(std_err, 1e-10)
            
            node_ewma = self._node_ewma.get(node_id)
            node_ewma_outlier = False
            if node_ewma and node_ewma.is_ready:
                node_adaptive_threshold = node_ewma.mean + self.threshold_std * node_ewma.std
                if error > node_adaptive_threshold:
                    node_ewma_outlier = True
            
            abs_threshold_exceeded = threshold_for_compare and error > (threshold_for_compare * 0.8)
            z_score_exceeded = z_score > 2.0
            
            if (z_score_exceeded and node_ewma_outlier) or abs_threshold_exceeded:
                suspicious_index = min(1.0, (z_score / 3.0 + 0.5))
                
                if threshold_for_compare and threshold_for_compare > 0:
                    suspicious_index = max(suspicious_index, 
                                          error / (threshold_for_compare + 1e-10))
                suspicious_index = min(1.0, suspicious_index)
                
                affected = []
                if suspicious_index > 0.7:
                    affected = self.measurement_types
                
                suspicious_nodes.append(AttackNode(
                    node_id=node_id,
                    suspicious_index=min(1.0, suspicious_index),
                    attack_type="temporal_anomaly",
                    affected_measurements=affected
                ))
        
        suspicious_nodes.sort(key=lambda x: x.suspicious_index, reverse=True)
        return suspicious_nodes
    
    def incremental_update(self, new_measurements: List[List[MeasurementData]],
                           learning_rate: float = 1e-4, epochs: int = 5):
        if not self.is_trained:
            logger.warning("Model not trained yet. Performing full training instead.")
            return self.fit(new_measurements, epochs=20)
        
        processed_data = []
        for measurements in new_measurements:
            features = self._preprocess_measurements(measurements)
            processed_data.append(features)
        
        processed_data = np.array(processed_data)
        n_samples, n_nodes, n_features = processed_data.shape
        
        detrended = self._detrend_data(processed_data)
        normalized = self._sliding_window_normalize(detrended)
        
        flattened = normalized.reshape(-1, n_features)
        scaled = self.scaler.transform(flattened)
        scaled_data = scaled.reshape(n_samples, n_nodes, n_features)
        
        sequences = []
        for node_idx in range(n_nodes):
            node_data = scaled_data[:, node_idx, :]
            for i in range(max(1, len(node_data) - self.sequence_length + 1)):
                seq = node_data[i:i + self.sequence_length]
                if len(seq) == self.sequence_length:
                    sequences.append(seq)
        
        if not sequences:
            logger.warning("Not enough data for incremental update.")
            return None
        
        sequences = np.array(sequences)
        X = torch.tensor(sequences, dtype=torch.float32).to(self.device)
        
        dataset = TensorDataset(X, X)
        dataloader = DataLoader(dataset, batch_size=8, shuffle=True)
        
        optimizer = torch.optim.SGD(self.model.parameters(), lr=learning_rate, momentum=0.9)
        criterion = nn.MSELoss()
        
        self.model.train()
        for epoch in range(epochs):
            total_loss = 0
            for batch_X, _ in dataloader:
                optimizer.zero_grad()
                outputs = self.model(batch_X)
                loss = criterion(outputs, batch_X)
                loss.backward()
                optimizer.step()
                total_loss += loss.item()
            
            avg_loss = total_loss / len(dataloader)
            logger.info(f"Incremental Epoch {epoch+1}/{epochs}, Loss: {avg_loss:.6f}")
        
        self.model.eval()
        with torch.no_grad():
            outputs = self.model(X)
            if self.relative_error:
                errors = torch.mean(
                    self._compute_relative_error(outputs, X), dim=(1, 2)
                ).cpu().numpy()
            else:
                errors = torch.mean((outputs - X) ** 2, dim=(1, 2)).cpu().numpy()
        
        self.baseline_errors.extend(errors.tolist())
        if len(self.baseline_errors) > 1000:
            self.baseline_errors = self.baseline_errors[-1000:]
        
        mean_error = np.mean(self.baseline_errors)
        std_error = np.std(self.baseline_errors)
        self.threshold = mean_error + self.threshold_std * std_error
        
        for err in errors:
            self._ewma_tracker.update(float(err))
        
        return {
            'mean_error': float(mean_error),
            'std_error': float(std_error),
            'threshold': float(self.threshold)
        }
    
    def save_model(self, path: str):
        ewma_state = {
            'mean': self._ewma_tracker.mean,
            'var': self._ewma_tracker.var,
            'n': self._ewma_tracker.n
        }
        node_ewma_state = {}
        for nid, tracker in self._node_ewma.items():
            node_ewma_state[str(nid)] = {
                'mean': tracker.mean,
                'var': tracker.var,
                'n': tracker.n
            }
        
        torch.save({
            'model_state_dict': self.model.state_dict(),
            'scaler': self.scaler,
            'threshold': self.threshold,
            'baseline_errors': self.baseline_errors,
            'is_trained': self.is_trained,
            'n_nodes': self.n_nodes,
            'sequence_length': self.sequence_length,
            'hidden_size': self.hidden_size,
            'latent_dim': self.latent_dim,
            'detrend_window': self.detrend_window,
            'ewma_alpha': self.ewma_alpha,
            'relative_error': self.relative_error,
            'ewma_tracker': ewma_state,
            'node_ewma': node_ewma_state
        }, path)
        logger.info(f"Model saved to {path}")
    
    def load_model(self, path: str):
        checkpoint = torch.load(path, map_location=self.device)
        self.model.load_state_dict(checkpoint['model_state_dict'])
        self.scaler = checkpoint['scaler']
        self.threshold = checkpoint['threshold']
        self.baseline_errors = checkpoint['baseline_errors']
        self.is_trained = checkpoint['is_trained']
        self.n_nodes = checkpoint.get('n_nodes', self.n_nodes)
        self.sequence_length = checkpoint.get('sequence_length', self.sequence_length)
        self.hidden_size = checkpoint.get('hidden_size', self.hidden_size)
        self.latent_dim = checkpoint.get('latent_dim', self.latent_dim)
        self.detrend_window = checkpoint.get('detrend_window', self.detrend_window)
        self.ewma_alpha = checkpoint.get('ewma_alpha', self.ewma_alpha)
        self.relative_error = checkpoint.get('relative_error', self.relative_error)
        
        if 'ewma_tracker' in checkpoint:
            state = checkpoint['ewma_tracker']
            self._ewma_tracker = _EWMATracker(alpha=self.ewma_alpha, min_samples=0)
            self._ewma_tracker.mean = state['mean']
            self._ewma_tracker.var = state['var']
            self._ewma_tracker.n = state['n']
        
        if 'node_ewma' in checkpoint:
            for nid_str, state in checkpoint['node_ewma'].items():
                nid = int(nid_str)
                tracker = _EWMATracker(alpha=self.ewma_alpha, min_samples=0)
                tracker.mean = state['mean']
                tracker.var = state['var']
                tracker.n = state['n']
                self._node_ewma[nid] = tracker
        
        logger.info(f"Model loaded from {path}")
