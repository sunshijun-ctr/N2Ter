from typing import Any

from app.services.novel_context_service import novel_context_service
from app.tools.base import BaseTool, ToolContext, ToolResult


class CharacterTimelineTool(BaseTool):
    name = "character_timeline"
    description = "查询角色弧光和章节内变化，保证人物前后一致。"
    parameters = {
        "type": "object",
        "properties": {
            "character_name": {"type": "string", "description": "角色名"},
            "chapter_range": {
                "type": "array",
                "items": {"type": "integer"},
                "description": "可选，限定章节范围 [起, 止]",
            },
        },
        "required": ["character_name"],
    }

    async def run(self, args: dict[str, Any], context: ToolContext) -> ToolResult:
        if not context.novel_id:
            return ToolResult(status="failed", error="novel_id is required")
        character_name = args.get("character_name")
        if not character_name:
            return ToolResult(status="failed", error="character_name is required")
        chapter_range = args.get("chapter_range")
        if chapter_range:
            chapter_range = (int(chapter_range[0]), int(chapter_range[1]))
        try:
            data = await novel_context_service.character_timeline(
                context.novel_id, character_name, chapter_range
            )
        except LookupError as exc:
            return ToolResult(status="failed", error=str(exc))
        return ToolResult(status="success", data=data)
