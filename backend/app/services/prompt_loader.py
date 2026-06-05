from pathlib import Path

from app.core import get_settings


class PromptLoader:
    def __init__(self, prompt_dir: Path | None = None) -> None:
        self.prompt_dir = prompt_dir or get_settings().prompt_dir

    def load(self, name: str) -> str:
        path = self.prompt_dir / f"{name}.md"
        if not path.exists():
            raise FileNotFoundError(f"Prompt not found: {path}")
        return path.read_text(encoding="utf-8")


prompt_loader = PromptLoader()
