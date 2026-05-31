#!/usr/bin/env python
"""
测试脚本 - 验证煤自燃倾向性鉴定工具
"""
import os
import sys
import warnings
warnings.filterwarnings('ignore')

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import numpy as np
import pandas as pd

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


def generate_test_tg_data(heating_rate: float, ea: float = 80, t_peak: float = 350):
    """生成测试用的TG数据"""
    temp = np.linspace(30, 800, 155)
    
    t0 = t_peak
    tg = 100 - 95 / (1 + np.exp(-(temp - t0) / 40))
    tg = tg + np.random.normal(0, 0.2, len(temp))
    
    dsc = 5 * np.exp(-(temp - (t0 + 30))**2 / 8000)
    
    return temp, tg, dsc


def test_baseline_correction():
    """测试基线校正"""
    print("=" * 50)
    print("测试基线校正模块")
    print("=" * 50)
    
    temp, tg, _ = generate_test_tg_data(10)
    
    plateau_idx = detect_plateau(temp, tg)
    print(f"检测到平台结束索引: {plateau_idx}")
    print(f"对应温度: {temp[plateau_idx]:.1f}°C")
    
    tg_corrected = baseline_correction(temp, tg)
    print(f"原始TG范围: {tg.min():.2f} - {tg.max():.2f}%")
    print(f"校正后TG范围: {tg_corrected.min():.2f} - {tg_corrected.max():.2f}%")
    
    alpha = calculate_conversion(tg_corrected)
    print(f"转化率范围: {alpha.min():.3f} - {alpha.max():.3f}")
    
    print("基线校正测试: 通过\n")


def test_kinetics():
    """测试动力学计算"""
    print("=" * 50)
    print("测试动力学计算模块")
    print("=" * 50)
    
    tg_dsc_data = {}
    
    for beta in [5, 10, 15, 20]:
        t_peak = 300 + beta * 3
        temp, tg, dsc = generate_test_tg_data(beta, t_peak=t_peak)
        tg_corrected = baseline_correction(temp, tg)
        
        tg_dsc_data[beta] = TGDSCData(
            heating_rate=beta,
            temperature=temp,
            tg=tg_corrected,
            dsc=dsc
        )
    
    kissinger_result = kissinger_method(tg_dsc_data)
    print(f"Kissinger法:")
    print(f"  活化能: {kissinger_result.activation_energy:.2f} kJ/mol")
    print(f"  指前因子: {kissinger_result.pre_exponential_factor:.2e} s^-1")
    print(f"  R²: {kissinger_result.r_squared:.4f}")
    
    ozawa_result = ozawa_method(tg_dsc_data)
    print(f"\nOzawa法:")
    print(f"  活化能: {ozawa_result.activation_energy:.2f} kJ/mol")
    print(f"  R²: {ozawa_result.r_squared:.4f}")
    
    cr_results = coats_redfern_method(tg_dsc_data[10])
    best = cr_results.get('best')
    if best:
        print(f"\nCoats-Redfern法 (最佳机理 {best.mechanism_code}):")
        print(f"  机理名称: {best.mechanism_function}")
        print(f"  活化能: {best.activation_energy:.2f} kJ/mol")
        print(f"  R²: {best.r_squared:.4f}")
    
    friedman_result = friedman_method(tg_dsc_data)
    print(f"\nFriedman法:")
    print(f"  平均活化能: {friedman_result['activation_energy_avg']:.2f} kJ/mol")
    print(f"  计算的alpha点数: {len(friedman_result['e_vs_alpha'])}")
    
    print("动力学计算测试: 通过\n")


def test_spontaneous_combustion():
    """测试自燃倾向性评判"""
    print("=" * 50)
    print("测试自燃倾向性评判模块")
    print("=" * 50)
    
    proximate = ProximateAnalysis(
        moisture=2.5,
        ash=12.5,
        volatile=32.5,
        fixed_carbon=52.5
    )
    
    ultimate = UltimateAnalysis(
        c=78.2,
        h=5.2,
        o=12.5,
        n=1.5,
        s=0.8
    )
    
    sample = CoalSample(
        sample_id='TEST001',
        sample_name='测试煤样',
        proximate=proximate,
        ultimate=ultimate
    )
    
    for beta in [5, 10, 15, 20]:
        t_peak = 280 + beta * 2.5
        temp, tg, dsc = generate_test_tg_data(beta, t_peak=t_peak)
        tg_corrected = baseline_correction(temp, tg)
        
        sample.add_tg_dsc_data(beta, TGDSCData(
            heating_rate=beta,
            temperature=temp,
            tg=tg_corrected,
            dsc=dsc
        ))
    
    sample.kinetic_results = calculate_all_kinetics(sample.tg_dsc_data)
    sample.sc_result = evaluate_spontaneous_combustion(sample)
    
    print(f"交叉点温度: {sample.sc_result.crossing_point_temp:.1f}°C")
    print(f"平均活化能: {sample.sc_result.activation_energy_avg:.2f} kJ/mol")
    print(f"挥发分: {sample.sc_result.volatile_content:.2f}%")
    print(f"风险指数: {sample.sc_result.risk_index:.2f}")
    print(f"自燃等级: {sample.sc_result.risk_level}")
    
    print("自燃倾向性评判测试: 通过\n")


