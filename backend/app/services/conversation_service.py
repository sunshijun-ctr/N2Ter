from typing import Any
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import CompressedSegment, Conversation, Message, MessageRole
from app.services.conversation_compressor import conversation_compressor


class ConversationService:
    async def ensure_conversation(self, db: AsyncSession, conversation_id: UUID) -> Conversation:
        conversation = await db.get(Conversation, conversation_id)
        if not conversation:
            raise LookupError("Conversation not found")
        return conversation

    async def add_message(
        self,
        db: AsyncSession,
        conversation_id: UUID,
        role: MessageRole,
        content: str | None,
        tool_calls: list[dict[str, Any]] | None = None,
        tool_results: list[dict[str, Any]] | None = None,
        token_usage: dict[str, Any] | None = None,
        is_pinned: bool = False,
    ) -> Message:
        await self.ensure_conversation(db, conversation_id)
        message = Message(
            conversation_id=conversation_id,
            role=role,
            content=content,
            tool_calls=tool_calls,
            tool_results=tool_results,
            token_usage=token_usage,
            is_pinned=is_pinned,
            is_compressed=False,
        )
        db.add(message)
        await db.commit()
        await db.refresh(message)
        return message

    async def list_messages(self, db: AsyncSession, conversation_id: UUID) -> list[Message]:
        await self.ensure_conversation(db, conversation_id)
        result = await db.execute(
            select(Message)
            .where(Message.conversation_id == conversation_id)
            .order_by(Message.created_at.asc())
        )
        return list(result.scalars())

    async def compress_messages(
        self, db: AsyncSession, conversation_id: UUID, keep_recent: int = 4
    ) -> CompressedSegment:
        messages = await self.list_messages(db, conversation_id)
        active_messages = [message for message in messages if not message.is_compressed]
        preserved_ids = {message.id for message in active_messages[-keep_recent:]} if keep_recent else set()
        candidates = [
            message
            for message in active_messages
            if not message.is_pinned and message.id not in preserved_ids
        ]
        if not candidates:
            raise ValueError("No compressible messages found")

        payload = [
            {
                "id": message.id,
                "role": message.role.value,
                "content": message.content,
            }
            for message in candidates
        ]
        compressed = await conversation_compressor.compress(payload)
        segment = CompressedSegment(
            conversation_id=conversation_id,
            summary=compressed["summary"],
            original_message_ids=compressed["original_message_ids"],
        )
        db.add(segment)
        for message in candidates:
            message.is_compressed = True
        await db.commit()
        await db.refresh(segment)
        return segment

    async def list_compressed_segments(
        self, db: AsyncSession, conversation_id: UUID
    ) -> list[CompressedSegment]:
        await self.ensure_conversation(db, conversation_id)
        result = await db.execute(
            select(CompressedSegment)
            .where(CompressedSegment.conversation_id == conversation_id)
            .order_by(CompressedSegment.compressed_at.desc())
        )
        return list(result.scalars())


conversation_service = ConversationService()
