import numpy as np
from typing import Optional, Tuple, Dict, List
from .config import SimulationConfig


class RadTranSolver:
    def __init__(self, config: SimulationConfig):
        self.config = config
        self._solver = None
        self._load_fortran_solver()
        
    def _load_fortran_solver(self):
        try:
            import radtran_solver
            self._solver = radtran_solver
        except ImportError:
            print("Warning: Fortran solver not found, using pure Python fallback")
            self._solver = None
    
    def run(self) -> Dict:
        if self._solver is not None:
            return self._run_fortran()
        else:
            return self._run_python()
    
    def _run_fortran(self) -> Dict:
        config = self.config
        grid = config.grid
        aquifer = config.aquifer
        
        n_nuclides = len(config.nuclides)
        half_lives = np.array([n.half_life for n in config.nuclides], dtype=np.float64)
        distribution_coeffs = np.array([n.distribution_coeff for n in config.nuclides], dtype=np.float64)
        decay_chains = config.get_decay_chain_matrix()
        
        source_mode = 0 if config.source.mode == 'instant' else 1
        
        output_times = np.array(config.output_times, dtype=np.float64)
        n_output = len(output_times)
        
        concentration = np.zeros(
            (grid.nx, grid.ny, n_nuclides, n_output),
            dtype=np.float64,
            order='F'
        )
        
        time_steps_output = np.zeros(config.max_time_steps, dtype=np.float64)
        cfl_max = np.array([0.0], dtype=np.float64)
        
        initial_conc = config.nuclides[0].initial_concentration if config.nuclides else 0.0
        
        self._solver.solve_2d_advection_dispersion(
            grid.nx, grid.ny,
            grid.dx, grid.dy,
            aquifer.porosity, aquifer.permeability,
            aquifer.alpha_l, aquifer.alpha_t,
            aquifer.retardation,
            n_nuclides, half_lives, distribution_coeffs,
            decay_chains,
            source_mode,
            config.source.strength,
            config.source.x, config.source.y,
            config.source.radius,
            config.source.duration,
            initial_conc,
            config.max_time_steps,
            config.max_time,
            output_times,
            concentration,
            n_output,
            cfl_max,
            time_steps_output
        )
        
        results = {
            'concentration': concentration,
            'output_times': output_times,
            'cfl_max': cfl_max[0],
            'time_steps': time_steps_output[time_steps_output > 0],
            'x_coords': np.arange(grid.nx) * grid.dx,
            'y_coords': np.arange(grid.ny) * grid.dy,
            'nuclide_names': [n.name for n in config.nuclides]
        }
        
        if config.monitoring_points:
            results['breakthrough_curves'] = self._extract_breakthrough_curves(
                concentration,
                config.monitoring_points,
                grid.dx, grid.dy,
                output_times
            )
        
        return results
    
    def _run_python(self) -> Dict:
        config = self.config
        grid = config.grid
        aquifer = config.aquifer
        
        n_nuclides = len(config.nuclides)
        half_lives = np.array([n.half_life for n in config.nuclides], dtype=np.float64)
        decay_constants = np.log(2) / half_lives
        
        output_times = np.array(config.output_times, dtype=np.float64)
        n_output = len(output_times)
        
        concentration = np.zeros((grid.nx, grid.ny, n_nuclides, n_output))
        
        x = np.arange(grid.nx) * grid.dx
        y = np.arange(grid.ny) * grid.dy
        X, Y = np.meshgrid(x, y, indexing='ij')
        
        u = np.ones((grid.nx, grid.ny)) * (aquifer.permeability / aquifer.porosity) * 0.001
        v = np.zeros((grid.nx, grid.ny))
        
        conc = np.zeros((grid.nx, grid.ny, n_nuclides))
        
        source_i = int(config.source.x / grid.dx)
        source_j = int(config.source.y / grid.dy)
        source_i = np.clip(source_i, 0, grid.nx - 1)
        source_j = np.clip(source_j, 0, grid.ny - 1)
        
        r_cells = config.source.radius / min(grid.dx, grid.dy)
        dist = np.sqrt((np.arange(grid.nx)[:, None] - source_i)**2 + 
                       (np.arange(grid.ny)[None, :] - source_j)**2)
        source_mask = dist <= r_cells
        
        if config.source.mode == 'instant':
            conc[:, :, 0][source_mask] = config.source.strength * np.exp(
                -dist[source_mask]**2 / (2 * (r_cells/3)**2)
            )
        
        dt = 86400.0
        time = 0.0
        out_idx = 0
        time_steps_record = []
        cfl_max_actual = 0.0
        
        max_u = np.max(np.abs(u))
        if max_u > 1e-10:
            dt_adv = config.cfl_max * grid.dx / max_u
            dt = min(dt, dt_adv)
        
        decay_chains = config.get_decay_chain_matrix()
        
        while time < config.max_time and out_idx < n_output:
            conc_old = conc.copy()
            
            for k in range(n_nuclides):
                self._advection_dispersion_step_upwind(
                    conc_old[:, :, k],
                    conc[:, :, k],
                    u, v,
                    aquifer.alpha_l, aquifer.alpha_t,
                    grid.dx, grid.dy, dt,
                    aquifer.retardation,
                    0.0
                )
            
            self._apply_decay_chain_coupled(
                conc,
                decay_chains, decay_constants,
                dt, aquifer.retardation
            )
            
            if config.source.mode == 'continuous' and time < config.source.duration:
                source_rate = config.source.strength * dt / (np.pi * r_cells**2)
                for k in range(n_nuclides):
                    conc[:, :, k][source_mask] += source_rate * np.exp(
                        -dist[source_mask]**2 / (2 * (r_cells/3)**2)
                    )
            
            conc = np.maximum(conc, 0.0)
            
            local_cfl = max_u * dt / grid.dx if max_u > 1e-10 else 0
            cfl_max_actual = max(cfl_max_actual, local_cfl)
            time_steps_record.append(dt)
            
            time += dt
            
            if time >= output_times[out_idx]:
                concentration[:, :, :, out_idx] = conc
                out_idx += 1
        
        results = {
            'concentration': concentration,
            'output_times': output_times,
            'cfl_max': cfl_max_actual,
            'time_steps': np.array(time_steps_record),
            'x_coords': x,
            'y_coords': y,
            'nuclide_names': [n.name for n in config.nuclides]
        }
        
        if config.monitoring_points:
            results['breakthrough_curves'] = self._extract_breakthrough_curves(
                concentration,
                config.monitoring_points,
                grid.dx, grid.dy,
                output_times
            )
        
        return results
    
    def _advection_dispersion_step(
        self,
        conc_old: np.ndarray,
        conc_new: np.ndarray,
        u: np.ndarray,
        v: np.ndarray,
        alpha_l: float,
        alpha_t: float,
        dx: float,
        dy: float,
        dt: float,
        R: float,
        lambda_: float
    ):
        nx, ny = conc_old.shape
        
        D_m = 1e-9
        v_mag = np.sqrt(u**2 + v**2)
        mask = v_mag > 1e-10
        
        D_xx = np.ones_like(u) * D_m
        D_yy = np.ones_like(u) * D_m
        
        D_xx[mask] = D_m + (alpha_l * u[mask]**2 + alpha_t * v[mask]**2) / v_mag[mask]
        D_yy[mask] = D_m + (alpha_l * v[mask]**2 + alpha_t * u[mask]**2) / v_mag[mask]
        
        conc_new[:, :] = conc_old
        
        for i in range(1, nx - 1):
            for j in range(1, ny - 1):
                adv_x = u[i, j] * (conc_old[i+1, j] - conc_old[i-1, j]) / (2 * dx)
                adv_y = v[i, j] * (conc_old[i, j+1] - conc_old[i, j-1]) / (2 * dy)
                
                disp_x = D_xx[i, j] * (conc_old[i+1, j] - 2*conc_old[i, j] + conc_old[i-1, j]) / dx**2
                disp_y = D_yy[i, j] * (conc_old[i, j+1] - 2*conc_old[i, j] + conc_old[i, j-1]) / dy**2
                
                conc_new[i, j] = conc_old[i, j] + dt / R * (
                    -adv_x - adv_y + disp_x + disp_y - lambda_ * conc_old[i, j]
                )
        
        conc_new[0, :] = conc_new[1, :]
        conc_new[-1, :] = conc_new[-2, :]
        conc_new[:, 0] = conc_new[:, 1]
        conc_new[:, -1] = conc_new[:, -2]
    
    def _advection_dispersion_step_upwind(
        self,
        conc_old: np.ndarray,
        conc_new: np.ndarray,
        u: np.ndarray,
        v: np.ndarray,
        alpha_l: float,
        alpha_t: float,
        dx: float,
        dy: float,
        dt: float,
        R: float,
        lambda_: float
    ):
        nx, ny = conc_old.shape
        
        D_m = 1e-9
        v_mag = np.sqrt(u**2 + v**2)
        mask = v_mag > 1e-10
        
        D_xx = np.ones_like(u) * D_m
        D_yy = np.ones_like(u) * D_m
        
        D_xx[mask] = D_m + (alpha_l * u[mask]**2 + alpha_t * v[mask]**2) / v_mag[mask]
        D_yy[mask] = D_m + (alpha_l * v[mask]**2 + alpha_t * u[mask]**2) / v_mag[mask]
        
        conc_new[:, :] = conc_old
        
        Pe_x = np.abs(u) * dx / np.maximum(D_xx, 1e-15)
        Pe_y = np.abs(v) * dy / np.maximum(D_yy, 1e-15)
        
        def upwind_flux(c, u, dx, Pe):
            if Pe > 2.0:
                if u > 0:
                    return (c[1] - c[0]) / dx
                else:
                    return (c[2] - c[1]) / dx
            else:
                return (c[2] - c[0]) / (2 * dx)
        
        for i in range(1, nx - 1):
            for j in range(1, ny - 1):
                Pe_i_x = Pe_x[i, j]
                Pe_i_y = Pe_y[i, j]
                
                if Pe_i_x > 2.0:
                    if u[i, j] > 0:
                        adv_x = u[i, j] * (conc_old[i, j] - conc_old[i-1, j]) / dx
                    else:
                        adv_x = u[i, j] * (conc_old[i+1, j] - conc_old[i, j]) / dx
                else:
                    adv_x = u[i, j] * (conc_old[i+1, j] - conc_old[i-1, j]) / (2 * dx)
                
                if Pe_i_y > 2.0:
                    if v[i, j] > 0:
                        adv_y = v[i, j] * (conc_old[i, j] - conc_old[i, j-1]) / dy
                    else:
                        adv_y = v[i, j] * (conc_old[i, j+1] - conc_old[i, j]) / dy
                else:
                    adv_y = v[i, j] * (conc_old[i, j+1] - conc_old[i, j-1]) / (2 * dy)
                
                disp_x = D_xx[i, j] * (conc_old[i+1, j] - 2*conc_old[i, j] + conc_old[i-1, j]) / dx**2
                disp_y = D_yy[i, j] * (conc_old[i, j+1] - 2*conc_old[i, j] + conc_old[i, j-1]) / dy**2
                
                conc_new[i, j] = conc_old[i, j] + dt / R * (
                    -adv_x - adv_y + disp_x + disp_y - lambda_ * conc_old[i, j]
                )
        
        conc_new[0, :] = conc_new[1, :]
        conc_new[-1, :] = conc_new[-2, :]
        conc_new[:, 0] = conc_new[:, 1]
        conc_new[:, -1] = conc_new[:, -2]
        
        conc_new[:, :] = np.maximum(conc_new, 0.0)
    
    def _apply_decay_chain_coupled(
        self,
        conc: np.ndarray,
        decay_chains: np.ndarray,
        decay_constants: np.ndarray,
        dt: float,
        R: float
    ):
        n_nuclides = conc.shape[2]
        
        effective_lambda = decay_constants / R
        
        conc_old_decay = conc.copy()
        
        for k in range(n_nuclides):
            conc[:, :, k] = conc_old_decay[:, :, k] * np.exp(-effective_lambda[k] * dt)
        
        for k in range(n_nuclides):
            for parent in range(n_nuclides):
                if decay_chains[parent, k] == 1:
                    lambda_p = effective_lambda[parent]
                    lambda_k = effective_lambda[k]
                    
                    if abs(lambda_p - lambda_k) > 1e-15:
                        factor = lambda_p / (lambda_k - lambda_p) * (
                            np.exp(-lambda_p * dt) - np.exp(-lambda_k * dt)
                        )
                    else:
                        factor = lambda_p * dt * np.exp(-lambda_p * dt)
                    
                    conc[:, :, k] += conc_old_decay[:, :, parent] * factor
        
        conc[:, :, :] = np.maximum(conc, 0.0)
    
    def _extract_breakthrough_curves(
        self,
        concentration: np.ndarray,
        monitoring_points: Dict[str, List[float]],
        dx: float,
        dy: float,
        output_times: np.ndarray
    ) -> Dict[str, Dict]:
        curves = {}
        
        for name, coords in monitoring_points.items():
            x, y = coords[0], coords[1]
            i = int(x / dx)
            j = int(y / dy)
            
            i = np.clip(i, 0, concentration.shape[0] - 1)
            j = np.clip(j, 0, concentration.shape[1] - 1)
            
            curves[name] = {
                'x': x,
                'y': y,
                'times': output_times,
                'concentrations': concentration[i, j, :, :]
            }
        
        return curves
