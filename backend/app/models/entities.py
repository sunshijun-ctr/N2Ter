from datetime import datetime
from typing import Any
from uuid import UUID, uuid4

from sqlalchemy import (
    BigInteger,
    Boolean,
    CheckConstraint,
    DateTime,
    Enum,
    ForeignKey,
    Index,
    Integer,
    Text,
    UniqueConstraint,
    func,
    text,
)
from sqlalchemy.dialects.postgresql import ARRAY, JSONB, UUID as PG_UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core import DEFAULT_USER_ID
from app.db import Base
from app.models.enums import (
    CharacterRole,
    ConversationContext,
    ConversationStatus,
    EpisodeStatus,
    ExportFormat,
    ExportStatus,
    MessageRole,
    NovelStatus,
    QualityLevel,
    SchemaType,
    ScreenplayStatus,
    TaskStatus,
    TaskType,
)


DEFAULT_USER_UUID = UUID(DEFAULT_USER_ID)


def uuid_pk() -> Mapped[UUID]:
    return mapped_column(primary_key=True, default=uuid4)


def pg_enum(enum_cls: type, name: str) -> Enum:
    return Enum(enum_cls, name=name, native_enum=True, create_constraint=False)


class CreatedAtMixin:
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class TimestampMixin(CreatedAtMixin):
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )


class User(Base, CreatedAtMixin):
    __tablename__ = "users"

    id: Mapped[UUID] = uuid_pk()
    username: Mapped[str] = mapped_column(Text, unique=True)


class Novel(Base, TimestampMixin):
    __tablename__ = "novels"
    __table_args__ = (
        CheckConstraint("cardinality(user_selected_genres) BETWEEN 0 AND 3", name="chk_genre_count"),
        CheckConstraint(
            "genre_confidence IS NULL OR (genre_confidence >= 0 AND genre_confidence <= 1)",
            name="chk_genre_conf",
        ),
    )

    id: Mapped[UUID] = uuid_pk()
    user_id: Mapped[UUID] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), default=DEFAULT_USER_UUID
    )
    title: Mapped[str] = mapped_column(Text)
    author: Mapped[str | None] = mapped_column(Text)
    original_text_url: Mapped[str] = mapped_column(Text)
    summary: Mapped[str | None] = mapped_column(Text)
    character_arcs: Mapped[list[dict[str, Any]]] = mapped_column(JSONB, default=list)
    foreshadowing: Mapped[list[dict[str, Any]]] = mapped_column(JSONB, default=list)
    user_selected_genres: Mapped[list[str]] = mapped_column(ARRAY(Text), default=list)
    ai_predicted_genres: Mapped[list[str]] = mapped_column(ARRAY(Text), default=list)
    genre_confidence: Mapped[float | None] = mapped_column()
    needs_genre_confirmation: Mapped[bool] = mapped_column(Boolean, default=False)
    status: Mapped[NovelStatus] = mapped_column(
        pg_enum(NovelStatus, "novel_status"), default=NovelStatus.uploaded
    )
    preprocessing_stages: Mapped[dict[str, Any]] = mapped_column(
        JSONB,
        default=lambda: {
            "split": "pending",
            "chapters": "pending",
            "novel_analysis": "pending",
            "vectorize": "pending",
            "genre": "pending",
            "overview": "pending",
        },
    )
    preprocessing_quality: Mapped[QualityLevel | None] = mapped_column(
        pg_enum(QualityLevel, "quality_level")
    )
    error_message: Mapped[str | None] = mapped_column(Text)
    word_count: Mapped[int | None] = mapped_column(Integer)

    chapters: Mapped[list["Chapter"]] = relationship(back_populates="novel")
    scenes: Mapped[list["SceneInNovel"]] = relationship(back_populates="novel")
    characters: Mapped[list["Character"]] = relationship(back_populates="novel")
    screenplays: Mapped[list["Screenplay"]] = relationship(back_populates="novel")
    conversations: Mapped[list["Conversation"]] = relationship(back_populates="novel")


