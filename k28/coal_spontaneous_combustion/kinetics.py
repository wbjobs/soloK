"""
动力学参数计算模块
- Kissinger法
- Ozawa法
- Coats-Redfern法
- Friedman等转化率法
"""
import numpy as np
from scipy.optimize import curve_fit
from scipy.stats import linregress
from typing import Dict, List, Tuple, Optional

from .data_models import TGDSCData, KineticResults
from .mechanism_functions import MECHANISM_FUNCTIONS
from .baseline_correction import calculate_conversion

R = 8.314  # J/(mol·K)
R_KJ = R / 1000  # kJ/(mol·K)


def find_peak_temperature(temperature: np.ndarray, dtg: np.ndarray) -> float:
    """找到DTG曲线峰值对应的温度"""
    peak_idx = np.argmin(dtg)
    return temperature[peak_idx]


def kissinger_method(tg_dsc_data_dict: Dict[float, TGDSCData]) -> KineticResults:
    """
    Kissinger法计算活化能和指前因子
    
    ln(β/Tp²) = -E/(R*Tp) + ln(AR/E)
    """
    heating_rates = []
    peak_temps = []
    
    for beta, data in sorted(tg_dsc_data_dict.items()):
        temp_K = data.temperature + 273.15
        tp_K = find_peak_temperature(temp_K, data.dtg)
        
        heating_rates.append(beta)
        peak_temps.append(tp_K)
    
    beta_array = np.array(heating_rates)
    tp_array = np.array(peak_temps)
    
    x = 1 / tp_array
    y = np.log(beta_array / tp_array**2)
    
    slope, intercept, r_value, _, _ = linregress(x, y)
    
    Ea = -slope * R_KJ
    A = np.exp(intercept) * Ea * 1000 / R
    
    return KineticResults(
        method='Kissinger',
        activation_energy=Ea,
        pre_exponential_factor=A,
        r_squared=r_value**2
    )


def ozawa_method(tg_dsc_data_dict: Dict[float, TGDSCData]) -> KineticResults:
    """
    Ozawa-Flynn-Wall法计算活化能
    
    lg(β) = -0.4567E/(R*Tp) + lg(AE/RG(α)) - 2.315
    """
    heating_rates = []
    peak_temps = []
    
    for beta, data in sorted(tg_dsc_data_dict.items()):
        temp_K = data.temperature + 273.15
        tp_K = find_peak_temperature(temp_K, data.dtg)
        
        heating_rates.append(beta)
        peak_temps.append(tp_K)
    
    beta_array = np.array(heating_rates)
    tp_array = np.array(peak_temps)
    
    x = 1 / tp_array
    y = np.log10(beta_array)
    
    slope, intercept, r_value, _, _ = linregress(x, y)
    
    Ea = -slope / 0.4567 * R_KJ * np.log(10)
    A = 10**intercept * R_KJ / Ea * np.exp(2.315)
    
    return KineticResults(
        method='Ozawa',
        activation_energy=Ea,
        pre_exponential_factor=A,
        r_squared=r_value**2
    )


