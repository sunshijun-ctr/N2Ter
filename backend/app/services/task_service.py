from typing import Any
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import ProgressEvent, Task, TaskStatus, TaskType


class TaskService:
    async def create_task(
        self,
        db: AsyncSession,
        task_type: TaskType,
        novel_id: UUID | None = None,
        episode_id: UUID | None = None,
        progress: int = 0,
        status: TaskStatus = TaskStatus.pending,
        celery_id: str | None = None,
    ) -> Task:
        task = Task(
            task_type=task_type,
            novel_id=novel_id,
            episode_id=episode_id,
            celery_id=celery_id,
            status=status,
            progress=progress,
        )
        db.add(task)
        await db.flush()
        return task

    async def record_progress(
        self,
        db: AsyncSession,
        novel_id: UUID,
        event_type: str,
        payload: dict[str, Any] | None = None,
    ) -> ProgressEvent:
        event = ProgressEvent(novel_id=novel_id, event_type=event_type, payload=payload or {})
        db.add(event)
        await db.flush()
        return event

    async def list_progress_events(self, db: AsyncSession, novel_id: UUID) -> list[ProgressEvent]:
        result = await db.execute(
            select(ProgressEvent)
            .where(ProgressEvent.novel_id == novel_id)
            .order_by(ProgressEvent.created_at.asc(), ProgressEvent.id.asc())
        )
        return list(result.scalars())

    async def cancel_task(self, db: AsyncSession, task: Task) -> Task:
        task.status = TaskStatus.cancelled
        await db.commit()
        await db.refresh(task)
        return task


task_service = TaskService()
