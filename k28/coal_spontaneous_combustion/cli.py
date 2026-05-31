"""
命令行接口模块
"""
import click
import os
import sys
import numpy as np
from pathlib import Path
import warnings
warnings.filterwarnings('ignore')

from .data_io import read_excel_data, save_results_json, save_comparison_table
from .data_models import CoalSample, ProximateAnalysis, UltimateAnalysis, TGDSCData
from .baseline_correction import baseline_correction
from .kinetics import calculate_all_kinetics
from .spontaneous_combustion import evaluate_spontaneous_combustion, batch_evaluate_samples
from .visualization import plot_tg_dsc_curves, plot_friedman_e_vs_alpha, plot_comparison_tg, plot_risk_comparison
from .report_generator import create_pdf_report, create_batch_report


@click.group()
def cli():
    """煤自燃倾向性鉴定工具"""
    pass


@cli.command()
@click.argument('input_file', type=click.Path(exists=True))
@click.option('--output-dir', '-o', default='output', help='输出目录')
@click.option('--batch/--no-batch', default=False, help='批量处理模式')
def analyze(input_file, output_dir, batch):
    """分析煤样数据
    
    INPUT_FILE: Excel数据文件路径
    """
    click.echo(f'开始分析: {input_file}')
    
    output_path = Path(output_dir)
    output_path.mkdir(parents=True, exist_ok=True)
    
    try:
        samples = read_excel_data(input_file)
        click.echo(f'成功读取 {len(samples)} 个煤样数据')
    except Exception as e:
        click.echo(f'读取数据文件失败: {e}', err=True)
        sys.exit(1)
    
    for idx, sample in enumerate(samples, 1):
        click.echo(f'\n处理煤样 {idx}/{len(samples)}: {sample.sample_name}')
        
        for beta, data in sample.tg_dsc_data.items():
            tg_corrected = baseline_correction(data.temperature, data.tg)
            data.tg = tg_corrected
        
        with click.progressbar(length=1, label='计算动力学参数') as bar:
            sample.kinetic_results = calculate_all_kinetics(sample.tg_dsc_data)
            bar.update(1)
        
        click.echo('  动力学参数计算完成')
        
        for method, result in sample.kinetic_results.items():
            click.echo(f'    {method}: Ea={result.activation_energy:.2f} kJ/mol, R²={result.r_squared:.4f}')
        
        sample.sc_result = evaluate_spontaneous_combustion(sample)
        click.echo(f'  自燃等级: {sample.sc_result.risk_level}')
        click.echo(f'  交叉点温度: {sample.sc_result.crossing_point_temp:.1f}°C')
        click.echo(f'  风险指数: {sample.sc_result.risk_index:.2f}')
        
        sample_output = output_path / sample.sample_id
        sample_output.mkdir(exist_ok=True)
        
        tg_dsc_plot = str(sample_output / 'tg_dsc_curves.png')
        plot_tg_dsc_curves(sample, tg_dsc_plot)
        
        friedman_plot = str(sample_output / 'friedman_analysis.png')
        plot_friedman_e_vs_alpha(sample, friedman_plot)
        
        pdf_report = str(sample_output / 'analysis_report.pdf')
        create_pdf_report(sample, pdf_report, tg_dsc_plot, friedman_plot)
        
        click.echo(f'  报告已生成: {pdf_report}')
    
    save_results_json(samples, str(output_path / 'results.json'))
    save_comparison_table(samples, str(output_path / 'comparison.xlsx'))
    
    if len(samples) > 1:
        click.echo('\n生成批量对比分析...')
        
        comp_plot = str(output_path / 'comparison_tg.png')
        plot_comparison_tg(samples, comp_plot)
        
        risk_plot = str(output_path / 'risk_comparison.png')
        plot_risk_comparison(samples, risk_plot)
        
        batch_report = str(output_path / 'batch_report.pdf')
        create_batch_report(samples, batch_report, [comp_plot, risk_plot])
        
        click.echo(f'批量报告已生成: {batch_report}')
    
    click.echo(f'\n分析完成！结果保存在: {output_path}')


