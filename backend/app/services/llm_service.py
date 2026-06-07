"""LLM service backed by an OpenAI-compatible Chat Completions endpoint.

When no API key is configured (``settings.llm_enabled is False``) every method
degrades to a deterministic stub so the rest of the system keeps working
offline and the existing test-suite contract is preserved.
"""

import json
import re
from collections.abc import AsyncIterator
from typing import Any

import httpx

from app.core import get_settings


class LLMError(RuntimeError):
    """Raised when a real LLM call fails. Callers may catch and fall back."""


# Some DeepSeek models leak their function-calling template (the
# ``<｜｜DSML｜｜invoke name="...">`` markup) into ``content`` as plain text instead
# of returning structured ``tool_calls``. The agent loop then sees no tool calls
# and stops mid-task. These patterns recover the calls from that leaked markup.
_DSML_INVOKE_RE = re.compile(r'invoke\s+name="([^"]+)"(.*?)</[^>]*invoke>', re.S)
_DSML_PARAM_RE = re.compile(
    r'parameter\s+name="([^"]+)"([^>]*)>(.*?)</[^>]*parameter>', re.S
)


def _recover_tool_calls_from_content(message: dict[str, Any]) -> dict[str, Any]:
    """If the model returned no structured tool_calls but its content contains
    the leaked invoke/parameter markup, parse it back into proper tool_calls so
    the agent loop can execute them. No-op for normal responses."""
    if message.get("tool_calls"):
        return message
    content = message.get("content") or ""
    if "invoke name=" not in content or "DSML" not in content:
        return message
    calls: list[dict[str, Any]] = []
    for i, invoke in enumerate(_DSML_INVOKE_RE.finditer(content)):
        name = invoke.group(1)
        args: dict[str, Any] = {}
        for param in _DSML_PARAM_RE.finditer(invoke.group(2)):
            pname, attrs, value = param.group(1), param.group(2), param.group(3).strip()
            if 'string="false"' in attrs:  # provider hint: value is not a string
                try:
                    value = json.loads(value)
                except (json.JSONDecodeError, ValueError):
                    pass
            args[pname] = value
        calls.append(
            {
                "id": f"dsml_{i}",
                "type": "function",
                "function": {"name": name, "arguments": json.dumps(args, ensure_ascii=False)},
            }
        )
    if not calls:
        return message
    # Drop the leaked markup, keeping any natural-language preamble before it.
    idx = content.find("DSML")
    lt = content.rfind("<", 0, idx)
    message["content"] = (content[:lt] if lt != -1 else "").rstrip()
    message["tool_calls"] = calls
    return message


_JSON_BLOCK = re.compile(r"\{.*\}|\[.*\]", re.DOTALL)


def _extract_json(text: str) -> Any:
    """Best-effort JSON extraction from a model response."""
    text = text.strip()
    # Strip ```json fences if present.
    if text.startswith("```"):
        text = re.sub(r"^```[a-zA-Z]*\n?", "", text)
        text = re.sub(r"\n?```$", "", text).strip()
    # strict=False tolerates raw control characters (literal newlines/tabs) inside
    # string values — a very common LLM slip, especially in long ai_video prompt
    # fields. Without it json raises "Invalid control character".
    try:
        return json.loads(text, strict=False)
    except json.JSONDecodeError:
        match = _JSON_BLOCK.search(text)
        candidate = match.group(0) if match else text
        try:
            return json.loads(candidate, strict=False)
        except json.JSONDecodeError:
            # Last resort: strip trailing commas (a common LLM JSON slip).
            repaired = re.sub(r",(\s*[}\]])", r"\1", candidate)
            return json.loads(repaired, strict=False)


