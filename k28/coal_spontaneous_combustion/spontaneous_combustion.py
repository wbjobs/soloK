"""
自燃倾向性综合评判模块
- 交叉点温度（着火点）计算
- 自燃风险指数计算
- 等级划分（参考GB/T 20104-2006）
"""
import numpy as np
from typing import Dict, List, Optional

from .data_models import CoalSample, SpontaneousCombustionResult, TGDSCData
from .baseline_correction import baseline_correction


def calculate_crossing_point_temperature(data: TGDSCData) -> float:
    """
    计算交叉点温度（着火点温度）
    
    方法：找到DTG曲线峰值前，TG曲线下降速率最快的点，
    或使用切线法找到外推起始点
    """
    temp = data.temperature
    tg = data.tg
    dtg = data.dtg
    
    peak_idx = np.argmin(dtg)
    
    if peak_idx < 10:
        peak_idx = min(10, len(dtg) - 1)
    
    search_range = slice(max(0, peak_idx - 50), peak_idx)
    dtg_search = dtg[search_range]
    
    if len(dtg_search) > 5:
        max_rate_idx = np.argmin(dtg_search) + search_range.start
    else:
        max_rate_idx = peak_idx
    
    tg_deriv = np.abs(dtg)
    threshold = 0.1 * np.max(tg_deriv[:peak_idx])
    
    onset_idx = 0
    for i in range(peak_idx):
        if tg_deriv[i] > threshold:
            onset_idx = max(0, i - 5)
            break
    
    crossing_temp = (temp[onset_idx] + temp[max_rate_idx] + temp[peak_idx]) / 3
    
    return crossing_temp


def calculate_risk_index(activation_energy: float, volatile_content: float) -> float:
    """
    计算自燃风险指数
    
    改进的公式：
    - 活化能：使用非线性映射，低活化能区域变化更敏感
    - 挥发分：使用S型函数平滑处理，>40%时仍有区分度但不会越界
    
    活化能越低，挥发分越高，风险指数越高
    """
    Ea_ref_low = 40
    Ea_ref_high = 160
    Ea_mid = (Ea_ref_low + Ea_ref_high) / 2
    
    ea_norm = 1.0 / (1.0 + np.exp(0.06 * (activation_energy - Ea_mid)))
    ea_norm = np.clip(ea_norm, 0, 1)
    
    V_ref_low = 5
    V_ref_mid = 35
    V_k = 0.12
    
    if volatile_content <= V_ref_mid:
        v_norm = (volatile_content - V_ref_low) / (V_ref_mid - V_ref_low) * 0.8
    else:
        v_norm = 0.8 + 0.2 * (1.0 - np.exp(-V_k * (volatile_content - V_ref_mid)))
    
    v_norm = np.clip(v_norm, 0, 1)
    
    w1 = 0.55
    w2 = 0.45
    
    risk_index = 100 * (w1 * ea_norm + w2 * v_norm)
    
    return risk_index


def classify_risk_level(risk_index: float, crossing_point_temp: float) -> str:
    """
    根据GB/T 20104-2006进行自燃倾向性等级划分
    
    等级：
    - 容易自燃 (I类)
    - 自燃 (II类)
    - 不易自燃 (III类)
    - 不自然 (IV类)
    """
    if crossing_point_temp < 190 or risk_index >= 75:
        return "容易自燃"
    elif crossing_point_temp < 230 or risk_index >= 50:
        return "自燃"
    elif crossing_point_temp < 280 or risk_index >= 25:
        return "不易自燃"
    else:
        return "不自然"


def evaluate_spontaneous_combustion(sample: CoalSample, 
                                    primary_heating_rate: float = 10.0) -> SpontaneousCombustionResult:
    """
    综合评价煤样的自燃倾向性
    """
    if primary_heating_rate not in sample.tg_dsc_data:
        primary_heating_rate = sorted(sample.tg_dsc_data.keys())[0]
    
    data = sample.tg_dsc_data[primary_heating_rate]
    
    crossing_temp = calculate_crossing_point_temperature(data)
    
    ea_values = []
    for result in sample.kinetic_results.values():
        if result.activation_energy > 0:
            ea_values.append(result.activation_energy)
    
    if ea_values:
        avg_Ea = np.mean(ea_values)
    else:
        avg_Ea = 100
    
    volatile = sample.proximate.volatile
    
    risk_index = calculate_risk_index(avg_Ea, volatile)
    
    risk_level = classify_risk_level(risk_index, crossing_temp)
    
    return SpontaneousCombustionResult(
        crossing_point_temp=crossing_temp,
        risk_index=risk_index,
        risk_level=risk_level,
        activation_energy_avg=avg_Ea,
        volatile_content=volatile
    )


def batch_evaluate_samples(samples: List[CoalSample]) -> List[CoalSample]:
    """
    批量评价多个煤样的自燃倾向性
    """
    for sample in samples:
        sample.sc_result = evaluate_spontaneous_combustion(sample)
    
    return samples
