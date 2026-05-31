import numpy as np
from typing import Dict, List, Optional, Callable
from tqdm import tqdm
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
import os

from .config import SimulationConfig
from .solver import RadTranSolver


class SensitivityAnalyzer:
    def __init__(
        self,
        base_config: SimulationConfig,
        output_dir: str = 'output/sensitivity'
    ):
        self.base_config = base_config
        self.output_dir = output_dir
        os.makedirs(output_dir, exist_ok=True)
        
        self.parameter_distributions = {}
    
    def add_parameter(
        self,
        name: str,
        mean: float,
        std: float,
        distribution: str = 'normal',
        param_type: str = 'aquifer'
    ):
        self.parameter_distributions[name] = {
            'mean': mean,
            'std': std,
            'distribution': distribution,
            'type': param_type
        }
    
    def sample_parameters(self, n_samples: int) -> Dict[str, np.ndarray]:
        samples = {}
        
        for name, dist in self.parameter_distributions.items():
            if dist['distribution'] == 'normal':
                samples[name] = np.random.normal(
                    dist['mean'],
                    dist['std'],
                    n_samples
                )
                samples[name] = np.maximum(samples[name], 1e-10)
            elif dist['distribution'] == 'lognormal':
                mu = np.log(dist['mean']**2 / np.sqrt(dist['mean']**2 + dist['std']**2))
                sigma = np.sqrt(np.log(1 + dist['std']**2 / dist['mean']**2))
                samples[name] = np.random.lognormal(mu, sigma, n_samples)
            elif dist['distribution'] == 'uniform':
                half_range = dist['std'] * np.sqrt(3)
                samples[name] = np.random.uniform(
                    dist['mean'] - half_range,
                    dist['mean'] + half_range,
                    n_samples
                )
        
        return samples
    
    def run_monte_carlo(
        self,
        n_samples: int,
        monitor_point: List[float],
        nuclide_idx: int = 0,
        time_idx: Optional[int] = None
    ) -> Dict:
        samples = self.sample_parameters(n_samples)
        results = []
        concentrations = []
        
        print(f'Running Monte Carlo simulation with {n_samples} samples...')
        
        for i in tqdm(range(n_samples)):
            config = self._create_config_from_sample(samples, i)
            
            solver = RadTranSolver(config)
            result = solver.run()
            
            x, y = monitor_point
            xi = int(x / config.grid.dx)
            yi = int(y / config.grid.dy)
            xi = np.clip(xi, 0, config.grid.nx - 1)
            yi = np.clip(yi, 0, config.grid.ny - 1)
            
            if time_idx is None:
                conc = result['concentration'][xi, yi, nuclide_idx, :]
            else:
                conc = result['concentration'][xi, yi, nuclide_idx, time_idx]
            
            concentrations.append(conc)
            results.append(result)
        
        return {
            'samples': samples,
            'concentrations': np.array(concentrations),
            'output_times': results[0]['output_times'] if time_idx is None else None,
            'monitor_point': monitor_point,
            'nuclide_idx': nuclide_idx
        }
    
    def _create_config_from_sample(self, samples: Dict[str, np.ndarray], idx: int) -> SimulationConfig:
        import copy
        config = copy.deepcopy(self.base_config)
        
        for name, value in samples.items():
            param = self.parameter_distributions[name]
            
            if param['type'] == 'aquifer':
                if hasattr(config.aquifer, name):
                    setattr(config.aquifer, name, value[idx])
            elif param['type'] == 'source':
                if hasattr(config.source, name):
                    setattr(config.source, name, value[idx])
        
        return config
    
    def analyze_exceedance_probability(
        self,
        mc_results: Dict,
        threshold: float,
        time_idx: Optional[int] = None
    ) -> Dict:
        concentrations = mc_results['concentrations']
        
        if concentrations.ndim == 2:
            exceedance = np.mean(concentrations > threshold, axis=0)
            time_varying = True
        else:
            exceedance = np.mean(concentrations > threshold)
            time_varying = False
        
        analysis = {
            'threshold': threshold,
            'exceedance_probability': exceedance,
            'mean_concentration': np.mean(concentrations, axis=0),
            'median_concentration': np.median(concentrations, axis=0),
            'p5_concentration': np.percentile(concentrations, 5, axis=0),
            'p95_concentration': np.percentile(concentrations, 95, axis=0),
            'time_varying': time_varying
        }
        
        return analysis
    
    def plot_concentration_distribution(
        self,
        mc_results: Dict,
        time_idx: int = -1,
        threshold: Optional[float] = None
    ):
        concentrations = mc_results['concentrations']
        
        if concentrations.ndim == 2:
            data = concentrations[:, time_idx]
        else:
            data = concentrations
        
        fig, (ax1, ax2) = plt.subplots(1, 2, figsize=(12, 5))
        
        ax1.hist(data, bins=30, edgecolor='black', alpha=0.7)
        ax1.set_xlabel('Concentration (Bq/L)')
        ax1.set_ylabel('Frequency')
        ax1.set_title('Concentration Distribution (Histogram)')
        ax1.grid(True, alpha=0.3)
        
        if threshold is not None:
            ax1.axvline(threshold, color='red', linestyle='--',
                       label=f'Threshold ({threshold} Bq/L)')
            ax1.legend()
        
        ax2.hist(np.log10(np.maximum(data, 1e-10)), bins=30, edgecolor='black', alpha=0.7)
        ax2.set_xlabel('Concentration (log10 Bq/L)')
        ax2.set_ylabel('Frequency')
        ax2.set_title('Concentration Distribution (Log Scale)')
        ax2.grid(True, alpha=0.3)
        
        if threshold is not None:
            ax2.axvline(np.log10(threshold), color='red', linestyle='--',
                       label=f'Threshold ({threshold} Bq/L)')
            ax2.legend()
        
        plt.tight_layout()
        filename = os.path.join(self.output_dir, 'concentration_distribution.png')
        plt.savefig(filename, dpi=150, bbox_inches='tight')
        plt.close()
        print(f'Saved: {filename}')
    
    def plot_exceedance_probability(
        self,
        mc_results: Dict,
        analysis: Dict
    ):
        if not analysis['time_varying']:
            print('Exceedance probability is time-independent')
            return
        
        output_times = mc_results['output_times']
        exceedance = analysis['exceedance_probability']
        
        fig, ax = plt.subplots(figsize=(10, 6))
        
        ax.plot(output_times / 86400, exceedance * 100, 'b-', linewidth=2)
        ax.set_xlabel('Time (days)')
        ax.set_ylabel('Exceedance Probability (%)')
        ax.set_title(f'Exceedance Probability (Threshold: {analysis["threshold"]} Bq/L)')
        ax.grid(True, alpha=0.3)
        ax.set_ylim(0, 100)
        
        plt.tight_layout()
        filename = os.path.join(self.output_dir, 'exceedance_probability.png')
        plt.savefig(filename, dpi=150, bbox_inches='tight')
        plt.close()
        print(f'Saved: {filename}')
    
    def plot_confidence_bands(
        self,
        mc_results: Dict,
        analysis: Dict
    ):
        if not analysis['time_varying']:
            print('Time series data required for confidence bands')
            return
        
        output_times = mc_results['output_times']
        
        fig, ax = plt.subplots(figsize=(10, 6))
        
        ax.fill_between(
            output_times / 86400,
            analysis['p5_concentration'],
            analysis['p95_concentration'],
            alpha=0.3,
            label='5-95 percentile range'
        )
        ax.plot(output_times / 86400, analysis['mean_concentration'],
               'r-', label='Mean')
        ax.plot(output_times / 86400, analysis['median_concentration'],
               'g--', label='Median')
        
        ax.set_xlabel('Time (days)')
        ax.set_ylabel('Concentration (Bq/L)')
        ax.set_yscale('log')
        ax.set_title('Concentration Confidence Bands')
        ax.legend()
        ax.grid(True, alpha=0.3)
        
        plt.tight_layout()
        filename = os.path.join(self.output_dir, 'confidence_bands.png')
        plt.savefig(filename, dpi=150, bbox_inches='tight')
        plt.close()
        print(f'Saved: {filename}')
    
    def tornado_plot(
        self,
        results: Dict,
        threshold: float
    ):
        param_names = list(self.parameter_distributions.keys())
        sensitivities = []
        
        concentrations = results['concentrations']
        samples = results['samples']
        
        if concentrations.ndim == 2:
            conc_data = concentrations[:, -1]
        else:
            conc_data = concentrations
        
        for name in param_names:
            high_mask = samples[name] > np.percentile(samples[name], 75)
            low_mask = samples[name] < np.percentile(samples[name], 25)
            
            high_conc = np.mean(conc_data[high_mask])
            low_conc = np.mean(conc_data[low_mask])
            
            sensitivities.append(abs(high_conc - low_conc))
        
        sorted_indices = np.argsort(sensitivities)
        sorted_params = [param_names[i] for i in sorted_indices]
        sorted_sens = [sensitivities[i] for i in sorted_indices]
        
        fig, ax = plt.subplots(figsize=(10, 6))
        
        y_pos = np.arange(len(sorted_params))
        ax.barh(y_pos, sorted_sens)
        ax.set_yticks(y_pos)
        ax.set_yticklabels(sorted_params)
        ax.set_xlabel('Sensitivity (concentration difference)')
        ax.set_title('Tornado Plot - Parameter Sensitivity Analysis')
        ax.grid(True, alpha=0.3, axis='x')
        
        plt.tight_layout()
        filename = os.path.join(self.output_dir, 'tornado_plot.png')
        plt.savefig(filename, dpi=150, bbox_inches='tight')
        plt.close()
        print(f'Saved: {filename}')
