from celery import Celery
from .config import get_settings
from .core.monte_carlo import run_monte_carlo_simulation
import json

settings = get_settings()

celery = Celery(
    "satellite_tasks",
    broker=settings.CELERY_BROKER_URL,
    backend=settings.CELERY_RESULT_BACKEND
)


@celery.task(bind=True, name="run_monte_carlo")
def run_monte_carlo_task(self, params):
    try:
        result = run_monte_carlo_simulation(**params)
        return {
            "status": "completed",
            "result": result
        }
    except Exception as e:
        return {
            "status": "failed",
            "error": str(e)
        }


@celery.task(bind=True, name="run_beam_coverage")
def run_beam_coverage_task(self, params):
    try:
        from .core.beam_coverage import generate_beam_coverage
        result = generate_beam_coverage(**params)
        return {
            "status": "completed",
            "result": result
        }
    except Exception as e:
        return {
            "status": "failed",
            "error": str(e)
        }
