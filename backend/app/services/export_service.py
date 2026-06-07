import io
import zipfile
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.exporters.pdf_exporter import pdf_exporter
from app.exporters.word_exporter import word_exporter
from app.exporters.yaml_exporter import YAMLExporter
from app.models import Episode, Export, ExportFormat, ExportStatus, Novel, Screenplay
from app.services.character_profile_utils import ensure_character_profiles
from app.services.export_filename import export_basename
from app.services.storage_service import storage_service


class ExportService:
    async def create_export(
        self,
        db: AsyncSession,
        screenplay: Screenplay,
        export_format: ExportFormat,
    ) -> Export:
        """Synchronous path: create the record and render it in-request."""
        export = await self.create_export_record(
            db, screenplay, export_format, ExportStatus.running
        )
        return await self.render_export(db, export, screenplay)

    async def create_export_record(
        self,
        db: AsyncSession,
        screenplay: Screenplay,
        export_format: ExportFormat,
        status: ExportStatus,
    ) -> Export:
        export = Export(
            screenplay_id=screenplay.id,
            export_format=export_format,
            status=status,
        )
        db.add(export)
        await db.flush()
        return export

    async def render_export(
        self,
        db: AsyncSession,
        export: Export,
        screenplay: Screenplay | None = None,
    ) -> Export:
        """Render an existing export record to storage (used by both the
        synchronous path and the Celery worker)."""
        if screenplay is None:
            screenplay = await db.get(Screenplay, export.screenplay_id)
        if screenplay is None:
            export.status = ExportStatus.failed
            export.error_message = "Screenplay not found"
            await db.commit()
            await db.refresh(export)
            return export

        export.status = ExportStatus.running
        payload = await self.build_screenplay_payload(db, screenplay)
        try:
            relative_path = self._render_to_storage(
                screenplay, export.id, export.export_format, payload
            )
        except Exception as exc:  # noqa: BLE001 - report failure to the user
            export.status = ExportStatus.failed
            export.error_message = str(exc)
            await db.commit()
            await db.refresh(export)
            return export

        export.file_url = relative_path
        export.status = ExportStatus.done
        await db.commit()
        await db.refresh(export)
        return export

    def _render_to_storage(
        self,
        screenplay: Screenplay,
        export_id: UUID,
        export_format: ExportFormat,
        payload: dict,
    ) -> str:
        base = f"exports/{screenplay.id}/{export_id}"
        if export_format == ExportFormat.yaml:
            content = YAMLExporter().render(payload)
            return storage_service.write_text(f"{base}.yaml", content)
        if export_format == ExportFormat.pdf:
            if not pdf_exporter.available():
                raise RuntimeError(
                    "PDF export requires WeasyPrint native libraries; they are not available."
                )
            return storage_service.write_bytes(f"{base}.pdf", pdf_exporter.render_pdf(payload))
        if export_format == ExportFormat.docx:
            try:
                data = word_exporter.render_docx(payload)
            except ImportError as exc:
                import sys

                raise RuntimeError(
                    "Word 导出需要 python-docx。"
                    f"请在当前运行环境安装并重启服务："
                    f"{sys.executable} -m pip install python-docx"
                    "（Docker 部署请执行 docker compose up --build）"
                ) from exc
            return storage_service.write_bytes(f"{base}.docx", data)
        if export_format == ExportFormat.zip:
            return storage_service.write_bytes(f"{base}.zip", self._build_zip(payload))
        raise RuntimeError(f"Unsupported export format: {export_format}")

    def _build_zip(self, payload: dict) -> bytes:
        basename = export_basename(
            payload.get("novel_title") or payload.get("title"),
        )
        buffer = io.BytesIO()
        with zipfile.ZipFile(buffer, "w", zipfile.ZIP_DEFLATED) as archive:
            archive.writestr(f"{basename}.yaml", YAMLExporter().render(payload))
            if pdf_exporter.available():
                try:
                    archive.writestr(
                        f"{basename}.pdf",
                        pdf_exporter.render_pdf(payload),
                    )
                except Exception:  # noqa: BLE001 - PDF is best-effort in the bundle
                    pass
            if word_exporter.available():
                try:
                    archive.writestr(
                        f"{basename}.docx",
                        word_exporter.render_docx(payload),
                    )
                except Exception:  # noqa: BLE001 - Word is best-effort in the bundle
                    pass
        return buffer.getvalue()

    async def build_screenplay_payload(self, db: AsyncSession, screenplay: Screenplay) -> dict:
        result = await db.execute(
            select(Episode)
            .where(Episode.screenplay_id == screenplay.id)
            .order_by(Episode.episode_num.asc())
        )
        episodes = list(result.scalars())
        novel = await db.get(Novel, screenplay.novel_id)
        character_arcs = (novel.character_arcs if novel else None) or []
        novel_title = (novel.title if novel else None) or ""

        episode_payloads = []
        for episode in episodes:
            content = dict(episode.content or {})
            if screenplay.schema_type.value == "ai_video":
                content = ensure_character_profiles(content, character_arcs)
            episode_payloads.append(
                {
                    "episode_id": str(episode.id),
                    "episode_number": episode.episode_num,
                    "title": episode.title,
                    "source_chapters": episode.source_chapters,
                    "status": episode.status.value,
                    "content": content,
                }
            )

        return {
            "screenplay_id": str(screenplay.id),
            "novel_id": str(screenplay.novel_id),
            "schema_type": screenplay.schema_type.value,
            "schema_version": screenplay.schema_version,
            "title": novel_title or screenplay.title or "剧本",
            "novel_title": novel_title,
            "adaptation_plan": screenplay.adaptation_plan or {},
            "character_arcs": character_arcs,
            "episodes": episode_payloads,
        }

    async def download_filename(self, db: AsyncSession, export: Export) -> str:
        """User-facing download name: «上传小说名».ext"""
        if not export.file_url:
            return "screenplay"
        suffix = storage_service.resolve(export.file_url).suffix
        screenplay = await db.get(Screenplay, export.screenplay_id)
        if not screenplay:
            return f"screenplay{suffix}"
        novel = await db.get(Novel, screenplay.novel_id)
        basename = export_basename(novel.title if novel else screenplay.title)
        return f"{basename}{suffix}"

    async def get_export(self, db: AsyncSession, export_id: UUID) -> Export:
        export = await db.get(Export, export_id)
        if not export:
            raise LookupError("Export not found")
        return export


export_service = ExportService()
