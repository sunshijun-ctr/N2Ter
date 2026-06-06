from typing import Any
from uuid import UUID

from pydantic import BaseModel, Field

from app.models.enums import ConversationContext, MessageRole
from app.schemas.common import ORMModel, Timestamped


class ConversationCreate(BaseModel):
    novel_id: UUID
    screenplay_id: UUID | None = None
    context_type: ConversationContext = ConversationContext.conversation
    title: str | None = "新对话"


class ConversationRead(Timestamped):
    id: UUID
    title: str
    context_type: ConversationContext
    novel_id: UUID | None = None
    screenplay_id: UUID | None = None


class MessageRead(ORMModel):
    id: UUID
    conversation_id: UUID
    role: MessageRole
    content: str | None = None
    tool_calls: list[dict[str, Any]] | None = None
    tool_results: list[dict[str, Any]] | None = None
    token_usage: dict[str, Any] | None = None
    is_pinned: bool = False
    is_compressed: bool = False


class MessageCreate(BaseModel):
    role: MessageRole = MessageRole.user
    content: str | None = None
    tool_calls: list[dict[str, Any]] | None = None
    tool_results: list[dict[str, Any]] | None = None
    token_usage: dict[str, Any] | None = None
    is_pinned: bool = False


class ConversationCompressRequest(BaseModel):
    keep_recent: int = Field(default=4, ge=0, le=50)


class CompressedSegmentRead(ORMModel):
    id: UUID
    conversation_id: UUID
    summary: str
    original_message_ids: list[UUID]
