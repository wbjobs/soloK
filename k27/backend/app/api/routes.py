from fastapi import APIRouter, HTTPException, BackgroundTasks
from fastapi.responses import FileResponse
import numpy as np
from typing import Dict, List, Optional
from pydantic import BaseModel
import os

from .schemas import (
    VibrationData, CurrentData, TemperatureData,
    DiagnosisRequest, TrendPredictionRequest,
    ReportRequest, ThresholdUpdateRequest
)
from ..services.diagnosis_service import DiagnosisService
from ..services.report_generator import ReportGenerator
from ..core.influxdb import influxdb_manager

router = APIRouter()
diagnosis_service = DiagnosisService(use_digital_twin=True, use_cross_modal=True)
report_generator = ReportGenerator()


class OperatingPointRequest(BaseModel):
    speed_rpm: float = 1500
    load_torque: float = 50
    voltage_a: float = 220
    voltage_b: float = 220
    voltage_c: float = 220
    bearing_temp: float = 45
    winding_temp: float = 75


class DigitalTwinRequest(BaseModel):
    motor_id: str
    vibration_data: Dict
    current_data: Dict
    temperature_data: Optional[Dict] = None


class CrossModalDiagnosisRequest(BaseModel):
    motor_id: str
    vibration_data: Dict
    current_data: Dict
    temperature_data: Dict


class ComprehensiveDiagnosisRequest(BaseModel):
    motor_id: str
    vibration_data: Dict
    current_data: Dict
    temperature_data: Dict
    rotational_freq: float = 25.0
    supply_freq: float = 50.0
    slip: float = 0.02


class FaultSimulationRequest(BaseModel):
    fault_type: str
    severity: float = 0.5
    speed_rpm: float = 1500
    load_torque: float = 50


