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


class ScreenplayRead(Timestamped):
    id: UUID
    novel_id: UUID
    title: str
    schema_type: SchemaType
    status: ScreenplayStatus
    adaptation_plan: dict[str, Any] = {}


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


class EpisodeUpdate(BaseModel):
    title: str | None = None
    content: dict[str, Any] | None = None
    status: EpisodeStatus | None = None


class EpisodePatchRequest(BaseModel):
    instruction: str = Field(min_length=1)


class EpisodeVersionRead(ORMModel):
    id: UUID
    episode_id: UUID
    version: int
    content: dict[str, Any]
    modified_by: str
    modified_at: datetime
