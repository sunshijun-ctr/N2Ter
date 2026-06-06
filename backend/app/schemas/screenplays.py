from typing import Any
from uuid import UUID
from datetime import datetime

from pydantic import BaseModel, Field

from app.models.enums import EpisodeStatus, SchemaType, ScreenplayStatus
from app.schemas.common import ORMModel, Timestamped


class ScreenplayCreate(BaseModel):
    novel_id: UUID
    schema_type: SchemaType = SchemaType.screenwriter
    title: str | None = None
    adaptation_plan: dict[str, Any] = Field(default_factory=dict)
    parent_screenplay_id: UUID | None = None
    branch_name: str | None = None
    branch_type: str = "initial"
    regeneration_instruction: str | None = None
    plan_source: str = "initial"


class ScreenplayRead(Timestamped):
    id: UUID
    novel_id: UUID
    parent_screenplay_id: UUID | None = None
    title: str
    schema_type: SchemaType
    status: ScreenplayStatus
    adaptation_plan: dict[str, Any] = {}
    screenplay_memory: dict[str, Any] = {}
    branch_name: str | None = None
    branch_type: str = "initial"
    regeneration_instruction: str | None = None
    plan_source: str = "initial"


class AdaptationPlanRequest(BaseModel):
    chapters_per_episode: int = Field(default=2, ge=1, le=10)


class AdaptationPlanRead(BaseModel):
    novel_id: UUID
    title: str
    episode_count: int
    chapters_per_episode: int
    episodes: list[dict[str, Any]]


class EpisodeRead(Timestamped):
    id: UUID
    screenplay_id: UUID
    episode_num: int
    title: str | None = None
    source_chapters: list[int]
    status: EpisodeStatus
    content: dict[str, Any] | None = None
    error_message: str | None = None


class EpisodeUpdate(BaseModel):
    title: str | None = None
    content: dict[str, Any] | None = None
    status: EpisodeStatus | None = None


class EpisodePatchRequest(BaseModel):
    instruction: str = Field(min_length=1)


class ScreenplayGenerateRequest(BaseModel):
    start_episode: int = Field(default=1, ge=1)
    end_episode: int | None = Field(default=None, ge=1)
    mode: str = "remaining_only"
    stop_on_failure: bool = True


class ScreenplayRegenerateRequest(BaseModel):
    branch_name: str | None = None
    regeneration_instruction: str = Field(min_length=1)
    adaptation_plan: dict[str, Any] | None = None
    plan_source: str = "user_adjusted"


class ScreenplayGenerationRead(BaseModel):
    status: str
    screenplay_id: UUID
    generated_episode_nums: list[int] = Field(default_factory=list)
    current_episode_num: int | None = None
    failed_episode_num: int | None = None
    task_id: UUID | None = None
    next_action: str = "done"


class EpisodeVersionRead(ORMModel):
    id: UUID
    episode_id: UUID
    version: int
    content: dict[str, Any]
    modified_by: str
    modified_at: datetime
