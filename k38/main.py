from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from typing import List, Optional
from datetime import datetime
import numpy as np

from models import (
    FaultRecordData, FaultAnalysisResult,
    HistoryQuery, HistoryRecord, ReanalysisRequest
)
from fault_analyzer import FaultAnalyzer
from visualization import generate_fault_waveform
from history_manager import HistoryManager

app = FastAPI(
    title="配电网单相接地故障选线API服务",
    description="基于多种选线算法和智能投票机制的配电网单相接地故障选线系统",
    version="1.0.0"
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

fault_analyzer = FaultAnalyzer()
history_manager = HistoryManager()


@app.get("/")
async def root():
    return {
        "service": "配电网单相接地故障选线API服务",
        "version": "1.0.0",
        "status": "running",
        "algorithms": [
            "稳态分量法（基波零序电流比幅比相）",
            "暂态分量法（首半波极性和小波变换模极大值）",
            "五次谐波法",
            "注入信号法（220Hz）"
        ]
    }


@app.post("/api/analyze", response_model=FaultAnalysisResult)
async def analyze_fault(record_data: FaultRecordData, 
                       save_history: bool = Query(True, description="是否保存到历史记录"),
                       generate_waveform: bool = Query(True, description="是否生成波形图")):
    try:
        result = fault_analyzer.analyze(record_data)
        
        if generate_waveform:
            zero_seq_voltage = np.array(record_data.zero_sequence_voltage)
            waveform_b64 = generate_fault_waveform(
                zero_seq_voltage,
                record_data.feeders,
                result.fault_start_sample,
                result.fault_feeder_id,
                record_data.sampling_rate,
                record_data.power_frequency
            )
            result.waveform_base64 = waveform_b64
        
        if save_history:
            parameters = {
                "sampling_rate": record_data.sampling_rate,
                "power_frequency": record_data.power_frequency,
                "num_feeders": len(record_data.feeders),
                "bus_fault_threshold": fault_analyzer.voting.bus_fault_threshold,
                "resistance_threshold": fault_analyzer.resistance_threshold
            }
            history_manager.save_record(record_data, result, parameters)
        
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"故障分析失败: {str(e)}")


@app.post("/api/history/query", response_model=List[HistoryRecord])
async def query_history(query: HistoryQuery):
    try:
        return history_manager.query_records(query)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"查询历史记录失败: {str(e)}")


@app.get("/api/history/{record_id}")
async def get_history_record(record_id: str):
    record = history_manager.get_record(record_id)
    if record is None:
        raise HTTPException(status_code=404, detail="记录不存在")
    return record


@app.delete("/api/history/{record_id}")
async def delete_history_record(record_id: str):
    success = history_manager.delete_record(record_id)
    if not success:
        raise HTTPException(status_code=404, detail="记录不存在")
    return {"status": "success", "message": "记录已删除"}


@app.get("/api/statistics")
async def get_statistics():
    try:
        return history_manager.get_statistics()
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"获取统计信息失败: {str(e)}")


@app.post("/api/reanalyze")
async def reanalyze_record(request: ReanalysisRequest):
    record = history_manager.get_record(request.record_id)
    if record is None:
        raise HTTPException(status_code=404, detail="记录不存在")
    
    try:
        record_data = FaultRecordData(**record["record_data"])
        
        if request.parameter_overrides:
            if "bus_fault_threshold" in request.parameter_overrides:
                fault_analyzer.voting.bus_fault_threshold = request.parameter_overrides["bus_fault_threshold"]
            if "resistance_threshold" in request.parameter_overrides:
                fault_analyzer.resistance_threshold = request.parameter_overrides["resistance_threshold"]
        
        result = fault_analyzer.analyze(record_data)
        
        zero_seq_voltage = np.array(record_data.zero_sequence_voltage)
        waveform_b64 = generate_fault_waveform(
            zero_seq_voltage,
            record_data.feeders,
            result.fault_start_sample,
            result.fault_feeder_id,
            record_data.sampling_rate,
            record_data.power_frequency
        )
        result.waveform_base64 = waveform_b64
        
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"重分析失败: {str(e)}")


@app.get("/api/health")
async def health_check():
    return {"status": "healthy", "timestamp": datetime.now().isoformat()}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
