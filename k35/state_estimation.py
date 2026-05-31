import numpy as np
from scipy.sparse import csr_matrix
from scipy.sparse.linalg import spsolve
from typing import List, Tuple, Dict, Optional
from dataclasses import dataclass
import logging

from schemas import MeasurementData

logger = logging.getLogger(__name__)


@dataclass
class StateEstimationResult:
    voltage_magnitudes: np.ndarray
    voltage_angles: np.ndarray
    residuals: np.ndarray
    normalized_residuals: np.ndarray
    estimated_measurements: np.ndarray
    covariance_matrix: Optional[np.ndarray]
    convergence: bool
    iterations: int
    chi_square_value: float
    degrees_of_freedom: int


class WeightedLeastSquaresEstimator:
    def __init__(self, n_nodes: int, tolerance: float = 1e-6, max_iterations: int = 100):
        self.n_nodes = n_nodes
        self.tolerance = tolerance
        self.max_iterations = max_iterations
        
    def _build_measurement_vector(self, measurements: List[MeasurementData]) -> np.ndarray:
        z = []
        for m in measurements:
            z.extend([m.voltage_magnitude, m.voltage_angle, m.active_power, m.reactive_power])
        return np.array(z)
    
    def _build_weight_matrix(self, n_measurements: int, 
                             voltage_std: float = 0.01,
                             angle_std: float = 0.001,
                             power_std: float = 0.02) -> np.ndarray:
        weights = []
        for _ in range(n_measurements // 4):
            weights.extend([1/voltage_std**2, 1/angle_std**2, 1/power_std**2, 1/power_std**2])
        return np.diag(weights)
    
    def _build_jacobian(self, voltage_magnitudes: np.ndarray, 
                        voltage_angles: np.ndarray,
                        measurements: List[MeasurementData]) -> np.ndarray:
        n_meas = len(measurements)
        n_states = 2 * n_meas
        n_measurements = 4 * n_meas
        H = np.zeros((n_measurements, n_states), dtype=np.float64)
        
        for i in range(n_meas):
            V_i = voltage_magnitudes[i]
            theta_i = voltage_angles[i]
            
            row_base = 4 * i
            
            H[row_base, 2 * i] = 1.0
            H[row_base + 1, 2 * i + 1] = 1.0
            
            sum_cos = 0.0
            sum_sin = 0.0
            sum_sin_v = 0.0
            sum_cos_v = 0.0
            
            for j in range(n_meas):
                if i != j:
                    V_j = voltage_magnitudes[j]
                    theta_j = voltage_angles[j]
                    d_theta = theta_i - theta_j
                    
                    cos_dtheta = np.cos(d_theta)
                    sin_dtheta = np.sin(d_theta)
                    
                    sum_cos += V_j * cos_dtheta
                    sum_sin += V_j * sin_dtheta
                    sum_sin_v += V_i * V_j * sin_dtheta
                    sum_cos_v += V_i * V_j * cos_dtheta
                    
                    H[row_base + 2, 2 * j] = -V_j * cos_dtheta
                    H[row_base + 2, 2 * j + 1] = -V_i * V_j * sin_dtheta
                    
                    H[row_base + 3, 2 * j] = -V_j * sin_dtheta
                    H[row_base + 3, 2 * j + 1] = V_i * V_j * cos_dtheta
            
            H[row_base + 2, 2 * i] = 2 * V_i - sum_cos
            H[row_base + 2, 2 * i + 1] = sum_sin_v
            
            H[row_base + 3, 2 * i] = 2 * V_i - sum_sin
            H[row_base + 3, 2 * i + 1] = -sum_cos_v
        
        return H
    
    def _calculate_estimated_measurements(self, voltage_magnitudes: np.ndarray,
                                          voltage_angles: np.ndarray,
                                          measurements: List[MeasurementData]) -> np.ndarray:
        z_est = []
        node_idx_map = {m.node_id: i for i, m in enumerate(measurements)}
        
        for i, m in enumerate(measurements):
            idx = node_idx_map[m.node_id]
            V_i = voltage_magnitudes[idx]
            theta_i = voltage_angles[idx]
            
            z_est.append(V_i)
            z_est.append(theta_i)
            
            P_i = V_i ** 2
            Q_i = V_i ** 2
            
            for j, other_m in enumerate(measurements):
                if i != j:
                    idx_j = node_idx_map[other_m.node_id]
                    V_j = voltage_magnitudes[idx_j]
                    theta_j = voltage_angles[idx_j]
                    d_theta = theta_i - theta_j
                    
                    P_i -= V_i * V_j * np.cos(d_theta)
                    Q_i -= V_i * V_j * np.sin(d_theta)
            
            z_est.append(P_i)
            z_est.append(Q_i)
        
        return np.array(z_est)
    
    def estimate(self, measurements: List[MeasurementData],
                 initial_voltage: Optional[np.ndarray] = None,
                 initial_angle: Optional[np.ndarray] = None) -> StateEstimationResult:
        
        n_measurements = len(measurements)
        n_states = 2 * n_measurements
        
        z = self._build_measurement_vector(measurements).astype(np.float64)
        W = self._build_weight_matrix(len(z)).astype(np.float64)
        
        if initial_voltage is None:
            voltage_magnitudes = np.ones(n_measurements, dtype=np.float64)
        else:
            voltage_magnitudes = initial_voltage.astype(np.float64).copy()
            
        if initial_angle is None:
            voltage_angles = np.zeros(n_measurements, dtype=np.float64)
        else:
            voltage_angles = initial_angle.astype(np.float64).copy()
        
        convergence = False
        iterations = 0
        regularization = 1e-6
        
        while not convergence and iterations < self.max_iterations:
            iterations += 1
            
            z_est = self._calculate_estimated_measurements(
                voltage_magnitudes, voltage_angles, measurements
            ).astype(np.float64)
            
            residuals = z - z_est
            
            H = self._build_jacobian(voltage_magnitudes, voltage_angles, measurements).astype(np.float64)
            
            G = H.T @ W @ H
            G = G + regularization * np.eye(G.shape[0], dtype=np.float64)
            
            try:
                delta_x = np.linalg.solve(G, H.T @ W @ residuals)
            except np.linalg.LinAlgError:
                try:
                    G_inv = np.linalg.pinv(G, rcond=1e-10)
                    delta_x = G_inv @ H.T @ W @ residuals
                except Exception as e:
                    logger.warning(f"SVD failed at iteration {iterations}: {e}")
                    convergence = False
                    break
            
            max_update = np.max(np.abs(delta_x))
            if max_update > 10.0:
                delta_x = delta_x / max_update * 10.0
                logger.warning(f"Large update detected (max={max_update:.4f}), scaling step")
            
            voltage_magnitudes += delta_x[0::2][:n_measurements]
            voltage_angles += delta_x[1::2][:n_measurements]
            
            voltage_magnitudes = np.clip(voltage_magnitudes, 0.1, 2.0)
            voltage_angles = np.clip(voltage_angles, -np.pi, np.pi)
            
            if np.max(np.abs(delta_x)) < self.tolerance:
                convergence = True
        
        if not convergence:
            logger.warning(f"State estimation did not converge after {iterations} iterations")
        
        z_est = self._calculate_estimated_measurements(
            voltage_magnitudes, voltage_angles, measurements
        ).astype(np.float64)
        residuals = z - z_est
        
        H = self._build_jacobian(voltage_magnitudes, voltage_angles, measurements).astype(np.float64)
        G = H.T @ W @ H + regularization * np.eye(H.shape[1], dtype=np.float64)
        
        try:
            sigma = np.linalg.pinv(H.T @ W @ H, rcond=1e-10)
        except:
            sigma = np.eye(H.shape[1], dtype=np.float64) * 1e-3
        
        cov_matrix = sigma
        
        try:
            R_inv = W
            residual_cov = np.diag(W) - np.diag(H @ sigma @ H.T)
            residual_std = np.sqrt(np.maximum(residual_cov, 1e-10))
        except:
            residual_std = np.ones_like(residuals) * 0.01
        
        with np.errstate(divide='ignore', invalid='ignore'):
            normalized_residuals = np.where(residual_std > 1e-10, 
                                            residuals / residual_std, 
                                            0.0)
        
        normalized_residuals = np.nan_to_num(normalized_residuals, posinf=100.0, neginf=-100.0)
        
        degrees_of_freedom = max(len(z) - n_states, 1)
        chi_square_value = float(np.clip(residuals.T @ W @ residuals, 0, 1e10))
        
        return StateEstimationResult(
            voltage_magnitudes=voltage_magnitudes,
            voltage_angles=voltage_angles,
            residuals=residuals,
            normalized_residuals=normalized_residuals,
            estimated_measurements=z_est,
            covariance_matrix=cov_matrix,
            convergence=convergence,
            iterations=iterations,
            chi_square_value=chi_square_value,
            degrees_of_freedom=degrees_of_freedom
        )
