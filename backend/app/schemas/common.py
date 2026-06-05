from datetime import datetime
from typing import Any
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field


class APIHealth(BaseModel):
    status: str = "ok"
    service: str


class TaskRef(BaseModel):
    task_id: UUID
    status: str


class ORMModel(BaseModel):
    model_config = ConfigDict(from_attributes=True)


class ErrorResponse(BaseModel):
    error: str
    detail: str | None = None


class Timestamped(ORMModel):
    created_at: datetime
    updated_at: datetime


class ToolResult(BaseModel):
    status: str = Field(pattern="^(success|failed|running)$")
    data: Any = None
    metadata: dict[str, Any] = Field(default_factory=dict)
    error: str | None = None
