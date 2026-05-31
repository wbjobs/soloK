#!/usr/bin/env python
import sys
import os

sys.path.insert(0, os.path.join(os.path.dirname(__file__), 'src'))

import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
import numpy as np

from python.config import SimulationConfig, AquiferParams, Nuclide, SourceConfig, GridConfig
from python.dfn import DiscreteFractureNetwork, DFNConfig
from python.dfn_transport import DFNTransportSolver, DualPorosityConfig
from python.reactive_transport import ReactionSystem, setup_typical_system, ReactiveTransportSolver
from python.visualization import Visualizer
from python.export import Exporter


def test_dfn_generation():
    print('=' * 60)
    print('测试1: 离散裂隙网络(DFN)生成')
    print('=' * 60)
    
    dfn_config = DFNConfig(
        domain_size=(200.0, 100.0),
        n_fractures=80,
        length_mean=30.0,
        length_std=15.0,
        length_min=5.0,
        aperture_mean=0.0005,
        aperture_std=0.0002,
        angle_distribution='fisher',
        angle_mean=0.0,
        angle_std=np.pi / 8,
        seed=42
    )
    
    dfn = DiscreteFractureNetwork(dfn_config)
    
    stats = dfn.get_statistics()
    print(f'裂隙数量: {stats["n_fractures"]}')
    print(f'交叉点数量: {stats["n_intersections"]}')
    print(f'平均长度: {stats["length_mean"]:.1f} m')
    print(f'平均隙宽: {stats["aperture_mean"]*1000:.3f} mm')
    print(f'P32 (裂隙密度): {stats["p32"]:.4f} m/m²')
    
    output_dir = 'output_dfn'
    os.makedirs(output_dir, exist_ok=True)
    
    visualizer = Visualizer(output_dir)
    visualizer.plot_dfn_network(dfn)
    
    return dfn


def test_dfn_transport():
    print('\n' + '=' * 60)
    print('测试2: DFN优先流通道迁移')
    print('=' * 60)
    
    config = SimulationConfig(
        aquifer=AquiferParams(
            porosity=0.3,
            permeability=1e-12,
            alpha_l=5.0,
            alpha_t=0.5,
            retardation=1.0
        ),
        nuclides=[
            Nuclide(
                name='U-238',
                half_life=1.41e17,
                distribution_coeff=0.1
            )
        ],
        source=SourceConfig(
            mode='instant',
            strength=1e6,
            x=20.0,
            y=50.0,
            radius=5.0
        ),
        grid=GridConfig(
            nx=80,
            ny=40,
            dx=2.5,
            dy=2.5
        ),
        max_time=86400 * 365 * 10,
        cfl_max=0.5,
        max_time_steps=5000,
        monitoring_points={
            'MW-01': [60.0, 50.0],
            'MW-02': [100.0, 50.0],
            'MW-03': [150.0, 50.0]
        },
        threshold=100.0
    )
    
    config.output_times = np.logspace(
        np.log10(86400),
        np.log10(config.max_time),
        8
    ).tolist()
    
    dfn_config = DFNConfig(
        domain_size=(config.grid.nx * config.grid.dx,
                    config.grid.ny * config.grid.dy),
        n_fractures=60,
        length_mean=40.0,
        length_std=20.0,
        aperture_mean=0.0005,
        aperture_std=0.0002,
        angle_mean=0.0,
        angle_std=np.pi / 6,
        seed=42
    )
    
    solver = DFNTransportSolver(config, dfn_config)
    
    print('运行DFN迁移模拟...')
    results = solver.run(use_dual_porosity=False)
    
    output_dir = 'output_dfn_transport'
    visualizer = Visualizer(output_dir)
    
    visualizer.plot_dfn_network(results['dfn'])
    
    for t_idx in range(min(4, len(results['concentration']))):
        visualizer.plot_dfn_concentration(
            results,
            time_idx=t_idx,
            threshold=config.threshold,
            filename=f'dfn_concentration_t{t_idx:03d}.png'
        )
    
    monitoring_points = config.monitoring_points
    visualizer.plot_preferential_breakthrough(results, monitoring_points)
    
    exporter = Exporter(output_dir)
    
    for t_idx in range(len(results['concentration'])):
        time_days = results['times'][t_idx] / 86400
        csv_data = {
            'x': np.arange(config.grid.nx) * config.grid.dx,
            'y': np.arange(config.grid.ny) * config.grid.dy,
            'concentration': results['concentration'][t_idx]
        }
        
        filename = os.path.join(output_dir, f'dfn_concentration_t{t_idx:03d}_{int(time_days)}d.csv')
        with open(filename, 'w') as f:
            f.write('x,y,concentration\n')
            for i in range(config.grid.nx):
                for j in range(config.grid.ny):
                    f.write(f'{csv_data["x"][i]},{csv_data["y"][j]},{csv_data["concentration"][i,j]}\n')
    
    return results


