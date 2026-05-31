import numpy as np
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
from matplotlib.animation import FuncAnimation
from matplotlib.collections import LineCollection
from typing import Dict, Optional, List
import os


class Visualizer:
    def __init__(self, output_dir: str = 'output'):
        self.output_dir = output_dir
        os.makedirs(output_dir, exist_ok=True)
        
    def plot_concentration_contours(
        self,
        results: Dict,
        nuclide_idx: int = 0,
        time_indices: Optional[List[int]] = None,
        log_scale: bool = True,
        threshold: Optional[float] = None
    ):
        concentration = results['concentration']
        x = results['x_coords']
        y = results['y_coords']
        output_times = results['output_times']
        nuclide_name = results['nuclide_names'][nuclide_idx]
        
        if time_indices is None:
            time_indices = list(range(len(output_times)))
        
        for t_idx in time_indices:
            if t_idx >= concentration.shape[3]:
                continue
                
            conc = concentration[:, :, nuclide_idx, t_idx]
            time_days = output_times[t_idx] / 86400
            
            fig, ax = plt.subplots(figsize=(10, 8))
            
            if log_scale:
                conc_plot = np.log10(np.maximum(conc, 1e-10))
                label = f'Concentration (log10 Bq/L) - {nuclide_name}'
            else:
                conc_plot = conc
                label = f'Concentration (Bq/L) - {nuclide_name}'
            
            levels = np.linspace(
                np.min(conc_plot[conc_plot > -10]),
                np.max(conc_plot),
                20
            )
            
            contour = ax.contourf(x, y, conc_plot.T, levels=levels, cmap='viridis')
            plt.colorbar(contour, ax=ax, label=label)
            
            if threshold is not None:
                if log_scale:
                    threshold_log = np.log10(threshold)
                    ax.contour(x, y, conc_plot.T, levels=[threshold_log],
                               colors='red', linewidths=2, linestyles='--')
                else:
                    ax.contour(x, y, conc.T, levels=[threshold],
                               colors='red', linewidths=2, linestyles='--')
            
            ax.set_xlabel('X (m)')
            ax.set_ylabel('Y (m)')
            ax.set_title(f'Concentration Distribution at t = {time_days:.1f} days')
            ax.set_aspect('equal')
            
            filename = os.path.join(
                self.output_dir,
                f'concentration_{nuclide_name}_t{t_idx:03d}_{int(time_days)}d.png'
            )
            plt.savefig(filename, dpi=150, bbox_inches='tight')
            plt.close()
            print(f'Saved: {filename}')
    
    def create_animation(
        self,
        results: Dict,
        nuclide_idx: int = 0,
        log_scale: bool = True,
        fps: int = 5,
        threshold: Optional[float] = None
    ):
        concentration = results['concentration']
        x = results['x_coords']
        y = results['y_coords']
        output_times = results['output_times']
        nuclide_name = results['nuclide_names'][nuclide_idx]
        
        fig, ax = plt.subplots(figsize=(10, 8))
        
        if log_scale:
            conc_flat = np.log10(np.maximum(concentration[:, :, nuclide_idx, :], 1e-10))
            label = f'Concentration (log10 Bq/L) - {nuclide_name}'
        else:
            conc_flat = concentration[:, :, nuclide_idx, :]
            label = f'Concentration (Bq/L) - {nuclide_name}'
        
        vmin = np.min(conc_flat[conc_flat > -10])
        vmax = np.max(conc_flat)
        
        X, Y = np.meshgrid(x, y, indexing='ij')
        im = ax.pcolormesh(X, Y, conc_flat[:, :, 0].T, vmin=vmin, vmax=vmax, cmap='viridis')
        plt.colorbar(im, ax=ax, label=label)
        
        title = ax.set_title('')
        ax.set_xlabel('X (m)')
        ax.set_ylabel('Y (m)')
        ax.set_aspect('equal')
        
        threshold_contour = None
        
        def update(frame):
            im.set_array(conc_flat[:, :, frame].T.ravel())
            time_days = output_times[frame] / 86400
            title.set_text(f'Concentration Distribution at t = {time_days:.1f} days')
            
            nonlocal threshold_contour
            if threshold is not None:
                for c in ax.collections:
                    if c.get_label() == 'threshold':
                        c.remove()
                if log_scale:
                    threshold_log = np.log10(threshold)
                    ax.contour(x, y, conc_flat[:, :, frame].T, levels=[threshold_log],
                               colors='red', linewidths=2, label='threshold')
                else:
                    ax.contour(x, y, concentration[:, :, nuclide_idx, frame].T,
                               levels=[threshold], colors='red', linewidths=2, label='threshold')
            
            return im, title
        
        n_frames = concentration.shape[3]
        anim = FuncAnimation(fig, update, frames=n_frames, interval=1000/fps, blit=False)
        
        filename = os.path.join(self.output_dir, f'animation_{nuclide_name}.gif')
        anim.save(filename, writer='pillow', fps=fps)
        plt.close()
        print(f'Saved animation: {filename}')
    
    def plot_breakthrough_curves(
        self,
        results: Dict,
        nuclide_indices: Optional[List[int]] = None
    ):
        if 'breakthrough_curves' not in results:
            print('No breakthrough curves data available')
            return
        
        bt_curves = results['breakthrough_curves']
        nuclide_names = results['nuclide_names']
        
        if nuclide_indices is None:
            nuclide_indices = list(range(len(nuclide_names)))
        
        n_points = len(bt_curves)
        n_cols = min(2, n_points)
        n_rows = (n_points + n_cols - 1) // n_cols
        
        fig, axes = plt.subplots(n_rows, n_cols, figsize=(6*n_cols, 4*n_rows))
        if n_points == 1:
            axes = [axes]
        else:
            axes = axes.flatten()
        
        for i, (point_name, data) in enumerate(bt_curves.items()):
            ax = axes[i]
            times_days = data['times'] / 86400
            
            for k in nuclide_indices:
                conc = data['concentrations'][k, :]
                ax.semilogy(times_days, conc, label=nuclide_names[k], marker='o')
            
            ax.set_xlabel('Time (days)')
            ax.set_ylabel('Concentration (Bq/L)')
            ax.set_title(f'Breakthrough Curve at {point_name} ({data["x"]:.1f}, {data["y"]:.1f})')
            ax.legend()
            ax.grid(True, alpha=0.3)
            ax.set_ylim(bottom=1e-10)
        
        for j in range(i + 1, len(axes)):
            axes[j].set_visible(False)
        
        plt.tight_layout()
        filename = os.path.join(self.output_dir, 'breakthrough_curves.png')
        plt.savefig(filename, dpi=150, bbox_inches='tight')
        plt.close()
        print(f'Saved: {filename}')
    
    def plot_cfl_history(self, results: Dict):
        time_steps = results['time_steps']
        
        fig, (ax1, ax2) = plt.subplots(1, 2, figsize=(12, 4))
        
        ax1.plot(time_steps / 3600, marker='.')
        ax1.set_xlabel('Step number')
        ax1.set_ylabel('Time step (hours)')
        ax1.set_title('Time step history')
        ax1.grid(True, alpha=0.3)
        
        ax2.hist(time_steps / 3600, bins=30, edgecolor='black')
        ax2.set_xlabel('Time step (hours)')
        ax2.set_ylabel('Frequency')
        ax2.set_title('Time step distribution')
        ax2.grid(True, alpha=0.3)
        
        plt.tight_layout()
        filename = os.path.join(self.output_dir, 'timestep_history.png')
        plt.savefig(filename, dpi=150, bbox_inches='tight')
        plt.close()
        print(f'Saved: {filename}')
    
    def plot_dfn_network(self, dfn, filename: str = 'dfn_network.png'):
        fig, (ax1, ax2) = plt.subplots(1, 2, figsize=(15, 6))
        
        lines = []
        apertures = []
        for f in dfn.fractures:
            lines.append([(f.x1, f.y1), (f.x2, f.y2)])
            apertures.append(f.aperture * 1000)
        
        lc = LineCollection(lines, linewidths=np.array(apertures) * 2, cmap='viridis')
        lc.set_array(np.array(apertures))
        ax1.add_collection(lc)
        
        if dfn.intersection_points:
            x_int = [p[0] for p in dfn.intersection_points]
            y_int = [p[1] for p in dfn.intersection_points]
            ax1.scatter(x_int, y_int, c='red', s=20, zorder=5, label='Intersections')
        
        ax1.set_xlim(0, dfn.config.domain_size[0])
        ax1.set_ylim(0, dfn.config.domain_size[1])
        ax1.set_aspect('equal')
        ax1.set_xlabel('X (m)')
        ax1.set_ylabel('Y (m)')
        ax1.set_title(f'DFN Network (n={len(dfn.fractures)} fractures)')
        ax1.legend()
        plt.colorbar(lc, ax=ax1, label='Aperture (mm)')
        
        nx, ny = 100, 100
        k_field = dfn.get_permeability_field(nx, ny)
        im = ax2.imshow(np.log10(k_field.T), origin='lower',
                       extent=[0, dfn.config.domain_size[0], 0, dfn.config.domain_size[1]],
                       cmap='jet', aspect='auto')
        ax2.set_xlabel('X (m)')
        ax2.set_ylabel('Y (m)')
        ax2.set_title('Log10 Permeability Field')
        plt.colorbar(im, ax=ax2, label='log10(k) [m²]')
        
        plt.tight_layout()
        filepath = os.path.join(self.output_dir, filename)
        plt.savefig(filepath, dpi=150, bbox_inches='tight')
        plt.close()
        print(f'Saved: {filepath}')
        return filepath
    
    def plot_dfn_concentration(self, results: Dict, 
                                time_idx: int = -1,
                                threshold: float = None,
                                filename: str = 'dfn_concentration.png'):
        fig, ax = plt.subplots(figsize=(10, 8))
        
        conc = results['concentration'][time_idx]
        x = results.get('x_coords', np.arange(conc.shape[0]))
        y = results.get('y_coords', np.arange(conc.shape[1]))
        
        X, Y = np.meshgrid(x, y, indexing='ij')
        
        vmax = np.max(conc)
        if vmax > 0:
            levels = np.logspace(np.log10(vmax * 0.001), np.log10(vmax), 20)
            cs = ax.contourf(X, Y, conc, levels=levels, cmap='hot_r', 
                           norm=plt.matplotlib.colors.LogNorm(vmin=vmax * 0.001, vmax=vmax))
        else:
            cs = ax.contourf(X, Y, conc, levels=20, cmap='hot_r')
        
        plt.colorbar(cs, ax=ax, label='Concentration (Bq/L)')
        
        if 'dfn' in results:
            dfn = results['dfn']
            for f in dfn.fractures[:20]:
                ax.plot([f.x1, f.x2], [f.y1, f.y2], 'b-', alpha=0.3, linewidth=0.5)
        
        if threshold is not None:
            ax.contour(X, Y, conc, levels=[threshold], colors='yellow', linewidths=2)
        
        ax.set_xlabel('X (m)')
        ax.set_ylabel('Y (m)')
        time_days = results.get('times', [0])[time_idx] / 86400
        ax.set_title(f'DFN Concentration at t = {time_days:.1f} days')
        ax.set_aspect('equal')
        
        filepath = os.path.join(self.output_dir, filename)
        plt.savefig(filepath, dpi=150, bbox_inches='tight')
        plt.close()
        print(f'Saved: {filepath}')
        return filepath
    
    def plot_preferential_breakthrough(self, results: Dict, 
                                        points: Dict[str, List[float]],
                                        filename: str = 'preferential_breakthrough.png'):
        fig, ax = plt.subplots(figsize=(10, 6))
        
        times = results.get('times', []) / 86400
        
        conc_data = results.get('concentration', results)
        
        for name, coords in points.items():
            x, y = coords[0], coords[1]
            xi = min(int(x / (results.get('x_coords', [1])[1] if len(results.get('x_coords', [])) > 1 else 1)), 
                     conc_data.shape[2] - 1)
            yi = min(int(y / (results.get('y_coords', [1])[1] if len(results.get('y_coords', [])) > 1 else 1)), 
                     conc_data.shape[1] - 1)
            
            if conc_data.ndim == 3:
                concs = conc_data[:, yi, xi]
            else:
                concs = conc_data[:, yi, xi]
            
            ax.semilogy(times, concs, 'o-', label=name, markersize=3)
        
        ax.set_xlabel('Time (days)')
        ax.set_ylabel('Concentration (Bq/L)')
        ax.set_title('Preferential Flow Breakthrough Curves')
        ax.legend()
        ax.grid(True, alpha=0.3)
        ax.set_ylim(bottom=1e-10)
        
        filepath = os.path.join(self.output_dir, filename)
        plt.savefig(filepath, dpi=150, bbox_inches='tight')
        plt.close()
        print(f'Saved: {filepath}')
        return filepath
    
    def plot_ph_eh_diagram(self, reaction_system, nuclide: str,
                            filename: str = 'ph_eh_diagram.png'):
        pH_range = np.linspace(3, 11, 50)
        Eh_range = np.linspace(-0.3, 0.8, 50)
        
        pH_grid, Eh_grid = np.meshgrid(pH_range, Eh_range)
        
        mobility = np.zeros_like(pH_grid)
        
        for i in range(len(Eh_range)):
            for j in range(len(pH_range)):
                R = reaction_system.calculate_retardation_factor(
                    nuclide, pH_grid[i, j], Eh_grid[i, j]
                )
                mobility[i, j] = 1.0 / R
        
        fig, ax = plt.subplots(figsize=(10, 8))
        
        contour = ax.contourf(pH_grid, Eh_grid, mobility, 20, cmap='RdYlBu_r')
        plt.colorbar(contour, ax=ax, label='Relative Mobility (1/R)')
        
        ax.set_xlabel('pH')
        ax.set_ylabel('Eh (V)')
        ax.set_title(f'{nuclide} Mobility - pH/Eh Diagram')
        
        eh_upper = 1.23 - 0.059 * pH_range
        eh_lower = 0.0 - 0.059 * pH_range
        ax.plot(pH_range, eh_upper, 'r--', label='O2/H2O')
        ax.plot(pH_range, eh_lower, 'b--', label='H2/H2O')
        
        ax.legend()
        ax.grid(True, alpha=0.3)
        
        filepath = os.path.join(self.output_dir, filename)
        plt.tight_layout()
        plt.savefig(filepath, dpi=150)
        plt.close()
        print(f'Saved: {filepath}')
        return filepath
    
    def plot_speciation_evolution(self, speciation_data: Dict,
                                   filename: str = 'speciation_evolution.png'):
        if 'species' not in speciation_data and 'aqueous' not in speciation_data:
            print('No speciation data available')
            return
        
        fig, axes = plt.subplots(1, 2, figsize=(14, 5))
        
        if 'time' in speciation_data:
            times = np.array(speciation_data.get('time', [])) / 86400
        else:
            times = np.array(speciation_data.get('times', [])) / 86400
        
        ax1 = axes[0]
        
        if 'aqueous' in speciation_data:
            for species, concs in speciation_data['aqueous'].items():
                ax1.semilogy(times[:len(concs)], concs, label=f'{species} (aq)')
        elif 'species' in speciation_data:
            for point_name, species_list in speciation_data['species'].items():
                if len(species_list) > 0:
                    main_species = list(species_list[0].keys())[0] if species_list else ''
                    if main_species:
                        concs = [s.get(main_species, 0) for s in species_list]
                        ax1.semilogy(times[:len(concs)], concs, label=f'{point_name}: {main_species}')
        
        ax1.set_xlabel('Time (days)')
        ax1.set_ylabel('Concentration (Bq/L)')
        ax1.set_title('Aqueous Species Evolution')
        ax1.legend()
        ax1.grid(True, alpha=0.3)
        
        ax2 = axes[1]
        
        if 'sorbed' in speciation_data:
            for species, concs in speciation_data['sorbed'].items():
                ax2.semilogy(times[:len(concs)], concs, label=f'{species} (sorbed)')
        elif 'species' in speciation_data and len(speciation_data['species']) > 0:
            first_point = list(speciation_data['species'].keys())[0]
            species_data = speciation_data['species'][first_point]
            
            if len(species_data) > 0:
                all_species = set()
                for s in species_data:
                    all_species.update(s.keys())
                
                for species in list(all_species)[:5]:
                    concs = [s.get(species, 0) for s in species_data]
                    ax2.semilogy(times[:len(concs)], concs, label=species)
                
                ax2.set_title(f'Speciation at {first_point}')
        
        ax2.set_xlabel('Time (days)')
        ax2.set_ylabel('Concentration (Bq/L)')
        ax2.legend()
        ax2.grid(True, alpha=0.3)
        
        plt.tight_layout()
        filepath = os.path.join(self.output_dir, filename)
        plt.savefig(filepath, dpi=150, bbox_inches='tight')
        plt.close()
        print(f'Saved: {filepath}')
        return filepath
