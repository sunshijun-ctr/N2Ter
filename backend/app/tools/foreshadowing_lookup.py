from typing import Any

from app.services.novel_context_service import novel_context_service
from app.tools.base import BaseTool, ToolContext, ToolResult


class ForeshadowingLookupTool(BaseTool):
    name = "foreshadowing_lookup"
    description = "查询指定章节附近的伏笔和呼应。"

    async def run(self, args: dict[str, Any], context: ToolContext) -> ToolResult:
        if not context.novel_id:
            return ToolResult(status="failed", error="novel_id is required")
        try:
            data = await novel_context_service.foreshadowing_lookup(
                context.novel_id,
                int(args.get("chapter_num")),
            )
        except (LookupError, TypeError, ValueError) as exc:
            return ToolResult(status="failed", error=str(exc))
        return ToolResult(status="success", data=data)
