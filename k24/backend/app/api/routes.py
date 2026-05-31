from fastapi import APIRouter, UploadFile, File, HTTPException, Depends
from fastapi.responses import JSONResponse
from pydantic import BaseModel
import numpy as np
import uuid
import time
from typing import Optional, List, Dict, Any
import io

from ..schemas.spectral import (
    SpectrumInput,
    ClassificationResponse,
    ClassificationResult,
    GradCAMRequest,
    GradCAMResponse,
    BandContribution,
    SpectralSearchRequest,
    SpectralSearchResponse,
    SpectralMatchResult,
    VIRequest,
    VIResponse,
    VIResult,
    PrescriptionRequest,
    PrescriptionResponse,
    ChangeDetectionRequest,
    ChangeDetectionResponse,
    HypercubeUploadResponse,
    DiseaseDistributionResponse,
    HistoricalComparisonRequest,
    HistoricalComparisonResponse
)
from ..services.spectral_preprocessing import SpectralPreprocessor
from ..services.spectral_library import SpectralLibrary
from ..services.vegetation_indices import VegetationIndexCalculator, ChangeDetector
from ..services.grad_cam import SpectralGradCAMAnalyzer
from ..services.hypercube_handler import HypercubeHandler
from ..services.multisource_fusion import MultiSourceAnalysisService
from ..models.disease_model import DiseaseClassifier

router = APIRouter()

classifier = DiseaseClassifier(num_bands=150)
preprocessor = SpectralPreprocessor()
spectral_library = SpectralLibrary()
hypercube_handler = HypercubeHandler()
multisource_service = MultiSourceAnalysisService()


