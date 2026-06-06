from uuid import UUID

from app.models.enums import TaskStatus, TaskType
from app.schemas.common import Timestamped


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
