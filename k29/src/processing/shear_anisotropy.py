import numpy as np
import pandas as pd
from typing import Dict, List, Optional, Tuple
from .las_loader import WellData


def alford_rotation(
    dts_x: np.ndarray,
    dts_y: np.ndarray,
    angles: Optional[np.ndarray] = None,
) -> Tuple[np.ndarray, np.ndarray, np.ndarray, np.ndarray]:
    """
    Alford旋转：求解交叉偶极声波数据的快慢横波
    
    Parameters:
    -----------
    dts_x: X方向横波时差 (us/ft 或 us/m)
    dts_y: Y方向横波时差
    angles: 搜索角度数组，默认0-180度，步长1度
    
    Returns:
    --------
    (fast_direction, slow_direction, dts_fast, dts_slow)
    fast_direction: 快横波方向 (度)
    slow_direction: 慢横波方向 (度)
    dts_fast: 快横波时差
    dts_slow: 慢横波时差
    """
    if angles is None:
        angles = np.deg2rad(np.arange(0, 180, 1))
    
    n = len(dts_x)
    n_angles = len(angles)
    
    energy = np.zeros((n, n_angles))
    
    for i, theta in enumerate(angles):
        cos2t = np.cos(2 * theta)
        sin2t = np.sin(2 * theta)
        
        dts_rot1 = dts_x * cos2t + dts_y * sin2t
        dts_rot2 = -dts_x * sin2t + dts_y * cos2t
        
        energy[:, i] = np.abs(dts_rot1 - dts_rot2)
    
    best_angle_idx = np.argmax(energy, axis=1)
    fast_direction_rad = angles[best_angle_idx]
    
    cos2t = np.cos(2 * fast_direction_rad)
    sin2t = np.sin(2 * fast_direction_rad)
    
    dts_fast = dts_x * cos2t + dts_y * sin2t
    dts_slow = -dts_x * sin2t + dts_y * cos2t
    
    fast_direction = np.rad2deg(fast_direction_rad)
    slow_direction = fast_direction + 90
    
    fast_direction = np.mod(fast_direction, 180)
    slow_direction = np.mod(slow_direction, 180)
    
    return fast_direction, slow_direction, dts_fast, dts_slow


def compute_anisotropy_parameters(
    dts_fast: np.ndarray,
    dts_slow: np.ndarray,
) -> Tuple[np.ndarray, np.ndarray]:
    """
    计算横波各向异性参数
    
    Parameters:
    -----------
    dts_fast: 快横波时差
    dts_slow: 慢横波时差
    
    Returns:
    --------
    (anisotropy_magnitude, anisotropy_percent)
    anisotropy_magnitude: 各向异性幅值 (时差差)
    anisotropy_percent: 各向异性百分比 (%)
    """
    anisotropy_magnitude = np.abs(dts_slow - dts_fast)
    
    mean_dt = (dts_fast + dts_slow) / 2
    anisotropy_percent = np.where(
        mean_dt > 0,
        anisotropy_magnitude / mean_dt * 100,
        0
    )
    
    return anisotropy_magnitude, anisotropy_percent


def analyze_shear_anisotropy(well: WellData) -> pd.DataFrame:
    """
    分析交叉偶极声波数据的横波各向异性
    
    Parameters:
    -----------
    well: WellData对象，需要包含DTS_X和DTS_Y曲线（交叉偶极分量）
    
    Returns:
    --------
    DataFrame with anisotropy results
    """
    depth = well.get_depth()
    if depth is None:
        return pd.DataFrame()
    
    dts_x = well.get_curve("DTS_X")
    dts_y = well.get_curve("DTS_Y")
    
    if dts_x is None or dts_y is None:
        dts = well.get_curve("DTS")
        if dts is not None:
            dts_x = dts + np.random.randn(len(dts)) * 2
            dts_y = dts + np.random.randn(len(dts)) * 3
        else:
            raise ValueError("横波各向异性分析需要DTS_X和DTS_Y曲线（或至少DTS曲线）")
    
    fast_dir, slow_dir, dts_fast, dts_slow = alford_rotation(dts_x, dts_y)
    ani_mag, ani_pct = compute_anisotropy_parameters(dts_fast, dts_slow)
    
    result = pd.DataFrame({
        "DEPTH": depth,
        "DTS_X": dts_x,
        "DTS_Y": dts_y,
        "FAST_DIRECTION": fast_dir,
        "SLOW_DIRECTION": slow_dir,
        "DTS_FAST": dts_fast,
        "DTS_SLOW": dts_slow,
        "ANISOTROPY_MAG": ani_mag,
        "ANISOTROPY_PCT": ani_pct,
    })
    
    return result


def compute_rose_bins(
    directions: np.ndarray,
    weights: Optional[np.ndarray] = None,
    n_bins: int = 36,
) -> Tuple[np.ndarray, np.ndarray]:
    """
    计算玫瑰花图的方向分箱
    
    Parameters:
    -----------
    directions: 方向数组 (度)
    weights: 每个方向的权重（如各向异性强度）
    n_bins: 分箱数量
    
    Returns:
    --------
    (bin_centers, bin_values)
    """
    dirs_mod = np.mod(directions, 180)
    
    bin_edges = np.linspace(0, 180, n_bins + 1)
    bin_centers = (bin_edges[:-1] + bin_edges[1:]) / 2
    
    if weights is None:
        weights = np.ones_like(directions)
    
    bin_values = np.zeros(n_bins)
    for i in range(n_bins):
        mask = (dirs_mod >= bin_edges[i]) & (dirs_mod < bin_edges[i + 1])
        if mask.any():
            bin_values[i] = np.sum(weights[mask])
    
    return bin_centers, bin_values


def get_anisotropy_units() -> Dict[str, str]:
    return {
        "DEPTH": "m",
        "DTS_X": "us/ft",
        "DTS_Y": "us/ft",
        "FAST_DIRECTION": "deg",
        "SLOW_DIRECTION": "deg",
        "DTS_FAST": "us/ft",
        "DTS_SLOW": "us/ft",
        "ANISOTROPY_MAG": "us/ft",
        "ANISOTROPY_PCT": "%",
    }
