from fastapi import APIRouter, HTTPException, BackgroundTasks, Depends
from typing import Dict, Any
from .schemas import (
    LinkBudgetRequest, LinkBudgetResponse,
    InterferenceRequest, InterferenceResponse,
    BeamCoverageRequest,
    FrequencyCoordinationRequest, FrequencyCoordinationResponse,
    MonteCarloRequest, MonteCarloResponse,
    ModulationRecommendationRequest, ModulationRecommendationResponse,
    ACMSimulationRequest, ACMSimulationResponse,
    InterferenceLocalizationRequest, InterferenceLocalizationResponse
)
from .core.link_budget import compute_link_budget
from .core.interference import compute_interference
from .core.beam_coverage import generate_beam_coverage
from .core.frequency_coordination import coordinate_frequencies
from .core.monte_carlo import run_monte_carlo_simulation
from .core.modulation_adaptation import (
    recommend_modulation, get_available_schemes,
    simulate_acm, generate_margin_series
)
from .core.interference_localization import (
    triangulate_rssi, triangulate_aoa, hybrid_localization,
    generate_localization_geojson
)
from .cache import cache
from .workers import run_monte_carlo_task
import time

router = APIRouter()


@router.post("/link_budget", response_model=LinkBudgetResponse)
async def calculate_link_budget(request: LinkBudgetRequest):
    params = request.model_dump()

    cached_result = cache.get("link_budget", params)
    if cached_result:
        return LinkBudgetResponse(**cached_result)

    try:
        result = compute_link_budget(**params)
        cache.set("link_budget", params, result)
        return LinkBudgetResponse(**result)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"计算错误: {str(e)}")


@router.post("/interference", response_model=InterferenceResponse)
async def calculate_interference(request: InterferenceRequest):
    params = request.model_dump()

    cached_result = cache.get("interference", params)
    if cached_result:
        return InterferenceResponse(**cached_result)

    try:
        result = compute_interference(**params)
        cache.set("interference", params, result)
        return InterferenceResponse(**result)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"计算错误: {str(e)}")


@router.post("/beam_coverage")
async def calculate_beam_coverage(request: BeamCoverageRequest, background_tasks: BackgroundTasks):
    params = request.model_dump()

    cached_result = cache.get("beam_coverage", params)
    if cached_result:
        return cached_result

    try:
        start_time = time.time()
        result = generate_beam_coverage(**params)
        elapsed = time.time() - start_time

        if elapsed > 30:
            task = run_monte_carlo_task.apply_async(args=[params])
            return {"task_id": task.id, "status": "processing"}

        cache.set("beam_coverage", params, result)
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"计算错误: {str(e)}")


@router.post("/frequency_coordination", response_model=FrequencyCoordinationResponse)
async def calculate_frequency_coordination(request: FrequencyCoordinationRequest):
    params = request.model_dump()

    cached_result = cache.get("frequency_coordination", params)
    if cached_result:
        return FrequencyCoordinationResponse(**cached_result)

    try:
        result = coordinate_frequencies(**params)
        cache.set("frequency_coordination", params, result)
        return FrequencyCoordinationResponse(**result)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"计算错误: {str(e)}")


@router.post("/monte_carlo", response_model=MonteCarloResponse)
async def run_monte_carlo(request: MonteCarloRequest, background_tasks: BackgroundTasks):
    params = request.model_dump()
    iterations = params.pop("iterations")
    params_for_simulation = {"iterations": iterations, **params}

    cached_result = cache.get("monte_carlo", params_for_simulation)
    if cached_result:
        return MonteCarloResponse(status="completed", **cached_result)

    if iterations > 2000:
        task = run_monte_carlo_task.apply_async(args=[params_for_simulation])
        return MonteCarloResponse(task_id=task.id, status="queued")

    try:
        start_time = time.time()
        result = run_monte_carlo_simulation(**params_for_simulation)
        elapsed = time.time() - start_time

        if elapsed > 30:
            task = run_monte_carlo_task.apply_async(args=[params_for_simulation])
            return MonteCarloResponse(task_id=task.id, status="queued")

        cache.set("monte_carlo", params_for_simulation, result)
        return MonteCarloResponse(status="completed", **result)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"仿真错误: {str(e)}")


