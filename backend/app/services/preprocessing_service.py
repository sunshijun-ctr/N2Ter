import json
import re
from dataclasses import dataclass

from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import (
    Chapter,
    Character,
    CharacterRole,
    Novel,
    NovelStatus,
    ProgressEvent,
    QualityLevel,
    SceneInNovel,
    Task,
    TaskStatus,
)
from app.services.embedding_service import embedding_service
from app.services.llm_service import LLMError, llm_service
from app.services.overview_service import overview_service
from app.services.prompt_loader import prompt_loader
from app.services.task_service import task_service
from app.services.vector_store_service import vector_store_service


@dataclass(frozen=True)
class PreprocessResult:
    task: Task
    events: list[ProgressEvent]


_ROLE_MAP = {
    "protagonist": CharacterRole.protagonist,
    "male_lead": CharacterRole.protagonist,
    "female_lead": CharacterRole.protagonist,
    "lead": CharacterRole.protagonist,
    "supporting": CharacterRole.supporting,
    "minor": CharacterRole.minor,
}


class PreprocessingService:
    # ------------------------------------------------------------------ entry
    async def execute(self, db: AsyncSession, novel: Novel, task: Task) -> PreprocessResult:
        """Full preprocessing orchestration: load chapters, emit the opening
        progress events, set status, then run the pipeline. Shared by the
        synchronous route path and the Celery worker. The caller commits."""
        chapters = list(
            (
                await db.execute(
                    select(Chapter)
                    .where(Chapter.novel_id == novel.id)
                    .order_by(Chapter.chapter_num.asc())
                )
            ).scalars()
        )
        task.status = TaskStatus.running
        if task.progress < 10:
            task.progress = 10
        await task_service.record_progress(db, novel.id, "preprocess_started", {"task_id": str(task.id)})
        await task_service.record_progress(
            db, novel.id, "split_completed", {"chapter_count": len(chapters)}
        )
        novel.status = NovelStatus.preprocessing
        novel.preprocessing_stages = {**(novel.preprocessing_stages or {}), "split": "done"}
        return await self.run_preprocess(db, novel, task, chapters)

    async def run_preprocess(
        self,
        db: AsyncSession,
        novel: Novel,
        task: Task,
        chapters: list[Chapter],
    ) -> PreprocessResult:
        """Dispatch to the LLM pipeline when configured, else the fallback."""
        if llm_service.enabled:
            return await self.run_llm_preprocess(db, novel, task, chapters)
        return await self.run_fallback_preprocess(db, novel, task, chapters)

    # -------------------------------------------------------------- LLM path
    async def run_llm_preprocess(
        self,
        db: AsyncSession,
        novel: Novel,
        task: Task,
        chapters: list[Chapter],
    ) -> PreprocessResult:
        events: list[ProgressEvent] = []
        system_prompt = prompt_loader.load("preprocessing_agent")
        events.append(
            await task_service.record_progress(
                db, novel.id, "chapters_started", {"chapter_count": len(chapters)}
            )
        )

        await db.execute(delete(SceneInNovel).where(SceneInNovel.novel_id == novel.id))
        await db.execute(delete(Character).where(Character.novel_id == novel.id))

        summaries: list[str] = []
        fallback_chapters = 0
        scene_records: list[SceneInNovel] = []

        # Stage 2: per-chapter summary + key events + scene segmentation.
        for index, chapter in enumerate(chapters):
            summary, summary_quality = await self._chapter_summary(system_prompt, chapter)
            chapter.summary = summary
            chapter.summary_quality = summary_quality
            chapter.key_events = self.extract_key_events(chapter.content)

            scenes, seg_quality = await self._segment_scenes(system_prompt, chapter)
            for scene_index, scene in enumerate(scenes, start=1):
                record = SceneInNovel(
                    novel_id=novel.id,
                    chapter_id=chapter.id,
                    scene_index=scene_index,
                    content=scene["content"],
                    description=scene.get("description") or self.describe_scene(scene["content"]),
                    characters=scene.get("characters", []),
                    vectorized=False,
                    segmentation_quality=seg_quality,
                )
                db.add(record)
                scene_records.append(record)

            chapter.preprocessing_status = {
                "summary": summary_quality.value if summary_quality else "done",
                "key_events": "done",
                "segmentation": seg_quality.value if seg_quality else "done",
            }
            if summary_quality == QualityLevel.fallback or seg_quality == QualityLevel.fallback:
                fallback_chapters += 1
            summaries.append(f"第{chapter.chapter_num}章 {chapter.title}: {summary}")

            events.append(
                await task_service.record_progress(
                    db,
                    novel.id,
                    "chapter_done",
                    {
                        "chapter_num": chapter.chapter_num,
                        "scene_count": len(scenes),
                        "progress": int((index + 1) / max(len(chapters), 1) * 100),
                    },
                )
            )
        await db.flush()

        # Stage 3: novel-level analysis.
        novel.summary = await self._novel_summary(system_prompt, summaries)
        events.append(await task_service.record_progress(db, novel.id, "novel_summary_done", {}))

        character_arcs = await self._character_arcs(system_prompt, summaries)
        novel.character_arcs = character_arcs
        for arc in character_arcs:
            db.add(
                Character(
                    novel_id=novel.id,
                    name=arc.get("name", "未命名角色"),
                    role=_ROLE_MAP.get(str(arc.get("role", "")).lower(), CharacterRole.supporting),
                    arc_description=self._arc_to_text(arc.get("arc")),
                    timeline=arc.get("timeline", []),
                )
            )
        events.append(
            await task_service.record_progress(
                db, novel.id, "characters_done", {"character_count": len(character_arcs)}
            )
        )

        foreshadowing = await self._foreshadowing(system_prompt, summaries)
        novel.foreshadowing = foreshadowing
        events.append(
            await task_service.record_progress(
                db, novel.id, "foreshadowing_done", {"pair_count": len(foreshadowing)}
            )
        )

        # Stage 4: vectorisation.
        vectorized = await self._vectorize(novel, scene_records)
        events.append(
            await task_service.record_progress(
                db, novel.id, "vectorize_progress", {"progress": 100, "vectorized": vectorized}
            )
        )

        # Stage 5: genre verification.
        genre = await self._verify_genre(system_prompt, novel)
        if genre:
            novel.ai_predicted_genres = genre.get("predicted_genres", [])
            novel.genre_confidence = genre.get("confidence")
            overlap = set(novel.user_selected_genres or []) & set(novel.ai_predicted_genres or [])
            novel.needs_genre_confirmation = bool(
                not overlap and (genre.get("confidence") or 0) > 0.8
            )
        events.append(
            await task_service.record_progress(
                db,
                novel.id,
                "genre_verified",
                {"needs_confirmation": novel.needs_genre_confirmation},
            )
        )

        # Stage 6: auto-generate the free overview screenplay.
        overview_ok = False
        try:
            await db.flush()
            overview_screenplay, _ = await overview_service.generate_overview(db, novel)
            overview_ok = True
            events.append(
                await task_service.record_progress(
                    db,
                    novel.id,
                    "overview_done",
                    {"overview_id": str(overview_screenplay.id)},
                )
            )
        except Exception:  # noqa: BLE001 - overview is best-effort
            pass

        # Finalise.
        novel.preprocessing_quality = self._quality_level(fallback_chapters, len(chapters))
        novel.status = NovelStatus.ready_for_planning
        novel.preprocessing_stages = {
            "split": "done",
            "chapters": "done",
            "novel_analysis": "done",
            "vectorize": "done" if vectorized else "fallback",
            "genre": "done" if genre else "fallback",
            "overview": "done" if overview_ok else "fallback",
        }
        task.status = TaskStatus.done
        task.progress = 100
        events.append(
            await task_service.record_progress(
                db,
                novel.id,
                "preprocess_done",
                {
                    "chapter_count": len(chapters),
                    "scene_count": len(scene_records),
                    "quality": novel.preprocessing_quality.value,
                },
            )
        )
        return PreprocessResult(task=task, events=events)

    # ----------------------------------------------------------- LLM helpers
    async def _chapter_summary(
        self, system_prompt: str, chapter: Chapter
    ) -> tuple[str, QualityLevel | None]:
        user = self._task_payload(
            "chapter_summarize",
            {"word_count": 500, "chapter_title": chapter.title, "chapter_content": chapter.content},
        )
        try:
            result = await llm_service.generate_structured(system=system_prompt, user=user)
            summary = (result.get("summary") or "").strip()
            if summary:
                return summary, None
        except LLMError:
            pass
        return self.summarize_chapter(chapter.content), QualityLevel.fallback

    async def _segment_scenes(
        self, system_prompt: str, chapter: Chapter
    ) -> tuple[list[dict], QualityLevel | None]:
        user = self._task_payload(
            "segment_scenes", {"chapter_content": chapter.content}
        )
        try:
            result = await llm_service.generate_structured(system=system_prompt, user=user)
            raw_scenes = result.get("scenes") or []
            scenes = self._materialise_scenes(chapter.content, raw_scenes)
            if scenes:
                return scenes, None
        except LLMError:
            pass
        return (
            [{"content": part} for part in self.segment_chapter(chapter.content)],
            QualityLevel.fallback,
        )

    def _materialise_scenes(self, content: str, raw_scenes: list[dict]) -> list[dict]:
        scenes: list[dict] = []
        for scene in raw_scenes:
            text = ""
            start, end = scene.get("start_char"), scene.get("end_char")
            if isinstance(start, int) and isinstance(end, int) and 0 <= start < end <= len(content):
                text = content[start:end].strip()
            if not text:
                text = (scene.get("content") or "").strip()
            if not text:
                continue
            scenes.append(
                {
                    "content": text,
                    "description": scene.get("description"),
                    "characters": scene.get("characters", []),
                }
            )
        return scenes

    async def _novel_summary(self, system_prompt: str, summaries: list[str]) -> str:
        user = self._task_payload("novel_summary", {"chapter_summaries": "\n".join(summaries)})
        try:
            result = await llm_service.generate_structured(system=system_prompt, user=user)
            summary = (result.get("summary") or "").strip()
            if summary:
                return summary
        except LLMError:
            pass
        return self.summarize_novel(summaries)

    async def _character_arcs(self, system_prompt: str, summaries: list[str]) -> list[dict]:
        user = self._task_payload(
            "analyze_character",
            {"chapter_summaries": "\n".join(summaries), "instruction": "识别主角与主要配角(5-15个)并各自给出弧光"},
        )
        try:
            result = await llm_service.generate_structured(system=system_prompt, user=user)
            arcs = result.get("characters") or result.get("data") or []
            if isinstance(arcs, dict):
                arcs = [arcs]
            return [arc for arc in arcs if isinstance(arc, dict) and arc.get("name")]
        except LLMError:
            return []

    async def _foreshadowing(self, system_prompt: str, summaries: list[str]) -> list[dict]:
        user = self._task_payload("find_foreshadowing", {"novel_content": "\n".join(summaries)})
        try:
            result = await llm_service.generate_structured(system=system_prompt, user=user)
            pairs = result.get("pairs") or []
            return [pair for pair in pairs if isinstance(pair, dict)]
        except LLMError:
            return []

    async def _verify_genre(self, system_prompt: str, novel: Novel) -> dict | None:
        user = self._task_payload(
            "classify_genre",
            {
                "novel_summary": novel.summary or "",
                "character_arcs": json.dumps(novel.character_arcs or [], ensure_ascii=False),
            },
        )
        try:
            return await llm_service.generate_structured(system=system_prompt, user=user)
        except LLMError:
            return None

    async def _vectorize(self, novel: Novel, scenes: list[SceneInNovel]) -> int:
        if not scenes:
            return 0
        texts = [scene.content for scene in scenes]
        try:
            embeddings = await embedding_service.embed_batch(texts)
        except Exception:
            return 0
        ids = [str(scene.id) for scene in scenes]
        metadatas = [
            {
                "chapter_num": None,
                "scene_index": scene.scene_index,
                "description": scene.description,
                "characters": scene.characters,
            }
            for scene in scenes
        ]
        upserted = vector_store_service.upsert(str(novel.id), ids, embeddings, texts, metadatas)
        if upserted:
            for scene in scenes:
                scene.vector_id = str(scene.id)
                scene.vectorized = True
            return len(scenes)
        return 0

    def _task_payload(self, task: str, fields: dict) -> str:
        return json.dumps({"task": task, **fields}, ensure_ascii=False)

    @staticmethod
    def _arc_to_text(arc) -> str | None:
        if isinstance(arc, dict):
            parts = []
            if arc.get("start"):
                parts.append(f"起点：{arc['start']}")
            turning = arc.get("turning_points") or []
            if turning:
                parts.append("转折：" + "；".join(str(t) for t in turning))
            if arc.get("end"):
                parts.append(f"终点：{arc['end']}")
            return " ".join(parts) or None
        if isinstance(arc, str):
            return arc
        return None

    @staticmethod
    def _quality_level(fallback_count: int, total: int) -> QualityLevel:
        if total == 0:
            return QualityLevel.good
        ratio = fallback_count / total
        if ratio < 0.05:
            return QualityLevel.excellent
        if ratio < 0.15:
            return QualityLevel.good
        if ratio < 0.30:
            return QualityLevel.degraded
        return QualityLevel.poor

    # --------------------------------------------------------- fallback path
    async def run_fallback_preprocess(
        self,
        db: AsyncSession,
        novel: Novel,
        task: Task,
        chapters: list[Chapter],
    ) -> PreprocessResult:
        events: list[ProgressEvent] = []
        events.append(
            await task_service.record_progress(
                db, novel.id, "chapters_started", {"chapter_count": len(chapters)}
            )
        )

        await db.execute(delete(SceneInNovel).where(SceneInNovel.novel_id == novel.id))
        summaries: list[str] = []
        scene_count = 0

        for chapter in chapters:
            summary = self.summarize_chapter(chapter.content)
            chapter.summary = summary
            chapter.summary_quality = QualityLevel.fallback
            chapter.key_events = self.extract_key_events(chapter.content)
            chapter.preprocessing_status = {
                "summary": "fallback",
                "key_events": "fallback",
                "segmentation": "fallback",
            }
            summaries.append(f"{chapter.chapter_num}. {summary}")

            scenes = self.segment_chapter(chapter.content)
            for scene_index, scene_content in enumerate(scenes, start=1):
                db.add(
                    SceneInNovel(
                        novel_id=novel.id,
                        chapter_id=chapter.id,
                        scene_index=scene_index,
                        content=scene_content,
                        description=self.describe_scene(scene_content),
                        characters=[],
                        vectorized=False,
                        segmentation_quality=QualityLevel.fallback,
                    )
                )
                scene_count += 1

            events.append(
                await task_service.record_progress(
                    db,
                    novel.id,
                    "chapter_done",
                    {
                        "chapter_num": chapter.chapter_num,
                        "scene_count": len(scenes),
                        "quality": QualityLevel.fallback.value,
                    },
                )
            )

        novel.summary = self.summarize_novel(summaries)
        novel.preprocessing_quality = QualityLevel.fallback
        novel.status = NovelStatus.ready_for_planning
        novel.preprocessing_stages = {
            **(novel.preprocessing_stages or {}),
            "split": "done",
            "chapters": "done",
            "novel_analysis": "fallback",
            "vectorize": "pending",
            "genre": "pending",
            "overview": "pending",
        }

        task.status = TaskStatus.done
        task.progress = 100
        events.append(
            await task_service.record_progress(
                db,
                novel.id,
                "preprocess_done",
                {"chapter_count": len(chapters), "scene_count": scene_count},
            )
        )
        return PreprocessResult(task=task, events=events)

    # ---------------------------------------------------- deterministic utils
    def summarize_chapter(self, content: str, limit: int = 180) -> str:
        compact = re.sub(r"\s+", " ", content).strip()
        return compact[:limit]

    def extract_key_events(self, content: str, limit: int = 5) -> list[dict[str, str]]:
        sentences = [
            sentence.strip()
            for sentence in re.split(r"[。！？!?]\s*", content)
            if sentence.strip()
        ]
        return [{"event": sentence[:120]} for sentence in sentences[:limit]]

    def segment_chapter(self, content: str) -> list[str]:
        paragraphs = [paragraph.strip() for paragraph in re.split(r"\n\s*\n", content) if paragraph.strip()]
        if paragraphs:
            return paragraphs
        return [content.strip()]

    def describe_scene(self, content: str) -> str:
        sentence = re.split(r"[。！？!?]\s*", content.strip())[0].strip()
        return sentence[:80] or "未命名场景"

    def summarize_novel(self, chapter_summaries: list[str], limit: int = 500) -> str:
        return "\n".join(chapter_summaries)[:limit]


preprocessing_service = PreprocessingService()
