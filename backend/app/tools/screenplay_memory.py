from typing import Any
from uuid import UUID

from app.db import get_sessionmaker
from app.models import Screenplay
from app.services.screenplay_memory_service import screenplay_memory_service
from app.tools.base import BaseTool, ToolContext, ToolResult


class ScreenplayMemoryGetTool(BaseTool):
    name = "screenplay_memory_get"
    description = "获取当前 screenplay 的结构化连续性记忆。"
    parameters = {
        "type": "object",
        "properties": {
            "screenplay_id": {"type": "string", "description": "剧本 id；缺省使用上下文。"},
        },
    }

    async def run(self, args: dict[str, Any], context: ToolContext) -> ToolResult:
        screenplay_id = args.get("screenplay_id") or context.screenplay_id
        if not screenplay_id:
            return ToolResult(status="failed", error="screenplay_id is required")
        async_session = get_sessionmaker()
        async with async_session() as db:
            screenplay = await db.get(Screenplay, UUID(str(screenplay_id)))
            if not screenplay:
                return ToolResult(status="failed", error="Screenplay not found")
            return ToolResult(status="success", data=screenplay_memory_service.get_memory(screenplay))


class ScreenplayMemoryUpdateTool(BaseTool):
    name = "screenplay_memory_update"
    description = "写入某集生成或改稿后的 memory patch。"
    parameters = {
        "type": "object",
        "properties": {
            "screenplay_id": {"type": "string", "description": "剧本 id；缺省使用上下文。"},
            "memory_patch": {"type": "object", "description": "单集 memory patch。"},
        },
        "required": ["memory_patch"],
    }

    async def run(self, args: dict[str, Any], context: ToolContext) -> ToolResult:
        screenplay_id = args.get("screenplay_id") or context.screenplay_id
        patch = args.get("memory_patch") or {}
        if not screenplay_id:
            return ToolResult(status="failed", error="screenplay_id is required")
        async_session = get_sessionmaker()
        async with async_session() as db:
            screenplay = await db.get(Screenplay, UUID(str(screenplay_id)))
            if not screenplay:
                return ToolResult(status="failed", error="Screenplay not found")
            memory = screenplay_memory_service.apply_patch(screenplay, patch)
            await db.commit()
            return ToolResult(status="success", data=memory)
