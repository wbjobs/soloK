import numpy as np
import pandas as pd
from typing import Dict
from .las_loader import WellData


def calculate_porosity_wyllie(
    dt: np.ndarray,
    dt_ma: float = 55.0,
    dt_fl: float = 189.0,
) -> np.ndarray:
    """
    Wyllie时间平均方程计算孔隙度
    
    Parameters:
    -----------
    dt: 声波时差 (us/ft)
    dt_ma: 骨架声波时差 (us/ft), 砂岩默认55, 石灰岩47, 白云岩43.5
    dt_fl: 流体声波时差 (us/ft), 默认189
    
    Returns:
    --------
    phi: 孔隙度 (小数)
    """
    phi = (dt - dt_ma) / (dt_fl - dt_ma)
    return np.clip(phi, 0, 1)


def calculate_porosity_raymer(
    dt: np.ndarray,
    dt_ma: float = 55.0,
    dt_fl: float = 189.0,
) -> np.ndarray:
    """
    Raymer-Hunt-Gardner公式计算孔隙度
    
    Parameters:
    -----------
    dt: 声波时差 (us/ft)
    dt_ma: 骨架声波时差 (us/ft)
    dt_fl: 流体声波时差 (us/ft)
    
    Returns:
    --------
    phi: 孔隙度 (小数)
    """
    vp = 1e6 / (dt * 3.28084)
    vp_ma = 1e6 / (dt_ma * 3.28084)
    vp_fl = 1e6 / (dt_fl * 3.28084)
    
    ratio = vp / vp_ma
    phi = np.zeros_like(dt, dtype=float)
    
    mask1 = ratio <= 1
    phi[mask1] = (vp_ma - vp[mask1]) / (vp_ma - vp_fl)
    
    mask2 = ratio > 1
    phi[mask2] = 0.5 * (vp_ma - vp[mask2]) / vp[mask2]
    
    return np.clip(phi, 0, 1)


def calculate_porosity_density(
    rho: np.ndarray,
    rho_ma: float = 2.65,
    rho_fl: float = 1.0,
) -> np.ndarray:
    """
    密度孔隙度计算
    
    Parameters:
    -----------
    rho: 体积密度 (g/cm3)
    rho_ma: 骨架密度 (g/cm3), 砂岩2.65, 石灰岩2.71, 白云岩2.87
    rho_fl: 流体密度 (g/cm3), 默认1.0
    
    Returns:
    --------
    phi: 孔隙度 (小数)
    """
    phi = (rho_ma - rho) / (rho_ma - rho_fl)
    return np.clip(phi, 0, 1)


def calculate_porosity(
    well: WellData,
    method: str = "wyllie",
    dt_ma: float = 55.0,
    dt_fl: float = 189.0,
    rho_ma: float = 2.65,
    rho_fl: float = 1.0,
) -> pd.DataFrame:
    depth = well.get_depth()
    if depth is None:
        return pd.DataFrame()
    
    dt = well.get_curve("DT")
    rho = well.get_curve("RHOB")
    
    results = {"DEPTH": depth}
    
    if dt is not None:
        phi_wyllie = calculate_porosity_wyllie(dt, dt_ma, dt_fl)
        phi_raymer = calculate_porosity_raymer(dt, dt_ma, dt_fl)
        results["PHI_WYLLIE"] = phi_wyllie
        results["PHI_RAYMER"] = phi_raymer
    
    if rho is not None:
        phi_density = calculate_porosity_density(rho, rho_ma, rho_fl)
        results["PHI_DENSITY"] = phi_density
    
    if "PHI_WYLLIE" in results and "PHI_DENSITY" in results:
        results["PHI_COMBINED"] = (results["PHI_WYLLIE"] + results["PHI_DENSITY"]) / 2
    
    return pd.DataFrame(results)


def get_porosity_units() -> Dict[str, str]:
    return {
        "DEPTH": "m",
        "PHI_WYLLIE": "fraction",
        "PHI_RAYMER": "fraction",
        "PHI_DENSITY": "fraction",
        "PHI_COMBINED": "fraction",
    }
