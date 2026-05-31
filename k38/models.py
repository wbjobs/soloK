from pydantic import BaseModel, Field
from typing import List, Optional, Dict, Tuple
from enum import Enum
from datetime import datetime


class NeutralGroundingType(str, Enum):
    UNGROUNDED = "ungrounded"
    ARC_SUPPRESSION_COIL = "arc_suppression_coil"
    LOW_RESISTANCE = "low_resistance"
    UNKNOWN = "unknown"


class FaultType(str, Enum):
    SINGLE_PHASE_GROUND = "single_phase_ground"
    FERRO_RESONANCE = "ferro_resonance"
    PT_BROKEN = "pt_broken"
    NO_FAULT = "no_fault"


class ResistanceType(str, Enum):
    LOW_RESISTANCE = "low_resistance"
    HIGH_RESISTANCE = "high_resistance"


class ArcFaultType(str, Enum):
    NO_ARC = "no_arc"
    STABLE_GROUND = "stable_ground"
    INTERMITTENT_ARC = "intermittent_arc"
    SERIES_ARC = "series_arc"


class TravelingWaveResult(BaseModel):
    fault_distance: float = Field(..., description="故障距离（km）")
    method: str = Field(..., description="测距方法：single_end 或 double_end")
    arrival_times: List[float] = Field(..., description="行波到达时间（ms）")
    confidence: float = Field(..., description="测距置信度")
    wave_velocity: float = Field(..., description="行波波速（km/s）")
    reflection_count: int = Field(..., description="检测到的反射波数量")


class GISLocation(BaseModel):
    latitude: float = Field(..., description="纬度")
    longitude: float = Field(..., description="经度")
    distance_from_substation: float = Field(..., description="距变电站距离（km）")
    line_azimuth: float = Field(..., description="线路方位角（度）")


class ArcDetectionResult(BaseModel):
    arc_type: ArcFaultType = Field(..., description="电弧故障类型")
    is_arc_fault: bool = Field(..., description="是否为电弧故障")
    arc_count: int = Field(..., description="检测到的燃弧次数")
    average_arc_duration: float = Field(..., description="平均燃弧持续时间（ms）")
    average_extinguish_duration: float = Field(..., description="平均熄弧持续时间（ms）")
    high_frequency_energy: float = Field(..., description="高频能量比值")
    zero_crossing_deviation: float = Field(..., description="过零点偏移度")
    confidence: float = Field(..., description="电弧检测置信度")


class FeederData(BaseModel):
    feeder_id: int = Field(..., description="馈线编号")
    phase_a: List[float] = Field(..., description="A相电流采样值")
    phase_b: List[float] = Field(..., description="B相电流采样值")
    phase_c: List[float] = Field(..., description="C相电流采样值")
    zero_sequence: List[float] = Field(..., description="零序电流采样值")


class LineParameters(BaseModel):
    line_length: float = Field(10.0, description="线路总长度（km）")
    substation_latitude: float = Field(39.9042, description="变电站纬度")
    substation_longitude: float = Field(116.4074, description="变电站经度")
    line_azimuth: float = Field(45.0, description="线路方位角（度）")


class FaultRecordData(BaseModel):
    sampling_rate: int = Field(12800, description="采样率，默认12.8kHz")
    power_frequency: int = Field(50, description="工频，默认50Hz")
    duration_cycles: int = Field(4, description="录波持续周波数，默认4个周波")
    zero_sequence_voltage: List[float] = Field(..., description="零序电压采样值")
    feeders: List[FeederData] = Field(..., description="各馈线电流数据")
    line_parameters: Optional[LineParameters] = Field(None, description="线路参数，用于行波测距和GIS定位")


class AlgorithmResult(BaseModel):
    algorithm_name: str
    candidate_feeders: List[int]
    confidence_scores: Dict[int, float]
    weight: float


class FeederProbability(BaseModel):
    feeder_id: int
    probability: float
    rank: int


class FaultAnalysisResult(BaseModel):
    timestamp: datetime
    fault_type: FaultType
    fault_feeder_id: Optional[int]
    is_bus_fault: bool
    grounding_type: NeutralGroundingType
    resistance_type: ResistanceType
    estimated_resistance: float
    feeder_probabilities: List[FeederProbability]
    algorithm_results: List[AlgorithmResult]
    waveform_base64: Optional[str] = None
    fault_start_sample: Optional[int] = None
    traveling_wave: Optional[TravelingWaveResult] = None
    gis_location: Optional[GISLocation] = None
    arc_detection: Optional[ArcDetectionResult] = None


class HistoryQuery(BaseModel):
    start_time: Optional[datetime] = None
    end_time: Optional[datetime] = None
    fault_type: Optional[FaultType] = None
    feeder_id: Optional[int] = None


class HistoryRecord(BaseModel):
    record_id: str
    timestamp: datetime
    fault_type: FaultType
    fault_feeder_id: Optional[int]
    grounding_type: NeutralGroundingType
    parameters: Dict


class ReanalysisRequest(BaseModel):
    record_id: str
    parameter_overrides: Optional[Dict] = None
