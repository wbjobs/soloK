import numpy as np
from typing import Tuple, Optional
from datetime import datetime
from scipy.ndimage import gaussian_filter
from config import config
from app.models.data_models import ForecastRequest, VoxelGrid
from app.services.data_generator import data_generator
from app.services.kriging_interpolator import kriging_interpolator

class PlumeForecaster:
    def __init__(self):
        self.longitudinal_dispersivity = 5.0
        self.transverse_dispersivity = 2.0
        self.vertical_dispersivity = 0.5
        
    def _create_grid_arrays(self) -> Tuple[np.ndarray, np.ndarray, np.ndarray]:
        x_min, x_max, y_min, y_max, z_min, z_max = config.SITE_BOUNDS
        dx, dy, dz = config.VOXEL_RESOLUTION
        
        nx = int(np.ceil((x_max - x_min) / dx)) + 1
        ny = int(np.ceil((y_max - y_min) / dy)) + 1
        nz = int(np.ceil((z_max - z_min) / dz)) + 1
        
        x = np.linspace(x_min, x_max, nx)
        y = np.linspace(y_min, y_max, ny)
        z = np.linspace(z_min, z_max, nz)
        
        return np.meshgrid(x, y, z, indexing='ij')
    
    def _apply_advection(self, concentration: np.ndarray, 
                         velocity: Tuple[float, float, float],
                         dt: float) -> np.ndarray:
        vx, vy, vz = velocity
        dx, dy, dz = config.VOXEL_RESOLUTION
        
        shifted = concentration.copy()
        
        if abs(vx) > 0:
            flux_x = vx * dt / dx
            if flux_x > 0.5:
                flux_x = 0.5
            if vx > 0:
                shifted[1:, :, :] = (1 - flux_x) * concentration[1:, :, :] + flux_x * concentration[:-1, :, :]
                shifted[0, :, :] = concentration[0, :, :]
            else:
                flux_x = -flux_x
                shifted[:-1, :, :] = (1 - flux_x) * concentration[:-1, :, :] + flux_x * concentration[1:, :, :]
                shifted[-1, :, :] = concentration[-1, :, :]
            
        if abs(vy) > 0:
            flux_y = vy * dt / dy
            if flux_y > 0.5:
                flux_y = 0.5
            if vy > 0:
                shifted[:, 1:, :] = (1 - flux_y) * shifted[:, 1:, :] + flux_y * shifted[:, :-1, :]
                shifted[:, 0, :] = shifted[:, 0, :]
            else:
                flux_y = -flux_y
                shifted[:, :-1, :] = (1 - flux_y) * shifted[:, :-1, :] + flux_y * shifted[:, 1:, :]
                shifted[:, -1, :] = shifted[:, -1, :]
            
        return np.clip(shifted, 0, None)
    
    def _apply_dispersion(self, concentration: np.ndarray, dt: float) -> np.ndarray:
        sigma_x = np.sqrt(2 * self.longitudinal_dispersivity * dt)
        sigma_y = np.sqrt(2 * self.transverse_dispersivity * dt)
        sigma_z = np.sqrt(2 * self.vertical_dispersivity * dt)
        
        dx, dy, dz = config.VOXEL_RESOLUTION
        sigmas = (sigma_x / dx, sigma_y / dy, sigma_z / dz)
        
        return gaussian_filter(concentration, sigma=sigmas)
    
    def _apply_decay(self, concentration: np.ndarray, 
                     half_life_days: float, dt: float) -> np.ndarray:
        decay_rate = np.log(2) / (half_life_days * 24 * 3600)
        return concentration * np.exp(-decay_rate * dt)
    
    def _apply_sorption(self, concentration: np.ndarray, 
                        retardation_factor: float) -> np.ndarray:
        return concentration / retardation_factor
    
    def forecast(self, request: ForecastRequest, 
                 current_voxel_grid: VoxelGrid) -> VoxelGrid:
        dims = current_voxel_grid.dimensions
        current_data = np.array(current_voxel_grid.data).reshape(dims)
        
        X, Y, Z = self._create_grid_arrays()
        
        if request.hydraulic_gradient is None:
            gradient = (0.001, 0.001)
        else:
            gradient = request.hydraulic_gradient
            
        hydraulic_conductivity = 1e-4
        porosity = request.porosity
        retardation = request.retardation_factor
        
        seepage_velocity = (
            -hydraulic_conductivity * gradient[0] / (porosity * retardation),
            -hydraulic_conductivity * gradient[1] / (porosity * retardation),
            0.0
        )
        
        total_hours = request.months_ahead * 30 * 24
        dt_hours = 1
        num_steps = int(total_hours / dt_hours)
        dt_seconds = dt_hours * 3600
        
        concentration = current_data.copy()
        
        for step in range(num_steps):
            concentration = self._apply_advection(concentration, seepage_velocity, dt_seconds)
            concentration = self._apply_dispersion(concentration, dt_seconds)
            concentration = self._apply_decay(concentration, 180, dt_seconds)
            
            concentration[concentration < 0.001] = 0
            
        return VoxelGrid(
            x_min=current_voxel_grid.x_min,
            x_max=current_voxel_grid.x_max,
            y_min=current_voxel_grid.y_min,
            y_max=current_voxel_grid.y_max,
            z_min=current_voxel_grid.z_min,
            z_max=current_voxel_grid.z_max,
            resolution=current_voxel_grid.resolution,
            dimensions=dims,
            data=concentration.flatten().tolist(),
            variance=None,
            timestamp=datetime.now(),
            contaminant=request.contaminant
        )
    
    def generate_time_series(self, sensor_data_list, 
                              start_time: datetime,
                              end_time: datetime,
                              interval_hours: int = 24,
                              contaminant: str = "TCE"):
        time_points = []
        current_time = start_time
        hours_from_start = 0
        
        while current_time <= end_time:
            time_hours = hours_from_start
            
            current_sensor_data = [
                data_generator.generate_sensor_data(w.well_id, current_time, time_hours)
                for w in data_generator.wells
            ]
            
            voxel_grid = kriging_interpolator.interpolate_3d(
                current_sensor_data, contaminant
            )
            
            well_data = []
            for sd in current_sensor_data:
                well = next(w for w in data_generator.wells if w.well_id == sd.well_id)
                well_data.append({
                    "well_id": sd.well_id,
                    "x": well.x,
                    "y": well.y,
                    "z": well.z,
                    "concentration": sd.contaminant_concentration.get(contaminant, 0),
                    "water_level": sd.water_level,
                    "temperature": sd.temperature
                })
            
            time_points.append({
                "timestamp": current_time.isoformat(),
                "voxel_data": voxel_grid.data,
                "variance": voxel_grid.variance,
                "well_data": well_data
            })
            
            current_time += np.timedelta64(interval_hours, 'h')
            hours_from_start += interval_hours
            
        return time_points

plume_forecaster = PlumeForecaster()
