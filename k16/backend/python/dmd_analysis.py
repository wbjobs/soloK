import numpy as np
from scipy import linalg, signal
from scipy.interpolate import griddata
from dataclasses import dataclass
from typing import Tuple, List, Optional
import warnings

warnings.filterwarnings('ignore')


@dataclass
class DMDMode:
    frequency: float
    growth_rate: float
    amplitude: float
    spatial_mode: np.ndarray
    temporal_mode: np.ndarray
    is_stable: bool
    energy_ratio: float


@dataclass
class DMDResult:
    modes: List[DMDMode]
    reconstruction_error: float
    optimal_rank: int
    singular_values: List[float]
    cumulative_energy: List[float]


class DMDAnalyzer:
    def __init__(self,
                 sample_rate: float = 2000,
                 n_modes: int = 10,
                 optimal_rank: Optional[int] = None):
        self.sample_rate = sample_rate
        self.n_modes = n_modes
        self.optimal_rank = optimal_rank
        self._pressure_history = []
        self._time_samples = []
    
    def reset(self):
        self._pressure_history = []
        self._time_samples = []
    
    def add_snapshot(self, pressure_data: np.ndarray, timestamp: float = None):
        self._pressure_history.append(np.array(pressure_data, dtype=float).flatten())
        
        if timestamp is None:
            timestamp = len(self._pressure_history) / self.sample_rate
        self._time_samples.append(timestamp)
    
    def add_snapshots_batch(self, pressure_data_matrix: np.ndarray, 
                            timestamps: np.ndarray = None):
        for i in range(pressure_data_matrix.shape[0]):
            self.add_snapshot(pressure_data_matrix[i], 
                             timestamps[i] if timestamps is not None else None)
    
    def build_data_matrices(self) -> Tuple[np.ndarray, np.ndarray, np.ndarray]:
        X = np.array(self._pressure_history[:-1]).T
        Y = np.array(self._pressure_history[1:]).T
        
        t = np.array(self._time_samples[:X.shape[1]])
        
        return X, Y, t
    
    def compute_svd(self, X: np.ndarray) -> Tuple[np.ndarray, np.ndarray, np.ndarray]:
        U, Sigma, Vh = linalg.svd(X, full_matrices=False)
        
        if self.optimal_rank is None:
            self.optimal_rank = self._determine_optimal_rank(Sigma)
        
        rank = min(self.optimal_rank, len(Sigma), self.n_modes)
        
        return U[:, :rank], Sigma[:rank], Vh[:rank, :]
    
    def _determine_optimal_rank(self, singular_values: np.ndarray) -> int:
        total_energy = np.sum(singular_values ** 2)
        cumulative_energy = np.cumsum(singular_values ** 2) / total_energy
        
        energy_threshold = 0.99
        rank = np.searchsorted(cumulative_energy, energy_threshold) + 1
        
        return min(rank, self.n_modes)
    
    def compute_dmd(self) -> DMDResult:
        if len(self._pressure_history) < 3:
            return DMDResult(
                modes=[],
                reconstruction_error=1.0,
                optimal_rank=0,
                singular_values=[],
                cumulative_energy=[]
            )
        
        X, Y, t = self.build_data_matrices()
        
        U, Sigma, Vh = self.compute_svd(X)
        
        Sigma_inv = np.diag(1.0 / Sigma)
        A_tilde = U.T @ Y @ Vh.T @ Sigma_inv
        
        eigenvalues, eigenvectors = linalg.eig(A_tilde)
        
        dt = t[1] - t[0] if len(t) > 1 else 1.0 / self.sample_rate
        
        frequencies = np.angle(eigenvalues) / (2 * np.pi * dt)
        growth_rates = np.log(np.abs(eigenvalues)) / dt
        
        phi = Y @ Vh.T @ Sigma_inv @ eigenvectors
        
        phi_norm = np.linalg.norm(phi, axis=0)
        phi_norm[phi_norm < 1e-10] = 1.0
        phi = phi / phi_norm
        
        amplitudes = np.abs(phi_norm * eigenvectors[0, :])
        
        mode_energy = amplitudes ** 2
        total_energy = np.sum(mode_energy)
        energy_ratios = mode_energy / total_energy if total_energy > 0 else mode_energy
        
        sorted_indices = np.argsort(energy_ratios)[::-1]
        
        dmd_modes = []
        for idx in sorted_indices[:self.n_modes]:
            mode = DMDMode(
                frequency=float(frequencies[idx]),
                growth_rate=float(growth_rates[idx]),
                amplitude=float(amplitudes[idx]),
                spatial_mode=phi[:, idx].real,
                temporal_mode=self._compute_temporal_mode(
                    eigenvalues[idx], amplitudes[idx], t
                ),
                is_stable=growth_rates[idx] <= 0,
                energy_ratio=float(energy_ratios[idx])
            )
            dmd_modes.append(mode)
        
        reconstruction_error = self._compute_reconstruction_error(X, dmd_modes)
        
        singular_values_full = np.linalg.svd(X, compute_uv=False)
        total_energy_full = np.sum(singular_values_full ** 2)
        cumulative_energy = np.cumsum(singular_values_full ** 2) / total_energy_full
        
        return DMDResult(
            modes=dmd_modes,
            reconstruction_error=float(reconstruction_error),
            optimal_rank=self.optimal_rank,
            singular_values=singular_values_full.tolist(),
            cumulative_energy=cumulative_energy.tolist()
        )
    
    def _compute_temporal_mode(self, eigenvalue: complex, 
                                amplitude: float, t: np.ndarray) -> np.ndarray:
        omega = np.log(eigenvalue)
        return amplitude * np.exp(omega * t).real
    
    def _compute_reconstruction_error(self, X: np.ndarray, 
                                        modes: List[DMDMode]) -> float:
        if not modes:
            return 1.0
        
        reconstruction = np.zeros_like(X)
        
        for mode in modes:
            outer_product = np.outer(mode.spatial_mode, mode.temporal_mode)
            reconstruction += mode.amplitude * outer_product
        
        error = np.linalg.norm(X - reconstruction) / (np.linalg.norm(X) + 1e-10)
        return min(1.0, error)
    
    def generate_mode_visualization(self, mode: DMDMode, 
                                    grid_shape: Tuple[int, int]) -> dict:
        spatial = mode.spatial_mode
        
        if spatial.size == 128:
            grid_data = self._reshape_128_channel_to_grid(spatial)
        else:
            side = int(np.ceil(np.sqrt(spatial.size)))
            grid_data = np.zeros((side, side))
            grid_data.flat[:spatial.size] = spatial
        
        magnitude = np.abs(grid_data)
        phase = np.angle(grid_data) if np.iscomplexobj(grid_data) else np.zeros_like(grid_data)
        
        normalized_magnitude = magnitude / (np.max(magnitude) + 1e-10)
        
        return {
            'frequency': mode.frequency,
            'growth_rate': mode.growth_rate,
            'amplitude': mode.amplitude,
            'is_stable': mode.is_stable,
            'energy_ratio': mode.energy_ratio,
            'grid_data': grid_data.tolist(),
            'normalized_magnitude': normalized_magnitude.tolist(),
            'phase': phase.tolist(),
            'grid_shape': list(grid_data.shape)
        }
    
    def _reshape_128_channel_to_grid(self, data: np.ndarray) -> np.ndarray:
        n_upper = 64
        n_lower = 64
        
        grid = np.zeros((4, 32))
        
        grid[0, :] = data[:32]
        grid[1, :] = data[32:64]
        grid[2, :] = data[64:96]
        grid[3, :] = data[96:128]
        
        return grid
    
    def get_mode_animation_frames(self, mode: DMDMode, 
                                   n_frames: int = 30) -> List[np.ndarray]:
        spatial = mode.spatial_mode
        freq = mode.frequency
        
        frames = []
        for i in range(n_frames):
            t = i / (self.sample_rate * 0.1)
            phase = 2 * np.pi * freq * t
            
            frame = np.abs(spatial) * np.cos(phase + np.angle(spatial))
            
            if spatial.size == 128:
                grid_frame = self._reshape_128_channel_to_grid(frame)
            else:
                side = int(np.ceil(np.sqrt(spatial.size)))
                grid_frame = np.zeros((side, side))
                grid_frame.flat[:spatial.size] = frame
            
            frames.append(grid_frame)
        
        return frames
    
    def analyze_flow_structures(self) -> dict:
        dmd_result = self.compute_dmd()
        
        if not dmd_result.modes:
            return {
                'dominant_modes': [],
                'total_energy': 0,
                'stable_modes_count': 0,
                'unstable_modes_count': 0,
                'reconstruction_quality': 0
            }
        
        dominant_modes = []
        stable_count = 0
        unstable_count = 0
        
        for mode in dmd_result.modes:
            if mode.is_stable:
                stable_count += 1
            else:
                unstable_count += 1
            
            dominant_modes.append({
                'frequency': mode.frequency,
                'growth_rate': mode.growth_rate,
                'amplitude': mode.amplitude,
                'is_stable': mode.is_stable,
                'energy_ratio': mode.energy_ratio,
                'growth_rate_rounded': round(mode.growth_rate, 6)
            })
        
        total_energy = sum(m['energy_ratio'] for m in dominant_modes[:5])
        
        return {
            'dominant_modes': dominant_modes[:5],
            'total_energy': total_energy,
            'stable_modes_count': stable_count,
            'unstable_modes_count': unstable_count,
            'reconstruction_quality': 1.0 - dmd_result.reconstruction_error,
            'n_snapshots': len(self._pressure_history)
        }
