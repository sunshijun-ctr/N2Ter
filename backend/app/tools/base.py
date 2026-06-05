from abc import ABC, abstractmethod
from typing import Any

from pydantic import BaseModel, Field


class ToolContext(BaseModel):
    novel_id: str | None = None
    screenplay_id: str | None = None
    episode_id: str | None = None


class ToolResult(BaseModel):
    status: str = Field(pattern="^(success|failed)$")
    data: Any = None
    metadata: dict[str, Any] = Field(default_factory=dict)
    error: str | None = None


class BaseTool(ABC):
    name: str
    description: str

    @abstractmethod
    async def run(self, args: dict[str, Any], context: ToolContext) -> ToolResult:
        raise NotImplementedError
