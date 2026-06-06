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
    # screenplay_validate 故意不在列：它只做 isinstance 校验却逼模型把整集
    # 内容塞进工具参数，复杂集会在 max_tokens 处截断，导致工具参数 JSON 不完整。
}

# 工具的中文标签，用于在 UI 实时展示 agent 正在做什么。
_TOOL_LABELS = {
    "chapter_get": "读取章节",
    "chapter_search": "检索原文片段",
    "character_timeline": "梳理人物时间线",
    "foreshadowing_lookup": "查证伏笔",
    "screenplay_plan_get": "读取改编方案",
    "screenplay_memory_get": "读取连续性记忆",
    "episode_get": "读取相邻集",
    "episode_context": "读取上下文",
}


class EpisodeWritingAgentService:
    # Per-scene incremental generation: a small ReAct budget per stage keeps each
    # LLM call's input/output small, so generation never approaches the model's
    # max_tokens ceiling regardless of episode size or count.
    outline_max_steps = 5
    scene_max_steps = 4
    max_tool_calls_per_stage = 8
    max_tool_calls_per_tool = 3
    max_scenes = 12

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

    async def _react_to_json(
        self,
        db: AsyncSession,
        screenplay: Screenplay,
        episode: Episode,
        *,
        messages: list[dict[str, Any]],
        tool_specs: list[dict[str, Any]],
        ctx: ToolContext,
        max_steps: int,
    ) -> dict[str, Any]:
        """Run a bounded ReAct loop where the agent retrieves what it needs via
        tools, then returns its final JSON object. Used for both the episode
        outline and each per-scene draft, so every call stays small and never
        approaches the model's max_tokens ceiling regardless of episode size."""
        tool_counts: dict[str, int] = {}
        total_tool_calls = 0

        for step_index in range(1, max_steps + 1):
            assistant = await llm_service.chat_with_tools(messages, tool_specs)
            messages.append(assistant)
            calls = assistant.get("tool_calls") or []
            if not calls:
                return await self._parse_or_retry(
                    messages, assistant.get("content") or ""
                )

            tool_names = [(c.get("function") or {}).get("name", "") for c in calls]
            await self._emit_step(
                db, screenplay, episode,
                step_index=step_index, phase="research",
                label="检索原著 · " + "、".join(
                    _TOOL_LABELS.get(n, n) for n in tool_names
                ),
                tools=tool_names,
            )

            for call in calls:
                name = (call.get("function") or {}).get("name", "")
                raw_args = (call.get("function") or {}).get("arguments") or "{}"
                total_tool_calls += 1
                tool_counts[name] = tool_counts.get(name, 0) + 1
                try:
                    args = self._loads(raw_args)
                except LLMError:
                    # Truncated/invalid tool arguments — usually the model inlined
                    # a huge object (e.g. the whole episode) and hit the token
                    # limit. Surface as a recoverable tool error so the agent can
                    # adjust, instead of failing the entire episode.
                    args = {}
                    result = {
                        "status": "failed",
                        "error": (
                            "tool arguments were not valid JSON (likely truncated); "
                            "do not pass large objects as tool arguments"
                        ),
                        "data": None,
                        "metadata": {"tool": name},
                    }
                else:
                    if (
                        total_tool_calls > self.max_tool_calls_per_stage
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
                messages.append(
                    {
                        "role": "tool",
                        "tool_call_id": call.get("id"),
                        "content": json.dumps(result, ensure_ascii=False),
                    }
                )

        final = await llm_service.chat_with_tools(messages, tools=None, json_mode=True)
        messages.append(final)
        return await self._parse_or_retry(messages, final.get("content") or "")

    async def _emit_step(
        self,
        db: AsyncSession,
        screenplay: Screenplay,
        episode: Episode,
        *,
        step_index: int,
        phase: str,
        label: str,
        tools: list[str] | None = None,
    ) -> None:
        """Persist one visible ReAct step so the UI can show the agent's live
        progress. Telemetry must never break generation."""
        try:
            await task_service.record_progress(
                db,
                screenplay.novel_id,
                "agent_episode_step",
                {
                    "episode_id": str(episode.id),
                    "episode_num": episode.episode_num,
                    "step_index": step_index,
                    "phase": phase,
                    "label": label,
                    "tools": tools or [],
                },
            )
        except Exception:  # noqa: BLE001 - never let progress telemetry fail a run
            pass

    async def _run_agent(
        self, db: AsyncSession, screenplay: Screenplay, episode: Episode
    ) -> dict[str, Any]:
        """Generate one episode incrementally: a small outline pass, then one
        retrieval+draft ReAct pass per scene, then assemble. Each LLM call is
        small, so this scales to long episodes and 20+ episode screenplays
        without ever hitting the model's output ceiling."""
        novel = await db.get(Novel, screenplay.novel_id)
        system_prompt = self._build_system_prompt(screenplay)
        schema_type = screenplay.schema_type.value
        schema_def = generation_service._schema_definition(schema_type)
        # Capped memory: keep recent episodes in full, older ones as a digest, so
        # context does not balloon as episode count grows.
        memory = screenplay_memory_service.get_memory_for_prompt(screenplay)
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
        common = {
            "episode_num": episode.episode_num,
            "source_chapters": episode.source_chapters or [],
            "schema_type": schema_type,
            "novel_title": novel.title if novel else "",
            "novel_summary": novel.summary if novel else "",
            "adaptation_plan": screenplay.adaptation_plan or {},
            "style_preferences": screenplay.style_preferences or {},
            "screenplay_memory": memory,
        }

        # ---- Stage 1: episode outline (small output, no full scene content) ----
        await self._emit_step(
            db, screenplay, episode, step_index=0, phase="plan",
            label="规划本集场景大纲",
        )
        outline_payload = {
            **common,
            "task": "plan_episode_outline",
            "instruction": (
                "先用 chapter_get(summary/key_events) 与 chapter_search 研究本集源章节，"
                "再输出本集场景大纲。只输出大纲，不要写完整场景内容/对白/分镜。"
            ),
            "output_contract": {
                "title": "本集标题",
                "episode_summary": "本集梗概",
                "key_conflict": "本集核心冲突",
                "emotional_arc": "本集情感曲线",
                "ending_hook": "结尾钩子",
                "scenes": [
                    {
                        "scene_number": "整数",
                        "intent": "本场戏剧目标/要发生什么",
                        "source_chapters": "本场涉及的源章节号数组",
                        "search_hints": "检索本场原文用的关键词数组",
                        "characters": "出场角色名数组",
                    }
                ],
            },
        }
        outline = await self._react_to_json(
            db, screenplay, episode,
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": json.dumps(outline_payload, ensure_ascii=False)},
            ],
            tool_specs=tool_specs, ctx=ctx, max_steps=self.outline_max_steps,
        )
        scene_briefs = outline.get("scenes")
        if not isinstance(scene_briefs, list) or not scene_briefs:
            raise LLMError("Episode outline produced no scenes")
        scene_briefs = scene_briefs[: self.max_scenes]

        # ---- Stage 2: draft each scene with its own targeted retrieval ----
        scenes: list[dict[str, Any]] = []
        digests: list[dict[str, Any]] = []
        total = len(scene_briefs)
        for idx, brief in enumerate(scene_briefs, start=1):
            intent = brief.get("intent") if isinstance(brief, dict) else ""
            intent = str(intent or "")
            await self._emit_step(
                db, screenplay, episode, step_index=idx, phase="draft",
                label=f"撰写第 {idx}/{total} 场 · {intent[:24]}",
            )
            scene_payload = {
                "task": "draft_one_scene",
                "schema_type": schema_type,
                "schema_definition": schema_def,
                "episode_num": episode.episode_num,
                "scene_brief": brief,
                "prior_scenes_digest": digests,
                "screenplay_memory": memory,
                "instruction": (
                    "用 chapter_search / chapter_get(summary/key_events) 检索本场所需原文，"
                    "只输出这一个场景对象，严格遵循 schema_definition 中 scenes[] 单个场景的字段"
                    "（逐字段对齐，禁止自创字段名）。不要输出整集，不要输出 scenes 数组。"
                ),
                "output_contract": {
                    "scene": "符合 schema scenes[] 的单个场景对象",
                    "scene_digest": "一句话概括本场结果，供下一场衔接",
                },
            }
            out = await self._react_to_json(
                db, screenplay, episode,
                messages=[
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": json.dumps(scene_payload, ensure_ascii=False)},
                ],
                tool_specs=tool_specs, ctx=ctx, max_steps=self.scene_max_steps,
            )
            nested = out.get("scene")
            scene_obj = nested if isinstance(nested, dict) else out
            if isinstance(scene_obj, dict):
                scene_obj.setdefault("scene_number", idx)
                scenes.append(scene_obj)
            digests.append(
                {"scene_number": idx, "digest": out.get("scene_digest") or intent}
            )

        # ---- Stage 3: assemble the full episode (normalisation happens upstream) ----
        episode_content = {
            "schema_type": schema_type,
            "episode_number": episode.episode_num,
            "title": outline.get("title") or episode.title or f"第 {episode.episode_num} 集",
            "episode_summary": outline.get("episode_summary", ""),
            "key_conflict": outline.get("key_conflict", ""),
            "emotional_arc": outline.get("emotional_arc", ""),
            "scenes": scenes,
        }
        return {
            "episode_content": episode_content,
            "memory_patch": {
                "episode_num": episode.episode_num,
                "summary": outline.get("episode_summary") or episode.title or "",
                "ending_hook": outline.get("ending_hook", ""),
                "character_state_changes": [],
                "new_open_threads": [],
                "resolved_threads": [],
                "used_source_events": [],
                "style_notes": [],
            },
            "trace_summary": [
                {"phase": "plan", "summary": str(outline.get("episode_summary", ""))[:120]},
                {"phase": "draft", "summary": f"逐场景生成 {len(scenes)} 场"},
            ],
            "critique_summary": [],
            "warnings": [],
        }

    async def _parse_or_retry(
        self, messages: list[dict[str, Any]], content: str
    ) -> dict[str, Any]:
        """Parse a stage's final answer; one corrective retry forcing JSON mode."""
        try:
            return self._loads(content)
        except LLMError as exc:
            messages.append(
                {
                    "role": "user",
                    "content": (
                        f"上一条不是合法 JSON：{exc}。请只输出合法 JSON 对象，"
                        "不要 Markdown、不要解释。"
                    ),
                }
            )
            retry = await llm_service.chat_with_tools(messages, tools=None, json_mode=True)
            return self._loads(retry.get("content") or "")

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
