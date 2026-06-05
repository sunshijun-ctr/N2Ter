from typing import Any

from app.tools.base import BaseTool, ToolContext, ToolResult


class ChapterSearchTool(BaseTool):
    name = "chapter_search"
    description = "用向量检索查找相关原文片段。"

    async def run(self, args: dict[str, Any], context: ToolContext) -> ToolResult:
        return ToolResult(status="success", data=[], metadata={"stub": True, "query": args.get("query")})
