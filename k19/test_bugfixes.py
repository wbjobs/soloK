#!/usr/bin/env python
import sys
import os

sys.path.insert(0, os.path.join(os.path.dirname(__file__), 'src'))

from python.config import SimulationConfig, AquiferParams, Nuclide, SourceConfig, GridConfig
from python.solver import RadTranSolver
from python.visualization import Visualizer
from python.export import Exporter
import numpy as np


def test_high_peclet():
    print('=' * 60)
    print('测试1: 高佩克莱特数 (对流主导)')
    print('=' * 60)
    
    config = SimulationConfig(
        aquifer=AquiferParams(
            porosity=0.3,
            permeability=1e-8,
            alpha_l=0.1,
            alpha_t=0.01,
            retardation=1.0
        ),
        nuclides=[
            Nuclide(
                name='Test-1',
                half_life=1e15,
                distribution_coeff=0.0
            )
        ],
        source=SourceConfig(
            mode='instant',
            strength=1e6,
            x=50.0,
            y=50.0,
            radius=3.0
        ),
        grid=GridConfig(
            nx=80,
            ny=60,
            dx=1.0,
            dy=1.0
        ),
        max_time=86400 * 100,
        cfl_max=0.5,
        max_time_steps=5000,
        monitoring_points={
            'P1': [100.0, 50.0],
            'P2': [150.0, 50.0]
        },
        threshold=100.0
    )
    
    config.output_times = np.logspace(
        np.log10(86400),
        np.log10(config.max_time),
        5
    ).tolist()
    
    u_expected = config.aquifer.permeability / config.aquifer.porosity * 0.001
    D_expected = config.aquifer.alpha_l * u_expected
    Pe = u_expected * config.grid.dx / max(D_expected, 1e-15)
    print(f'流速: {u_expected:.2e} m/s')
    print(f'弥散系数: {D_expected:.2e} m²/s')
    print(f'网格佩克莱特数: {Pe:.2f}')
    
    print('\n运行求解器...')
    solver = RadTranSolver(config)
    results = solver.run()
    
    conc = results['concentration']
    min_conc = np.min(conc)
    max_conc = np.max(conc)
    
    print(f'\n浓度范围: [{min_conc:.6e}, {max_conc:.6e}]')
    
    if min_conc < 0:
        print('❌ 失败: 出现负浓度!')
        return False
    else:
        print('✅ 通过: 无负浓度')
    
    output_dir = 'test_output_high_peclet'
    visualizer = Visualizer(output_dir)
    visualizer.plot_concentration_contours(results, threshold=config.threshold)
    
    return True


def test_decay_chain():
    print('\n' + '=' * 60)
    print('测试2: 衰变链质量守恒')
    print('=' * 60)
    
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
                name='Parent',
                half_life=86400 * 10,
                distribution_coeff=0.0,
                initial_concentration=0.0
            ),
            Nuclide(
                name='Daughter',
                half_life=86400 * 100,
                distribution_coeff=0.0,
                parent='Parent'
            ),
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
        max_time=86400 * 50,
        cfl_max=0.5,
        max_time_steps=2000,
        threshold=100.0
    )
    
    config.output_times = [86400 * 1, 86400 * 10, 86400 * 30, 86400 * 50]
    
    print('核素链: Parent -> Daughter')
    print(f'Parent半衰期: {config.nuclides[0].half_life / 86400:.1f} 天')
    print(f'Daughter半衰期: {config.nuclides[1].half_life / 86400:.1f} 天')
    
    print('\n运行求解器...')
    solver = RadTranSolver(config)
    results = solver.run()
    
    conc = results['concentration']
    
    for t_idx, t in enumerate(config.output_times):
        parent_mass = np.sum(conc[:, :, 0, t_idx])
        daughter_mass = np.sum(conc[:, :, 1, t_idx])
        total_mass = parent_mass + daughter_mass
        
        print(f'\nt = {t / 86400:.0f} 天:')
        print(f'  Parent总量: {parent_mass:.4e}')
        print(f'  Daughter总量: {daughter_mass:.4e}')
        print(f'  总量: {total_mass:.4e}')
        
        if daughter_mass > parent_mass * 2:
            print('  ⚠️ 警告: Daughter浓度异常偏高!')
    
    initial_mass = np.sum(conc[:, :, 0, 0])
    final_total = np.sum(conc[:, :, 0, -1]) + np.sum(conc[:, :, 1, -1])
    
    print(f'\n初始总量: {initial_mass:.4e}')
    print(f'最终总量: {final_total:.4e}')
    
    if final_total > initial_mass * 1.1:
        print('❌ 失败: 总量增加 (质量不守恒)!')
        return False
    else:
        print('✅ 通过: 质量守恒')
    
    return True


def main():
    print('=' * 60)
    print('RadTran Bug修复验证')
    print('=' * 60)
    
    results = []
    
    r1 = test_high_peclet()
    results.append(('高佩克莱特数', r1))
    
    r2 = test_decay_chain()
    results.append(('衰变链守恒', r2))
    
    print('\n' + '=' * 60)
    print('测试结果汇总:')
    print('=' * 60)
    for name, passed in results:
        status = '✅ 通过' if passed else '❌ 失败'
        print(f'  {name}: {status}')
    
    if all(r for _, r in results):
        print('\n🎉 所有测试通过!')
    else:
        print('\n⚠️ 存在失败的测试')


if __name__ == '__main__':
    main()
