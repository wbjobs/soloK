import numpy as np
import torch
import torch.nn as nn
import torch.nn.functional as F
from torch_geometric.nn import MessagePassing
from torch_geometric.data import Data
from torch_geometric.loader import DataLoader as GeoDataLoader
from typing import List, Dict, Optional, Tuple, Set
from dataclasses import dataclass
import logging
from sklearn.preprocessing import StandardScaler

from schemas import MeasurementData, AttackNode

logger = logging.getLogger(__name__)


@dataclass
class MPNNDetectionResult:
    is_attack: bool
    spatial_anomaly_score: float
    threshold: float
    confidence: float
    suspicious_nodes: List[AttackNode]
    node_consistency_scores: Dict[int, float]


class MPNNLayer(MessagePassing):
    def __init__(self, in_channels: int, out_channels: int, aggr: str = 'mean'):
        super(MPNNLayer, self).__init__(aggr=aggr)
        self.lin = nn.Linear(in_channels, out_channels)
        self.lin_msg = nn.Linear(in_channels * 2, out_channels)
        self.lin_update = nn.Linear(in_channels + out_channels, out_channels)
        
    def forward(self, x, edge_index):
        return self.propagate(edge_index, x=x)
    
    def message(self, x_i, x_j):
        msg_input = torch.cat([x_i, x_j - x_i], dim=-1)
        return F.relu(self.lin_msg(msg_input))
    
    def update(self, aggr_out, x):
        update_input = torch.cat([x, aggr_out], dim=-1)
        return F.relu(self.lin_update(update_input))


class MPNNAutoencoder(nn.Module):
    def __init__(self, input_dim: int, hidden_channels: int = 64, num_layers: int = 3, latent_dim: int = 32):
        super(MPNNAutoencoder, self).__init__()
        
        self.input_dim = input_dim
        self.hidden_channels = hidden_channels
        self.num_layers = num_layers
        self.latent_dim = latent_dim
        
        self.encoder_layers = nn.ModuleList()
        self.encoder_layers.append(MPNNLayer(input_dim, hidden_channels))
        for _ in range(num_layers - 2):
            self.encoder_layers.append(MPNNLayer(hidden_channels, hidden_channels))
        self.encoder_layers.append(MPNNLayer(hidden_channels, latent_dim))
        
        self.decoder_layers = nn.ModuleList()
        self.decoder_layers.append(MPNNLayer(latent_dim, hidden_channels))
        for _ in range(num_layers - 2):
            self.decoder_layers.append(MPNNLayer(hidden_channels, hidden_channels))
        self.decoder_layers.append(MPNNLayer(hidden_channels, input_dim))
        
    def encode(self, x, edge_index):
        for layer in self.encoder_layers:
            x = layer(x, edge_index)
        return x
    
    def decode(self, z, edge_index):
        for layer in self.decoder_layers:
            z = layer(z, edge_index)
        return z
    
    def forward(self, x, edge_index):
        z = self.encode(x, edge_index)
        x_reconstructed = self.decode(z, edge_index)
        return x_reconstructed


