from app.api.routes.auth import router as auth_router
from app.api.routes.matches import router as matches_router
from app.api.routes.tracking import router as tracking_router
from app.api.routes.events import router as events_router
from app.api.routes.analysis import router as analysis_router
from app.api.routes.export import router as export_router
from app.api.routes.live import router as live_router

__all__ = [
    "auth_router",
    "matches_router",
    "tracking_router",
    "events_router",
    "analysis_router",
    "export_router",
    "live_router",
]
