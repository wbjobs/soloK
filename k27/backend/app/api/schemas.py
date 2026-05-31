from pydantic import BaseModel, Field
from typing import List, Optional, Dict
from datetime import datetime


class VibrationData(BaseModel):
    motor_id: str
    x: List[float]
    y: List[float]
    z: List[float]
    sample_rate: int = 20000
    timestamp: Optional[datetime] = None


class CurrentData(BaseModel):
    motor_id: str
    phase_a: List[float]
    phase_b: List[float]
    phase_c: List[float]
    sample_rate: int = 10000
    timestamp: Optional[datetime] = None


class TemperatureData(BaseModel):
    motor_id: str
    bearing_temp: float
    winding_temp: float
    timestamp: Optional[datetime] = None


class DiagnosisRequest(BaseModel):
    motor_id: str
    vibration_x: Optional[List[float]] = None
    vibration_y: Optional[List[float]] = None
    vibration_z: Optional[List[float]] = None
    current_a: Optional[List[float]] = None
    current_b: Optional[List[float]] = None
    current_c: Optional[List[float]] = None
    rotational_freq: float = 25.0
    supply_freq: float = 50.0
    slip: float = 0.02


class TrendPredictionRequest(BaseModel):
    motor_id: str
    feature_names: List[str]
    historical_data: List[List[float]]


class ReportRequest(BaseModel):
    motor_id: str
    diagnosis_result: Dict
    signal_data: Optional[Dict] = None
    marked_freqs: Optional[List[Dict]] = None
    features: Dict
    thresholds: Optional[Dict] = None


class ThresholdUpdateRequest(BaseModel):
    motor_id: str
    features: Dict[str, float]
