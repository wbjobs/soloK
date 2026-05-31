from pydantic import BaseModel, Field
from typing import List, Optional, Dict, Any
from datetime import datetime


class SpectrumInput(BaseModel):
    spectrum: List[float] = Field(..., description="光谱数据数组")
    wavelengths: Optional[List[float]] = Field(None, description="波长数组")
    preprocess: bool = Field(True, description="是否进行预处理")


class ClassificationResult(BaseModel):
    class_id: int
    class_name: str
    confidence: float
    severity: Optional[int] = None
    probabilities: List[float]


class ClassificationResponse(BaseModel):
    success: bool
    results: List[ClassificationResult]
    processing_time: float
    message: Optional[str] = None


class GradCAMRequest(BaseModel):
    spectrum: List[float]
    wavelengths: Optional[List[float]] = None
    target_class: Optional[int] = None


class BandContribution(BaseModel):
    index: int
    wavelength: float
    importance: float


class GradCAMResponse(BaseModel):
    success: bool
    predicted_class: int
    class_name: str
    probability: float
    cam: List[float]
    cam_upsampled: List[float]
    top_bands: List[BandContribution]
    most_important_band: BandContribution


class SpectralSearchRequest(BaseModel):
    spectrum: List[float]
    method: str = Field("spectral_angle", description="相似度计算方法")
    top_k: int = Field(5, description="返回结果数量")
    preprocess: bool = Field(True, description="是否进行预处理")


class SpectralMatchResult(BaseModel):
    disease_name: str
    severity: int
    crop_type: str
    description: str
    similarity: float
    method: str
    spectrum: List[float]


class SpectralSearchResponse(BaseModel):
    success: bool
    results: List[SpectralMatchResult]


class VIRequest(BaseModel):
    hypercube_id: Optional[str] = None
    index_names: List[str] = Field(["NDVI", "PRI", "PSRI", "CCCI"], description="要计算的植被指数列表")


class VIResult(BaseModel):
    name: str
    mean: float
    std: float
    min: float
    max: float
    description: str
    values: Optional[List[List[float]]] = None


class VIResponse(BaseModel):
    success: bool
    results: Dict[str, VIResult]


class PrescriptionRequest(BaseModel):
    field_id: str
    severity_map: List[List[float]]
    fertilizer_types: List[str] = Field(["氮肥", "磷肥", "钾肥"])
    base_rate: float = Field(100.0, description="基础施肥量 kg/ha")


class PrescriptionResponse(BaseModel):
    success: bool
    prescription_map: List[List[Dict[str, float]]]
    total_fertilizer: Dict[str, float]
    recommendations: List[str]


class ChangeDetectionRequest(BaseModel):
    hypercube1_id: str
    hypercube2_id: str
    index_name: str = Field("NDVI", description="用于变化检测的植被指数")


class ChangeDetectionResponse(BaseModel):
    success: bool
    index_name: str
    vi_mean_before: float
    vi_mean_after: float
    vi_change: float
    change_magnitude: float
    positive_change_ratio: float
    negative_change_ratio: float
    spread_direction: Dict[str, Any]
    spread_rate: float


class HypercubeUploadResponse(BaseModel):
    success: bool
    file_id: str
    filename: str
    width: int
    height: int
    bands: int
    wavelengths: List[float]
    message: Optional[str] = None


class SmallLesionInfo(BaseModel):
    id: int
    center: List[int]
    area_pixels: int
    area_ratio: float
    mean_severity: float
    max_severity: float
    dominant_class: int
    bbox: List[int]


class DiseaseDistributionResponse(BaseModel):
    success: bool
    distribution: Dict[str, float]
    severity_mean: float
    heatmap: List[List[float]]
    geojson: Optional[Dict[str, Any]] = None
    small_lesions: Optional[List[SmallLesionInfo]] = None


class HistoricalComparisonRequest(BaseModel):
    field_id: str
    start_date: Optional[datetime] = None
    end_date: Optional[datetime] = None
    index_name: str = "NDVI"


class HistoricalComparisonResponse(BaseModel):
    success: bool
    dates: List[str]
    vi_timeseries: List[Dict[str, float]]
    changes: List[Dict[str, Any]]
    overall_trend: float
