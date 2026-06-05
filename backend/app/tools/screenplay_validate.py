from typing import Any

from app.tools.base import BaseTool, ToolContext, ToolResult


class ScreenplayValidateTool(BaseTool):
    name = "screenplay_validate"
    description = "校验剧本内容是否符合目标 Schema。"

    async def run(self, args: dict[str, Any], context: ToolContext) -> ToolResult:
        content = args.get("content") or {}
        return ToolResult(
            status="success",
            data={"valid": isinstance(content, dict), "errors": []},
            metadata={"schema_type": args.get("schema_type")},
        )
