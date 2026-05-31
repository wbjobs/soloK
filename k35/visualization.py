import numpy as np
from typing import List, Dict, Optional, Tuple
from dataclasses import dataclass
import logging
from scipy import stats

from schemas import VisualizationData, MeasurementData
from state_estimation import StateEstimationResult

logger = logging.getLogger(__name__)


class VisualizationGenerator:
    def __init__(self):
        self.measurement_types = ['voltage_magnitude', 'voltage_angle', 
                                  'active_power', 'reactive_power']
    
    def generate_residual_distribution(self,
                                        original_se_result: Optional[StateEstimationResult],
                                        attacked_se_result: Optional[StateEstimationResult],
                                        measurements: List[MeasurementData],
                                        confidence_level: float = 0.95) -> VisualizationData:
        
        residuals_before = []
        residuals_after = []
        
        if original_se_result is not None:
            residuals_before = original_se_result.residuals.tolist()
        if attacked_se_result is not None:
            residuals_after = attacked_se_result.residuals.tolist()
        
        all_residuals = residuals_before + residuals_after
        
        if all_residuals:
            mean_val = np.mean(all_residuals)
            std_val = np.std(all_residuals) if len(all_residuals) > 1 else 1.0
            
            z_score = stats.norm.ppf((1 + confidence_level) / 2)
            ci_lower = mean_val - z_score * std_val
            ci_upper = mean_val + z_score * std_val
            
            confidence_interval = {
                'mean': float(mean_val),
                'std': float(std_val),
                'lower': float(ci_lower),
                'upper': float(ci_upper),
                'confidence_level': confidence_level
            }
        else:
            confidence_interval = {
                'mean': 0.0,
                'std': 1.0,
                'lower': -1.96,
                'upper': 1.96,
                'confidence_level': confidence_level
            }
        
        node_residuals = {}
        
        for i, m in enumerate(measurements):
            node_id = m.node_id
            start_idx = 4 * i
            end_idx = 4 * (i + 1)
            
            node_data = {}
            
            for j, meas_type in enumerate(self.measurement_types):
                idx = start_idx + j
                before = []
                after = []
                
                if original_se_result is not None and idx < len(original_se_result.residuals):
                    before = [float(original_se_result.residuals[idx])]
                    if hasattr(original_se_result, 'normalized_residuals'):
                        before.append(float(original_se_result.normalized_residuals[idx]))
                
                if attacked_se_result is not None and idx < len(attacked_se_result.residuals):
                    after = [float(attacked_se_result.residuals[idx])]
                    if hasattr(attacked_se_result, 'normalized_residuals'):
                        after.append(float(attacked_se_result.normalized_residuals[idx]))
                
                node_data[meas_type] = {
                    'before': before,
                    'after': after
                }
            
            node_residuals[node_id] = node_data
        
        return VisualizationData(
            residuals_before=residuals_before,
            residuals_after=residuals_after,
            confidence_interval=confidence_interval,
            node_residuals=node_residuals
        )
    
    def generate_attack_detection_visualization(self,
                                                 detection_result,
                                                 se_result: StateEstimationResult,
                                                 measurements: List[MeasurementData]) -> Dict:
        
        node_ids = [m.node_id for m in measurements]
        
        residual_data = []
        for i, node_id in enumerate(node_ids):
            start_idx = 4 * i
            end_idx = 4 * (i + 1)
            
            node_residuals = se_result.residuals[start_idx:end_idx]
            node_norm_residuals = se_result.normalized_residuals[start_idx:end_idx]
            
            residual_data.append({
                'node_id': node_id,
                'residuals': node_residuals.tolist(),
                'normalized_residuals': node_norm_residuals.tolist(),
                'max_abs_residual': float(np.max(np.abs(node_norm_residuals)))
            })
        
        suspicious_node_ids = [n.node_id for n in detection_result.suspicious_nodes]
        suspicious_indices = {}
        for n in detection_result.suspicious_nodes:
            suspicious_indices[str(n.node_id)] = {
                'index': float(n.suspicious_index),
                'type': n.attack_type,
                'affected': n.affected_measurements
            }
        
        return {
            'node_ids': node_ids,
            'residual_data': residual_data,
            'suspicious_node_ids': suspicious_node_ids,
            'suspicious_indices': suspicious_indices,
            'chi_square': {
                'value': float(detection_result.chi_square_value),
                'threshold': float(detection_result.chi_square_threshold)
            },
            'is_attack': detection_result.is_attack,
            'confidence': float(detection_result.attack_confidence),
            'detection_method': detection_result.detection_method
        }
    
    def generate_shap_visualization_data(self,
                                          shap_values: Dict[int, Dict[str, float]],
                                          measurements: List[MeasurementData]) -> Dict:
        
        nodes = []
        all_values = []
        
        for node_id, meas_contrib in shap_values.items():
            node_data = {
                'node_id': node_id,
                'measurements': {}
            }
            
            for meas_type, value in meas_contrib.items():
                node_data['measurements'][meas_type] = float(value)
                all_values.append(abs(float(value)))
            
            node_data['total_abs_contribution'] = float(sum(abs(v) for v in meas_contrib.values()))
            nodes.append(node_data)
        
        if all_values:
            max_val = max(all_values)
            min_val = min(all_values)
        else:
            max_val = 1.0
            min_val = 0.0
        
        return {
            'nodes': nodes,
            'value_range': {
                'min': float(min_val),
                'max': float(max_val)
            },
            'measurement_types': self.measurement_types
        }
    
    def generate_time_series_visualization(self,
                                            measurements_history: List[List[MeasurementData]],
                                            node_id: int,
                                            attack_timestamps: Optional[List[int]] = None) -> Dict:
        
        times = []
        voltage_magnitudes = []
        voltage_angles = []
        active_powers = []
        reactive_powers = []
        
        for t, measurements in enumerate(measurements_history):
            for m in measurements:
                if m.node_id == node_id:
                    times.append(t)
                    voltage_magnitudes.append(float(m.voltage_magnitude))
                    voltage_angles.append(float(m.voltage_angle))
                    active_powers.append(float(m.active_power))
                    reactive_powers.append(float(m.reactive_power))
                    break
        
        data = {
            'node_id': node_id,
            'timesteps': times,
            'voltage_magnitude': voltage_magnitudes,
            'voltage_angle': voltage_angles,
            'active_power': active_powers,
            'reactive_power': reactive_powers
        }
        
        if attack_timestamps:
            data['attack_timesteps'] = attack_timestamps
        
        return data
    
    def generate_spatial_visualization(self,
                                        consistency_scores: Dict[int, float],
                                        suspicious_nodes: List,
                                        topology: Optional[Dict] = None) -> Dict:
        
        nodes = []
        max_score = max(consistency_scores.values()) if consistency_scores else 1.0
        
        suspicious_ids = {n.node_id: n.suspicious_index for n in suspicious_nodes}
        
        for node_id, score in consistency_scores.items():
            suspicious_index = float(suspicious_ids.get(node_id, 0.0))
            normalized_score = float(score / max(max_score, 1e-10))
            
            nodes.append({
                'id': node_id,
                'spatial_anomaly_score': float(score),
                'normalized_score': normalized_score,
                'suspicious_index': suspicious_index,
                'is_suspicious': suspicious_index > 0.5
            })
        
        edges = []
        if topology and 'edges' in topology:
            for edge in topology['edges']:
                edges.append({
                    'source': int(edge[0]),
                    'target': int(edge[1])
                })
        else:
            node_ids = sorted(consistency_scores.keys())
            for i in range(len(node_ids)):
                for j in range(i + 1, min(i + 3, len(node_ids))):
                    edges.append({
                        'source': node_ids[i],
                        'target': node_ids[j]
                    })
        
        return {
            'nodes': nodes,
            'edges': edges
        }
    
    def generate_complete_visualization(self,
                                         original_se_result: Optional[StateEstimationResult],
                                         attacked_se_result: Optional[StateEstimationResult],
                                         detection_result,
                                         measurements: List[MeasurementData],
                                         shap_values: Optional[Dict] = None,
                                         spatial_scores: Optional[Dict[int, float]] = None,
                                         topology: Optional[Dict] = None) -> Dict:
        
        visualization = {}
        
        visualization['residual_distribution'] = self.generate_residual_distribution(
            original_se_result, attacked_se_result, measurements
        ).dict()
        
        visualization['detection'] = self.generate_attack_detection_visualization(
            detection_result, 
            attacked_se_result if attacked_se_result else original_se_result,
            measurements
        )
        
        if shap_values:
            visualization['shap_explanation'] = self.generate_shap_visualization_data(
                shap_values, measurements
            )
        
        if spatial_scores:
            visualization['spatial'] = self.generate_spatial_visualization(
                spatial_scores, detection_result.suspicious_nodes, topology
            )
        
        return visualization
