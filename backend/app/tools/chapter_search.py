from typing import Any

from app.services.novel_context_service import novel_context_service
from app.tools.base import BaseTool, ToolContext, ToolResult


class ChapterSearchTool(BaseTool):
    name = "chapter_search"
    description = "用向量检索查找相关原文片段。"

    async def run(self, args: dict[str, Any], context: ToolContext) -> ToolResult:
        if not context.novel_id:
            return ToolResult(status="failed", error="novel_id is required")
        query = args.get("query")
        if not query:
            return ToolResult(status="failed", error="query is required")
        chapter_range = args.get("chapter_range")
        if chapter_range:
            chapter_range = (int(chapter_range[0]), int(chapter_range[1]))
        data = await novel_context_service.chapter_search(
            context.novel_id,
            query,
            int(args.get("top_k", 5)),
            chapter_range,
        )
        return ToolResult(status="success", data=data, metadata={"query": query})
