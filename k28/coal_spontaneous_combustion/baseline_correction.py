"""
基线校正模块 - 自动识别TG曲线起始平台
"""
import numpy as np
from scipy.signal import savgol_filter
from scipy.ndimage import uniform_filter1d


def detect_plateau(temperature: np.ndarray, tg: np.ndarray, 
                   window_size: int = 20, threshold: float = 0.05) -> int:
    """
    检测TG曲线的起始平台区域
    返回平台结束点的索引
    """
    tg_normalized = (tg - tg.min()) / (tg.max() - tg.min() + 1e-8)
    
    dtg = np.gradient(tg_normalized, temperature)
    
    dtg_smoothed = savgol_filter(np.abs(dtg), window_length=min(window_size*2+1, len(dtg)-1), polyorder=2)
    
    threshold_value = threshold * np.max(dtg_smoothed)
    
    start_idx = 0
    for i in range(len(dtg_smoothed)):
        if dtg_smoothed[i] > threshold_value:
            start_idx = max(0, i - window_size // 2)
            break
    
    return start_idx


def baseline_correction(temperature: np.ndarray, tg: np.ndarray,
                        plateau_start: int = None, method: str = 'linear') -> np.ndarray:
    """
    TG曲线基线校正
    
    参数:
        temperature: 温度数组
        tg: TG数据数组
        plateau_start: 平台区域结束索引（None表示自动检测）
        method: 基线校正方法 ('linear', 'constant', 'polynomial')
    
    返回:
        校正后的TG数据
    """
    if plateau_start is None:
        plateau_start = detect_plateau(temperature, tg)
    
    plateau_start = max(5, min(plateau_start, len(temperature) // 3))
    
    if method == 'constant':
        baseline = np.mean(tg[:plateau_start])
        tg_corrected = tg - baseline + 100
        
    elif method == 'linear':
        x_plateau = temperature[:plateau_start]
        y_plateau = tg[:plateau_start]
        
        coeffs = np.polyfit(x_plateau, y_plateau, 1)
        baseline = np.polyval(coeffs, temperature)
        
        tg_corrected = tg - baseline + 100
        
    elif method == 'polynomial':
        x_plateau = temperature[:plateau_start]
        y_plateau = tg[:plateau_start]
        
        coeffs = np.polyfit(x_plateau, y_plateau, 2)
        baseline = np.polyval(coeffs, temperature)
        
        tg_corrected = tg - baseline + 100
        
    else:
        raise ValueError(f"未知的基线校正方法: {method}")
    
    tg_min = tg_corrected[-1]
    if tg_min < 0:
        tg_corrected = tg_corrected - tg_min
    
    tg_corrected = np.clip(tg_corrected, 0, 100)
    
    return tg_corrected


def normalize_tg(tg: np.ndarray) -> np.ndarray:
    """
    将TG数据归一化到0-100%
    """
    tg_norm = (tg - tg.min()) / (tg.max() - tg.min() + 1e-8) * 100
    return tg_norm


def calculate_conversion(tg: np.ndarray, tg_0: float = None, tg_inf: float = None) -> np.ndarray:
    """
    计算转化率 α = (m0 - m) / (m0 - m∞)
    
    参数:
        tg: TG质量数据
        tg_0: 初始质量（None表示使用第一个点）
        tg_inf: 最终质量（None表示使用最后一个点）
    
    返回:
        转化率数组 α
    """
    if tg_0 is None:
        tg_0 = tg[0]
    if tg_inf is None:
        tg_inf = tg[-1]
    
    alpha = (tg_0 - tg) / (tg_0 - tg_inf + 1e-8)
    alpha = np.clip(alpha, 0, 1)
    
    return alpha