class Chapter(Base, TimestampMixin):
    __tablename__ = "chapters"
    __table_args__ = (UniqueConstraint("novel_id", "chapter_num", name="uq_chapter_num"),)

    id: Mapped[UUID] = uuid_pk()
    novel_id: Mapped[UUID] = mapped_column(ForeignKey("novels.id", ondelete="CASCADE"))
    chapter_num: Mapped[int] = mapped_column(Integer)
    title: Mapped[str] = mapped_column(Text)
    content: Mapped[str] = mapped_column(Text)
    word_count: Mapped[int] = mapped_column(Integer, default=0)
    summary: Mapped[str | None] = mapped_column(Text)
    summary_quality: Mapped[QualityLevel | None] = mapped_column(
        pg_enum(QualityLevel, "quality_level")
    )
    key_events: Mapped[list[dict[str, Any]]] = mapped_column(JSONB, default=list)
    special_type: Mapped[str | None] = mapped_column(Text)
    needs_sub_split: Mapped[bool] = mapped_column(Boolean, default=False)
    preprocessing_status: Mapped[dict[str, Any]] = mapped_column(
        JSONB,
        default=lambda: {
            "summary": "pending",
            "key_events": "pending",
            "segmentation": "pending",
        },
    )
    retry_count: Mapped[int] = mapped_column(Integer, default=0)

    novel: Mapped[Novel] = relationship(back_populates="chapters")
    scenes: Mapped[list["SceneInNovel"]] = relationship(back_populates="chapter")


class SceneInNovel(Base, CreatedAtMixin):
    __tablename__ = "scenes_in_novel"
    __table_args__ = (
        UniqueConstraint("chapter_id", "scene_index", name="uq_scene_idx"),
        Index("idx_scenes_unvectored", "novel_id", postgresql_where=text("vectorized = FALSE")),
    )

    id: Mapped[UUID] = uuid_pk()
    novel_id: Mapped[UUID] = mapped_column(ForeignKey("novels.id", ondelete="CASCADE"))
    chapter_id: Mapped[UUID] = mapped_column(ForeignKey("chapters.id", ondelete="CASCADE"))
    scene_index: Mapped[int] = mapped_column(Integer)
    content: Mapped[str] = mapped_column(Text)
    description: Mapped[str | None] = mapped_column(Text)
    characters: Mapped[list[dict[str, Any]]] = mapped_column(JSONB, default=list)
    vector_id: Mapped[str | None] = mapped_column(Text)
    vectorized: Mapped[bool] = mapped_column(Boolean, default=False)
    segmentation_quality: Mapped[QualityLevel | None] = mapped_column(
        pg_enum(QualityLevel, "quality_level")
    )

    novel: Mapped[Novel] = relationship(back_populates="scenes")
    chapter: Mapped[Chapter] = relationship(back_populates="scenes")


class Character(Base, TimestampMixin):
    __tablename__ = "characters"
    __table_args__ = (UniqueConstraint("novel_id", "name", name="uq_character_name"),)

    id: Mapped[UUID] = uuid_pk()
    novel_id: Mapped[UUID] = mapped_column(ForeignKey("novels.id", ondelete="CASCADE"))
    name: Mapped[str] = mapped_column(Text)
    role: Mapped[CharacterRole] = mapped_column(
        pg_enum(CharacterRole, "character_role"), default=CharacterRole.supporting
    )
    arc_description: Mapped[str | None] = mapped_column(Text)
    timeline: Mapped[list[dict[str, Any]]] = mapped_column(JSONB, default=list)

    novel: Mapped[Novel] = relationship(back_populates="characters")


