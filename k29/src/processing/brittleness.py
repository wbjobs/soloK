import numpy as np
import pandas as pd
from typing import Dict
from .las_loader import WellData
from .elastic_params import calculate_elastic_params


def calculate_brittleness_index(
    youngs_modulus: np.ndarray,
    poissons_ratio: np.ndarray,
    min_young: float = 10.0,
    max_young: float = 80.0,
    min_poisson: float = 0.15,
    max_poisson: float = 0.4,
) -> np.ndarray:
    """
    基于岩石力学参数的脆性指数计算（适用于页岩气评价）
    
    使用归一化的杨氏模量和泊松比组合计算脆性指数
    脆性指数范围: 0-100, 值越大表示越脆
    """
    norm_young = (youngs_modulus - min_young) / (max_young - min_young)
    norm_poisson = (max_poisson - poissons_ratio) / (max_poisson - min_poisson)
    
    norm_young = np.clip(norm_young, 0, 1)
    norm_poisson = np.clip(norm_poisson, 0, 1)
    
    brittleness = (norm_young + norm_poisson) / 2 * 100
    
    return brittleness


def calculate_brittleness_from_minerals(
    quartz: np.ndarray,
    carbonate: np.ndarray,
    clay: np.ndarray,
) -> np.ndarray:
    """
    基于矿物组分的脆性指数计算
    
    石英和碳酸盐为脆性矿物，黏土为塑性矿物
    """
    total = quartz + carbonate + clay
    total = np.where(total == 0, 1, total)
    brittleness = (quartz + carbonate) / total * 100
    return brittleness


def calculate_brittleness(well: WellData) -> pd.DataFrame:
    depth = well.get_depth()
    if depth is None:
        return pd.DataFrame()
    
    dt = well.get_curve("DT")
    dts = well.get_curve("DTS")
    rho = well.get_curve("RHOB")
    
    if dt is None or dts is None or rho is None:
        raise ValueError("计算脆性指数需要DT、DTS、RHOB曲线")
    
    elastic_df = calculate_elastic_params(well)
    
    youngs = elastic_df["YOUNGS_MODULUS"].values
    poissons = elastic_df["POISSONS_RATIO"].values
    
    bi_young_poisson = calculate_brittleness_index(youngs, poissons)
    
    result = pd.DataFrame({
        "DEPTH": depth,
        "YOUNGS_MODULUS": youngs,
        "POISSONS_RATIO": poissons,
        "BRITTLENESS": bi_young_poisson,
    })
    
    return result


def classify_brittleness(brittleness: np.ndarray) -> np.ndarray:
    """
    脆性等级分类
    """
    classes = np.full(len(brittleness), "中脆性", dtype=object)
    classes[brittleness < 40] = "塑性"
    classes[(brittleness >= 40) & (brittleness < 60)] = "中脆性"
    classes[brittleness >= 60] = "脆性"
    return classes


def get_brittleness_units() -> Dict[str, str]:
    return {
        "DEPTH": "m",
        "YOUNGS_MODULUS": "GPa",
        "POISSONS_RATIO": "ratio",
        "BRITTLENESS": "%",
    }
