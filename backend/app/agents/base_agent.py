import json
from typing import Any

from app.services.llm_service import llm_service
from app.services.prompt_loader import prompt_loader
from app.services.skill_loader import skill_loader
from app.tools.base import ToolContext
from app.tools.registry import tool_registry


class BaseAgent:
    prompt_name: str

    def __init__(self) -> None:
        self.tools = tool_registry
        self.llm = llm_service

    def build_system_prompt(self, skill_id: str | None = None) -> str:
        sections = [prompt_loader.load(self.prompt_name)]
        if skill_id:
            try:
                sections.append(skill_loader.load(skill_id))
            except FileNotFoundError:
                sections.append(f"[Skill {skill_id} not found; using base prompt only.]")
        tools = "\n".join(
            f"- {tool['name']}: {tool['description']}" for tool in self.tools.list()
        )
        sections.append(f"\n## Available Tools\n{tools}")
        return "\n\n".join(sections)

    async def run(self, payload: dict[str, Any], context: ToolContext | None = None) -> dict[str, Any]:
        skill_id = payload.get("skill_id")
        system_prompt = self.build_system_prompt(skill_id)
        llm_result = await self.llm.generate_json(system_prompt, payload)
        return {
            "agent": self.__class__.__name__,
            "payload": payload,
            "context": (context or ToolContext()).model_dump(),
            "system_prompt": system_prompt,
            "tools": self.tools.list(),
            "llm_result": llm_result,
            "status": "ready",
        }

    async def run_conversation(
        self,
        user_message: str,
        history: list[dict[str, str]] | None = None,
        context: ToolContext | None = None,
        skill_id: str | None = None,
        max_iters: int = 5,
    ) -> dict[str, Any]:
        """Run a real tool-calling loop and return the final assistant reply.

        Requires a configured LLM. The loop lets the model call the registered
        tools (chapter_get, chapter_search, episode_patch, ...) until it
        produces a natural-language answer or ``max_iters`` is reached.
        """
        ctx = context or ToolContext()
        system_prompt = self.build_system_prompt(skill_id)
        messages: list[dict[str, Any]] = [{"role": "system", "content": system_prompt}]
        messages.extend(history or [])
        messages.append({"role": "user", "content": user_message})

        tool_specs = self.tools.openai_tools()
        trace: list[dict[str, Any]] = []

        for _ in range(max_iters):
            assistant = await self.llm.chat_with_tools(messages, tool_specs)
            messages.append(assistant)
            tool_calls = assistant.get("tool_calls") or []
            if not tool_calls:
                return {
                    "content": assistant.get("content") or "",
                    "tool_trace": trace,
                    "status": "done",
                }
            for call in tool_calls:
                fn = call.get("function", {})
                name = fn.get("name", "")
                try:
                    args = json.loads(fn.get("arguments") or "{}")
                except json.JSONDecodeError:
                    args = {}
                result = await self.tools.execute(name, args, ctx)
                trace.append({"tool": name, "args": args, "result": result.model_dump()})
                messages.append(
                    {
                        "role": "tool",
                        "tool_call_id": call.get("id"),
                        "content": json.dumps(result.model_dump(), ensure_ascii=False),
                    }
                )

        # Exhausted iterations: ask the model for a final answer without tools.
        final = await self.llm.chat_with_tools(messages, tools=None)
        return {
            "content": final.get("content") or "",
            "tool_trace": trace,
            "status": "max_iters",
        }
