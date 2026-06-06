from uuid import UUID, uuid4

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core import get_settings
from app.db import get_db
from app.models import Chapter, Novel, NovelStatus, SceneInNovel, TaskStatus, TaskType
from app.schemas import (
    ChapterRead,
    NovelCreate,
    NovelListItem,
    NovelRead,
    ProgressEventRead,
    SceneInNovelRead,
    ScreenplayRead,
    TaskRef,
)
from app.services.chapter_splitter import split_chapters
from app.services.overview_service import overview_service
from app.services.preprocessing_service import preprocessing_service
from app.services.storage_service import storage_service
from app.services.task_service import task_service

router = APIRouter(prefix="/novels", tags=["novels"])


@router.post("", response_model=NovelRead, status_code=status.HTTP_201_CREATED)
async def create_novel(payload: NovelCreate, db: AsyncSession = Depends(get_db)) -> Novel:
    novel_id = uuid4()
    original_text_url = storage_service.save_novel_text(novel_id, payload.content)
    novel = Novel(
        id=novel_id,
        title=payload.title,
        author=payload.author,
        original_text_url=original_text_url,
        user_selected_genres=payload.genres,
        status=NovelStatus.uploaded,
        word_count=len(payload.content),
    )
    db.add(novel)
    for parsed_chapter in split_chapters(payload.content):
        db.add(
            Chapter(
                novel_id=novel_id,
                chapter_num=parsed_chapter.chapter_num,
                title=parsed_chapter.title,
                content=parsed_chapter.content,
                word_count=parsed_chapter.word_count,
                special_type=parsed_chapter.special_type,
            )
        )
    await db.commit()
    await db.refresh(novel)
    return novel


@router.get("", response_model=list[NovelListItem])
async def list_novels(db: AsyncSession = Depends(get_db)) -> list[Novel]:
    result = await db.execute(select(Novel).order_by(Novel.created_at.desc()))
    return list(result.scalars())


@router.get("/{novel_id}", response_model=NovelRead)
async def get_novel(novel_id: UUID, db: AsyncSession = Depends(get_db)) -> Novel:
    novel = await db.get(Novel, novel_id)
    if not novel:
        raise HTTPException(status_code=404, detail="Novel not found")
    return novel


@router.get("/{novel_id}/chapters", response_model=list[ChapterRead])
async def list_chapters(novel_id: UUID, db: AsyncSession = Depends(get_db)) -> list[Chapter]:
    novel = await db.get(Novel, novel_id)
    if not novel:
        raise HTTPException(status_code=404, detail="Novel not found")
    result = await db.execute(
        select(Chapter).where(Chapter.novel_id == novel_id).order_by(Chapter.chapter_num.asc())
    )
    return list(result.scalars())


@router.get("/{novel_id}/chapters/{chapter_num}", response_model=ChapterRead)
async def get_chapter(
    novel_id: UUID, chapter_num: int, db: AsyncSession = Depends(get_db)
) -> Chapter:
    result = await db.execute(
        select(Chapter).where(Chapter.novel_id == novel_id, Chapter.chapter_num == chapter_num)
    )
    chapter = result.scalar_one_or_none()
    if not chapter:
        raise HTTPException(status_code=404, detail="Chapter not found")
    return chapter


@router.get("/{novel_id}/scenes", response_model=list[SceneInNovelRead])
async def list_scenes(
    novel_id: UUID,
    chapter_num: int | None = None,
    db: AsyncSession = Depends(get_db),
) -> list[SceneInNovel]:
    novel = await db.get(Novel, novel_id)
    if not novel:
        raise HTTPException(status_code=404, detail="Novel not found")
    statement = (
        select(SceneInNovel)
        .join(Chapter, Chapter.id == SceneInNovel.chapter_id)
        .where(SceneInNovel.novel_id == novel_id)
        .order_by(Chapter.chapter_num.asc(), SceneInNovel.scene_index.asc())
    )
    if chapter_num is not None:
        statement = statement.where(Chapter.chapter_num == chapter_num)
    result = await db.execute(statement)
    return list(result.scalars())


@router.delete("/{novel_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_novel(novel_id: UUID, db: AsyncSession = Depends(get_db)) -> None:
    novel = await db.get(Novel, novel_id)
    if not novel:
        raise HTTPException(status_code=404, detail="Novel not found")
    await db.delete(novel)
    await db.commit()


@router.post("/{novel_id}/preprocess", response_model=TaskRef, status_code=status.HTTP_202_ACCEPTED)
async def start_preprocess(novel_id: UUID, db: AsyncSession = Depends(get_db)) -> TaskRef:
    novel = await db.get(Novel, novel_id)
    if not novel:
        raise HTTPException(status_code=404, detail="Novel not found")

    if get_settings().async_tasks_enabled:
        task = await task_service.create_task(
            db,
            task_type=TaskType.preprocess,
            status=TaskStatus.pending,
            novel_id=novel_id,
        )
        novel.status = NovelStatus.preprocessing
        await db.commit()
        await db.refresh(task)
        from app.workers.tasks import preprocess_novel

        async_result = preprocess_novel.delay(str(novel_id), str(task.id))
        task.celery_id = async_result.id
        await db.commit()
        await db.refresh(task)
        return TaskRef(task_id=task.id, status=task.status)

    # Synchronous (in-request) execution.
    task = await task_service.create_task(
        db,
        task_type=TaskType.preprocess,
        status=TaskStatus.running,
        progress=10,
        novel_id=novel_id,
    )
    await preprocessing_service.execute(db, novel, task)
    await db.commit()
    await db.refresh(task)
    return TaskRef(task_id=task.id, status=task.status)


@router.get("/{novel_id}/progress", response_model=list[ProgressEventRead])
async def list_progress_events(
    novel_id: UUID, db: AsyncSession = Depends(get_db)
):
    novel = await db.get(Novel, novel_id)
    if not novel:
        raise HTTPException(status_code=404, detail="Novel not found")
    return await task_service.list_progress_events(db, novel_id)


@router.post(
    "/{novel_id}/overview",
    response_model=ScreenplayRead,
    status_code=status.HTTP_201_CREATED,
)
async def generate_overview(novel_id: UUID, db: AsyncSession = Depends(get_db)):
    """(Re)generate the free overview screenplay (Stage 6 / retry button)."""
    novel = await db.get(Novel, novel_id)
    if not novel:
        raise HTTPException(status_code=404, detail="Novel not found")
    screenplay, _ = await overview_service.generate_overview(db, novel)
    await db.commit()
    await db.refresh(screenplay)
    return screenplay