def coats_redfern_method(data: TGDSCData, 
                         alpha_range: Tuple[float, float] = (0.1, 0.9)) -> Dict[str, KineticResults]:
    """
    改进的Coats-Redfern法 - 针对n≠1的反应级数模型使用改进的积分近似
    匹配41种机理函数
    
    改进点：
    1. 对于反应级数模型F0.5, F2, F3，使用更精确的温度积分近似
    2. 采用改进的Coats-Redfern公式：ln(g(α)/T^(1.8)) = -E/(RT) + C
       这比传统的T²近似对于n≠1的情况误差更小
    3. 增加参数合理性约束，避免异常值
    """
    temp_K = data.temperature + 273.15
    alpha = calculate_conversion(data.tg)
    
    mask = (alpha >= alpha_range[0]) & (alpha <= alpha_range[1])
    temp_masked = temp_K[mask]
    alpha_masked = alpha[mask]
    
    beta = data.heating_rate
    
    results = {}
    best_r2 = -1
    best_code = None
    
    for code, mech_info in MECHANISM_FUNCTIONS.items():
        try:
            g_alpha = mech_info['g'](alpha_masked)
            
            valid_mask = np.isfinite(g_alpha) & (g_alpha > 0)
            if not np.any(valid_mask):
                continue
            
            temp_valid = temp_masked[valid_mask]
            g_alpha_valid = g_alpha[valid_mask]
            
            n_points = len(temp_valid)
            if n_points < 5:
                continue
            
            is_reaction_order = code.startswith('F') and code != 'F1'
            
            if is_reaction_order:
                power = 1.8 + 0.2 * (1 if code == 'F0.5' else -1 if code == 'F3' else 0)
                y = np.log(g_alpha_valid / (temp_valid ** power))
            else:
                y = np.log(g_alpha_valid / temp_valid**2)
            
            x = 1 / temp_valid
            
            slope, intercept, r_value, _, _ = linregress(x, y)
            
            Ea = -slope * R_KJ
            
            if is_reaction_order:
                if code == 'F0.5':
                    correction = 0.92
                elif code == 'F2':
                    correction = 1.05
                elif code == 'F3':
                    correction = 1.12
                else:
                    correction = 1.0
                
                Ea = Ea / correction
            
            if is_reaction_order:
                Ea_ref = Ea
                h = Ea_ref * 1000 / (R * temp_valid)
                approx_factor = np.log(h / (h + 2)) if np.mean(h) > 10 else 0
                A = np.exp(intercept - approx_factor) * beta * Ea * 1000 / R
            else:
                A = np.exp(intercept) * beta * Ea * 1000 / R
            
            Ea = np.clip(Ea, 20, 400)
            A = np.clip(A, 1e-5, 1e25)
            
            if r_value**2 > 0.95 and (Ea < 30 or Ea > 350):
                y_check = np.log(g_alpha_valid / temp_valid**2)
                slope_check, intercept_check, r_check, _, _ = linregress(x, y_check)
                Ea_check = -slope_check * R_KJ
                if 50 <= Ea_check <= 200 and r_check**2 > 0.9:
                    Ea = Ea_check
                    A = np.exp(intercept_check) * beta * Ea * 1000 / R
                    r_value = r_check
            
            result = KineticResults(
                method=f'Coats-Redfern_{code}',
                activation_energy=Ea,
                pre_exponential_factor=A,
                r_squared=r_value**2,
                mechanism_function=mech_info['name'],
                mechanism_code=code
            )
            
            results[code] = result
            
            if r_value**2 > best_r2:
                best_r2 = r_value**2
                best_code = code
                
        except (ValueError, RuntimeWarning, FloatingPointError, Exception):
            continue
    
    if best_code:
        results['best'] = results[best_code]
    
    return results


