from fastapi import APIRouter

from app.core.config import settings
from app.api.routes import (
    auth_router,
    matches_router,
    tracking_router,
    events_router,
    analysis_router,
    export_router,
    live_router,
)

api_router = APIRouter()

api_router.include_router(auth_router)
api_router.include_router(matches_router)
api_router.include_router(tracking_router)
api_router.include_router(events_router)
api_router.include_router(analysis_router)
api_router.include_router(export_router)
api_router.include_router(live_router)


@api_router.get("/")
async def root():
    return {
        "message": f"Welcome to {settings.PROJECT_NAME} API",
        "version": settings.VERSION,
        "docs": "/docs",
    }
