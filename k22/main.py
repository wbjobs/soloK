from fastapi import FastAPI, HTTPException, Depends
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from typing import List, Optional, Dict, Any
import numpy as np
from sqlalchemy.orm import Session
import hashlib
import json

from config import settings
from database import get_db, IdentificationRecord
from ml_models import ml_model
from redis_cache import cache
from preprocessing import preprocessor
from gmm_mixture import gmm_detector
from cnn_classifier import cnn_classifier, TF_AVAILABLE

app = FastAPI(
    title="古陶瓷成分分析溯源API",
    description="基于X射线荧光(XRF)或中子活化(NAA)成分数据的古陶瓷产地溯源和年代判别系统，支持稀土元素指纹和1D-CNN分类",
    version="2.0.0"
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class CompositionData(BaseModel):
    Na2O: Optional[float] = Field(None, description="氧化钠含量百分比")
    MgO: Optional[float] = Field(None, description="氧化镁含量百分比")
    Al2O3: Optional[float] = Field(None, description="氧化铝含量百分比")
    SiO2: Optional[float] = Field(None, description="二氧化硅含量百分比")
    P2O5: Optional[float] = Field(None, description="五氧化二磷含量百分比")
    K2O: Optional[float] = Field(None, description="氧化钾含量百分比")
    CaO: Optional[float] = Field(None, description="氧化钙含量百分比")
    TiO2: Optional[float] = Field(None, description="二氧化钛含量百分比")
    MnO: Optional[float] = Field(None, description="氧化锰含量百分比")
    Fe2O3: Optional[float] = Field(None, description="三氧化二铁含量百分比")
    ZrO2: Optional[float] = Field(None, description="二氧化锆含量百分比")
    SrO: Optional[float] = Field(None, description="氧化锶含量百分比")
    La: Optional[float] = Field(None, description="镧(稀土元素)含量ppm")
    Ce: Optional[float] = Field(None, description="铈(稀土元素)含量ppm")
    Nd: Optional[float] = Field(None, description="钕(稀土元素)含量ppm")
    Sm: Optional[float] = Field(None, description="钐(稀土元素)含量ppm")
    Eu: Optional[float] = Field(None, description="铕(稀土元素)含量ppm")
    Gd: Optional[float] = Field(None, description="钆(稀土元素)含量ppm")
    Tb: Optional[float] = Field(None, description="铽(稀土元素)含量ppm")
    Yb: Optional[float] = Field(None, description="镱(稀土元素)含量ppm")
    Lu: Optional[float] = Field(None, description="镥(稀土元素)含量ppm")
    Y: Optional[float] = Field(None, description="钇(稀土元素)含量ppm")


class SingleIdentificationRequest(BaseModel):
    sample_id: Optional[str] = Field(None, description="样本编号")
    composition: CompositionData
    preprocess_method: Optional[str] = Field("sum", description="预处理方法: sum(总和归一化), clr(中心对数比), alr(加法对数比)")
    enable_clustering: Optional[bool] = Field(False, description="是否启用聚类分析")
    enable_mixture_detection: Optional[bool] = Field(True, description="是否启用GMM混合检测")
    use_cnn_classifier: Optional[bool] = Field(True, description="是否使用1D-CNN分类器(如果可用)")


class BatchIdentificationRequest(BaseModel):
    samples: List[SingleIdentificationRequest] = Field(..., description="样本列表，最多100个")
    enable_clustering: Optional[bool] = Field(True, description="是否对批量样本进行聚类分析")
    enable_mixture_detection: Optional[bool] = Field(True, description="是否启用GMM混合检测")
    use_cnn_classifier: Optional[bool] = Field(True, description="是否使用1D-CNN分类器(如果可用)")


class MixtureDetectionResult(BaseModel):
    is_mixture: bool
    mixture_score: float
    anomaly_score: float
    top_kilns: List[Dict[str, Any]]
    contributing_kilns: List[Dict[str, Any]]
    analysis: List[str]


class CNNClassificationResult(BaseModel):
    kiln_id: str
    kiln_name: str
    confidence: float
    is_reliable: bool
    model_accuracy: Optional[float]
    top_predictions: List[Dict[str, Any]]


class IdentificationResponse(BaseModel):
    sample_id: Optional[str]
    kiln_id: str
    kiln_name: str
    confidence: float
    is_reliable: bool
    predicted_year: int
    year_min: int
    year_max: int
    pca_scores: List[float]
    preprocessed_composition: Dict[str, float]
    raw_year_prediction: Optional[float] = None
    year_correction: Optional[float] = None
    mixture_detection: Optional[MixtureDetectionResult] = None
    cnn_classification: Optional[CNNClassificationResult] = None


class BatchIdentificationResponse(BaseModel):
    results: List[IdentificationResponse]
    clustering_result: Optional[Dict[str, Any]]


class ReferenceStatsResponse(BaseModel):
    kiln_id: str
    kiln_name: str
    sample_count: int
    element_stats: Dict[str, Dict[str, float]]
    year_stats: Dict[str, Any]


def _composition_to_array(composition: CompositionData) -> np.ndarray:
    values = []
    for elem in settings.ELEMENTS:
        val = getattr(composition, elem)
        values.append(val if val is not None else np.nan)
    return np.array([values])


def _get_cache_key(prefix: str, data: Any) -> str:
    data_str = json.dumps(data, sort_keys=True)
    return f"{prefix}:{hashlib.md5(data_str.encode()).hexdigest()}"


@app.post("/identify", response_model=IdentificationResponse, summary="单样本鉴定")
async def identify_sample(
    request: SingleIdentificationRequest,
    db: Session = Depends(get_db)
):
    cache_key = _get_cache_key("identify", request.dict())
    cached_result = cache.get(cache_key)
    if cached_result:
        return IdentificationResponse(**cached_result)

    X = _composition_to_array(request.composition)
    valid, msg = preprocessor.validate_composition(X)
    if not valid:
        raise HTTPException(status_code=400, detail=msg)

    if not ml_model.is_trained:
        raise HTTPException(status_code=503, detail="Model not trained. Please initialize database first.")

    kiln_results = ml_model.identify_kiln(X)
    year_results = ml_model.predict_year(X)
    pca_scores = ml_model.get_pca_scores(X)

    X_processed = preprocessor.preprocess(X, method=request.preprocess_method)
    preprocessed_comp = {elem: float(X_processed[0, i]) for i, elem in enumerate(settings.ELEMENTS)}

    mixture_result = None
    if request.enable_mixture_detection and gmm_detector.isc_trained:
        comp_dict = request.composition.dict()
        mixture_result = gmm_detector.detect_mixture(comp_dict)

    cnn_result = None
    if request.use_cnn_classifier and TF_AVAILABLE and cnn_classifier is not None and cnn_classifier.is_trained:
        comp_dict = request.composition.dict()
        cnn_result = cnn_classifier.predict(comp_dict)

    if cnn_result and cnn_result["confidence"] > kiln_results[0]["confidence"]:
        final_kiln_id = cnn_result["kiln_id"]
        final_kiln_name = cnn_result["kiln_name"]
        final_confidence = cnn_result["confidence"]
        final_is_reliable = cnn_result["is_reliable"]
    else:
        final_kiln_id = kiln_results[0]["kiln_id"]
        final_kiln_name = kiln_results[0]["kiln_name"]
        final_confidence = kiln_results[0]["confidence"]
        final_is_reliable = kiln_results[0]["is_reliable"]

    result = IdentificationResponse(
        sample_id=request.sample_id,
        kiln_id=final_kiln_id,
        kiln_name=final_kiln_name,
        confidence=final_confidence,
        is_reliable=final_is_reliable,
        predicted_year=year_results[0]["predicted_year"],
        year_min=year_results[0]["year_min"],
        year_max=year_results[0]["year_max"],
        pca_scores=pca_scores[0].tolist(),
        preprocessed_composition=preprocessed_comp,
        raw_year_prediction=year_results[0].get("raw_prediction"),
        year_correction=year_results[0].get("correction_applied"),
        mixture_detection=mixture_result,
        cnn_classification=cnn_result
    )

    try:
        record = IdentificationRecord(
            sample_id=request.sample_id or "unknown",
            predicted_kiln_id=result.kiln_id,
            predicted_kiln_name=result.kiln_name,
            confidence=result.confidence,
            predicted_year=result.predicted_year,
            year_min=result.year_min,
            year_max=result.year_max
        )
        db.add(record)
        db.commit()
    except Exception:
        db.rollback()

    cache.set(cache_key, result.dict(), expire=3600)
    return result


@app.post("/batch_identify", response_model=BatchIdentificationResponse, summary="批量鉴定")
async def batch_identify(
    request: BatchIdentificationRequest,
    db: Session = Depends(get_db)
):
    if len(request.samples) > settings.MAX_BATCH_SIZE:
        raise HTTPException(
            status_code=400,
            detail=f"Maximum batch size is {settings.MAX_BATCH_SIZE} samples"
        )

    cache_key = _get_cache_key("batch_identify", request.dict())
    cached_result = cache.get(cache_key)
    if cached_result:
        return BatchIdentificationResponse(**cached_result)

    if not ml_model.is_trained:
        raise HTTPException(status_code=503, detail="Model not trained. Please initialize database first.")

    X_list = []
    for sample in request.samples:
        X_sample = _composition_to_array(sample.composition)
        X_list.append(X_sample)

    X = np.vstack(X_list)

    kiln_results = ml_model.identify_kiln(X)
    year_results = ml_model.predict_year(X)
    pca_scores = ml_model.get_pca_scores(X)

    results = []
    for i, sample in enumerate(request.samples):
        X_processed = preprocessor.preprocess(X[i:i+1], method=sample.preprocess_method or "sum")
        preprocessed_comp = {elem: float(X_processed[0, j]) for j, elem in enumerate(settings.ELEMENTS)}

        mixture_result = None
        if request.enable_mixture_detection and gmm_detector.isc_trained:
            comp_dict = sample.composition.dict()
            mixture_result = gmm_detector.detect_mixture(comp_dict)

        cnn_result = None
        if request.use_cnn_classifier and TF_AVAILABLE and cnn_classifier is not None and cnn_classifier.is_trained:
            comp_dict = sample.composition.dict()
            cnn_result = cnn_classifier.predict(comp_dict)

        if cnn_result and cnn_result["confidence"] > kiln_results[i]["confidence"]:
            final_kiln_id = cnn_result["kiln_id"]
            final_kiln_name = cnn_result["kiln_name"]
            final_confidence = cnn_result["confidence"]
            final_is_reliable = cnn_result["is_reliable"]
        else:
            final_kiln_id = kiln_results[i]["kiln_id"]
            final_kiln_name = kiln_results[i]["kiln_name"]
            final_confidence = kiln_results[i]["confidence"]
            final_is_reliable = kiln_results[i]["is_reliable"]

        result = IdentificationResponse(
            sample_id=sample.sample_id,
            kiln_id=final_kiln_id,
            kiln_name=final_kiln_name,
            confidence=final_confidence,
            is_reliable=final_is_reliable,
            predicted_year=year_results[i]["predicted_year"],
            year_min=year_results[i]["year_min"],
            year_max=year_results[i]["year_max"],
            pca_scores=pca_scores[i].tolist(),
            preprocessed_composition=preprocessed_comp,
            raw_year_prediction=year_results[i].get("raw_prediction"),
            year_correction=year_results[i].get("correction_applied"),
            mixture_detection=mixture_result,
            cnn_classification=cnn_result
        )
        results.append(result)

        try:
            record = IdentificationRecord(
                sample_id=sample.sample_id or "unknown",
                predicted_kiln_id=result.kiln_id,
                predicted_kiln_name=result.kiln_name,
                confidence=result.confidence,
                predicted_year=result.predicted_year,
                year_min=result.year_min,
                year_max=result.year_max
            )
            db.add(record)
        except Exception:
            pass

    try:
        db.commit()
    except Exception:
        db.rollback()

    clustering_result = None
    if request.enable_clustering and len(request.samples) >= 2:
        clustering_result = ml_model.hierarchical_clustering(X)

    response = BatchIdentificationResponse(
        results=results,
        clustering_result=clustering_result
    )

    cache.set(cache_key, response.dict(), expire=3600)
    return response


@app.get("/reference/{kiln_id}", response_model=ReferenceStatsResponse, summary="查询窑口标准数据统计特征")
async def get_kiln_reference(kiln_id: str):
    cache_key = f"reference:{kiln_id}"
    cached_result = cache.get(cache_key)
    if cached_result:
        return ReferenceStatsResponse(**cached_result)

    stats = ml_model.get_reference_stats(kiln_id)
    if not stats:
        raise HTTPException(status_code=404, detail=f"Kiln '{kiln_id}' not found")

    result = ReferenceStatsResponse(**stats)
    cache.set(cache_key, result.dict(), expire=86400)
    return result


@app.get("/health", summary="健康检查")
async def health_check():
    return {
        "status": "healthy",
        "version": "2.0.0",
        "model_trained": ml_model.is_trained,
        "gmm_trained": gmm_detector.isc_trained,
        "cnn_available": TF_AVAILABLE,
        "cnn_trained": cnn_classifier.is_trained if (TF_AVAILABLE and cnn_classifier is not None) else False,
        "cnn_accuracy": cnn_classifier.accuracy if (TF_AVAILABLE and cnn_classifier is not None and cnn_classifier.is_trained) else None,
        "elements": settings.ELEMENTS,
        "rare_earth_elements": settings.RARE_EARTH_ELEMENTS,
        "available_kilns": list(settings.KILN_NAMES.keys())
    }


@app.get("/kilns", summary="获取所有窑口列表")
async def get_kiln_list():
    return {
        "kilns": [
            {"kiln_id": kid, "kiln_name": kname}
            for kid, kname in settings.KILN_NAMES.items()
        ]
    }


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host=settings.APP_HOST, port=settings.APP_PORT)
