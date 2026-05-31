from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    app_name: str = "Sonar Detection Platform API"
    debug: bool = False

    database_url: str = "postgresql+psycopg2://sonar_user:sonar_password@localhost:5432/sonar_db"

    minio_endpoint: str = "localhost:9000"
    minio_access_key: str = "minioadmin"
    minio_secret_key: str = "minioadmin"
    minio_bucket_name: str = "sonar-data"
    minio_secure: bool = False

    yolo_model_path: str = "models/best.pt"
    deepsort_model_path: str = "models/mars-small128.pb"

    secret_key: str = "your-secret-key-here"
    algorithm: str = "HS256"
    access_token_expire_minutes: int = 1440

    sonar_speed_of_sound: float = 1500.0
    sonar_scan_angle: float = 60.0

    class Config:
        env_file = ".env"


settings = Settings()
