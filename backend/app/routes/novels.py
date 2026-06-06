from uuid import UUID, uuid4

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db import get_db
from app.models import Chapter, Novel, NovelStatus, Task, TaskStatus, TaskType
from app.schemas import ChapterRead, NovelCreate, NovelListItem, NovelRead, TaskRef
from app.services.chapter_splitter import split_chapters
from app.services.storage_service import storage_service

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
    task = Task(
        task_type=TaskType.preprocess,
        status=TaskStatus.pending,
        novel_id=novel_id,
    )
    novel.status = NovelStatus.preprocessing
    db.add(task)
    await db.commit()
    await db.refresh(task)
    return TaskRef(task_id=task.id, status=task.status)
