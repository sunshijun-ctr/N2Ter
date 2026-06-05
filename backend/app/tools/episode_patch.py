from typing import Any

from app.tools.base import BaseTool, ToolContext, ToolResult


class EpisodePatchTool(BaseTool):
    name = "episode_patch"
    description = "根据用户指令修改整集剧本。"

    async def run(self, args: dict[str, Any], context: ToolContext) -> ToolResult:
        return ToolResult(
            status="success",
            data={"episode_id": args.get("episode_id") or context.episode_id, "patched": True},
            metadata={"stub": True},
        )
