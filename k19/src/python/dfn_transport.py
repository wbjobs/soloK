import numpy as np
from typing import Dict, List, Tuple, Optional
from dataclasses import dataclass, field

from .dfn import DiscreteFractureNetwork, DFNConfig
from .reactive_transport import ReactionSystem, setup_typical_system
from .config import SimulationConfig


@dataclass
class DualPorosityConfig:
    matrix_diffusion_coeff: float = 1e-10
    matrix_porosity: float = 0.01
    fracture_porosity: float = 0.001
    exchange_rate: float = 1e-8
    immobile_domain: bool = True


class DualPorositySolver:
    def __init__(self, config: SimulationConfig, dfn: DiscreteFractureNetwork,
                 dp_config: DualPorosityConfig = None):
        self.config = config
        self.dfn = dfn
        self.dp_config = dp_config or DualPorosityConfig()
    
    def solve_dual_porosity(self, u: np.ndarray, v: np.ndarray,
                             source_mask: np.ndarray,
                             source_strength: float,
                             n_steps: int, dt: float) -> Dict:
        grid = self.config.grid
        aquifer = self.config.aquifer
        
        conc_fracture = np.zeros((grid.nx, grid.ny))
        conc_matrix = np.zeros((grid.nx, grid.ny))
        
        fracture_mask = self._get_fracture_mask(grid.nx, grid.ny)
        
        D_xx, D_yy = self._calculate_dispersion(u, v, aquifer.alpha_l, aquifer.alpha_t)
        
        output = []
        times = []
        
        for step in range(n_steps):
            conc_f_old = conc_fracture.copy()
            conc_m_old = conc_matrix.copy()
            
            self._advection_dispersion_step(
                conc_f_old, conc_fracture,
                u, v, D_xx, D_yy,
                grid.dx, grid.dy, dt,
                aquifer.retardation
            )
            
            exchange = self.dp_config.exchange_rate * (conc_fracture - conc_matrix)
            conc_fracture -= exchange * dt / self.dp_config.fracture_porosity
            conc_matrix += exchange * dt / self.dp_config.matrix_porosity
            
            if step == 0:
                conc_fracture[source_mask] += source_strength
            
            if step % max(1, n_steps // 10) == 0:
                output.append(conc_fracture.copy())
                times.append(step * dt)
        
        return {
            'fracture_concentration': np.array(output),
            'matrix_concentration': conc_matrix,
            'times': np.array(times),
            'fracture_mask': fracture_mask
        }
    
    def _get_fracture_mask(self, nx: int, ny: int) -> np.ndarray:
        dx, dy = self.dfn.config.domain_size
        mask = np.zeros((nx, ny), dtype=bool)
        
        for fracture in self.dfn.fractures:
            x, y = fracture.get_points(100)
            for xi, yi in zip(x, y):
                i = min(int(xi / dx * nx), nx - 1)
                j = min(int(yi / dy * ny), ny - 1)
                mask[i, j] = True
        
        return mask
    
    def _calculate_dispersion(self, u: np.ndarray, v: np.ndarray,
                                alpha_l: float, alpha_t: float) -> Tuple[np.ndarray, np.ndarray]:
        D_m = 1e-9
        v_mag = np.sqrt(u**2 + v**2)
        mask = v_mag > 1e-10
        
        D_xx = np.ones_like(u) * D_m
        D_yy = np.ones_like(u) * D_m
        
        D_xx[mask] = D_m + (alpha_l * u[mask]**2 + alpha_t * v[mask]**2) / v_mag[mask]
        D_yy[mask] = D_m + (alpha_l * v[mask]**2 + alpha_t * u[mask]**2) / v_mag[mask]
        
        return D_xx, D_yy
    
    def _advection_dispersion_step(self, conc_old: np.ndarray, conc_new: np.ndarray,
                                     u: np.ndarray, v: np.ndarray,
                                     D_xx: np.ndarray, D_yy: np.ndarray,
                                     dx: float, dy: float, dt: float, R: float):
        nx, ny = conc_old.shape
        
        conc_new[:, :] = conc_old
        
        for i in range(1, nx - 1):
            for j in range(1, ny - 1):
                Pe_x = abs(u[i, j]) * dx / max(D_xx[i, j], 1e-15)
                Pe_y = abs(v[i, j]) * dy / max(D_yy[i, j], 1e-15)
                
                if Pe_x > 2.0:
                    if u[i, j] > 0:
                        adv_x = u[i, j] * (conc_old[i, j] - conc_old[i-1, j]) / dx
                    else:
                        adv_x = u[i, j] * (conc_old[i+1, j] - conc_old[i, j]) / dx
                else:
                    adv_x = u[i, j] * (conc_old[i+1, j] - conc_old[i-1, j]) / (2 * dx)
                
                if Pe_y > 2.0:
                    if v[i, j] > 0:
                        adv_y = v[i, j] * (conc_old[i, j] - conc_old[i, j-1]) / dy
                    else:
                        adv_y = v[i, j] * (conc_old[i, j+1] - conc_old[i, j]) / dy
                else:
                    adv_y = v[i, j] * (conc_old[i, j+1] - conc_old[i, j-1]) / (2 * dy)
                
                disp_x = D_xx[i, j] * (conc_old[i+1, j] - 2*conc_old[i, j] + conc_old[i-1, j]) / dx**2
                disp_y = D_yy[i, j] * (conc_old[i, j+1] - 2*conc_old[i, j] + conc_old[i, j-1]) / dy**2
                
                conc_new[i, j] = conc_old[i, j] + dt / R * (
                    -adv_x - adv_y + disp_x + disp_y
                )
        
        conc_new[0, :] = conc_new[1, :]
        conc_new[-1, :] = conc_new[-2, :]
        conc_new[:, 0] = conc_new[:, 1]
        conc_new[:, -1] = conc_new[:, -2]
        
        conc_new[:, :] = np.maximum(conc_new, 0.0)


class DFNTransportSolver:
    def __init__(self, config: SimulationConfig, 
                 dfn_config: DFNConfig = None,
                 reaction_system: ReactionSystem = None):
        self.config = config
        self.dfn_config = dfn_config or DFNConfig(
            domain_size=(config.grid.nx * config.grid.dx,
                        config.grid.ny * config.grid.dy)
        )
        self.dfn = DiscreteFractureNetwork(self.dfn_config)
        self.reaction_system = reaction_system or setup_typical_system()
    
    def run(self, use_dual_porosity: bool = False,
            use_reactive: bool = False,
            pH: float = 7.0, Eh: float = 0.4) -> Dict:
        grid = self.config.grid
        aquifer = self.config.aquifer
        
        u, v = self.dfn.get_velocity_field(
            grid.nx, grid.ny,
            hydraulic_gradient=(0.001, 0.0),
            porosity=aquifer.porosity,
            matrix_k=aquifer.permeability
        )
        
        source_i = min(int(self.config.source.x / grid.dx), grid.nx - 1)
        source_j = min(int(self.config.source.y / grid.dy), grid.ny - 1)
        r_cells = int(self.config.source.radius / min(grid.dx, grid.dy))
        
        source_mask = np.zeros((grid.nx, grid.ny), dtype=bool)
        for i in range(max(0, source_i - r_cells), min(grid.nx, source_i + r_cells + 1)):
            for j in range(max(0, source_j - r_cells), min(grid.ny, source_j + r_cells + 1)):
                if (i - source_i)**2 + (j - source_j)**2 <= r_cells**2:
                    source_mask[i, j] = True
        
        dt = 86400.0
        max_u = np.max(np.abs(u))
        if max_u > 1e-10:
            dt = min(dt, 0.5 * grid.dx / max_u)
        
        n_steps = int(self.config.max_time / dt) + 1
        
        if use_dual_porosity:
            dp_solver = DualPorositySolver(self.config, self.dfn)
            results = dp_solver.solve_dual_porosity(
                u, v, source_mask,
                self.config.source.strength,
                n_steps, dt
            )
        else:
            results = self._solve_single_domain(u, v, source_mask, n_steps, dt)
        
        if use_reactive:
            results['speciation_data'] = self._calculate_speciation_evolution(
                results, pH, Eh
            )
        
        results['dfn'] = self.dfn
        results['x_coords'] = np.arange(grid.nx) * grid.dx
        results['y_coords'] = np.arange(grid.ny) * grid.dy
        results['u'] = u
        results['v'] = v
        
        return results
    
    def _solve_single_domain(self, u: np.ndarray, v: np.ndarray,
                               source_mask: np.ndarray,
                               n_steps: int, dt: float) -> Dict:
        grid = self.config.grid
        aquifer = self.config.aquifer
        
        conc = np.zeros((grid.nx, grid.ny))
        
        D_xx, D_yy = self._calculate_dispersion(u, v, aquifer.alpha_l, aquifer.alpha_t)
        
        output_times = self.config.output_times if hasattr(self.config, 'output_times') else []
        output = []
        times = []
        
        for step in range(n_steps):
            conc_old = conc.copy()
            
            self._advection_dispersion_step(
                conc_old, conc, u, v, D_xx, D_yy,
                grid.dx, grid.dy, dt, aquifer.retardation
            )
            
            if step == 0 and self.config.source.mode == 'instant':
                conc[source_mask] += self.config.source.strength
            elif self.config.source.mode == 'continuous':
                source_rate = self.config.source.strength * dt / np.sum(source_mask)
                conc[source_mask] += source_rate
            
            time = step * dt
            if output_times and len(output) < len(output_times):
                if time >= output_times[len(output)] or step == n_steps - 1:
                    output.append(conc.copy())
                    times.append(time)
        
        if not output:
            output.append(conc.copy())
            times.append(n_steps * dt)
        
        return {
            'concentration': np.array(output),
            'times': np.array(times)
        }
    
    def _calculate_dispersion(self, u: np.ndarray, v: np.ndarray,
                                alpha_l: float, alpha_t: float) -> Tuple[np.ndarray, np.ndarray]:
        D_m = 1e-9
        v_mag = np.sqrt(u**2 + v**2)
        mask = v_mag > 1e-10
        
        D_xx = np.ones_like(u) * D_m
        D_yy = np.ones_like(u) * D_m
        
        D_xx[mask] = D_m + (alpha_l * u[mask]**2 + alpha_t * v[mask]**2) / v_mag[mask]
        D_yy[mask] = D_m + (alpha_l * v[mask]**2 + alpha_t * u[mask]**2) / v_mag[mask]
        
        return D_xx, D_yy
    
    def _advection_dispersion_step(self, conc_old: np.ndarray, conc_new: np.ndarray,
                                     u: np.ndarray, v: np.ndarray,
                                     D_xx: np.ndarray, D_yy: np.ndarray,
                                     dx: float, dy: float, dt: float, R: float):
        nx, ny = conc_old.shape
        
        conc_new[:, :] = conc_old
        
        for i in range(1, nx - 1):
            for j in range(1, ny - 1):
                Pe_x = abs(u[i, j]) * dx / max(D_xx[i, j], 1e-15)
                Pe_y = abs(v[i, j]) * dy / max(D_yy[i, j], 1e-15)
                
                if Pe_x > 2.0:
                    if u[i, j] > 0:
                        adv_x = u[i, j] * (conc_old[i, j] - conc_old[i-1, j]) / dx
                    else:
                        adv_x = u[i, j] * (conc_old[i+1, j] - conc_old[i, j]) / dx
                else:
                    adv_x = u[i, j] * (conc_old[i+1, j] - conc_old[i-1, j]) / (2 * dx)
                
                if Pe_y > 2.0:
                    if v[i, j] > 0:
                        adv_y = v[i, j] * (conc_old[i, j] - conc_old[i, j-1]) / dy
                    else:
                        adv_y = v[i, j] * (conc_old[i, j+1] - conc_old[i, j]) / dy
                else:
                    adv_y = v[i, j] * (conc_old[i, j+1] - conc_old[i, j-1]) / (2 * dy)
                
                disp_x = D_xx[i, j] * (conc_old[i+1, j] - 2*conc_old[i, j] + conc_old[i-1, j]) / dx**2
                disp_y = D_yy[i, j] * (conc_old[i, j+1] - 2*conc_old[i, j] + conc_old[i, j-1]) / dy**2
                
                conc_new[i, j] = conc_old[i, j] + dt / R * (
                    -adv_x - adv_y + disp_x + disp_y
                )
        
        conc_new[0, :] = conc_new[1, :]
        conc_new[-1, :] = conc_new[-2, :]
        conc_new[:, 0] = conc_new[:, 1]
        conc_new[:, -1] = conc_new[:, -2]
        
        conc_new[:, :] = np.maximum(conc_new, 0.0)
    
    def _calculate_speciation_evolution(self, transport_results: Dict,
                                         pH: float, Eh: float) -> Dict:
        times = transport_results.get('times', [0])
        conc_data = transport_results.get('concentration', None)
        
        if conc_data is None:
            return {}
        
        nx, ny = conc_data.shape[1], conc_data.shape[2]
        
        speciation = {
            'times': times,
            'species': {}
        }
        
        sample_points = [(nx//2, ny//2), (nx//4, ny//2), (3*nx//4, ny//2)]
        
        for point in sample_points:
            i, j = point
            concs = conc_data[:, i, j]
            
            point_speciation = []
            for conc in concs:
                spec = self.reaction_system.calculate_nuclide_speciation(
                    'U', conc, pH, Eh
                )
                point_speciation.append(spec)
            
            speciation['species'][f'point_{i}_{j}'] = point_speciation
        
        return speciation