def test_dual_porosity():
    print('\n' + '=' * 60)
    print('测试3: 裂隙-基质双重介质模型')
    print('=' * 60)
    
    config = SimulationConfig(
        aquifer=AquiferParams(
            porosity=0.3,
            permeability=1e-12,
            alpha_l=5.0,
            alpha_t=0.5,
            retardation=1.0
        ),
        nuclides=[
            Nuclide(
                name='Cs-137',
                half_life=9.46e8,
                distribution_coeff=2.0
            )
        ],
        source=SourceConfig(
            mode='instant',
            strength=1e7,
            x=20.0,
            y=50.0,
            radius=5.0
        ),
        grid=GridConfig(
            nx=80,
            ny=40,
            dx=2.5,
            dy=2.5
        ),
        max_time=86400 * 365 * 5,
        cfl_max=0.5,
        max_time_steps=5000,
        monitoring_points={
            'Fracture_Well': [80.0, 50.0],
            'Matrix_Well': [120.0, 50.0]
        },
        threshold=100.0
    )
    
    config.output_times = np.logspace(
        np.log10(86400),
        np.log10(config.max_time),
        6
    ).tolist()
    
    dfn_config = DFNConfig(
        domain_size=(config.grid.nx * config.grid.dx,
                    config.grid.ny * config.grid.dy),
        n_fractures=60,
        length_mean=40.0,
        length_std=20.0,
        aperture_mean=0.0005,
        seed=42
    )
    
    dp_config = DualPorosityConfig(
        matrix_diffusion_coeff=1e-10,
        matrix_porosity=0.05,
        fracture_porosity=0.001,
        exchange_rate=1e-7
    )
    
    solver = DFNTransportSolver(config, dfn_config)
    solver.dp_config = dp_config
    
    print('运行双重介质模型...')
    results = solver.run(use_dual_porosity=True)
    
    output_dir = 'output_dual_porosity'
    visualizer = Visualizer(output_dir)
    
    visualizer.plot_dfn_network(results['dfn'], 'dfn_network_dual.png')
    
    if 'fracture_concentration' in results:
        for t_idx in range(min(3, len(results['fracture_concentration']))):
            fig, axes = plt.subplots(1, 2, figsize=(14, 5))
            
            conc_f = results['fracture_concentration'][t_idx]
            x = np.arange(config.grid.nx) * config.grid.dx
            y = np.arange(config.grid.ny) * config.grid.dy
            
            X, Y = np.meshgrid(x, y, indexing='ij')
            
            vmax = np.max(conc_f)
            if vmax > 0:
                levels = np.logspace(np.log10(vmax * 0.001), np.log10(vmax), 15)
                cs1 = axes[0].contourf(X, Y, conc_f, levels=levels, cmap='hot_r',
                                       norm=plt.matplotlib.colors.LogNorm(vmin=vmax * 0.001, vmax=vmax))
                plt.colorbar(cs1, ax=axes[0], label='Fracture Conc. (Bq/L)')
            
            axes[0].set_xlabel('X (m)')
            axes[0].set_ylabel('Y (m)')
            time_days = results['times'][t_idx] / 86400
            axes[0].set_title(f'Fracture Domain at t = {time_days:.0f} days')
            axes[0].set_aspect('equal')
            
            conc_m = results['matrix_concentration']
            vmax_m = np.max(conc_m)
            if vmax_m > 0:
                levels_m = np.logspace(np.log10(vmax_m * 0.001), np.log10(vmax_m), 15)
                cs2 = axes[1].contourf(X, Y, conc_m, levels=levels_m, cmap='hot_r',
                                       norm=plt.matplotlib.colors.LogNorm(vmin=vmax_m * 0.001, vmax=vmax_m))
                plt.colorbar(cs2, ax=axes[1], label='Matrix Conc. (Bq/L)')
            
            axes[1].set_xlabel('X (m)')
            axes[1].set_ylabel('Y (m)')
            axes[1].set_title(f'Matrix Domain at t = {time_days:.0f} days')
            axes[1].set_aspect('equal')
            
            plt.tight_layout()
            filepath = os.path.join(output_dir, f'dual_domain_t{t_idx:03d}.png')
            plt.savefig(filepath, dpi=150, bbox_inches='tight')
            plt.close()
            print(f'Saved: {filepath}')
    
    return results