@cli.command()
@click.argument('output_dir', type=click.Path())
def generate_example(output_dir):
    """生成示例数据文件
    
    OUTPUT_DIR: 输出目录
    """
    import pandas as pd
    import numpy as np
    
    output_path = Path(output_dir)
    output_path.mkdir(parents=True, exist_ok=True)
    
    example_file = output_path / 'example_coal_data.xlsx'
    
    info_data = {
        '样本ID': ['CS001', 'CS002', 'CS003'],
        '样本名称': ['煤层100m深度', '煤层200m深度', '煤层300m深度'],
        '水分': [2.5, 3.2, 2.8],
        '灰分': [12.5, 15.8, 18.2],
        '挥发分': [32.5, 28.3, 24.1],
        '固定碳': [52.5, 52.7, 54.9],
        'C': [78.2, 76.5, 75.8],
        'H': [5.2, 4.8, 4.5],
        'O': [12.5, 14.2, 15.8],
        'N': [1.5, 1.3, 1.2],
        'S': [0.8, 0.7, 0.6],
    }
    
    info_df = pd.DataFrame(info_data)
    
    with pd.ExcelWriter(example_file, engine='openpyxl') as writer:
        info_df.to_excel(writer, sheet_name='煤样信息', index=False)
        
        for beta in [5, 10, 15, 20]:
            temp = np.linspace(30, 800, 155)
            
            for idx, sample_id in enumerate(info_data['样本ID']):
                volatile = info_data['挥发分'][idx]
                ea_base = 80 + (35 - volatile) * 2
                
                t0 = 200 + ea_base
                k = np.log(100) / 200
                tg = 100 - 90 / (1 + np.exp(-(temp - t0) / 50))
                tg = tg + np.random.normal(0, 0.3, len(temp))
                
                dsc = 5 * np.exp(-(temp - (t0 + 50))**2 / 10000) + np.random.normal(0, 0.1, len(temp))
                
                tg_df = pd.DataFrame({
                    '温度(°C)': temp,
                    'TG(%)': tg,
                    'DSC(mW/mg)': dsc
                })
                
                tg_df.to_excel(writer, sheet_name=f'TGDSC_{beta}_{sample_id}', index=False)
    
    click.echo(f'示例数据已生成: {example_file}')
    click.echo('\n使用方法:')
    click.echo(f'  coal-analysis analyze {example_file} -o results')


@cli.command()
def list_mechanisms():
    """列出所有可用的反应机理函数"""
    from .mechanism_functions import list_mechanism_functions
    
    mechanisms = list_mechanism_functions()
    
    click.echo('可用的反应机理函数 (共{}种):'.format(len(mechanisms)))
    click.echo('-' * 60)
    
    for code, name in mechanisms:
        click.echo(f'  {code:6} - {name}')


@cli.command()
@click.argument('input_file', type=click.Path(exists=True))
@click.option('--sample', '-s', default=None, help='指定样本ID查看详情')
def summary(input_file, sample):
    """查看分析结果摘要
    
    INPUT_FILE: results.json文件路径
    """
    import json
    
    with open(input_file, 'r', encoding='utf-8') as f:
        results = json.load(f)
    
    if sample:
        for s in results:
            if s['sample_id'] == sample:
                click.echo(f'\n样本: {s["sample_name"]} ({s["sample_id"]})')
                click.echo('-' * 50)
                click.echo('工业分析:')
                click.echo(f'  水分: {s["proximate"]["moisture"]:.2f}%')
                click.echo(f'  灰分: {s["proximate"]["ash"]:.2f}%')
                click.echo(f'  挥发分: {s["proximate"]["volatile"]:.2f}%')
                click.echo(f'  固定碳: {s["proximate"]["fixed_carbon"]:.2f}%')
                
                click.echo('\n动力学参数:')
                for method, r in s['kinetic_results'].items():
                    click.echo(f'  {method}:')
                    click.echo(f'    Ea: {r["activation_energy"]:.2f} kJ/mol')
                    click.echo(f'    R²: {r["r_squared"]:.4f}')
                
                if s['sc_result']:
                    click.echo('\n自燃倾向性:')
                    click.echo(f'  交叉点温度: {s["sc_result"]["crossing_point_temp"]:.1f}°C')
                    click.echo(f'  风险指数: {s["sc_result"]["risk_index"]:.2f}')
                    click.echo(f'  等级: {s["sc_result"]["risk_level"]}')
                break
        else:
            click.echo(f'未找到样本: {sample}')
    else:
        click.echo('煤样分析结果摘要:')
        click.echo('-' * 80)
        click.echo(f'{"样本ID":<10} {"样本名称":<15} {"挥发分(%)":<10} {"交叉点(°C)":<10} {"风险指数":<10} {"等级":<10}')
        click.echo('-' * 80)
        
        for s in results:
            if s['sc_result']:
                click.echo(f'{s["sample_id"]:<10} {s["sample_name"]:<15} '
                          f'{s["proximate"]["volatile"]:<10.2f} '
                          f'{s["sc_result"]["crossing_point_temp"]:<10.1f} '
                          f'{s["sc_result"]["risk_index"]:<10.2f} '
                          f'{s["sc_result"]["risk_level"]:<10}')


