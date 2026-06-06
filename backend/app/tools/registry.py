from __future__ import annotations

from typing import Any

from app.tools.base import BaseTool, ToolContext, ToolResult
from app.tools.chapter_get import ChapterGetTool
from app.tools.chapter_search import ChapterSearchTool
from app.tools.character_timeline import CharacterTimelineTool
from app.tools.episode_patch import EpisodePatchTool
from app.tools.foreshadowing_lookup import ForeshadowingLookupTool
from app.tools.screenplay_validate import ScreenplayValidateTool
from app.tools.text2screenplay import Text2ScreenplayTool


class ToolRegistry:
    def __init__(self) -> None:
        tools = [
            ChapterGetTool(),
            ChapterSearchTool(),
            CharacterTimelineTool(),
            ForeshadowingLookupTool(),
            Text2ScreenplayTool(),
            EpisodePatchTool(),
            ScreenplayValidateTool(),
        ]
        self._tools: dict[str, BaseTool] = {tool.name: tool for tool in tools}

    def list(self) -> list[dict[str, str]]:
        return [{"name": tool.name, "description": tool.description} for tool in self._tools.values()]

    def get(self, name: str) -> BaseTool:
        return self._tools[name]

    def openai_tools(self) -> list[dict[str, Any]]:
        """Tool specs in OpenAI function-calling format."""
        return [
            {
                "type": "function",
                "function": {
                    "name": tool.name,
                    "description": tool.description,
                    "parameters": tool.parameters,
                },
            }
            for tool in self._tools.values()
        ]

    async def execute(
        self, name: str, args: dict[str, Any], context: ToolContext
    ) -> ToolResult:
        tool = self._tools.get(name)
        if tool is None:
            return ToolResult(status="failed", error=f"Unknown tool: {name}")
        try:
            return await tool.run(args, context)
        except Exception as exc:  # noqa: BLE001 - surface tool errors to the agent
            return ToolResult(status="failed", error=str(exc))


tool_registry = ToolRegistry()
