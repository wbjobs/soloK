import numpy as np
from typing import List, Tuple, Dict, Optional
from dataclasses import dataclass, field
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
from matplotlib.collections import LineCollection
import os


@dataclass
class Fracture:
    x1: float
    y1: float
    x2: float
    y2: float
    aperture: float
    permeability: float
    length: float = 0.0
    angle: float = 0.0
    
    def __post_init__(self):
        self.length = np.sqrt((self.x2 - self.x1)**2 + (self.y2 - self.y1)**2)
        self.angle = np.arctan2(self.y2 - self.y1, self.x2 - self.x1)
    
    def get_points(self, n_points: int = 100) -> Tuple[np.ndarray, np.ndarray]:
        t = np.linspace(0, 1, n_points)
        x = self.x1 + t * (self.x2 - self.x1)
        y = self.y1 + t * (self.y2 - self.y1)
        return x, y


@dataclass
class DFNConfig:
    domain_size: Tuple[float, float] = (200.0, 200.0)
    n_fractures: int = 50
    length_mean: float = 50.0
    length_std: float = 20.0
    length_min: float = 10.0
    aperture_mean: float = 0.001
    aperture_std: float = 0.0003
    angle_distribution: str = 'uniform'
    angle_mean: float = 0.0
    angle_std: float = np.pi / 6
    seed: Optional[int] = None
    fracture_density: float = 0.001


