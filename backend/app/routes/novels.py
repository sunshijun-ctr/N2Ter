from uuid import UUID, uuid4

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db import get_db
from app.models import Novel, NovelStatus, Task, TaskStatus, TaskType
from app.schemas import NovelCreate, NovelListItem, NovelRead, TaskRef
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
        status=NovelStatus.uploaded.value,
        word_count=len(payload.content),
    )
    db.add(novel)
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
