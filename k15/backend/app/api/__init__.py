from app.api.upload import router as upload_router
from app.api.detect import router as detect_router
from app.api.mission import router as mission_router
from app.api.report import router as report_router

__all__ = [
    "upload_router",
    "detect_router",
    "mission_router",
    "report_router",
]
