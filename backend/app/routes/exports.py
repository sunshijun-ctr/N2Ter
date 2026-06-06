from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.db import get_db
from app.models import Export, ExportStatus, Screenplay
from app.schemas import ExportCreate, ExportRead

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
    export = Export(
        screenplay_id=screenplay_id,
        export_format=payload.export_format,
        status=ExportStatus.pending,
    )
    db.add(export)
    await db.commit()
    await db.refresh(export)
    return export


@router.get("/exports/{export_id}/download", response_model=ExportRead)
async def download_export(export_id: UUID, db: AsyncSession = Depends(get_db)) -> Export:
    export = await db.get(Export, export_id)
    if not export:
        raise HTTPException(status_code=404, detail="Export not found")
    return export
