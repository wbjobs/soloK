import numpy as np
import torch
from typing import List, Dict, Optional, Tuple
from dataclasses import dataclass
import logging

try:
    import shap
    SHAP_AVAILABLE = True
except ImportError:
    SHAP_AVAILABLE = False
    logging.warning("SHAP not available. Install with: pip install shap")

from schemas import MeasurementData
from state_estimation import WeightedLeastSquaresEstimator

logger = logging.getLogger(__name__)


@dataclass
class SHAPExplanation:
    node_id: int
    measurement_contributions: Dict[str, float]
    total_contribution: float
    baseline_value: float


class SHAPExplainer:
    def __init__(self, lstm_detector=None, mpnn_detector=None, se_estimator=None):
        self.lstm_detector = lstm_detector
        self.mpnn_detector = mpnn_detector
        self.se_estimator = se_estimator
        self.measurement_types = ['voltage_magnitude', 'voltage_angle', 
                                  'active_power', 'reactive_power']
        
        self._lstm_explainer = None
        self._mpnn_explainer = None
        self._background_data = None
    
    def _prepare_background_data(self, measurements_list: List[List[MeasurementData]], 
                                  n_samples: int = 50) -> np.ndarray:
        all_data = []
        for measurements in measurements_list[:n_samples]:
            features = self._measurements_to_features(measurements)
            all_data.append(features)
        
        all_data = np.array(all_data)
        if len(all_data.shape) == 3:
            all_data = all_data.reshape(all_data.shape[0], -1)
        
        self._background_data = all_data
        return all_data
    
    def _measurements_to_features(self, measurements: List[MeasurementData]) -> np.ndarray:
        n_nodes = len(measurements)
        features = np.zeros((n_nodes, 4))
        
        for i, m in enumerate(measurements):
            features[i] = [m.voltage_magnitude, m.voltage_angle, 
                          m.active_power, m.reactive_power]
        
        return features
    
    def _lstm_predict_wrapper(self, x: np.ndarray) -> np.ndarray:
        if self.lstm_detector is None:
            return np.zeros(x.shape[0])
        
        self.lstm_detector.model.eval()
        errors = []
        
        with torch.no_grad():
            for sample in x:
                seq = sample.reshape(-1, 4)
                if len(seq) >= self.lstm_detector.sequence_length:
                    input_seq = seq[-self.lstm_detector.sequence_length:]
                else:
                    padding = np.zeros((self.lstm_detector.sequence_length - len(seq), 4))
                    input_seq = np.vstack([padding, seq])
                
                X = torch.tensor(input_seq[np.newaxis, :, :], dtype=torch.float32).to(self.lstm_detector.device)
                X_recon = self.lstm_detector.model(X)
                error = torch.mean((X_recon - X) ** 2).cpu().numpy()
                errors.append(error)
        
        return np.array(errors)
    
    def _mpnn_predict_wrapper(self, x: np.ndarray, edge_index: torch.Tensor) -> np.ndarray:
        if self.mpnn_detector is None:
            return np.zeros(x.shape[0])
        
        self.mpnn_detector.model.eval()
        errors = []
        
        with torch.no_grad():
            for sample in x:
                node_features = sample.reshape(-1, 4)
                X = torch.tensor(node_features, dtype=torch.float32).to(self.mpnn_detector.device)
                X_recon = self.mpnn_detector.model(X, edge_index)
                error = torch.mean((X_recon - X) ** 2, dim=1).cpu().numpy()
                errors.append(np.mean(error))
        
        return np.array(errors)
    
    def _wls_predict_wrapper(self, x: np.ndarray, measurements_template: List[MeasurementData]) -> np.ndarray:
        if self.se_estimator is None:
            return np.zeros(x.shape[0])
        
        chi_square_values = []
        
        for sample in x:
            node_features = sample.reshape(-1, 4)
            
            modified_measurements = []
            for i, m in enumerate(measurements_template):
                if i < len(node_features):
                    new_m = MeasurementData(
                        timestamp=m.timestamp,
                        node_id=m.node_id,
                        voltage_magnitude=float(node_features[i, 0]),
                        voltage_angle=float(node_features[i, 1]),
                        active_power=float(node_features[i, 2]),
                        reactive_power=float(node_features[i, 3])
                    )
                    modified_measurements.append(new_m)
            
            try:
                se_result = self.se_estimator.estimate(modified_measurements)
                chi_square_values.append(se_result.chi_square_value)
            except:
                chi_square_values.append(0.0)
        
        return np.array(chi_square_values)
    
    def explain_lstm(self, current_measurements: List[MeasurementData],
                     history_measurements: List[List[MeasurementData]],
                     n_background_samples: int = 30) -> Optional[Dict[int, Dict[str, float]]]:
        
        if not SHAP_AVAILABLE or self.lstm_detector is None:
            logger.warning("SHAP or LSTM detector not available for explanation")
            return None
        
        try:
            background = self._prepare_background_data(history_measurements, n_background_samples)
            
            current_features = self._measurements_to_features(current_measurements)
            current_flat = current_features.reshape(1, -1)
            
            explainer = shap.KernelExplainer(self._lstm_predict_wrapper, background)
            shap_values = explainer.shap_values(current_flat, nsamples=100)
            
            shap_values_2d = shap_values.reshape(current_features.shape)
            
            shap_dict = {}
            for i, m in enumerate(current_measurements):
                node_id = m.node_id
                contributions = {}
                for j, meas_type in enumerate(self.measurement_types):
                    contributions[meas_type] = float(shap_values_2d[i, j])
                shap_dict[node_id] = contributions
            
            return shap_dict
            
        except Exception as e:
            logger.error(f"Error computing LSTM SHAP values: {e}")
            return None
    
    def explain_mpnn(self, current_measurements: List[MeasurementData],
                     history_measurements: List[List[MeasurementData]],
                     topology: Optional[Dict] = None,
                     n_background_samples: int = 30) -> Optional[Dict[int, Dict[str, float]]]:
        
        if not SHAP_AVAILABLE or self.mpnn_detector is None:
            logger.warning("SHAP or MPNN detector not available for explanation")
            return None
        
        try:
            edge_index = self.mpnn_detector._build_topology_from_config(topology).to(self.mpnn_detector.device)
            
            background = self._prepare_background_data(history_measurements, n_background_samples)
            
            current_features = self._measurements_to_features(current_measurements)
            current_flat = current_features.reshape(1, -1)
            
            def predict_fn(x):
                return self._mpnn_predict_wrapper(x, edge_index)
            
            explainer = shap.KernelExplainer(predict_fn, background)
            shap_values = explainer.shap_values(current_flat, nsamples=100)
            
            shap_values_2d = shap_values.reshape(current_features.shape)
            
            shap_dict = {}
            for i, m in enumerate(current_measurements):
                node_id = m.node_id
                contributions = {}
                for j, meas_type in enumerate(self.measurement_types):
                    contributions[meas_type] = float(shap_values_2d[i, j])
                shap_dict[node_id] = contributions
            
            return shap_dict
            
        except Exception as e:
            logger.error(f"Error computing MPNN SHAP values: {e}")
            return None
    
    def explain_wls(self, current_measurements: List[MeasurementData],
                    history_measurements: List[List[MeasurementData]],
                    n_background_samples: int = 30) -> Optional[Dict[int, Dict[str, float]]]:
        
        if not SHAP_AVAILABLE or self.se_estimator is None:
            logger.warning("SHAP or WLS estimator not available for explanation")
            return None
        
        try:
            background = self._prepare_background_data(history_measurements, n_background_samples)
            
            current_features = self._measurements_to_features(current_measurements)
            current_flat = current_features.reshape(1, -1)
            
            def predict_fn(x):
                return self._wls_predict_wrapper(x, current_measurements)
            
            explainer = shap.KernelExplainer(predict_fn, background)
            shap_values = explainer.shap_values(current_flat, nsamples=50)
            
            shap_values_2d = shap_values.reshape(current_features.shape)
            
            shap_dict = {}
            for i, m in enumerate(current_measurements):
                node_id = m.node_id
                contributions = {}
                for j, meas_type in enumerate(self.measurement_types):
                    contributions[meas_type] = float(shap_values_2d[i, j])
                shap_dict[node_id] = contributions
            
            return shap_dict
            
        except Exception as e:
            logger.error(f"Error computing WLS SHAP values: {e}")
            return None
    
    def explain_ensemble(self, current_measurements: List[MeasurementData],
                         history_measurements: List[List[MeasurementData]],
                         topology: Optional[Dict] = None,
                         method: str = "all") -> Dict:
        
        results = {}
        
        if method in ["all", "wls"]:
            results['wls_shap'] = self.explain_wls(
                current_measurements, history_measurements
            )
        
        if method in ["all", "lstm"]:
            results['lstm_shap'] = self.explain_lstm(
                current_measurements, history_measurements
            )
        
        if method in ["all", "mpnn"]:
            results['mpnn_shap'] = self.explain_mpnn(
                current_measurements, history_measurements, topology
            )
        
        combined = {}
        if any(v is not None for v in results.values()):
            n_nodes = len(current_measurements)
            for i, m in enumerate(current_measurements):
                node_id = m.node_id
                combined[node_id] = {}
                for meas_type in self.measurement_types:
                    total = 0.0
                    count = 0
                    for method_name, shap_dict in results.items():
                        if shap_dict and node_id in shap_dict:
                            total += abs(shap_dict[node_id][meas_type])
                            count += 1
                    combined[node_id][meas_type] = total / max(count, 1)
        
        results['combined_shap'] = combined
        
        return results
    
    def summarize_top_contributors(self, shap_dict: Dict[int, Dict[str, float]],
                                    top_k: int = 10) -> List[Dict]:
        all_contributions = []
        
        for node_id, measurements in shap_dict.items():
            for meas_type, value in measurements.items():
                all_contributions.append({
                    'node_id': node_id,
                    'measurement': meas_type,
                    'shap_value': float(value),
                    'abs_value': abs(float(value))
                })
        
        all_contributions.sort(key=lambda x: x['abs_value'], reverse=True)
        
        return all_contributions[:top_k]
