from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from app.db import get_db
from app.models import Task, TaskStatus
from app.schemas import TaskRead

router = APIRouter(prefix="/tasks", tags=["tasks"])


@router.get("/{task_id}", response_model=TaskRead)
async def get_task(task_id: UUID, db: AsyncSession = Depends(get_db)) -> Task:
    task = await db.get(Task, task_id)
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    return task


@router.post("/{task_id}/cancel", response_model=TaskRead)
async def cancel_task(task_id: UUID, db: AsyncSession = Depends(get_db)) -> Task:
    task = await db.get(Task, task_id)
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    task.status = TaskStatus.cancelled.value
    await db.commit()
    await db.refresh(task)
    return task
