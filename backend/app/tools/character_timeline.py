from typing import Any

from app.tools.base import BaseTool, ToolContext, ToolResult


class CharacterTimelineTool(BaseTool):
    name = "character_timeline"
    description = "查询角色弧光和章节内变化。"

    async def run(self, args: dict[str, Any], context: ToolContext) -> ToolResult:
        return ToolResult(
            status="success",
            data={"character_name": args.get("character_name"), "timeline": []},
            metadata={"stub": True},
        )
