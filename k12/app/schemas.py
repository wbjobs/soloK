from pydantic import BaseModel, Field
from typing import List, Optional, Dict, Any


class LinkBudgetRequest(BaseModel):
    uplink_frequency: float = Field(..., description="上行频率 (GHz)")
    downlink_frequency: float = Field(..., description="下行频率 (GHz)")
    satellite_orbit: float = Field(..., description="卫星轨道高度 (km)")
    earth_station_lat: float = Field(..., description="地球站纬度 (度)")
    earth_station_lon: float = Field(..., description="地球站经度 (度)")
    antenna_diameter: float = Field(..., description="天线直径 (m)")
    transmit_power: float = Field(..., description="发射功率 (W)")
    modulation: str = Field(..., description="调制方式: BPSK, QPSK, 8PSK, 16QAM")
    bandwidth: float = Field(36.0, description="带宽 (MHz)")
    noise_temperature: float = Field(290.0, description="噪声温度 (K)")
    elevation_angle: Optional[float] = Field(None, description="仰角 (度)")


class LinkBudgetResponse(BaseModel):
    eirp: float
    gt: float
    free_space_loss: float
    rain_attenuation: float
    cn_ratio: float
    link_margin: float
    antenna_gain: float
    path_length: float


class InterferenceRequest(BaseModel):
    victim_freq: float = Field(..., description="受扰系统频率 (GHz)")
    victim_eirp: float = Field(..., description="受扰系统EIRP (dBW)")
    victim_bandwidth: float = Field(..., description="受扰系统带宽 (MHz)")
    victim_gt: float = Field(..., description="受扰系统G/T (dB/K)")
    interferer_count: int = Field(1, description="干扰源数量")
    interferer_eirp: List[float] = Field(..., description="各干扰源EIRP (dBW)")
    interferer_separation: List[float] = Field(..., description="与各干扰源角距 (度)")
    interferer_type: List[str] = Field(..., description="干扰类型: co_channel, adjacent_satellite, intermodulation")
    antenna_diameter: float = Field(..., description="天线直径 (m)")
    frequency: float = Field(..., description="工作频率 (GHz)")


class InterferenceResponse(BaseModel):
    in_ratio: float
    ci_ratio: float
    interference_margin: float
    meets_threshold: bool
    total_interference: float
    coordination_threshold: float


class BeamCoverageRequest(BaseModel):
    satellite_lat: float = Field(..., description="卫星纬度 (度)")
    satellite_lon: float = Field(..., description="卫星经度 (度)")
    satellite_altitude: float = Field(..., description="卫星高度 (km)")
    antenna_model: str = Field("parabolic", description="天线模型: parabolic, array, elliptical")
    antenna_diameter: float = Field(..., description="天线直径 (m)")
    frequency: float = Field(..., description="频率 (GHz)")
    transmit_power: float = Field(..., description="发射功率 (W)")
    grid_resolution: float = Field(1.0, description="网格分辨率 (度)")
    center_azimuth: float = Field(0.0, description="中心方位角 (度)")
    center_elevation: float = Field(0.0, description="中心仰角 (度)")
    beam_aspect_ratio: float = Field(1.0, description="椭圆波束轴比 (长轴/短轴)")
    beam_orientation: float = Field(0.0, description="波束朝向角度 (度)")


class FrequencyCoordinationRequest(BaseModel):
    satellite_count: int = Field(..., ge=2, le=5, description="卫星数量 (2-5)")
    satellite_names: List[str] = Field(..., description="卫星名称列表")
    frequency_bands: List[List[float]] = Field(..., description="各卫星可用频段列表 [(start, end), ...] (GHz)")
    bandwidth_required: float = Field(..., description="所需带宽 (MHz)")
    eirp_list: List[float] = Field(..., description="各卫星EIRP (dBW)")
    gt_list: List[float] = Field(..., description="各卫星G/T (dB/K)")
    separation_angles: List[List[float]] = Field(..., description="卫星间角距矩阵 (度)")


class FrequencyCoordinationResponse(BaseModel):
    interference_matrix: List[List[float]]
    optimal_allocation: Dict[str, Dict[str, Any]]
    total_interference: float
    allocation_success: bool


