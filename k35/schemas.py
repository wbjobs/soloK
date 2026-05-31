from pydantic import BaseModel, Field
from typing import List, Optional, Dict, Any
from datetime import datetime


class MeasurementData(BaseModel):
    timestamp: datetime
    node_id: int
    voltage_magnitude: float = Field(..., description="电压幅值 (p.u.)")
    voltage_angle: float = Field(..., description="电压相角 (rad)")
    active_power: float = Field(..., description="有功潮流 (MW)")
    reactive_power: float = Field(..., description="无功潮流 (MVAr)")


class BatchDetectionRequest(BaseModel):
    measurements: List[MeasurementData]
    topology: Optional[Dict[str, Any]] = None
    return_shap_values: bool = False


class AttackNode(BaseModel):
    node_id: int
    suspicious_index: float = Field(..., ge=0.0, le=1.0)
    attack_type: Optional[str] = None
    affected_measurements: List[str]


class DetectionResult(BaseModel):
    is_attack: bool
    attack_confidence: float
    detection_method: str
    suspicious_nodes: List[AttackNode]
    chi_square_value: Optional[float] = None
    chi_square_threshold: Optional[float] = None
    reconstruction_error: Optional[float] = None
    reconstruction_threshold: Optional[float] = None
    shap_values: Optional[Dict[int, Dict[str, float]]] = None
    timestamp: datetime


class SimulateAttackRequest(BaseModel):
    attack_type: str = Field(..., description="constant_bias, random, ramp")
    target_nodes: List[int]
    attack_magnitude: float = 0.1
    attack_duration: int = 10
    base_measurements: List[MeasurementData]


class SimulateAttackResponse(BaseModel):
    original_measurements: List[MeasurementData]
    attacked_measurements: List[MeasurementData]
    attack_pattern: Dict[int, Dict[str, float]]


class VisualizationData(BaseModel):
    residuals_before: List[float]
    residuals_after: List[float]
    confidence_interval: Dict[str, float]
    node_residuals: Dict[int, Dict[str, Dict[str, List[float]]]]


class VAEDetectionRequest(BaseModel):
    measurements: List[MeasurementData]


class VAEDetectionResponse(BaseModel):
    is_attack: bool
    elbo_score: float
    kl_divergence: float
    reconstruction_likelihood: float
    latent_density_score: float
    threshold: float
    confidence: float
    suspicious_nodes: List[AttackNode]
    node_density_scores: Dict[int, float]


class ConsequencePredictionRequest(BaseModel):
    original_measurements: List[MeasurementData]
    attacked_measurements: List[MeasurementData]


class VoltageViolationInfo(BaseModel):
    node_id: int
    voltage_pu: float
    violation_type: str
    severity: float


class EconomicImpactInfo(BaseModel):
    generation_cost_change_mw: float
    estimated_cost_change_usd: float
    redispatch_amount_mw: float
    affected_generators: List[int]
    load_shedding_mw: float


class ConsequencePredictionResponse(BaseModel):
    economic_impact: EconomicImpactInfo
    voltage_violations: List[VoltageViolationInfo]
    max_voltage_deviation_pu: float
    voltage_violation_risk: float
    total_economic_loss_usd: float
    risk_level: str
    vulnerable_nodes: List[int]
