from pathlib import Path
from uuid import UUID

from app.core import get_settings


class LocalStorageService:
    def __init__(self) -> None:
        self.storage_dir = get_settings().storage_dir

    def save_novel_text(self, novel_id: UUID, content: str) -> str:
        target = self.storage_dir / "novels" / f"{novel_id}.txt"
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text(content, encoding="utf-8")
        return str(target.relative_to(self.storage_dir))

    def read(self, relative_path: str) -> str:
        path = Path(self.storage_dir / relative_path).resolve()
        return path.read_text(encoding="utf-8")


storage_service = LocalStorageService()
