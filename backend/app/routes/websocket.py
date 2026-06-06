from uuid import UUID

from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from app.db import get_sessionmaker
from app.models import MessageRole
from app.services.conversation_service import conversation_service
from app.services.llm_service import llm_service

router = APIRouter(tags=["websocket"])


@router.websocket("/ws/conversations/{conversation_id}")
async def conversation_socket(websocket: WebSocket, conversation_id: UUID) -> None:
    await websocket.accept()
    async_session = get_sessionmaker()
    async with async_session() as db:
        try:
            await conversation_service.ensure_conversation(db, conversation_id)
        except LookupError:
            await websocket.send_json({"type": "error", "error": "Conversation not found"})
            await websocket.close(code=4404)
            return

    await websocket.send_json(
        {"type": "message_start", "conversation_id": str(conversation_id)}
    )
    try:
        while True:
            payload = await websocket.receive_json()
            if payload.get("type") == "stop":
                await websocket.send_json({"type": "message_end"})
                continue
            if payload.get("type") != "message":
                await websocket.send_json({"type": "error", "error": "Unsupported message type"})
                continue
            content = payload.get("content", "")
            async with async_session() as db:
                await conversation_service.add_message(
                    db, conversation_id, MessageRole.user, content
                )
            response_chunks: list[str] = []
            async for chunk in llm_service.stream_chat(content):
                response_chunks.append(chunk)
                await websocket.send_json({"type": "content_delta", "text": chunk})
            assistant_content = "".join(response_chunks)
            async with async_session() as db:
                assistant_message = await conversation_service.add_message(
                    db, conversation_id, MessageRole.assistant, assistant_content
                )
            await websocket.send_json(
                {"type": "message_saved", "message_id": str(assistant_message.id)}
            )
            await websocket.send_json({"type": "message_end"})
    except WebSocketDisconnect:
        return
