from fastapi import APIRouter, HTTPException

from app.schemas import PromptInfo, PromptRead
from app.services.prompt_loader import prompt_loader

router = APIRouter(prefix="/prompts", tags=["prompts"])


@router.get("", response_model=list[PromptInfo])
async def list_prompts() -> list[PromptInfo]:
    return prompt_loader.list_prompts()


@router.get("/{name}", response_model=PromptRead)
async def get_prompt(name: str) -> PromptRead:
    try:
        return prompt_loader.read_prompt(name)
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail="Prompt not found") from None
