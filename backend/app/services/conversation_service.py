from typing import Any
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core import get_settings
from app.models import CompressedSegment, Conversation, Message, MessageRole
from app.services.conversation_compressor import conversation_compressor
from app.services.llm_service import LLMError, llm_service
from app.services.token_estimator import estimate_tokens

_PLACEHOLDER_TITLES = {None, "", "新对话"}
_TITLE_SYSTEM_PROMPT = (
    "你是会话标题生成器。根据给定的剧本修改对话，生成一个简洁、能概括主题的中文标题，"
    "不超过 12 个字。只输出标题本身，不要引号、标点包裹或任何解释。"
)


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
        if not is_pinned and self._should_autopin(role, content):
            is_pinned = True
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
        await self.maybe_autotitle(db, conversation_id)
        await self.maybe_autocompress(db, conversation_id)
        return message

    async def maybe_autotitle(
        self, db: AsyncSession, conversation_id: UUID
    ) -> str | None:
        """Auto-generate a conversation title after a few rounds (Design.md
        §10.4.4). No-op when disabled, when a real title already exists, or
        before the threshold. Never raises into the caller."""
        settings = get_settings()
        if not settings.auto_title_enabled:
            return None
        conversation = await db.get(Conversation, conversation_id)
        if conversation is None or conversation.title not in _PLACEHOLDER_TITLES:
            return None
        messages = await self.list_messages(db, conversation_id)
        if len(messages) < settings.auto_title_after_messages:
            return None

        title = await self._generate_title(messages)
        if not title:
            return None
        conversation.title = title
        await db.commit()
        await db.refresh(conversation)
        return title

    async def _generate_title(self, messages: list[Message]) -> str:
        if llm_service.enabled:
            transcript = "\n".join(
                f"{message.role.value}: {(message.content or '').strip()}"
                for message in messages[: get_settings().auto_title_after_messages]
                if message.content
            )
            try:
                raw = await llm_service.generate_text(
                    system=_TITLE_SYSTEM_PROMPT, user=transcript, temperature=0.3, max_tokens=32
                )
                title = raw.strip().strip("。.！!？?\"'《》「」 \n")
                if title:
                    return title[:20]
            except LLMError:
                pass
        return self._fallback_title(messages)

    def _fallback_title(self, messages: list[Message]) -> str:
        for message in messages:
            if message.role == MessageRole.user and message.content:
                snippet = message.content.strip().replace("\n", " ")
                return snippet[:16] or "新对话"
        return "新对话"

    def _should_autopin(self, role: MessageRole, content: str | None) -> bool:
        """Pin user messages that record a key decision (Design.md §10.4.3),
        so they are never dropped during compression."""
        settings = get_settings()
        if not settings.auto_pin_enabled or role != MessageRole.user or not content:
            return False
        return any(keyword in content for keyword in settings.pinned_keywords)

    async def count_active_tokens(self, db: AsyncSession, conversation_id: UUID) -> int:
        """Estimated token count of the not-yet-compressed messages."""
        messages = await self.list_messages(db, conversation_id)
        return sum(
            estimate_tokens(message.content)
            for message in messages
            if not message.is_compressed
        )

    async def maybe_autocompress(
        self, db: AsyncSession, conversation_id: UUID
    ) -> CompressedSegment | None:
        """Auto-compress when active tokens cross the configured threshold
        (Design.md §10.4.3). No-op when disabled, under threshold, or when
        there is nothing compressible. Never raises into the caller."""
        settings = get_settings()
        if not settings.auto_compress_enabled:
            return None
        if await self.count_active_tokens(db, conversation_id) < settings.compression_trigger_tokens:
            return None
        try:
            return await self.compress_messages(
                db, conversation_id, keep_recent=settings.compression_keep_recent
            )
        except ValueError:
            # Nothing compressible (all pinned / within the recent window).
            return None

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
