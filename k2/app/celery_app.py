from celery import Celery
from .config import get_settings

settings = get_settings()

celery = Celery(
    "variant_correction",
    broker=settings.CELERY_BROKER_URL,
    backend=settings.CELERY_RESULT_BACKEND,
)

celery.conf.update(
    task_serializer="json",
    accept_content=["json"],
    result_serializer="json",
    timezone="Asia/Shanghai",
    enable_utc=True,
    task_track_started=True,
    result_expires=86400 * 7,
    result_backend_transport_options={
        "visibility_timeout": 3600,
        "socket_connect_timeout": 2,
        "socket_timeout": 30,
    },
    broker_transport_options={
        "visibility_timeout": 3600,
        "socket_connect_timeout": 2,
        "socket_timeout": 30,
    },
    task_acks_late=True,
    task_reject_on_worker_lost=True,
    worker_prefetch_multiplier=1,
    worker_max_tasks_per_child=1000,
)

import app.celery_tasks
