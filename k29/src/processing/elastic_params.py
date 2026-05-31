import numpy as np
import pandas as pd
from typing import Dict, Optional
from .las_loader import WellData


def convert_dt_to_velocity(dt: np.ndarray, unit: str = "us/ft") -> np.ndarray:
    if unit == "us/ft":
        return 1e6 / (dt * 3.28084)
    elif unit == "us/m":
        return 1e6 / dt
    else:
        return 1e6 / dt


def calculate_elastic_params(well: WellData) -> pd.DataFrame:
    depth = well.get_depth()
    if depth is None:
        return pd.DataFrame()
    
    dt = well.get_curve("DT")
    dts = well.get_curve("DTS")
    rho = well.get_curve("RHOB")
    
    if dt is None or dts is None or rho is None:
        missing = []
        if dt is None:
            missing.append("DT")
        if dts is None:
            missing.append("DTS")
        if rho is None:
            missing.append("RHOB")
        raise ValueError(f"缺少必要的曲线: {', '.join(missing)}。需要DT、DTS、RHOB曲线。")
    
    dt_unit = well.units.get("DT", "us/ft")
    dts_unit = well.units.get("DTS", "us/ft")
    rho_unit = well.units.get("RHOB", "g/cm3")
    
    vp = convert_dt_to_velocity(dt, dt_unit)
    vs = convert_dt_to_velocity(dts, dts_unit)
    
    rho_kgm3 = rho * 1000 if rho_unit == "g/cm3" else rho
    
    vp_km_s = vp / 1000
    vs_km_s = vs / 1000
    rho_gcm3 = rho
    
    shear_modulus = rho_kgm3 * vs ** 2 / 1e9
    bulk_modulus = rho_kgm3 * (vp ** 2 - 4/3 * vs ** 2) / 1e9
    youngs_modulus = (9 * bulk_modulus * shear_modulus) / (3 * bulk_modulus + shear_modulus)
    poissons_ratio = (vp ** 2 - 2 * vs ** 2) / (2 * (vp ** 2 - vs ** 2))
    lame_lambda = (rho_kgm3 * (vp ** 2 - 2 * vs ** 2)) / 1e9
    acoustic_impedance = vp * rho_kgm3 / 1e6
    
    result = pd.DataFrame({
        "DEPTH": depth,
        "VP": vp_km_s,
        "VS": vs_km_s,
        "VP_VS": vp / vs,
        "RHOB": rho_gcm3,
        "SHEAR_MODULUS": shear_modulus,
        "BULK_MODULUS": bulk_modulus,
        "YOUNGS_MODULUS": youngs_modulus,
        "POISSONS_RATIO": poissons_ratio,
        "LAME_LAMBDA": lame_lambda,
        "ACOUSTIC_IMPEDANCE": acoustic_impedance,
    })
    
    return result


def get_elastic_units() -> Dict[str, str]:
    return {
        "DEPTH": "m",
        "VP": "km/s",
        "VS": "km/s",
        "VP_VS": "ratio",
        "RHOB": "g/cm3",
        "SHEAR_MODULUS": "GPa",
        "BULK_MODULUS": "GPa",
        "YOUNGS_MODULUS": "GPa",
        "POISSONS_RATIO": "ratio",
        "LAME_LAMBDA": "GPa",
        "ACOUSTIC_IMPEDANCE": "10^6 kg/m2s",
    }


def estimate_dts_from_dt(dt: np.ndarray, lithology_factor: float = 1.8) -> np.ndarray:
    return dt * lithology_factor
