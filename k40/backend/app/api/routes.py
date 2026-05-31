import io
import numpy as np
from datetime import datetime, timedelta
from fastapi import APIRouter, HTTPException, Response
from fastapi.responses import StreamingResponse
from typing import Optional

from config import config
from app.models.data_models import (
    ForecastRequest, 
    InjectionWell, 
    RemediationRequest,
    EnKFConfig
)
from app.services.data_generator import data_generator
from app.services.kriging_interpolator import kriging_interpolator
from app.services.plume_forecast import plume_forecaster
from app.services.monitoring_optimization import monitoring_optimizer
from app.services.data_store import data_store
from app.services.remediation_simulator import remediation_simulator
from app.services.enkf_assimilation import enkf_filter

router = APIRouter(prefix="/api", tags=["plume"])

@router.get("/plume_data")
async def get_plume_data(contaminant: str = "TCE", format: str = "binary"):
    try:
        if not data_store.current_sensor_data:
            sensor_data = data_generator.generate_all_sensor_data()
            data_store.update_sensor_data(sensor_data)
            voxel_grid = kriging_interpolator.interpolate_3d(sensor_data, contaminant)
            data_store.update_voxel_grid(voxel_grid)
        
        if format == "binary":
            compressed = data_store.get_compressed_voxel_data()
            return Response(
                content=compressed,
                media_type="application/octet-stream",
                headers={
                    "Content-Disposition": f"attachment; filename=plume_data_{datetime.now().strftime('%Y%m%d%H%M%S')}.bin"
                }
            )
        elif format == "json":
            if data_store.current_voxel_grid:
                return data_store.current_voxel_grid.model_dump()
            else:
                raise HTTPException(status_code=404, detail="No data available")
        else:
            raise HTTPException(status_code=400, detail="Invalid format. Use 'binary' or 'json'")
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/plume_data/csv")
async def get_plume_data_csv(contaminant: str = "TCE"):
    try:
        if not data_store.current_voxel_grid:
            raise HTTPException(status_code=404, detail="No data available")
            
        vg = data_store.current_voxel_grid
        dims = vg.dimensions
        data = np.array(vg.data).reshape(dims)
        
        x_min, x_max = vg.x_min, vg.x_max
        y_min, y_max = vg.y_min, vg.y_max
        z_min, z_max = vg.z_min, vg.z_max
        dx, dy, dz = vg.resolution
        
        output = io.StringIO()
        output.write("x,y,z,concentration\n")
        
        for i in range(dims[0]):
            for j in range(dims[1]):
                for k in range(dims[2]):
                    x = x_min + i * dx
                    y = y_min + j * dy
                    z = z_min + k * dz
                    conc = data[i, j, k]
                    output.write(f"{x:.2f},{y:.2f},{z:.2f},{conc:.4f}\n")
        
        return Response(
            content=output.getvalue(),
            media_type="text/csv",
            headers={
                "Content-Disposition": f"attachment; filename=plume_data_{datetime.now().strftime('%Y%m%d%H%M%S')}.csv"
            }
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/forecast")
async def forecast_plume(request: ForecastRequest):
    try:
        if not data_store.current_voxel_grid:
            sensor_data = data_generator.generate_all_sensor_data()
            data_store.update_sensor_data(sensor_data)
            voxel_grid = kriging_interpolator.interpolate_3d(sensor_data, request.contaminant)
            data_store.update_voxel_grid(voxel_grid)
        
        forecasted_grid = plume_forecaster.forecast(request, data_store.current_voxel_grid)
        
        risk_assessment = kriging_interpolator.compute_risk_assessment(
            forecasted_grid, config.CONTAMINANT_THRESHOLD
        )
        
        return {
            "forecast": forecasted_grid.model_dump(),
            "risk_assessment": risk_assessment.model_dump(),
            "parameters": request.model_dump()
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/wells")
async def get_wells():
    try:
        return data_store.get_well_locations()
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/wells/current")
async def get_current_well_data():
    try:
        if not data_store.current_sensor_data:
            sensor_data = data_generator.generate_all_sensor_data()
            data_store.update_sensor_data(sensor_data)
        return data_store.get_well_current_data()
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/wells/{well_id}")
async def get_well_data(well_id: str, hours: int = 720):
    try:
        trend = data_generator.get_well_trend(well_id, hours)
        if not trend:
            raise HTTPException(status_code=404, detail=f"Well {well_id} not found")
        if 'timestamps' in trend:
            trend['timestamps'] = [ts.isoformat() for ts in trend['timestamps']]
        return trend
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/risk")
async def get_risk_assessment(threshold: Optional[float] = None):
    try:
        if not data_store.current_voxel_grid:
            raise HTTPException(status_code=404, detail="No plume data available")
            
        risk = kriging_interpolator.compute_risk_assessment(
            data_store.current_voxel_grid,
            threshold or config.CONTAMINANT_THRESHOLD
        )
        return risk.model_dump()
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/optimize")
async def optimize_monitoring_network(num_new_wells: int = 5, contaminant: str = "TCE"):
    try:
        if not data_store.current_sensor_data:
            sensor_data = data_generator.generate_all_sensor_data()
            data_store.update_sensor_data(sensor_data)
            
        result = monitoring_optimizer.optimize_network(
            data_store.current_sensor_data,
            num_new_wells,
            contaminant
        )
        return result.model_dump()
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/timeseries")
async def get_time_series(start_days: int = 30, end_days: int = 0, 
                          interval_hours: int = 24, contaminant: str = "TCE"):
    try:
        end_time = datetime.now() - timedelta(days=end_days)
        start_time = end_time - timedelta(days=start_days)
        
        cache_key = f"{start_time.isoformat()}_{end_time.isoformat()}_{interval_hours}_{contaminant}"
        
        if cache_key in data_store.time_series_cache:
            return data_store.time_series_cache[cache_key]
            
        time_points = plume_forecaster.generate_time_series(
            data_store.current_sensor_data,
            start_time,
            end_time,
            interval_hours,
            contaminant
        )
        
        data_store.time_series_cache[cache_key] = time_points
        
        if len(data_store.time_series_cache) > 10:
            data_store.time_series_cache = dict(list(data_store.time_series_cache.items())[-10:])
            
        return time_points
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/sensor_data")
async def receive_sensor_data():
    from fastapi import Request
    try:
        body = await Request.json()
        print(f"Received sensor data: {len(body) if isinstance(body, list) else 1} records")
        return {"status": "received", "count": len(body) if isinstance(body, list) else 1}
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Invalid data format: {str(e)}")

@router.get("/injection_wells")
async def get_injection_wells():
    try:
        return data_store.get_injection_wells()
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/injection_wells")
async def add_injection_well(well: InjectionWell):
    try:
        data_store.add_injection_well(well)
        return {"status": "success", "well_id": well.well_id}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.delete("/injection_wells/{well_id}")
async def delete_injection_well(well_id: str):
    try:
        data_store.remove_injection_well(well_id)
        return {"status": "success"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/injection_wells/clear")
async def clear_injection_wells():
    try:
        data_store.clear_injection_wells()
        return {"status": "success"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/remediation/simulate")
async def simulate_remediation(request: RemediationRequest):
    try:
        if not data_store.current_voxel_grid:
            sensor_data = data_generator.generate_all_sensor_data()
            data_store.update_sensor_data(sensor_data)
            voxel_grid = kriging_interpolator.interpolate_3d(sensor_data, request.contaminant)
            data_store.update_voxel_grid(voxel_grid)
        
        wells_to_use = request.injection_wells or list(data_store.injection_wells.values())
        
        if not wells_to_use:
            raise HTTPException(status_code=400, detail="No injection wells specified")
        
        request.injection_wells = wells_to_use
        
        result = remediation_simulator.simulate_remediation(request, data_store.current_voxel_grid)
        
        return result.model_dump()
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/remediation/reagent_distribution")
async def get_reagent_distribution(days: int = 7):
    try:
        wells = list(data_store.injection_wells.values())
        if not wells:
            return {"status": "no_wells", "distribution": []}
        
        distribution = remediation_simulator.compute_reagent_distribution(wells, days)
        
        return {
            "days": days,
            "distribution": distribution.tolist(),
            "num_wells": len(wells)
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/enkf/assimilate")
async def enkf_assimilate(config: Optional[EnKFConfig] = None):
    try:
        if not data_store.current_sensor_data or not data_store.current_voxel_grid:
            sensor_data = data_generator.generate_all_sensor_data()
            data_store.update_sensor_data(sensor_data)
            voxel_grid = kriging_interpolator.interpolate_3d(sensor_data)
            data_store.update_voxel_grid(voxel_grid)
        
        if config:
            global enkf_filter
            from app.services.enkf_assimilation import EnsembleKalmanFilter
            enkf_filter = EnsembleKalmanFilter(config)
        
        result = enkf_filter.assimilate(
            data_store.current_sensor_data,
            data_store.current_voxel_grid
        )
        
        return result.model_dump()
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/enkf/parameters")
async def get_enkf_parameters():
    try:
        return {
            "current_parameters": enkf_filter.get_current_parameters(),
            "ensemble_size": enkf_filter.ensemble_size
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/enkf/reset")
async def reset_enkf():
    try:
        enkf_filter.reset_ensemble()
        return {"status": "success"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
