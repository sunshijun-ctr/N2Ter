from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core import get_settings
from app.db import get_db
from app.models import (
    Episode,
    EpisodeStatus,
    Novel,
    Screenplay,
    ScreenplayStatus,
    Task,
    TaskStatus,
    TaskType,
)
from app.schemas import (
    AdaptationPlanRead,
    AdaptationPlanRequest,
    EpisodePatchRequest,
    EpisodeTaskRef,
    EpisodeRead,
    EpisodeUpdate,
    EpisodeVersionRead,
    ScreenplayCreate,
    ScreenplayGenerateRequest,
    ScreenplayGenerationRead,
    ScreenplayRegenerateRequest,
    ScreenplayRead,
)
from app.services.episode_writing_agent_service import episode_writing_agent_service
from app.services.episode_service import episode_service
from app.services.planning_service import planning_service
from app.services.screenplay_service import screenplay_service
from app.services.task_service import task_service

router = APIRouter(tags=["screenplays"])


@router.post("/screenplays", response_model=ScreenplayRead, status_code=status.HTTP_201_CREATED)
async def create_screenplay(
    payload: ScreenplayCreate, db: AsyncSession = Depends(get_db)
) -> Screenplay:
    novel = await db.get(Novel, payload.novel_id)
    if not novel:
        raise HTTPException(status_code=404, detail="Novel not found")
    adaptation_plan = payload.adaptation_plan or await planning_service.build_default_plan(db, novel)

    screenplay = Screenplay(
        novel_id=payload.novel_id,
        parent_screenplay_id=payload.parent_screenplay_id,
        schema_type=payload.schema_type,
        status=ScreenplayStatus.planning,
        adaptation_plan=adaptation_plan,
        screenplay_memory={},
        branch_name=payload.branch_name,
        branch_type=payload.branch_type,
        regeneration_instruction=payload.regeneration_instruction,
        plan_source=payload.plan_source,
        style_preferences={"title": payload.title or f"{novel.title} 改编剧本"},
    )
    db.add(screenplay)
    await db.flush()
    await screenplay_service.create_episodes_from_plan(db, screenplay)
    await db.commit()
    await db.refresh(screenplay)
    return screenplay


@router.post("/novels/{novel_id}/adaptation-plan", response_model=AdaptationPlanRead)
async def create_adaptation_plan(
    novel_id: UUID,
    payload: AdaptationPlanRequest | None = None,
    db: AsyncSession = Depends(get_db),
) -> dict:
    request = payload or AdaptationPlanRequest()
    try:
        return await planning_service.build_default_plan_by_novel_id(
            db, novel_id, request.chapters_per_episode
        )
    except LookupError:
        raise HTTPException(status_code=404, detail="Novel not found") from None


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
    "/screenplays/{screenplay_id}/generate",
    response_model=ScreenplayGenerationRead,
)
async def generate_screenplay(
    screenplay_id: UUID,
    payload: ScreenplayGenerateRequest | None = None,
    db: AsyncSession = Depends(get_db),
) -> dict:
    screenplay = await db.get(Screenplay, screenplay_id)
    if not screenplay:
        raise HTTPException(status_code=404, detail="Screenplay not found")
    request = payload or ScreenplayGenerateRequest()
    return await episode_writing_agent_service.generate_screenplay(
        db,
        screenplay,
        start_episode=request.start_episode,
        end_episode=request.end_episode,
        mode=request.mode,
        stop_on_failure=request.stop_on_failure,
    )


@router.post(
    "/screenplays/{screenplay_id}/regenerate",
    response_model=ScreenplayRead,
    status_code=status.HTTP_201_CREATED,
)
async def regenerate_screenplay_branch(
    screenplay_id: UUID,
    payload: ScreenplayRegenerateRequest,
    db: AsyncSession = Depends(get_db),
) -> Screenplay:
    screenplay = await db.get(Screenplay, screenplay_id)
    if not screenplay:
        raise HTTPException(status_code=404, detail="Screenplay not found")
    branch = await screenplay_service.create_branch(
        db,
        screenplay,
        branch_name=payload.branch_name,
        regeneration_instruction=payload.regeneration_instruction,
        adaptation_plan=payload.adaptation_plan,
        plan_source=payload.plan_source,
    )
    await db.commit()
    await db.refresh(branch)
    return branch


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
        status=EpisodeStatus.pending,
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


