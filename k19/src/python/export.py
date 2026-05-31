import numpy as np
import os
import csv
import geojson
from typing import Dict, List, Optional


class Exporter:
    def __init__(self, output_dir: str = 'output'):
        self.output_dir = output_dir
        os.makedirs(output_dir, exist_ok=True)
    
    def to_vtk(self, results: Dict, filename_prefix: str = 'concentration'):
        try:
            from pyevtk.hl import gridToVTK
        except ImportError:
            print('pyevtk not available, skipping VTK export')
            return
        
        concentration = results['concentration']
        x = results['x_coords']
        y = results['y_coords']
        nuclide_names = results['nuclide_names']
        output_times = results['output_times']
        
        nx, ny, n_nuclides, n_times = concentration.shape
        
        x_3d = np.concatenate([x, [x[-1] + (x[1] - x[0])]])
        y_3d = np.concatenate([y, [y[-1] + (y[1] - y[0])]])
        z_3d = np.array([0, 1])
        
        for t_idx in range(n_times):
            point_data = {}
            for k in range(n_nuclides):
                data = concentration[:, :, k, t_idx].T
                data_3d = np.zeros((ny, nx, 1))
                data_3d[:, :, 0] = data
                point_data[f'{nuclide_names[k]}'] = data_3d
            
            time_days = output_times[t_idx] / 86400
            filename = os.path.join(
                self.output_dir,
                f'{filename_prefix}_t{t_idx:03d}_{int(time_days)}d'
            )
            
            gridToVTK(filename, x_3d, y_3d, z_3d, pointData=point_data)
            print(f'Saved VTK: {filename}.vtr')
    
    def to_csv(
        self,
        results: Dict,
        nuclide_indices: Optional[List[int]] = None
    ):
        concentration = results['concentration']
        x = results['x_coords']
        y = results['y_coords']
        nuclide_names = results['nuclide_names']
        output_times = results['output_times']
        
        if nuclide_indices is None:
            nuclide_indices = list(range(len(nuclide_names)))
        
        nx, ny, _, n_times = concentration.shape
        
        for t_idx in range(n_times):
            time_days = output_times[t_idx] / 86400
            filename = os.path.join(
                self.output_dir,
                f'concentration_t{t_idx:03d}_{int(time_days)}d.csv'
            )
            
            with open(filename, 'w', newline='') as f:
                writer = csv.writer(f)
                header = ['x', 'y'] + [nuclide_names[k] for k in nuclide_indices]
                writer.writerow(header)
                
                for i in range(nx):
                    for j in range(ny):
                        row = [x[i], y[j]]
                        for k in nuclide_indices:
                            row.append(concentration[i, j, k, t_idx])
                        writer.writerow(row)
            
            print(f'Saved CSV: {filename}')
        
        if 'breakthrough_curves' in results:
            self._breakthrough_to_csv(results, nuclide_indices)
    
    def _breakthrough_to_csv(self, results: Dict, nuclide_indices: List[int]):
        bt_curves = results['breakthrough_curves']
        nuclide_names = results['nuclide_names']
        
        for point_name, data in bt_curves.items():
            filename = os.path.join(
                self.output_dir,
                f'breakthrough_{point_name}.csv'
            )
            
            with open(filename, 'w', newline='') as f:
                writer = csv.writer(f)
                header = ['time_days'] + [nuclide_names[k] for k in nuclide_indices]
                writer.writerow(header)
                
                for t_idx, time in enumerate(data['times']):
                    row = [time / 86400]
                    for k in nuclide_indices:
                        row.append(data['concentrations'][k, t_idx])
                    writer.writerow(row)
            
            print(f'Saved breakthrough CSV: {filename}')
    
    def threshold_boundary_to_geojson(
        self,
        results: Dict,
        threshold: float,
        nuclide_idx: int = 0
    ):
        from skimage import measure
        
        concentration = results['concentration']
        x = results['x_coords']
        y = results['y_coords']
        output_times = results['output_times']
        nuclide_name = results['nuclide_names'][nuclide_idx]
        
        features = []
        
        for t_idx in range(concentration.shape[3]):
            conc = concentration[:, :, nuclide_idx, t_idx]
            
            try:
                contours = measure.find_contours(conc, threshold)
            except ImportError:
                print('scikit-image not available, using simple contour detection')
                contours = self._simple_contours(conc, threshold)
            
            time_days = output_times[t_idx] / 86400
            
            for contour in contours:
                coords = []
                for point in contour:
                    i, j = int(point[0]), int(point[1])
                    i = np.clip(i, 0, len(x) - 1)
                    j = np.clip(j, 0, len(y) - 1)
                    coords.append([x[i], y[j]])
                
                if len(coords) >= 3:
                    polygon = geojson.Polygon([coords])
                    feature = geojson.Feature(
                        geometry=polygon,
                        properties={
                            'time_days': time_days,
                            'nuclide': nuclide_name,
                            'threshold': threshold
                        }
                    )
                    features.append(feature)
        
        feature_collection = geojson.FeatureCollection(features)
        
        filename = os.path.join(
            self.output_dir,
            f'threshold_boundary_{nuclide_name}_{threshold}BqL.geojson'
        )
        
        with open(filename, 'w') as f:
            geojson.dump(feature_collection, f, indent=2)
        
        print(f'Saved GeoJSON: {filename}')
        return filename
    
    def _simple_contours(self, data: np.ndarray, threshold: float) -> List[np.ndarray]:
        from scipy.ndimage import binary_dilation
        
        mask = data > threshold
        boundary = mask & ~binary_dilation(mask)
        
        points = np.argwhere(boundary)
        if len(points) == 0:
            return []
        
        contours = []
        visited = set()
        
        for start in points:
            start_tuple = tuple(start)
            if start_tuple in visited:
                continue
            
            contour = [start]
            current = start
            visited.add(start_tuple)
            
            while True:
                neighbors = []
                for di, dj in [(-1,0), (1,0), (0,-1), (0,1), (-1,-1), (-1,1), (1,-1), (1,1)]:
                    ni, nj = current[0] + di, current[1] + dj
                    if (0 <= ni < data.shape[0] and 0 <= nj < data.shape[1] and
                        boundary[ni, nj] and (ni, nj) not in visited):
                        neighbors.append((ni, nj))
                
                if not neighbors:
                    break
                
                current = np.array(neighbors[0])
                contour.append(current)
                visited.add(neighbors[0])
            
            if len(contour) >= 3:
                contours.append(np.array(contour))
        
        return contours
    
    def save_summary(self, results: Dict, config_path: str = None):
        filename = os.path.join(self.output_dir, 'summary.txt')
        
        with open(filename, 'w') as f:
            f.write('=== RadTran Simulation Summary ===\n\n')
            f.write(f"Max CFL number: {results['cfl_max']:.4f}\n")
            f.write(f"Number of time steps: {len(results['time_steps'])}\n")
            f.write(f"Total simulation time: {np.sum(results['time_steps']) / 86400:.1f} days\n")
            f.write(f"Min time step: {np.min(results['time_steps']) / 3600:.2f} hours\n")
            f.write(f"Max time step: {np.max(results['time_steps']) / 3600:.2f} hours\n")
            f.write(f"Mean time step: {np.mean(results['time_steps']) / 3600:.2f} hours\n\n")
            
            f.write('Nuclides:\n')
            for name in results['nuclide_names']:
                f.write(f'  - {name}\n')
            
            if config_path:
                f.write(f'\nConfiguration file: {config_path}\n')
        
        print(f'Saved summary: {filename}')
