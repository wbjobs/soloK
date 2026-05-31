from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from app.config import settings
from app.database import Base, engine
from app.api import upload_router, detect_router, mission_router, report_router
from app.core.logging import logger

Base.metadata.create_all(bind=engine)

app = FastAPI(
    title=settings.app_name,
    description="Underwater Sonar Image Detection and Tracking Platform API",
    version="1.0.0",
    docs_url="/api/docs",
    redoc_url="/api/redoc",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/api/health")
async def health_check():
    return {
        "status": "healthy",
        "app": settings.app_name,
        "version": "1.0.0",
    }


@app.get("/api/info")
async def api_info():
    return {
        "name": settings.app_name,
        "version": "1.0.0",
        "endpoints": {
            "upload": "/api/upload/file",
            "detect": "/api/detect",
            "missions": "/api/missions",
            "report": "/api/report/missions/{id}/pdf",
        },
        "supported_formats": [".xtf", ".sgf"],
        "detection_classes": ["shipwreck", "pipeline", "reef", "fish_school"],
    }


app.include_router(upload_router)
app.include_router(detect_router)
app.include_router(mission_router)
app.include_router(report_router)

logger.info("Sonar Detection Platform API started")
