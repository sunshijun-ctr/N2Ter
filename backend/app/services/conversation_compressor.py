"""Conversation compressor (Design.md §10.4.3 — Anchor + Compress).

Compresses the *middle* span of a conversation (head/tail/pinned already
excluded by the caller) into a few bullet points. Uses the ``summarizer_agent``
LLM when configured; otherwise falls back to a deterministic concatenation so
compression always works offline.
"""

from typing import Any

from app.services.llm_service import LLMError, llm_service
from app.services.prompt_loader import prompt_loader


class ConversationCompressor:
    async def compress(self, messages: list[dict[str, Any]]) -> dict[str, Any]:
        summary = None
        if llm_service.enabled and messages:
            try:
                summary = await self._llm_summary(messages)
            except (LLMError, FileNotFoundError):
                summary = None
        if not summary:
            summary = self._fallback_summary(messages)

        return {
            "summary": summary,
            "message_count": len(messages),
            "original_message_ids": [message["id"] for message in messages],
        }

    async def _llm_summary(self, messages: list[dict[str, Any]]) -> str:
        system_prompt = prompt_loader.load("summarizer_agent")
        transcript = "\n".join(
            f"{message.get('role', 'unknown')}: {(message.get('content') or '').strip()}"
            for message in messages
        )
        summary = await llm_service.generate_text(
            system=system_prompt,
            user=transcript,
            temperature=0.2,
        )
        return summary.strip()

    def _fallback_summary(self, messages: list[dict[str, Any]]) -> str:
        lines = [f"Compressed {len(messages)} conversation messages:"]
        for message in messages:
            content = (message.get("content") or "").strip().replace("\n", " ")
            if len(content) > 160:
                content = f"{content[:157]}..."
            role = message.get("role", "unknown")
            lines.append(f"- {role}: {content}")
        return "\n".join(lines)


conversation_compressor = ConversationCompressor()
