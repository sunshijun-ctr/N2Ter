from uuid import UUID

from pydantic import BaseModel

from datetime import datetime

from app.models.enums import ExportFormat, ExportStatus
from app.schemas.common import ORMModel


class ExportCreate(BaseModel):
    export_format: ExportFormat = ExportFormat.yaml


class ExportRead(ORMModel):
    id: UUID
    screenplay_id: UUID
    export_format: ExportFormat
    status: ExportStatus
    file_url: str | None = None
    error_message: str | None = None
    created_at: datetime
    expires_at: datetime | None = None
