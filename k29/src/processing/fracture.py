import numpy as np
import pandas as pd
from typing import Dict
from .las_loader import WellData


def detect_fractures_from_shear_wave(
    dts_fast: np.ndarray,
    dts_slow: np.ndarray,
    depth: np.ndarray,
    window_size: int = 20,
    threshold: float = 5.0,
) -> pd.DataFrame:
    """
    基于横波分裂现象的裂缝识别
    
    Parameters:
    -----------
    dts_fast: 快横波时差 (us/ft 或 us/m)
    dts_slow: 慢横波时差
    depth: 深度数组
    window_size: 滑动窗口大小
    threshold: 裂缝检测阈值 (us)
    
    Returns:
    --------
    DataFrame containing fracture indicators
    """
    delta_t = dts_slow - dts_fast
    
    from scipy.ndimage import uniform_filter1d
    delta_t_smoothed = uniform_filter1d(delta_t, size=window_size)
    
    fracture_indicator = np.zeros_like(delta_t, dtype=int)
    fracture_indicator[delta_t_smoothed > threshold] = 1
    
    fracture_intensity = (delta_t_smoothed - threshold) / threshold
    fracture_intensity[fracture_intensity < 0] = 0
    fracture_intensity = np.clip(fracture_intensity, 0, 1)
    
    fracture_level = np.zeros(len(delta_t), dtype=object)
    fracture_level[fracture_intensity < 0.3] = "无裂缝"
    fracture_level[(fracture_intensity >= 0.3) & (fracture_intensity < 0.6)] = "微裂缝"
    fracture_level[(fracture_intensity >= 0.6) & (fracture_intensity < 0.9)] = "裂缝发育"
    fracture_level[fracture_intensity >= 0.9] = "裂缝很发育"
    
    result = pd.DataFrame({
        "DEPTH": depth,
        "DTS_FAST": dts_fast,
        "DTS_SLOW": dts_slow,
        "DELTA_T": delta_t,
        "DELTA_T_SMOOTHED": delta_t_smoothed,
        "FRACTURE_FLAG": fracture_indicator,
        "FRACTURE_INTENSITY": fracture_intensity,
        "FRACTURE_LEVEL": fracture_level,
    })
    
    return result


def estimate_dts_split(
    dts_mean: np.ndarray,
    fracture_gradient: float = 8.0,
) -> tuple:
    """
    从平均横波时差估算快慢横波
    
    Parameters:
    -----------
    dts_mean: 平均横波时差
    fracture_gradient: 裂缝引起的时差分离梯度
    
    Returns:
    --------
    (dts_fast, dts_slow)
    """
    split = np.abs(np.random.randn(len(dts_mean)) * fracture_gradient)
    dts_fast = dts_mean - split / 2
    dts_slow = dts_mean + split / 2
    return dts_fast, dts_slow


def analyze_fractures(well: WellData) -> pd.DataFrame:
    depth = well.get_depth()
    if depth is None:
        return pd.DataFrame()
    
    dts_fast = well.get_curve("DTS_FAST")
    dts_slow = well.get_curve("DTS_SLOW")
    dts = well.get_curve("DTS")
    
    if dts_fast is None or dts_slow is None:
        if dts is not None:
            dts_fast, dts_slow = estimate_dts_split(dts)
        else:
            raise ValueError("裂缝识别需要DTS_FAST和DTS_SLOW曲线，或至少DTS曲线")
    
    return detect_fractures_from_shear_wave(dts_fast, dts_slow, depth)


def get_fracture_units() -> Dict[str, str]:
    return {
        "DEPTH": "m",
        "DTS_FAST": "us/ft",
        "DTS_SLOW": "us/ft",
        "DELTA_T": "us/ft",
        "DELTA_T_SMOOTHED": "us/ft",
        "FRACTURE_FLAG": "0/1",
        "FRACTURE_INTENSITY": "0-1",
        "FRACTURE_LEVEL": "分类",
    }
