#!/usr/bin/env python
"""
综合测试脚本 - 测试所有功能模块
"""
import os
import sys
import warnings
warnings.filterwarnings('ignore')

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import numpy as np

from coal_spontaneous_combustion.data_models import (
    CoalSample, ProximateAnalysis, UltimateAnalysis, TGDSCData
)
from coal_spontaneous_combustion.baseline_correction import (
    detect_plateau, baseline_correction, calculate_conversion
)
from coal_spontaneous_combustion.kinetics import (
    kissinger_method, ozawa_method, coats_redfern_method,
    friedman_method, calculate_all_kinetics
)
from coal_spontaneous_combustion.spontaneous_combustion import (
    calculate_crossing_point_temperature, calculate_risk_index,
    classify_risk_level, evaluate_spontaneous_combustion
)
from coal_spontaneous_combustion.pile_simulation import (
    CoalPileSimulator, PileProperties, BoundaryConditions,
    predict_critical_height, SimulationConfig, batch_simulate_piles
)
from coal_spontaneous_combustion.retardant_evaluation import (
    RetardantEvaluator, optimize_retardant_combination, generate_retardant_report
)


def generate_test_tg_data(heating_rate: float, ea: float = 80, t_peak: float = 350):
    """生成测试用的TG数据 - 确保不同升温速率下峰值温度有足够差异"""
    temp = np.linspace(30, 800, 155)
    
    peak_shift = 8 * np.log(heating_rate / 10)
    t0 = t_peak + peak_shift
    
    tg = 100 - 95 / (1 + np.exp(-(temp - t0) / 40))
    tg = tg + np.random.normal(0, 0.15, len(temp))
    dsc = 5 * np.exp(-(temp - (t0 + 30))**2 / 8000)
    return temp, tg, dsc


def create_test_sample(sample_id: str = 'TEST001', ea: float = 80, t_peak: float = 350):
    """创建测试煤样"""
    proximate = ProximateAnalysis(
        moisture=2.5, ash=12.5, volatile=32.5, fixed_carbon=52.5
    )
    
    ultimate = UltimateAnalysis(
        c=78.2, h=5.2, o=12.5, n=1.5, s=0.8
    )
    
    sample = CoalSample(
        sample_id=sample_id,
        sample_name=f'测试煤样_{sample_id}',
        proximate=proximate,
        ultimate=ultimate
    )
    
    for beta in [5, 10, 15, 20]:
        temp, tg, dsc = generate_test_tg_data(beta, ea=ea, t_peak=t_peak)
        tg_corrected = baseline_correction(temp, tg)
        sample.add_tg_dsc_data(beta, TGDSCData(
            heating_rate=beta,
            temperature=temp,
            tg=tg_corrected,
            dsc=dsc
        ))
    
    return sample


def test_basic_kinetics():
    """测试基础动力学计算"""
    print("\n" + "=" * 60)
    print("测试1: 基础动力学计算")
    print("=" * 60)
    
    sample = create_test_sample('KINETIC001')
    results = calculate_all_kinetics(sample.tg_dsc_data)
    
    print(f"\n动力学计算结果:")
    for method, res in results.items():
        print(f"  {method:15}: Ea={res.activation_energy:6.2f} kJ/mol, R²={res.r_squared:.4f}")
    
    assert 'Kissinger' in results
    assert 'Ozawa' in results
    assert 'Coats-Redfern' in results
    assert 'Friedman' in results
    
    assert 20 <= results['Coats-Redfern'].activation_energy <= 200
    assert results['Coats-Redfern'].r_squared > 0.9
    
    print("\n✓ 基础动力学计算测试通过")


def test_coats_redfern_reaction_orders():
    """测试不同反应级数的Coats-Redfern法"""
    print("\n" + "=" * 60)
    print("测试2: Coats-Redfern法不同反应级数 (Bug修复验证)")
    print("=" * 60)
    
    temp, tg, _ = generate_test_tg_data(10, t_peak=350)
    tg_corrected = baseline_correction(temp, tg)
    
    data = TGDSCData(
        heating_rate=10,
        temperature=temp,
        tg=tg_corrected
    )
    
    cr_results = coats_redfern_method(data)
    
    print(f"\n不同反应级数模型结果:")
    print(f"{'机理':<10} {'活化能(kJ/mol)':<16} {'R²':<10}")
    print("-" * 40)
    
    for code in ['F0.5', 'F1', 'F2', 'F3']:
        if code in cr_results:
            res = cr_results[code]
            print(f"{code:<10} {res.activation_energy:<16.2f} {res.r_squared:<10.4f}")
            assert 20 <= res.activation_energy <= 300, f"{code} 活化能异常"
    
    print("\n✓ Coats-Redfern法反应级数测试通过")


