from pydantic_settings import BaseSettings
from typing import Optional


class Settings(BaseSettings):
    APP_NAME: str = "异步电机故障诊断系统"
    VERSION: str = "1.0.0"
    
    INFLUXDB_URL: str = "http://localhost:8086"
    INFLUXDB_TOKEN: str = "your-token-here"
    INFLUXDB_ORG: str = "motor-diagnosis"
    INFLUXDB_BUCKET: str = "sensor-data"
    
    MODEL_PATH: str = "./models/"
    
    VIBRATION_SAMPLE_RATE: int = 20000
    CURRENT_SAMPLE_RATE: int = 10000
    
    BEARING_FAULT_FREQUENCIES: dict = {
        "inner_race": 5.43,
        "outer_race": 3.57,
        "rolling_element": 2.38,
        "cage": 0.38
    }
    
    class Config:
        env_file = ".env"


settings = Settings()
