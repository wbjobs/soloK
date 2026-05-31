from datetime import datetime
from typing import List, Optional, Tuple, Dict
from pydantic import BaseModel, Field

class SensorData(BaseModel):
    well_id: str
    timestamp: datetime
    water_level: float
    conductivity: float
    temperature: float
    ph: float
    redox_potential: float
    contaminant_concentration: Dict[str, float] = Field(default_factory=dict)

class MonitoringWell(BaseModel):
    well_id: str
    x: float
    y: float
    z: float
    screen_top: float
    screen_bottom: float
    active: bool = True

class VoxelGrid(BaseModel):
    x_min: float
    x_max: float
    y_min: float
    y_max: float
    z_min: float
    z_max: float
    resolution: Tuple[float, float, float]
    dimensions: Tuple[int, int, int]
    data: List[float]
    variance: Optional[List[float]] = None
    timestamp: datetime
    contaminant: str

class ForecastRequest(BaseModel):
    months_ahead: int = 3
    contaminant: str = "TCE"
    hydraulic_gradient: Optional[Tuple[float, float]] = None
    porosity: float = 0.3
    retardation_factor: float = 2.0

class OptimizationResult(BaseModel):
    candidate_locations: List[Tuple[float, float, float]]
    variance_reduction: List[float]
    current_max_variance: float
    optimized_max_variance: float

class RiskAssessment(BaseModel):
    exceedance_volume: float
    exceedance_percentage: float
    high_risk_regions: List[Dict]
    total_volume: float
    threshold: float
    contaminant: str
    timestamp: datetime

class TimePointData(BaseModel):
    timestamp: datetime
    voxel_data: List[float]
    well_data: List[Dict]

class InjectionWell(BaseModel):
    well_id: str
    x: float
    y: float
    z: float
    type: str = Field(default="chemical_oxidation", description="chemical_oxidation or bioremediation")
    reagent_concentration: float = Field(default=1000.0, description="mg/L")
    injection_rate: float = Field(default=10.0, description="m³/day")
    reaction_half_life: float = Field(default=7.0, description="days, reagent half-life")
    degradation_rate: float = Field(default=0.5, description="day⁻¹, contaminant degradation rate")
    active: bool = True

class RemediationRequest(BaseModel):
    injection_wells: List[InjectionWell]
    duration_days: int = 30
    contaminant: str = "TCE"
    timestep_days: float = 1.0
    show_animation: bool = True

class RemediationResult(BaseModel):
    initial_state: Dict
    final_state: Dict
    time_series: List[Dict]
    reduction_percentage: float
    risk_reduction: float
    total_reagent_used: float

class EnKFConfig(BaseModel):
    ensemble_size: int = 50
    inflation_factor: float = 1.05
    observation_noise: float = 0.1
    assimilate_interval_hours: int = 24
    parameters_to_update: List[str] = Field(default_factory=lambda: ["hydraulic_conductivity", "porosity", "degradation_rate"])

class EnKFResult(BaseModel):
    updated_parameters: Dict[str, float]
    parameter_uncertainty: Dict[str, float]
    forecast_improvement: float
    updated_voxel_grid: Optional[Dict] = None
    innovation_statistics: Dict
