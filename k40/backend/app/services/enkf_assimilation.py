import numpy as np
from typing import List, Dict, Tuple, Optional
from datetime import datetime
from config import config
from app.models.data_models import (
    EnKFConfig, 
    EnKFResult, 
    SensorData,
    VoxelGrid
)
from app.services.data_generator import data_generator

class EnsembleKalmanFilter:
    def __init__(self, config: EnKFConfig = None):
        self.config = config or EnKFConfig()
        self.ensemble_size = self.config.ensemble_size
        self.inflation_factor = self.config.inflation_factor
        self.observation_noise = self.config.observation_noise
        
        self.parameter_names = self.config.parameters_to_update
        self.parameter_ranges = {
            "hydraulic_conductivity": (1e-6, 1e-3),
            "porosity": (0.1, 0.5),
            "degradation_rate": (0.1, 2.0),
            "dispersion_coeff": (0.01, 1.0),
            "retardation_factor": (1.0, 10.0)
        }
        
        self.ensemble: Optional[np.ndarray] = None
        self.parameter_means: Dict[str, float] = {}
        self.parameter_stds: Dict[str, float] = {}
        
        self._initialize_ensemble()
    
    def _initialize_ensemble(self):
        num_params = len(self.parameter_names)
        self.ensemble = np.zeros((self.ensemble_size, num_params))
        
        for i, param in enumerate(self.parameter_names):
            low, high = self.parameter_ranges.get(param, (0.1, 1.0))
            mean = (low + high) / 2
            std = (high - low) / 4
            
            self.ensemble[:, i] = np.random.normal(
                loc=mean,
                scale=std,
                size=self.ensemble_size
            )
            
            self.ensemble[:, i] = np.clip(
                self.ensemble[:, i],
                low * 0.5,
                high * 2.0
            )
            
            self.parameter_means[param] = mean
            self.parameter_stds[param] = std
    
    def _get_observations(self, sensor_data: List[SensorData], 
                            contaminant: str = "TCE") -> Tuple[np.ndarray, np.ndarray]:
        observations = []
        observation_locations = []
        well_dict = {w.well_id: w for w in data_generator.wells}
        
        for data in sensor_data:
            well = well_dict.get(data.well_id)
            if well and contaminant in data.contaminant_concentration:
                observations.append(data.contaminant_concentration[contaminant])
                observation_locations.append((well.x, well.y, well.z))
        
        return np.array(observations), np.array(observation_locations)
    
    def _predict_concentrations(self, 
                                 params: np.ndarray,
                                 base_voxel_grid: VoxelGrid,
                                 observation_locations: np.ndarray) -> np.ndarray:
        param_dict = {}
        for i, name in enumerate(self.parameter_names):
            param_dict[name] = params[i]
        
        data = np.array(base_voxel_grid.data).reshape(base_voxel_grid.dimensions)
        
        k = param_dict.get("hydraulic_conductivity", 1e-4)
        phi = param_dict.get("porosity", 0.3)
        lambda_ = param_dict.get("degradation_rate", 0.5)
        alpha = param_dict.get("dispersion_coeff", 0.1)
        R = param_dict.get("retardation_factor", 2.0)
        
        predicted = data.copy()
        
        decay_scale = lambda_ * (1 / R)
        predicted = predicted * np.exp(-decay_scale * 0.1)
        
        from scipy.ndimage import gaussian_filter
        sigma = alpha * np.ones(3) / np.array(config.VOXEL_RESOLUTION)
        predicted = gaussian_filter(predicted, sigma=sigma * 0.5)
        
        predictions = []
        x_min, x_max, y_min, y_max, z_min, z_max = config.SITE_BOUNDS
        nx, ny, nz = base_voxel_grid.dimensions
        
        for loc in observation_locations:
            x, y, z = loc
            ix = int(np.clip((x - x_min) / (x_max - x_min) * (nx - 1), 0, nx - 1))
            iy = int(np.clip((y - y_min) / (y_max - y_min) * (ny - 1), 0, ny - 1))
            iz = int(np.clip((z - z_min) / (z_max - z_min) * (nz - 1), 0, nz - 1))
            
            predictions.append(predicted[ix, iy, iz])
        
        return np.array(predictions)
    
    def _compute_ensemble_predictions(self,
                                        base_voxel_grid: VoxelGrid,
                                        observation_locations: np.ndarray) -> np.ndarray:
        num_obs = len(observation_locations)
        predictions = np.zeros((self.ensemble_size, num_obs))
        
        for e in range(self.ensemble_size):
            predictions[e] = self._predict_concentrations(
                self.ensemble[e],
                base_voxel_grid,
                observation_locations
            )
        
        return predictions
    
    def assimilate(self,
                    sensor_data: List[SensorData],
                    base_voxel_grid: VoxelGrid,
                    contaminant: str = "TCE") -> EnKFResult:
        observations, observation_locations = self._get_observations(sensor_data, contaminant)
        
        if len(observations) == 0:
            return EnKFResult(
                updated_parameters=self.parameter_means,
                parameter_uncertainty=self.parameter_stds,
                forecast_improvement=0.0,
                innovation_statistics={"error": "No valid observations"}
            )
        
        num_obs = len(observations)
        num_params = len(self.parameter_names)
        
        HX = self._compute_ensemble_predictions(base_voxel_grid, observation_locations)
        
        HX_mean = np.mean(HX, axis=0)
        X_mean = np.mean(self.ensemble, axis=0)
        
        PX = (self.ensemble - X_mean).T / np.sqrt(self.ensemble_size - 1)
        PHX = (HX - HX_mean).T / np.sqrt(self.ensemble_size - 1)
        
        PHT = PX @ PHX.T
        HPHT = PHX @ PHX.T
        
        R = np.eye(num_obs) * (self.observation_noise ** 2)
        HPHT_plus_R = HPHT + R
        
        try:
            K = PHT @ np.linalg.inv(HPHT_plus_R)
        except np.linalg.LinAlgError:
            K = PHT @ np.linalg.pinv(HPHT_plus_R)
        
        innovations = np.zeros((self.ensemble_size, num_obs))
        for e in range(self.ensemble_size):
            obs_noise = np.random.normal(0, self.observation_noise, size=num_obs)
            innovations[e] = observations + obs_noise - HX[e]
        
        ensemble_old = self.ensemble.copy()
        self.ensemble = self.ensemble + innovations @ K.T
        
        for i in range(num_params):
            self.ensemble[:, i] = self._apply_bounds(self.ensemble[:, i], self.parameter_names[i])
        
        self.ensemble = X_mean + self.inflation_factor * (self.ensemble - X_mean)
        
        updated_means = {}
        updated_stds = {}
        for i, name in enumerate(self.parameter_names):
            updated_means[name] = float(np.mean(self.ensemble[:, i]))
            updated_stds[name] = float(np.std(self.ensemble[:, i]))
        
        innovation_mean = np.mean(innovations, axis=0)
        innovation_std = np.std(innovations, axis=0)
        rmse_before = np.sqrt(np.mean((HX_mean - observations) ** 2))
        
        HX_after = self._compute_ensemble_predictions(base_voxel_grid, observation_locations)
        HX_after_mean = np.mean(HX_after, axis=0)
        rmse_after = np.sqrt(np.mean((HX_after_mean - observations) ** 2))
        
        forecast_improvement = (rmse_before - rmse_after) / rmse_before if rmse_before > 0 else 0
        
        updated_voxel = self._update_voxel_grid(base_voxel_grid, updated_means)
        
        return EnKFResult(
            updated_parameters=updated_means,
            parameter_uncertainty=updated_stds,
            forecast_improvement=float(forecast_improvement),
            updated_voxel_grid=updated_voxel,
            innovation_statistics={
                "rmse_before": float(rmse_before),
                "rmse_after": float(rmse_after),
                "mean_innovation": float(np.mean(np.abs(innovation_mean))),
                "std_innovation": float(np.mean(innovation_std)),
                "num_observations": num_obs
            }
        )
    
    def _apply_bounds(self, values: np.ndarray, param_name: str) -> np.ndarray:
        low, high = self.parameter_ranges.get(param_name, (0.01, 100.0))
        return np.clip(values, low * 0.5, high * 2.0)
    
    def _update_voxel_grid(self, 
                             base_voxel_grid: VoxelGrid,
                             updated_params: Dict[str, float]) -> Dict:
        data = np.array(base_voxel_grid.data).reshape(base_voxel_grid.dimensions)
        
        lambda_new = updated_params.get("degradation_rate", 0.5)
        lambda_old = 0.5
        scale = np.exp((lambda_old - lambda_new) * 0.5)
        
        updated_data = data * scale
        
        return {
            "data": updated_data.flatten().tolist(),
            "dimensions": base_voxel_grid.dimensions,
            "x_min": base_voxel_grid.x_min,
            "x_max": base_voxel_grid.x_max,
            "y_min": base_voxel_grid.y_min,
            "y_max": base_voxel_grid.y_max,
            "z_min": base_voxel_grid.z_min,
            "z_max": base_voxel_grid.z_max,
            "contaminant": base_voxel_grid.contaminant,
            "timestamp": datetime.now().isoformat()
        }
    
    def get_current_parameters(self) -> Dict[str, float]:
        return self.parameter_means.copy()
    
    def reset_ensemble(self):
        self._initialize_ensemble()

enkf_filter = EnsembleKalmanFilter()
