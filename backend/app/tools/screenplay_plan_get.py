from typing import Any
from uuid import UUID

from app.db import get_sessionmaker
from app.models import Screenplay
from app.tools.base import BaseTool, ToolContext, ToolResult


class ScreenplayPlanGetTool(BaseTool):
    name = "screenplay_plan_get"
    description = "获取当前 screenplay 的 adaptation plan。"
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
            return ToolResult(
                status="success",
                data={
                    "screenplay_id": str(screenplay.id),
                    "schema_type": screenplay.schema_type.value,
                    "adaptation_plan": screenplay.adaptation_plan or {},
                    "style_preferences": screenplay.style_preferences or {},
                },
            )
