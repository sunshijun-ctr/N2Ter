from pathlib import Path

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core import get_settings
from app.models import Skill


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

    def load_skill_content(self, skill_id: str) -> dict:
        path = self.skill_dir / skill_id
        content: dict = {}
        skill_md = path / "SKILL.md"
        if skill_md.exists():
            content["instructions"] = skill_md.read_text(encoding="utf-8")
        for extra in ("glossary.json", "examples.yaml"):
            extra_path = path / extra
            if extra_path.exists():
                content[extra_path.stem] = extra_path.read_text(encoding="utf-8")
        return content

    async def sync_builtin_skills(self, db: AsyncSession) -> list[Skill]:
        existing = await db.execute(select(Skill))
        skills_by_name = {skill.name: skill for skill in existing.scalars()}
        synced: list[Skill] = []
        for item in self.list_skills():
            name = item["name"]
            content = self.load_skill_content(name)
            skill = skills_by_name.get(name)
            if skill:
                skill.content = content
            else:
                skill = Skill(
                    name=name,
                    description=f"Builtin skill: {name}",
                    content=content,
                    created_by="builtin",
                )
                db.add(skill)
            synced.append(skill)
        await db.commit()
        return synced


skill_loader = SkillLoader()
