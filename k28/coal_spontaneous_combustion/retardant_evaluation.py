"""
阻燃剂效果评估模块
- 计算添加阻燃剂后的活化能增量
- 推荐最小阻燃剂添加量
"""
import numpy as np
from scipy.optimize import fsolve
from typing import Dict, Optional, Tuple, List
from dataclasses import dataclass, field

from .data_models import TGDSCData, KineticResults
from .kinetics import kissinger_method, ozawa_method, coats_redfern_method
from .baseline_correction import baseline_correction


@dataclass
class RetardantProperties:
    """阻燃剂性质参数"""
    name: str = "Mg(OH)2"
    decomposition_temp: float = 300.0
    heat_absorption: float = 1.3e6
    effective_factor: float = 1.0


@dataclass
class RetardantEvaluationResult:
    """阻燃剂效果评估结果"""
    base_activation_energy: float
    treated_activation_energy: float
    activation_energy_increase: float
    activation_energy_increase_ratio: float
    recommended_dosage: float
    dosage_unit: str = "%"
    retardant_name: str = "Mg(OH)2"
    effectiveness_score: float = 0.0


class RetardantEvaluator:
    """
    阻燃剂效果评估器
    
    工作原理：
    1. 基于添加阻燃剂前后的TG曲线，计算活化能变化
    2. 建立活化能增量与添加量的关系模型
    3. 根据目标活化能增量，推荐最小添加量
    """
    
    def __init__(self):
        self.retardant_models = {
            'Mg(OH)2': self._mgoh2_model,
            'Al(OH)3': self._aloh3_model,
            'ZnB': self._zinc_borate_model,
            'APP': self._app_model,
        }
    
    def calculate_activation_energy(self, tg_dsc_data: Dict[float, TGDSCData],
                                   method: str = 'Kissinger') -> float:
        """
        计算煤样的活化能
        
        参数:
            tg_dsc_data: 多升温速率TG-DSC数据字典
            method: 计算方法 ('Kissinger', 'Ozawa', 'Coats-Redfern')
        
        返回:
            活化能 (kJ/mol)
        """
        if method == 'Kissinger':
            result = kissinger_method(tg_dsc_data)
        elif method == 'Ozawa':
            result = ozawa_method(tg_dsc_data)
        elif method == 'Coats-Redfern':
            primary_rate = sorted(tg_dsc_data.keys())[len(tg_dsc_data) // 2]
            cr_results = coats_redfern_method(tg_dsc_data[primary_rate])
            result = cr_results.get('best', list(cr_results.values())[0])
        else:
            raise ValueError(f"未知的方法: {method}")
        
        return result.activation_energy
    
    def evaluate(self, 
                 base_data: Dict[float, TGDSCData],
                 treated_data: Optional[Dict[float, TGDSCData]] = None,
                 retardant: str = 'Mg(OH)2',
                 target_ea_increase: float = 20.0,
                 method: str = 'Kissinger') -> RetardantEvaluationResult:
        """
        评估阻燃剂效果并推荐添加量
        
        参数:
            base_data: 原煤样的TG-DSC数据（多升温速率）
            treated_data: 添加阻燃剂后的TG-DSC数据（可选）
            retardant: 阻燃剂类型
            target_ea_increase: 目标活化能增量 (kJ/mol)
            method: 活化能计算方法
        
        返回:
            RetardantEvaluationResult对象
        """
        ea_base = self.calculate_activation_energy(base_data, method)
        
        if treated_data is not None:
            ea_treated = self.calculate_activation_energy(treated_data, method)
            ea_increase = ea_treated - ea_base
            ea_increase_ratio = ea_increase / ea_base * 100
        else:
            ea_treated = ea_base + target_ea_increase
            ea_increase = target_ea_increase
            ea_increase_ratio = target_ea_increase / ea_base * 100
        
        model_func = self.retardant_models.get(retardant, self._mgoh2_model)
        recommended_dosage = model_func(ea_base, ea_increase)
        
        effectiveness = min(100, ea_increase_ratio * 2) if ea_increase_ratio > 0 else 0
        
        return RetardantEvaluationResult(
            base_activation_energy=ea_base,
            treated_activation_energy=ea_treated,
            activation_energy_increase=ea_increase,
            activation_energy_increase_ratio=ea_increase_ratio,
            recommended_dosage=recommended_dosage,
            retardant_name=retardant,
            effectiveness_score=effectiveness
        )
    
    def _mgoh2_model(self, ea_base: float, ea_increase: float) -> float:
        """
        Mg(OH)2阻燃剂效果模型
        
        Mg(OH)2的阻燃机制：
        1. 吸热分解：Mg(OH)2 → MgO + H2O
        2. 水蒸气稀释可燃气体
        3. MgO形成保护层
        """
        k1 = 0.35
        k2 = 0.02
        
        if ea_increase <= 0:
            return 0.0
        
        def equation(dosage):
            return k1 * dosage * (1 + k2 * dosage) * ea_base / 100 - ea_increase
        
        try:
            dosage = fsolve(equation, 5.0)[0]
            return float(np.clip(dosage, 1.0, 30.0))
        except:
            return min(30.0, ea_increase / (k1 * ea_base / 100))
    
    def _aloh3_model(self, ea_base: float, ea_increase: float) -> float:
        """
        Al(OH)3阻燃剂效果模型
        
        分解温度较低（~200°C），吸热效果强
        """
        k1 = 0.45
        k2 = 0.015
        
        if ea_increase <= 0:
            return 0.0
        
        def equation(dosage):
            return k1 * dosage * (1 + k2 * dosage) * ea_base / 100 - ea_increase
        
        try:
            dosage = fsolve(equation, 5.0)[0]
            return float(np.clip(dosage, 1.0, 35.0))
        except:
            return min(35.0, ea_increase / (k1 * ea_base / 100))
    
    def _zinc_borate_model(self, ea_base: float, ea_increase: float) -> float:
        """
        硼酸锌阻燃剂效果模型
        
        主要起凝聚相阻燃作用，形成玻璃状保护层
        """
        k1 = 0.55
        k2 = 0.01
        
        if ea_increase <= 0:
            return 0.0
        
        def equation(dosage):
            return k1 * dosage * (1 + k2 * dosage) * ea_base / 100 - ea_increase
        
        try:
            dosage = fsolve(equation, 3.0)[0]
            return float(np.clip(dosage, 0.5, 20.0))
        except:
            return min(20.0, ea_increase / (k1 * ea_base / 100))
    
    def _app_model(self, ea_base: float, ea_increase: float) -> float:
        """
        聚磷酸铵(APP)阻燃剂效果模型
        
        膨胀型阻燃剂，形成致密炭层
        """
        k1 = 0.6
        k2 = 0.008
        
        if ea_increase <= 0:
            return 0.0
        
        def equation(dosage):
            return k1 * dosage * (1 + k2 * dosage) * ea_base / 100 - ea_increase
        
        try:
            dosage = fsolve(equation, 3.0)[0]
            return float(np.clip(dosage, 0.5, 25.0))
        except:
            return min(25.0, ea_increase / (k1 * ea_base / 100))
    
    def compare_retardants(self, base_data: Dict[float, TGDSCData],
                          target_ea_increase: float = 20.0,
                          method: str = 'Kissinger') -> Dict[str, RetardantEvaluationResult]:
        """
        对比多种阻燃剂的效果
        
        返回:
            各阻燃剂的评估结果字典
        """
        results = {}
        for retardant_name in self.retardant_models.keys():
            results[retardant_name] = self.evaluate(
                base_data=base_data,
                retardant=retardant_name,
                target_ea_increase=target_ea_increase,
                method=method
            )
        return results


def optimize_retardant_combination(base_data: Dict[float, TGDSCData],
                                  target_ea_increase: float = 25.0,
                                  method: str = 'Kissinger',
                                  max_total_dosage: float = 30.0) -> Dict:
    """
    优化阻燃剂复配方案
    
    使用协同效应模型找到最佳复配比例
    
    返回:
        包含最优复配方案的字典
    """
    evaluator = RetardantEvaluator()
    
    results = evaluator.compare_retardants(base_data, target_ea_increase, method)
    
    best_single = min(results.values(), key=lambda r: r.recommended_dosage)
    
    combinations = [
        ('Mg(OH)2', 'Al(OH)3', 0.7, 0.3),
        ('Mg(OH)2', 'ZnB', 0.8, 0.2),
        ('Mg(OH)2', 'APP', 0.75, 0.25),
        ('Al(OH)3', 'ZnB', 0.7, 0.3),
    ]
    
    best_combination = None
    best_dosage = best_single.recommended_dosage
    
    for r1, r2, w1, w2 in combinations:
        res1 = results[r1]
        res2 = results[r2]
        
        synergistic_factor = 1.15
        
        required_dosage = 1 / (
            w1 / res1.recommended_dosage + w2 / res2.recommended_dosage
        ) / synergistic_factor
        
        if required_dosage < best_dosage and required_dosage <= max_total_dosage:
            best_dosage = required_dosage
            best_combination = {
                'retardant_1': r1,
                'retardant_2': r2,
                'ratio_1': w1,
                'ratio_2': w2,
                'total_dosage': required_dosage,
                'dosage_1': required_dosage * w1,
                'dosage_2': required_dosage * w2,
                'synergistic_factor': synergistic_factor
            }
    
    return {
        'best_single': {
            'retardant': best_single.retardant_name,
            'dosage': best_single.recommended_dosage,
            'ea_increase': best_single.activation_energy_increase
        },
        'best_combination': best_combination,
        'all_results': results
    }


def generate_retardant_report(result: RetardantEvaluationResult, 
                             base_sample_name: str = "原煤") -> str:
    """
    生成阻燃剂评估报告文本
    """
    report = f"""
{'='*60}
阻燃剂效果评估报告
{'='*60}

煤样名称: {base_sample_name}
阻燃剂类型: {result.retardant_name}

【活化能分析】
  原煤活化能:     {result.base_activation_energy:.2f} kJ/mol
  阻燃处理后:     {result.treated_activation_energy:.2f} kJ/mol
  活化能增量:     {result.activation_energy_increase:.2f} kJ/mol
  提升比例:       {result.activation_energy_increase_ratio:.1f}%

【阻燃剂推荐】
  推荐添加量:     {result.recommended_dosage:.1f}% (质量百分比)
  效果评分:       {result.effectiveness_score:.1f}/100

【建议】
"""
    
    if result.effectiveness_score >= 80:
        report += "  ✓ 阻燃效果优秀，推荐使用\n"
    elif result.effectiveness_score >= 60:
        report += "  ✓ 阻燃效果良好，可满足一般要求\n"
    elif result.effectiveness_score >= 40:
        report += "  ⚠ 阻燃效果一般，建议增加添加量或采用复配方案\n"
    else:
        report += "  ✗ 阻燃效果有限，建议更换阻燃剂类型或增加添加量\n"
    
    if result.recommended_dosage > 20:
        report += "  ⚠ 添加量较高，建议考虑阻燃剂复配以降低总添加量\n"
    
    report += f"\n{'='*60}\n"
    
    return report