class DiscreteFractureNetwork:
    def __init__(self, config: DFNConfig):
        self.config = config
        self.fractures: List[Fracture] = []
        self.intersection_points: List[Tuple[float, float]] = []
        
        if config.seed is not None:
            np.random.seed(config.seed)
        
        self._generate_fractures()
        self._find_intersections()
        self._calculate_connections()
    
    def _generate_fractures(self):
        dx, dy = self.config.domain_size
        
        n_target = self.config.n_fractures
        
        while len(self.fractures) < n_target:
            x_center = np.random.uniform(0, dx)
            y_center = np.random.uniform(0, dy)
            
            if self.config.angle_distribution == 'uniform':
                angle = np.random.uniform(0, np.pi)
            else:
                angle = np.random.normal(self.config.angle_mean, self.config.angle_std)
            
            length = max(
                self.config.length_min,
                np.random.normal(self.config.length_mean, self.config.length_std)
            )
            
            aperture = max(
                1e-6,
                np.random.normal(self.config.aperture_mean, self.config.aperture_std)
            )
            
            x1 = x_center - 0.5 * length * np.cos(angle)
            y1 = y_center - 0.5 * length * np.sin(angle)
            x2 = x_center + 0.5 * length * np.cos(angle)
            y2 = y_center + 0.5 * length * np.sin(angle)
            
            x1 = np.clip(x1, 0, dx)
            x2 = np.clip(x2, 0, dx)
            y1 = np.clip(y1, 0, dy)
            y2 = np.clip(y2, 0, dy)
            
            actual_length = np.sqrt((x2 - x1)**2 + (y2 - y1)**2)
            if actual_length > self.config.length_min:
                permeability = aperture**2 / 12.0
                
                fracture = Fracture(
                    x1=x1, y1=y1, x2=x2, y2=y2,
                    aperture=aperture,
                    permeability=permeability
                )
                self.fractures.append(fracture)
    
    def _find_intersections(self):
        n = len(self.fractures)
        
        for i in range(n):
            for j in range(i + 1, n):
                pt = self._line_intersection(self.fractures[i], self.fractures[j])
                if pt is not None:
                    self.intersection_points.append(pt)
    
    def _line_intersection(self, f1: Fracture, f2: Fracture) -> Optional[Tuple[float, float]]:
        x1, y1, x2, y2 = f1.x1, f1.y1, f1.x2, f1.y2
        x3, y3, x4, y4 = f2.x1, f2.y1, f2.x2, f2.y2
        
        denom = (x1 - x2) * (y3 - y4) - (y1 - y2) * (x3 - x4)
        if abs(denom) < 1e-10:
            return None
        
        t = ((x1 - x3) * (y3 - y4) - (y1 - y3) * (x3 - x4)) / denom
        u = -((x1 - x2) * (y1 - y3) - (y1 - y2) * (x1 - x3)) / denom
        
        if 0 <= t <= 1 and 0 <= u <= 1:
            x = x1 + t * (x2 - x1)
            y = y1 + t * (y2 - y1)
            return (x, y)
        
        return None
    
    def _calculate_connections(self):
        self.connections = {i: [] for i in range(len(self.fractures))}
        
        for i, f1 in enumerate(self.fractures):
            for j, f2 in enumerate(self.fractures):
                if i >= j:
                    continue
                if self._line_intersection(f1, f2) is not None:
                    self.connections[i].append(j)
                    self.connections[j].append(i)
    
    def get_fracture_density_map(self, nx: int, ny: int) -> np.ndarray:
        dx, dy = self.config.domain_size
        density = np.zeros((ny, nx))
        
        x_edges = np.linspace(0, dx, nx + 1)
        y_edges = np.linspace(0, dy, ny + 1)
        
        for fracture in self.fractures:
            x, y = fracture.get_points(200)
            for xi, yi in zip(x, y):
                i = min(int(xi / dx * nx), nx - 1)
                j = min(int(yi / dy * ny), ny - 1)
                density[j, i] += fracture.aperture
        
        return density
    
    def get_permeability_field(self, nx: int, ny: int, matrix_k: float = 1e-15) -> np.ndarray:
        dx, dy = self.config.domain_size
        k_field = np.ones((nx, ny)) * matrix_k
        
        x_grid = np.linspace(dx/(2*nx), dx - dx/(2*nx), nx)
        y_grid = np.linspace(dy/(2*ny), dy - dy/(2*ny), ny)
        
        for fracture in self.fractures:
            x, y = fracture.get_points(200)
            for xi, yi in zip(x, y):
                i = min(int(xi / dx * nx), nx - 1)
                j = min(int(yi / dy * ny), ny - 1)
                k_field[i, j] = max(k_field[i, j], fracture.permeability)
        
        return k_field
    
    def get_velocity_field(self, nx: int, ny: int, 
                           hydraulic_gradient: Tuple[float, float] = (0.001, 0.0),
                           porosity: float = 0.3,
                           matrix_k: float = 1e-15) -> Tuple[np.ndarray, np.ndarray]:
        k_field = self.get_permeability_field(nx, ny, matrix_k)
        
        u = -(k_field / porosity) * hydraulic_gradient[0]
        v = -(k_field / porosity) * hydraulic_gradient[1]
        
        return u, v
    
    def find_preferential_path(self, start_point: Tuple[float, float], 
                               end_point: Tuple[float, float]) -> List[int]:
        from collections import deque
        
        start_idx = self._find_closest_fracture(start_point)
        end_idx = self._find_closest_fracture(end_point)
        
        if start_idx is None or end_idx is None:
            return []
        
        queue = deque([(start_idx, [start_idx])])
        visited = set([start_idx])
        
        while queue:
            current, path = queue.popleft()
            
            if current == end_idx:
                return path
            
            for neighbor in self.connections.get(current, []):
                if neighbor not in visited:
                    visited.add(neighbor)
                    queue.append((neighbor, path + [neighbor]))
        
        return []
    
    def _find_closest_fracture(self, point: Tuple[float, float]) -> Optional[int]:
        x0, y0 = point
        min_dist = float('inf')
        closest_idx = None
        
        for i, f in enumerate(self.fractures):
            x, y = f.get_points(50)
            dist = np.min(np.sqrt((x - x0)**2 + (y - y0)**2))
            if dist < min_dist:
                min_dist = dist
                closest_idx = i
        
        return closest_idx
    
    def visualize(self, output_path: str = 'dfn_network.png'):
        fig, (ax1, ax2) = plt.subplots(1, 2, figsize=(15, 6))
        
        lines = []
        apertures = []
        for f in self.fractures:
            lines.append([(f.x1, f.y1), (f.x2, f.y2)])
            apertures.append(f.aperture * 1000)
        
        lc = LineCollection(lines, linewidths=np.array(apertures) * 2, cmap='viridis')
        lc.set_array(np.array(apertures))
        ax1.add_collection(lc)
        
        if self.intersection_points:
            x_int = [p[0] for p in self.intersection_points]
            y_int = [p[1] for p in self.intersection_points]
            ax1.scatter(x_int, y_int, c='red', s=20, zorder=5, label='Intersections')
        
        ax1.set_xlim(0, self.config.domain_size[0])
        ax1.set_ylim(0, self.config.domain_size[1])
        ax1.set_aspect('equal')
        ax1.set_xlabel('X (m)')
        ax1.set_ylabel('Y (m)')
        ax1.set_title(f'DFN Network (n={len(self.fractures)} fractures)')
        ax1.legend()
        plt.colorbar(lc, ax=ax1, label='Aperture (mm)')
        
        nx, ny = 100, 100
        k_field = self.get_permeability_field(nx, ny)
        im = ax2.imshow(np.log10(k_field.T), origin='lower', 
                       extent=[0, self.config.domain_size[0], 0, self.config.domain_size[1]],
                       cmap='jet', aspect='auto')
        ax2.set_xlabel('X (m)')
        ax2.set_ylabel('Y (m)')
        ax2.set_title('Log10 Permeability Field')
        plt.colorbar(im, ax=ax2, label='log10(k) [m²]')
        
        plt.tight_layout()
        plt.savefig(output_path, dpi=150, bbox_inches='tight')
        plt.close()
        
        return output_path
    
    def get_statistics(self) -> Dict:
        lengths = [f.length for f in self.fractures]
        apertures = [f.aperture for f in self.fractures]
        angles = [f.angle for f in self.fractures]
        
        return {
            'n_fractures': len(self.fractures),
            'n_intersections': len(self.intersection_points),
            'length_mean': np.mean(lengths),
            'length_std': np.std(lengths),
            'aperture_mean': np.mean(apertures),
            'aperture_std': np.std(apertures),
            'total_length': np.sum(lengths),
            'p32': np.sum(lengths) / (self.config.domain_size[0] * self.config.domain_size[1])
        }
