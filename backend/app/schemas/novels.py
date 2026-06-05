from uuid import UUID

from pydantic import BaseModel, Field

from app.models.enums import NovelStatus
from app.schemas.common import Timestamped


class NovelCreate(BaseModel):
    title: str = Field(min_length=1)
    author: str | None = None
    content: str = Field(min_length=1)
    genres: list[str] = Field(default_factory=list, max_length=3)


class NovelRead(Timestamped):
    id: UUID
    title: str
    author: str | None = None
    status: NovelStatus
    user_selected_genres: list[str] = []
    word_count: int | None = None
    summary: str | None = None


class NovelListItem(Timestamped):
    id: UUID
    title: str
    author: str | None = None
    status: NovelStatus
    user_selected_genres: list[str] = []
    word_count: int | None = None