class SpatialConsistencyDetector:
    def __init__(self, n_nodes: int, hidden_channels: int = 64, 
                 num_layers: int = 3, latent_dim: int = 32,
                 threshold_std: float = 3.0, device: str = "cpu"):
        self.n_nodes = n_nodes
        self.hidden_channels = hidden_channels
        self.num_layers = num_layers
        self.latent_dim = latent_dim
        self.threshold_std = threshold_std
        self.device = torch.device(device if torch.cuda.is_available() else "cpu")
        
        self.input_dim = 4
        self.model = MPNNAutoencoder(
            input_dim=self.input_dim,
            hidden_channels=hidden_channels,
            num_layers=num_layers,
            latent_dim=latent_dim
        ).to(self.device)
        
        self.scaler = StandardScaler()
        self.threshold = None
        self.baseline_errors = []
        self.is_trained = False
        
        self._trained_node_ids: Set[int] = set()
        self._node_id_to_idx: Dict[int, int] = {}
        self._idx_to_node_id: Dict[int, int] = {}
        
        self.default_edge_index = self._build_default_topology(n_nodes)
        
        self.measurement_types = ['voltage_magnitude', 'voltage_angle', 
                                  'active_power', 'reactive_power']
        
    def _build_default_topology(self, n_nodes: int) -> torch.Tensor:
        edges = []
        for i in range(n_nodes):
            for j in range(max(0, i - 2), min(n_nodes, i + 3)):
                if i != j:
                    edges.append([i, j])
        
        if not edges:
            edges = [[0, 0]]
        
        edge_index = torch.tensor(edges, dtype=torch.long).t().contiguous()
        return edge_index
    
    def _build_topology_from_config(self, topology: Optional[Dict], 
                                     n_current_nodes: int) -> torch.Tensor:
        if topology is not None and 'edges' not in topology:
            pass
        
        if topology is not None and 'edges' in topology:
            edges = topology['edges']
            max_node_idx = n_current_nodes - 1
            
            valid_edges = []
            for edge in edges:
                if isinstance(edge, (list, tuple)) and len(edge) == 2:
                    src, dst = int(edge[0]), int(edge[1])
                    if src <= max_node_idx and dst <= max_node_idx:
                        valid_edges.append([src, dst])
            
            if not valid_edges:
                return self._build_default_topology(n_current_nodes)
            
            edge_index = torch.tensor(valid_edges, dtype=torch.long).t().contiguous()
            return edge_index
        
        if n_current_nodes <= self.n_nodes:
            max_existing = self.default_edge_index.max().item()
            if max_existing < n_current_nodes:
                return self.default_edge_index
            else:
                mask = (self.default_edge_index[0] < n_current_nodes) & \
                       (self.default_edge_index[1] < n_current_nodes)
                return self.default_edge_index[:, mask]
        
        return self._extend_topology_for_new_nodes(n_current_nodes)
    
    def _extend_topology_for_new_nodes(self, n_current_nodes: int) -> torch.Tensor:
        existing_edges = self.default_edge_index
        
        existing_max = existing_edges.max().item() if existing_edges.numel() > 0 else -1
        new_edges = []
        
        for new_idx in range(max(0, existing_max + 1), n_current_nodes):
            neighbor = max(0, new_idx - 1)
            new_edges.append([new_idx, neighbor])
            new_edges.append([neighbor, new_idx])
            
            if new_idx > 0:
                neighbor2 = max(0, new_idx - 2)
                new_edges.append([new_idx, neighbor2])
                new_edges.append([neighbor2, new_idx])
        
        if new_edges:
            new_edge_tensor = torch.tensor(new_edges, dtype=torch.long).t().contiguous()
            edge_index = torch.cat([existing_edges, new_edge_tensor], dim=1)
        else:
            edge_index = existing_edges
        
        mask = (edge_index[0] < n_current_nodes) & (edge_index[1] < n_current_nodes)
        edge_index = edge_index[:, mask]
        
        if edge_index.numel() == 0:
            fallback = self._build_default_topology(n_current_nodes)
            return fallback
        
        return edge_index
    
    def _register_node_ids(self, measurements: List[MeasurementData]):
        new_node_ids = set()
        for m in measurements:
            if m.node_id not in self._node_id_to_idx:
                new_node_ids.add(m.node_id)
        
        if new_node_ids:
            next_idx = len(self._node_id_to_idx)
            sorted_new = sorted(new_node_ids)
            for nid in sorted_new:
                if nid not in self._node_id_to_idx:
                    self._node_id_to_idx[nid] = next_idx
                    self._idx_to_node_id[next_idx] = nid
                    next_idx += 1
            
            self._trained_node_ids.update(new_node_ids)
            logger.info(f"Registered {len(new_node_ids)} new node IDs: {sorted_new}")
    
    def _build_feature_matrix(self, measurements: List[MeasurementData]) -> Tuple[np.ndarray, List[int]]:
        self._register_node_ids(measurements)
        
        present_node_ids = [m.node_id for m in measurements]
        n_current = len(measurements)
        
        features = np.zeros((n_current, self.input_dim))
        for i, m in enumerate(measurements):
            features[i] = [m.voltage_magnitude, m.voltage_angle, 
                          m.active_power, m.reactive_power]
        
        return features, present_node_ids
    
    def _safe_scale_features(self, features: np.ndarray, 
                              present_node_ids: List[int],
                              is_training: bool = False) -> np.ndarray:
        if not self.is_trained and not is_training:
            return features
        
        n_nodes = features.shape[0]
        scaled = np.zeros_like(features)
        
        if is_training:
            flattened = features.reshape(-1, self.input_dim)
            self.scaler.fit(flattened)
            scaled = self.scaler.transform(flattened).reshape(features.shape)
        else:
            for i in range(n_nodes):
                node_feat = features[i:i+1, :]
                try:
                    scaled[i:i+1, :] = self.scaler.transform(node_feat)
                except ValueError:
                    scaled[i:i+1, :] = node_feat
                    logger.warning(
                        f"Node {present_node_ids[i]} not in training scaler, "
                        f"using unscaled features"
                    )
        
        return scaled
    
    def _build_edge_index_for_nodes(self, present_node_ids: List[int],
                                     topology: Optional[Dict] = None) -> torch.Tensor:
        n_current = len(present_node_ids)
        id_to_local_idx = {nid: i for i, nid in enumerate(present_node_ids)}
        
        if topology is not None and 'edges' in topology:
            raw_edges = topology['edges']
            valid_edges = []
            for edge in raw_edges:
                if isinstance(edge, (list, tuple)) and len(edge) == 2:
                    src_id, dst_id = int(edge[0]), int(edge[1])
                    if src_id in id_to_local_idx and dst_id in id_to_local_idx:
                        valid_edges.append([id_to_local_idx[src_id], 
                                          id_to_local_idx[dst_id]])
            
            if valid_edges:
                return torch.tensor(valid_edges, dtype=torch.long).t().contiguous()
        
        edges = []
        for i in range(n_current):
            for j in range(max(0, i - 2), min(n_current, i + 3)):
                if i != j:
                    edges.append([i, j])
        
        if not edges:
            edges = [[0, 0]] if n_current > 0 else [[0, 0]]
        
        return torch.tensor(edges, dtype=torch.long).t().contiguous()
    
    def _preprocess_measurements(self, measurements: List[MeasurementData]) -> np.ndarray:
        n_nodes = len(measurements)
        features = np.zeros((n_nodes, self.input_dim))
        
        for i, m in enumerate(measurements):
            features[i] = [m.voltage_magnitude, m.voltage_angle, 
                          m.active_power, m.reactive_power]
        
        return features
    
    def fit(self, data_history: List[List[MeasurementData]],
            topology: Optional[Dict] = None,
            epochs: int = 100, batch_size: int = 8, learning_rate: float = 1e-3):
        
        if data_history:
            self._register_node_ids(data_history[0])
        
        first_measurements = data_history[0] if data_history else []
        edge_index = self._build_edge_index_for_nodes(
            [m.node_id for m in first_measurements], topology
        ).to(self.device)
        
        all_data_list = []
        
        for measurements in data_history:
            features, node_ids = self._build_feature_matrix(measurements)
            scaled = self._safe_scale_features(features, node_ids, is_training=True)
            
            x = torch.tensor(scaled, dtype=torch.float32)
            data = Data(x=x, edge_index=edge_index)
            all_data_list.append(data)
        
        loader = GeoDataLoader(all_data_list, batch_size=batch_size, shuffle=True)
        
        optimizer = torch.optim.Adam(self.model.parameters(), lr=learning_rate)
        criterion = nn.MSELoss()
        
        self.model.train()
        for epoch in range(epochs):
            total_loss = 0
            for batch in loader:
                batch = batch.to(self.device)
                optimizer.zero_grad()
                outputs = self.model(batch.x, batch.edge_index)
                loss = criterion(outputs, batch.x)
                loss.backward()
                optimizer.step()
                total_loss += loss.item()
            
            avg_loss = total_loss / len(loader)
            if (epoch + 1) % 20 == 0:
                logger.info(f"Epoch {epoch+1}/{epochs}, Loss: {avg_loss:.6f}")
        
        self.model.eval()
        reconstruction_errors = []
        with torch.no_grad():
            for data in all_data_list:
                data = data.to(self.device)
                outputs = self.model(data.x, data.edge_index)
                node_errors = torch.mean((outputs - data.x) ** 2, dim=1).cpu().numpy()
                reconstruction_errors.append(np.mean(node_errors))
                self.baseline_errors.extend(node_errors.tolist())
        
        mean_error = np.mean(self.baseline_errors)
        std_error = np.std(self.baseline_errors)
        self.threshold = mean_error + self.threshold_std * std_error
        self.is_trained = True
        
        self.n_nodes = max(self.n_nodes, len(first_measurements))
        
        logger.info(f"MPNN Training complete. Threshold: {self.threshold:.6f}")
        
        return {
            'mean_error': float(mean_error),
            'std_error': float(std_error),
            'threshold': float(self.threshold)
        }
    
    def detect(self, measurements: List[MeasurementData],
               topology: Optional[Dict] = None) -> MPNNDetectionResult:
        
        features, present_node_ids = self._build_feature_matrix(measurements)
        n_nodes = features.shape[0]
        
        edge_index = self._build_edge_index_for_nodes(present_node_ids, topology)
        
        scaled = self._safe_scale_features(features, present_node_ids)
        
        x = torch.tensor(scaled, dtype=torch.float32).to(self.device)
        edge_index = edge_index.to(self.device)
        
        self.model.eval()
        with torch.no_grad():
            x_reconstructed = self.model(x, edge_index)
            node_errors = torch.mean((x_reconstructed - x) ** 2, dim=1).cpu().numpy()
        
        consistency_scores = {}
        for i, m in enumerate(measurements):
            consistency_scores[m.node_id] = float(node_errors[i])
        
        avg_error = np.mean(node_errors)
        
        if self.threshold is not None and self.threshold > 0:
            is_attack = avg_error > self.threshold
            if is_attack:
                ratio = avg_error / self.threshold
                confidence = min(1.0, 0.5 + 0.5 * (ratio - 1.0) / max(ratio, 1.0))
            else:
                ratio = avg_error / self.threshold
                confidence = 1.0 - min(1.0, ratio * 0.5)
        else:
            is_attack = avg_error > 0.1
            confidence = 0.5 + min(0.5, avg_error)
        
        suspicious_nodes = self._locate_suspicious_nodes(consistency_scores, measurements)
        
        return MPNNDetectionResult(
            is_attack=is_attack,
            spatial_anomaly_score=float(avg_error),
            threshold=float(self.threshold) if self.threshold is not None else 0.1,
            confidence=float(confidence),
            suspicious_nodes=suspicious_nodes,
            node_consistency_scores=consistency_scores
        )
    
    def _locate_suspicious_nodes(self, consistency_scores: Dict[int, float],
                                  measurements: List[MeasurementData]) -> List[AttackNode]:
        suspicious_nodes = []
        
        if not consistency_scores:
            return suspicious_nodes
        
        errors = np.array(list(consistency_scores.values()))
        mean_err = np.mean(errors)
        std_err = np.std(errors) if len(errors) > 1 else 1.0
        
        for m in measurements:
            node_id = m.node_id
            error = consistency_scores.get(node_id, 0.0)
            
            z_score = (error - mean_err) / max(std_err, 1e-10)
            
            if z_score > 1.5 or error > (self.threshold * 0.8 if self.threshold else 0.08):
                suspicious_index = min(1.0, (z_score / 3.0 + 0.5))
                suspicious_index = max(suspicious_index, error / (max(self.threshold, 0.1) + 1e-10))
                
                affected = []
                if suspicious_index > 0.7:
                    affected = self.measurement_types
                
                suspicious_nodes.append(AttackNode(
                    node_id=node_id,
                    suspicious_index=min(1.0, suspicious_index),
                    attack_type="spatial_anomaly",
                    affected_measurements=affected
                ))
        
        suspicious_nodes.sort(key=lambda x: x.suspicious_index, reverse=True)
        return suspicious_nodes
    
    def incremental_update(self, new_measurements: List[List[MeasurementData]],
                          topology: Optional[Dict] = None,
                          learning_rate: float = 1e-4, epochs: int = 5):
        if not self.is_trained:
            logger.warning("Model not trained yet. Performing full training instead.")
            return self.fit(new_measurements, topology, epochs=50)
        
        first_measurements = new_measurements[0] if new_measurements else []
        edge_index = self._build_edge_index_for_nodes(
            [m.node_id for m in first_measurements], topology
        ).to(self.device)
        
        all_data_list = []
        for measurements in new_measurements:
            features, node_ids = self._build_feature_matrix(measurements)
            scaled = self._safe_scale_features(features, node_ids)
            
            x = torch.tensor(scaled, dtype=torch.float32)
            data = Data(x=x, edge_index=edge_index)
            all_data_list.append(data)
        
        loader = GeoDataLoader(all_data_list, batch_size=4, shuffle=True)
        
        optimizer = torch.optim.SGD(self.model.parameters(), lr=learning_rate, momentum=0.9)
        criterion = nn.MSELoss()
        
        self.model.train()
        for epoch in range(epochs):
            total_loss = 0
            for batch in loader:
                batch = batch.to(self.device)
                optimizer.zero_grad()
                outputs = self.model(batch.x, batch.edge_index)
                loss = criterion(outputs, batch.x)
                loss.backward()
                optimizer.step()
                total_loss += loss.item()
            
            avg_loss = total_loss / len(loader)
            logger.info(f"Incremental MPNN Epoch {epoch+1}/{epochs}, Loss: {avg_loss:.6f}")
        
        self.model.eval()
        with torch.no_grad():
            for data in all_data_list:
                data = data.to(self.device)
                outputs = self.model(data.x, data.edge_index)
                node_errors = torch.mean((outputs - data.x) ** 2, dim=1).cpu().numpy()
                self.baseline_errors.extend(node_errors.tolist())
        
        if len(self.baseline_errors) > 2000:
            self.baseline_errors = self.baseline_errors[-2000:]
        
        mean_error = np.mean(self.baseline_errors)
        std_error = np.std(self.baseline_errors)
        self.threshold = mean_error + self.threshold_std * std_error
        
        return {
            'mean_error': float(mean_error),
            'std_error': float(std_error),
            'threshold': float(self.threshold)
        }
    
    def save_model(self, path: str):
        torch.save({
            'model_state_dict': self.model.state_dict(),
            'scaler': self.scaler,
            'threshold': self.threshold,
            'baseline_errors': self.baseline_errors,
            'is_trained': self.is_trained,
            'n_nodes': self.n_nodes,
            'hidden_channels': self.hidden_channels,
            'num_layers': self.num_layers,
            'latent_dim': self.latent_dim,
            'default_edge_index': self.default_edge_index,
            'node_id_to_idx': self._node_id_to_idx,
            'idx_to_node_id': self._idx_to_node_id,
            'trained_node_ids': list(self._trained_node_ids)
        }, path)
        logger.info(f"MPNN Model saved to {path}")
    
    def load_model(self, path: str):
        checkpoint = torch.load(path, map_location=self.device)
        self.model.load_state_dict(checkpoint['model_state_dict'])
        self.scaler = checkpoint['scaler']
        self.threshold = checkpoint['threshold']
        self.baseline_errors = checkpoint['baseline_errors']
        self.is_trained = checkpoint['is_trained']
        self.n_nodes = checkpoint.get('n_nodes', self.n_nodes)
        self.hidden_channels = checkpoint.get('hidden_channels', self.hidden_channels)
        self.num_layers = checkpoint.get('num_layers', self.num_layers)
        self.latent_dim = checkpoint.get('latent_dim', self.latent_dim)
        if 'default_edge_index' in checkpoint:
            self.default_edge_index = checkpoint['default_edge_index']
        if 'node_id_to_idx' in checkpoint:
            self._node_id_to_idx = checkpoint['node_id_to_idx']
        if 'idx_to_node_id' in checkpoint:
            self._idx_to_node_id = checkpoint['idx_to_node_id']
        if 'trained_node_ids' in checkpoint:
            self._trained_node_ids = set(checkpoint['trained_node_ids'])
        logger.info(f"MPNN Model loaded from {path}")
