from typing import List
from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=True,
    )

    DATABASE_URL: str = Field(..., description="数据库连接URL")
    SECRET_KEY: str = Field(..., description="JWT密钥")
    YOLO_MODEL_PATH: str = Field(..., description="YOLO模型路径")
    VIDEO_UPLOAD_DIR: str = Field(..., description="视频上传目录")

    PROJECT_NAME: str = Field("Video Analysis Backend", description="项目名称")
    VERSION: str = Field("0.1.0", description="版本号")
    API_V1_STR: str = Field("/api/v1", description="API v1前缀")

    HOST: str = Field("0.0.0.0", description="服务监听地址")
    PORT: int = Field(8000, description="服务端口")
    DEBUG: bool = Field(True, description="调试模式")
    WORKERS: int = Field(1, description="工作进程数")

    ALLOWED_ORIGINS: List[str] = Field(
        ["http://localhost:3000", "http://localhost:8080"],
        description="允许的跨域来源",
    )

    ALGORITHM: str = Field("HS256", description="JWT算法")
    ACCESS_TOKEN_EXPIRE_MINUTES: int = Field(30, description="访问令牌过期时间(分钟)")

    LOG_LEVEL: str = Field("INFO", description="日志级别")
    LOG_DIR: str = Field("./logs", description="日志目录")


settings = Settings()
