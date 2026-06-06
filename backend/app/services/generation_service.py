import json
import logging
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
    SchemaType,
    Task,
    TaskStatus,
    TaskType,
)
from app.services.episode_service import episode_service
from app.services.llm_service import LLMError, llm_service
from app.services.prompt_loader import prompt_loader
from app.services.screenplay_service import _as_chapter_nums
from app.services.task_service import task_service

_logger = logging.getLogger(__name__)

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

        resolved_chapters = await self._resolve_source_chapters(db, screenplay, episode)
        if resolved_chapters != (episode.source_chapters or []):
            episode.source_chapters = resolved_chapters

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
        generation_error: str | None = None
        llm_error: str | None = None

        if not episode.source_chapters:
            generation_error = (
                f"第 {episode.episode_num} 集未分配有效源章节，"
                "请返回「改编方案」页重新分配集→章映射"
            )
        elif llm_service.enabled:
            try:
                content = await self._build_content_llm(db, screenplay, episode)
            except LLMError as exc:
                _logger.warning(
                    "LLM generation failed for episode %s (num %s), using fallback: %s",
                    episode.id,
                    episode.episode_num,
                    exc,
                )
                llm_error = str(exc)
                content = None

        if content is None and not generation_error:
            if screenplay.schema_type == SchemaType.ai_video:
                content = await self.build_ai_video_episode(db, screenplay, episode)
            else:
                content = await self.build_screenwriter_episode(db, screenplay, episode)

        if not generation_error and not self._has_usable_content(content, screenplay.schema_type):
            generation_error = llm_error or (
                f"第 {episode.episode_num} 集生成结果为空，"
                "请确认对应章节已完成预处理后再试"
            )

        if generation_error:
            episode.status = EpisodeStatus.failed
            episode.error_message = generation_error
            task.status = TaskStatus.failed
            task.error_message = generation_error
            await db.commit()
            await db.refresh(episode)
            await db.refresh(task)
            return episode, task

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
        if not chapters:
            raise LLMError(
                f"第 {episode.episode_num} 集对应的源章节 "
                f"{episode.source_chapters or []} 在数据库中不存在"
            )

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
            "instruction": self._generation_instruction(
                screenplay.schema_type.value, episode.episode_num
            ),
        }
        user = json.dumps(user_payload, ensure_ascii=False)
        max_tokens = self._effective_max_tokens(screenplay.schema_type)
        # Long, rich Chinese JSON occasionally comes back with a syntax slip
        # (e.g. a missing comma) and fails to parse. A low temperature makes the
        # structure far more reliable, and we retry a couple of times before the
        # caller falls back to the deterministic template.
        last_err: LLMError | None = None
        for attempt in range(3):
            try:
                content = await llm_service.generate_structured(
                    system=system_prompt,
                    user=user,
                    max_tokens=max_tokens,
                    temperature=0.2,
                )
                return self._normalise_content(content, screenplay, episode)
            except LLMError as exc:
                last_err = exc
                _logger.warning(
                    "Episode %s generation attempt %d/3 failed: %s",
                    episode.episode_num,
                    attempt + 1,
                    exc,
                )
        raise last_err if last_err else LLMError("generation failed")

    def _normalise_content(
        self, content: dict, screenplay: Screenplay, episode: Episode
    ) -> dict:
        content = dict(content or {})
        # If the model returned a whole-screenplay shape (scenes nested under an
        # ``episodes`` array) instead of a single episode, lift this episode's
        # scenes (and episode-level fields) up to the top level.
        if not content.get("scenes"):
            nested = self._episode_from_collection(content, episode.episode_num)
            if nested:
                for key in ("scenes", "episode_summary", "key_conflict", "emotional_arc", "title"):
                    if nested.get(key) and not content.get(key):
                        content[key] = nested[key]
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
        if schema_type == SchemaType.ai_video.value:
            content = self._normalise_ai_video_scenes(content, episode)
        return content

    @staticmethod
    def _generation_instruction(schema_type: str, episode_num: int) -> str:
        if schema_type == "ai_video":
            return (
                f"只生成【第 {episode_num} 集】这一集，输出**单个 JSON 对象**。"
                "顶层必须直接包含 scenes 数组；**不要**包进 episodes 数组。"
                "顶层字段：schema_version、schema_type、episode_number、source_chapter、"
                "title、episode_summary、scenes。"
                "每个 scene 含 location/scene_number 与 shots 分镜数组。"
                "每个 shot 必填 shot_id、duration_seconds、shot_type、camera_movement、"
                "subject、subject_action、background、lighting、generation_prompt（英文完整提示词）。"
                "对白放在 shot.dialogue 数组。不要输出编剧版 slug_line/dialogues 顶层结构。"
            )
        return (
            f"只生成【第 {episode_num} 集】这一集，输出**单个 JSON 对象**，"
            "顶层必须直接包含 scenes 数组（本集所有场景）。"
            "**不要**输出整剧结构：不要 character_list、synopsis、theme_keywords，"
            "也**不要**把内容包进 episodes 数组里。"
            "顶层字段：schema_version、schema_type、episode_number、source_chapter、"
            "title、episode_summary、key_conflict、emotional_arc、scenes。"
            "scenes 内每个场景的字段遵循 schema_definition 中 scenes 的定义。"
        )

    @staticmethod
    def _effective_max_tokens(schema_type: SchemaType) -> int:
        base = get_settings().llm_max_tokens
        if schema_type == SchemaType.ai_video:
            return max(base, 8192)
        return base

    async def _resolve_source_chapters(
        self, db: AsyncSession, screenplay: Screenplay, episode: Episode
    ) -> list[int]:
        raw = list(episode.source_chapters or [])
        if not raw:
            for item in (screenplay.adaptation_plan or {}).get("episodes", []):
                try:
                    ep_num = int(item.get("episode_num") or 0)
                except (TypeError, ValueError):
                    continue
                if ep_num == episode.episode_num:
                    raw = _as_chapter_nums(
                        item.get("source_chapters") or item.get("chapters") or []
                    )
                    break
        if not raw:
            return []
        result = await db.execute(
            select(Chapter.chapter_num).where(
                Chapter.novel_id == screenplay.novel_id,
                Chapter.chapter_num.in_(raw),
            )
        )
        existing = set(result.scalars())
        valid = [num for num in raw if num in existing]
        if raw and not valid:
            _logger.warning(
                "Episode %s requested chapters %s but none exist in DB",
                episode.episode_num,
                raw,
            )
        return valid

    @staticmethod
    def _has_usable_content(content: dict | None, schema_type: SchemaType) -> bool:
        if not content:
            return False
        scenes = content.get("scenes") or []
        if not scenes:
            return False
        if schema_type == SchemaType.ai_video:
            return any(
                isinstance(scene, dict) and scene.get("shots")
                for scene in scenes
            )
        return True

    def _normalise_ai_video_scenes(self, content: dict, episode: Episode) -> dict:
        scenes = content.get("scenes") or []
        normalised: list[dict] = []
        for scene_index, scene in enumerate(scenes, start=1):
            if not isinstance(scene, dict):
                continue
            shots = scene.get("shots")
            if not isinstance(shots, list) or not shots:
                wrapped = self._screenwriter_scene_to_shot(scene, episode, scene_index)
                scene = {**scene, "shots": [wrapped]}
            normalised.append(scene)
        content["scenes"] = normalised
        return content

    @staticmethod
    def _screenwriter_scene_to_shot(scene: dict, episode: Episode, scene_index: int) -> dict:
        action = (
            scene.get("action_description")
            or scene.get("action")
            or scene.get("scene_objective")
            or "承接原著情节"
        )
        slug = scene.get("slug_line") or scene.get("heading") or scene.get("location") or "场景"
        dialogues = scene.get("dialogues") or scene.get("dialogue") or []
        return {
            "shot_id": f"ep{episode.episode_num}_sc{scene_index}_sh1",
            "duration_seconds": 5,
            "shot_type": "中景",
            "camera_movement": "固定",
            "subject": slug,
            "subject_action": str(action)[:500],
            "background": str(slug),
            "lighting": "自然光",
            "generation_prompt": (
                f"Cinematic medium shot, {str(action)[:200]}, natural lighting, film still"
            ),
            "dialogue": [
                {
                    "character_id": d.get("character") or d.get("character_id") or "",
                    "line": d.get("line") or d.get("text") or "",
                    **(
                        {"voice_tone": d["voice_tone"]}
                        if d.get("voice_tone")
                        else {}
                    ),
                }
                for d in dialogues
                if isinstance(d, dict) and (d.get("line") or d.get("text"))
            ],
        }

    @staticmethod
    def _episode_from_collection(content: dict, episode_num: int) -> dict | None:
        """Pick this episode out of a whole-screenplay ``episodes`` array, by
        matching ``episode_number`` first, else the first entry that has scenes."""
        episodes = content.get("episodes")
        if not isinstance(episodes, list):
            return None
        for ep in episodes:
            if isinstance(ep, dict) and ep.get("episode_number") == episode_num and ep.get("scenes"):
                return ep
        return None

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

    # ----------------------------------------------------- fallback builders
    async def build_ai_video_episode(
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
        scenes: list[dict] = []
        if scene_rows:
            for scene_index, (scene, chapter_num) in enumerate(scene_rows, start=1):
                subject = scene.characters[0] if scene.characters else "待定"
                action = scene.description or scene.content or "承接原著情节"
                scenes.append(
                    {
                        "scene_number": scene_index,
                        "location": f"第{chapter_num}章",
                        "shots": [
                            {
                                "shot_id": f"ep{episode.episode_num}_sc{scene_index}_sh1",
                                "duration_seconds": 5,
                                "shot_type": "中景",
                                "camera_movement": "固定",
                                "subject": subject,
                                "subject_action": str(action)[:500],
                                "background": str(action)[:300],
                                "lighting": "自然光",
                                "generation_prompt": (
                                    "Cinematic medium shot, "
                                    f"{str(action)[:200]}, natural lighting, film still"
                                ),
                                "dialogue": [],
                            }
                        ],
                    }
                )
        elif chapters:
            for scene_index, chapter in enumerate(chapters, start=1):
                excerpt = (chapter.content or chapter.summary or chapter.title)[:400]
                scenes.append(
                    {
                        "scene_number": scene_index,
                        "location": f"第{chapter.chapter_num}章 {chapter.title}",
                        "shots": [
                            {
                                "shot_id": f"ep{episode.episode_num}_sc{scene_index}_sh1",
                                "duration_seconds": 5,
                                "shot_type": "中景",
                                "camera_movement": "缓慢推近",
                                "subject": chapter.title,
                                "subject_action": excerpt,
                                "background": chapter.title,
                                "lighting": "自然光，电影感",
                                "generation_prompt": (
                                    "Cinematic medium shot, "
                                    f"{excerpt[:200]}, natural lighting, shallow depth of field"
                                ),
                                "dialogue": [],
                            }
                        ],
                    }
                )
        return {
            "schema_version": "ai-video-1.0",
            "schema_type": "ai_video",
            "episode_number": episode.episode_num,
            "title": episode.title or f"第 {episode.episode_num} 集",
            "source_chapter": ",".join(str(num) for num in episode.source_chapters or []),
            "episode_summary": "\n".join(
                chapter.summary or chapter.title for chapter in chapters
            ),
            "scenes": scenes,
        }

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