def test_reactive_transport():
    print('\n' + '=' * 60)
    print('测试4: 反应性迁移 (离子交换与表面络合)')
    print('=' * 60)
    
    system = setup_typical_system()
    
    aqueous = {
        'Na+': 0.01,
        'Ca+2': 0.001,
        'HCO3-': 0.002,
        'UO2+2': 1e-8
    }
    
    pH_values = [5.0, 6.5, 8.0, 9.5]
    Eh_values = [0.1, 0.3, 0.5]
    
    output_dir = 'output_reactive'
    os.makedirs(output_dir, exist_ok=True)
    
    print('离子交换平衡计算...')
    for pH in [6.0, 7.0, 8.0]:
        print(f'\npH = {pH}:')
        exchanged = system.ion_exchange_equilibrium(aqueous, 'X-')
        for species, conc in exchanged.items():
            print(f'  {species}: {conc:.4e} mol/kg')
    
    print('\n表面络合平衡计算...')
    for pH in pH_values[:3]:
        print(f'\npH = {pH}:')
        complexed = system.surface_complexation_equilibrium(aqueous, '>SOH', pH)
        for species, conc in complexed.items():
            print(f'  {species}: {conc:.4e} mol/m²')
    
    print('\n核素形态分布计算...')
    nuclides = ['U', 'Np', 'Pu', 'Cs', 'Sr', 'Tc']
    for nuclide in nuclides:
        for pH in [6.0, 7.5, 9.0]:
            for Eh in [0.2, 0.5]:
                speciation = system.calculate_nuclide_speciation(nuclide, 1e-6, pH, Eh)
                R = system.calculate_retardation_factor(nuclide, pH, Eh, Kd=1.0)
                main_species = max(speciation, key=speciation.get)
                print(f'  {nuclide:4s} pH={pH:.1f} Eh={Eh:.1f}V: R={R:.1f}, 主要形态={main_species}')
    
    visualizer = Visualizer(output_dir)
    
    for nuclide in ['U', 'Np', 'Pu']:
        visualizer.plot_ph_eh_diagram(system, nuclide, f'ph_eh_{nuclide}.png')
    
    reactive_solver = ReactiveTransportSolver(system)
    
    initial_aqueous = {
        'Na+': 0.01,
        'Ca+2': 0.001,
        'UO2+2': 1e-6,
        'HCO3-': 0.002
    }
    
    history = reactive_solver.simulate_reaction_evolution(
        initial_aqueous, pH=7.0, Eh=0.4,
        duration=86400 * 365,
        n_steps=100
    )
    
    visualizer.plot_speciation_evolution(history)
    
    return system, history


