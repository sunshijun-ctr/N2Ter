import asyncio

from app.agents import GenerationAgent
from app.tools.base import ToolContext


def test_agent_builds_prompt_with_tools() -> None:
    result = asyncio.run(
        GenerationAgent().run(
            {"episode_id": "episode-1"},
            ToolContext(novel_id="novel-1", episode_id="episode-1"),
        )
    )

    assert result["status"] == "ready"
    assert "Available Tools" in result["system_prompt"]
    assert any(tool["name"] == "text2screenplay" for tool in result["tools"])
    assert result["llm_result"]["status"] == "stub"