class LLMService:
    def __init__(self) -> None:
        self._settings = get_settings()

    @property
    def enabled(self) -> bool:
        return self._settings.llm_enabled

    # ------------------------------------------------------------------ core
    async def _chat(
        self,
        messages: list[dict[str, str]],
        *,
        max_tokens: int | None = None,
        temperature: float | None = None,
        json_mode: bool = False,
    ) -> str:
        settings = self._settings
        body: dict[str, Any] = {
            "model": settings.llm_model,
            "messages": messages,
            "temperature": settings.llm_temperature if temperature is None else temperature,
            "max_tokens": max_tokens or settings.llm_max_tokens,
        }
        if json_mode:
            body["response_format"] = {"type": "json_object"}

        url = settings.llm_base_url.rstrip("/") + "/chat/completions"
        headers = {"Authorization": f"Bearer {settings.llm_api_key}"}
        try:
            async with httpx.AsyncClient(timeout=settings.llm_timeout_seconds) as client:
                response = await client.post(url, json=body, headers=headers)
                response.raise_for_status()
                data = response.json()
            return data["choices"][0]["message"]["content"] or ""
        except (httpx.HTTPError, KeyError, IndexError, ValueError) as exc:
            raise LLMError(f"LLM chat request failed: {exc}") from exc

    # --------------------------------------------------------------- text API
    async def generate_text(
        self,
        *,
        system: str,
        user: str,
        max_tokens: int | None = None,
        temperature: float | None = None,
    ) -> str:
        if not self.enabled:
            return user[:500]
        messages = [{"role": "system", "content": system}, {"role": "user", "content": user}]
        return await self._chat(messages, max_tokens=max_tokens, temperature=temperature)

    async def generate_structured(
        self,
        *,
        system: str,
        user: str,
        max_tokens: int | None = None,
        temperature: float | None = None,
    ) -> dict[str, Any]:
        if not self.enabled:
            return {"status": "stub"}
        messages = [{"role": "system", "content": system}, {"role": "user", "content": user}]
        raw = await self._chat(
            messages, max_tokens=max_tokens, temperature=temperature, json_mode=True
        )
        try:
            parsed = _extract_json(raw)
        except (json.JSONDecodeError, ValueError) as exc:
            raise LLMError(f"LLM returned non-JSON output: {exc}") from exc
        if not isinstance(parsed, dict):
            return {"data": parsed}
        return parsed

    # ----------------------------------------------------- back-compat helper
    async def generate_json(self, prompt: str, payload: dict[str, Any]) -> dict[str, Any]:
        """Used by BaseAgent. Disabled path keeps the historical stub shape."""
        if not self.enabled:
            return {
                "status": "stub",
                "prompt_chars": len(prompt),
                "payload_keys": sorted(payload.keys()),
            }
        return await self.generate_structured(
            system=prompt,
            user=json.dumps(payload, ensure_ascii=False),
        )

    # ------------------------------------------------------- tool calling
    async def chat_with_tools(
        self,
        messages: list[dict[str, Any]],
        tools: list[dict[str, Any]] | None = None,
        *,
        max_tokens: int | None = None,
        temperature: float | None = None,
        json_mode: bool = False,
    ) -> dict[str, Any]:
        """Single tool-calling turn. Returns the assistant message dict
        (``content`` plus any ``tool_calls``)."""
        settings = self._settings
        body: dict[str, Any] = {
            "model": settings.llm_model,
            "messages": messages,
            "temperature": settings.llm_temperature if temperature is None else temperature,
            "max_tokens": max_tokens or settings.llm_max_tokens,
        }
        if tools:
            body["tools"] = tools
            body["tool_choice"] = "auto"
        # Only request JSON mode when no tools are offered: providers (incl.
        # DeepSeek) reject response_format combined with tool calling.
        if json_mode and not tools:
            body["response_format"] = {"type": "json_object"}
        url = settings.llm_base_url.rstrip("/") + "/chat/completions"
        headers = {"Authorization": f"Bearer {settings.llm_api_key}"}
        try:
            async with httpx.AsyncClient(timeout=settings.llm_timeout_seconds) as client:
                response = await client.post(url, json=body, headers=headers)
                response.raise_for_status()
                data = response.json()
            return _recover_tool_calls_from_content(data["choices"][0]["message"])
        except (httpx.HTTPError, KeyError, IndexError, ValueError) as exc:
            raise LLMError(f"LLM tool-calling request failed: {exc}") from exc

    # --------------------------------------------------------------- streaming
    async def stream_chat(
        self, content: str, *, system: str | None = None
    ) -> AsyncIterator[str]:
        if not self.enabled:
            # Preserve the historical echo contract used by the websocket flow.
            yield "已收到："
            yield content
            return

        settings = self._settings
        messages: list[dict[str, str]] = []
        if system:
            messages.append({"role": "system", "content": system})
        messages.append({"role": "user", "content": content})
        body = {
            "model": settings.llm_model,
            "messages": messages,
            "temperature": settings.llm_temperature,
            "max_tokens": settings.llm_max_tokens,
            "stream": True,
        }
        url = settings.llm_base_url.rstrip("/") + "/chat/completions"
        headers = {"Authorization": f"Bearer {settings.llm_api_key}"}
        try:
            async with httpx.AsyncClient(timeout=settings.llm_timeout_seconds) as client:
                async with client.stream("POST", url, json=body, headers=headers) as response:
                    response.raise_for_status()
                    async for line in response.aiter_lines():
                        if not line or not line.startswith("data:"):
                            continue
                        chunk = line[len("data:"):].strip()
                        if chunk == "[DONE]":
                            break
                        try:
                            delta = json.loads(chunk)["choices"][0]["delta"].get("content")
                        except (json.JSONDecodeError, KeyError, IndexError):
                            continue
                        if delta:
                            yield delta
        except httpx.HTTPError as exc:
            raise LLMError(f"LLM stream request failed: {exc}") from exc


llm_service = LLMService()