class Screenplay(Base, TimestampMixin):
    __tablename__ = "screenplays"

    id: Mapped[UUID] = uuid_pk()
    user_id: Mapped[UUID] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), default=DEFAULT_USER_UUID
    )
    novel_id: Mapped[UUID] = mapped_column(ForeignKey("novels.id", ondelete="CASCADE"))
    parent_screenplay_id: Mapped[UUID | None] = mapped_column(
        ForeignKey("screenplays.id", ondelete="SET NULL")
    )
    schema_type: Mapped[SchemaType] = mapped_column(pg_enum(SchemaType, "schema_type"))
    schema_version: Mapped[str] = mapped_column(Text, default="1.0")
    adaptation_plan: Mapped[dict[str, Any] | None] = mapped_column(JSONB)
    style_preferences: Mapped[dict[str, Any]] = mapped_column(JSONB, default=dict)
    screenplay_memory: Mapped[dict[str, Any]] = mapped_column(
        JSONB, default=dict, server_default=text("'{}'::jsonb")
    )
    branch_name: Mapped[str | None] = mapped_column(Text)
    branch_type: Mapped[str] = mapped_column(Text, default="initial")
    regeneration_instruction: Mapped[str | None] = mapped_column(Text)
    plan_source: Mapped[str] = mapped_column(Text, default="initial")
    status: Mapped[ScreenplayStatus] = mapped_column(
        pg_enum(ScreenplayStatus, "screenplay_status"), default=ScreenplayStatus.draft
    )
    is_auto_generated: Mapped[bool] = mapped_column(Boolean, default=False)
    quality: Mapped[QualityLevel | None] = mapped_column(pg_enum(QualityLevel, "quality_level"))

    novel: Mapped[Novel] = relationship(back_populates="screenplays")
    parent_screenplay: Mapped["Screenplay | None"] = relationship(remote_side=[id])
    episodes: Mapped[list["Episode"]] = relationship(back_populates="screenplay")
    conversations: Mapped[list["Conversation"]] = relationship(back_populates="screenplay")

    @property
    def title(self) -> str:
        return self.style_preferences.get("title", "")

    @title.setter
    def title(self, value: str) -> None:
        self.style_preferences = {**(self.style_preferences or {}), "title": value}


class Episode(Base, TimestampMixin):
    __tablename__ = "episodes"
    __table_args__ = (UniqueConstraint("screenplay_id", "episode_num", name="uq_episode_num"),)

    id: Mapped[UUID] = uuid_pk()
    screenplay_id: Mapped[UUID] = mapped_column(ForeignKey("screenplays.id", ondelete="CASCADE"))
    episode_num: Mapped[int] = mapped_column(Integer)
    title: Mapped[str | None] = mapped_column(Text)
    source_chapters: Mapped[list[int]] = mapped_column(ARRAY(Integer), default=list)
    content: Mapped[dict[str, Any] | None] = mapped_column(JSONB)
    status: Mapped[EpisodeStatus] = mapped_column(
        pg_enum(EpisodeStatus, "episode_status"), default=EpisodeStatus.pending
    )
    error_message: Mapped[str | None] = mapped_column(Text)
    generated_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    screenplay: Mapped[Screenplay] = relationship(back_populates="episodes")
    versions: Mapped[list["EpisodeVersion"]] = relationship(back_populates="episode")
    tasks: Mapped[list["Task"]] = relationship(back_populates="episode")


class EpisodeVersion(Base):
    __tablename__ = "episode_versions"
    __table_args__ = (
        UniqueConstraint("episode_id", "version", name="uq_episode_version"),
        CheckConstraint("modified_by IN ('user', 'ai')", name="chk_modified_by"),
    )

    id: Mapped[UUID] = uuid_pk()
    episode_id: Mapped[UUID] = mapped_column(ForeignKey("episodes.id", ondelete="CASCADE"))
    version: Mapped[int] = mapped_column(Integer)
    content: Mapped[dict[str, Any]] = mapped_column(JSONB)
    modified_by: Mapped[str] = mapped_column(Text, default="ai")
    modified_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    episode: Mapped[Episode] = relationship(back_populates="versions")


class Conversation(Base, TimestampMixin):
    __tablename__ = "conversations"

    id: Mapped[UUID] = uuid_pk()
    user_id: Mapped[UUID] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), default=DEFAULT_USER_UUID
    )
    novel_id: Mapped[UUID] = mapped_column(ForeignKey("novels.id", ondelete="CASCADE"))
    screenplay_id: Mapped[UUID | None] = mapped_column(ForeignKey("screenplays.id", ondelete="CASCADE"))
    title: Mapped[str | None] = mapped_column(Text)
    context_type: Mapped[ConversationContext] = mapped_column(
        pg_enum(ConversationContext, "conversation_context"),
        default=ConversationContext.conversation,
    )
    status: Mapped[ConversationStatus] = mapped_column(
        pg_enum(ConversationStatus, "conversation_status"), default=ConversationStatus.active
    )

    novel: Mapped[Novel] = relationship(back_populates="conversations")
    screenplay: Mapped[Screenplay | None] = relationship(back_populates="conversations")
    messages: Mapped[list["Message"]] = relationship(back_populates="conversation")
    compressed_segments: Mapped[list["CompressedSegment"]] = relationship(
        back_populates="conversation"
    )