def test_combined_dfn_reactive():
    print('\n' + '=' * 60)
    print('测试5: DFN + 反应性迁移耦合')
    print('=' * 60)
    
    config = SimulationConfig(
        aquifer=AquiferParams(
            porosity=0.3,
            permeability=1e-12,
            alpha_l=5.0,
            alpha_t=0.5,
            retardation=1.0
        ),
        nuclides=[
            Nuclide(
                name='U-238',
                half_life=1.41e17,
                distribution_coeff=0.1
            )
        ],
        source=SourceConfig(
            mode='instant',
            strength=1e6,
            x=20.0,
            y=50.0,
            radius=5.0
        ),
        grid=GridConfig(
            nx=60,
            ny=30,
            dx=3.0,
            dy=3.0
        ),
        max_time=86400 * 365 * 5,
        cfl_max=0.5,
        max_time_steps=5000,
        monitoring_points={
            'MW-01': [60.0, 45.0],
            'MW-02': [100.0, 45.0],
            'MW-03': [140.0, 45.0]
        },
        threshold=100.0
    )
    
    config.output_times = np.logspace(
        np.log10(86400),
        np.log10(config.max_time),
        6
    ).tolist()
    
    dfn_config = DFNConfig(
        domain_size=(config.grid.nx * config.grid.dx,
                    config.grid.ny * config.grid.dy),
        n_fractures=50,
        length_mean=35.0,
        length_std=15.0,
        aperture_mean=0.0005,
        angle_mean=0.0,
        angle_std=np.pi / 8,
        seed=42
    )
    
    system = setup_typical_system()
    
    solver = DFNTransportSolver(config, dfn_config, system)
    
    print('运行DFN + 反应性迁移耦合模拟...')
    results = solver.run(use_dual_porosity=False, use_reactive=True, pH=7.5, Eh=0.3)
    
    output_dir = 'output_combined'
    visualizer = Visualizer(output_dir)
    
    visualizer.plot_dfn_network(results['dfn'])
    
    for t_idx in range(min(3, len(results['concentration']))):
        visualizer.plot_dfn_concentration(
            results,
            time_idx=t_idx,
            threshold=config.threshold,
            filename=f'combined_concentration_t{t_idx:03d}.png'
        )
    
    if 'speciation_data' in results:
        visualizer.plot_speciation_evolution(results['speciation_data'])
    
    visualizer.plot_ph_eh_diagram(system, 'U', 'ph_eh_U_combined.png')
    
    visualizer.plot_preferential_breakthrough(results, config.monitoring_points)
    
    return results


def main():
    print('=' * 60)
    print('RadTran DFN + 反应性迁移功能测试')
    print('=' * 60)
    
    import matplotlib.pyplot as plt
    
    results = {}
    
    try:
        dfn = test_dfn_generation()
        results['dfn'] = dfn
    except Exception as e:
        print(f'DFN生成失败: {e}')
        import traceback
        traceback.print_exc()
    
    try:
        transport_results = test_dfn_transport()
        results['transport'] = transport_results
    except Exception as e:
        print(f'DFN迁移测试失败: {e}')
        import traceback
        traceback.print_exc()
    
    try:
        dual_results = test_dual_porosity()
        results['dual_porosity'] = dual_results
    except Exception as e:
        print(f'双重介质测试失败: {e}')
        import traceback
        traceback.print_exc()
    
    try:
        reactive_results = test_reactive_transport()
        results['reactive'] = reactive_results
    except Exception as e:
        print(f'反应性迁移测试失败: {e}')
        import traceback
        traceback.print_exc()
    
    try:
        combined_results = test_combined_dfn_reactive()
        results['combined'] = combined_results
    except Exception as e:
        print(f'耦合测试失败: {e}')
        import traceback
        traceback.print_exc()
    
    print('\n' + '=' * 60)
    print('测试完成!')
    print('=' * 60)
    print('\n生成的输出目录:')
    for d in ['output_dfn', 'output_dfn_transport', 'output_dual_porosity', 
              'output_reactive', 'output_combined']:
        if os.path.exists(d):
            files = os.listdir(d)
            print(f'  {d}/ ({len(files)} 个文件)')
    
    return results


if __name__ == '__main__':
    main()
