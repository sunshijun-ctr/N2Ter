from datetime import datetime
from typing import Any
from uuid import UUID, uuid4

from sqlalchemy import DateTime, ForeignKey, Integer, String, Text, func
from sqlalchemy.dialects.postgresql import ARRAY, JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db import Base
from app.models.enums import (
    ConversationContext,
    EpisodeStatus,
    ExportFormat,
    NovelStatus,
    SchemaType,
    ScreenplayStatus,
    TaskStatus,
    TaskType,
)


def uuid_pk() -> Mapped[UUID]:
    return mapped_column(primary_key=True, default=uuid4)


class TimestampMixin:
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )


class Novel(Base, TimestampMixin):
    __tablename__ = "novels"

    id: Mapped[UUID] = uuid_pk()
    user_id: Mapped[UUID] = mapped_column(default=UUID("00000000-0000-0000-0000-000000000001"))
    title: Mapped[str] = mapped_column(Text)
    author: Mapped[str | None] = mapped_column(Text)
    original_text_url: Mapped[str] = mapped_column(Text)
    summary: Mapped[str | None] = mapped_column(Text)
    user_selected_genres: Mapped[list[str]] = mapped_column(ARRAY(Text), default=list)
    ai_predicted_genres: Mapped[list[str]] = mapped_column(ARRAY(Text), default=list)
    status: Mapped[NovelStatus] = mapped_column(String, default=NovelStatus.uploaded)
    word_count: Mapped[int | None] = mapped_column(Integer)
    error_message: Mapped[str | None] = mapped_column(Text)
    preprocessing_stages: Mapped[dict[str, Any]] = mapped_column(JSONB, default=dict)

    chapters: Mapped[list["Chapter"]] = relationship(back_populates="novel")
    screenplays: Mapped[list["Screenplay"]] = relationship(back_populates="novel")


class Chapter(Base, TimestampMixin):
    __tablename__ = "chapters"

    id: Mapped[UUID] = uuid_pk()
    novel_id: Mapped[UUID] = mapped_column(ForeignKey("novels.id", ondelete="CASCADE"))
    chapter_num: Mapped[int] = mapped_column(Integer)
    title: Mapped[str] = mapped_column(Text)
    content: Mapped[str] = mapped_column(Text)
    word_count: Mapped[int] = mapped_column(Integer, default=0)
    summary: Mapped[str | None] = mapped_column(Text)
    key_events: Mapped[list[dict[str, Any]]] = mapped_column(JSONB, default=list)

    novel: Mapped[Novel] = relationship(back_populates="chapters")


class Screenplay(Base, TimestampMixin):
    __tablename__ = "screenplays"

    id: Mapped[UUID] = uuid_pk()
    novel_id: Mapped[UUID] = mapped_column(ForeignKey("novels.id", ondelete="CASCADE"))
    user_id: Mapped[UUID] = mapped_column(default=UUID("00000000-0000-0000-0000-000000000001"))
    title: Mapped[str] = mapped_column(Text)
    schema_type: Mapped[SchemaType] = mapped_column(String)
    status: Mapped[ScreenplayStatus] = mapped_column(String, default=ScreenplayStatus.draft)
    adaptation_plan: Mapped[dict[str, Any]] = mapped_column(JSONB, default=dict)
    metadata_: Mapped[dict[str, Any]] = mapped_column("metadata", JSONB, default=dict)

    novel: Mapped[Novel] = relationship(back_populates="screenplays")
    episodes: Mapped[list["Episode"]] = relationship(back_populates="screenplay")


class Episode(Base, TimestampMixin):
    __tablename__ = "episodes"

    id: Mapped[UUID] = uuid_pk()
    screenplay_id: Mapped[UUID] = mapped_column(ForeignKey("screenplays.id", ondelete="CASCADE"))
    episode_num: Mapped[int] = mapped_column(Integer)
    title: Mapped[str] = mapped_column(Text)
    source_chapters: Mapped[list[int]] = mapped_column(ARRAY(Integer), default=list)
    status: Mapped[EpisodeStatus] = mapped_column(String, default=EpisodeStatus.pending)
    content: Mapped[dict[str, Any]] = mapped_column(JSONB, default=dict)

    screenplay: Mapped[Screenplay] = relationship(back_populates="episodes")


class Conversation(Base, TimestampMixin):
    __tablename__ = "conversations"

    id: Mapped[UUID] = uuid_pk()
    user_id: Mapped[UUID] = mapped_column(default=UUID("00000000-0000-0000-0000-000000000001"))
    novel_id: Mapped[UUID | None] = mapped_column(ForeignKey("novels.id", ondelete="CASCADE"))
    screenplay_id: Mapped[UUID | None] = mapped_column(ForeignKey("screenplays.id", ondelete="CASCADE"))
    title: Mapped[str] = mapped_column(Text, default="新对话")
    context_type: Mapped[ConversationContext] = mapped_column(
        String, default=ConversationContext.conversation
    )


class Task(Base, TimestampMixin):
    __tablename__ = "tasks"

    id: Mapped[UUID] = uuid_pk()
    user_id: Mapped[UUID] = mapped_column(default=UUID("00000000-0000-0000-0000-000000000001"))
    task_type: Mapped[TaskType] = mapped_column(String)
    status: Mapped[TaskStatus] = mapped_column(String, default=TaskStatus.pending)
    progress: Mapped[int] = mapped_column(Integer, default=0)
    payload: Mapped[dict[str, Any]] = mapped_column(JSONB, default=dict)
    result: Mapped[dict[str, Any] | None] = mapped_column(JSONB)
    error_message: Mapped[str | None] = mapped_column(Text)


class Export(Base, TimestampMixin):
    __tablename__ = "exports"

    id: Mapped[UUID] = uuid_pk()
    screenplay_id: Mapped[UUID] = mapped_column(ForeignKey("screenplays.id", ondelete="CASCADE"))
    export_format: Mapped[ExportFormat] = mapped_column(String)
    status: Mapped[str] = mapped_column(String, default="pending")
    file_url: Mapped[str | None] = mapped_column(Text)