@cli.command()
@click.option('--ambient-temp', '-t', default=25.0, type=float, help='环境温度 (°C)')
@click.option('--height', '-h', default=10.0, type=float, help='煤堆高度 (m)')
@click.option('--activation-energy', '-e', default=80.0, type=float, help='煤活化能 (kJ/mol)')
@click.option('--days', '-d', default=15, type=int, help='模拟天数')
@click.option('--output-file', '-o', default=None, help='输出文件路径')
def simulate_pile(ambient_temp, height, activation_energy, days, output_file):
    """煤堆自燃温度场模拟
    
    基于传热-氧气消耗-反应动力学耦合方程，使用有限差分法模拟
    """
    from .pile_simulation import (
        CoalPileSimulator, PileProperties, BoundaryConditions,
        predict_critical_height
    )
    
    click.echo('=' * 60)
    click.echo('煤堆自燃温度场模拟')
    click.echo('=' * 60)
    
    props = PileProperties(activation_energy=activation_energy)
    boundary = BoundaryConditions(ambient_temperature=ambient_temp)
    
    click.echo(f'\n模拟参数:')
    click.echo(f'  环境温度: {ambient_temp}°C')
    click.echo(f'  煤堆高度: {height} m')
    click.echo(f'  活化能: {activation_energy} kJ/mol')
    click.echo(f'  模拟天数: {days} 天')
    
    with click.progressbar(length=1, label='正在模拟') as bar:
        simulator = CoalPileSimulator(height, nx=50, properties=props, boundary=boundary)
        result = simulator.simulate(
            total_time=days * 24 * 3600,
            dt=1800,
            output_interval=86400
        )
        bar.update(1)
    
    max_T = np.max(result.max_temperatures) - 273.15
    max_T_idx = np.argmax(result.max_temperatures)
    max_T_time_days = result.time_points[max_T_idx] / 86400
    
    click.echo(f'\n模拟结果:')
    click.echo(f'  最高温度: {max_T:.1f}°C')
    click.echo(f'  达到最高温度时间: {max_T_time_days:.1f} 天')
    click.echo(f'  是否发生热失控: {"是" if result.is_thermal_runaway else "否"}')
    
    with click.progressbar(length=1, label='计算临界堆高') as bar:
        critical_h = predict_critical_height(ambient_temp, props)
        bar.update(1)
    
    click.echo(f'  临界堆高: {critical_h:.1f} m')
    
    if height > critical_h:
        click.echo(f'\n⚠️  警告: 当前堆高 ({height}m) 超过临界堆高 ({critical_h:.1f}m)，存在自燃风险！')
    else:
        click.echo(f'\n✓ 当前堆高 ({height}m) 低于临界堆高 ({critical_h:.1f}m)，相对安全')
    
    if output_file:
        import json
        output_data = {
            'parameters': {
                'ambient_temp': ambient_temp,
                'height': height,
                'activation_energy': activation_energy,
                'days': days
            },
            'results': {
                'max_temperature': max_T,
                'time_to_max_temp_days': max_T_time_days,
                'is_thermal_runaway': result.is_thermal_runaway,
                'critical_height': critical_h
            }
        }
        with open(output_file, 'w', encoding='utf-8') as f:
            json.dump(output_data, f, ensure_ascii=False, indent=2)
        click.echo(f'\n结果已保存到: {output_file}')


