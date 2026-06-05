from uuid import UUID

from pydantic import BaseModel

from app.models.enums import ExportFormat
from app.schemas.common import Timestamped


class ExportCreate(BaseModel):
    export_format: ExportFormat = ExportFormat.yaml


class ExportRead(Timestamped):
    id: UUID
    screenplay_id: UUID
    export_format: ExportFormat
    status: str
    file_url: str | None = None
