from __future__ import annotations

import json
import logging
from datetime import datetime, timezone
from typing import Any
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import (
    Episode,
    EpisodeStatus,
    Novel,
    Screenplay,
    ScreenplayStatus,
    Task,
    TaskStatus,
    TaskType,
)
from app.services.episode_service import episode_service
from app.services.generation_service import generation_service
from app.services.llm_service import LLMError, _extract_json, llm_service
from app.services.prompt_loader import prompt_loader
from app.services.screenplay_memory_service import screenplay_memory_service
from app.services.task_service import task_service
from app.tools.base import ToolContext
from app.tools.registry import tool_registry

_logger = logging.getLogger(__name__)

_GENERATION_TOOL_ALLOWLIST = {
    "chapter_get",
    "chapter_search",
    "character_timeline",
    "foreshadowing_lookup",
    "screenplay_plan_get",
    "screenplay_memory_get",
    "episode_get",
    "episode_context",
    "screenplay_validate",
}


class EpisodeWritingAgentService:
    max_react_steps = 8
    max_tool_calls = 12
    max_tool_calls_per_tool = 3

    async def generate_episode(
        self, db: AsyncSession, episode: Episode, task: Task | None = None
    ) -> tuple[Episode, Task, dict[str, Any]]:
        screenplay = await db.get(Screenplay, episode.screenplay_id)
        if not screenplay:
            raise LookupError("Screenplay not found")

        if task is None:
            task = await task_service.create_task(
                db,
                task_type=TaskType.generate_episode,
                episode_id=episode.id,
                status=TaskStatus.running,
                progress=5,
            )
        else:
            task.status = TaskStatus.running
            task.progress = max(task.progress, 5)

        await task_service.record_progress(
            db,
            screenplay.novel_id,
            "agent_episode_started",
            {"episode_id": str(episode.id), "episode_num": episode.episode_num},
        )

        if not llm_service.enabled:
            generated, task = await generation_service.generate_episode(db, episode, task)
            return generated, task, {
                "status": "fallback",
                "trace_summary": [{"phase": "fallback", "status": "llm_disabled"}],
            }

        try:
            result = await self._run_agent(db, screenplay, episode)
        except Exception as exc:  # noqa: BLE001 - returned as a user-actionable failure
            _logger.warning("EpisodeWritingAgent failed for %s: %s", episode.id, exc)
            episode.status = EpisodeStatus.failed
            episode.error_message = str(exc)
            task.status = TaskStatus.failed
            task.error_message = str(exc)
            await db.commit()
            await db.refresh(episode)
            await db.refresh(task)
            return episode, task, {
                "status": "failed",
                "reason": str(exc),
                "retry_available": True,
                "fallback_available": True,
                "stop_available": True,
            }

        content = generation_service._normalise_content(
            result["episode_content"], screenplay, episode
        )
        episode.content = content
        episode.status = EpisodeStatus.done
        episode.error_message = None
        episode.generated_at = datetime.now(timezone.utc)
        await episode_service.save_version(db, episode, content, modified_by="ai")
        screenplay_memory_service.apply_patch(screenplay, result.get("memory_patch"))
        screenplay.status = ScreenplayStatus.generating
        task.status = TaskStatus.done
        task.progress = 100
        await task_service.record_progress(
            db,
            screenplay.novel_id,
            "agent_episode_generated",
            {
                "episode_id": str(episode.id),
                "episode_num": episode.episode_num,
                "trace_summary": result.get("trace_summary", []),
            },
        )
        await db.commit()
        await db.refresh(episode)
        await db.refresh(task)
        return episode, task, result

    async def generate_screenplay(
        self,
        db: AsyncSession,
        screenplay: Screenplay,
        *,
        start_episode: int = 1,
        end_episode: int | None = None,
        mode: str = "remaining_only",
        stop_on_failure: bool = True,
    ) -> dict[str, Any]:
        task = await task_service.create_task(
            db,
            task_type=TaskType.generate_screenplay,
            novel_id=screenplay.novel_id,
            status=TaskStatus.running,
            progress=1,
        )
        screenplay.status = ScreenplayStatus.generating
        await db.flush()

        result = await db.execute(
            select(Episode)
            .where(Episode.screenplay_id == screenplay.id)
            .order_by(Episode.episode_num.asc())
        )
        episodes = [
            episode
            for episode in result.scalars()
            if episode.episode_num >= start_episode
            and (end_episode is None or episode.episode_num <= end_episode)
            and not (mode == "remaining_only" and episode.status == EpisodeStatus.done)
        ]
        generated: list[int] = []
        failed_episode_num: int | None = None
        total = max(len(episodes), 1)

        for index, episode in enumerate(episodes, start=1):
            episode.status = EpisodeStatus.generating
            task.progress = max(1, int((index - 1) / total * 100))
            await db.flush()
            generated_episode, episode_task, info = await self.generate_episode(db, episode)
            if episode_task.status == TaskStatus.failed:
                failed_episode_num = generated_episode.episode_num
                if stop_on_failure:
                    task.status = TaskStatus.failed
                    task.error_message = episode_task.error_message
                    task.progress = int((index - 1) / total * 100)
                    await db.commit()
                    return {
                        "status": "failed",
                        "screenplay_id": screenplay.id,
                        "generated_episode_nums": generated,
                        "current_episode_num": failed_episode_num,
                        "failed_episode_num": failed_episode_num,
                        "task_id": task.id,
                        "next_action": "retry",
                        "error": info.get("reason") or episode_task.error_message,
                    }
            else:
                generated.append(generated_episode.episode_num)

        screenplay.status = ScreenplayStatus.completed
        task.status = TaskStatus.done
        task.progress = 100
        await db.commit()
        return {
            "status": "done",
            "screenplay_id": screenplay.id,
            "generated_episode_nums": generated,
            "current_episode_num": None,
            "failed_episode_num": failed_episode_num,
            "task_id": task.id,
            "next_action": "done",
        }

    async def _run_agent(
        self, db: AsyncSession, screenplay: Screenplay, episode: Episode
    ) -> dict[str, Any]:
        novel = await db.get(Novel, screenplay.novel_id)
        system_prompt = self._build_system_prompt(screenplay)
        payload = {
            "task": "generate_episode",
            "episode_id": str(episode.id),
            "screenplay_id": str(screenplay.id),
            "novel_id": str(screenplay.novel_id),
            "novel_title": novel.title if novel else "",
            "novel_summary": novel.summary if novel else "",
            "episode_num": episode.episode_num,
            "source_chapters": episode.source_chapters or [],
            "schema_type": screenplay.schema_type.value,
            "adaptation_plan_locked": True,
            "adaptation_plan": screenplay.adaptation_plan or {},
            "style_preferences": screenplay.style_preferences or {},
            "screenplay_memory": screenplay_memory_service.get_memory(screenplay),
            "budgets": {
                "max_react_steps": self.max_react_steps,
                "max_tool_calls": self.max_tool_calls,
                "max_tool_calls_per_tool": self.max_tool_calls_per_tool,
                "max_critique_rounds": 1,
            },
            "final_output_contract": {
                "episode_content": "target schema episode object",
                "memory_patch": "episode memory patch with episode_num",
                "trace_summary": "short visible step summaries",
                "critique_summary": "one-round critique summary",
                "warnings": "user-visible warnings",
            },
        }
        messages: list[dict[str, Any]] = [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": json.dumps(payload, ensure_ascii=False)},
        ]
        ctx = ToolContext(
            novel_id=str(screenplay.novel_id),
            screenplay_id=str(screenplay.id),
            episode_id=str(episode.id),
        )
        tool_specs = [
            spec
            for spec in tool_registry.openai_tools()
            if spec["function"]["name"] in _GENERATION_TOOL_ALLOWLIST
        ]
        tool_counts: dict[str, int] = {}
        trace: list[dict[str, Any]] = []
        total_tool_calls = 0

        for step_index in range(1, self.max_react_steps + 1):
            assistant = await llm_service.chat_with_tools(messages, tool_specs)
            messages.append(assistant)
            calls = assistant.get("tool_calls") or []
            if not calls:
                return await self._finalize(messages, assistant.get("content") or "", episode)

            for call in calls:
                name = (call.get("function") or {}).get("name", "")
                raw_args = (call.get("function") or {}).get("arguments") or "{}"
                args = self._loads(raw_args)
                total_tool_calls += 1
                tool_counts[name] = tool_counts.get(name, 0) + 1
                if (
                    total_tool_calls > self.max_tool_calls
                    or tool_counts[name] > self.max_tool_calls_per_tool
                ):
                    result = {
                        "status": "failed",
                        "error": "tool budget exceeded",
                        "data": None,
                        "metadata": {"tool": name},
                    }
                else:
                    tool_result = await tool_registry.execute(name, args, ctx)
                    result = tool_result.model_dump()
                trace.append(
                    {
                        "step_index": step_index,
                        "phase": "tool",
                        "action": name,
                        "action_args": args,
                        "status": result.get("status"),
                    }
                )
                messages.append(
                    {
                        "role": "tool",
                        "tool_call_id": call.get("id"),
                        "content": json.dumps(result, ensure_ascii=False),
                    }
                )

        final = await llm_service.chat_with_tools(messages, tools=None, json_mode=True)
        messages.append(final)
        parsed = await self._finalize(messages, final.get("content") or "", episode)
        parsed.setdefault("trace_summary", trace)
        return parsed

    async def _finalize(
        self, messages: list[dict[str, Any]], content: str, episode: Episode
    ) -> dict[str, Any]:
        """Parse the agent's final answer, with a single corrective retry that
        forces JSON mode when the first attempt is not valid JSON."""
        try:
            return self._parse_agent_final(content, episode)
        except LLMError as exc:
            messages.append(
                {
                    "role": "user",
                    "content": (
                        "Your previous reply was not valid JSON: "
                        f"{exc}. Reply with ONLY the final JSON object for "
                        "episode_content/memory_patch — no prose, no code fences."
                    ),
                }
            )
            retry = await llm_service.chat_with_tools(messages, tools=None, json_mode=True)
            return self._parse_agent_final(retry.get("content") or "", episode)

    def _build_system_prompt(self, screenplay: Screenplay) -> str:
        parts = []
        try:
            parts.append(prompt_loader.load("episode_agent_base"))
        except FileNotFoundError:
            parts.append(prompt_loader.load("generation_agent"))
        schema_prompt = f"episode_agent_{screenplay.schema_type.value}"
        try:
            parts.append(prompt_loader.load(schema_prompt))
        except FileNotFoundError:
            pass
        return "\n\n".join(parts)

    def _parse_agent_final(self, text: str, episode: Episode) -> dict[str, Any]:
        parsed = self._loads(text)
        if "episode_content" not in parsed:
            parsed = {"episode_content": parsed}
        parsed.setdefault(
            "memory_patch",
            {
                "episode_num": episode.episode_num,
                "summary": parsed["episode_content"].get("episode_summary")
                or parsed["episode_content"].get("summary")
                or parsed["episode_content"].get("title")
                or episode.title
                or "",
                "ending_hook": parsed["episode_content"].get("ending_hook", ""),
                "character_state_changes": [],
                "new_open_threads": [],
                "resolved_threads": [],
                "used_source_events": [],
                "style_notes": [],
            },
        )
        parsed.setdefault("trace_summary", [])
        parsed.setdefault("critique_summary", [])
        parsed.setdefault("warnings", [])
        return parsed

    @staticmethod
    def _loads(text: str) -> dict[str, Any]:
        # Reuse the shared extractor: strips ``` fences, pulls the JSON block,
        # and repairs trailing commas. Any parse failure becomes an actionable
        # LLMError (carrying a snippet) instead of a bare JSONDecodeError, so the
        # whole episode does not crash with an opaque message.
        try:
            data = _extract_json(text)
        except (json.JSONDecodeError, ValueError) as exc:
            snippet = text.strip()[:200]
            raise LLMError(f"Agent returned invalid JSON ({exc}): {snippet}") from exc
        if not isinstance(data, dict):
            raise LLMError("Agent JSON output must be an object")
        return data


episode_writing_agent_service = EpisodeWritingAgentService()
