from typing import Any
from uuid import UUID

from app.schemas.common import Timestamped


class SkillRead(Timestamped):
    id: UUID
    name: str
    description: str | None = None
    content: dict[str, Any]
    created_by: str