@router.post("/classify", response_model=ClassificationResponse)
async def classify_spectrum(request: SpectrumInput):
    start_time = time.time()
    
    try:
        spectrum = np.array(request.spectrum)
        
        if request.preprocess:
            spectrum = preprocessor.full_preprocessing_pipeline(spectrum)
        
        if len(spectrum) != 150:
            spectrum = preprocessor.resample_spectrum(
                spectrum,
                np.linspace(400, 1000, len(spectrum)),
                np.linspace(400, 1000, 150)
            )
        
        predictions, probabilities, severity = classifier.predict(spectrum)
        
        results = []
        for i, (pred, prob, sev) in enumerate(zip(predictions, probabilities, severity)):
            results.append(ClassificationResult(
                class_id=int(pred),
                class_name=classifier.class_names[int(pred)],
                confidence=float(prob[int(pred)]),
                severity=int(sev) if sev is not None else None,
                probabilities=prob.tolist()
            ))
        
        processing_time = time.time() - start_time
        
        return ClassificationResponse(
            success=True,
            results=results,
            processing_time=processing_time,
            message="分类完成"
        )
    
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/grad-cam", response_model=GradCAMResponse)
async def grad_cam_analysis(request: GradCAMRequest):
    try:
        spectrum = np.array(request.spectrum)
        wavelengths = np.array(request.wavelengths) if request.wavelengths else None
        
        processed_spectrum = preprocessor.full_preprocessing_pipeline(spectrum)
        
        if len(processed_spectrum) != 150:
            processed_spectrum = preprocessor.resample_spectrum(
                processed_spectrum,
                np.linspace(400, 1000, len(processed_spectrum)),
                np.linspace(400, 1000, 150)
            )
        
        analyzer = SpectralGradCAMAnalyzer(classifier)
        
        if wavelengths is None:
            wavelengths = np.linspace(400, 1000, len(spectrum))
        
        result = analyzer.analyze_spectrum(
            processed_spectrum,
            target_class=request.target_class,
            wavelengths=wavelengths
        )
        
        return GradCAMResponse(
            success=True,
            predicted_class=result['predicted_class'],
            class_name=result['class_name'],
            probability=result['probability'],
            cam=result['cam'],
            cam_upsampled=result['cam_upsampled'],
            top_bands=[
                BandContribution(**band)
                for band in result['top_bands']
            ],
            most_important_band=BandContribution(**result['most_important_band'])
        )
    
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/spectral-search", response_model=SpectralSearchResponse)
async def spectral_search(request: SpectralSearchRequest):
    try:
        spectrum = np.array(request.spectrum)
        
        results = spectral_library.search(
            spectrum,
            method=request.method,
            top_k=request.top_k,
            preprocess=request.preprocess
        )
        
        return SpectralSearchResponse(
            success=True,
            results=[
                SpectralMatchResult(**r)
                for r in results
            ]
        )
    
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/spectral-library/diseases")
async def get_disease_list():
    try:
        diseases = spectral_library.get_all_diseases()
        return {
            "success": True,
            "diseases": diseases
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/spectral-library/signature/{disease_name}")
async def get_disease_signature(disease_name: str):
    try:
        signature = spectral_library.get_disease_signature(disease_name)
        if signature is None:
            raise HTTPException(status_code=404, detail="Disease not found")
        return {
            "success": True,
            "signature": signature
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/upload-hypercube", response_model=HypercubeUploadResponse)
async def upload_hypercube(
    hdr_file: UploadFile = File(...),
    dat_file: Optional[UploadFile] = File(None)
):
    try:
        file_id = str(uuid.uuid4())
        
        import tempfile
        import os
        
        with tempfile.NamedTemporaryFile(delete=False, suffix='.hdr') as tmp_hdr:
            tmp_hdr.write(await hdr_file.read())
            tmp_hdr_path = tmp_hdr.name
        
        try:
            hypercube, wavelengths = hypercube_handler.load_envi_file(tmp_hdr_path)
        finally:
            os.unlink(tmp_hdr_path)
        
        hypercube_handler.save_hypercube(hypercube, wavelengths, file_id)
        
        return HypercubeUploadResponse(
            success=True,
            file_id=file_id,
            filename=hdr_file.filename,
            width=hypercube.shape[1],
            height=hypercube.shape[0],
            bands=hypercube.shape[2],
            wavelengths=wavelengths.tolist(),
            message="高光谱数据上传成功"
        )
    
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/calculate-vi", response_model=VIResponse)
async def calculate_vegetation_indices(request: VIRequest):
    try:
        if request.hypercube_id:
            hypercube_data = hypercube_handler.get_hypercube(request.hypercube_id)
            if hypercube_data is None:
                raise HTTPException(status_code=404, detail="Hypercube not found")
            hypercube, wavelengths = hypercube_data
        else:
            raise HTTPException(status_code=400, detail="hypercube_id is required")
        
        vi_calculator = VegetationIndexCalculator(wavelengths)
        all_vi = vi_calculator.calculate_all(hypercube)
        
        results = {}
        for name, vi_result in all_vi.items():
            if name in request.index_names:
                results[name] = VIResult(
                    name=vi_result.name,
                    mean=vi_result.mean,
                    std=vi_result.std,
                    min=vi_result.min,
                    max=vi_result.max,
                    description=vi_result.description,
                    values=vi_result.values.tolist()
                )
        
        return VIResponse(
            success=True,
            results=results
        )
    
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/prescription", response_model=PrescriptionResponse)
async def generate_prescription(request: PrescriptionRequest):
    try:
        severity_map = np.array(request.severity_map)
        
        prescription, totals = hypercube_handler.generate_prescription_map(
            severity_map,
            base_rate=request.base_rate,
            fertilizer_types=request.fertilizer_types
        )
        
        prescription_map = []
        for i in range(prescription.shape[0]):
            row = []
            for j in range(prescription.shape[1]):
                pixel = {}
                for k, fert in enumerate(request.fertilizer_types):
                    pixel[fert] = float(prescription[i, j, k])
                row.append(pixel)
            prescription_map.append(row)
        
        recommendations = [
            "根据病害严重程度调整施肥量",
            "建议分区域施肥以提高效率",
            "重点关注高严重度区域的营养补充"
        ]
        
        return PrescriptionResponse(
            success=True,
            prescription_map=prescription_map,
            total_fertilizer=totals,
            recommendations=recommendations
        )
    
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/change-detection", response_model=ChangeDetectionResponse)
async def detect_changes(request: ChangeDetectionRequest):
    try:
        cube1_data = hypercube_handler.get_hypercube(request.hypercube1_id)
        cube2_data = hypercube_handler.get_hypercube(request.hypercube2_id)
        
        if cube1_data is None or cube2_data is None:
            raise HTTPException(status_code=404, detail="Hypercube not found")
        
        cube1, wavelengths1 = cube1_data
        cube2, wavelengths2 = cube2_data
        
        change_detector = ChangeDetector(wavelengths1)
        result = change_detector.detect_changes(
            cube1, cube2, index_name=request.index_name
        )
        
        return ChangeDetectionResponse(
            success=True,
            index_name=result['index_name'],
            vi_mean_before=result['vi_mean_before'],
            vi_mean_after=result['vi_mean_after'],
            vi_change=result['vi_change'],
            change_magnitude=result['change_magnitude'],
            positive_change_ratio=result['positive_change_ratio'],
            negative_change_ratio=result['negative_change_ratio'],
            spread_direction=result['spread_direction'],
            spread_rate=result['spread_rate']
        )
    
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/disease-distribution/{hypercube_id}", response_model=DiseaseDistributionResponse)
async def get_disease_distribution(hypercube_id: str):
    try:
        hypercube_data = hypercube_handler.get_hypercube(hypercube_id)
        if hypercube_data is None:
            raise HTTPException(status_code=404, detail="Hypercube not found")
        
        hypercube, wavelengths = hypercube_data
        
        processed_hypercube = preprocessor.process_hypercube(hypercube)
        
        predictions, probabilities, severity = classifier.predict_hypercube(processed_hypercube)
        
        unique, counts = np.unique(predictions, return_counts=True)
        total = predictions.size
        distribution = {
            classifier.class_names[int(cls)]: float(count / total)
            for cls, count in zip(unique, counts)
        }
        
        severity_mean = float(np.mean(severity))
        
        enhanced_severity, small_lesions = hypercube_handler.generate_enhanced_heatmap(
            predictions, severity
        )
        
        heatmap = enhanced_severity.tolist()
        
        geojson = hypercube_handler.generate_geojson(
            predictions, enhanced_severity, classifier.class_names
        )
        
        return DiseaseDistributionResponse(
            success=True,
            distribution=distribution,
            severity_mean=severity_mean,
            heatmap=heatmap,
            geojson=geojson,
            small_lesions=small_lesions
        )
    
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/spectrum/{hypercube_id}")
async def get_mean_spectrum(hypercube_id: str):
    try:
        hypercube_data = hypercube_handler.get_hypercube(hypercube_id)
        if hypercube_data is None:
            raise HTTPException(status_code=404, detail="Hypercube not found")
        
        hypercube, wavelengths = hypercube_data
        mean_spec, std_spec = hypercube_handler.get_mean_spectrum(hypercube)
        
        return {
            "success": True,
            "wavelengths": wavelengths.tolist(),
            "mean_spectrum": mean_spec.tolist(),
            "std_spectrum": std_spec.tolist()
        }
    
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/rgb-preview/{hypercube_id}")
async def get_rgb_preview(hypercube_id: str):
    try:
        hypercube_data = hypercube_handler.get_hypercube(hypercube_id)
        if hypercube_data is None:
            raise HTTPException(status_code=404, detail="Hypercube not found")
        
        hypercube, wavelengths = hypercube_data
        rgb = hypercube_handler.get_rgb_preview(hypercube, wavelengths)
        
        import base64
        from PIL import Image
        
        img = Image.fromarray(rgb)
        buffered = io.BytesIO()
        img.save(buffered, format="PNG")
        img_str = base64.b64encode(buffered.getvalue()).decode()
        
        return {
            "success": True,
            "rgb_preview": f"data:image/png;base64,{img_str}",
            "width": rgb.shape[1],
            "height": rgb.shape[0]
        }
    
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


class TemporalForecastRequest(BaseModel):
    temporal_spectra: List[List[float]]
    current_disease_map: Optional[List[List[float]]] = None
    field_size: Optional[List[int]] = [100, 100]
    growth_stages: Optional[List[str]] = None


@router.post("/forecast/temporal")
async def forecast_temporal(request: TemporalForecastRequest):
    try:
        result = multisource_service.analyze_temporal_forecast(
            temporal_spectra=request.temporal_spectra,
            current_disease_map=request.current_disease_map,
            field_size=tuple(request.field_size) if request.field_size else (100, 100),
            growth_stages=request.growth_stages
        )
        
        return {
            "success": True,
            **result
        }
    
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


class WeatherAnalysisRequest(BaseModel):
    temperature: float
    humidity: float
    rainfall: float
    disease_type: Optional[str] = None
    forecast_days: Optional[int] = 7


@router.post("/analyze/weather")
async def analyze_weather(request: WeatherAnalysisRequest):
    try:
        result = multisource_service.analyze_weather_impact(
            temperature=request.temperature,
            humidity=request.humidity,
            rainfall=request.rainfall,
            disease_type=request.disease_type,
            forecast_days=request.forecast_days or 7
        )
        
        return {
            "success": True,
            **result
        }
    
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


class SoilAnalysisRequest(BaseModel):
    ph: float
    organic_matter: float
    nitrogen: Optional[float] = None
    phosphorus: Optional[float] = None
    potassium: Optional[float] = None
    field_history: Optional[str] = None


@router.post("/analyze/soil")
async def analyze_soil(request: SoilAnalysisRequest):
    try:
        result = multisource_service.analyze_soil_susceptibility(
            ph=request.ph,
            organic_matter=request.organic_matter,
            nitrogen=request.nitrogen,
            phosphorus=request.phosphorus,
            potassium=request.potassium,
            field_history=request.field_history
        )
        
        return {
            "success": True,
            **result
        }
    
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


class FieldData(BaseModel):
    id: Optional[str] = None
    name: Optional[str] = None
    disease_severity: Optional[float] = 0
    ndvi: Optional[float] = 0.5
    pri: Optional[float] = 0.5
    area: Optional[float] = 1.0
    weather: Optional[Dict[str, float]] = None
    soil: Optional[Dict[str, float]] = None


class TransmissionAnalysisRequest(BaseModel):
    fields: List[FieldData]
    distances: Optional[List[List[float]]] = None
    wind_direction: Optional[float] = 0.0
    wind_speed: Optional[float] = 5.0


@router.post("/analyze/transmission")
async def analyze_transmission(request: TransmissionAnalysisRequest):
    try:
        fields_data = [f.dict() for f in request.fields]
        
        result = multisource_service.analyze_field_transmission(
            fields=fields_data,
            distances=request.distances,
            wind_direction=request.wind_direction or 0.0,
            wind_speed=request.wind_speed or 5.0
        )
        
        return {
            "success": True,
            **result
        }
    
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


class IntegratedRiskRequest(BaseModel):
    spectral_prediction: Dict[str, Any]
    weather_data: Dict[str, float]
    soil_data: Dict[str, float]
    field_data: Optional[Dict[str, Any]] = None
    historical_trend: Optional[float] = None


@router.post("/analyze/integrated-risk")
async def analyze_integrated_risk(request: IntegratedRiskRequest):
    try:
        result = multisource_service.integrated_risk_assessment(
            spectral_prediction=request.spectral_prediction,
            weather_data=request.weather_data,
            soil_data=request.soil_data,
            field_data=request.field_data,
            historical_trend=request.historical_trend
        )
        
        return {
            "success": True,
            **result
        }
    
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
