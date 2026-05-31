import os
from dotenv import load_dotenv

load_dotenv()

class Settings:
    DATABASE_URL: str = os.getenv("DATABASE_URL", "postgresql://postgres:password@localhost:5432/inpainting_db")
    MODEL_ID: str = os.getenv("MODEL_ID", "runwayml/stable-diffusion-inpainting")
    DEVICE: str = os.getenv("DEVICE", "cuda")
    USE_FP16: bool = os.getenv("USE_FP16", "true").lower() == "true"
    HOST: str = os.getenv("HOST", "0.0.0.0")
    PORT: int = int(os.getenv("PORT", 8000))
    
    BASE_DIR: str = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    UPLOAD_DIR: str = os.path.join(BASE_DIR, os.getenv("UPLOAD_DIR", "uploads"))
    GENERATED_DIR: str = os.path.join(BASE_DIR, os.getenv("GENERATED_DIR", "generated"))
    MASK_DIR: str = os.path.join(BASE_DIR, os.getenv("MASK_DIR", "masks"))
    REFERENCE_DIR: str = os.path.join(BASE_DIR, os.getenv("REFERENCE_DIR", "reference"))
    
    IP_ADAPTER_ID: str = os.getenv("IP_ADAPTER_ID", "h94/IP-Adapter-FaceID")
    USE_IP_ADAPTER: bool = os.getenv("USE_IP_ADAPTER", "false").lower() == "true"
    
    @classmethod
    def create_dirs(cls):
        for dir_path in [cls.UPLOAD_DIR, cls.GENERATED_DIR, cls.MASK_DIR, cls.REFERENCE_DIR]:
            os.makedirs(dir_path, exist_ok=True)

settings = Settings()
