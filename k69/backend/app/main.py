from fastapi import FastAPI, HTTPException, Query, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from datetime import datetime, timedelta
from typing import Optional, List
import pandas as pd
import io
from .database import InfluxDBManager
from .detector import AnomalyDetector
from .realtime import RealTimeDataManager, WebSocketHandler
from .report_generator import ReportGenerator

app = FastAPI(title="地震波形监测API", version="2.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

db_manager = InfluxDBManager()
detector = AnomalyDetector(sigma_threshold=3.0)
realtime_manager = RealTimeDataManager()
websocket_handler = WebSocketHandler(realtime_manager)
report_generator = ReportGenerator()

@app.on_event("startup")
async def startup_event():
    db_manager.connect()
    db_manager.create_bucket()

@app.on_event("shutdown")
async def shutdown_event():
    await realtime_manager.stop_streaming()
    db_manager.close()

@app.get("/api/health")
async def health_check():
    return {
        "status": "healthy",
        "timestamp": datetime.now().isoformat(),
        "version": "2.0.0",
        "algorithms": AnomalyDetector.ALGORITHMS
    }

@app.get("/api/algorithms")
async def get_algorithms():
    return {
        "algorithms": [
            {
                "id": "stl_3sigma",
                "name": "STL分解 + 3-sigma",
                "description": "基于STL时间序列分解，对残差进行3-sigma异常检测",
                "params": ["sigma_threshold", "seasonal_period"]
            },
            {
                "id": "isolation_forest",
                "name": "孤立森林 (Isolation Forest)",
                "description": "基于孤立森林的机器学习异常检测算法",
                "params": ["contamination"]
            },
            {
                "id": "ensemble",
                "name": "集成算法",
                "description": "结合STL+3-sigma和孤立森林两种算法的集成检测",
                "params": ["sigma_threshold", "contamination"]
            }
        ]
    }

@app.websocket("/ws/realtime")
async def websocket_endpoint(websocket: WebSocket):
    await websocket_handler.handle_connection(websocket)

@app.get("/api/realtime/status")
async def get_realtime_status():
    return realtime_manager.get_status()

@app.get("/api/seismic/data")
async def get_seismic_data(
    start_time: str = Query(..., description="开始时间，ISO格式"),
    end_time: str = Query(..., description="结束时间，ISO格式"),
    with_detection: bool = Query(False, description="是否进行异常检测"),
    algorithm: str = Query("stl_3sigma", description="异常检测算法"),
    max_points: int = Query(30000, description="最大返回数据点数", ge=100, le=100000)
):
    try:
        start_dt = datetime.fromisoformat(start_time.replace('Z', '+00:00'))
        end_dt = datetime.fromisoformat(end_time.replace('Z', '+00:00'))
    except ValueError:
        raise HTTPException(status_code=400, detail="无效的时间格式，请使用ISO格式")
    
    if algorithm not in AnomalyDetector.ALGORITHMS:
        raise HTTPException(status_code=400, detail=f"不支持的算法，支持的算法: {AnomalyDetector.ALGORITHMS}")
    
    data, was_truncated = db_manager.query_seismic_data(start_dt, end_dt, max_points)
    
    result = {
        "start_time": start_time,
        "end_time": end_time,
        "total_points": len(data),
        "was_truncated": was_truncated,
        "algorithm": algorithm,
        "data": data,
        "anomalies": []
    }
    
    if with_detection and len(data) > 0:
        df = pd.DataFrame(data)
        df['timestamp'] = pd.to_datetime(df['timestamp'])
        df = df.set_index('timestamp')
        detector.set_algorithm(algorithm)
        _, anomalies = detector.detect_anomalies(df)
        result["anomalies"] = anomalies
        result["anomaly_count"] = len(anomalies)
    
    return result

@app.get("/api/seismic/detect")
async def detect_anomalies(
    start_time: str = Query(..., description="开始时间，ISO格式"),
    end_time: str = Query(..., description="结束时间，ISO格式"),
    algorithm: str = Query("stl_3sigma", description="异常检测算法"),
    sigma_threshold: float = Query(3.0, description="3-sigma阈值", ge=1.0, le=10.0),
    contamination: float = Query(0.01, description="异常比例估计", ge=0.001, le=0.5),
    max_points: int = Query(30000, description="最大分析数据点数", ge=100, le=100000)
):
    try:
        start_dt = datetime.fromisoformat(start_time.replace('Z', '+00:00'))
        end_dt = datetime.fromisoformat(end_time.replace('Z', '+00:00'))
    except ValueError:
        raise HTTPException(status_code=400, detail="无效的时间格式，请使用ISO格式")
    
    if algorithm not in AnomalyDetector.ALGORITHMS:
        raise HTTPException(status_code=400, detail=f"不支持的算法，支持的算法: {AnomalyDetector.ALGORITHMS}")
    
    df, was_truncated = db_manager.query_seismic_data_pandas(start_dt, end_dt, max_points)
    
    if df.empty:
        raise HTTPException(status_code=404, detail="未找到数据")
    
    detector.sigma_threshold = sigma_threshold
    detector.contamination = contamination
    detector.set_algorithm(algorithm)
    
    df_with_anomalies, anomalies = detector.detect_anomalies(df)
    segments = detector.get_anomaly_segments(anomalies)
    
    return {
        "start_time": start_time,
        "end_time": end_time,
        "total_points": len(df),
        "was_truncated": was_truncated,
        "algorithm": algorithm,
        "anomaly_count": len(anomalies),
        "anomalies": anomalies,
        "anomaly_segments": segments
    }

@app.get("/api/seismic/stats/daily")
async def get_daily_stats(
    start_time: str = Query(..., description="开始时间，ISO格式"),
    end_time: str = Query(..., description="结束时间，ISO格式"),
    algorithm: str = Query("stl_3sigma", description="异常检测算法")
):
    try:
        start_dt = datetime.fromisoformat(start_time.replace('Z', '+00:00'))
        end_dt = datetime.fromisoformat(end_time.replace('Z', '+00:00'))
    except ValueError:
        raise HTTPException(status_code=400, detail="无效的时间格式，请使用ISO格式")
    
    if algorithm not in AnomalyDetector.ALGORITHMS:
        raise HTTPException(status_code=400, detail=f"不支持的算法，支持的算法: {AnomalyDetector.ALGORITHMS}")
    
    df, _ = db_manager.query_seismic_data_pandas(start_dt, end_dt, max_points=200000)
    
    if df.empty:
        raise HTTPException(status_code=404, detail="未找到数据")
    
    detector.set_algorithm(algorithm)
    df_with_anomalies, _ = detector.detect_anomalies(df)
    daily_stats = detector.get_daily_anomaly_stats(df_with_anomalies)
    
    return {
        "start_time": start_time,
        "end_time": end_time,
        "algorithm": algorithm,
        "daily_stats": daily_stats
    }

@app.get("/api/seismic/export/csv")
async def export_anomalies_csv(
    start_time: str = Query(..., description="开始时间，ISO格式"),
    end_time: str = Query(..., description="结束时间，ISO格式"),
    algorithm: str = Query("stl_3sigma", description="异常检测算法"),
    anomalies_only: bool = Query(True, description="是否只导出异常数据"),
    max_points: int = Query(200000, description="最大导出数据点数", ge=1000, le=1000000)
):
    try:
        start_dt = datetime.fromisoformat(start_time.replace('Z', '+00:00'))
        end_dt = datetime.fromisoformat(end_time.replace('Z', '+00:00'))
    except ValueError:
        raise HTTPException(status_code=400, detail="无效的时间格式，请使用ISO格式")
    
    if algorithm not in AnomalyDetector.ALGORITHMS:
        raise HTTPException(status_code=400, detail=f"不支持的算法，支持的算法: {AnomalyDetector.ALGORITHMS}")
    
    df, _ = db_manager.query_seismic_data_pandas(start_dt, end_dt, max_points)
    
    if df.empty:
        raise HTTPException(status_code=404, detail="未找到数据")
    
    detector.set_algorithm(algorithm)
    df_with_anomalies, _ = detector.detect_anomalies(df)
    
    if anomalies_only:
        export_df = df_with_anomalies[df_with_anomalies['is_anomaly']].copy()
    else:
        export_df = df_with_anomalies.copy()
    
    export_df = export_df.reset_index()
    
    csv_buffer = io.StringIO()
    export_df.to_csv(csv_buffer, index=False, encoding='utf-8-sig')
    csv_buffer.seek(0)
    
    filename = f"seismic_anomalies_{algorithm}_{datetime.now().strftime('%Y%m%d_%H%M%S')}.csv"
    
    return StreamingResponse(
        iter([csv_buffer.getvalue()]),
        media_type="text/csv",
        headers={
            "Content-Disposition": f"attachment; filename={filename}"
        }
    )

@app.get("/api/seismic/export/segments/csv")
async def export_anomaly_segments_csv(
    start_time: str = Query(..., description="开始时间，ISO格式"),
    end_time: str = Query(..., description="结束时间，ISO格式"),
    algorithm: str = Query("stl_3sigma", description="异常检测算法"),
    max_points: int = Query(200000, description="最大分析数据点数", ge=1000, le=1000000)
):
    try:
        start_dt = datetime.fromisoformat(start_time.replace('Z', '+00:00'))
        end_dt = datetime.fromisoformat(end_time.replace('Z', '+00:00'))
    except ValueError:
        raise HTTPException(status_code=400, detail="无效的时间格式，请使用ISO格式")
    
    if algorithm not in AnomalyDetector.ALGORITHMS:
        raise HTTPException(status_code=400, detail=f"不支持的算法，支持的算法: {AnomalyDetector.ALGORITHMS}")
    
    df, _ = db_manager.query_seismic_data_pandas(start_dt, end_dt, max_points)
    
    if df.empty:
        raise HTTPException(status_code=404, detail="未找到数据")
    
    detector.set_algorithm(algorithm)
    df_with_anomalies, anomalies = detector.detect_anomalies(df)
    segments = detector.get_anomaly_segments(anomalies)
    
    segments_data = []
    for segment in segments:
        segments_data.append({
            "segment_id": len(segments_data) + 1,
            "start_time": segment['start_time'],
            "end_time": segment['end_time'],
            "anomaly_count": segment['anomaly_count'],
            "max_deviation": max(a['deviation'] for a in segment['anomalies']),
            "avg_deviation": sum(a['deviation'] for a in segment['anomalies']) / len(segment['anomalies']),
            "algorithms": ", ".join(segment.get('algorithms', [algorithm]))
        })
    
    export_df = pd.DataFrame(segments_data)
    
    csv_buffer = io.StringIO()
    export_df.to_csv(csv_buffer, index=False, encoding='utf-8-sig')
    csv_buffer.seek(0)
    
    filename = f"anomaly_segments_{algorithm}_{datetime.now().strftime('%Y%m%d_%H%M%S')}.csv"
    
    return StreamingResponse(
        iter([csv_buffer.getvalue()]),
        media_type="text/csv",
        headers={
            "Content-Disposition": f"attachment; filename={filename}"
        }
    )

@app.get("/api/seismic/export/report/pdf")
async def export_pdf_report(
    start_time: str = Query(..., description="开始时间，ISO格式"),
    end_time: str = Query(..., description="结束时间，ISO格式"),
    algorithm: str = Query("stl_3sigma", description="异常检测算法"),
    sigma_threshold: float = Query(3.0, description="3-sigma阈值", ge=1.0, le=10.0),
    contamination: float = Query(0.01, description="异常比例估计", ge=0.001, le=0.5),
    max_points: int = Query(30000, description="最大分析数据点数", ge=100, le=100000)
):
    try:
        start_dt = datetime.fromisoformat(start_time.replace('Z', '+00:00'))
        end_dt = datetime.fromisoformat(end_time.replace('Z', '+00:00'))
    except ValueError:
        raise HTTPException(status_code=400, detail="无效的时间格式，请使用ISO格式")
    
    if algorithm not in AnomalyDetector.ALGORITHMS:
        raise HTTPException(status_code=400, detail=f"不支持的算法，支持的算法: {AnomalyDetector.ALGORITHMS}")
    
    data, _ = db_manager.query_seismic_data(start_dt, end_dt, max_points)
    
    if not data:
        raise HTTPException(status_code=404, detail="未找到数据")
    
    df = pd.DataFrame(data)
    df['timestamp'] = pd.to_datetime(df['timestamp'])
    df = df.set_index('timestamp')
    
    detector.sigma_threshold = sigma_threshold
    detector.contamination = contamination
    detector.set_algorithm(algorithm)
    
    df_with_anomalies, anomalies = detector.detect_anomalies(df)
    segments = detector.get_anomaly_segments(anomalies)
    
    stats_start = start_dt - timedelta(days=7)
    stats_end = end_dt
    stats_df, _ = db_manager.query_seismic_data_pandas(stats_start, stats_end, max_points=200000)
    daily_stats = []
    if not stats_df.empty:
        detector.set_algorithm(algorithm)
        stats_df_with_anomalies, _ = detector.detect_anomalies(stats_df)
        daily_stats = detector.get_daily_anomaly_stats(stats_df_with_anomalies)
    
    pdf_bytes = report_generator.generate_report(
        data=data,
        anomalies=anomalies,
        segments=segments,
        daily_stats=daily_stats,
        start_time=start_time,
        end_time=end_time,
        algorithm=algorithm
    )
    
    filename = f"seismic_report_{algorithm}_{datetime.now().strftime('%Y%m%d_%H%M%S')}.pdf"
    
    return StreamingResponse(
        iter([pdf_bytes]),
        media_type="application/pdf",
        headers={
            "Content-Disposition": f"attachment; filename={filename}"
        }
    )
