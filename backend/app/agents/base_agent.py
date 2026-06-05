from typing import Any

from app.services.llm_service import llm_service
from app.tools.base import ToolContext
from app.tools.registry import tool_registry


class BaseAgent:
    prompt_name: str

    def __init__(self) -> None:
        self.tools = tool_registry
        self.llm = llm_service

    async def run(self, payload: dict[str, Any], context: ToolContext | None = None) -> dict[str, Any]:
        return {
            "agent": self.__class__.__name__,
            "payload": payload,
            "context": (context or ToolContext()).model_dump(),
            "status": "stub",
        }