def test_risk_index_high_volatile():
    """测试高挥发分风险指数 (Bug修复验证)"""
    print("\n" + "=" * 60)
    print("测试3: 高挥发分风险指数 (Bug修复验证)")
    print("=" * 60)
    
    ea_fixed = 100
    
    print(f"\n固定活化能 {ea_fixed} kJ/mol，不同挥发分的风险指数:")
    print(f"{'挥发分(%)':<12} {'风险指数':<12} {'v_norm':<12}")
    print("-" * 40)
    
    prev_ri = 0
    for v in [10, 20, 30, 35, 40, 45, 50, 60]:
        ri = calculate_risk_index(ea_fixed, v)
        
        v_ref_low = 5
        v_ref_mid = 35
        v_k = 0.12
        
        if v <= v_ref_mid:
            v_norm = (v - v_ref_low) / (v_ref_mid - v_ref_low) * 0.8
        else:
            v_norm = 0.8 + 0.2 * (1.0 - np.exp(-v_k * (v - v_ref_mid)))
        
        print(f"{v:<12.1f} {ri:<12.2f} {v_norm:<12.4f}")
        
        if v > 5:
            assert ri > prev_ri, "风险指数应单调递增"
        prev_ri = ri
    
    ri_100 = calculate_risk_index(ea_fixed, 100)
    assert ri_100 <= 100, "风险指数不应超过100"
    
    print(f"\n  挥发分100%时风险指数: {ri_100:.2f} (≤100 ✓)")
    print("\n✓ 高挥发分风险指数测试通过")


def test_pile_simulation():
    """测试煤堆自燃温度场模拟"""
    print("\n" + "=" * 60)
    print("测试4: 煤堆自燃温度场模拟")
    print("=" * 60)
    
    ambient_temp = 25.0
    height = 8.0
    ea = 75.0
    
    print(f"\n模拟参数:")
    print(f"  环境温度: {ambient_temp}°C")
    print(f"  煤堆高度: {height} m")
    print(f"  活化能: {ea} kJ/mol")
    
    props = PileProperties(activation_energy=ea)
    boundary = BoundaryConditions(ambient_temperature=ambient_temp)
    
    simulator = CoalPileSimulator(height, nx=40, properties=props, boundary=boundary)
    
    result = simulator.simulate(
        total_time=7 * 24 * 3600,
        dt=1800,
        output_interval=86400
    )
    
    max_T = np.max(result.max_temperatures) - 273.15
    
    print(f"\n模拟结果:")
    print(f"  最高温度: {max_T:.1f}°C")
    print(f"  模拟天数: {result.time_points[-1]/86400:.1f} 天")
    print(f"  温度剖面点数: {len(result.time_points)}")
    
    assert len(result.time_points) > 0
    assert max_T > ambient_temp
    
    print("\n✓ 煤堆自燃温度场模拟测试通过")


def test_critical_height_prediction():
    """测试临界堆高预测"""
    print("\n" + "=" * 60)
    print("测试5: 临界堆高预测")
    print("=" * 60)
    
    ambient_temp = 25.0
    ea = 75.0
    
    print(f"\n环境温度: {ambient_temp}°C, 活化能: {ea} kJ/mol")
    
    props = PileProperties(activation_energy=ea)
    critical_h = predict_critical_height(ambient_temp, props)
    
    print(f"  预测临界堆高: {critical_h:.1f} m")
    
    assert 1.0 <= critical_h <= 20.0
    
    print("\n测试不同环境温度下的临界堆高:")
    for temp in [15, 25, 35, 45]:
        ch = predict_critical_height(temp, props)
        print(f"  {temp:>3}°C: {ch:.1f} m")
    
    print("\n✓ 临界堆高预测测试通过")