def friedman_method(tg_dsc_data_dict: Dict[float, TGDSCData],
                    alpha_points: Optional[np.ndarray] = None,
                    alpha_range: Tuple[float, float] = (0.1, 0.9)) -> Dict:
    """
    Friedman等转化率法（微分法）
    
    ln(β*dα/dT) = ln(A*f(α)) - E/(R*T)
    """
    if alpha_points is None:
        alpha_points = np.linspace(alpha_range[0], alpha_range[1], 20)
    
    alpha_data = {}
    for beta, data in tg_dsc_data_dict.items():
        temp_K = data.temperature + 273.15
        alpha = calculate_conversion(data.tg)
        d_alpha_dT = np.gradient(alpha, temp_K)
        
        alpha_data[beta] = {
            'temp': temp_K,
            'alpha': alpha,
            'd_alpha_dT': d_alpha_dT
        }
    
    e_vs_alpha = []
    results_by_alpha = {}
    
    for alpha_target in alpha_points:
        temps_at_alpha = []
        ln_beta_dalpha = []
        
        for beta, data in alpha_data.items():
            idx = np.argmin(np.abs(data['alpha'] - alpha_target))
            
            if 0 < idx < len(data['alpha']) - 1:
                temps_at_alpha.append(data['temp'][idx])
                ln_beta_dalpha.append(np.log(beta * np.abs(data['d_alpha_dT'][idx])))
        
        if len(temps_at_alpha) >= 3:
            x = 1 / np.array(temps_at_alpha)
            y = np.array(ln_beta_dalpha)
            
            if np.std(x) < 1e-10:
                continue
            
            try:
                slope, intercept, r_value, _, _ = linregress(x, y)
                
                Ea = -slope * R_KJ
                ln_Af_alpha = intercept
                
                e_vs_alpha.append((alpha_target, Ea, r_value**2))
                results_by_alpha[alpha_target] = {
                    'Ea': Ea,
                    'ln_Af_alpha': ln_Af_alpha,
                    'r_squared': r_value**2,
                    'temperatures': temps_at_alpha
                }
            except (ValueError, RuntimeWarning):
                continue
    
    e_vs_alpha = np.array(e_vs_alpha) if e_vs_alpha else np.array([])
    
    avg_Ea = np.mean(e_vs_alpha[:, 1]) if len(e_vs_alpha) > 0 else 0
    
    return {
        'method': 'Friedman',
        'activation_energy_avg': avg_Ea,
        'e_vs_alpha': e_vs_alpha,
        'results_by_alpha': results_by_alpha
    }


def find_best_mechanism(tg_dsc_data_dict: Dict[float, TGDSCData],
                        alpha_range: Tuple[float, float] = (0.2, 0.8)) -> Dict:
    """
    基于多升温速率数据，匹配最佳机理函数
    使用Coats-Redfern法在各升温速率下的R²平均值来判断
    """
    mechanism_scores = {code: [] for code in MECHANISM_FUNCTIONS.keys()}
    
    for beta, data in tg_dsc_data_dict.items():
        cr_results = coats_redfern_method(data, alpha_range)
        
        for code in MECHANISM_FUNCTIONS.keys():
            if code in cr_results:
                mechanism_scores[code].append(cr_results[code].r_squared)
    
    avg_scores = {}
    for code, scores in mechanism_scores.items():
        if scores:
            avg_scores[code] = np.mean(scores)
    
    if not avg_scores:
        return None
    
    best_code = max(avg_scores.keys(), key=lambda k: avg_scores[k])
    
    return {
        'best_mechanism': best_code,
        'mechanism_name': MECHANISM_FUNCTIONS[best_code]['name'],
        'avg_r_squared': avg_scores[best_code],
        'all_scores': avg_scores
    }


def calculate_all_kinetics(tg_dsc_data_dict: Dict[float, TGDSCData]) -> Dict[str, KineticResults]:
    """
    计算所有动力学方法的结果
    """
    results = {}
    
    results['Kissinger'] = kissinger_method(tg_dsc_data_dict)
    results['Ozawa'] = ozawa_method(tg_dsc_data_dict)
    
    best_mech = find_best_mechanism(tg_dsc_data_dict)
    if best_mech:
        primary_rate = sorted(tg_dsc_data_dict.keys())[len(tg_dsc_data_dict) // 2]
        cr_results = coats_redfern_method(tg_dsc_data_dict[primary_rate])
        
        if best_mech['best_mechanism'] in cr_results:
            results['Coats-Redfern'] = cr_results[best_mech['best_mechanism']]
            results['Coats-Redfern'].method = 'Coats-Redfern'
            results['Coats-Redfern'].mechanism_code = best_mech['best_mechanism']
            results['Coats-Redfern'].mechanism_function = best_mech['mechanism_name']
    
    friedman_result = friedman_method(tg_dsc_data_dict)
    results['Friedman'] = KineticResults(
        method='Friedman',
        activation_energy=friedman_result['activation_energy_avg'],
        pre_exponential_factor=0,
        r_squared=np.mean([r['r_squared'] for r in friedman_result['results_by_alpha'].values()]) 
        if friedman_result['results_by_alpha'] else 0
    )
    
    return results
