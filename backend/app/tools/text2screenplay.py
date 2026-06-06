from typing import Any
from uuid import UUID

from app.db import get_sessionmaker
from app.models import Episode
from app.services.generation_service import generation_service
from app.tools.base import BaseTool, ToolContext, ToolResult


class Text2ScreenplayTool(BaseTool):
    name = "text2screenplay"
    description = "基于章节上下文生成单集剧本。"

    async def run(self, args: dict[str, Any], context: ToolContext) -> ToolResult:
        episode_id = args.get("episode_id") or context.episode_id
        if not episode_id:
            return ToolResult(status="failed", error="episode_id is required")

        async_session = get_sessionmaker()
        async with async_session() as db:
            episode = await db.get(Episode, UUID(str(episode_id)))
            if not episode:
                return ToolResult(status="failed", error="Episode not found")
            generated_episode, task = await generation_service.generate_episode_fallback(db, episode)

        return ToolResult(
            status="success",
            data=generated_episode.content,
            metadata={"task_id": str(task.id), "episode_id": str(generated_episode.id)},
        )