@router.post("/data/vibration")
async def receive_vibration(data: VibrationData):
    try:
        x = np.array(data.x)
        y = np.array(data.y)
        z = np.array(data.z)
        
        influxdb_manager.write_vibration_data(
            data.motor_id, x, y, z, data.timestamp
        )
        
        return {"status": "success", "message": "振动数据已接收"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/data/current")
async def receive_current(data: CurrentData):
    try:
        a = np.array(data.phase_a)
        b = np.array(data.phase_b)
        c = np.array(data.phase_c)
        
        influxdb_manager.write_current_data(
            data.motor_id, a, b, c, data.timestamp
        )
        
        return {"status": "success", "message": "电流数据已接收"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/data/temperature")
async def receive_temperature(data: TemperatureData):
    try:
        influxdb_manager.write_temperature_data(
            data.motor_id, data.bearing_temp, 
            data.winding_temp, data.timestamp
        )
        
        return {"status": "success", "message": "温度数据已接收"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/diagnose")
async def diagnose(request: DiagnosisRequest):
    try:
        vibration_signal = np.array([])
        if request.vibration_x and request.vibration_y and request.vibration_z:
            x = np.array(request.vibration_x)
            y = np.array(request.vibration_y)
            z = np.array(request.vibration_z)
            vibration_signal = np.sqrt(x ** 2 + y ** 2 + z ** 2)
        
        current_signal = np.array([])
        if request.current_a:
            current_signal = np.array(request.current_a)
        
        result = diagnosis_service.diagnose_fault(vibration_signal, current_signal)
        
        if len(vibration_signal) > 0:
            vib_result = diagnosis_service.process_vibration_signal(
                np.array(request.vibration_x),
                np.array(request.vibration_y),
                np.array(request.vibration_z),
                request.rotational_freq
            )
            result["vibration_analysis"] = {
                "bearing_features": vib_result["bearing_features"],
                "frequencies": vib_result["demodulation"]["frequencies"].tolist(),
                "spectrum": vib_result["demodulation"]["spectrum"].tolist()
            }
        
        if request.current_a and request.current_b and request.current_c:
            cur_result = diagnosis_service.process_current_signal(
                np.array(request.current_a),
                np.array(request.current_b),
                np.array(request.current_c),
                request.supply_freq,
                request.slip
            )
            result["current_analysis"] = {
                "rotor_severity": cur_result["rotor_analysis"]["severity_percentage"],
                "stator_features": cur_result["stator_features"],
                "eccentricity_severity": cur_result["eccentricity_analysis"]["severity_percentage"]
            }
        
        if "vibration_analysis" in result:
            marked_freqs = diagnosis_service.mark_fault_frequencies(
                np.array(result["vibration_analysis"]["frequencies"]),
                np.array(result["vibration_analysis"]["spectrum"]),
                request.rotational_freq,
                request.supply_freq
            )
            result["marked_frequencies"] = marked_freqs
        
        diagnosis_service.update_thresholds(result["features"])
        alerts = diagnosis_service.check_alerts(result["features"])
        result["alerts"] = alerts
        
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/predict-trend")
async def predict_trend(request: TrendPredictionRequest):
    try:
        historical_data = np.array(request.historical_data)
        prediction = diagnosis_service.predict_trend(
            historical_data, request.feature_names
        )
        
        return {
            "motor_id": request.motor_id,
            **prediction
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/thresholds")
async def get_thresholds():
    try:
        thresholds = diagnosis_service.adaptive_threshold.get_all_thresholds()
        return {"thresholds": thresholds}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/thresholds/update")
async def update_thresholds(request: ThresholdUpdateRequest):
    try:
        diagnosis_service.update_thresholds(request.features)
        return {"status": "success", "message": "阈值已更新"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/report/generate")
async def generate_report(request: ReportRequest, background_tasks: BackgroundTasks):
    try:
        signal_data = request.signal_data or {}
        marked_freqs = request.marked_freqs or []
        
        filepath = report_generator.generate_diagnosis_report(
            request.motor_id,
            request.diagnosis_result,
            signal_data,
            marked_freqs,
            request.features,
            request.thresholds
        )
        
        filename = os.path.basename(filepath)
        return {
            "status": "success",
            "report_url": f"/report/download/{filename}",
            "filename": filename
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/report/download/{filename}")
async def download_report(filename: str):
    filepath = os.path.join("./reports", filename)
    if not os.path.exists(filepath):
        raise HTTPException(status_code=404, detail="报告不存在")
    
    return FileResponse(
        filepath,
        media_type="application/pdf",
        filename=filename
    )


@router.get("/fault-frequencies")
async def get_fault_frequencies(rotational_freq: float = 25.0, supply_freq: float = 50.0):
    try:
        diagnosis_service.fault_marker.rotational_freq = rotational_freq
        diagnosis_service.fault_marker.supply_freq = supply_freq
        freqs = diagnosis_service.fault_marker.get_all_fault_frequencies()
        return freqs
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/health")
async def health_check():
    return {"status": "healthy", "service": "异步电机故障诊断系统"}


@router.post("/operating-point/update")
async def update_operating_point(request: OperatingPointRequest):
    try:
        diagnosis_service.update_operating_point(
            speed_rpm=request.speed_rpm,
            load_torque=request.load_torque,
            voltage_a=request.voltage_a,
            voltage_b=request.voltage_b,
            voltage_c=request.voltage_c,
            bearing_temp=request.bearing_temp,
            winding_temp=request.winding_temp
        )
        return {"status": "success", "message": "运行工况已更新"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/digital-twin/compare")
async def digital_twin_compare(request: DigitalTwinRequest):
    try:
        result = diagnosis_service.compare_with_digital_twin(
            request.vibration_data,
            request.current_data,
            request.temperature_data
        )
        return {"motor_id": request.motor_id, **result}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/cross-modal/diagnose")
async def cross_modal_diagnose(request: CrossModalDiagnosisRequest):
    try:
        result = diagnosis_service.diagnose_with_cross_modal(
            request.vibration_data,
            request.current_data,
            request.temperature_data
        )
        return {"motor_id": request.motor_id, **result}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/comprehensive/diagnose")
async def comprehensive_diagnose(request: ComprehensiveDiagnosisRequest):
    try:
        result = diagnosis_service.comprehensive_diagnosis(
            vibration_data=request.vibration_data,
            current_data=request.current_data,
            temperature_data=request.temperature_data,
            rotational_freq=request.rotational_freq,
            supply_freq=request.supply_freq,
            slip=request.slip
        )
        return {"motor_id": request.motor_id, **result}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/simulate/fault")
async def simulate_fault(request: FaultSimulationRequest):
    try:
        result = diagnosis_service.simulate_fault(
            fault_type=request.fault_type,
            severity=request.severity,
            speed_rpm=request.speed_rpm,
            load_torque=request.load_torque
        )
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/digital-twin/healthy-signature")
async def get_healthy_signature(speed_rpm: float = 1500, load_torque: float = 50):
    try:
        diagnosis_service.update_operating_point(speed_rpm=speed_rpm, load_torque=load_torque)
        
        from ..ml.digital_twin import MotorOperatingPoint
        op = MotorOperatingPoint(speed_rpm=speed_rpm, load_torque=load_torque)
        
        signature = diagnosis_service.digital_twin.generate_healthy_signature(op)
        
        return {
            "status": "success",
            "reference_features": signature.get("features", {}),
            "currents_length": len(signature["currents"]["phase_a"]),
            "vibration_length": len(signature["vibration"]["x"])
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
