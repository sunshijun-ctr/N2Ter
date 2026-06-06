from pathlib import Path

from app.core import get_settings
from app.schemas.prompts import PromptInfo, PromptRead


class PromptLoader:
    def __init__(self, prompt_dir: Path | None = None) -> None:
        self.prompt_dir = prompt_dir or get_settings().prompt_dir

    def load(self, name: str) -> str:
        path = self.prompt_dir / f"{name}.md"
        if not path.exists():
            raise FileNotFoundError(f"Prompt not found: {path}")
        return path.read_text(encoding="utf-8")

    def list_prompts(self) -> list[PromptInfo]:
        if not self.prompt_dir.exists():
            return []
        return [
            PromptInfo(name=path.stem, filename=path.name, size=path.stat().st_size)
            for path in sorted(self.prompt_dir.glob("*.md"))
        ]

    def read_prompt(self, name: str) -> PromptRead:
        path = self.prompt_dir / f"{name}.md"
        if not path.exists():
            raise FileNotFoundError(f"Prompt not found: {path}")
        return PromptRead(
            name=path.stem,
            filename=path.name,
            size=path.stat().st_size,
            content=path.read_text(encoding="utf-8"),
        )


prompt_loader = PromptLoader()
