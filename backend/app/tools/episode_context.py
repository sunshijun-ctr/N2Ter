from typing import Any
from uuid import UUID

from sqlalchemy import select

from app.db import get_sessionmaker
from app.models import Episode
from app.tools.base import BaseTool, ToolContext, ToolResult


class EpisodeContextTool(BaseTool):
    name = "episode_context"
    description = "获取当前集的上一集摘要、下一集计划和当前集状态。"
    parameters = {
        "type": "object",
        "properties": {
            "episode_id": {"type": "string", "description": "目标集 id；缺省使用上下文。"},
        },
    }

    async def run(self, args: dict[str, Any], context: ToolContext) -> ToolResult:
        episode_id = args.get("episode_id") or context.episode_id
        if not episode_id:
            return ToolResult(status="failed", error="episode_id is required")
        async_session = get_sessionmaker()
        async with async_session() as db:
            episode = await db.get(Episode, UUID(str(episode_id)))
            if not episode:
                return ToolResult(status="failed", error="Episode not found")
            rows = await db.execute(
                select(Episode).where(Episode.screenplay_id == episode.screenplay_id)
            )
            by_num = {item.episode_num: item for item in rows.scalars()}
            previous = by_num.get(episode.episode_num - 1)
            next_ep = by_num.get(episode.episode_num + 1)
            return ToolResult(
                status="success",
                data={
                    "episode_id": str(episode.id),
                    "episode_num": episode.episode_num,
                    "current_status": episode.status.value,
                    "previous": self._brief(previous),
                    "next": self._brief(next_ep),
                },
            )

    @staticmethod
    def _brief(episode: Episode | None) -> dict[str, Any] | None:
        if not episode:
            return None
        content = episode.content or {}
        return {
            "episode_id": str(episode.id),
            "episode_num": episode.episode_num,
            "title": episode.title,
            "status": episode.status.value,
            "summary": content.get("episode_summary") or content.get("summary") or episode.title,
            "source_chapters": episode.source_chapters,
        }
