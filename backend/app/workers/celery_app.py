from celery import Celery

from app.core import get_settings

settings = get_settings()

celery_app = Celery(
    "n2ter",
    broker=settings.celery_broker_url,
    backend=settings.celery_result_backend,
    include=["app.workers.tasks"],
)
celery_app.conf.update(
    task_track_started=True,
    task_serializer="json",
    accept_content=["json"],
    result_serializer="json",
    timezone="Asia/Shanghai",
    # Reliability: only ack after completion so a crashed worker re-queues.
    task_acks_late=True,
    task_reject_on_worker_lost=True,
    result_expires=86400,
)
