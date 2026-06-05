from typing import Any

from app.tools.base import BaseTool, ToolContext, ToolResult


class Text2ScreenplayTool(BaseTool):
    name = "text2screenplay"
    description = "基于章节上下文生成单集剧本。"

    async def run(self, args: dict[str, Any], context: ToolContext) -> ToolResult:
        episode_num = args.get("episode_num", 1)
        return ToolResult(
            status="success",
            data={
                "episode_number": episode_num,
                "title": f"第 {episode_num} 集",
                "scenes": [],
            },
            metadata={"stub": True, "schema_type": args.get("schema_type", "screenwriter")},
        )
