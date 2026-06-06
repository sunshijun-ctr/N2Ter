"""Celery tasks.

Each task runs its async body via ``asyncio.run`` on a dedicated engine, as
agreed in Design.md §7.8 (point 1). A fresh engine per task avoids reusing an
asyncpg connection bound to an already-closed event loop across invocations.
"""

import asyncio
from collections.abc import Awaitable, Callable
from typing import TypeVar
from uuid import UUID

from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.core import get_settings
from app.models import (
    Episode,
    EpisodeStatus,
    Export,
    Novel,
    NovelStatus,
    Task,
    TaskStatus,
    TaskType,
)
from app.services.export_service import export_service
from app.services.episode_writing_agent_service import episode_writing_agent_service
from app.services.preprocessing_service import preprocessing_service
from app.services.task_service import task_service
from app.workers.celery_app import celery_app

T = TypeVar("T")


def _run(coro_factory: Callable[[AsyncSession], Awaitable[T]]) -> T:
    """Run an async unit of work on a throwaway engine + session."""

    async def _main() -> T:
        engine = create_async_engine(get_settings().database_url, pool_pre_ping=True)
        sessionmaker = async_sessionmaker(engine, expire_on_commit=False, class_=AsyncSession)
        try:
            async with sessionmaker() as session:
                return await coro_factory(session)
        finally:
            await engine.dispose()

    return asyncio.run(_main())


async def _load_or_create_task(
    db: AsyncSession,
    task_id: str | None,
    task_type: TaskType,
    *,
    novel_id=None,
    episode_id=None,
) -> Task:
    if task_id:
        task = await db.get(Task, UUID(task_id))
        if task:
            return task
    return await task_service.create_task(
        db,
        task_type=task_type,
        novel_id=novel_id,
        episode_id=episode_id,
        status=TaskStatus.running,
        progress=10,
    )


@celery_app.task(name="preprocess_novel")
def preprocess_novel(novel_id: str, task_id: str | None = None) -> dict:
    async def _work(db: AsyncSession) -> dict:
        novel = await db.get(Novel, UUID(novel_id))
        if not novel:
            return {"novel_id": novel_id, "status": "not_found"}
        task = await _load_or_create_task(
            db, task_id, TaskType.preprocess, novel_id=novel.id
        )
        try:
            await preprocessing_service.execute(db, novel, task)
        except Exception as exc:  # noqa: BLE001 - surface failure to the user
            task.status = TaskStatus.failed
            task.error_message = str(exc)
            novel.status = NovelStatus.preprocessing_failed
            novel.error_message = str(exc)
            await task_service.record_progress(
                db, novel.id, "preprocessing_failed", {"error": str(exc)}
            )
            await db.commit()
            return {"novel_id": novel_id, "status": "failed", "error": str(exc)}
        await db.commit()
        return {"novel_id": novel_id, "status": task.status.value, "task_id": str(task.id)}

    return _run(_work)


@celery_app.task(name="generate_episode")
def generate_episode(episode_id: str, task_id: str | None = None) -> dict:
    async def _work(db: AsyncSession) -> dict:
        episode = await db.get(Episode, UUID(episode_id))
        if not episode:
            return {"episode_id": episode_id, "status": "not_found"}
        task = await _load_or_create_task(
            db, task_id, TaskType.generate_episode, episode_id=episode.id
        )
        try:
            generated, task, _ = await episode_writing_agent_service.generate_episode(
                db, episode, task
            )
        except Exception as exc:  # noqa: BLE001 - surface failure to the user
            task.status = TaskStatus.failed
            task.error_message = str(exc)
            episode.status = EpisodeStatus.failed
            episode.error_message = str(exc)
            await db.commit()
            return {"episode_id": episode_id, "status": "failed", "error": str(exc)}
        return {
            "episode_id": str(generated.id),
            "episode_num": generated.episode_num,
            "task_id": str(task.id),
            "status": task.status.value,
        }

    return _run(_work)


@celery_app.task(name="export_screenplay")
def export_screenplay(export_id: str) -> dict:
    async def _work(db: AsyncSession) -> dict:
        export = await db.get(Export, UUID(export_id))
        if not export:
            return {"export_id": export_id, "status": "not_found"}
        export = await export_service.render_export(db, export)
        return {
            "export_id": str(export.id),
            "export_format": export.export_format.value,
            "status": export.status.value,
            "file_url": export.file_url,
        }

    return _run(_work)
