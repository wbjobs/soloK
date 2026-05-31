"""
增强版空化监测系统演示脚本
功能：
1. 空化消除策略计算与经济性评估
2. 空化侵蚀预测与材料对比分析
"""
import sys
import numpy as np
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))

from config import DEFAULT_CONFIG
from cavitation_mitigation import CavitationMitigationCalculator, VesselCharacteristics
from cavitation_erosion import ErosionPredictor, ComparativeAnalysis, MATERIAL_DATABASE

def print_separator(char="=", length=70):
    print(char * length)

def print_title(title):
    print()
    print_separator("=")
    print(f"  {title}")
    print_separator("=")
    print()

def demo_mitigation_strategy():
    print_title("空化消除策略与经济性评估演示")
    
    mitigation = CavitationMitigationCalculator()
    
    test_scenarios = [
        {
            'name': '严重空化工况 (高速满载)',
            'speed': 18.0,
            'depth': 5.5,
            'rpm': 120,
            'severity': 'SEVERE',
            'noise_level': 175
        },
        {
            'name': '中度空化工况 (中速)',
            'speed': 15.0,
            'depth': 6.0,
            'rpm': 100,
            'severity': 'MODERATE',
            'noise_level': 165
        },
        {
            'name': '轻度空化工况',
            'speed': 12.0,
            'depth': 6.5,
            'rpm': 80,
            'severity': 'MILD',
            'noise_level': 155
        },
        {
            'name': '正常工况 (无空化)',
            'speed': 10.0,
            'depth': 7.0,
            'rpm': 70,
            'severity': 'NONE',
            'noise_level': 140
        }
    ]
    
    for scenario in test_scenarios:
        print(f"\n场景: {scenario['name']}")
        print_separator("-")
        
        report = mitigation.generate_comprehensive_report(
            current_speed=scenario['speed'],
            current_depth=scenario['depth'],
            current_rpm=scenario['rpm'],
            severity_level=scenario['severity'],
            noise_level=scenario['noise_level']
        )
        
        cc = report['current_conditions']
        print(f"  当前航速: {cc['ship_speed']:.1f} kn")
        print(f"  当前浸深: {cc['draft']:.1f} m")
        print(f"  螺旋桨转速: {cc['rpm']} RPM")
        print(f"  空化数 σ: {cc['sigma']:.4f}")
        print(f"  临界空化数 σ_c: {cc['sigma_c']:.4f}")
        print(f"  σ/σ_c 比值: {cc['sigma_ratio']:.2f}")
        print(f"  空化等级: {cc['severity_level']}")
        print(f"  噪声级: {cc['noise_level']} dB")
        print()
        
        print("  经济性分析:")
        ea = report['economic_analysis']
        print(f"    基线年度损伤成本: ${ea['baseline_annual_damage_cost']:,.2f}")
        print(f"    推荐策略: {ea['recommended_strategy']}")
        print()
        
        strategies = report['mitigation_strategies']
        for name, strategy in strategies.items():
            if strategy.adjustment_amount > 0 or '无空化' in strategy.description:
                print(f"  方案 - {name}:")
                print(f"    {strategy.description}")
                print(f"    达到σ值: {strategy.sigma_achieved:.4f}")
                print(f"    燃油消耗变化: {strategy.fuel_consumption_increase:+.1f} kg/天")
                print(f"    日成本变化: ${strategy.cost_increase_per_day:+,.2f}")
                print(f"    年成本变化: ${strategy.annual_cost_increase:+,.2f}")
                print(f"    年度损伤减少: ${strategy.damage_reduction:,.2f}")
                print(f"    净收益: ${strategy.net_benefit:+,.2f}")
                print(f"    推荐: {'✓ 是' if strategy.is_recommended else '✗ 否'}")
                print()
        
        print("  建议:")
        for rec in report['recommendations']:
            print(f"    {rec}")

def demo_erosion_prediction():
    print_title("空化侵蚀预测演示")
    
    freqs = np.linspace(0, 100000, 1000)
    noise_spectrum = np.ones((len(freqs), 1)) * 1e-6
    
    test_cases = [
        {
            'name': '轻微空化 (σ/σ_c = 0.9)',
            'cavitation_intensity': 0.1,
            'sigma_ratio': 0.9
        },
        {
            'name': '中度空化 (σ/σ_c = 0.7)',
            'cavitation_intensity': 0.3,
            'sigma_ratio': 0.7
        },
        {
            'name': '严重空化 (σ/σ_c = 0.5)',
            'cavitation_intensity': 0.5,
            'sigma_ratio': 0.5
        },
        {
            'name': '极严重空化 (σ/σ_c = 0.3)',
            'cavitation_intensity': 0.8,
            'sigma_ratio': 0.3
        }
    ]
    
    for case in test_cases:
        print(f"\n工况: {case['name']}")
        print_separator("-")
        
        predictor = ErosionPredictor()
        prediction = predictor.predict_erosion_rate(
            noise_spectrum=noise_spectrum,
            freqs=freqs,
            cavitation_intensity=case['cavitation_intensity'],
            sigma_ratio=case['sigma_ratio']
        )
        
        for line in predictor.generate_erosion_report(prediction):
            print(f"  {line}")
        
        spectrum = prediction['impact_energy_spectrum']
        print()
        print("  冲击能量谱特性:")
        print(f"    总冲击能量: {spectrum['total_impact_energy']:.2e} J")
        print(f"    峰值冲击压力: {np.max(spectrum['impact_pressures'])/1e6:.1f} MPa")
        print(f"    平均气泡半径: {np.mean(spectrum['bubble_radii'])*1e6:.1f} μm")

