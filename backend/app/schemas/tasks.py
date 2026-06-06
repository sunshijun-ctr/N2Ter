from uuid import UUID
from datetime import datetime

from app.models.enums import TaskStatus, TaskType
from app.schemas.common import ORMModel, Timestamped


class TaskRead(Timestamped):
    id: UUID
    task_type: TaskType
    novel_id: UUID | None = None
    episode_id: UUID | None = None
    celery_id: str | None = None
    status: TaskStatus
    progress: int
    error_message: str | None = None
    retry_count: int


class ProgressEventRead(ORMModel):
    id: int
    novel_id: UUID
    event_type: str
    payload: dict
    created_at: datetime