@router.get("/task/{task_id}")
async def get_task_status(task_id: str):
    from celery.result import AsyncResult
    from .workers import celery

    result = AsyncResult(task_id, app=celery)

    if result.ready():
        if result.successful():
            return {"task_id": task_id, "status": "completed", "result": result.result}
        else:
            return {"task_id": task_id, "status": "failed", "error": str(result.result)}
    else:
        return {"task_id": task_id, "status": "processing"}


@router.post("/modulation_recommendation", response_model=ModulationRecommendationResponse)
async def get_modulation_recommendation(request: ModulationRecommendationRequest):
    params = request.model_dump()

    cached_result = cache.get("modulation_recommendation", params)
    if cached_result:
        return ModulationRecommendationResponse(**cached_result)

    try:
        recommendation = recommend_modulation(**params)
        available = get_available_schemes(params["link_margin"], params.get("margin_backoff", 1.0))
        result = {**recommendation, "available_schemes": available}
        cache.set("modulation_recommendation", params, result)
        return ModulationRecommendationResponse(**result)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"推荐计算错误: {str(e)}")


@router.post("/acm_simulation", response_model=ACMSimulationResponse)
async def run_acm_simulation(request: ACMSimulationRequest):
    params = request.model_dump()

    cached_result = cache.get("acm_simulation", params)
    if cached_result:
        return ACMSimulationResponse(**cached_result)

    try:
        margin_series = generate_margin_series(
            duration=params["duration"],
            mean_margin=params["mean_margin"],
            std_margin=params["std_margin"],
            fade_depth=params["fade_depth"],
            fade_duration=params["fade_duration"],
            fade_interval=params["fade_interval"]
        )

        result = simulate_acm(
            margin_series=margin_series,
            bandwidth=params["bandwidth"],
            margin_backoff=params["margin_backoff"],
            switch_hysteresis=params["switch_hysteresis"]
        )

        cache.set("acm_simulation", params, result)
        return ACMSimulationResponse(**result)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"ACM仿真错误: {str(e)}")


@router.post("/interference_localization", response_model=InterferenceLocalizationResponse)
async def localize_interference(request: InterferenceLocalizationRequest):
    params = request.model_dump()

    cached_result = cache.get("interference_localization", params)
    if cached_result:
        return InterferenceLocalizationResponse(**cached_result)

    try:
        stations = params["stations"]
        receiver_positions = [(s["latitude"], s["longitude"]) for s in stations]
        rssi_values = [s["rssi"] for s in stations]
        aoa_values = [s["aoa"] for s in stations]

        method = params.get("method", "hybrid")

        if method == "rssi":
            location = triangulate_rssi(
                receiver_positions, rssi_values,
                params["frequency"], params.get("tx_power", 20.0)
            )
        elif method == "aoa":
            location = triangulate_aoa(receiver_positions, aoa_values)
        else:
            location = hybrid_localization(
                receiver_positions, rssi_values, aoa_values,
                params["frequency"], params.get("tx_power", 20.0),
                params.get("rssi_weight", 0.4), params.get("aoa_weight", 0.6)
            )

        if not location.get("valid"):
            raise HTTPException(status_code=400, detail=location.get("error", "定位失败"))

        geojson_data = generate_localization_geojson(location, receiver_positions)

        result = {
            "latitude": location["latitude"],
            "longitude": location["longitude"],
            "confidence_radius_km": location["confidence_radius_km"],
            "method": location["method"],
            "geojson": geojson_data,
            "rssi_result": location.get("rssi_result"),
            "aoa_result": location.get("aoa_result")
        }

        cache.set("interference_localization", params, result)
        return InterferenceLocalizationResponse(**result)
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"定位错误: {str(e)}")
