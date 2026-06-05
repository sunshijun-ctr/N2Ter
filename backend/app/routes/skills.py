from fastapi import APIRouter

from app.services.skill_loader import skill_loader

router = APIRouter(prefix="/skills", tags=["skills"])


@router.get("")
async def list_skills() -> list[dict[str, str]]:
    return skill_loader.list_skills()
