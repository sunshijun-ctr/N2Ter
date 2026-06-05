from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db import get_db
from app.models import Conversation
from app.schemas import ConversationCreate, ConversationRead, MessageRead

router = APIRouter(prefix="/conversations", tags=["conversations"])


@router.post("", response_model=ConversationRead, status_code=status.HTTP_201_CREATED)
async def create_conversation(
    payload: ConversationCreate, db: AsyncSession = Depends(get_db)
) -> Conversation:
    conversation = Conversation(
        novel_id=payload.novel_id,
        screenplay_id=payload.screenplay_id,
        context_type=payload.context_type.value,
        title=payload.title,
    )
    db.add(conversation)
    await db.commit()
    await db.refresh(conversation)
    return conversation


@router.get("", response_model=list[ConversationRead])
async def list_conversations(db: AsyncSession = Depends(get_db)) -> list[Conversation]:
    result = await db.execute(select(Conversation).order_by(Conversation.created_at.desc()))
    return list(result.scalars())


@router.get("/{conversation_id}/messages", response_model=list[MessageRead])
async def list_messages(conversation_id: UUID, db: AsyncSession = Depends(get_db)) -> list:
    conversation = await db.get(Conversation, conversation_id)
    if not conversation:
        raise HTTPException(status_code=404, detail="Conversation not found")
    return []


@router.delete("/{conversation_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_conversation(conversation_id: UUID, db: AsyncSession = Depends(get_db)) -> None:
    conversation = await db.get(Conversation, conversation_id)
    if not conversation:
        raise HTTPException(status_code=404, detail="Conversation not found")
    await db.delete(conversation)
    await db.commit()
