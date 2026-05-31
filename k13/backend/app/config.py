from pydantic_settings import BaseSettings
from functools import lru_cache


class Settings(BaseSettings):
    app_name: str = "BCI Cockpit"
    redis_url: str = "redis://localhost:6379/0"
    influx_url: str = "http://localhost:8086"
    influx_token: str = "bci-token"
    influx_org: str = "bci"
    influx_bucket: str = "eeg"
    default_srate: int = 500
    default_n_chan: int = 32
    max_chans: int = 64
    waterfall_seconds: float = 10.0
    psd_window: float = 2.0

    class Config:
        env_file = ".env"


@lru_cache()
def get_settings() -> Settings:
    return Settings()
