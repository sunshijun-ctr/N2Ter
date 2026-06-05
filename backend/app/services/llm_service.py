from typing import Any


class LLMService:
    async def generate_json(self, prompt: str, payload: dict[str, Any]) -> dict[str, Any]:
        return {
            "status": "stub",
            "prompt_chars": len(prompt),
            "payload_keys": sorted(payload.keys()),
        }

    async def stream_chat(self, content: str):
        yield "已收到："
        yield content


llm_service = LLMService()
