from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db import get_db
from app.models import Episode, EpisodeStatus, Novel, Screenplay, ScreenplayStatus
from app.schemas import EpisodeRead, EpisodeUpdate, ScreenplayCreate, ScreenplayRead

router = APIRouter(tags=["screenplays"])


@router.post("/screenplays", response_model=ScreenplayRead, status_code=status.HTTP_201_CREATED)
async def create_screenplay(
    payload: ScreenplayCreate, db: AsyncSession = Depends(get_db)
) -> Screenplay:
    novel = await db.get(Novel, payload.novel_id)
    if not novel:
        raise HTTPException(status_code=404, detail="Novel not found")

    screenplay = Screenplay(
        novel_id=payload.novel_id,
        title=payload.title or f"{novel.title} 改编剧本",
        schema_type=payload.schema_type.value,
        status=ScreenplayStatus.planning.value,
        adaptation_plan=payload.adaptation_plan,
    )
    db.add(screenplay)
    await db.commit()
    await db.refresh(screenplay)
    return screenplay


@router.get("/screenplays/{screenplay_id}", response_model=ScreenplayRead)
async def get_screenplay(screenplay_id: UUID, db: AsyncSession = Depends(get_db)) -> Screenplay:
    screenplay = await db.get(Screenplay, screenplay_id)
    if not screenplay:
        raise HTTPException(status_code=404, detail="Screenplay not found")
    return screenplay


@router.get("/novels/{novel_id}/screenplays", response_model=list[ScreenplayRead])
async def list_screenplays(novel_id: UUID, db: AsyncSession = Depends(get_db)) -> list[Screenplay]:
    result = await db.execute(
        select(Screenplay)
        .where(Screenplay.novel_id == novel_id)
        .order_by(Screenplay.created_at.desc())
    )
    return list(result.scalars())


@router.get("/screenplays/{screenplay_id}/episodes", response_model=list[EpisodeRead])
async def list_episodes(screenplay_id: UUID, db: AsyncSession = Depends(get_db)) -> list[Episode]:
    result = await db.execute(
        select(Episode)
        .where(Episode.screenplay_id == screenplay_id)
        .order_by(Episode.episode_num.asc())
    )
    return list(result.scalars())


@router.post(
    "/screenplays/{screenplay_id}/episodes",
    response_model=EpisodeRead,
    status_code=status.HTTP_201_CREATED,
)
async def create_episode(screenplay_id: UUID, db: AsyncSession = Depends(get_db)) -> Episode:
    screenplay = await db.get(Screenplay, screenplay_id)
    if not screenplay:
        raise HTTPException(status_code=404, detail="Screenplay not found")
    result = await db.execute(select(Episode).where(Episode.screenplay_id == screenplay_id))
    existing = list(result.scalars())
    episode = Episode(
        screenplay_id=screenplay_id,
        episode_num=len(existing) + 1,
        title=f"第 {len(existing) + 1} 集",
        source_chapters=[],
        status=EpisodeStatus.pending.value,
        content={},
    )
    db.add(episode)
    await db.commit()
    await db.refresh(episode)
    return episode


@router.get("/episodes/{episode_id}", response_model=EpisodeRead)
async def get_episode(episode_id: UUID, db: AsyncSession = Depends(get_db)) -> Episode:
    episode = await db.get(Episode, episode_id)
    if not episode:
        raise HTTPException(status_code=404, detail="Episode not found")
    return episode


@router.put("/episodes/{episode_id}", response_model=EpisodeRead)
async def update_episode(
    episode_id: UUID, payload: EpisodeUpdate, db: AsyncSession = Depends(get_db)
) -> Episode:
    episode = await db.get(Episode, episode_id)
    if not episode:
        raise HTTPException(status_code=404, detail="Episode not found")
    if payload.title is not None:
        episode.title = payload.title
    if payload.content is not None:
        episode.content = payload.content
    if payload.status is not None:
        episode.status = payload.status.value
    await db.commit()
    await db.refresh(episode)
    return episode