@cli.command()
@click.argument('input_file', type=click.Path(exists=True))
@click.option('--treated-file', '-t', default=None, type=click.Path(exists=True), 
              help='添加阻燃剂后的TG-DSC数据文件')
@click.option('--retardant', '-r', default='Mg(OH)2', 
              type=click.Choice(['Mg(OH)2', 'Al(OH)3', 'ZnB', 'APP']),
              help='阻燃剂类型')
@click.option('--target-ea-increase', '-e', default=20.0, type=float,
              help='目标活化能增量 (kJ/mol)')
@click.option('--method', '-m', default='Kissinger',
              type=click.Choice(['Kissinger', 'Ozawa', 'Coats-Redfern']),
              help='活化能计算方法')
@click.option('--optimize/--no-optimize', default=False,
              help='是否优化复配方案')
def evaluate_retardant(input_file, treated_file, retardant, target_ea_increase, method, optimize):
    """阻燃剂效果评估与添加量推荐
    
    INPUT_FILE: 原煤样的TG-DSC数据文件
    """
    from .data_io import read_excel_data
    from .retardant_evaluation import (
        RetardantEvaluator, optimize_retardant_combination,
        generate_retardant_report
    )
    
    click.echo('=' * 60)
    click.echo('阻燃剂效果评估')
    click.echo('=' * 60)
    
    samples = read_excel_data(input_file)
    if not samples:
        click.echo('未找到煤样数据', err=True)
        sys.exit(1)
    
    sample = samples[0]
    click.echo(f'\n煤样: {sample.sample_name} ({sample.sample_id})')
    
    base_data = sample.tg_dsc_data
    
    evaluator = RetardantEvaluator()
    
    treated_data = None
    if treated_file:
        treated_samples = read_excel_data(treated_file)
        if treated_samples:
            treated_data = treated_samples[0].tg_dsc_data
            click.echo('已加载阻燃处理后的数据')
    
    result = evaluator.evaluate(
        base_data=base_data,
        treated_data=treated_data,
        retardant=retardant,
        target_ea_increase=target_ea_increase,
        method=method
    )
    
    click.echo(generate_retardant_report(result, sample.sample_name))
    
    if optimize:
        click.echo('\n正在优化阻燃剂复配方案...')
        opt_result = optimize_retardant_combination(
            base_data=base_data,
            target_ea_increase=target_ea_increase,
            method=method
        )
        
        click.echo('\n' + '=' * 60)
        click.echo('复配方案优化结果')
        click.echo('=' * 60)
        
        click.echo(f'\n最佳单一阻燃剂:')
        click.echo(f'  {opt_result["best_single"]["retardant"]}: '
                  f'{opt_result["best_single"]["dosage"]:.1f}%')
        
        if opt_result['best_combination']:
            combo = opt_result['best_combination']
            click.echo(f'\n最佳复配方案 (协同因子 {combo["synergistic_factor"]}):')
            click.echo(f'  {combo["retardant_1"]}: {combo["dosage_1"]:.1f}% '
                      f'({combo["ratio_1"]*100:.0f}%)')
            click.echo(f'  {combo["retardant_2"]}: {combo["dosage_2"]:.1f}% '
                      f'({combo["ratio_2"]*100:.0f}%)')
            click.echo(f'  总添加量: {combo["total_dosage"]:.1f}%')
            click.echo(f'  相比单一方案节省: '
                      f'{(1 - combo["total_dosage"]/opt_result["best_single"]["dosage"])*100:.1f}%')
        
        click.echo('\n各阻燃剂效果对比:')
        click.echo(f'{"阻燃剂":<12} {"推荐添加量":<12} {"效果评分":<10}')
        click.echo('-' * 40)
        for name, res in opt_result['all_results'].items():
            click.echo(f'{name:<12} {res.recommended_dosage:<12.1f} '
                      f'{res.effectiveness_score:<10.1f}')


def main():
    cli()


if __name__ == '__main__':
    main()
