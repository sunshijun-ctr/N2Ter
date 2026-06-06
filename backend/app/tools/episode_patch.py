from typing import Any
from uuid import UUID

from app.db import get_sessionmaker
from app.models import Episode
from app.services.episode_service import episode_service
from app.tools.base import BaseTool, ToolContext, ToolResult


class EpisodePatchTool(BaseTool):
    name = "episode_patch"
    description = "根据用户指令修改整集剧本。"

    async def run(self, args: dict[str, Any], context: ToolContext) -> ToolResult:
        episode_id = args.get("episode_id") or context.episode_id
        instruction = args.get("instruction")
        if not episode_id:
            return ToolResult(status="failed", error="episode_id is required")
        if not instruction:
            return ToolResult(status="failed", error="instruction is required")
        async_session = get_sessionmaker()
        async with async_session() as db:
            episode = await db.get(Episode, UUID(str(episode_id)))
            if not episode:
                return ToolResult(status="failed", error="Episode not found")
            patched = await episode_service.patch_episode(db, episode, instruction, modified_by="ai")
        return ToolResult(
            status="success",
            data={"episode_id": str(patched.id), "content": patched.content},
            metadata={"patched": True},
        )
