from typing import Any

from app.tools.base import BaseTool, ToolContext, ToolResult


class ChapterGetTool(BaseTool):
    name = "chapter_get"
    description = "按章节号获取原文、摘要或关键情节。"

    async def run(self, args: dict[str, Any], context: ToolContext) -> ToolResult:
        return ToolResult(
            status="success",
            data={
                "chapter_num": args.get("chapter_num"),
                "mode": args.get("mode", "full"),
                "content": "",
            },
            metadata={"stub": True, "novel_id": context.novel_id},
        )
