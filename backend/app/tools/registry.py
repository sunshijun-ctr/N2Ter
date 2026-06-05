from app.tools.base import BaseTool
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


tool_registry = ToolRegistry()
