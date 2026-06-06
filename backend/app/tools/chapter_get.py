from typing import Any

from app.services.novel_context_service import novel_context_service
from app.tools.base import BaseTool, ToolContext, ToolResult


class ChapterGetTool(BaseTool):
    name = "chapter_get"
    description = "按章节号获取原文、摘要或关键情节。"

    async def run(self, args: dict[str, Any], context: ToolContext) -> ToolResult:
        if not context.novel_id:
            return ToolResult(status="failed", error="novel_id is required")
        try:
            data = await novel_context_service.chapter_get(
                context.novel_id,
                int(args.get("chapter_num")),
                args.get("mode", "full"),
            )
        except (LookupError, TypeError, ValueError) as exc:
            return ToolResult(status="failed", error=str(exc))
        return ToolResult(status="success", data=data, metadata={"novel_id": context.novel_id})
