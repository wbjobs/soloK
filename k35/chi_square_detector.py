import numpy as np
from scipy.stats import chi2
from typing import List, Dict, Tuple, Optional
from dataclasses import dataclass
import logging

from state_estimation import StateEstimationResult
from schemas import AttackNode

logger = logging.getLogger(__name__)


@dataclass
class ChiSquareDetectionResult:
    is_attack: bool
    chi_square_value: float
    threshold: float
    confidence: float
    degrees_of_freedom: int
    suspicious_nodes: List[AttackNode]


class ChiSquareDetector:
    def __init__(self, confidence_level: float = 0.99):
        self.confidence_level = confidence_level
        self.history_residuals = []
        self.baseline_mean = None
        self.baseline_std = None
        
    def _calculate_threshold(self, degrees_of_freedom: int, 
                             redundancy_ratio: Optional[float] = None) -> float:
        threshold = chi2.ppf(self.confidence_level, degrees_of_freedom)
        
        if redundancy_ratio is not None and redundancy_ratio > 0:
            adaptive_factor = 1.0 + 0.1 * (1.0 / max(redundancy_ratio, 0.1) - 1.0)
            threshold *= adaptive_factor
            
        return threshold
    
    def _calculate_redundancy_ratio(self, n_measurements: int, n_states: int) -> float:
        if n_states == 0:
            return 0.0
        return (n_measurements - n_states) / n_states
    
    def _locate_attack_nodes(self, normalized_residuals: np.ndarray,
                             measurements: List,
                             threshold: float) -> List[AttackNode]:
        attack_nodes = []
        n_nodes = len(measurements)
        
        measurement_types = ['voltage_magnitude', 'voltage_angle', 'active_power', 'reactive_power']
        
        residual_scores = np.abs(normalized_residuals)
        
        node_id_to_idx = {}
        node_residual_scores = {}
        node_affected_measurements = {}
        node_residuals_data = {}
        
        for i in range(n_nodes):
            node_id = measurements[i].node_id
            node_id_to_idx[node_id] = i
            
            start_idx = 4 * i
            end_idx = 4 * (i + 1)
            node_residuals = residual_scores[start_idx:end_idx]
            node_norm_residuals = normalized_residuals[start_idx:end_idx]
            
            score = np.max(node_residuals)
            node_residual_scores[node_id] = score
            node_residuals_data[node_id] = node_norm_residuals
            
            affected = []
            for j, meas_type in enumerate(measurement_types):
                if node_residuals[j] > threshold / 2:
                    affected.append(meas_type)
            node_affected_measurements[node_id] = affected
        
        if node_residual_scores:
            max_score = max(node_residual_scores.values())
            min_score = min(node_residual_scores.values())
            score_range = max_score - min_score if max_score > min_score else 1.0
            
            for node_id, score in node_residual_scores.items():
                if score > threshold / 2:
                    suspicious_index = min(1.0, (score - min_score) / score_range)
                    suspicious_index = max(suspicious_index, score / (threshold + 1e-10))
                    
                    if suspicious_index > 0.3:
                        attack_type = self._classify_attack_type(
                            node_residuals_data[node_id]
                        )
                        
                        attack_nodes.append(AttackNode(
                            node_id=node_id,
                            suspicious_index=min(1.0, suspicious_index),
                            attack_type=attack_type,
                            affected_measurements=node_affected_measurements[node_id]
                        ))
        
        attack_nodes.sort(key=lambda x: x.suspicious_index, reverse=True)
        return attack_nodes
    
    def _classify_attack_type(self, node_residuals: np.ndarray) -> str:
        if len(node_residuals) == 0:
            return "unknown"
        
        max_residual = np.max(np.abs(node_residuals))
        mean_residual = np.mean(node_residuals)
        
        if max_residual > 5.0:
            if np.abs(mean_residual) > max_residual * 0.5:
                return "constant_bias"
            elif np.std(node_residuals) > np.abs(mean_residual):
                return "random"
            else:
                return "stealth"
        elif max_residual > 3.0:
            return "ramp"
        else:
            return "low_magnitude"
    
    def detect(self, se_result: StateEstimationResult,
               measurements: List,
               n_states: int) -> ChiSquareDetectionResult:
        
        n_measurements = len(se_result.residuals)
        
        redundancy_ratio = self._calculate_redundancy_ratio(n_measurements, n_states)
        
        threshold = self._calculate_threshold(
            se_result.degrees_of_freedom, 
            redundancy_ratio
        )
        
        is_attack = se_result.chi_square_value > threshold
        
        if is_attack:
            if threshold > 0:
                ratio = se_result.chi_square_value / threshold
                confidence = min(1.0, 0.5 + 0.5 * (ratio - 1.0) / max(ratio, 1.0))
            else:
                confidence = 0.9
        else:
            if threshold > 0:
                ratio = se_result.chi_square_value / threshold
                confidence = 1.0 - min(1.0, ratio * 0.5)
            else:
                confidence = 0.5
        
        suspicious_nodes = self._locate_attack_nodes(
            se_result.normalized_residuals,
            measurements,
            threshold
        )
        
        if len(suspicious_nodes) > 0 and not is_attack:
            is_attack = True
            confidence = max(confidence, max(n.suspicious_index for n in suspicious_nodes) * 0.8)
        
        return ChiSquareDetectionResult(
            is_attack=is_attack,
            chi_square_value=se_result.chi_square_value,
            threshold=threshold,
            confidence=confidence,
            degrees_of_freedom=se_result.degrees_of_freedom,
            suspicious_nodes=suspicious_nodes
        )
    
    def update_baseline(self, residuals: np.ndarray):
        self.history_residuals.append(residuals.copy())
        if len(self.history_residuals) > 100:
            self.history_residuals.pop(0)
        
        all_residuals = np.concatenate(self.history_residuals)
        self.baseline_mean = np.mean(all_residuals)
        self.baseline_std = np.std(all_residuals)
