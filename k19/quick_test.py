#!/usr/bin/env python
import sys
import os

sys.path.insert(0, os.path.join(os.path.dirname(__file__), 'src'))

from python.config import SimulationConfig, AquiferParams, Nuclide, SourceConfig, GridConfig
from python.solver import RadTranSolver
from python.visualization import Visualizer
from python.export import Exporter
import numpy as np


def main():
    print('=' * 60)
    print('RadTran 快速测试')
    print('=' * 60)
    
    config = SimulationConfig(
        aquifer=AquiferParams(
            porosity=0.3,
            permeability=1e-10,
            alpha_l=5.0,
            alpha_t=0.5,
            retardation=1.5
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
        cfl_max=0.5,
        max_time_steps=2000,
        monitoring_points={
            'MW-01': [75.0, 50.0],
            'MW-02': [100.0, 50.0]
        },
        threshold=100.0
    )
    
    config.output_times = np.logspace(
        np.log10(86400),
        np.log10(config.max_time),
        6
    ).tolist()
    
    print(f'\n网格: {config.grid.nx} x {config.grid.ny}')
    print(f'模拟时间: {config.max_time / 86400:.0f} 天')
    print(f'输出时间步: {len(config.output_times)}')
    
    print('\n运行求解器...')
    solver = RadTranSolver(config)
    results = solver.run()
    
    print(f"完成! 最大CFL: {results['cfl_max']:.4f}")
    print(f"时间步数: {len(results['time_steps'])}")
    
    output_dir = 'test_output'
    print(f'\n生成可视化结果到: {output_dir}')
    
    visualizer = Visualizer(output_dir)
    exporter = Exporter(output_dir)
    
    visualizer.plot_concentration_contours(
        results,
        nuclide_idx=0,
        threshold=config.threshold
    )
    
    visualizer.plot_breakthrough_curves(results)
    visualizer.plot_cfl_history(results)
    
    exporter.to_csv(results)
    exporter.save_summary(results)
    
    print('\n测试完成!')
    print(f'结果目录: {os.path.abspath(output_dir)}')


if __name__ == '__main__':
    main()
