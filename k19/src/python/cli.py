import argparse
import os
import sys
import numpy as np

from .config import SimulationConfig
from .solver import RadTranSolver
from .visualization import Visualizer
from .export import Exporter
from .sensitivity import SensitivityAnalyzer


def run_simulation(args):
    print('=' * 60)
    print('RadTran - 放射性核素地下水迁移模拟工具')
    print('=' * 60)
    
    config = SimulationConfig.from_yaml(args.config)
    
    output_dir = args.output_dir or 'output'
    os.makedirs(output_dir, exist_ok=True)
    
    print(f'\n加载配置: {args.config}')
    print(f'网格大小: {config.grid.nx} x {config.grid.ny}')
    print(f'网格间距: dx={config.grid.dx}m, dy={config.grid.dy}m')
    print(f'模拟时长: {config.max_time / 86400:.1f} 天')
    print(f'输出时间步数: {len(config.output_times)}')
    print(f'核素数量: {len(config.nuclides)}')
    for n in config.nuclides:
        print(f'  - {n.name}: T1/2 = {n.half_life / 3.154e7:.2e} 年')
    
    print('\n开始模拟...')
    solver = RadTranSolver(config)
    results = solver.run()
    
    print(f"\n模拟完成! 最大CFL数: {results['cfl_max']:.4f}")
    print(f"时间步数: {len(results['time_steps'])}")
    
    visualizer = Visualizer(output_dir)
    exporter = Exporter(output_dir)
    
    if not args.no_plots:
        print('\n生成可视化结果...')
        for k in range(len(config.nuclides)):
            visualizer.plot_concentration_contours(
                results,
                nuclide_idx=k,
                threshold=config.threshold
            )
            
            if args.animation:
                visualizer.create_animation(
                    results,
                    nuclide_idx=k,
                    threshold=config.threshold,
                    fps=args.fps
                )
        
        visualizer.plot_breakthrough_curves(results)
        visualizer.plot_cfl_history(results)
    
    if not args.no_export:
        print('\n导出结果...')
        exporter.to_csv(results)
        
        if args.vtk:
            exporter.to_vtk(results)
        
        if args.geojson:
            exporter.threshold_boundary_to_geojson(
                results,
                threshold=config.threshold
            )
        
        exporter.save_summary(results, args.config)
    
    if args.sensitivity:
        print('\n运行敏感性分析...')
        run_sensitivity_analysis(config, output_dir)
    
    print('\n完成! 结果已保存到:', output_dir)


def run_sensitivity_analysis(config: SimulationConfig, output_dir: str):
    sensitivity_dir = os.path.join(output_dir, 'sensitivity')
    
    analyzer = SensitivityAnalyzer(config, sensitivity_dir)
    
    analyzer.add_parameter('porosity', config.aquifer.porosity, config.aquifer.porosity * 0.1)
    analyzer.add_parameter('alpha_l', config.aquifer.alpha_l, config.aquifer.alpha_l * 0.2)
    analyzer.add_parameter('retardation', config.aquifer.retardation, config.aquifer.retardation * 0.15)
    
    monitor_point = list(config.monitoring_points.values())[0] if config.monitoring_points else [100, 100]
    
    mc_results = analyzer.run_monte_carlo(
        n_samples=50,
        monitor_point=monitor_point,
        nuclide_idx=0
    )
    
    analysis = analyzer.analyze_exceedance_probability(
        mc_results,
        threshold=config.threshold
    )
    
    analyzer.plot_concentration_distribution(mc_results, threshold=config.threshold)
    analyzer.plot_exceedance_probability(mc_results, analysis)
    analyzer.plot_confidence_bands(mc_results, analysis)
    analyzer.tornado_plot(mc_results, config.threshold)
    
    print('敏感性分析完成! 结果保存到:', sensitivity_dir)


def create_example_config(args):
    config_content = """# 放射性核素迁移模拟配置文件

# 含水层参数
aquifer:
  porosity: 0.3           # 孔隙度
  permeability: 1e-10     # 渗透系数 (m/s)
  alpha_l: 10.0           # 纵向弥散度 (m)
  alpha_t: 1.0            # 横向弥散度 (m)
  retardation: 1.0        # 阻滞因子

# 核素参数 (U-238衰变链示例)
nuclides:
  - name: U-238
    half_life: 1.41e17    # 半衰期 (秒) = 44.7亿年
    distribution_coeff: 0.1  # 分配系数 (m^3/kg)
    initial_concentration: 0.0
    
  - name: Th-234
    half_life: 2.08e6     # 半衰期 (秒) = 24.1天
    distribution_coeff: 0.5
    parent: U-238
    
  - name: Ra-226
    half_life: 5.05e10    # 半衰期 (秒) = 1600年
    distribution_coeff: 0.8
    parent: Th-234

# 源项配置
source:
  mode: continuous        # instantaneous | continuous
  strength: 1e6           # 源强 (Bq)
  x: 50.0                 # 源位置 X (m)
  y: 50.0                 # 源位置 Y (m)
  radius: 5.0             # 源半径 (m)
  duration: 3.154e7       # 持续时间 (秒) = 1年

# 网格配置
grid:
  nx: 100                 # X方向网格数
  ny: 100                 # Y方向网格数
  dx: 2.0                 # X方向网格间距 (m)
  dy: 2.0                 # Y方向网格间距 (m)

# 模拟配置
max_time: 3.154e9        # 总模拟时间 (秒) = 100年
cfl_max: 0.5             # 最大CFL数
max_time_steps: 10000    # 最大时间步数
dimensions: 2            # 空间维度
threshold: 100.0         # 浓度阈值 (Bq/L)

# 监测点 (突破曲线位置)
monitoring_points:
  P1: [100.0, 50.0]
  P2: [150.0, 50.0]
  P3: [200.0, 50.0]
"""
    
    output_file = args.output or 'config_example.yaml'
    with open(output_file, 'w', encoding='utf-8') as f:
        f.write(config_content)
    
    print(f'示例配置文件已创建: {output_file}')


def main():
    parser = argparse.ArgumentParser(
        description='RadTran - 放射性核素在地下水中迁移预测工具',
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
示例:
  radtran create-config                  # 创建示例配置文件
  radtran run -c config.yaml             # 运行模拟
  radtran run -c config.yaml --animation # 运行模拟并生成动画
  radtran run -c config.yaml --sensitivity --vtk --geojson
        """
    )
    
    subparsers = parser.add_subparsers(dest='command', help='命令')
    
    run_parser = subparsers.add_parser('run', help='运行模拟')
    run_parser.add_argument('-c', '--config', required=True, help='配置文件路径')
    run_parser.add_argument('-o', '--output-dir', help='输出目录')
    run_parser.add_argument('--no-plots', action='store_true', help='不生成图表')
    run_parser.add_argument('--no-export', action='store_true', help='不导出数据')
    run_parser.add_argument('--animation', action='store_true', help='生成GIF动画')
    run_parser.add_argument('--fps', type=int, default=5, help='动画帧率')
    run_parser.add_argument('--vtk', action='store_true', help='导出VTK格式')
    run_parser.add_argument('--geojson', action='store_true', help='导出超标范围GeoJSON')
    run_parser.add_argument('--sensitivity', action='store_true', help='运行敏感性分析')
    
    create_parser = subparsers.add_parser('create-config', help='创建示例配置文件')
    create_parser.add_argument('-o', '--output', help='输出文件名')
    
    args = parser.parse_args()
    
    if args.command == 'run':
        run_simulation(args)
    elif args.command == 'create-config':
        create_example_config(args)
    else:
        parser.print_help()


if __name__ == '__main__':
    main()
