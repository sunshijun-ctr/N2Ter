from typing import Any


class ConversationCompressor:
    async def compress(self, messages: list[dict[str, Any]]) -> dict[str, Any]:
        lines = [f"Compressed {len(messages)} conversation messages:"]
        for message in messages:
            content = (message.get("content") or "").strip().replace("\n", " ")
            if len(content) > 160:
                content = f"{content[:157]}..."
            role = message.get("role", "unknown")
            lines.append(f"- {role}: {content}")

        return {
            "summary": "\n".join(lines),
            "message_count": len(messages),
            "original_message_ids": [message["id"] for message in messages],
        }


conversation_compressor = ConversationCompressor()
