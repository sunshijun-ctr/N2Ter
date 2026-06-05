from typing import Any
from uuid import UUID

from app.models.enums import TaskStatus, TaskType
from app.schemas.common import Timestamped


class TaskRead(Timestamped):
    id: UUID
    task_type: TaskType
    status: TaskStatus
    progress: int
    payload: dict[str, Any] = {}
    result: dict[str, Any] | None = None
    error_message: str | None = None
