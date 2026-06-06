import json
from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core import get_settings
from app.models import (
    Chapter,
    Episode,
    EpisodeStatus,
    SceneInNovel,
    Screenplay,
    ScreenplayStatus,
    Task,
    TaskStatus,
    TaskType,
)
from app.services.episode_service import episode_service
from app.services.llm_service import LLMError, llm_service
from app.services.prompt_loader import prompt_loader
from app.services.task_service import task_service

_SCHEMA_FILES = {
    "ai_video": "aivideo.md",
    "screenwriter": "screenwriter.md",
    "overview": "overview.md",
}


class GenerationService:
    # ------------------------------------------------------------------ entry
    async def generate_episode(
        self, db: AsyncSession, episode: Episode, task: Task | None = None
    ) -> tuple[Episode, Task]:
        """Generate one episode, using the LLM when configured, else fallback.

        If ``task`` is given (e.g. pre-created by an async route) it is updated
        in place; otherwise a new task is created. The caller-less commit is
        handled here so both sync and worker callers get a persisted result."""
        screenplay = await db.get(Screenplay, episode.screenplay_id)
        if not screenplay:
            raise LookupError("Screenplay not found")

        if task is None:
            task = await task_service.create_task(
                db,
                task_type=TaskType.generate_episode,
                episode_id=episode.id,
                status=TaskStatus.running,
                progress=10,
            )
        else:
            task.status = TaskStatus.running
            if task.progress < 10:
                task.progress = 10
        await task_service.record_progress(
            db,
            screenplay.novel_id,
            "episode_generation_started",
            {"task_id": str(task.id), "episode_id": str(episode.id)},
        )

        content: dict | None = None
        if llm_service.enabled:
            try:
                content = await self._build_content_llm(db, screenplay, episode)
            except LLMError:
                content = None
        if content is None:
            content = await self.build_screenwriter_episode(db, screenplay, episode)

        episode.content = content
        episode.status = EpisodeStatus.done
        episode.generated_at = datetime.now(timezone.utc)
        await episode_service.save_version(db, episode, content, modified_by="ai")

        task.status = TaskStatus.done
        task.progress = 100
        screenplay.status = ScreenplayStatus.generating
        await task_service.record_progress(
            db,
            screenplay.novel_id,
            "episode_generated",
            {"episode_id": str(episode.id), "episode_num": episode.episode_num},
        )
        await db.commit()
        await db.refresh(episode)
        await db.refresh(task)
        return episode, task

    async def _build_content_llm(
        self, db: AsyncSession, screenplay: Screenplay, episode: Episode
    ) -> dict:
        from app.models import Novel

        novel = await db.get(Novel, screenplay.novel_id)
        chapters_result = await db.execute(
            select(Chapter)
            .where(
                Chapter.novel_id == screenplay.novel_id,
                Chapter.chapter_num.in_(episode.source_chapters or []),
            )
            .order_by(Chapter.chapter_num.asc())
        )
        chapters = list(chapters_result.scalars())

        previous_summary = await self._previous_episode_summary(db, screenplay, episode)
        system_prompt = prompt_loader.load("generation_agent")
        schema_definition = self._schema_definition(screenplay.schema_type.value)

        user_payload = {
            "episode_number": episode.episode_num,
            "source_chapters": episode.source_chapters or [],
            "schema_type": screenplay.schema_type.value,
            "schema_definition": schema_definition,
            "episode_plan": {
                "title": episode.title,
                "summary": "\n".join(
                    f"第{ch.chapter_num}章 {ch.title}: {ch.summary or ''}" for ch in chapters
                ),
            },
            "previous_episode_summary": previous_summary,
            "character_arcs": (novel.character_arcs if novel else []) or [],
            "source_text": "\n\n".join(
                f"【第{ch.chapter_num}章 {ch.title}】\n{ch.content}" for ch in chapters
            )[:24000],
            "instruction": "严格按照 schema_definition 输出该集 JSON，顶层包含 schema_version、schema_type、episode_number、source_chapter、title、scenes。",
        }
        content = await llm_service.generate_structured(
            system=system_prompt,
            user=json.dumps(user_payload, ensure_ascii=False),
            max_tokens=get_settings().llm_max_tokens,
        )
        return self._normalise_content(content, screenplay, episode)

    def _normalise_content(
        self, content: dict, screenplay: Screenplay, episode: Episode
    ) -> dict:
        content = dict(content or {})
        schema_type = screenplay.schema_type.value
        content.setdefault("schema_version", f"{schema_type}-1.0")
        content["schema_type"] = schema_type
        content.setdefault("episode_number", episode.episode_num)
        content.setdefault(
            "source_chapter", ",".join(str(num) for num in episode.source_chapters or [])
        )
        content.setdefault("title", episode.title or f"第 {episode.episode_num} 集")
        if not content.get("scenes"):
            content["scenes"] = []
        return content

    async def _previous_episode_summary(
        self, db: AsyncSession, screenplay: Screenplay, episode: Episode
    ) -> str:
        if episode.episode_num <= 1:
            return ""
        result = await db.execute(
            select(Episode)
            .where(
                Episode.screenplay_id == screenplay.id,
                Episode.episode_num == episode.episode_num - 1,
            )
        )
        previous = result.scalar_one_or_none()
        if not previous or not previous.content:
            return ""
        return str(
            previous.content.get("episode_summary")
            or previous.content.get("title")
            or ""
        )

    def _schema_definition(self, schema_type: str) -> str:
        filename = _SCHEMA_FILES.get(schema_type)
        if not filename:
            return ""
        path = get_settings().schema_dir / filename
        if not path.exists():
            return ""
        return path.read_text(encoding="utf-8")[:8000]

    # ----------------------------------------------------- fallback builder
    async def build_screenwriter_episode(
        self, db: AsyncSession, screenplay: Screenplay, episode: Episode
    ) -> dict:
        chapters_result = await db.execute(
            select(Chapter)
            .where(
                Chapter.novel_id == screenplay.novel_id,
                Chapter.chapter_num.in_(episode.source_chapters or []),
            )
            .order_by(Chapter.chapter_num.asc())
        )
        chapters = list(chapters_result.scalars())
        scenes_result = await db.execute(
            select(SceneInNovel, Chapter.chapter_num)
            .join(Chapter, Chapter.id == SceneInNovel.chapter_id)
            .where(
                SceneInNovel.novel_id == screenplay.novel_id,
                Chapter.chapter_num.in_(episode.source_chapters or []),
            )
            .order_by(Chapter.chapter_num.asc(), SceneInNovel.scene_index.asc())
        )
        scene_rows = list(scenes_result)
        scenes = [
            {
                "scene_number": index,
                "slug_line": "内景/外景 - 待定 - 待定",
                "source_chapter": chapter_num,
                "scene_objective": scene.description or "承接原著情节",
                "action_description": scene.content,
                "characters_present": scene.characters,
                "dialogues": [],
                "rewrite_notes": "fallback 初稿：需由生成 agent 或编剧进一步打磨。",
            }
            for index, (scene, chapter_num) in enumerate(scene_rows, start=1)
        ]
        return {
            "schema_version": f"{screenplay.schema_type.value}-1.0",
            "schema_type": screenplay.schema_type.value,
            "episode_number": episode.episode_num,
            "title": episode.title or f"第 {episode.episode_num} 集",
            "source_chapter": ",".join(str(num) for num in episode.source_chapters or []),
            "episode_summary": "\n".join(chapter.summary or chapter.title for chapter in chapters),
            "key_conflict": "待生成",
            "emotional_arc": "待生成",
            "scenes": scenes,
        }


generation_service = GenerationService()
