import numpy as np
from typing import List, Tuple, Dict
from config import config
from app.models.data_models import OptimizationResult, SensorData
from app.services.data_generator import data_generator
from app.services.kriging_interpolator import kriging_interpolator

class MonitoringNetworkOptimizer:
    def __init__(self):
        self.variance_threshold = 0.1
        
    def _create_candidate_locations(self, 
                                     existing_wells: List,
                                     num_candidates: int = 50) -> List[Tuple[float, float, float]]:
        x_min, x_max, y_min, y_max, z_min, z_max = config.SITE_BOUNDS
        
        candidates = []
        existing_coords = [(w.x, w.y) for w in existing_wells]
        
        while len(candidates) < num_candidates:
            x = np.random.uniform(x_min + 5, x_max - 5)
            y = np.random.uniform(y_min + 5, y_max - 5)
            z = np.random.uniform(z_min + 2, z_max - 2)
            
            min_dist = min(np.sqrt((x - ex)**2 + (y - ey)**2) for ex, ey in existing_coords)
            if min_dist > 10:
                candidates.append((x, y, z))
                
        return candidates
    
    def _compute_kriging_variance(self, 
                                   sensor_data: List[SensorData],
                                   candidate_location: Tuple[float, float, float],
                                   contaminant: str = "TCE") -> float:
        x_obs, y_obs, z_obs, values = kriging_interpolator._extract_observation_points(
            sensor_data, contaminant
        )
        
        cx, cy, cz = candidate_location
        
        distances = np.sqrt(
            (x_obs - cx)**2 + 
            (y_obs - cy)**2 + 
            (z_obs - cz)**2
        )
        
        if len(distances) < 4:
            return 1.0
            
        nugget = 0.1
        sill = np.var(values) if len(values) > 1 else 1.0
        range_param = 20.0
        
        def variogram(h):
            return nugget + sill * (1 - np.exp(-h / range_param))
        
        n = len(x_obs)
        C = np.zeros((n + 1, n + 1))
        
        for i in range(n):
            for j in range(n):
                h = np.sqrt((x_obs[i] - x_obs[j])**2 + 
                           (y_obs[i] - y_obs[j])**2 + 
                           (z_obs[i] - z_obs[j])**2)
                C[i, j] = variogram(h)
            C[i, n] = 1
            C[n, i] = 1
        C[n, n] = 0
        
        c = np.zeros(n + 1)
        for i in range(n):
            h = distances[i]
            c[i] = variogram(h)
        c[n] = 1
        
        try:
            C_inv = np.linalg.inv(C)
            variance = variogram(0) - np.dot(c.T, np.dot(C_inv, c))
            return max(0, float(variance))
        except np.linalg.LinAlgError:
            return float(np.var(values))
    
    def _evaluate_objective(self,
                            sensor_data: List[SensorData],
                            candidate_locations: List[Tuple[float, float, float]],
                            contaminant: str = "TCE") -> Tuple[float, List[float]]:
        x_grid, y_grid, z_grid, dims = kriging_interpolator._create_grid()
        nx, ny, nz = dims
        
        variances = np.zeros((nx, ny, nz))
        
        for i in range(nx):
            for j in range(ny):
                for k in range(nz):
                    x = x_grid[i]
                    y = y_grid[j]
                    z = z_grid[k]
                    
                    all_obs_x = np.array([w.x for w in data_generator.wells] + 
                                        [c[0] for c in candidate_locations])
                    all_obs_y = np.array([w.y for w in data_generator.wells] + 
                                        [c[1] for c in candidate_locations])
                    all_obs_z = np.array([w.z for w in data_generator.wells] + 
                                        [c[2] for c in candidate_locations])
                    
                    distances = np.sqrt(
                        (all_obs_x - x)**2 + 
                        (all_obs_y - y)**2 + 
                        (all_obs_z - z)**2
                    )
                    
                    weights = 1.0 / (distances + 1e-6)**2
                    weights /= weights.sum()
                    
                    well_values = []
                    for sd in sensor_data:
                        if contaminant in sd.contaminant_concentration:
                            well_values.append(sd.contaminant_concentration[contaminant])
                    
                    if len(well_values) == len(data_generator.wells):
                        for c in candidate_locations:
                            interp_val = self._interpolate_at_point(
                                sensor_data, c, contaminant
                            )
                            well_values.append(interp_val)
                    
                    variances[i, j, k] = np.sum(weights**2 * np.var(well_values)) if len(well_values) > 1 else 1.0
        
        return float(np.mean(variances)), variances.flatten().tolist()
    
    def _interpolate_at_point(self,
                               sensor_data: List[SensorData],
                               point: Tuple[float, float, float],
                               contaminant: str) -> float:
        x_obs, y_obs, z_obs, values = kriging_interpolator._extract_observation_points(
            sensor_data, contaminant
        )
        
        px, py, pz = point
        distances = np.sqrt(
            (x_obs - px)**2 + 
            (y_obs - py)**2 + 
            (z_obs - pz)**2
        )
        
        weights = 1.0 / (distances + 1e-6)**2
        weights /= weights.sum()
        
        return float(np.sum(weights * values))
    
    def optimize_network(self,
                          sensor_data: List[SensorData],
                          num_new_wells: int = 5,
                          contaminant: str = "TCE") -> OptimizationResult:
        existing_wells = data_generator.wells
        candidates = self._create_candidate_locations(existing_wells)
        
        current_mean_var, current_variance_field = self._evaluate_objective(
            sensor_data, [], contaminant
        )
        
        selected_candidates = []
        variance_reductions = []
        
        available_candidates = candidates.copy()
        
        for _ in range(num_new_wells):
            best_candidate = None
            best_variance_reduction = -1
            
            for candidate in available_candidates:
                test_candidates = selected_candidates + [candidate]
                test_mean_var, _ = self._evaluate_objective(
                    sensor_data, test_candidates, contaminant
                )
                
                variance_reduction = current_mean_var - test_mean_var
                if variance_reduction > best_variance_reduction:
                    best_variance_reduction = variance_reduction
                    best_candidate = candidate
            
            if best_candidate and best_variance_reduction > 0:
                selected_candidates.append(best_candidate)
                variance_reductions.append(best_variance_reduction)
                available_candidates.remove(best_candidate)
            else:
                break
        
        _, final_variance_field = self._evaluate_objective(
            sensor_data, selected_candidates, contaminant
        )
        
        return OptimizationResult(
            candidate_locations=[tuple(map(float, c)) for c in selected_candidates],
            variance_reduction=[float(v) for v in variance_reductions],
            current_max_variance=float(np.max(current_variance_field)),
            optimized_max_variance=float(np.max(final_variance_field))
        )

monitoring_optimizer = MonitoringNetworkOptimizer()