class MonteCarloRequest(BaseModel):
    iterations: int = Field(1000, ge=100, le=10000, description="仿真次数")
    uplink_frequency: float = Field(..., description="上行频率 (GHz)")
    downlink_frequency: float = Field(..., description="下行频率 (GHz)")
    satellite_orbit: float = Field(..., description="卫星轨道高度 (km)")
    antenna_diameter: float = Field(..., description="天线直径 (m)")
    transmit_power: float = Field(..., description="发射功率 (W)")
    bandwidth: float = Field(36.0, description="带宽 (MHz)")
    modulation: str = Field("QPSK", description="调制方式")
    atmospheric_attenuation_mean: float = Field(0.5, description="大气衰减均值 (dB)")
    atmospheric_attenuation_std: float = Field(0.3, description="大气衰减标准差 (dB)")
    pointing_error_mean: float = Field(0.1, description="指向误差均值 (度)")
    pointing_error_std: float = Field(0.05, description="指向误差标准差 (度)")
    rain_attenuation_mean: float = Field(1.0, description="雨衰均值 (dB)")
    rain_attenuation_std: float = Field(0.8, description="雨衰标准差 (dB)")
    required_margin: float = Field(3.0, description="所需链路余量 (dB)")


class MonteCarloResponse(BaseModel):
    task_id: Optional[str] = None
    status: str
    availability_curve: Optional[List[Dict[str, float]]] = None
    mean_margin: Optional[float] = None
    std_margin: Optional[float] = None
    availability_99: Optional[float] = None
    availability_999: Optional[float] = None


class ModulationRecommendationRequest(BaseModel):
    link_margin: float = Field(..., description="当前链路余量 (dB)")
    bandwidth: float = Field(36.0, description="带宽 (MHz)")
    margin_backoff: float = Field(1.0, description="余量备份 (dB)")


class ModulationRecommendationResponse(BaseModel):
    recommended_scheme: str
    modulation: str
    code_rate: float
    required_threshold: float
    spectral_efficiency: float
    available_margin: float
    effective_margin: float
    margin_above_threshold: float
    throughput_bps: float
    throughput_mbps: float
    available_schemes: List[Dict[str, Any]]


class ACMSimulationRequest(BaseModel):
    duration: int = Field(1000, ge=100, le=10000, description="仿真时长 (时间步)")
    mean_margin: float = Field(10.0, description="平均链路余量 (dB)")
    std_margin: float = Field(3.0, description="链路余量标准差 (dB)")
    fade_depth: float = Field(10.0, description="衰落深度 (dB)")
    fade_duration: int = Field(10, description="单次衰落持续时间")
    fade_interval: int = Field(100, description="衰落间隔")
    bandwidth: float = Field(36.0, description="带宽 (MHz)")
    margin_backoff: float = Field(1.0, description="余量备份 (dB)")
    switch_hysteresis: float = Field(1.5, description="切换迟滞 (dB)")


class ACMSimulationResponse(BaseModel):
    scheme_history: List[str]
    throughput_history: List[float]
    switch_events: List[Dict[str, Any]]
    switch_count: int
    average_throughput_mbps: float
    total_data_gb: float
    scheme_statistics: Dict[str, Dict[str, float]]
    final_scheme: str


class MonitorStation(BaseModel):
    latitude: float = Field(..., description="监测站纬度 (度)")
    longitude: float = Field(..., description="监测站经度 (度)")
    rssi: float = Field(..., description="接收信号强度 (dBm)")
    aoa: float = Field(..., description="到达角 (度, 0-360, 0=北, 90=东)")


class InterferenceLocalizationRequest(BaseModel):
    stations: List[MonitorStation] = Field(..., description="监测站列表 (至少2个)")
    frequency: float = Field(..., description="干扰频率 (GHz)")
    tx_power: float = Field(20.0, description="干扰源发射功率 (dBm)")
    method: str = Field("hybrid", description="定位方法: rssi, aoa, hybrid")
    rssi_weight: float = Field(0.4, description="RSSI权重")
    aoa_weight: float = Field(0.6, description="AoA权重")


class InterferenceLocalizationResponse(BaseModel):
    latitude: float
    longitude: float
    confidence_radius_km: float
    method: str
    geojson: Dict[str, Any]
    rssi_result: Optional[Dict[str, Any]] = None
    aoa_result: Optional[Dict[str, Any]] = None
