from pathlib import Path

from app.core import get_settings


class SkillLoader:
    def __init__(self, skill_dir: Path | None = None) -> None:
        self.skill_dir = skill_dir or get_settings().skill_dir

    def list_skills(self) -> list[dict[str, str]]:
        if not self.skill_dir.exists():
            return []
        skills: list[dict[str, str]] = []
        for path in sorted(self.skill_dir.iterdir()):
            if path.is_dir():
                skills.append({"id": path.name, "name": path.name, "path": str(path)})
        return skills

    def load(self, skill_id: str) -> str:
        path = self.skill_dir / skill_id / "SKILL.md"
        if not path.exists():
            raise FileNotFoundError(f"Skill not found: {skill_id}")
        return path.read_text(encoding="utf-8")


skill_loader = SkillLoader()
