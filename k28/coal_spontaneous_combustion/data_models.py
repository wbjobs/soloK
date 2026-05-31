"""
数据模型定义
"""
from dataclasses import dataclass, field
from typing import Dict, List, Optional
import numpy as np


@dataclass
class ProximateAnalysis:
    """工业分析数据（%）"""
    moisture: float
    ash: float
    volatile: float
    fixed_carbon: float


@dataclass
class UltimateAnalysis:
    """元素分析数据（%）"""
    c: float
    h: float
    o: float
    n: float
    s: float


@dataclass
class TGDSCData:
    """TG-DSC实验数据"""
    heating_rate: float
    temperature: np.ndarray
    tg: np.ndarray
    dsc: Optional[np.ndarray] = None
    dtg: Optional[np.ndarray] = None

    def __post_init__(self):
        if self.dtg is None:
            self.dtg = np.gradient(self.tg, self.temperature)


@dataclass
class KineticResults:
    """动力学计算结果"""
    method: str
    activation_energy: float
    pre_exponential_factor: float
    r_squared: float
    mechanism_function: Optional[str] = None
    mechanism_code: Optional[str] = None


@dataclass
class SpontaneousCombustionResult:
    """自燃倾向性评判结果"""
    crossing_point_temp: float
    risk_index: float
    risk_level: str
    activation_energy_avg: float
    volatile_content: float


@dataclass
class CoalSample:
    """煤样数据"""
    sample_id: str
    sample_name: str
    proximate: ProximateAnalysis
    ultimate: UltimateAnalysis
    tg_dsc_data: Dict[float, TGDSCData] = field(default_factory=dict)
    kinetic_results: Dict[str, KineticResults] = field(default_factory=dict)
    sc_result: Optional[SpontaneousCombustionResult] = None

    def add_tg_dsc_data(self, heating_rate: float, data: TGDSCData):
        self.tg_dsc_data[heating_rate] = data
