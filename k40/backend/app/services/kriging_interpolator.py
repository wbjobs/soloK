import numpy as np
from typing import List, Tuple, Optional
from datetime import datetime
from scipy.ndimage import gaussian_filter, median_filter
from pykrige.ok import OrdinaryKriging
from pykrige.uk import UniversalKriging
from config import config
from app.models.data_models import SensorData, VoxelGrid, RiskAssessment

class KrigingInterpolator:
    def __init__(self):
        self.variogram_model = 'gaussian'
        self.nlags = 6
        self.enable_plotting = False
        
    def _extract_observation_points(self, sensor_data: List[SensorData], 
                                     contaminant: str) -> Tuple[np.ndarray, np.ndarray, np.ndarray, np.ndarray]:
        from app.services.data_generator import data_generator
        
        x_coords = []
        y_coords = []
        z_coords = []
        values = []
        
        well_dict = {w.well_id: w for w in data_generator.wells}
        
        for data in sensor_data:
            well = well_dict.get(data.well_id)
            if well and contaminant in data.contaminant_concentration:
                x_coords.append(well.x)
                y_coords.append(well.y)
                z_coords.append(well.z)
                values.append(data.contaminant_concentration[contaminant])
                
        return (np.array(x_coords), np.array(y_coords), 
                np.array(z_coords), np.array(values))
    
    def _create_grid(self) -> Tuple[np.ndarray, np.ndarray, np.ndarray, Tuple[int, int, int]]:
        x_min, x_max, y_min, y_max, z_min, z_max = config.SITE_BOUNDS
        dx, dy, dz = config.VOXEL_RESOLUTION
        
        nx = int(np.ceil((x_max - x_min) / dx)) + 1
        ny = int(np.ceil((y_max - y_min) / dy)) + 1
        nz = int(np.ceil((z_max - z_min) / dz)) + 1
        
        x_grid = np.linspace(x_min, x_max, nx)
        y_grid = np.linspace(y_min, y_max, ny)
        z_grid = np.linspace(z_min, z_max, nz)
        
        return x_grid, y_grid, z_grid, (nx, ny, nz)
    
    def _denoise_voxel_grid(self, data: np.ndarray) -> np.ndarray:
        result = data.copy()
        
        for k in range(result.shape[2]):
            slice_2d = result[:, :, k]
            median_filtered = median_filter(slice_2d, size=3)
            outlier_mask = np.abs(slice_2d - median_filtered) > 2.0 * np.std(slice_2d)
            result[:, :, k] = np.where(outlier_mask, median_filtered, slice_2d)
        
        sigma_xy = 0.8
        sigma_z = 0.5
        result = gaussian_filter(result, sigma=(sigma_xy, sigma_xy, sigma_z))
        
        result[result < 0] = 0
        
        return result
    
    def interpolate_3d(self, sensor_data: List[SensorData], 
                        contaminant: str = "TCE",
                        method: str = "ordinary") -> VoxelGrid:
        x_obs, y_obs, z_obs, values = self._extract_observation_points(sensor_data, contaminant)
        
        if len(x_obs) < 4:
            raise ValueError("Not enough observation points for Kriging interpolation")
            
        x_grid, y_grid, z_grid, dims = self._create_grid()
        nx, ny, nz = dims
        
        X, Y = np.meshgrid(x_grid, y_grid, indexing='ij')
        
        interpolated_data = np.zeros((nx, ny, nz))
        variance_data = np.zeros((nx, ny, nz))
        
        for k in range(nz):
            z_level = z_grid[k]
            
            try:
                if method == "ordinary":
                    OK = OrdinaryKriging(
                        x_obs, y_obs, values,
                        variogram_model=self.variogram_model,
                        nlags=self.nlags,
                        enable_plotting=self.enable_plotting,
                        exact_values=True
                    )
                    z_interp, z_var = OK.execute('grid', x_grid, y_grid)
                else:
                    UK = UniversalKriging(
                        x_obs, y_obs, values,
                        variogram_model=self.variogram_model,
                        nlags=self.nlags,
                        enable_plotting=self.enable_plotting,
                        drift_terms=['regional_linear']
                    )
                    z_interp, z_var = UK.execute('grid', x_grid, y_grid)
                    
                dist_weights = np.exp(-((z_obs - z_level)**2) / (2 * 5**2))
                weight_sum = np.sum(dist_weights)
                
                if weight_sum > 0:
                    weights = dist_weights / weight_sum
                    weighted_correction = np.sum(weights * (values - np.mean(values)))
                else:
                    weighted_correction = 0
                    
                interpolated_data[:, :, k] = z_interp + weighted_correction * 0.3
                variance_data[:, :, k] = z_var + np.abs(z_level - np.mean(z_obs)) * 0.1
                
            except Exception as e:
                print(f"Error interpolating z level {z_level}: {e}")
                interpolated_data[:, :, k] = np.mean(values)
                variance_data[:, :, k] = np.var(values)
        
        interpolated_data[interpolated_data < 0] = 0
        
        smoothed_data = self._denoise_voxel_grid(interpolated_data)
        
        x_min, x_max, y_min, y_max, z_min, z_max = config.SITE_BOUNDS
        
        return VoxelGrid(
            x_min=x_min, x_max=x_max,
            y_min=y_min, y_max=y_max,
            z_min=z_min, z_max=z_max,
            resolution=config.VOXEL_RESOLUTION,
            dimensions=dims,
            data=smoothed_data.flatten().tolist(),
            variance=variance_data.flatten().tolist(),
            timestamp=datetime.now(),
            contaminant=contaminant
        )
    
    def quick_interpolate(self, sensor_data: List[SensorData],
                           contaminant: str = "TCE") -> np.ndarray:
        x_obs, y_obs, z_obs, values = self._extract_observation_points(sensor_data, contaminant)
        x_grid, y_grid, z_grid, dims = self._create_grid()
        nx, ny, nz = dims
        
        result = np.zeros((nx, ny, nz))
        
        for i in range(nx):
            for j in range(ny):
                for k in range(nz):
                    distances = np.sqrt(
                        (x_grid[i] - x_obs)**2 + 
                        (y_grid[j] - y_obs)**2 + 
                        (z_grid[k] - z_obs)**2
                    )
                    
                    weights = 1.0 / (distances + 1e-6)**2
                    weights /= weights.sum()
                    
                    result[i, j, k] = np.sum(weights * values)
                    
        return result
    
    def compute_risk_assessment(self, voxel_grid: VoxelGrid,
                                 threshold: float = None) -> RiskAssessment:
        if threshold is None:
            threshold = config.CONTAMINANT_THRESHOLD
            
        data = np.array(voxel_grid.data)
        dx, dy, dz = config.VOXEL_RESOLUTION
        voxel_volume = dx * dy * dz
        
        exceedance_mask = data > threshold
        exceedance_count = np.sum(exceedance_mask)
        exceedance_volume = exceedance_count * voxel_volume
        total_volume = len(data) * voxel_volume
        
        high_risk_regions = []
        if exceedance_count > 0:
            dims = voxel_grid.dimensions
            grid_data = data.reshape(dims)
            
            for threshold_level in [threshold, threshold * 2, threshold * 5]:
                mask = grid_data > threshold_level
                if np.any(mask):
                    indices = np.where(mask)
                    high_risk_regions.append({
                        "threshold": threshold_level,
                        "voxel_count": int(np.sum(mask)),
                        "volume": float(np.sum(mask) * voxel_volume),
                        "max_concentration": float(grid_data[mask].max()),
                        "center": [
                            float(np.mean(indices[0]) * config.VOXEL_RESOLUTION[0] + voxel_grid.x_min),
                            float(np.mean(indices[1]) * config.VOXEL_RESOLUTION[1] + voxel_grid.y_min),
                            float(np.mean(indices[2]) * config.VOXEL_RESOLUTION[2] + voxel_grid.z_min)
                        ]
                    })
        
        return RiskAssessment(
            exceedance_volume=float(exceedance_volume),
            exceedance_percentage=float(exceedance_volume / total_volume * 100),
            high_risk_regions=high_risk_regions,
            total_volume=float(total_volume),
            threshold=threshold,
            contaminant=voxel_grid.contaminant,
            timestamp=voxel_grid.timestamp
        )

kriging_interpolator = KrigingInterpolator()