@router.post("/episodes/{episode_id}/generate", response_model=EpisodeTaskRef)
async def generate_episode(episode_id: UUID, db: AsyncSession = Depends(get_db)) -> EpisodeTaskRef:
    episode = await db.get(Episode, episode_id)
    if not episode:
        raise HTTPException(status_code=404, detail="Episode not found")

    if get_settings().async_tasks_enabled:
        task = await task_service.create_task(
            db,
            task_type=TaskType.generate_episode,
            episode_id=episode.id,
            status=TaskStatus.pending,
        )
        episode.status = EpisodeStatus.generating
        await db.commit()
        await db.refresh(task)
        from app.workers.tasks import generate_episode as generate_episode_task

        async_result = generate_episode_task.delay(str(episode_id), str(task.id))
        task.celery_id = async_result.id
        await db.commit()
        await db.refresh(task)
        return EpisodeTaskRef(
            task_id=task.id, status=task.status.value, episode_id=episode.id
        )

    try:
        generated_episode, task, _ = await episode_writing_agent_service.generate_episode(db, episode)
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from None
    return EpisodeTaskRef(
        task_id=task.id,
        status=task.status.value,
        episode_id=generated_episode.id,
    )


@router.post("/episodes/{episode_id}/reset", response_model=EpisodeRead)
async def reset_episode(episode_id: UUID, db: AsyncSession = Depends(get_db)) -> Episode:
    """Recover an episode stuck in ``generating`` (e.g. its worker task was
    killed by a container restart). Resets it to ``pending`` so it can be
    regenerated, clears the error, and fails off any lingering task for it."""
    episode = await db.get(Episode, episode_id)
    if not episode:
        raise HTTPException(status_code=404, detail="Episode not found")
    episode.status = EpisodeStatus.pending
    episode.error_message = None
    result = await db.execute(
        select(Task).where(
            Task.episode_id == episode_id,
            Task.status.in_([TaskStatus.pending, TaskStatus.running]),
        )
    )
    for task in result.scalars():
        task.status = TaskStatus.failed
        task.error_message = "任务被手动重置"
    await db.commit()
    await db.refresh(episode)
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
        await episode_service.save_version(db, episode, payload.content, modified_by="user")
    if payload.status is not None:
        episode.status = payload.status
    await db.commit()
    await db.refresh(episode)
    return episode


@router.post("/episodes/{episode_id}/patch", response_model=EpisodeRead)
async def patch_episode(
    episode_id: UUID, payload: EpisodePatchRequest, db: AsyncSession = Depends(get_db)
) -> Episode:
    episode = await db.get(Episode, episode_id)
    if not episode:
        raise HTTPException(status_code=404, detail="Episode not found")
    return await episode_service.patch_episode(db, episode, payload.instruction, modified_by="ai")


@router.get("/episodes/{episode_id}/versions", response_model=list[EpisodeVersionRead])
async def list_episode_versions(
    episode_id: UUID, db: AsyncSession = Depends(get_db)
):
    episode = await db.get(Episode, episode_id)
    if not episode:
        raise HTTPException(status_code=404, detail="Episode not found")
    return await episode_service.list_versions(db, episode_id)


@router.post("/episodes/{episode_id}/versions/{version_num}/restore", response_model=EpisodeRead)
async def restore_episode_version(
    episode_id: UUID, version_num: int, db: AsyncSession = Depends(get_db)
) -> Episode:
    episode = await db.get(Episode, episode_id)
    if not episode:
        raise HTTPException(status_code=404, detail="Episode not found")
    try:
        return await episode_service.restore_version(db, episode, version_num)
    except LookupError:
        raise HTTPException(status_code=404, detail="Episode version not found") from None
