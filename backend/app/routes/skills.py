from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db import get_db
from app.models import Skill
from app.schemas import SkillRead
from app.services.skill_loader import skill_loader

router = APIRouter(prefix="/skills", tags=["skills"])


@router.get("")
async def list_skills() -> list[dict[str, str]]:
    return skill_loader.list_skills()


@router.post("/sync", response_model=list[SkillRead])
async def sync_skills(db: AsyncSession = Depends(get_db)) -> list[Skill]:
    return await skill_loader.sync_builtin_skills(db)


@router.get("/db", response_model=list[SkillRead])
async def list_db_skills(db: AsyncSession = Depends(get_db)) -> list[Skill]:
    result = await db.execute(select(Skill).order_by(Skill.name.asc()))
    return list(result.scalars())


@router.get("/{name}", response_model=SkillRead)
async def get_skill(name: str, db: AsyncSession = Depends(get_db)) -> Skill:
    result = await db.execute(select(Skill).where(Skill.name == name))
    skill = result.scalar_one_or_none()
    if not skill:
        raise HTTPException(status_code=404, detail="Skill not found")
    return skill
