from pathlib import Path
from uuid import UUID

from app.core import get_settings


class LocalStorageService:
    def __init__(self) -> None:
        self.storage_dir = get_settings().storage_dir

    def save_novel_text(self, novel_id: UUID, content: str) -> str:
        target = self.storage_dir / "novels" / f"{novel_id}.txt"
        return self.write_text(target.relative_to(self.storage_dir), content)

    def write_text(self, relative_path: str | Path, content: str) -> str:
        target = self.storage_dir / relative_path
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text(content, encoding="utf-8")
        return str(target.relative_to(self.storage_dir))

    def write_bytes(self, relative_path: str | Path, content: bytes) -> str:
        target = self.storage_dir / relative_path
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_bytes(content)
        return str(target.relative_to(self.storage_dir))

    def resolve(self, relative_path: str | Path) -> Path:
        path = (self.storage_dir / relative_path).resolve()
        if not path.is_relative_to(self.storage_dir.resolve()):
            raise ValueError("Path escapes storage directory")
        return path

    def read(self, relative_path: str) -> str:
        return self.resolve(relative_path).read_text(encoding="utf-8")


storage_service = LocalStorageService()
