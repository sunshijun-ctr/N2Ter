from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db import get_db
from app.models import CompressedSegment, Conversation
from app.schemas import (
    CompressedSegmentRead,
    ConversationCompressRequest,
    ConversationCreate,
    ConversationRead,
    MessageCreate,
    MessageRead,
)
from app.services.conversation_service import conversation_service

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
    try:
        return await conversation_service.list_messages(db, conversation_id)
    except LookupError:
        raise HTTPException(status_code=404, detail="Conversation not found") from None


@router.post("/{conversation_id}/compress", response_model=CompressedSegmentRead)
async def compress_conversation(
    conversation_id: UUID,
    payload: ConversationCompressRequest | None = None,
    db: AsyncSession = Depends(get_db),
) -> CompressedSegment:
    try:
        return await conversation_service.compress_messages(
            db, conversation_id, keep_recent=payload.keep_recent if payload else 4
        )
    except LookupError:
        raise HTTPException(status_code=404, detail="Conversation not found") from None
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from None


@router.get(
    "/{conversation_id}/compressed-segments",
    response_model=list[CompressedSegmentRead],
)
async def list_compressed_segments(
    conversation_id: UUID, db: AsyncSession = Depends(get_db)
) -> list[CompressedSegment]:
    try:
        return await conversation_service.list_compressed_segments(db, conversation_id)
    except LookupError:
        raise HTTPException(status_code=404, detail="Conversation not found") from None


@router.post(
    "/{conversation_id}/messages",
    response_model=MessageRead,
    status_code=status.HTTP_201_CREATED,
)
async def create_message(
    conversation_id: UUID, payload: MessageCreate, db: AsyncSession = Depends(get_db)
):
    try:
        return await conversation_service.add_message(
            db,
            conversation_id=conversation_id,
            role=payload.role,
            content=payload.content,
            tool_calls=payload.tool_calls,
            tool_results=payload.tool_results,
            token_usage=payload.token_usage,
            is_pinned=payload.is_pinned,
        )
    except LookupError:
        raise HTTPException(status_code=404, detail="Conversation not found") from None


@router.delete("/{conversation_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_conversation(conversation_id: UUID, db: AsyncSession = Depends(get_db)) -> None:
    conversation = await db.get(Conversation, conversation_id)
    if not conversation:
        raise HTTPException(status_code=404, detail="Conversation not found")
    await db.delete(conversation)
    await db.commit()
