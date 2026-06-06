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