def demo_material_comparison():
    print_title("螺旋桨材料耐蚀性对比分析")
    
    freqs = np.linspace(0, 100000, 1000)
    noise_spectrum = np.ones((len(freqs), 1)) * 1e-6
    
    analysis = ComparativeAnalysis()
    
    test_conditions = [
        ('中度空化', 0.3, 0.7),
        ('严重空化', 0.6, 0.4)
    ]
    
    for condition_name, intensity, sigma_ratio in test_conditions:
        print(f"\n{condition_name}条件下材料对比:")
        print_separator("-")
        
        results = analysis.compare_materials(
            noise_spectrum=noise_spectrum,
            freqs=freqs,
            cavitation_intensity=intensity,
            sigma_ratio=sigma_ratio
        )
        
        print(f"  {'材料':<25} {'侵蚀率(mm/年)':<15} {'材料损失(kg/年)':<15} {'寿命(年)':<10} {'性能比':<10}")
        print(f"  {'-'*25} {'-'*15} {'-'*15} {'-'*10} {'-'*10}")
        
        for mat_name, mat_data in MATERIAL_DATABASE.items():
            result = results[mat_name]
            print(f"  {mat_data.name:<25} {result['erosion_rate_mm_year']:<15.4f} "
                  f"{result['material_loss_kg_year']:<15.2f} {result['remaining_life_years']:<10.1f} "
                  f"{result['improvement_ratio']:<10.2f}x")
        
        recommended = analysis.recommend_material(results)
        print(f"\n  推荐材料: {MATERIAL_DATABASE[recommended].name}")

def demo_integrated_workflow():
    print_title("综合决策分析演示")
    
    config = DEFAULT_CONFIG
    mitigation = CavitationMitigationCalculator(config)
    erosion = ErosionPredictor(config)
    
    analysis_cases = [
        {
            'name': '船舶A - 高速巡航 (严重空化风险)',
            'speed': 18.0,
            'depth': 5.5,
            'rpm': 120,
            'intensity': 0.7,
            'sigma_ratio': 0.55
        },
        {
            'name': '船舶B - 经济航速 (中度空化)',
            'speed': 14.0,
            'depth': 6.5,
            'rpm': 95,
            'intensity': 0.3,
            'sigma_ratio': 0.85
        },
        {
            'name': '船舶C - 低速航行 (轻微空化)',
            'speed': 10.0,
            'depth': 7.0,
            'rpm': 70,
            'intensity': 0.1,
            'sigma_ratio': 1.1
        }
    ]
    
    for case in analysis_cases:
        print(f"\n{'='*70}")
        print(f"案例: {case['name']}")
        print(f"{'='*70}")
        
        print(f"\n工况参数:")
        print(f"  航速: {case['speed']} kn")
        print(f"  浸深: {case['depth']} m")
        print(f"  转速: {case['rpm']} RPM")
        print(f"  σ/σ_c: {case['sigma_ratio']:.2f}")
        
        report = mitigation.generate_comprehensive_report(
            current_speed=case['speed'],
            current_depth=case['depth'],
            current_rpm=case['rpm'],
            severity_level='SEVERE' if case['sigma_ratio'] < 0.7 else 'MODERATE' if case['sigma_ratio'] < 1.0 else 'MILD',
            noise_level=170 if case['sigma_ratio'] < 0.7 else 160 if case['sigma_ratio'] < 1.0 else 150
        )
        
        print(f"\n空化消除策略:")
        strategies = report['mitigation_strategies']
        for name, strategy in strategies.items():
            if strategy.adjustment_amount > 0:
                print(f"  {name}: {strategy.description}")
                print(f"    年成本变化: ${strategy.annual_cost_increase:+,.0f}")
                print(f"    年损伤减少: ${strategy.damage_reduction:,.0f}")
                print(f"    年净收益: ${strategy.net_benefit:+,.0f}")
        
        freqs = np.linspace(0, 100000, 1000)
        noise_spectrum = np.ones((len(freqs), 1)) * 1e-6
        
        erosion_pred = erosion.predict_erosion_rate(
            noise_spectrum=noise_spectrum,
            freqs=freqs,
            cavitation_intensity=case['intensity'],
            sigma_ratio=case['sigma_ratio']
        )
        
        print(f"\n侵蚀预测:")
        print(f"  年侵蚀深度: {erosion_pred['annual_erosion_depth_mm']:.6f} mm/year")
        print(f"  年材料损失: {erosion_pred['annual_material_loss_kg']:.4f} kg")
        print(f"  预估剩余寿命: {erosion_pred['remaining_life_years']:.1f} 年")
        print(f"  气泡溃灭频率: {erosion_pred['bubble_collapse_frequency']:.0f} Hz")
        
        print(f"\n建议:")
        for rec in report['recommendations']:
            print(f"  {rec}")

def main():
    print_separator("=")
    print("  船舶螺旋桨空化监测诊断系统 - 增强功能演示")
    print("  =========================================")
    print("  新增功能:")
    print("  1. 空化消除策略计算 (航速降幅/浸深调整)")
    print("  2. 经济性评估 (燃油消耗 vs 空化损伤)")
    print("  3. 空化侵蚀预测 (气泡溃灭能量谱)")
    print("  4. 材料疲劳分析与S-N曲线")
    print("  5. 螺旋桨年腐蚀深度预测")
    print("  6. 材料耐蚀性对比分析")
    print_separator("=")
    
    try:
        demo_mitigation_strategy()
        demo_erosion_prediction()
        demo_material_comparison()
        demo_integrated_workflow()
        
        print("\n" + "="*70)
        print("  演示完成!")
        print("="*70)
        
    except Exception as e:
        print(f"\n错误: {e}")
        import traceback
        traceback.print_exc()

if __name__ == '__main__':
    main()
