from typing import Any
from uuid import UUID

from app.db import get_sessionmaker
from app.models import Episode
from app.tools.base import BaseTool, ToolContext, ToolResult


class Text2ScreenplayTool(BaseTool):
    name = "text2screenplay"
    description = "基于章节上下文生成单集剧本。"
    parameters = {
        "type": "object",
        "properties": {
            "episode_id": {"type": "string", "description": "目标集 id；缺省时用上下文当前集"},
        },
    }

    async def run(self, args: dict[str, Any], context: ToolContext) -> ToolResult:
        episode_id = args.get("episode_id") or context.episode_id
        if not episode_id:
            return ToolResult(status="failed", error="episode_id is required")

        async_session = get_sessionmaker()
        async with async_session() as db:
            from app.services.episode_writing_agent_service import (
                episode_writing_agent_service,
            )

            episode = await db.get(Episode, UUID(str(episode_id)))
            if not episode:
                return ToolResult(status="failed", error="Episode not found")
            generated_episode, task, _ = await episode_writing_agent_service.generate_episode(
                db, episode
            )

        return ToolResult(
            status="success",
            data=generated_episode.content,
            metadata={"task_id": str(task.id), "episode_id": str(generated_episode.id)},
        )
