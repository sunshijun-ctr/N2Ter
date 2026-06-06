import re
from dataclasses import dataclass
from uuid import UUID

from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Chapter, Novel, NovelStatus, ProgressEvent, QualityLevel, SceneInNovel, Task, TaskStatus
from app.services.task_service import task_service


@dataclass(frozen=True)
class PreprocessResult:
    task: Task
    events: list[ProgressEvent]


class PreprocessingService:
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
