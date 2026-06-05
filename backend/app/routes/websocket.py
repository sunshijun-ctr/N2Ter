from uuid import UUID

from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from app.services.llm_service import llm_service

router = APIRouter(tags=["websocket"])


@router.websocket("/ws/conversations/{conversation_id}")
async def conversation_socket(websocket: WebSocket, conversation_id: UUID) -> None:
    await websocket.accept()
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
            async for chunk in llm_service.stream_chat(payload.get("content", "")):
                await websocket.send_json({"type": "content_delta", "text": chunk})
            await websocket.send_json({"type": "message_end"})
    except WebSocketDisconnect:
        return
