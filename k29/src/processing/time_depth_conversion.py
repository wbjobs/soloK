import numpy as np
import pandas as pd
from typing import Dict, List, Optional, Tuple
from .las_loader import WellData


def calculate_time_depth(
    depth: np.ndarray,
    dt: np.ndarray,
    dt_unit: str = "us/ft",
    t0: float = 0.0,
) -> Tuple[np.ndarray, np.ndarray]:
    """
    深度域到时深转换（积分法）
    
    Parameters:
    -----------
    depth: 深度数组 (m)
    dt: 声波时差数组
    dt_unit: 声波时差单位 ('us/ft' 或 'us/m')
    t0: 初始时间 (s)
    
    Returns:
    --------
    (twt, v_avg): 双程旅行时间(s)和平均速度(m/s)
    """
    if dt_unit == "us/ft":
        dt_m = dt * 3.28084
    else:
        dt_m = dt
    
    dt_s = dt_m * 1e-6
    
    delta_depth = np.diff(depth, prepend=depth[0])
    
    one_way_time = np.cumsum(dt_s * delta_depth)
    twt = 2 * one_way_time + t0
    
    v_avg = np.zeros_like(depth)
    valid = twt > 0
    v_avg[valid] = depth[valid] / (twt[valid] / 2)
    v_avg[~valid] = 0
    
    return twt, v_avg


def convert_well_to_time_domain(
    well: WellData,
    time_step: float = 0.001,
    max_time: Optional[float] = None,
) -> pd.DataFrame:
    """
    将测井数据从深度域转换到时间域
    
    Parameters:
    -----------
    well: WellData对象
    time_step: 时间采样间隔 (s)
    max_time: 最大时间 (s)，如果为None则自动计算
    
    Returns:
    --------
    DataFrame with time domain data
    """
    depth = well.get_depth()
    dt = well.get_curve("DT")
    
    if depth is None or dt is None:
        raise ValueError("时深转换需要DEPTH和DT曲线")
    
    dt_unit = well.units.get("DT", "us/ft")
    twt, v_avg = calculate_time_depth(depth, dt, dt_unit)
    
    if max_time is None:
        max_time = twt[-1]
    
    target_times = np.arange(0, max_time + time_step, time_step)
    
    time_data = {"TWT": target_times}
    
    for curve_name in well.curves:
        if curve_name == "DEPTH":
            curve_values = depth
        else:
            curve_values = well.get_curve(curve_name)
        
        if curve_values is not None:
            interp_values = np.interp(target_times, twt, curve_values, left=np.nan, right=np.nan)
            if curve_name == "DEPTH":
                time_data["DEPTH"] = interp_values
            else:
                time_data[curve_name] = interp_values
    
    time_data["V_AVG"] = np.interp(target_times, twt, v_avg, left=0, right=v_avg[-1] if len(v_avg) > 0 else 0)
    
    return pd.DataFrame(time_data)


def create_checkshot_calibration(
    well: WellData,
    checkshots: List[Tuple[float, float]],
) -> pd.DataFrame:
    """
    使用Checkshot数据进行时深标定
    
    Parameters:
    -----------
    well: WellData对象
    checkshots: [(depth, twt), ...] 列表
    
    Returns:
    --------
    DataFrame with calibrated time-depth curve
    """
    depth = well.get_depth()
    dt = well.get_curve("DT")
    
    if depth is None or dt is None:
        raise ValueError("时深标定需要DEPTH和DT曲线")
    
    dt_unit = well.units.get("DT", "us/ft")
    twt_calc, v_avg = calculate_time_depth(depth, dt, dt_unit)
    
    if len(checkshots) > 0:
        cs_depths = np.array([cs[0] for cs in checkshots])
        cs_times = np.array([cs[1] for cs in checkshots])
        
        cs_twt_calc = np.interp(cs_depths, depth, twt_calc)
        drift = cs_times - cs_twt_calc
        
        drift_curve = np.interp(depth, cs_depths, drift, left=drift[0], right=drift[-1])
        twt_calibrated = twt_calc + drift_curve
    else:
        twt_calibrated = twt_calc
    
    result = pd.DataFrame({
        "DEPTH": depth,
        "TWT_CALC": twt_calc,
        "TWT_CALIBRATED": twt_calibrated,
        "V_AVG": v_avg,
    })
    
    return result


def get_time_depth_units() -> Dict[str, str]:
    return {
        "DEPTH": "m",
        "TWT": "s",
        "TWT_CALC": "s",
        "TWT_CALIBRATED": "s",
        "V_AVG": "m/s",
    }
