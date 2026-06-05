from typing import Any

from app.tools.base import BaseTool, ToolContext, ToolResult


class ForeshadowingLookupTool(BaseTool):
    name = "foreshadowing_lookup"
    description = "查询指定章节附近的伏笔和呼应。"

    async def run(self, args: dict[str, Any], context: ToolContext) -> ToolResult:
        return ToolResult(status="success", data=[], metadata={"stub": True})
