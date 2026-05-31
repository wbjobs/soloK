import os
from typing import List, Tuple
from pydantic import BaseModel

class Config(BaseModel):
    SITE_BOUNDS: Tuple[float, float, float, float, float, float] = (0, 100, 0, 100, 0, 20)
    VOXEL_RESOLUTION: Tuple[float, float, float] = (5, 5, 2)
    NUM_MONITORING_WELLS: int = 30
    SENSOR_UPDATE_INTERVAL: int = 3600
    CONTAMINANT_THRESHOLD: float = 5.0
    DEFAULT_CONTAMINANT: str = "TCE"
    
    SOCKETIO_CORS_ORIGINS: List[str] = ["*"]
    API_HOST: str = "0.0.0.0"
    API_PORT: int = 8000
    SOCKETIO_PORT: int = 5000

config = Config()
