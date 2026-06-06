from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.exporters.yaml_exporter import YAMLExporter
from app.models import Episode, Export, ExportFormat, ExportStatus, Screenplay
from app.services.storage_service import storage_service


class ExportService:
    async def create_export(
        self,
        db: AsyncSession,
        screenplay: Screenplay,
        export_format: ExportFormat,
    ) -> Export:
        export = Export(
            screenplay_id=screenplay.id,
            export_format=export_format,
            status=ExportStatus.running,
        )
        db.add(export)
        await db.flush()

        if export_format != ExportFormat.yaml:
            export.status = ExportStatus.failed
            export.error_message = "Only YAML export is implemented in the MVP backend."
            await db.commit()
            await db.refresh(export)
            return export

        payload = await self.build_screenplay_payload(db, screenplay)
        content = YAMLExporter().render(payload)
        relative_path = f"exports/{screenplay.id}/{export.id}.yaml"
        export.file_url = storage_service.write_text(relative_path, content)
        export.status = ExportStatus.done
        await db.commit()
        await db.refresh(export)
        return export

    async def build_screenplay_payload(self, db: AsyncSession, screenplay: Screenplay) -> dict:
        result = await db.execute(
            select(Episode)
            .where(Episode.screenplay_id == screenplay.id)
            .order_by(Episode.episode_num.asc())
        )
        episodes = list(result.scalars())
        return {
            "screenplay_id": str(screenplay.id),
            "novel_id": str(screenplay.novel_id),
            "schema_type": screenplay.schema_type.value,
            "schema_version": screenplay.schema_version,
            "title": screenplay.title,
            "adaptation_plan": screenplay.adaptation_plan or {},
            "episodes": [
                {
                    "episode_id": str(episode.id),
                    "episode_number": episode.episode_num,
                    "title": episode.title,
                    "source_chapters": episode.source_chapters,
                    "status": episode.status.value,
                    "content": episode.content or {},
                }
                for episode in episodes
            ],
        }

    async def get_export(self, db: AsyncSession, export_id: UUID) -> Export:
        export = await db.get(Export, export_id)
        if not export:
            raise LookupError("Export not found")
        return export


export_service = ExportService()