class Message(Base, CreatedAtMixin):
    __tablename__ = "messages"

    id: Mapped[UUID] = uuid_pk()
    conversation_id: Mapped[UUID] = mapped_column(ForeignKey("conversations.id", ondelete="CASCADE"))
    role: Mapped[MessageRole] = mapped_column(pg_enum(MessageRole, "message_role"))
    content: Mapped[str | None] = mapped_column(Text)
    tool_calls: Mapped[list[dict[str, Any]] | None] = mapped_column(JSONB)
    tool_results: Mapped[list[dict[str, Any]] | None] = mapped_column(JSONB)
    token_usage: Mapped[dict[str, Any] | None] = mapped_column(JSONB)
    is_pinned: Mapped[bool] = mapped_column(Boolean, default=False)
    is_compressed: Mapped[bool] = mapped_column(Boolean, default=False)

    conversation: Mapped[Conversation] = relationship(back_populates="messages")


class CompressedSegment(Base):
    __tablename__ = "compressed_segments"

    id: Mapped[UUID] = uuid_pk()
    conversation_id: Mapped[UUID] = mapped_column(ForeignKey("conversations.id", ondelete="CASCADE"))
    summary: Mapped[str] = mapped_column(Text)
    original_message_ids: Mapped[list[UUID]] = mapped_column(ARRAY(PG_UUID(as_uuid=True)), default=list)
    compressed_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    conversation: Mapped[Conversation] = relationship(back_populates="compressed_segments")


class Task(Base, TimestampMixin):
    __tablename__ = "tasks"
    __table_args__ = (
        CheckConstraint("progress BETWEEN 0 AND 100", name="chk_progress"),
        CheckConstraint("novel_id IS NOT NULL OR episode_id IS NOT NULL", name="chk_task_target"),
    )

    id: Mapped[UUID] = uuid_pk()
    user_id: Mapped[UUID] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), default=DEFAULT_USER_UUID
    )
    task_type: Mapped[TaskType] = mapped_column("type", pg_enum(TaskType, "task_type"))
    novel_id: Mapped[UUID | None] = mapped_column(ForeignKey("novels.id", ondelete="CASCADE"))
    episode_id: Mapped[UUID | None] = mapped_column(ForeignKey("episodes.id", ondelete="CASCADE"))
    celery_id: Mapped[str | None] = mapped_column(Text)
    status: Mapped[TaskStatus] = mapped_column(
        pg_enum(TaskStatus, "task_status"), default=TaskStatus.pending
    )
    progress: Mapped[int] = mapped_column(Integer, default=0)
    error_message: Mapped[str | None] = mapped_column(Text)
    retry_count: Mapped[int] = mapped_column(Integer, default=0)

    novel: Mapped[Novel | None] = relationship()
    episode: Mapped[Episode | None] = relationship(back_populates="tasks")


class ProgressEvent(Base, CreatedAtMixin):
    __tablename__ = "progress_events"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    novel_id: Mapped[UUID] = mapped_column(ForeignKey("novels.id", ondelete="CASCADE"))
    event_type: Mapped[str] = mapped_column(Text)
    payload: Mapped[dict[str, Any]] = mapped_column(JSONB, default=dict)


class Export(Base, CreatedAtMixin):
    __tablename__ = "exports"

    id: Mapped[UUID] = uuid_pk()
    user_id: Mapped[UUID] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), default=DEFAULT_USER_UUID
    )
    screenplay_id: Mapped[UUID] = mapped_column(ForeignKey("screenplays.id", ondelete="CASCADE"))
    export_format: Mapped[ExportFormat] = mapped_column("format", pg_enum(ExportFormat, "export_format"))
    status: Mapped[ExportStatus] = mapped_column(
        pg_enum(ExportStatus, "export_status"), default=ExportStatus.pending
    )
    file_url: Mapped[str | None] = mapped_column(Text)
    error_message: Mapped[str | None] = mapped_column(Text)
    expires_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class Skill(Base, TimestampMixin):
    __tablename__ = "skills"

    id: Mapped[UUID] = uuid_pk()
    name: Mapped[str] = mapped_column(Text, unique=True)
    description: Mapped[str | None] = mapped_column(Text)
    content: Mapped[dict[str, Any]] = mapped_column(JSONB, default=dict)
    created_by: Mapped[str] = mapped_column(Text, default="builtin")
