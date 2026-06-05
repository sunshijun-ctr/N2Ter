from typing import Any
from uuid import UUID

from pydantic import BaseModel

from app.models.enums import ConversationContext, MessageRole
from app.schemas.common import Timestamped


class ConversationCreate(BaseModel):
    novel_id: UUID | None = None
    screenplay_id: UUID | None = None
    context_type: ConversationContext = ConversationContext.conversation
    title: str = "新对话"


class ConversationRead(Timestamped):
    id: UUID
    title: str
    context_type: ConversationContext
    novel_id: UUID | None = None
    screenplay_id: UUID | None = None


class MessageRead(BaseModel):
    id: UUID
    role: MessageRole
    content: str
    metadata: dict[str, Any] = {}
