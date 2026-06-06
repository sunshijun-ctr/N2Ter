from typing import Any
from uuid import UUID

from sqlalchemy import select

from app.db import get_sessionmaker
from app.models import Episode
from app.tools.base import BaseTool, ToolContext, ToolResult


class EpisodeGetTool(BaseTool):
    name = "episode_get"
    description = "获取已生成或待生成 episode 的内容。"
    parameters = {
        "type": "object",
        "properties": {
            "episode_id": {"type": "string", "description": "目标集 id；缺省使用上下文。"},
            "episode_num": {"type": "integer", "description": "目标集序号。"},
            "mode": {"type": "string", "enum": ["summary", "full"], "description": "返回摘要或完整内容。"},
        },
    }

    async def run(self, args: dict[str, Any], context: ToolContext) -> ToolResult:
        episode_id = args.get("episode_id") or context.episode_id
        mode = args.get("mode", "summary")
        async_session = get_sessionmaker()
        async with async_session() as db:
            episode = None
            if episode_id:
                episode = await db.get(Episode, UUID(str(episode_id)))
            elif context.screenplay_id and args.get("episode_num"):
                result = await db.execute(
                    select(Episode).where(
                        Episode.screenplay_id == UUID(str(context.screenplay_id)),
                        Episode.episode_num == int(args["episode_num"]),
                    )
                )
                episode = result.scalar_one_or_none()
            if not episode:
                return ToolResult(status="failed", error="Episode not found")
            content = episode.content or {}
            data: dict[str, Any] = {
                "episode_id": str(episode.id),
                "episode_num": episode.episode_num,
                "title": episode.title,
                "status": episode.status.value,
                "source_chapters": episode.source_chapters,
            }
            if mode == "full":
                data["content"] = content
            else:
                data["summary"] = (
                    content.get("episode_summary")
                    or content.get("summary")
                    or content.get("title")
                    or episode.title
                )
            return ToolResult(status="success", data=data)
