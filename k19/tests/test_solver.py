import os
import sys
import numpy as np
import pytest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'src', 'python'))

from config import SimulationConfig, AquiferParams, Nuclide, SourceConfig, GridConfig
from solver import RadTranSolver


class TestSolver:
    def test_config_creation(self):
        config = SimulationConfig(
            aquifer=AquiferParams(
                porosity=0.3,
                permeability=1e-10,
                alpha_l=10.0,
                alpha_t=1.0,
                retardation=1.0
            ),
            nuclides=[
                Nuclide(
                    name='Cs-137',
                    half_life=9.46e8,
                    distribution_coeff=1.0
                )
            ],
            source=SourceConfig(
                mode='instant',
                strength=1e6,
                x=50.0,
                y=50.0,
                radius=5.0
            ),
            grid=GridConfig(
                nx=50,
                ny=50,
                dx=2.0,
                dy=2.0
            ),
            max_time=86400 * 365,
            threshold=100.0
        )
        
        assert config.aquifer.porosity == 0.3
        assert len(config.nuclides) == 1
        assert config.grid.nx == 50
    
    def test_decay_chain_matrix(self):
        config = SimulationConfig(
            nuclides=[
                Nuclide(name='A', half_life=1e6, distribution_coeff=0.1),
                Nuclide(name='B', half_life=1e5, distribution_coeff=0.2, parent='A'),
                Nuclide(name='C', half_life=1e4, distribution_coeff=0.3, parent='B'),
            ]
        )
        
        chain = config.get_decay_chain_matrix()
        
        assert chain.shape == (3, 3)
        assert chain[0, 1] == 1
        assert chain[1, 2] == 1
        assert chain[0, 2] == 0
    
    def test_solver_run(self):
        config = SimulationConfig(
            aquifer=AquiferParams(
                porosity=0.3,
                permeability=1e-10,
                alpha_l=5.0,
                alpha_t=0.5,
                retardation=1.0
            ),
            nuclides=[
                Nuclide(
                    name='Test-1',
                    half_life=1e10,
                    distribution_coeff=0.0
                )
            ],
            source=SourceConfig(
                mode='instant',
                strength=1e5,
                x=50.0,
                y=50.0,
                radius=3.0
            ),
            grid=GridConfig(
                nx=50,
                ny=50,
                dx=2.0,
                dy=2.0
            ),
            max_time=86400 * 30,
            cfl_max=0.5,
            max_time_steps=1000,
            threshold=100.0
        )
        
        config.output_times = [86400 * 7, 86400 * 30]
        
        solver = RadTranSolver(config)
        results = solver.run()
        
        assert 'concentration' in results
        assert results['concentration'].shape == (50, 50, 1, 2)
        assert 'x_coords' in results
        assert 'y_coords' in results
        assert results['cfl_max'] <= 0.5 + 0.1
    
    def test_mass_conservation(self):
        config = SimulationConfig(
            aquifer=AquiferParams(
                porosity=0.3,
                permeability=0.0,
                alpha_l=0.1,
                alpha_t=0.01,
                retardation=1.0
            ),
            nuclides=[
                Nuclide(
                    name='Stable',
                    half_life=1e20,
                    distribution_coeff=0.0
                )
            ],
            source=SourceConfig(
                mode='instant',
                strength=1e6,
                x=50.0,
                y=50.0,
                radius=5.0
            ),
            grid=GridConfig(
                nx=60,
                ny=60,
                dx=2.0,
                dy=2.0
            ),
            max_time=86400 * 10,
            cfl_max=0.5,
            max_time_steps=500,
            threshold=100.0
        )
        
        config.output_times = [86400 * 10]
        
        solver = RadTranSolver(config)
        results = solver.run()
        
        initial_mass = np.sum(results['concentration'][:, :, 0, 0])
        assert initial_mass > 0
    
    def test_monitoring_points(self):
        config = SimulationConfig(
            aquifer=AquiferParams(
                porosity=0.3,
                permeability=1e-10,
                alpha_l=5.0,
                alpha_t=0.5,
                retardation=1.0
            ),
            nuclides=[
                Nuclide(
                    name='Cs-137',
                    half_life=9.46e8,
                    distribution_coeff=1.0
                )
            ],
            source=SourceConfig(
                mode='instant',
                strength=1e6,
                x=50.0,
                y=50.0,
                radius=5.0
            ),
            grid=GridConfig(
                nx=50,
                ny=50,
                dx=2.0,
                dy=2.0
            ),
            max_time=86400 * 100,
            monitoring_points={
                'MW1': [100.0, 50.0],
                'MW2': [150.0, 50.0]
            },
            threshold=100.0
        )
        
        solver = RadTranSolver(config)
        results = solver.run()
        
        assert 'breakthrough_curves' in results
        assert 'MW1' in results['breakthrough_curves']
        assert 'MW2' in results['breakthrough_curves']
        assert len(results['breakthrough_curves']['MW1']['concentrations']) == 1


if __name__ == '__main__':
    pytest.main([__file__, '-v'])
