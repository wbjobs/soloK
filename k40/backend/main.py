import sys
import threading
import uvicorn
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from config import config
from app.api.routes import router as api_router
from app.socketio_server import start_socketio_server, real_time_updater
from app.services.data_generator import data_generator
from app.services.kriging_interpolator import kriging_interpolator
from app.services.data_store import data_store
from datetime import datetime

app = FastAPI(
    title="地下水污染羽流可视化系统 API",
    description="地下水污染羽流实时可视化系统后端API",
    version="1.0.0"
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(api_router)

@app.on_event("startup")
async def startup_event():
    print("Initializing data...")
    sensor_data = data_generator.generate_all_sensor_data(datetime.now(), 0)
    data_store.update_sensor_data(sensor_data)
    
    voxel_grid = kriging_interpolator.interpolate_3d(
        sensor_data, config.DEFAULT_CONTAMINANT
    )
    data_store.update_voxel_grid(voxel_grid)
    print(f"Initialization complete. Generated {len(sensor_data)} sensor records.")
    
    socketio_thread = threading.Thread(target=start_socketio_server, daemon=True)
    socketio_thread.start()
    print(f"Socket.IO server started on port {config.SOCKETIO_PORT}")

@app.on_event("shutdown")
async def shutdown_event():
    real_time_updater.stop()
    print("Shutting down...")

@app.get("/")
async def root():
    return {
        "name": "地下水污染羽流可视化系统",
        "version": "1.0.0",
        "endpoints": {
            "api": "/api",
            "docs": "/docs",
            "socketio": f"http://localhost:{config.SOCKETIO_PORT}"
        }
    }

@app.get("/health")
async def health_check():
    return {
        "status": "healthy",
        "has_data": data_store.current_voxel_grid is not None,
        "num_wells": config.NUM_MONITORING_WELLS,
        "realtime_running": real_time_updater.running
    }

if __name__ == "__main__":
    print(f"Starting server on {config.API_HOST}:{config.API_PORT}")
    uvicorn.run(
        "main:app",
        host=config.API_HOST,
        port=config.API_PORT,
        reload=False,
        log_level="info"
    )