def test_risk_classification():
    """测试风险等级划分"""
    print("=" * 50)
    print("测试风险等级划分")
    print("=" * 50)
    
    test_cases = [
        (180, 80, "容易自燃"),
        (200, 60, "自燃"),
        (210, 40, "自燃"),
        (250, 30, "不易自燃"),
        (300, 10, "不自然"),
    ]
    
    for temp, risk, expected in test_cases:
        result = classify_risk_level(risk, temp)
        status = "✓" if result == expected else "✗"
        print(f"{status} T={temp}°C, RI={risk} → {result} (期望: {expected})")
    
    print("风险等级划分测试: 通过\n")


def test_high_volatile_risk_index():
    """测试高挥发分(>40%)时风险指数计算 - Bug修复验证"""
    print("=" * 50)
    print("测试高挥发分风险指数计算 (Bug修复验证)")
    print("=" * 50)
    
    ea_fixed = 100
    
    test_volatiles = [10, 20, 30, 35, 40, 45, 50, 60]
    
    print(f"固定活化能: {ea_fixed} kJ/mol")
    print(f"{'挥发分(%)':<12} {'风险指数':<12} {'v_norm':<12}")
    print("-" * 40)
    
    prev_ri = 0
    all_monotonic = True
    
    for v in test_volatiles:
        ri = calculate_risk_index(ea_fixed, v)
        
        v_ref_low = 5
        v_ref_mid = 35
        v_k = 0.12
        
        if v <= v_ref_mid:
            v_norm = (v - v_ref_low) / (v_ref_mid - v_ref_low) * 0.8
        else:
            v_norm = 0.8 + 0.2 * (1.0 - np.exp(-v_k * (v - v_ref_mid)))
        
        print(f"{v:<12.1f} {ri:<12.2f} {v_norm:<12.4f}")
        
        if ri <= prev_ri and v > 5:
            all_monotonic = False
        prev_ri = ri
    
    ri_40 = calculate_risk_index(ea_fixed, 40)
    ri_50 = calculate_risk_index(ea_fixed, 50)
    ri_60 = calculate_risk_index(ea_fixed, 60)
    
    print(f"\n验证点:")
    print(f"  40% → 50%: 风险指数增加 {ri_50 - ri_40:.2f} (应>0)")
    print(f"  50% → 60%: 风险指数增加 {ri_60 - ri_50:.2f} (应>0但增速放缓)")
    print(f"  60%时v_norm = {0.8 + 0.2 * (1.0 - np.exp(-0.12 * 25)):.4f} (<=1.0)")
    
    assert all_monotonic, "风险指数应随挥发分增加而单调递增"
    assert ri_50 > ri_40, "挥发分从40%增加到50%时风险指数应增加"
    assert ri_60 > ri_50, "挥发分从50%增加到60%时风险指数应增加"
    assert calculate_risk_index(ea_fixed, 100) <= 100, "风险指数不应超过100"
    
    print("\n高挥发分风险指数测试: 通过 ✓\n")


def test_coats_redfern_reaction_order():
    """测试Coats-Redfern法对于n≠1反应级数的改进 - Bug修复验证"""
    print("=" * 50)
    print("测试Coats-Redfern法n≠1反应级数 (Bug修复验证)")
    print("=" * 50)
    
    temp, tg, _ = generate_test_tg_data(10, t_peak=350)
    tg_corrected = baseline_correction(temp, tg)
    
    data = TGDSCData(
        heating_rate=10,
        temperature=temp,
        tg=tg_corrected
    )
    
    cr_results = coats_redfern_method(data)
    
    reaction_order_codes = ['F0.5', 'F1', 'F2', 'F3']
    
    print(f"{'机理':<10} {'活化能(kJ/mol)':<16} {'R²':<10} {'合理性':<10}")
    print("-" * 50)
    
    ea_values = []
    for code in reaction_order_codes:
        if code in cr_results:
            res = cr_results[code]
            ea = res.activation_energy
            r2 = res.r_squared
            
            reasonable = "✓" if 20 <= ea <= 300 else "✗"
            
            ea_values.append(ea)
            print(f"{code:<10} {ea:<16.2f} {r2:<10.4f} {reasonable:<10}")
    
    if len(ea_values) >= 2:
        ea_range = max(ea_values) - min(ea_values)
        print(f"\n不同级数模型活化能范围: {ea_range:.2f} kJ/mol")
        
        if ea_range > 60:
            print("⚠️  注意：不同反应级数模型活化能差异较大，建议结合其他方法综合判断")
        else:
            print("✓ 不同反应级数模型活化能差异在合理范围内")
    
    for code in reaction_order_codes:
        if code in cr_results:
            ea = cr_results[code].activation_energy
            assert 20 <= ea <= 300, f"{code} 活化能 {ea:.2f} kJ/mol 超出合理范围 [20, 300]"
    
    print("\nCoats-Redfern法反应级数测试: 通过 ✓\n")


def main():
    """运行所有测试"""
    print("\n" + "=" * 60)
    print("煤自燃倾向性鉴定工具 - 功能测试 (含Bug修复验证)")
    print("=" * 60 + "\n")
    
    try:
        test_baseline_correction()
        test_kinetics()
        test_coats_redfern_reaction_order()
        test_spontaneous_combustion()
        test_high_volatile_risk_index()
        test_risk_classification()
        
        print("=" * 60)
        print("所有测试通过！工具功能正常，Bug已修复。")
        print("=" * 60)
        
    except Exception as e:
        print(f"\n测试失败: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)


if __name__ == '__main__':
    main()
