from typing import Any
from uuid import UUID

from app.db import get_sessionmaker
from app.models import Episode, EpisodeStatus, Screenplay
from app.services.episode_service import episode_service
from app.services.screenplay_memory_service import screenplay_memory_service
from app.tools.base import BaseTool, ToolContext, ToolResult


class EpisodeRewriteTool(BaseTool):
    name = "episode_rewrite"
    description = "保存 ChatAgent 生成的整集级改稿，并同步 memory patch。"
    parameters = {
        "type": "object",
        "properties": {
            "episode_id": {"type": "string", "description": "目标集 id；缺省使用上下文。"},
            "content": {"type": "object", "description": "修改后的整集 episode content。"},
            "memory_patch": {"type": "object", "description": "该集新的 memory patch。"},
            "revision_summary": {"type": "array", "items": {"type": "string"}},
        },
        "required": ["content", "memory_patch"],
    }

    async def run(self, args: dict[str, Any], context: ToolContext) -> ToolResult:
        episode_id = args.get("episode_id") or context.episode_id
        content = args.get("content")
        memory_patch = args.get("memory_patch") or {}
        if not episode_id:
            return ToolResult(status="failed", error="episode_id is required")
        if not isinstance(content, dict):
            return ToolResult(status="failed", error="content must be an object")

        async_session = get_sessionmaker()
        async with async_session() as db:
            episode = await db.get(Episode, UUID(str(episode_id)))
            if not episode:
                return ToolResult(status="failed", error="Episode not found")
            screenplay = await db.get(Screenplay, episode.screenplay_id)
            if not screenplay:
                return ToolResult(status="failed", error="Screenplay not found")
            episode.content = content
            episode.status = EpisodeStatus.done
            await episode_service.save_version(db, episode, content, modified_by="ai")
            screenplay_memory_service.apply_patch(screenplay, memory_patch)
            await db.commit()
            await db.refresh(episode)
            return ToolResult(
                status="success",
                data={
                    "episode_id": str(episode.id),
                    "content": episode.content,
                    "memory_patch": memory_patch,
                    "revision_summary": args.get("revision_summary") or [],
                },
            )