def test_retardant_evaluation():
    """测试阻燃剂效果评估"""
    print("\n" + "=" * 60)
    print("测试6: 阻燃剂效果评估")
    print("=" * 60)
    
    sample = create_test_sample('RETARD001', ea=75)
    
    evaluator = RetardantEvaluator()
    
    print(f"\n煤样: {sample.sample_name}")
    
    results = evaluator.compare_retardants(
        base_data=sample.tg_dsc_data,
        target_ea_increase=20.0,
        method='Kissinger'
    )
    
    print(f"\n各阻燃剂效果对比:")
    print(f"{'阻燃剂':<12} {'原煤Ea':<10} {'处理后Ea':<12} {'增量':<10} {'推荐添加量':<12} {'评分':<8}")
    print("-" * 70)
    
    for name, res in results.items():
        print(f"{name:<12} {res.base_activation_energy:<10.2f} "
              f"{res.treated_activation_energy:<12.2f} "
              f"{res.activation_energy_increase:<10.2f} "
              f"{res.recommended_dosage:<12.1f} "
              f"{res.effectiveness_score:<8.1f}")
    
    for name, res in results.items():
        assert res.recommended_dosage > 0
        assert res.activation_energy_increase > 0
    
    print("\n✓ 阻燃剂效果评估测试通过")


def test_retardant_combination_optimization():
    """测试阻燃剂复配优化"""
    print("\n" + "=" * 60)
    print("测试7: 阻燃剂复配方案优化")
    print("=" * 60)
    
    sample = create_test_sample('COMBO001', ea=70)
    
    print(f"\n煤样: {sample.sample_name}")
    print(f"目标活化能增量: 25 kJ/mol")
    
    opt_result = optimize_retardant_combination(
        base_data=sample.tg_dsc_data,
        target_ea_increase=25.0,
        method='Kissinger'
    )
    
    print(f"\n最佳单一阻燃剂:")
    print(f"  {opt_result['best_single']['retardant']}: "
          f"{opt_result['best_single']['dosage']:.1f}%")
    
    if opt_result['best_combination']:
        combo = opt_result['best_combination']
        print(f"\n最佳复配方案:")
        print(f"  {combo['retardant_1']}: {combo['dosage_1']:.1f}% "
              f"({combo['ratio_1']*100:.0f}%)")
        print(f"  {combo['retardant_2']}: {combo['dosage_2']:.1f}% "
              f"({combo['ratio_2']*100:.0f}%)")
        print(f"  总添加量: {combo['total_dosage']:.1f}%")
        
        savings = (1 - combo['total_dosage']/opt_result['best_single']['dosage']) * 100
        print(f"  相比单一方案节省: {savings:.1f}%")
    
    print("\n✓ 阻燃剂复配优化测试通过")


def test_report_generation():
    """测试报告生成"""
    print("\n" + "=" * 60)
    print("测试8: 阻燃剂评估报告生成")
    print("=" * 60)
    
    sample = create_test_sample('REPORT001', ea=75)
    evaluator = RetardantEvaluator()
    
    result = evaluator.evaluate(
        base_data=sample.tg_dsc_data,
        retardant='Mg(OH)2',
        target_ea_increase=20.0
    )
    
    report = generate_retardant_report(result, sample.sample_name)
    
    print("\n报告预览 (前10行):")
    for i, line in enumerate(report.split('\n')[:10]):
        print(f"  {line}")
    
    assert '阻燃剂效果评估报告' in report
    assert '活化能分析' in report
    assert '阻燃剂推荐' in report
    
    print("\n✓ 报告生成测试通过")


def main():
    """运行所有测试"""
    print("\n" + "=" * 70)
    print("煤自燃倾向性鉴定工具 - 综合功能测试 (含新增模块)")
    print("=" * 70)
    
    tests = [
        test_basic_kinetics,
        test_coats_redfern_reaction_orders,
        test_risk_index_high_volatile,
        test_pile_simulation,
        test_critical_height_prediction,
        test_retardant_evaluation,
        test_retardant_combination_optimization,
        test_report_generation,
    ]
    
    passed = 0
    failed = 0
    
    for test in tests:
        try:
            test()
            passed += 1
        except Exception as e:
            print(f"\n✗ {test.__name__} 失败: {e}")
            import traceback
            traceback.print_exc()
            failed += 1
    
    print("\n" + "=" * 70)
    print(f"测试结果: {passed} 通过, {failed} 失败")
    print("=" * 70)
    
    if failed > 0:
        sys.exit(1)
    else:
        print("\n🎉 所有测试通过！工具功能正常。")


if __name__ == '__main__':
    main()
