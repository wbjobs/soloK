"""
船舶螺旋桨空化监测诊断系统 - 配置文件
"""
import numpy as np
from dataclasses import dataclass, field
from typing import List, Tuple

@dataclass
class HydrophoneConfig:
    num_hydrophones: int = 8
    sample_rate: int = 200000
    adc_bits: int = 24
    voltage_range: float = 10.0
    sensitivity: float = -180.0

@dataclass
class PropellerGeometry:
    diameter: float = 6.5
    num_blades: int = 5
    blade_area_ratio: float = 0.55
    pitch_ratio: float = 0.9
    skew_angle: float = 15.0
    rake_angle: float = 5.0
    hub_diameter_ratio: float = 0.2
    tip_clearance: float = 0.4

@dataclass
class OperatingConditions:
    shaft_speed: float = 120.0
    ship_speed: float = 15.0
    shaft_power: float = 8000.0
    water_depth: float = 20.0
    water_temperature: float = 20.0
    water_density: float = 1025.0

@dataclass
class NormalizationConfig:
    reference_speed: float = 10.0
    reference_rpm: float = 100.0
    speed_exponent: float = 5.0
    rpm_exponent: float = 3.0
    enable_ship_speed_norm: bool = True
    enable_rpm_norm: bool = True

@dataclass
class FeatureExtractionConfig:
    frame_length: int = 4096
    hop_length: int = 2048
    freq_bands: List[Tuple[float, float]] = field(default_factory=lambda: [
        (1000, 5000),
        (5000, 10000),
        (10000, 50000),
        (50000, 100000)
    ])
    bsl_fmin: float = 5000
    bsl_fmax: float = 50000

@dataclass
class DetectionThresholds:
    noise_level: float = 160.0
    kurtosis: float = 5.0
    skewness: float = 2.0
    crest_factor: float = 6.0
    broadband_energy_ratio: float = 3.0

@dataclass
class SystemConfig:
    hydrophone: HydrophoneConfig = field(default_factory=HydrophoneConfig)
    propeller: PropellerGeometry = field(default_factory=PropellerGeometry)
    conditions: OperatingConditions = field(default_factory=OperatingConditions)
    normalization: NormalizationConfig = field(default_factory=NormalizationConfig)
    features: FeatureExtractionConfig = field(default_factory=FeatureExtractionConfig)
    thresholds: DetectionThresholds = field(default_factory=DetectionThresholds)
    
    buffer_duration: float = 60.0
    pre_alarm_duration: float = 30.0
    post_alarm_duration: float = 30.0
    
    visualization_update_interval: float = 0.1
    enable_real_time_plot: bool = True
    enable_3d_visualization: bool = True

DEFAULT_CONFIG = SystemConfig()

CAVITATION_TYPES = {
    0: '无空化',
    1: '叶梢涡空化',
    2: '叶面空化',
    3: '叶背空化',
    4: '根涡空化'
}

CAVITATION_COLORS = {
    '无空化': '#00ff00',
    '叶梢涡空化': '#ffff00',
    '叶面空化': '#ff9900',
    '叶背空化': '#ff3300',
    '根涡空化': '#cc00ff'
}
