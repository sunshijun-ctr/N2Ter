from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import FileResponse
from sqlalchemy.ext.asyncio import AsyncSession

from app.core import get_settings
from app.db import get_db
from app.models import Export, ExportStatus, Screenplay
from app.schemas import ExportCreate, ExportRead
from app.services.export_service import export_service
from app.services.storage_service import storage_service

router = APIRouter(tags=["exports"])


@router.post(
    "/screenplays/{screenplay_id}/export",
    response_model=ExportRead,
    status_code=status.HTTP_202_ACCEPTED,
)
async def create_export(
    screenplay_id: UUID, payload: ExportCreate, db: AsyncSession = Depends(get_db)
) -> Export:
    screenplay = await db.get(Screenplay, screenplay_id)
    if not screenplay:
        raise HTTPException(status_code=404, detail="Screenplay not found")

    if get_settings().async_tasks_enabled:
        export = await export_service.create_export_record(
            db, screenplay, payload.export_format, ExportStatus.pending
        )
        await db.commit()
        await db.refresh(export)
        from app.workers.tasks import export_screenplay

        export_screenplay.delay(str(export.id))
        return export

    return await export_service.create_export(db, screenplay, payload.export_format)


@router.get("/exports/{export_id}", response_model=ExportRead)
async def get_export(export_id: UUID, db: AsyncSession = Depends(get_db)) -> Export:
    export = await db.get(Export, export_id)
    if not export:
        raise HTTPException(status_code=404, detail="Export not found")
    return export


@router.get("/exports/{export_id}/download")
async def download_export(export_id: UUID, db: AsyncSession = Depends(get_db)) -> FileResponse:
    try:
        export = await export_service.get_export(db, export_id)
    except LookupError:
        raise HTTPException(status_code=404, detail="Export not found") from None
    if not export.file_url:
        raise HTTPException(status_code=404, detail="Export file not ready")
    path = storage_service.resolve(export.file_url)
    if not path.exists():
        raise HTTPException(status_code=404, detail="Export file missing")
    media_types = {
        ".yaml": "application/x-yaml",
        ".pdf": "application/pdf",
        ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        ".zip": "application/zip",
    }
    media_type = media_types.get(path.suffix, "application/octet-stream")
    filename = await export_service.download_filename(db, export)
    return FileResponse(path, filename=filename, media_type=media_type)
