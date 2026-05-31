from pydantic_settings import BaseSettings
from typing import List


class Settings(BaseSettings):
    DATABASE_URL: str = "postgresql://postgres:password@localhost:5432/ceramic_analysis"
    REDIS_URL: str = "redis://localhost:6379/0"
    APP_HOST: str = "0.0.0.0"
    APP_PORT: int = 8000
    DEBUG: bool = True

    ELEMENTS: List[str] = [
        "Na2O", "MgO", "Al2O3", "SiO2", "P2O5", "K2O",
        "CaO", "TiO2", "MnO", "Fe2O3", "ZrO2", "SrO"
    ]

    RARE_EARTH_ELEMENTS: List[str] = [
        "La", "Ce", "Nd", "Sm", "Eu", "Gd", "Tb", "Yb", "Lu", "Y"
    ]

    ALL_ELEMENTS: List[str] = ELEMENTS + RARE_EARTH_ELEMENTS

    KILN_NAMES: dict = {
        "jingdezhen": "景德镇",
        "longquan": "龙泉窑",
        "cizhou": "磁州窑",
        "yaozhou": "耀州窑",
        "junyao": "钧窑",
        "ruyao": "汝窑",
        "guanyao": "官窑",
        "geyao": "哥窑",
        "dingyao": "定窑",
        "jizhou": "吉州窑",
        "jianyao": "建窑",
        "dehua": "德化窑",
        "shufu": "枢府窑",
        "yixing": "宜兴窑",
        "shiwan": "石湾窑",
        "cangzhou": "沧州窑",
        "henan": "河南窑",
        "shanxi": "山西窑",
        "hunan": "湖南窑",
        "jiangxi": "江西窑"
    }

    CONFIDENCE_THRESHOLD: float = 0.8
    MAX_BATCH_SIZE: int = 100
    YEAR_ERROR_RANGE: int = 50

    class Config:
        env_file = ".env"


settings = Settings()
