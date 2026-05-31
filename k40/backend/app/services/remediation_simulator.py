import numpy as np
from typing import List, Dict, Tuple
from datetime import datetime, timedelta
from config import config
from app.models.data_models import (
    InjectionWell, 
    RemediationRequest, 
    RemediationResult,
    VoxelGrid
)

class RemediationSimulator:
    def __init__(self):
        self.dx, self.dy, self.dz = config.VOXEL_RESOLUTION
        self.voxel_volume = self.dx * self.dy * self.dz
        
    def _create_grid(self) -> Tuple[np.ndarray, np.ndarray, np.ndarray, Tuple[int, int, int]]:
        x_min, x_max, y_min, y_max, z_min, z_max = config.SITE_BOUNDS
        nx = int(np.ceil((x_max - x_min) / self.dx)) + 1
        ny = int(np.ceil((y_max - y_min) / self.dy)) + 1
        nz = int(np.ceil((z_max - z_min) / self.dz)) + 1
        
        x_grid = np.linspace(x_min, x_max, nx)
        y_grid = np.linspace(y_min, y_max, ny)
        z_grid = np.linspace(z_min, z_max, nz)
        
        return x_grid, y_grid, z_grid, (nx, ny, nz)
    
    def _find_injection_indices(self, 
                                  injection_wells: List[InjectionWell],
                                  x_grid: np.ndarray,
                                  y_grid: np.ndarray,
                                  z_grid: np.ndarray) -> List[Tuple[int, int, int, InjectionWell]]:
        indices = []
        for well in injection_wells:
            if not well.active:
                continue
                
            ix = np.argmin(np.abs(x_grid - well.x))
            iy = np.argmin(np.abs(y_grid - well.y))
            iz = np.argmin(np.abs(z_grid - well.z))
            indices.append((ix, iy, iz, well))
            
        return indices
    
    def _apply_injection(self, 
                         reagent_field: np.ndarray,
                         injection_indices: List[Tuple[int, int, int, InjectionWell]],
                         dt_days: float) -> np.ndarray:
        result = reagent_field.copy()
        
        for ix, iy, iz, well in injection_indices:
            injection_mass = (well.injection_rate * well.reagent_concentration) * dt_days
            radius_voxels = 2
            
            for dx in range(-radius_voxels, radius_voxels + 1):
                for dy in range(-radius_voxels, radius_voxels + 1):
                    for dz in range(-radius_voxels, radius_voxels + 1):
                        nx, ny, nz = reagent_field.shape
                        if 0 <= ix + dx < nx and 0 <= iy + dy < ny and 0 <= iz + dz < nz:
                            dist = np.sqrt(dx**2 + dy**2 + dz**2)
                            weight = np.exp(-dist**2 / (2 * 1.5**2))
                            result[ix + dx, iy + dy, iz + dz] += injection_mass * weight * 0.1
            
            result[ix, iy, iz] += injection_mass * 0.5
            
        return result
    
    def _apply_reagent_diffusion(self, 
                                   reagent_field: np.ndarray,
                                   dt_days: float,
                                   diffusion_coeff: float = 0.1) -> np.ndarray:
        from scipy.ndimage import gaussian_filter
        
        sigma = np.sqrt(2 * diffusion_coeff * dt_days) / np.array([self.dx, self.dy, self.dz])
        sigma = np.maximum(sigma, 0.3)
        
        return gaussian_filter(reagent_field, sigma=sigma)
    
    def _apply_reagent_decay(self,
                              reagent_field: np.ndarray,
                              injection_wells: List[InjectionWell],
                              dt_days: float) -> np.ndarray:
        if len(injection_wells) == 0:
            return reagent_field
            
        avg_half_life = np.mean([w.reaction_half_life for w in injection_wells if w.active])
        decay_rate = np.log(2) / avg_half_life
        
        return reagent_field * np.exp(-decay_rate * dt_days)
    
    def _apply_contaminant_degradation(self,
                                        concentration_field: np.ndarray,
                                        reagent_field: np.ndarray,
                                        injection_wells: List[InjectionWell],
                                        dt_days: float) -> np.ndarray:
        if len(injection_wells) == 0:
            return concentration_field
            
        avg_degradation = np.mean([w.degradation_rate for w in injection_wells if w.active])
        
        reagent_normalized = reagent_field / (reagent_field.max() + 1e-6)
        effective_rate = avg_degradation * (0.1 + 0.9 * reagent_normalized)
        
        degradation = effective_rate * dt_days
        degradation = np.clip(degradation, 0, 0.9)
        
        return concentration_field * (1 - degradation)
    
    def _apply_advection_dispersion(self,
                                     concentration_field: np.ndarray,
                                     dt_days: float,
                                     hydraulic_gradient: Tuple[float, float] = (0.001, 0.001),
                                     porosity: float = 0.3,
                                     hydraulic_conductivity: float = 1e-4) -> np.ndarray:
        result = concentration_field.copy()
        nx, ny, nz = concentration_field.shape
        
        seepage_velocity = (
            -hydraulic_conductivity * hydraulic_gradient[0] / porosity,
            -hydraulic_conductivity * hydraulic_gradient[1] / porosity,
            0.0
        )
        
        vx_dt = seepage_velocity[0] * 86400 * dt_days / self.dx
        vy_dt = seepage_velocity[1] * 86400 * dt_days / self.dy
        
        if abs(vx_dt) > 0.01:
            if vx_dt > 0:
                result[1:, :, :] = (1 - vx_dt) * result[1:, :, :] + vx_dt * result[:-1, :, :]
            else:
                result[:-1, :, :] = (1 + vx_dt) * result[:-1, :, :] - vx_dt * result[1:, :, :]
        
        if abs(vy_dt) > 0.01:
            if vy_dt > 0:
                result[:, 1:, :] = (1 - vy_dt) * result[:, 1:, :] + vy_dt * result[:, :-1, :]
            else:
                result[:, :-1, :] = (1 + vy_dt) * result[:, :-1, :] - vy_dt * result[:, 1:, :]
        
        return np.clip(result, 0, None)
    
    def simulate_remediation(self,
                              request: RemediationRequest,
                              initial_voxel_grid: VoxelGrid) -> RemediationResult:
        x_grid, y_grid, z_grid, dims = self._create_grid()
        nx, ny, nz = dims
        
        concentration = np.array(initial_voxel_grid.data).reshape(dims)
        reagent = np.zeros_like(concentration)
        
        injection_indices = self._find_injection_indices(
            request.injection_wells, x_grid, y_grid, z_grid
        )
        
        num_steps = int(request.duration_days / request.timestep_days)
        dt = request.timestep_days
        
        time_series = []
        total_reagent = 0.0
        
        initial_mass = np.sum(concentration) * self.voxel_volume
        
        for step in range(num_steps + 1):
            current_day = step * dt
            
            if step > 0:
                reagent = self._apply_injection(reagent, injection_indices, dt)
                reagent = self._apply_reagent_diffusion(reagent, dt)
                reagent = self._apply_reagent_decay(reagent, request.injection_wells, dt)
                
                concentration = self._apply_contaminant_degradation(
                    concentration, reagent, request.injection_wells, dt
                )
                
                concentration = self._apply_advection_dispersion(concentration, dt)
                
                for well in request.injection_wells:
                    if well.active:
                        total_reagent += well.injection_rate * well.reagent_concentration * dt
            
            if request.show_animation and step % max(1, int(5 / dt)) == 0:
                timestamp = datetime.now() + timedelta(days=current_day)
                time_series.append({
                    "day": current_day,
                    "timestamp": timestamp.isoformat(),
                    "concentration": concentration.flatten().tolist(),
                    "reagent": reagent.flatten().tolist()
                })
        
        final_mass = np.sum(concentration) * self.voxel_volume
        reduction_percentage = (1 - final_mass / initial_mass) * 100 if initial_mass > 0 else 0
        
        threshold = config.CONTAMINANT_THRESHOLD
        initial_exceedance = np.sum(concentration > threshold) * self.voxel_volume
        final_exceedance = np.sum(concentration > threshold) * self.voxel_volume
        risk_reduction = (1 - final_exceedance / initial_exceedance) * 100 if initial_exceedance > 0 else 0
        
        return RemediationResult(
            initial_state={
                "concentration": np.array(initial_voxel_grid.data).tolist(),
                "mass": float(initial_mass),
                "timestamp": initial_voxel_grid.timestamp.isoformat()
            },
            final_state={
                "concentration": concentration.flatten().tolist(),
                "mass": float(final_mass),
                "timestamp": (datetime.now() + timedelta(days=request.duration_days)).isoformat()
            },
            time_series=time_series,
            reduction_percentage=float(reduction_percentage),
            risk_reduction=float(risk_reduction),
            total_reagent_used=float(total_reagent)
        )
    
    def compute_reagent_distribution(self,
                                      injection_wells: List[InjectionWell],
                                      days: int = 7) -> np.ndarray:
        x_grid, y_grid, z_grid, dims = self._create_grid()
        reagent = np.zeros(dims)
        
        injection_indices = self._find_injection_indices(
            injection_wells, x_grid, y_grid, z_grid
        )
        
        dt = 1.0
        for day in range(days):
            reagent = self._apply_injection(reagent, injection_indices, dt)
            reagent = self._apply_reagent_diffusion(reagent, dt)
            reagent = self._apply_reagent_decay(reagent, injection_wells, dt)
        
        return reagent.flatten()

remediation_simulator = RemediationSimulator()
