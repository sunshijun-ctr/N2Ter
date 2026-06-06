import asyncio
from uuid import UUID

from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from app.agents import ConversationAgent
from app.db import get_sessionmaker
from app.models import MessageRole
from app.services.conversation_service import conversation_service
from app.services.llm_service import LLMError, llm_service
from app.services.task_service import task_service
from app.tools.base import ToolContext

router = APIRouter(tags=["websocket"])

_HISTORY_LIMIT = 10
_PROGRESS_TERMINAL = {"preprocess_done", "preprocessing_failed"}
_PROGRESS_POLL_SECONDS = 1.0
_PROGRESS_MAX_TICKS = 1800  # ~30 min ceiling


def _to_history(messages) -> list[dict[str, str]]:
    history: list[dict[str, str]] = []
    for message in messages:
        if message.is_compressed or message.role not in (MessageRole.user, MessageRole.assistant):
            continue
        if not message.content:
            continue
        history.append({"role": message.role.value, "content": message.content})
    return history[-_HISTORY_LIMIT:]


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
                conversation = await conversation_service.ensure_conversation(db, conversation_id)
                novel_id = str(conversation.novel_id) if conversation.novel_id else None
                screenplay_id = (
                    str(conversation.screenplay_id) if conversation.screenplay_id else None
                )
                await conversation_service.add_message(
                    db, conversation_id, MessageRole.user, content
                )
                history = _to_history(
                    await conversation_service.list_messages(db, conversation_id)
                )

            assistant_content = ""
            tool_results = None
            if llm_service.enabled:
                try:
                    result = await ConversationAgent().run_conversation(
                        content,
                        history=history[:-1],  # exclude the just-added user turn
                        context=ToolContext(
                            novel_id=novel_id, screenplay_id=screenplay_id
                        ),
                    )
                    assistant_content = result["content"]
                    tool_results = result.get("tool_trace") or None
                    for tool_call in tool_results or []:
                        await websocket.send_json(
                            {"type": "tool_call", "tool": tool_call["tool"]}
                        )
                    await websocket.send_json(
                        {"type": "content_delta", "text": assistant_content}
                    )
                except LLMError as exc:
                    assistant_content = f"[生成失败：{exc}]"
                    await websocket.send_json(
                        {"type": "content_delta", "text": assistant_content}
                    )
            else:
                response_chunks: list[str] = []
                async for chunk in llm_service.stream_chat(content):
                    response_chunks.append(chunk)
                    await websocket.send_json({"type": "content_delta", "text": chunk})
                assistant_content = "".join(response_chunks)

            async with async_session() as db:
                assistant_message = await conversation_service.add_message(
                    db,
                    conversation_id,
                    MessageRole.assistant,
                    assistant_content,
                    tool_results=tool_results,
                )
            await websocket.send_json(
                {"type": "message_saved", "message_id": str(assistant_message.id)}
            )
            await websocket.send_json({"type": "message_end"})
    except WebSocketDisconnect:
        return


@router.websocket("/ws/novels/{novel_id}/progress")
async def novel_progress_socket(websocket: WebSocket, novel_id: UUID) -> None:
    """Stream preprocessing progress: replay existing events on connect (for
    reconnect), then tail new ones until a terminal event or disconnect."""
    await websocket.accept()
    async_session = get_sessionmaker()
    last_id = 0
    try:
        for _ in range(_PROGRESS_MAX_TICKS):
            async with async_session() as db:
                events = await task_service.list_progress_events_after(db, novel_id, last_id)
            for event in events:
                last_id = event.id
                await websocket.send_json(
                    {
                        "type": "progress",
                        "id": event.id,
                        "event_type": event.event_type,
                        "payload": event.payload,
                    }
                )
                if event.event_type in _PROGRESS_TERMINAL:
                    await websocket.send_json({"type": "done"})
                    return
            await asyncio.sleep(_PROGRESS_POLL_SECONDS)
    except WebSocketDisconnect:
        return
