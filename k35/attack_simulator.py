import numpy as np
from typing import List, Dict, Tuple
from datetime import datetime, timedelta
import logging
import copy

from schemas import MeasurementData, SimulateAttackResponse

logger = logging.getLogger(__name__)


class AttackSimulator:
    def __init__(self):
        self.measurement_types = ['voltage_magnitude', 'voltage_angle', 
                                  'active_power', 'reactive_power']
    
    def _get_measurement_value(self, m: MeasurementData, meas_type: str) -> float:
        if meas_type == 'voltage_magnitude':
            return m.voltage_magnitude
        elif meas_type == 'voltage_angle':
            return m.voltage_angle
        elif meas_type == 'active_power':
            return m.active_power
        elif meas_type == 'reactive_power':
            return m.reactive_power
        return 0.0
    
    def _set_measurement_value(self, m: MeasurementData, meas_type: str, value: float):
        if meas_type == 'voltage_magnitude':
            m.voltage_magnitude = value
        elif meas_type == 'voltage_angle':
            m.voltage_angle = value
        elif meas_type == 'active_power':
            m.active_power = value
        elif meas_type == 'reactive_power':
            m.reactive_power = value
    
    def simulate_constant_bias_attack(self, 
                                       base_measurements: List[MeasurementData],
                                       target_nodes: List[int],
                                       attack_magnitude: float,
                                       attack_duration: int,
                                       affected_measurements: List[str] = None) -> SimulateAttackResponse:
        
        if affected_measurements is None:
            affected_measurements = self.measurement_types
        
        original_measurements = copy.deepcopy(base_measurements)
        attacked_measurements = copy.deepcopy(base_measurements)
        
        attack_pattern = {}
        node_map = {m.node_id: i for i, m in enumerate(attacked_measurements)}
        
        for node_id in target_nodes:
            if node_id not in node_map:
                continue
            
            idx = node_map[node_id]
            attack_pattern[node_id] = {}
            
            for meas_type in affected_measurements:
                original_value = self._get_measurement_value(attacked_measurements[idx], meas_type)
                bias = attack_magnitude * np.sign(np.random.randn())
                attacked_value = original_value + bias
                
                self._set_measurement_value(attacked_measurements[idx], meas_type, attacked_value)
                attack_pattern[node_id][meas_type] = bias
        
        logger.info(f"Simulated constant bias attack on {len(target_nodes)} nodes")
        
        return SimulateAttackResponse(
            original_measurements=original_measurements,
            attacked_measurements=attacked_measurements,
            attack_pattern=attack_pattern
        )
    
    def simulate_random_attack(self,
                               base_measurements: List[MeasurementData],
                               target_nodes: List[int],
                               attack_magnitude: float,
                               attack_duration: int,
                               affected_measurements: List[str] = None) -> SimulateAttackResponse:
        
        if affected_measurements is None:
            affected_measurements = self.measurement_types
        
        original_measurements = copy.deepcopy(base_measurements)
        attacked_measurements = copy.deepcopy(base_measurements)
        
        attack_pattern = {}
        node_map = {m.node_id: i for i, m in enumerate(attacked_measurements)}
        
        for node_id in target_nodes:
            if node_id not in node_map:
                continue
            
            idx = node_map[node_id]
            attack_pattern[node_id] = {}
            
            for meas_type in affected_measurements:
                original_value = self._get_measurement_value(attacked_measurements[idx], meas_type)
                noise = attack_magnitude * np.random.randn()
                attacked_value = original_value + noise
                
                self._set_measurement_value(attacked_measurements[idx], meas_type, attacked_value)
                attack_pattern[node_id][meas_type] = noise
        
        logger.info(f"Simulated random attack on {len(target_nodes)} nodes")
        
        return SimulateAttackResponse(
            original_measurements=original_measurements,
            attacked_measurements=attacked_measurements,
            attack_pattern=attack_pattern
        )
    
    def simulate_ramp_attack(self,
                             base_measurements: List[MeasurementData],
                             target_nodes: List[int],
                             attack_magnitude: float,
                             attack_duration: int,
                             affected_measurements: List[str] = None,
                             time_step: int = 0) -> SimulateAttackResponse:
        
        if affected_measurements is None:
            affected_measurements = self.measurement_types
        
        original_measurements = copy.deepcopy(base_measurements)
        attacked_measurements = copy.deepcopy(base_measurements)
        
        attack_pattern = {}
        node_map = {m.node_id: i for i, m in enumerate(attacked_measurements)}
        
        ramp_factor = min(time_step / max(attack_duration, 1), 1.0)
        current_magnitude = attack_magnitude * ramp_factor
        
        for node_id in target_nodes:
            if node_id not in node_map:
                continue
            
            idx = node_map[node_id]
            attack_pattern[node_id] = {}
            
            for meas_type in affected_measurements:
                original_value = self._get_measurement_value(attacked_measurements[idx], meas_type)
                bias = current_magnitude * np.sign(np.random.randn())
                attacked_value = original_value + bias
                
                self._set_measurement_value(attacked_measurements[idx], meas_type, attacked_value)
                attack_pattern[node_id][meas_type] = bias
        
        logger.info(f"Simulated ramp attack (step {time_step}/{attack_duration}) on {len(target_nodes)} nodes")
        
        return SimulateAttackResponse(
            original_measurements=original_measurements,
            attacked_measurements=attacked_measurements,
            attack_pattern=attack_pattern
        )
    
    def simulate_stealth_attack(self,
                                base_measurements: List[MeasurementData],
                                target_nodes: List[int],
                                attack_magnitude: float,
                                se_result=None) -> SimulateAttackResponse:
        
        original_measurements = copy.deepcopy(base_measurements)
        attacked_measurements = copy.deepcopy(base_measurements)
        
        attack_pattern = {}
        node_map = {m.node_id: i for i, m in enumerate(attacked_measurements)}
        
        for node_id in target_nodes:
            if node_id not in node_map:
                continue
            
            idx = node_map[node_id]
            attack_pattern[node_id] = {}
            
            if se_result is not None and se_result.estimated_measurements is not None:
                start_idx = 4 * idx
                end_idx = start_idx + 4
                est_vals = se_result.estimated_measurements[start_idx:end_idx]
                
                for j, meas_type in enumerate(self.measurement_types):
                    original_value = self._get_measurement_value(attacked_measurements[idx], meas_type)
                    stealth_bias = attack_magnitude * 0.3 * (est_vals[j] - original_value)
                    attacked_value = original_value + stealth_bias
                    
                    self._set_measurement_value(attacked_measurements[idx], meas_type, attacked_value)
                    attack_pattern[node_id][meas_type] = stealth_bias
            else:
                for meas_type in self.measurement_types:
                    original_value = self._get_measurement_value(attacked_measurements[idx], meas_type)
                    bias = attack_magnitude * 0.5 * np.sign(np.random.randn())
                    attacked_value = original_value + bias
                    
                    self._set_measurement_value(attacked_measurements[idx], meas_type, attacked_value)
                    attack_pattern[node_id][meas_type] = bias
        
        logger.info(f"Simulated stealth attack on {len(target_nodes)} nodes")
        
        return SimulateAttackResponse(
            original_measurements=original_measurements,
            attacked_measurements=attacked_measurements,
            attack_pattern=attack_pattern
        )
    
    def simulate_attack(self, 
                        attack_type: str,
                        base_measurements: List[MeasurementData],
                        target_nodes: List[int],
                        attack_magnitude: float,
                        attack_duration: int = 10,
                        time_step: int = 0,
                        se_result=None) -> SimulateAttackResponse:
        
        attack_type = attack_type.lower()
        
        if attack_type == 'constant_bias':
            return self.simulate_constant_bias_attack(
                base_measurements, target_nodes, attack_magnitude, attack_duration
            )
        elif attack_type == 'random':
            return self.simulate_random_attack(
                base_measurements, target_nodes, attack_magnitude, attack_duration
            )
        elif attack_type == 'ramp':
            return self.simulate_ramp_attack(
                base_measurements, target_nodes, attack_magnitude, attack_duration, time_step=time_step
            )
        elif attack_type == 'stealth':
            return self.simulate_stealth_attack(
                base_measurements, target_nodes, attack_magnitude, se_result
            )
        else:
            raise ValueError(f"Unknown attack type: {attack_type}. "
                           f"Supported types: constant_bias, random, ramp, stealth")
